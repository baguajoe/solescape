"""APP_ENV rules (development, preview, production) and what running on Vercel needs."""
import threading

import pytest

from api import config, notify
from api.app import create_app
from api.models import CalendarLock, Service, db
from tests.test_app import PG_URL, book_and_pay, db_url_for, drop_test_db, first_slot, payload

GOOD = dict(SECRET_KEY="k" * 64, ADMIN_PASSWORD="a-strong-test-password")
STRIPE = dict(STRIPE_SECRET_KEY="sk_test_x", STRIPE_WEBHOOK_SECRET="whsec_x")


@pytest.fixture()
def make_app(tmp_path, monkeypatch):
    """create_app with APP_ENV and settings as Vercel would set them, on a throwaway database."""
    made = []

    def make(env, secret_key="", **cfg):
        if secret_key:
            monkeypatch.setenv("SECRET_KEY", secret_key)
        else:
            monkeypatch.delenv("SECRET_KEY", raising=False)
        app = create_app({"APP_ENV": env, "SQLALCHEMY_DATABASE_URI": db_url_for(tmp_path),
                          "RATELIMIT_ENABLED": False, "SMTP_HOST": "", **cfg})
        from api.extensions import limiter
        limiter.enabled = False
        made.append(app)
        return app

    yield make
    for app in made:
        drop_test_db(app)


def preview(make_app, **cfg):
    return make_app("preview", GOOD["SECRET_KEY"], ADMIN_PASSWORD=GOOD["ADMIN_PASSWORD"], **cfg)


# Preview: real secrets, demo payments

def test_preview_needs_a_real_secret_key_and_admin_password(make_app):
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        make_app("preview", ADMIN_PASSWORD=GOOD["ADMIN_PASSWORD"])
    for weak in ("change-me", "short", ""):
        with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
            make_app("preview", GOOD["SECRET_KEY"], ADMIN_PASSWORD=weak)
    assert preview(make_app).config["APP_ENV"] == "preview"


def test_preview_does_not_need_stripe_and_shows_the_demo_bar(make_app):
    c = preview(make_app, STRIPE_SECRET_KEY="", STRIPE_WEBHOOK_SECRET="").test_client()
    assert c.get("/api/config").get_json()["payment_mode"] == "demo"


def test_preview_books_without_a_card_even_if_stripe_keys_are_set(make_app):
    app = preview(make_app, **STRIPE)
    c = app.test_client()
    assert c.get("/api/config").get_json()["payment_mode"] == "demo"
    r = c.post("/api/bookings", json=payload(first_slot(c)))
    assert "/demo-pay/booking/" in r.get_json()["checkout_url"]
    token = book_and_pay(c, first_slot(c))
    assert c.get(f"/api/bookings/{token}").get_json()["status"] == "confirmed"
    assert c.post("/api/stripe/webhook", data="{}").status_code == 404  # no Stripe events on a test site


def test_preview_admin_cookie_is_secure(make_app):
    c = preview(make_app).test_client()
    assert c.post("/api/admin/login", json={"password": "change-me"}).status_code == 401
    r = c.post("/api/admin/login", json={"password": GOOD["ADMIN_PASSWORD"]})
    cookie = r.headers["Set-Cookie"]
    assert r.status_code == 200 and "Secure" in cookie and "HttpOnly" in cookie


def test_development_cookie_works_over_http(make_app):
    app = make_app("development", ADMIN_PASSWORD="pw")
    r = app.test_client().post("/api/admin/login", json={"password": "pw"})
    assert r.status_code == 200 and "Secure" not in r.headers["Set-Cookie"]


# Production: unchanged strict rules

def test_production_needs_stripe_and_never_takes_demo_payments(make_app):
    with pytest.raises(RuntimeError, match="STRIPE_SECRET_KEY"):
        make_app("production", GOOD["SECRET_KEY"], ADMIN_PASSWORD=GOOD["ADMIN_PASSWORD"],
                 PUBLIC_URL="https://solescape.example")
    app = make_app("production", GOOD["SECRET_KEY"], ADMIN_PASSWORD=GOOD["ADMIN_PASSWORD"],
                   PUBLIC_URL="https://solescape.example", **STRIPE)
    c = app.test_client()
    assert c.get("/api/config").get_json()["payment_mode"] == "stripe"
    assert c.post("/api/demo/pay/booking/anything").status_code == 404


def test_unknown_app_env_is_refused(make_app):
    with pytest.raises(RuntimeError, match="APP_ENV"):
        make_app("staging", GOOD["SECRET_KEY"])


# Vercel

def test_vercel_refuses_sqlite(make_app, monkeypatch):
    monkeypatch.setattr(config, "ON_VERCEL", True)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        make_app("preview", GOOD["SECRET_KEY"], ADMIN_PASSWORD=GOOD["ADMIN_PASSWORD"],
                 SQLALCHEMY_DATABASE_URI="sqlite:///x.db")


def test_vercel_with_no_settings_lists_everything_missing(make_app, monkeypatch):
    """A new Vercel project has no variables, so APP_ENV defaults to development. It must not boot that way
    (the admin password would be "change-me"), and the error must name every setting to add."""
    monkeypatch.setattr(config, "ON_VERCEL", True)
    with pytest.raises(RuntimeError) as err:
        make_app("development", SQLALCHEMY_DATABASE_URI="sqlite:///x.db", ADMIN_PASSWORD="change-me")
    for name in ("APP_ENV", "DATABASE_URL", "SECRET_KEY", "ADMIN_PASSWORD"):
        assert name in str(err.value)


def test_vercel_with_only_a_database_still_refuses_development(make_app, monkeypatch):
    monkeypatch.setattr(config, "ON_VERCEL", True)
    with pytest.raises(RuntimeError, match="APP_ENV") as err:
        make_app("development", GOOD["SECRET_KEY"], ADMIN_PASSWORD=GOOD["ADMIN_PASSWORD"],
                 SQLALCHEMY_DATABASE_URI="postgresql+psycopg2://neon.example/db")
    assert "SECRET_KEY" not in str(err.value) and "DATABASE_URL" not in str(err.value)


def test_public_url_falls_back_to_the_vercel_address(monkeypatch):
    monkeypatch.delenv("PUBLIC_URL", raising=False)
    monkeypatch.delenv("VERCEL_PROJECT_PRODUCTION_URL", raising=False)
    assert config.public_url() == "http://localhost:3000"
    monkeypatch.setenv("VERCEL_PROJECT_PRODUCTION_URL", "solescape.vercel.app")
    assert config.public_url() == "https://solescape.vercel.app"
    monkeypatch.setenv("PUBLIC_URL", "https://solescape.example/")
    assert config.public_url() == "https://solescape.example"


def test_email_is_sent_after_the_response_and_failures_never_break_it(make_app, monkeypatch):
    app = make_app("development", SMTP_HOST="127.0.0.1", SMTP_PORT=1)  # nothing listens on port 1
    delivered = []
    real = notify.deliver
    monkeypatch.setattr(notify, "deliver", lambda msg, smtp: delivered.append(real(msg, smtp)))
    c = app.test_client()
    r = c.post("/api/messages", json=dict(name="Ada Client", email="ada@example.com", message="Hello there"))
    assert r.status_code == 201
    assert delivered == []  # not yet: the browser has its answer first
    r.close()
    assert delivered == [False]  # tried, failed, logged


@pytest.mark.skipif(not PG_URL, reason="needs TEST_DATABASE_URL (Postgres)")
def test_many_copies_starting_at_once_set_up_the_database_once(tmp_path, monkeypatch):
    """Vercel can start several copies against an empty database at the same moment."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    cfg = {"SQLALCHEMY_DATABASE_URI": PG_URL, "RATELIMIT_ENABLED": False}
    with create_app(cfg).app_context():  # start from empty
        db.drop_all()
        db.engine.dispose()
    errors, apps = [], []

    def start():
        try:
            apps.append(create_app(cfg))
        except Exception as e:  # pragma: no cover - the failure we're checking for
            errors.append(e)

    threads = [threading.Thread(target=start) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert errors == []
    with apps[0].app_context():
        assert Service.query.count() == 7
        assert CalendarLock.query.count() == 1
    for app in apps:
        drop_test_db(app)
