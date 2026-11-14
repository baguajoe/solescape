"""Site text: the website wording Kerimah edits herself in the admin, and service descriptions and notes."""
import pytest
from sqlalchemy import inspect, text

from api.app import create_app
from api.models import Booking, SiteText, db
from api.site_text import BLOCKS
from tests.test_app import admin, app, book_and_pay, client, db_url_for, drop_test_db, first_slot  # noqa: F401

HEADLINE = "A complete sole to soul recovery experience."


def texts(client):
    r = client.get("/api/site-text")
    assert r.status_code == 200
    assert r.headers["Cache-Control"] == "no-store"
    return r.get_json()["texts"]


def put(client, key, value):
    return client.put(f"/api/admin/site-text/{key}", json={"value": value})


# What the site shows before she changes anything: today's wording

def test_originals_are_the_current_wording(client):
    t = texts(client)
    assert set(t) == set(BLOCKS)
    assert t["home.headline"] == HEADLINE
    assert t["home.tagline"] == "She travels to you"
    assert t["home.facts"].split("\n")[1] == "All equipment is provided for your service."
    assert [s["q"] for s in t["home.steps"]] == ["Book online", "She comes to you", "Relax"]
    assert t["services.faq"][0] == {"q": "Where are services held?",
                                    "a": "At your home or workplace, from Boston to the South Coast of Massachusetts."}
    assert t["about.bio"].count("\n\n") == 1
    assert t["contact.service_area"] == "Your home or workplace, Boston to the South Coast"
    assert t["deals.banner"] == ("Mondays South Coast; Wednesdays Boston. $30 off 60-minute & 90-minute sessions. "
                                 "Not available for Recovery Lounge or Foot Loose services.")


def test_deposit_answer_follows_the_deposit_setting(client):
    admin(client).put("/api/admin/settings", json={"deposit_dollars": "100"})
    deposit_q = texts(client)["services.faq"][3]
    assert deposit_q["a"].startswith("Every reservation needs a $100 deposit")


# Admin only, same login

def test_site_text_needs_the_admin_login(client):
    assert client.get("/api/admin/site-text").status_code == 401
    assert put(client, "home.headline", "Hacked").status_code == 401
    assert client.delete("/api/admin/site-text/home.headline").status_code == 401
    assert texts(client)["home.headline"] == HEADLINE


def test_admin_page_lists_every_block_grouped_by_page(client):
    pages = admin(client).get("/api/admin/site-text").get_json()["pages"]
    assert [p["name"] for p in pages] == ["Home", "Services", "About", "Contact", "Weekly Deals"]
    home = {b["key"]: b for b in pages[0]["blocks"]}
    assert home["home.headline"]["value"] == HEADLINE and home["home.headline"]["edited"] is False
    assert home["home.headline"]["view"] == "/"
    assert home["home.steps"]["view"] == "/#how"
    faq = next(b for b in pages[1]["blocks"] if b["key"] == "services.faq")
    assert faq["view"] == "/services#faq"


# Saving

def test_save_updates_the_public_text_at_once(client):
    admin(client)
    r = put(client, "home.headline", "  Healing feet, wherever you are.  ")
    assert r.status_code == 200
    body = r.get_json()
    assert (body["value"], body["edited"], body["original"]) == ("Healing feet, wherever you are.", True, HEADLINE)
    assert texts(client)["home.headline"] == "Healing feet, wherever you are."
    # A visitor who isn't signed in sees it too
    client.post("/api/admin/logout")
    assert texts(client)["home.headline"] == "Healing feet, wherever you are."


def test_line_breaks_are_kept(client):
    admin(client)
    bio = "First paragraph,\nwith a line break.\n\n\n\nSecond paragraph.\r\nWindows line."
    assert put(client, "about.bio", bio).status_code == 200
    assert texts(client)["about.bio"] == "First paragraph,\nwith a line break.\n\nSecond paragraph.\nWindows line."
    # One-line blocks fold line breaks into spaces
    put(client, "home.tagline", "She travels\nto you")
    assert texts(client)["home.tagline"] == "She travels to you"


def test_list_blocks_drop_empty_lines(client):
    admin(client)
    put(client, "about.credentials", "Licensed in MA\n\n  Certified in reflexology  \n")
    assert texts(client)["about.credentials"] == "Licensed in MA\nCertified in reflexology"


def test_saving_the_original_wording_keeps_it_original(client, app):
    admin(client)
    put(client, "home.headline", HEADLINE)
    with app.app_context():
        assert db.session.get(SiteText, "home.headline") is None


def test_empty_text_is_refused(client):
    admin(client)
    r = put(client, "home.headline", "   ")
    assert r.status_code == 400 and "Reset to original" in r.get_json()["error"]
    assert texts(client)["home.headline"] == HEADLINE


def test_unknown_block_is_404(client):
    admin(client)
    assert put(client, "home.secret", "x").status_code == 404
    assert client.delete("/api/admin/site-text/home.secret").status_code == 404


# Reset to original

def test_reset_puts_the_original_back(client, app):
    admin(client)
    put(client, "contact.intro", "Email is best.")
    assert texts(client)["contact.intro"] == "Email is best."
    r = client.delete("/api/admin/site-text/contact.intro")
    assert r.status_code == 200
    assert (r.get_json()["edited"], r.get_json()["value"]) == (False, "The fastest way to reach Kerimah is a text.")
    assert texts(client)["contact.intro"] == "The fastest way to reach Kerimah is a text."
    with app.app_context():
        assert db.session.get(SiteText, "contact.intro") is None
    assert client.delete("/api/admin/site-text/contact.intro").status_code == 200  # twice is fine


# Length limits

@pytest.mark.parametrize("key", ["home.headline", "home.intro", "about.bio", "contact.service_area"])
def test_length_limits(client, key):
    admin(client)
    limit = BLOCKS[key]["max"]
    assert put(client, key, "a" * limit).status_code == 200
    r = put(client, key, "a" * (limit + 1))
    assert r.status_code == 400
    assert r.get_json()["error"].endswith(f"too long: {limit + 1} characters. The limit is {limit}.")
    assert texts(client)[key] == "a" * limit


def test_list_limits(client):
    admin(client)
    r = put(client, "home.facts", "\n".join(f"Line {i}" for i in range(7)))
    assert r.status_code == 400 and "at most 6 lines" in r.get_json()["error"]
    r = put(client, "home.facts", "ok\n" + "b" * 201)
    assert r.status_code == 400 and r.get_json()["error"].startswith("Line 2 is too long")


# No HTML

@pytest.mark.parametrize("bad", [
    "<script>alert(1)</script>",
    "Hi <b>there</b>",
    '<img src=x onerror="alert(1)">',
    "< a href='https://evil.example'>click</a>",
    "</p>",
    "<!-- hidden -->",
])
def test_html_is_refused(client, bad):
    admin(client)
    r = put(client, "home.intro", bad)
    assert r.status_code == 400
    assert "Plain text only" in r.get_json()["error"]
    assert "<" not in texts(client)["home.intro"]


def test_plain_text_with_angle_brackets_is_fine(client):
    admin(client)
    assert put(client, "home.intro", "We <3 feet. Sessions < 2 hours & > 1 hour.").status_code == 200
    assert texts(client)["home.intro"] == "We <3 feet. Sessions < 2 hours & > 1 hour."


def test_html_is_refused_in_questions(client):
    admin(client)
    r = put(client, "services.faq", [{"q": "Fine?", "a": "<iframe src=x>"}])
    assert r.status_code == 400 and r.get_json()["error"].startswith("Answer 1 has something that looks like")


# Questions: add, edit, reorder, delete

def test_questions_add_edit_reorder_and_delete(client):
    admin(client)
    faq = texts(client)["services.faq"]
    faq.append({"q": "Do you take gift cards?", "a": "Yes.\nText me to buy one."})  # add
    faq[0]["a"] = "Anywhere from Boston to the South Coast."  # edit
    faq[0], faq[1] = faq[1], faq[0]  # reorder
    del faq[2]  # delete "When does Kerimah arrive?"
    r = put(client, "services.faq", faq)
    assert r.status_code == 200
    saved = texts(client)["services.faq"]
    assert [q["q"] for q in saved] == [
        "Do I need my own table or supplies?", "Where are services held?", "How does the deposit work?",
        "Can I change my appointment?", "Can I book a massage while pregnant?", "How do events work?",
        "Do you take gift cards?"]
    assert saved[1]["a"] == "Anywhere from Boston to the South Coast."
    assert saved[-1]["a"] == "Yes.\nText me to buy one."


def test_question_rules(client):
    admin(client)
    assert put(client, "services.faq", []).status_code == 400
    r = put(client, "services.faq", [{"q": "Only a question?", "a": " "}])
    assert r.status_code == 400 and "Fill in both" in r.get_json()["error"]
    r = put(client, "services.faq", [{"q": "q" * 151, "a": "a"}])
    assert r.status_code == 400 and r.get_json()["error"].startswith("Question 1 is too long")
    r = put(client, "services.faq", [{"q": f"Q{i}", "a": "A"} for i in range(21)])
    assert r.status_code == 400 and "at most 20" in r.get_json()["error"]
    assert put(client, "services.faq", "not a list").status_code == 400
    # How it works always has three steps
    assert put(client, "home.steps", [{"q": "One", "a": "Two"}]).status_code == 400


# Weekly Deals banner

def test_deal_banner_text(client):
    admin(client)
    assert put(client, "deals.banner", "Mondays on the South Coast,\nWednesdays in Boston: $30 off!").status_code == 200
    assert client.get("/api/config").get_json()["weekly_deal"]["text"] == (
        "Mondays on the South Coast,\nWednesdays in Boston: $30 off!")
    client.put("/api/admin/settings", json={"weekly_deal_enabled": "0"})
    assert client.get("/api/config").get_json()["weekly_deal"] is None  # still hidden while deals are off
    client.put("/api/admin/settings", json={"weekly_deal_enabled": "1", "weekly_deal_dollars": "25"})
    client.delete("/api/admin/site-text/deals.banner")
    assert "$25 off" in client.get("/api/config").get_json()["weekly_deal"]["text"]


# Service descriptions and notes (Services and products page)

def services_by_slug(client):
    return {s["slug"]: s for s in admin(client).get("/api/admin/catalog").get_json()["services"]}


def test_service_description_and_note_save_reset_and_limits(client):
    s = services_by_slug(client)["sole-cleanse-60"]
    original = s["summary"]
    assert s["original_summary"] == original and s["original_note"] == s["note"]
    r = client.patch(f"/api/admin/services/{s['id']}", json={"summary": "Full body massage.\nHot towels.",
                                                             "note": "Bring a towel."})
    assert r.status_code == 200
    menu = {x["slug"]: x for x in client.get("/api/services").get_json()["services"]}
    assert (menu["sole-cleanse-60"]["summary"], menu["sole-cleanse-60"]["note"]) == (
        "Full body massage.\nHot towels.", "Bring a towel.")

    r = client.patch(f"/api/admin/services/{s['id']}", json={"summary": "x" * 601})
    assert r.status_code == 400 and "too long" in r.get_json()["error"]
    r = client.patch(f"/api/admin/services/{s['id']}", json={"note": "<b>bold</b>"})
    assert r.status_code == 400 and "Plain text only" in r.get_json()["error"]
    assert services_by_slug(client)["sole-cleanse-60"]["note"] == "Bring a towel."  # unchanged

    r = client.post(f"/api/admin/services/{s['id']}/reset-text")
    assert r.status_code == 200 and r.get_json()["summary"] == original
    assert r.get_json()["price_cents"] == 19000


def test_service_text_reset_needs_an_original(client):
    r = admin(client).post("/api/admin/services", json={"name": "Hand Rescue", "price_cents": 5000})
    assert r.json["original_summary"] is None
    assert client.post(f"/api/admin/services/{r.json['id']}/reset-text").status_code == 400
    client.post("/api/admin/logout")
    assert client.post(f"/api/admin/services/{r.json['id']}/reset-text").status_code == 401


# The live database: the new table arrives without touching bookings

def test_new_table_is_added_to_an_existing_database_and_keeps_bookings(tmp_path):
    cfg = {"SQLALCHEMY_DATABASE_URI": db_url_for(tmp_path), "TESTING": True, "RATELIMIT_ENABLED": False,
           "STRIPE_SECRET_KEY": "", "STRIPE_WEBHOOK_SECRET": "", "ADMIN_PASSWORD": "pw", "SECRET_KEY": "x" * 32}
    old = create_app(cfg)
    from api.extensions import limiter
    limiter.enabled = False
    c = old.test_client()
    token = book_and_pay(c, first_slot(c))
    with old.app_context():
        db.session.execute(text("DROP TABLE site_text"))  # the live database before this update
        db.session.commit()
        assert not inspect(db.engine).has_table("site_text")
        db.engine.dispose()

    new = create_app(cfg)  # what a Vercel cold start does after the deploy
    c = new.test_client()
    with new.app_context():
        assert inspect(db.engine).has_table("site_text")
        assert Booking.query.filter_by(token=token).one().status == "confirmed"
    assert texts(c)["home.headline"] == HEADLINE
    assert put(admin(c), "home.headline", "Still booked.").status_code == 200
    assert c.get(f"/api/bookings/{token}").get_json()["status"] == "confirmed"
    create_app(cfg)  # starting again changes nothing
    assert texts(c)["home.headline"] == "Still booked."
    drop_test_db(new)
