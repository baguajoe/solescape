"""Weekly Deals, her wording updates (Nov 12, 2026) and the Area choice on bookings.

Her text: "Weekly Deals: Mondays South Coast; Wednesdays Boston. $30 off 60-minute & 90-minute sessions.
Not available for Recovery Lounge or Foot Loose services."
"""
from datetime import timedelta

import pytest

from api import notify
from api.models import Service, db
from api.seed import OLD_SUMMARIES, update_wording
from tests.test_app import admin, app, book_and_pay, client, first_slot, next_weekday, payload  # noqa: F401

MONDAY, TUESDAY, WEDNESDAY, FRIDAY = 0, 1, 2, 4
HER_TEXT = ("Mondays South Coast; Wednesdays Boston. $30 off 60-minute & 90-minute sessions. "
            "Not available for Recovery Lounge or Foot Loose services.")


def slot(client, weekday, service="sole-cleanse-60", weeks=1, extra=""):
    return first_slot(client, service, next_weekday(weekday, weeks), extra)


def quote(client, start, area, service="sole-cleanse-60", extra=""):
    r = client.get(f"/api/quote?service={service}&start_at={start}&area={area}{extra}")
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def booking(client, token):
    return client.get(f"/api/bookings/{token}").get_json()


# Her wording

def test_her_new_service_wording(client):
    s = {x["slug"]: x for x in client.get("/api/services").get_json()["services"]}
    assert s["foot-loose"]["summary"] == (
        "Foot massages for overworked feet, reducing chronic tension throughout your body + improving posture. "
        "Convenient for corporate events, community events, and special events.")
    assert s["mamas-sole-relief-60"]["summary"] == (
        "45-minute full-body massage alleviating weight-bearing joints, light to firm pressure + 15-min foot "
        "massage, hot towels.")


def test_existing_database_gets_new_wording_but_keeps_her_edits(app):
    with app.app_context():
        foot = Service.query.filter_by(slug="foot-loose").first()
        mama = Service.query.filter_by(slug="mamas-sole-relief-60").first()
        foot.summary = OLD_SUMMARIES["foot-loose"]
        mama.summary = "Her own edit in the admin."
        db.session.commit()
        assert update_wording() is True
        assert foot.summary.endswith("Convenient for corporate events, community events, and special events.")
        assert mama.summary == "Her own edit in the admin."
        assert update_wording() is False


# The banner

def test_banner_shows_her_text(client):
    deal = client.get("/api/config").get_json()["weekly_deal"]
    assert deal == {"text": HER_TEXT, "amount_cents": 3000}


def test_banner_follows_settings_and_turns_off(client):
    admin(client)
    r = client.put("/api/admin/settings", json={"weekly_deal_dollars": "25", "weekly_deal_boston_day": "1",
                                                "weekly_deal_south_coast_day": "4"})
    assert r.status_code == 200
    assert client.get("/api/config").get_json()["weekly_deal"]["text"] == (
        "Tuesdays Boston; Fridays South Coast. $25 off 60-minute & 90-minute sessions. "
        "Not available for Recovery Lounge or Foot Loose services.")
    client.put("/api/admin/settings", json={"weekly_deal_enabled": "0"})
    assert client.get("/api/config").get_json()["weekly_deal"] is None
    assert quote(client, slot(client, FRIDAY), "south_coast")["discount_cents"] == 0


def test_deal_settings_validation(client):
    admin(client)
    for body in ({"weekly_deal_enabled": "yes"}, {"weekly_deal_dollars": "0"}, {"weekly_deal_dollars": "abc"},
                 {"weekly_deal_boston_day": "7"}, {"weekly_deal_south_coast_day": "Monday"}):
        assert client.put("/api/admin/settings", json=body).status_code == 400, body
    assert client.put("/api/admin/settings", json={"weekly_deal_boston_day": ""}).status_code == 200
    assert client.get("/api/config").get_json()["weekly_deal"]["text"].startswith("Mondays South Coast. $30 off")


def test_deal_settings_need_admin(client):
    assert client.put("/api/admin/settings", json={"weekly_deal_dollars": "100"}).status_code == 401


# Who gets it

@pytest.mark.parametrize("weekday,area,off", [
    (MONDAY, "south_coast", 3000), (WEDNESDAY, "boston", 3000),
    (MONDAY, "boston", 0), (WEDNESDAY, "south_coast", 0), (MONDAY, "other", 0), (WEDNESDAY, "other", 0),
    (TUESDAY, "boston", 0), (TUESDAY, "south_coast", 0), (MONDAY, "", 0),
])
def test_deal_matches_day_and_area(client, weekday, area, off):
    q = quote(client, slot(client, weekday), area)
    assert (q["regular_cents"], q["discount_cents"], q["total_cents"], q["deposit_cents"]) == (19000, off, 19000 - off, 7500)
    assert q["discount_label"] == ("Weekly Deal" if off else None)


def test_only_60_and_90_minute_sessions(client):
    for svc, regular in (("sole-cleanse-60", 19000), ("sole-cleanse-90", 22500),
                         ("mamas-sole-relief-60", 19000), ("mamas-sole-relief-90", 22500)):
        q = quote(client, slot(client, MONDAY, svc), "south_coast", svc)
        assert (q["discount_cents"], q["total_cents"]) == (3000, regular - 3000), svc
    assert quote(client, slot(client, MONDAY, "sole-cleanse-120"), "south_coast", "sole-cleanse-120")["discount_cents"] == 0
    for svc in ("recovery-lounge", "foot-loose"):
        start = slot(client, WEDNESDAY, svc, extra="&hours=3")
        assert quote(client, start, "boston", svc, "&hours=3")["discount_cents"] == 0, svc
    menu = {s["slug"]: s["weekly_deal"] for s in client.get("/api/services").get_json()["services"]}
    assert [k for k, v in menu.items() if v] == ["sole-cleanse-60", "sole-cleanse-90", "mamas-sole-relief-60",
                                                "mamas-sole-relief-90"]


def test_appointment_date_counts_not_booking_date(client):
    # Today is whatever weekday the tests run on; only the appointment's weekday decides it
    token = book_and_pay(client, slot(client, MONDAY, weeks=2), area="south_coast")
    assert booking(client, token)["weekly_deal_applied"] is True
    token = book_and_pay(client, slot(client, TUESDAY, weeks=2), area="south_coast")
    assert booking(client, token)["weekly_deal_applied"] is False


# Booking

def test_booking_saves_the_deal(client):
    token = book_and_pay(client, slot(client, MONDAY), area="south_coast")
    b = booking(client, token)
    assert (b["regular_cents"], b["discount_cents"], b["total_cents"]) == (19000, 3000, 16000)
    assert (b["discount_label"], b["weekly_deal_applied"], b["weekly_deal_cents"]) == ("Weekly Deal", True, 3000)
    assert (b["deposit_paid_cents"], b["balance_cents"]) == (7500, 8500)  # deposit unchanged, applied to balance
    assert (b["area"], b["area_label"]) == ("south_coast", "South Coast")


def test_area_is_required(client):
    start = slot(client, MONDAY)
    for area in (None, "", "cape cod"):
        r = client.post("/api/bookings", json=payload(start, area=area))
        assert r.status_code == 400 and r.get_json()["field"] == "area", area


def test_browser_cannot_apply_the_discount(client):
    r = client.post("/api/bookings", json=payload(
        slot(client, TUESDAY), area="boston", discount_cents=3000, total_cents=16000, weekly_deal=True,
        discount_kind="weekly_deal", regular_cents=10000))
    b = booking(client, r.get_json()["token"])
    assert (b["regular_cents"], b["discount_cents"], b["total_cents"], b["weekly_deal_applied"]) == (19000, 0, 19000, False)


def test_later_setting_changes_dont_alter_past_bookings(client):
    token = book_and_pay(client, slot(client, WEDNESDAY), area="boston")
    admin(client)
    client.put("/api/admin/settings", json={"weekly_deal_dollars": "50", "weekly_deal_boston_day": "4"})
    client.put("/api/admin/settings", json={"weekly_deal_enabled": "0"})
    b = booking(client, token)
    assert (b["total_cents"], b["discount_cents"], b["weekly_deal_applied"]) == (16000, 3000, True)


def test_deal_never_takes_total_below_deposit(client):
    admin(client)
    client.put("/api/admin/settings", json={"weekly_deal_dollars": "500"})
    q = quote(client, slot(client, MONDAY), "south_coast")
    assert (q["discount_cents"], q["total_cents"], q["deposit_cents"]) == (11500, 7500, 7500)


def test_emails_show_regular_price_deal_and_total(client, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send", lambda to, subject, body: sent.append(body))
    book_and_pay(client, slot(client, MONDAY), area="south_coast")
    lines = "Regular price: $190.00\nWeekly Deal −$30.00\nTotal: $160.00\n"
    assert lines in sent[0] and "Deposit paid: $75.00" in sent[0] and "Balance due: $85.00" in sent[0]
    assert lines in sent[1] and "Area: South Coast" in sent[1]  # her copy


# The calendar tag

def test_calendar_marks_deal_days(client):
    day = next_weekday(MONDAY)
    month = f"{day:%Y-%m}"
    r = client.get(f"/api/availability?service=sole-cleanse-60&month={month}").get_json()
    assert r["deal_cents"] == 3000
    assert r["deal_days"][day.isoformat()] == ["south_coast"]
    wed = (day + timedelta(days=2)).isoformat()
    if wed.startswith(month):
        assert r["deal_days"][wed] == ["boston"]
    assert all(v in (["south_coast"], ["boston"]) for v in r["deal_days"].values())
    for svc in ("sole-cleanse-120", "foot-loose"):
        r = client.get(f"/api/availability?service={svc}&month={month}").get_json()
        assert (r["deal_days"], r["deal_cents"]) == ({}, 0), svc


def test_reschedule_calendar_marks_only_the_bookings_area(client):
    token = book_and_pay(client, slot(client, TUESDAY), area="boston")
    day = next_weekday(WEDNESDAY, 2)
    r = client.get(f"/api/availability?booking={token}&month={day:%Y-%m}").get_json()
    assert r["deal_days"][day.isoformat()] == ["boston"]
    assert all(v == ["boston"] for v in r["deal_days"].values())


# Rescheduling

def test_reschedule_onto_a_deal_day_shows_and_applies_new_total(client, monkeypatch):
    sent = []
    monkeypatch.setattr(notify, "send", lambda to, subject, body: sent.append(body))
    token = book_and_pay(client, slot(client, TUESDAY), area="south_coast")
    new = slot(client, MONDAY, weeks=2)
    q = client.get(f"/api/bookings/{token}/reschedule-quote?start_at={new}").get_json()
    assert (q["regular_cents"], q["discount_cents"], q["discount_label"], q["total_cents"]) == (19000, 3000, "Weekly Deal", 16000)
    assert (q["deposit_paid_cents"], q["balance_cents"], q["changed"]) == (7500, 8500, True)
    sent.clear()
    b = client.post(f"/api/bookings/{token}/reschedule", json={"start_at": new}).get_json()
    assert (b["total_cents"], b["discount_cents"], b["weekly_deal_applied"], b["balance_cents"]) == (16000, 3000, True, 8500)
    assert "Your total changed from $190.00 to $160.00." in sent[0] and "Weekly Deal −$30.00" in sent[0]


def test_reschedule_off_a_deal_day_loses_it(client):
    token = book_and_pay(client, slot(client, WEDNESDAY), area="boston")
    new = slot(client, TUESDAY, weeks=2)
    q = client.get(f"/api/bookings/{token}/reschedule-quote?start_at={new}").get_json()
    assert (q["discount_cents"], q["total_cents"], q["balance_cents"], q["changed"]) == (0, 19000, 11500, True)
    b = client.post(f"/api/bookings/{token}/reschedule", json={"start_at": new}).get_json()
    assert (b["total_cents"], b["discount_cents"], b["weekly_deal_applied"], b["deposit_paid_cents"]) == (19000, 0, False, 7500)


def test_reschedule_quote_follows_the_same_rules(client):
    token = book_and_pay(client, slot(client, WEDNESDAY), area="boston")
    same = slot(client, WEDNESDAY, weeks=2)
    assert client.get(f"/api/bookings/{token}/reschedule-quote?start_at={same}").get_json()["changed"] is False
    client.post(f"/api/bookings/{token}/reschedule", json={"start_at": same})
    r = client.get(f"/api/bookings/{token}/reschedule-quote?start_at={slot(client, TUESDAY, weeks=3)}")
    assert r.status_code == 409  # one reschedule only


# Admin

def test_admin_sees_area_and_reschedule_recalculates(client):
    token = book_and_pay(client, slot(client, MONDAY), area="south_coast")
    admin(client)
    day = next_weekday(MONDAY)
    [b] = [x for x in client.get(f"/api/admin/calendar?month={day:%Y-%m}").get_json()["bookings"] if x["token"] == token]
    assert (b["area_label"], b["weekly_deal_applied"]) == ("South Coast", True)
    tuesday = next_weekday(TUESDAY, 3)
    r = client.patch(f"/api/admin/bookings/{b['id']}", json={"start_local": f"{tuesday}T13:00"})
    assert (r.get_json()["total_cents"], r.get_json()["weekly_deal_applied"]) == (19000, False)


def test_admin_phone_booking_records_area(client):
    admin(client)
    sid = next(s["id"] for s in client.get("/api/admin/catalog").get_json()["services"] if s["slug"] == "sole-cleanse-60")
    day = next_weekday(MONDAY)
    r = client.post("/api/admin/bookings", json=dict(name="Phone Client", service_id=sid, start_local=f"{day}T13:00",
                                                     area="south_coast"))
    assert r.status_code == 201 and r.get_json()["area_label"] == "South Coast"
    assert r.get_json()["total_cents"] == 19000  # she sets the total herself on phone bookings
    bad = client.post("/api/admin/bookings", json=dict(name="Phone Client", service_id=sid,
                                                       start_local=f"{day}T16:00", area="cape"))
    assert bad.status_code == 400 and bad.get_json()["field"] == "area"
