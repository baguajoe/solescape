"""Calendar blocking and the corporate loyalty program. Weekly Deals are in test_weekly_deals.py."""
from datetime import timedelta

from sqlalchemy import text

from api.models import Booking, add_missing_columns, db
from tests.test_app import admin, app, book_and_pay, client, day_slots, first_slot, next_weekday, payload  # noqa: F401

TUESDAY = 1
FRIDAY = 4


def labels(client, day, **kw):
    return [s["label"] for s in day_slots(client, day=day, **kw)]


def calendar_blocks(client, day):
    return [b for b in client.get(f"/api/admin/calendar?month={day:%Y-%m}").get_json()["blocks"]
            if b["local_date"] == day.isoformat()]


# 1. Calendar blocking

def test_block_whole_day(client):
    admin(client)
    day = next_weekday(TUESDAY)
    r = client.post("/api/admin/time-off", json=dict(start_local=f"{day}T00:00",
                                                    end_local=f"{day + timedelta(days=1)}T00:00", reason="Dentist"))
    assert r.status_code == 201 and r.get_json()["overlaps"] == []
    assert day_slots(client, day=day) == []
    [block] = calendar_blocks(client, day)
    assert block["whole_day"] and block["label"] == "All day" and block["reason"] == "Dentist"
    assert day_slots(client, day=day + timedelta(days=1)) != []  # next day untouched


def test_block_part_of_day_and_remove_it(client):
    admin(client)
    day = next_weekday(TUESDAY)
    r = client.post("/api/admin/time-off", json=dict(start_local=f"{day}T13:00", end_local=f"{day}T15:00"))
    left = labels(client, day)
    assert "12:00 PM" in left and "12:30 PM" not in left  # a 12:30 session would run into 1 PM
    assert "3:30 PM" in left and "2:00 PM" not in left  # 3:00 PM end, then 30 min setup
    [block] = calendar_blocks(client, day)
    assert not block["whole_day"] and block["label"] == "1:00 PM to 3:00 PM"
    client.delete(f"/api/admin/time-off/{r.get_json()['id']}")
    assert "12:30 PM" in labels(client, day)


def test_weekly_block_repeats_until_its_end_date(client):
    admin(client)
    first, second, third = (next_weekday(TUESDAY, w) for w in (1, 2, 3))
    r = client.post("/api/admin/recurring-blocks", json=dict(
        weekday=TUESDAY, start_time="11:00", end_time="14:00", starts_on=str(first), ends_on=str(second),
        reason="School pickup"))
    assert r.status_code == 201
    rid = r.get_json()["id"]
    assert r.get_json()["label"].startswith("Every Tuesday, 11:00 AM to 2:00 PM")
    for day in (first, second):
        assert labels(client, day)[0] == "2:30 PM"
        assert calendar_blocks(client, day)[0]["kind"] == "weekly"
    assert labels(client, third)[0] == "11:30 AM"  # after the end date
    assert any(w["id"] == rid for w in client.get("/api/admin/schedule").get_json()["weekly"])
    client.delete(f"/api/admin/recurring-blocks/{rid}")
    assert labels(client, first)[0] == "11:30 AM"


def test_weekly_block_validation(client):
    admin(client)
    bad = [dict(weekday=9, start_time="11:00", end_time="12:00"),
           dict(weekday=1, start_time="14:00", end_time="12:00"),
           dict(weekday=1, start_time="11:00", end_time="12:00", starts_on="2027-02-01", ends_on="2027-01-01")]
    for body in bad:
        assert client.post("/api/admin/recurring-blocks", json=body).status_code == 400


def test_block_over_appointment_warns_and_keeps_it(client):
    day = next_weekday(TUESDAY)
    token = book_and_pay(client, first_slot(client, day=day))  # 11:00 arrival, 11:30 to 12:30
    admin(client)
    r = client.post("/api/admin/time-off", json=dict(start_local=f"{day}T12:00", end_local=f"{day}T13:00"))
    assert r.status_code == 201
    [hit] = r.get_json()["overlaps"]
    assert "Ada Client" in hit["label"] and "11:30 AM" in hit["label"]
    assert client.get(f"/api/bookings/{token}").get_json()["status"] == "confirmed"

    r = client.post("/api/admin/recurring-blocks", json=dict(weekday=TUESDAY, start_time="10:00", end_time="11:15",
                                                             starts_on=str(day)))
    assert [o["id"] for o in r.get_json()["overlaps"]] == [hit["id"]]  # setup time counts
    r = client.post("/api/admin/recurring-blocks", json=dict(weekday=TUESDAY, start_time="16:00", end_time="17:00",
                                                             starts_on=str(day)))
    assert r.get_json()["overlaps"] == []
    assert client.get(f"/api/bookings/{token}").get_json()["status"] == "confirmed"


def test_owner_booking_respects_weekly_block(client):
    admin(client)
    day = next_weekday(TUESDAY)
    client.post("/api/admin/recurring-blocks", json=dict(weekday=TUESDAY, start_time="13:00", end_time="15:00",
                                                         starts_on=str(day)))
    sid = client.get("/api/admin/catalog").get_json()["services"][0]["id"]
    body = dict(name="Phone Client", service_id=sid)
    assert client.post("/api/admin/bookings", json={**body, "start_local": f"{day}T14:00"}).status_code == 409
    assert client.post("/api/admin/bookings", json={**body, "start_local": f"{day}T16:00"}).status_code == 201


# 2. Corporate loyalty program

def company(client, **kw):
    r = client.post("/api/admin/companies", json=dict(name="Acme Health", contact_name="Pat Lee",
                                                     email="pat@acme.example", phone="6175550111", **kw))
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def corporate(client, **settings):
    base = dict(corporate_enabled="1", corporate_description="Her program description.")
    assert client.put("/api/admin/settings", json={**base, **settings}).status_code == 200


def event_slot(client, weeks=1, service="foot-loose", hours=3):
    return first_slot(client, service, next_weekday(FRIDAY, weeks), f"&hours={hours}")


def book_event(client, code, weeks=1, hours=3, **kw):
    start = event_slot(client, weeks, hours=hours)
    return client.post("/api/bookings", json=payload(start, service="foot-loose", hours=hours, corporate_code=code,
                                                     location_type="workplace", **kw))


def pay(client, r):
    assert r.status_code == 201, r.get_json()
    token = r.get_json()["token"]
    client.post(f"/api/demo/pay/booking/{token}")
    return client.get(f"/api/bookings/{token}").get_json()


def test_program_is_off_and_hidden_by_default(client):
    admin(client)
    c = company(client)
    assert client.get("/api/config").get_json()["corporate"] is None
    assert book_event(client, c["code"]).get_json()["field"] == "corporate_code"
    # On, but she hasn't written the description yet: still hidden, codes still off
    assert client.put("/api/admin/settings", json={"corporate_enabled": "1"}).status_code == 200
    assert client.get("/api/config").get_json()["corporate"] is None
    assert book_event(client, c["code"]).status_code == 400
    corporate(client)
    assert client.get("/api/config").get_json()["corporate"] == {"description": "Her program description."}


def test_company_codes_are_unique(client):
    admin(client)
    a, b = company(client), company(client)
    assert a["code"] != b["code"] and a["code"].startswith("ACMEHE-")
    r = client.post("/api/admin/companies", json=dict(name="Other", code=a["code"].lower()))
    assert r.status_code == 400 and r.get_json()["field"] == "code"
    assert client.post("/api/admin/companies", json=dict(name="Beta Co", code="beta 2027")).get_json()["code"] == "BETA2027"
    assert client.post("/api/admin/companies", json=dict(name="")).status_code == 400


def test_percent_reward_on_every_event(client):
    admin(client)
    c = company(client)
    corporate(client, corporate_reward_type="percent", corporate_percent="10")
    q = client.get(f"/api/quote?service=foot-loose&hours=3&code={c['code'].lower()}").get_json()
    assert (q["regular_cents"], q["discount_cents"], q["total_cents"], q["company_name"]) == (57000, 5700, 51300, "Acme Health")
    assert client.get("/api/quote?service=foot-loose&hours=3&code=NOPE-12345").status_code == 400
    b = pay(client, book_event(client, c["code"]))
    assert (b["total_cents"], b["deposit_paid_cents"], b["balance_cents"]) == (51300, 7500, 43800)
    assert b["discount_label"] == "Corporate rate (10% off)"
    # Massage services aren't part of the program: the code is ignored
    r = client.post("/api/bookings", json=payload(first_slot(client), corporate_code=c["code"]))
    assert client.get(f"/api/bookings/{r.get_json()['token']}").get_json()["discount_cents"] == 0
    # Turning the program off stops new discounts but leaves this booking alone
    client.put("/api/admin/settings", json={"corporate_enabled": "0"})
    assert book_event(client, c["code"], weeks=2).status_code == 400
    assert client.get(f"/api/bookings/{b['token']}").get_json()["total_cents"] == 51300


def test_inactive_company_code_stops_working(client):
    admin(client)
    c = company(client)
    corporate(client)
    client.patch(f"/api/admin/companies/{c['id']}", json={"active": False})
    assert book_event(client, c["code"]).get_json()["field"] == "corporate_code"


def test_reward_after_n_completed_events(client):
    admin(client)
    c = company(client)
    corporate(client, corporate_reward_type="nth", corporate_every_n="2", corporate_nth_reward="hours",
              corporate_nth_hours="1")
    soak = next(a for a in client.get("/api/services").get_json()["addons"] if a["name"] == "Foot soaks")

    def done(b):
        bid = next(x["id"] for x in client.get("/api/admin/companies").get_json()["companies"][0]["bookings"]
                   if x["token"] == b["token"])
        assert client.patch(f"/api/admin/bookings/{bid}", json={"status": "completed"}).status_code == 200

    first = pay(client, book_event(client, c["code"], weeks=1))
    assert first["discount_cents"] == 0
    done(first)
    assert pay(client, book_event(client, c["code"], weeks=2))["discount_cents"] == 0  # only 1 completed so far
    second = client.get("/api/admin/companies").get_json()["companies"][0]["bookings"][0]
    client.patch(f"/api/admin/bookings/{second['id']}", json={"status": "completed"})

    row = client.get("/api/admin/companies").get_json()["companies"][0]
    assert row["progress"]["available"] == 1 and row["spent_cents"] == 2 * 57000
    reward = pay(client, book_event(client, c["code"], weeks=3, addon_ids=[soak["id"]]))
    assert reward["discount_cents"] == 19000 + 5000  # one free hour, soaks included
    assert reward["discount_label"] == "Corporate reward (1 hour free)"
    assert pay(client, book_event(client, c["code"], weeks=4))["discount_cents"] == 0  # reward used

    client.post(f"/api/bookings/{reward['token']}/cancel")  # cancelled: the reward comes back
    assert client.get("/api/admin/companies").get_json()["companies"][0]["progress"]["available"] == 1


def test_percent_reward_after_n(client):
    admin(client)
    c = company(client)
    corporate(client, corporate_reward_type="nth", corporate_every_n="1", corporate_nth_reward="percent",
              corporate_nth_percent="50")
    b = pay(client, book_event(client, c["code"]))
    bid = client.get("/api/admin/companies").get_json()["companies"][0]["bookings"][0]["id"]
    client.patch(f"/api/admin/bookings/{bid}", json={"status": "completed"})
    b = pay(client, book_event(client, c["code"], weeks=2))
    assert (b["discount_cents"], b["discount_label"]) == (28500, "Corporate reward (50% off)")


def test_corporate_settings_validation(client):
    admin(client)
    for body in ({"corporate_reward_type": "free"}, {"corporate_percent": "0"}, {"corporate_every_n": "500"},
                 {"corporate_enabled": "yes"}):
        assert client.put("/api/admin/settings", json=body).status_code == 400


def test_companies_need_admin(client):
    assert client.get("/api/admin/companies").status_code == 401
    assert client.post("/api/admin/recurring-blocks", json={}).status_code == 401


def test_owner_can_link_phone_booking_to_company(client):
    admin(client)
    c = company(client)
    sid = next(s["id"] for s in client.get("/api/admin/catalog").get_json()["services"] if s["slug"] == "foot-loose")
    day = next_weekday(FRIDAY)
    r = client.post("/api/admin/bookings", json=dict(name="Acme event", service_id=sid, start_local=f"{day}T11:00",
                                                     company_id=c["id"]))
    assert r.status_code == 201 and r.get_json()["company_name"] == "Acme Health"


# Upgrading an existing database

def test_existing_database_gets_new_columns(app):
    with app.app_context():
        db.session.execute(text("ALTER TABLE bookings DROP COLUMN discount_label"))
        db.session.commit()
        add_missing_columns()
        cols = [r[1] for r in db.session.execute(text("PRAGMA table_info(bookings)"))]
        assert "discount_label" in cols
        assert Booking.query.count() == 0
