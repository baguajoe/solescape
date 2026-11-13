"""Vercel entrypoint. vercel.json runs this module's `app` as the Python service for /api/*.
Locally, use `pipenv run start`, which calls create_app() directly."""
from api.app import create_app

app = create_app()
