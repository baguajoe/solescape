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

To run the API tests on Postgres too, point `TEST_DATABASE_URL` at an empty throwaway database (its tables are
dropped): `TEST_DATABASE_URL=postgresql://user:pass@localhost/solescape_test pipenv run test`.

GitHub runs all of it on every push and pull request (`.github/workflows/test.yml`), with the API tests on both
SQLite and Postgres. If the browser
tests fail there, the run's `playwright-report` download has screenshots and a step-by-step trace.

Codespaces: set port 3000 to public or open the forwarded URL. `vite.config.js` already handles the
hot reload WebSocket.

## What's in it

Pages: Home, Services (menu, events, policies, questions), About, Contact (with a message form) and Book. Every page has its own title and description for search engines, and a Book button stays on screen on phones.


- Clients: her menu, a live calendar that blocks her 30-minute setup and travel time, hourly events with a 3-hour minimum, a $75 deposit at checkout, a confirmation page, add to calendar, reschedule once (24 hours' notice) and cancel online
- Kerimah (`/admin`): month calendar showing arrival times, phone or text bookings, reschedule, cancel, refund, mark balance paid, prices, setup time, hours, time off, deposit amount, travel time, policy text, a Messages inbox for the Contact form, a private calendar link for her phone. Adding a product turns on the Shop.

## Blocking time, Weekly Deals and corporate clients

- **Calendar:** pick a day to "Block this day" or "Block part of this day". Part-day blocks can repeat every
  week, with an optional end date. Blocks show on the calendar and can be removed there. Weekly blocks are
  also listed under Hours and time off. Blocking over a confirmed appointment warns her and never cancels it.
- **Weekly Deals:** her text shows as a banner on Home and Services. $30 off 60- and 90-minute Sole Cleanse and
  Mama's Sole Relief when the appointment is on a Monday and the client picked South Coast, or a Wednesday and
  Boston area. Clients choose their area when booking; the calendar tags qualifying days "$30 off". Settings has
  the on/off switch, the amount and the day for each area. Rescheduling works the deal out again for the new
  day, and the client sees the new total before confirming. The admin calendar shows each booking's area.
- **Corporate clients:** each company gets a code for Recovery Lounge and Foot Loose bookings. The reward
  (a percent off every event, or a reward after N completed events) is set in Settings. It's off by default,
  and the site doesn't mention it until it's on and she has written the program description.
- Discounts never stack: the larger one applies. A discount never takes the total below the deposit. Each
  booking stores the discount it got and the area, so later changes don't affect it.
- New database columns are added automatically on startup (`add_missing_columns` in `api/models.py`). It only
  adds nullable columns and never changes or drops anything. Her Nov 2026 description changes are applied to
  an existing database only where the old wording is unchanged.

## Deploy to Vercel (free preview)

One Vercel project runs both halves, using Vercel Services (beta, available on the free Hobby plan) set up in
`vercel.json`:

- **web**: `npm run build`, and Vercel's CDN serves `dist/`, including the photos in `public/images`. Any path
  that isn't a real file gets `index.html`, so `/services`, `/booking/<token>`, `/admin` and the rest work when
  opened directly or refreshed.
- **api**: `/api/*` goes to Flask as a Python function. The entrypoint is `api/index.py`, which exposes
  `app = create_app()`. Python 3.12, with packages from `Pipfile.lock`.

**Database.** Vercel doesn't keep files, so the site uses Postgres from Neon (Vercel Marketplace, free plan).
Neon fills in `DATABASE_URL`. On the first request against an empty database the app creates the tables and
loads her services, add-on, hours, default settings and the calendar lock row. The app refuses to start on
Vercel with SQLite.

**APP_ENV.**

| | development | preview | production |
|---|---|---|---|
| Where | Codespaces, your computer | Shared test site (Vercel) | Live site |
| `SECRET_KEY`, `ADMIN_PASSWORD` | optional | required, password 12+ characters | required |
| Payments | demo unless Stripe keys are set | always demo, even if Stripe keys are set | Stripe only, keys required |
| Purple "Demo mode" bar | when demo | yes | never |
| Admin cookie | http is fine | https only | https only |

**Settings to add in Vercel** (Project, Settings, Environment Variables):

| Name | Value |
|---|---|
| `APP_ENV` | `preview` |
| `SECRET_KEY` | 64 random characters: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_PASSWORD` | a strong password, 12 or more characters |
| `PUBLIC_URL` | the site's address, e.g. `https://solescape.vercel.app` (no slash at the end) |
| `DATABASE_URL` | filled in by Neon. Don't type it yourself |
| `SMTP_*`, `MAIL_FROM`, `OWNER_EMAIL` | optional. Without SMTP, emails only go to the Vercel logs |

Without `PUBLIC_URL`, links fall back to the project's main vercel.app address. Set it anyway, so email links
and the demo payment page use the address you share.

**What's different from a normal server:**

- *Many copies.* Vercel runs as many copies of the API as traffic needs and stops idle ones. Startup work
  (create tables, add columns, seed) runs in one transaction behind a Postgres advisory lock, so copies starting
  together queue up and only the first does it. `tests/test_deploy.py` starts 8 at once against an empty
  database. Bookings still go through the one-row `calendar_lock` table, which works the same on Postgres.
- *Email* is sent after the response has gone to the browser, with a 10-second timeout, and failures are only
  logged. A slow or broken mail server never slows down or breaks a booking.
- *Rate limits* (login, booking, contact form) are counted in each copy's memory. On Vercel a copy usually
  handles many requests in a row, so this still stops someone hammering the site, but limits reset when a copy
  stops and aren't shared between copies. That's fine for a preview. For the live site, either accept it with a
  strong admin password, or add a free Upstash Redis from the Vercel Marketplace, run `pipenv install redis`, and
  set `RATELIMIT_STORAGE_URI` to its `rediss://` URL.
- *Cold starts.* The first request after a quiet spell takes a second or two: Vercel starts Python, and Neon's
  free database wakes up after 5 idle minutes.

Locally nothing changes: `pipenv run start` and `npm run start` use SQLite in `instance/`. To try the Vercel setup
locally, use `npx vercel dev --local` with `APP_ENV`, `SECRET_KEY`, `ADMIN_PASSWORD` and a Postgres `DATABASE_URL`
set in your shell.

## Before going live

1. **Confirm the business details** listed in `CLAUDE_PROMPT.md` under "Confirm with Kerimah".
2. **Stripe.** Create an account in her name so the money goes to her. Add `STRIPE_SECRET_KEY`.
   Add a webhook pointing at `https://YOUR-DOMAIN/api/stripe/webhook` with
   `checkout.session.completed`, `checkout.session.async_payment_succeeded` and
   `checkout.session.expired`, then add `STRIPE_WEBHOOK_SECRET`.
3. **Hosting.** On Vercel, switch `APP_ENV` from `preview` to `production` and add the Stripe keys. Vercel's free
   Hobby plan is for non-commercial use, so a live business site needs Pro. Any other host that runs Python and
   Postgres works too. Set the variables from `.env.example`, plus `APP_ENV=production`, a long random
   `SECRET_KEY`, a real `ADMIN_PASSWORD`, `PUBLIC_URL` and `DATABASE_URL`.

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
