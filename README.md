# SoleScape Foot Spa & Massage

Booking calendar, deposits, orders and an owner admin. React (Vite) on Flask.

## Run it

Two terminals, both from this folder:

```bash
# Terminal 1: API on port 5001
pipenv install --dev
pipenv run start

# Terminal 2: site on port 3000
npm install
npm run start
```

Open http://localhost:3000. The owner admin is at /admin, and the default password is `change-me`.

The database creates itself and loads her services the first time the API starts.
Without Stripe keys the site runs in demo mode: a purple bar shows and no card is charged.

Other commands: `pipenv run test`, `pipenv run seed`, `npm run build`.

Codespaces: set port 3000 to public or open the forwarded URL. `vite.config.js` already handles the
hot reload WebSocket.

## What's in it

Pages: Home, Services (menu, events, policies, questions), About, Contact (with a message form) and Book. Every page has its own title and description for search engines, and a Book button stays on screen on phones.


- Clients: her menu, a live calendar that blocks her 30-minute setup and travel time, hourly events with a 3-hour minimum, a $75 deposit at checkout, a confirmation page, add to calendar, reschedule once (24 hours' notice) and cancel online
- Kerimah (`/admin`): month calendar showing arrival times, phone or text bookings, reschedule, cancel, refund, mark balance paid, prices, setup time, hours, time off, deposit amount, travel time, policy text, a Messages inbox for the Contact form, a private calendar link for her phone. Adding a product turns on the Shop.

## Before going live

1. **Confirm the business details** listed in `CLAUDE_PROMPT.md` under "Confirm with Kerimah".
2. **Stripe.** Create an account in her name so the money goes to her. Add `STRIPE_SECRET_KEY`.
   Add a webhook pointing at `https://YOUR-DOMAIN/api/stripe/webhook` with
   `checkout.session.completed`, `checkout.session.async_payment_succeeded` and
   `checkout.session.expired`, then add `STRIPE_WEBHOOK_SECRET`.
3. **Hosting.** Any host that runs Python and Postgres works. Set the variables from `.env.example`, plus
   `APP_ENV=production`, a long random `SECRET_KEY`, a real `ADMIN_PASSWORD`, `PUBLIC_URL` and `DATABASE_URL`.

   ```bash
   # build
   pipenv install && npm install && npm run build
   # start
   pipenv run gunicorn "api.app:create_app()" --bind 0.0.0.0:$PORT --workers 2
   ```

   The app refuses to start in production if any required secret is missing.
4. **Email.** Add SMTP settings, or confirmations are only written to the server log.
5. **Photos.** Her photos and logo are in `public/images`, resized and with location data removed.

## How it stays reliable

- Prices are always calculated on the server. The browser can't change them.
- A time is held for 35 minutes during checkout, and Stripe's page closes first at 31.
- Bookings pass through a calendar lock, so two people can't take the same slot.
- If a payment ever lands on a taken slot, it's flagged in red in the admin to rebook or refund.
- Times are stored in UTC and shown in Boston time, so daylight saving is handled.

Schema changes: tables are created by `db.create_all()`, which won't alter existing tables. Add Flask-Migrate
before changing models on a live database.
