import os
import secrets
from dotenv import load_dotenv

load_dotenv()


class Config:
    APP_ENV = os.getenv("APP_ENV", "development")
    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me")
    PUBLIC_URL = os.getenv("PUBLIC_URL", "http://localhost:3000").rstrip("/")
    TIMEZONE = os.getenv("BUSINESS_TIMEZONE", "America/New_York")

    db_url = os.getenv("DATABASE_URL", "sqlite:///solescape.db")
    if db_url.startswith("postgres://"):  # Heroku/Render style URL
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = db_url
    SQLALCHEMY_ENGINE_OPTIONS = (
        {"connect_args": {"timeout": 30}} if db_url.startswith("sqlite") else {"pool_pre_ping": True}
    )

    STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    MAIL_FROM = os.getenv("MAIL_FROM", "")
    OWNER_EMAIL = os.getenv("OWNER_EMAIL", "solescapefootspa@gmail.com")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = APP_ENV == "production"
    MAX_CONTENT_LENGTH = 1024 * 1024
    RATELIMIT_ENABLED = True
    RATELIMIT_STORAGE_URI = "memory://"


def check_production(cfg):
    """Refuse to boot a live site with test settings."""
    if cfg.get("APP_ENV") != "production":
        return
    problems = []
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
        raise RuntimeError("Set these before running in production: " + ", ".join(problems))
