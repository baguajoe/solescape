import os
import secrets
from dotenv import load_dotenv

load_dotenv()

# development: your computer or Codespaces. SQLite, demo payments, default password.
# preview: a shared test site (Vercel). Real secrets and Postgres, but demo payments only: no card is charged.
# production: the live site. Real secrets, Postgres and Stripe. Demo payments are impossible.
APP_ENVS = ("development", "preview", "production")
ON_VERCEL = bool(os.getenv("VERCEL"))  # Vercel sets VERCEL=1 in every build and function


def normalize_db_url(url):
    """Neon, Heroku and Render give postgres:// or postgresql:// URLs. SQLAlchemy 2.1 reads postgresql:// as the
    psycopg 3 driver, but this app installs psycopg2, so name it explicitly."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg2://" + url[len(prefix):]
    return url


def database_url():
    return normalize_db_url(os.getenv("DATABASE_URL", "sqlite:///solescape.db"))


def public_url():
    """PUBLIC_URL wins. On Vercel without it, use the project's vercel.app address so links still work."""
    url = os.getenv("PUBLIC_URL", "")
    if not url and os.getenv("VERCEL_PROJECT_PRODUCTION_URL"):
        url = "https://" + os.environ["VERCEL_PROJECT_PRODUCTION_URL"]
    return (url or "http://localhost:3000").rstrip("/")


def engine_options(url):
    if url.startswith("sqlite"):
        return {"connect_args": {"timeout": 30}}
    # Serverless copies come and go, and Neon's pooler closes idle connections: test each connection before use
    # and keep only a few per copy.
    return {"pool_pre_ping": True, "pool_recycle": 300, "pool_size": 2, "max_overflow": 3}


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me")
    PUBLIC_URL = public_url()
    TIMEZONE = os.getenv("BUSINESS_TIMEZONE", "America/New_York")

    SQLALCHEMY_DATABASE_URI = database_url()

    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    MAIL_FROM = os.getenv("MAIL_FROM", "")
    OWNER_EMAIL = os.getenv("OWNER_EMAIL", "solescapefootspa@gmail.com")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"  # SESSION_COOKIE_SECURE is set in create_app from APP_ENV
    MAX_CONTENT_LENGTH = 1024 * 1024
    RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "true").lower() != "false"
    # Counts are kept in each server copy's memory. Set a redis:// URL to share them (see README).
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")


MIN_PREVIEW_PASSWORD = 12


def check_settings(cfg):
    """Refuse to boot a shared or live site with unsafe settings."""
    env = cfg.get("APP_ENV")
    if env not in APP_ENVS:
        raise RuntimeError(f"APP_ENV must be one of {', '.join(APP_ENVS)}, not {env!r}")
    problems = []
    if ON_VERCEL and cfg.get("SQLALCHEMY_DATABASE_URI", "").startswith("sqlite"):
        problems.append("DATABASE_URL (Vercel doesn't keep files, so add the Neon Postgres database)")
    if env == "preview":
        if not os.getenv("SECRET_KEY"):
            problems.append("SECRET_KEY")
        if len(cfg.get("ADMIN_PASSWORD", "")) < MIN_PREVIEW_PASSWORD or cfg.get("ADMIN_PASSWORD") == "change-me":
            problems.append(f"ADMIN_PASSWORD (at least {MIN_PREVIEW_PASSWORD} characters)")
    if env == "production":
        if not os.getenv("SECRET_KEY"):
            problems.append("SECRET_KEY")
        if cfg.get("ADMIN_PASSWORD") in ("", "change-me"):
            problems.append("ADMIN_PASSWORD")
        if not cfg.get("STRIPE_SECRET_KEY"):
            problems.append("STRIPE_SECRET_KEY")
        if not cfg.get("STRIPE_WEBHOOK_SECRET"):
            problems.append("STRIPE_WEBHOOK_SECRET")
        if "localhost" in cfg.get("PUBLIC_URL", ""):
            problems.append("PUBLIC_URL")
    if problems:
        raise RuntimeError(f"Set these before running with APP_ENV={env}: " + ", ".join(problems))
