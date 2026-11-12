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

Other commands: `pipenv run seed`, `npm run build`.

## Tests

```bash
npm test               # everything: API tests, then the browser tests
pipenv run test        # API tests only (pytest)
npm run test:e2e       # browser tests only: builds the site and drives it in Chrome
```

The browser tests (`e2e/`) start their own server on port 5055 in demo mode with a throwaway
database, then click through the site on a desktop and a phone screen: every page, the contact form,
a full booking (deposit, add to calendar, reschedule, cancel), the event hour minimum, and the owner
admin. First time only: `npx playwright install --with-deps chromium`.

GitHub runs all of it on every push and pull request (`.github/workflows/test.yml`). If the browser
tests fail there, the run's `playwright-report` download has screenshots and a step-by-step trace.

Codespaces: set port 3000 to public or open the forwarded URL. `vite.config.js` already handles the
hot reload WebSocket.

## What's in it

Pages: Home, Services (menu, events, policies, questions), About, Contact (with a message form) and Book. Every page has its own title and description for search engines, and a Book button stays on screen on phones.


- Clients: her menu, a live calendar that blocks her 30-minute setup and travel time, hourly events with a 3-hour minimum, a $75 deposit at checkout, a confirmation page, add to calendar, reschedule once (24 hours' notice) and cancel online
- Kerimah (`/admin`): month calendar showing arrival times, phone or text bookings, reschedule, cancel, refund, mark balance paid, prices, setup time, hours, time off, deposit amount, travel time, policy text, a Messages inbox for the Contact form, a private calendar link for her phone. Adding a product turns on the Shop.

## Blocking time, specials and corporate clients

- **Calendar:** pick a day to "Block this day" or "Block part of this day". Part-day blocks can repeat every
  week, with an optional end date. Blocks show on the calendar and can be removed there. Weekly blocks are
  also listed under Hours and time off. Blocking over a confirmed appointment warns her and never cancels it.
- **Specials:** one special at a time, on chosen services, as a percent or dollars off. It shows a banner on
  Home and Services, sale prices on the menu, and turns off after its end date. Settings chooses whether it
  depends on the booking date (default) or the appointment date.
- **Corporate clients:** each company gets a code for Recovery Lounge and Foot Loose bookings. The reward
  (a percent off every event, or a reward after N completed events) is set in Settings. It's off by default,
  and the site doesn't mention it until it's on and she has written the program description.
- A special and a corporate discount never stack: the larger one applies. A discount never takes the total
  below the deposit. Each booking stores the discount it got, so later changes don't affect it.
- New database columns are added automatically on startup (`add_missing_columns` in `api/models.py`). It only
  adds nullable columns and never changes or drops anything.

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
