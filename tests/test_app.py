import json
import os
import threading
import time as pytime
from datetime import date, datetime, timedelta

import pytest
import stripe

from api.app import create_app
from api.availability import slots_between, to_local, to_utc
from api.models import Booking, Product, Service, TimeOff, db, set_setting, utcnow

SVC = "sole-cleanse-60"
# Set to a throwaway Postgres database to run every test on Postgres too (CI does). Its tables are dropped.
PG_URL = os.getenv("TEST_DATABASE_URL", "")


def db_url_for(tmp_path):
    return PG_URL or f"sqlite:///{tmp_path}/t.db"


def drop_test_db(app):
    with app.app_context():
        db.session.remove()
        if PG_URL:
            db.drop_all()
        db.engine.dispose()


@pytest.fixture()
def app(tmp_path):
    app = create_app({
        "SQLALCHEMY_DATABASE_URI": db_url_for(tmp_path), "TESTING": True, "RATELIMIT_ENABLED": False,
        "STRIPE_SECRET_KEY": "", "STRIPE_WEBHOOK_SECRET": "", "ADMIN_PASSWORD": "pw", "SECRET_KEY": "x" * 32,
    })
    from api.extensions import limiter
    limiter.enabled = False
    yield app
    drop_test_db(app)


@pytest.fixture()
def client(app):
    return app.test_client()


def admin(client):
    assert client.post("/api/admin/login", json={"password": "pw"}).status_code == 200
    return client


def next_weekday(weekday, weeks=1):
    d = date.today() + timedelta(days=7 * weeks)
    return d + timedelta(days=(weekday - d.weekday()) % 7)


def day_slots(client, service=SVC, day=None, extra=""):
    day = day or next_weekday(1)
    return client.get(f"/api/availability/day?service={service}&date={day}{extra}").get_json()["slots"]


def first_slot(client, service=SVC, day=None, extra=""):
    return day_slots(client, service, day, extra)[0]["start_at"]


def payload(start, **kw):
    base = dict(service=SVC, start_at=start, name="Ada Client", email="ada@example.com", phone="617-555-0100",
                location_type="home", address="1 Main St, Boston MA", area="other", agreed_policy=True,
                addon_ids=[])
    return {**base, **kw}


def book_and_pay(client, start, **kw):
    r = client.post("/api/bookings", json=payload(start, **kw))
    assert r.status_code == 201, r.get_json()
    token = r.get_json()["token"]
    assert client.post(f"/api/demo/pay/booking/{token}").status_code == 200
    return token


def test_menu_matches_her_prices(client):
    s = {x["slug"]: x for x in client.get("/api/services").get_json()["services"]}
    assert [s[k]["price_cents"] for k in ("sole-cleanse-60", "sole-cleanse-90", "sole-cleanse-120")] == [19000, 22500, 30000]
    assert [s[k]["price_cents"] for k in ("mamas-sole-relief-60", "mamas-sole-relief-90")] == [19000, 22500]
    assert s["recovery-lounge"]["pricing"] == "hourly" and s["recovery-lounge"]["min_hours"] == 3
    assert all(x["bookable"] for x in s.values())
    assert client.get("/api/config").get_json()["shop_open"] is False


def test_flat_75_deposit(client):
    token = book_and_pay(client, first_slot(client))
    b = client.get(f"/api/bookings/{token}").get_json()
    assert b["status"] == "confirmed"
    assert (b["total_cents"], b["deposit_paid_cents"], b["balance_cents"]) == (19000, 7500, 11500)


def test_setup_time_and_travel_buffer(client):
    day = next_weekday(1)  # Tuesday 11:00 to 19:00
    slots = day_slots(client, day=day)
    assert slots[0]["label"] == "11:30 AM" and slots[0]["arrival_label"] == "11:00 AM"
    assert slots[-1]["label"] == "6:00 PM"
    book_and_pay(client, slots[0]["start_at"])  # blocks 11:00 to 12:30
    labels = [x["label"] for x in day_slots(client, day=day)]
    assert "1:00 PM" not in labels and "1:30 PM" in labels  # 30 setup + 30 travel


def test_hourly_event_pricing_and_minimum(client):
    catalog = client.get("/api/services").get_json()
    soak = next(a for a in catalog["addons"] if a["name"] == "Foot soaks")
    day = next_weekday(4)  # Friday 10 to 6
    r = client.get(f"/api/availability?service=foot-loose&hours=3&addons={soak['id']}&month={day:%Y-%m}").get_json()
    assert r["total_cents"] == 3 * 19000 + 3 * 5000 and r["deposit_cents"] == 7500
    assert client.get(f"/api/availability?service=foot-loose&hours=2&month={day:%Y-%m}").status_code == 400
    start = first_slot(client, "foot-loose", day, "&hours=4")
    token = book_and_pay(client, start, service="foot-loose", hours=4, addon_ids=[soak["id"]], extra_therapists=True,
                         location_type="workplace")
    b = client.get(f"/api/bookings/{token}").get_json()
    assert b["total_cents"] == 4 * 24000 and b["hours"] == 4
    assert b["time_label"] == "10:30 AM" and b["end_time_label"] == "2:30 PM"


def test_addon_only_for_its_service(client):
    soak = next(a for a in client.get("/api/services").get_json()["addons"] if a["name"] == "Foot soaks")
    start = first_slot(client, "recovery-lounge", next_weekday(4), "&hours=3")
    r = client.post("/api/bookings", json=payload(start, service="recovery-lounge", hours=3, addon_ids=[soak["id"]]))
    token = r.get_json()["token"]
    assert client.get(f"/api/bookings/{token}").get_json()["total_cents"] == 57000


def test_trimester_confirmation_required(client):
    start = first_slot(client, "mamas-sole-relief-60")
    r = client.post("/api/bookings", json=payload(start, service="mamas-sole-relief-60"))
    assert r.get_json()["field"] == "confirmed_requirement"
    r = client.post("/api/bookings", json=payload(start, service="mamas-sole-relief-60", confirmed_requirement=True))
    assert r.status_code == 201


def test_client_cannot_set_prices(client):
    r = client.post("/api/bookings", json=payload(first_slot(client), total_cents=1, deposit_cents=1))
    b = client.get(f"/api/bookings/{r.get_json()['token']}").get_json()
    assert b["total_cents"] == 19000 and b["deposit_cents"] == 7500


def test_sunday_closed(client):
    assert day_slots(client, day=next_weekday(6)) == []


def test_lead_time(app):
    with app.app_context():
        day = to_local(utcnow()).date()
        starts = slots_between(day, day + timedelta(days=1), 60, 30)
        assert all(s >= utcnow() + timedelta(hours=24) for v in starts.values() for s in v)


def test_hold_blocks_then_expires(app, client):
    start = first_slot(client)
    token = client.post("/api/bookings", json=payload(start)).get_json()["token"]
    assert client.post("/api/bookings", json=payload(start, email="b@example.com")).status_code == 409
    with app.app_context():
        b = Booking.query.filter_by(token=token).first()
        b.hold_expires_at = utcnow() - timedelta(minutes=1)
        db.session.commit()
    assert client.post("/api/bookings", json=payload(start, email="b@example.com")).status_code == 201


def test_release_frees_slot(client):
    start = first_slot(client)
    token = client.post("/api/bookings", json=payload(start)).get_json()["token"]
    client.post(f"/api/bookings/{token}/release")
    assert client.post("/api/bookings", json=payload(start)).status_code == 201


def test_concurrent_requests_only_one_wins(app):
    with app.test_client() as c:
        start = first_slot(c)
    results = []

    def attempt(i):
        with app.test_client() as c:
            results.append(c.post("/api/bookings", json=payload(start, email=f"u{i}@example.com")).status_code)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(12)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [201] + [409] * 11


def test_validation(client):
    start = first_slot(client)
    assert client.post("/api/bookings", json=payload(start, email="nope")).get_json()["field"] == "email"
    assert client.post("/api/bookings", json=payload(start, phone="123")).get_json()["field"] == "phone"
    assert client.post("/api/bookings", json=payload(start, address="")).get_json()["field"] == "address"
    assert client.post("/api/bookings", json=payload(start, agreed_policy=False)).get_json()["field"] == "agreed_policy"


def test_client_reschedules_once(client):
    day = next_weekday(1)
    token = book_and_pay(client, first_slot(client, day=day))
    mine = client.get(f"/api/availability/day?booking={token}&date={day}").get_json()["slots"]
    assert mine[0]["label"] == "11:30 AM"  # own time stays available to itself
    later = next_weekday(1, 2)
    new = first_slot(client, day=later)
    r = client.post(f"/api/bookings/{token}/reschedule", json={"start_at": new})
    assert r.status_code == 200 and r.get_json()["reschedule_count"] == 1 and not r.get_json()["can_reschedule"]
    assert day_slots(client, day=day)[0]["label"] == "11:30 AM"  # old time freed
    r = client.post(f"/api/bookings/{token}/reschedule", json={"start_at": first_slot(client, day=day)})
    assert r.status_code == 409 and "once" in r.get_json()["error"]


def test_reschedule_needs_24_hours_notice(app, client):
    token = book_and_pay(client, first_slot(client))
    with app.app_context():
        b = Booking.query.filter_by(token=token).first()
        b.start_at = utcnow() + timedelta(hours=5)
        b.block_start_at = b.start_at - timedelta(minutes=30)
        b.end_at = b.start_at + timedelta(minutes=60)
        db.session.commit()
    assert not client.get(f"/api/bookings/{token}").get_json()["can_reschedule"]
    r = client.post(f"/api/bookings/{token}/reschedule", json={"start_at": first_slot(client, day=next_weekday(2))})
    assert r.status_code == 409 and "notice" in r.get_json()["error"]


def test_client_cancel_frees_time_and_keeps_deposit(client):
    day = next_weekday(1)
    start = first_slot(client, day=day)
    token = book_and_pay(client, start)
    b = client.post(f"/api/bookings/{token}/cancel").get_json()
    assert b["status"] == "cancelled" and b["deposit_paid_cents"] == 7500 and b["cancelled_by"] == "client"
    assert first_slot(client, day=day) == start
    assert client.post(f"/api/bookings/{token}/cancel").status_code == 409


def test_time_off_removes_slots(app, client):
    day = next_weekday(1)
    with app.app_context():
        db.session.add(TimeOff(start_at=to_utc(datetime(day.year, day.month, day.day, 0)),
                               end_at=to_utc(datetime(day.year, day.month, day.day, 23, 59))))
        db.session.commit()
    assert day_slots(client, day=day) == []


def test_dst_boundary(app):
    with app.app_context():
        assert to_utc(datetime(2026, 11, 2, 11)).hour == 16
        assert to_utc(datetime(2026, 10, 30, 11)).hour == 15


def test_shop_appears_when_she_adds_a_product(app, client):
    admin(client)
    r = client.post("/api/admin/products", json=dict(name="Herbal foot soak melt", price_cents=1500, active=True))
    assert r.status_code == 201
    assert client.get("/api/config").get_json()["shop_open"] is True
    with app.app_context():
        set_setting("tax_percent", "6.25")
        db.session.commit()
    pid = r.get_json()["id"]
    order = dict(name="Ada Client", email="ada@example.com", phone="6175550100", items=[dict(product_id=pid, qty=2, unit_cents=1)])
    token = client.post("/api/orders", json=order).get_json()["token"]
    o = client.get(f"/api/orders/{token}").get_json()
    assert (o["subtotal_cents"], o["tax_cents"]) == (3000, 0)  # not marked taxable


def test_admin_requires_login(client):
    for path in ("/api/admin/catalog", "/api/admin/schedule", "/api/admin/orders", "/api/admin/settings",
                 "/api/admin/calendar?month=2026-11"):
        assert client.get(path).status_code == 401
    assert client.post("/api/admin/login", json={"password": "bad"}).status_code == 401


def test_admin_deposit_setting(client):
    admin(client)
    assert client.put("/api/admin/settings", json={"deposit_dollars": "100"}).status_code == 200
    r = client.post("/api/bookings", json=payload(first_slot(client)))
    assert client.get(f"/api/bookings/{r.get_json()['token']}").get_json()["deposit_cents"] == 10000


def test_admin_manual_booking_respects_setup(client):
    admin(client)
    day = next_weekday(1)
    token = book_and_pay(client, first_slot(client, day=day))  # 11:00 arrival to 12:30
    rows = client.get(f"/api/admin/calendar?month={day:%Y-%m}").get_json()["bookings"]
    b = next(x for x in rows if x["token"] == token)
    sid = client.get("/api/admin/catalog").get_json()["services"][0]["id"]
    assert client.post("/api/admin/bookings", json=dict(name="Phone Client", service_id=sid,
                                                        start_local=f"{day}T13:00")).status_code == 409
    assert client.post("/api/admin/bookings", json=dict(name="Phone Client", service_id=sid,
                                                        start_local=f"{day}T13:30")).status_code == 201
    assert client.post(f"/api/admin/bookings/{b['id']}/refund", json={}).get_json()["refunded_cents"] == 7500
    assert client.patch(f"/api/admin/bookings/{b['id']}", json=dict(start_local=f"{day}T16:00")).status_code == 200


def test_calendar_feed_is_private(client):
    assert client.get("/api/calendar/wrong.ics").status_code == 404
    admin(client)
    book_and_pay(client, first_slot(client))
    feed = client.get("/api/admin/settings").get_json()["calendar_feed"].split("/api")[1]
    body = client.get("/api" + feed).get_data(as_text=True)
    assert "Sole Cleanse\\, 60 minutes: Ada Client" in body and "Arrive 11:00 AM" in body


def test_contact_message_reaches_admin(client):
    bad = client.post("/api/messages", json=dict(name="Ada", email="nope", message="Hello there"))
    assert bad.get_json()["field"] == "email"
    assert client.post("/api/messages", json=dict(name="Ada Client", email="ada@example.com", topic="event",
                                                  message="Do you do office parties in Quincy?")).status_code == 201
    assert client.post("/api/messages", json=dict(name="Bot", email="b@example.com", message="spam spam",
                                                  website="x")).status_code == 201
    assert client.get("/api/admin/messages").status_code == 401
    admin(client)
    r = client.get("/api/admin/messages").get_json()
    assert r["unread"] == 1 and r["messages"][0]["topic"] == "event"
    client.patch(f"/api/admin/messages/{r['messages'][0]['id']}", json={"read": True})
    assert client.get("/api/admin/messages").get_json()["unread"] == 0


# Stripe: real signature checks, with the outbound API call faked.

def signed(event, secret):
    body = json.dumps(event)
    ts = int(pytime.time())
    sig = stripe.WebhookSignature._compute_signature(f"{ts}.{body}", secret)
    return body, f"t={ts},v1={sig}"


@pytest.fixture()
def stripe_client(app, monkeypatch):
    app.config.update(STRIPE_SECRET_KEY="sk_test_x", STRIPE_WEBHOOK_SECRET="whsec_x")
    monkeypatch.setattr(stripe.checkout.Session, "create",
                        lambda **kw: {"id": "cs_1", "url": "https://stripe.test/pay", **{"kw": kw}})
    return app.test_client()


def completed(token, amount=7500, kind="booking"):
    return {"id": "evt_1", "object": "event", "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_1", "object": "checkout.session", "payment_status": "paid",
                                "amount_total": amount, "payment_intent": "pi_1",
                                "metadata": {"kind": kind, "token": token}}}}


def post_hook(client, event, secret="whsec_x"):
    body, sig = signed(event, secret)
    return client.post("/api/stripe/webhook", data=body, headers={"Stripe-Signature": sig},
                       content_type="application/json")


def test_stripe_webhook_confirms_once(app, stripe_client):
    r = stripe_client.post("/api/bookings", json=payload(first_slot(stripe_client)))
    assert r.get_json()["checkout_url"] == "https://stripe.test/pay"
    token = r.get_json()["token"]
    assert stripe_client.get(f"/api/bookings/{token}").get_json()["status"] == "held"
    assert post_hook(stripe_client, completed(token)).status_code == 200
    assert post_hook(stripe_client, completed(token)).status_code == 200
    b = stripe_client.get(f"/api/bookings/{token}").get_json()
    assert b["status"] == "confirmed" and b["deposit_paid_cents"] == 7500


def test_stripe_rejects_bad_signature(stripe_client):
    r = stripe_client.post("/api/bookings", json=payload(first_slot(stripe_client)))
    token = r.get_json()["token"]
    assert post_hook(stripe_client, completed(token), secret="whsec_wrong").status_code == 400
    assert stripe_client.get(f"/api/bookings/{token}").get_json()["status"] == "held"


def test_webhook_ignores_other_stripe_payments(stripe_client):
    event = completed("x")
    event["data"]["object"]["metadata"] = {}
    assert post_hook(stripe_client, event).status_code == 200


def test_expired_session_releases_hold(stripe_client):
    start = first_slot(stripe_client)
    token = stripe_client.post("/api/bookings", json=payload(start)).get_json()["token"]
    event = completed(token)
    event["type"] = "checkout.session.expired"
    post_hook(stripe_client, event)
    assert stripe_client.get(f"/api/bookings/{token}").get_json()["status"] == "cancelled"
    assert first_slot(stripe_client) == start


def test_rescheduling_collided_booking_confirms_it(app, stripe_client):
    start = first_slot(stripe_client)
    token = stripe_client.post("/api/bookings", json=payload(start)).get_json()["token"]
    with app.app_context():
        b = Booking.query.filter_by(token=token).first()
        b.hold_expires_at = utcnow() - timedelta(minutes=1)
        db.session.commit()
    second = stripe_client.post("/api/bookings", json=payload(start, email="b@example.com")).get_json()["token"]
    post_hook(stripe_client, completed(second))
    post_hook(stripe_client, completed(token))
    with app.app_context():
        bid = Booking.query.filter_by(token=token).first().id
    admin(stripe_client)
    day = next_weekday(1)
    r = stripe_client.patch(f"/api/admin/bookings/{bid}", json=dict(start_local=f"{day}T16:00"))
    assert r.get_json()["status"] == "confirmed"


def test_demo_pay_disabled_with_stripe(stripe_client):
    r = stripe_client.post("/api/bookings", json=payload(first_slot(stripe_client)))
    assert stripe_client.post(f"/api/demo/pay/booking/{r.get_json()['token']}").status_code == 404


def test_late_payment_on_taken_slot_is_flagged(app, stripe_client):
    start = first_slot(stripe_client)
    token = stripe_client.post("/api/bookings", json=payload(start)).get_json()["token"]
    with app.app_context():
        b = Booking.query.filter_by(token=token).first()
        b.hold_expires_at = utcnow() - timedelta(minutes=1)
        db.session.commit()
    second = stripe_client.post("/api/bookings", json=payload(start, email="b@example.com")).get_json()["token"]
    post_hook(stripe_client, completed(second))
    post_hook(stripe_client, completed(token))
    assert stripe_client.get(f"/api/bookings/{token}").get_json()["status"] == "payment_conflict"
    assert stripe_client.get(f"/api/bookings/{second}").get_json()["status"] == "confirmed"


def test_stripe_failure_releases_slot(app, stripe_client, monkeypatch):
    def boom(**kw):
        raise RuntimeError("stripe down")
    monkeypatch.setattr(stripe.checkout.Session, "create", boom)
    start = first_slot(stripe_client)
    assert stripe_client.post("/api/bookings", json=payload(start)).status_code == 502
    assert first_slot(stripe_client) == start


def test_production_refuses_unsafe_config(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        create_app({"APP_ENV": "production", "SQLALCHEMY_DATABASE_URI": "sqlite://"})
