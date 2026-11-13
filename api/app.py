import logging
import os

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config, check_settings, engine_options, normalize_db_url
from .extensions import limiter
from .models import db

DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")


def create_app(overrides=None):
    logging.basicConfig(level=logging.INFO)
    app = Flask(__name__, instance_path=os.path.abspath("instance"), static_folder=None)
    app.config.from_object(Config)
    app.config.update(overrides or {})
    app.config["SQLALCHEMY_DATABASE_URI"] = normalize_db_url(app.config["SQLALCHEMY_DATABASE_URI"])
    app.config.setdefault("SQLALCHEMY_ENGINE_OPTIONS", engine_options(app.config["SQLALCHEMY_DATABASE_URI"]))
    check_settings(app.config)
    shared = app.config["APP_ENV"] in ("preview", "production")
    if "SESSION_COOKIE_SECURE" not in (overrides or {}):
        app.config["SESSION_COOKIE_SECURE"] = shared  # admin cookie only over https
    if shared:
        # Behind Vercel or another proxy: trust its one hop for the client IP (rate limits) and https.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite"):
        os.makedirs(app.instance_path, exist_ok=True)  # SQLite's file lives here. Vercel's disk is read-only.
    db.init_app(app)
    limiter.init_app(app)

    from .admin import bp as admin_bp
    from .public import bp as public_bp
    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp)

    from .seed import prepare_database, seed_if_empty
    with app.app_context():
        prepare_database()

    @app.cli.command("seed")
    def seed_command():
        """Load her services, prices and hours into an empty database."""
        print("Seeded." if seed_if_empty() else "Database already has data. Nothing changed.")

    @app.errorhandler(HTTPException)
    def http_error(err):
        if request.path.startswith("/api/"):
            return jsonify(error=err.description), err.code
        return err

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        """Serves the built React app in production. In development use npm run start."""
        if path.startswith("api/"):
            return jsonify(error="Not found."), 404
        if not os.path.isdir(DIST):
            return "API is running. Open the site at http://localhost:3000 (npm run start).", 200
        if path and os.path.isfile(os.path.join(DIST, path)):
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app
