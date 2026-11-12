# Claude prompt: SoleScape Foot Spa & Massage website

How to use: copy everything below the line into a new Claude chat.
- To **build from scratch**, add: "Build this from scratch. Give me every file."
- To **continue the existing project**, attach the project files and add: "Continue this project. Read the code first."
- Attach her photos and logo too (file names are listed in the Photos section).

---

You are a senior full-stack engineer building a production website for a real small business. The site must let clients see services and prices, book an appointment on a live calendar, and pay a deposit online. The owner must be able to run everything from an admin area without a developer. Read this entire brief before writing any code, and follow it exactly.

## 1. The business

- **Name:** SoleScape Foot Spa & Massage. Use this one name everywhere. (Her old site also says "The Traveling LMT" and "SoleScape Mobile Sanctuary". Don't use those unless told to.)
- **Owner:** Kerimah, licensed massage therapist (LMT), Massachusetts.
- **Model:** mobile only. Every service happens at the client's home or workplace, from Boston to the South Coast of Massachusetts. All equipment is provided. She arrives 30 minutes before the session to set up.
- **Phone and text:** 617.297.8564 (use `sms:+16172978564` and `tel:+16172978564` links)
- **Email:** solescapefootspa@gmail.com
- **Instagram:** @_solescapefootspa (https://www.instagram.com/_solescapefootspa/)
- **Logo line:** "Wellness that comes to you."

## 2. Her wording: the most important rule

The text in sections 3 to 5 was written by the owner. Use it **word for word**. Only spelling, grammar and punctuation mistakes have been fixed, and they're already fixed below. Do not paraphrase, shorten, "improve" or rewrite her text anywhere: not on the home page, services, booking page, emails or anywhere else it appears.

Do not invent facts about her or the business: no reviews, testimonials, client counts, years in business, health claims, awards or credentials beyond what's written here. Anything you have to write yourself (section 6 lists where) must stick to these facts, and you must list it at the end of your answer so the owner can approve it.

## 3. Her text: intro and services

**Home hero (updated Nov 12, 2026):**
> Headline: **A complete sole to soul recovery experience.**
>
> SoleScape Foot Spa & Massage delivers mobile therapeutic foot care to restore movement, relieve chronic pain, and prevent injuries—right where you are.
>
> Tagline: **She travels to you**

Use the hero paragraph as the Home meta description, and the headline plus paragraph as the Open Graph description.

**Intro (Services page):**
> A sole to soul lasting experience. All services are performed by your licensed massage therapist (LMT) at your home or workplace. All equipment is provided for your service.

**Mobile services** (prices are exact; never change them unless told to):

| Service | Length | Price | Description (her words) | Note (her words) |
|---|---|---|---|---|
| Sole Cleanse | 60 min | $190 | 45-min full body massage, trigger point therapy, gentle stretch, firm pressure + 15-min foot massage, hot towels. | LMT arrives 30 minutes prior for setup. |
| Sole Cleanse | 90 min | $225 | 60-min full body massage, trigger point therapy, firm pressure, gentle stretch + 15-min foot soak, 15-min foot massage, foot exfoliant, hot towels. | LMT arrives 30 minutes prior for setup. |
| Sole Cleanse | 120 min | $300 | 90-min full body massage, trigger point therapy, hot stone therapy, firm pressure, gentle stretch + 15-min foot soak, 15-min foot massage, foot exfoliant, hot towels. | LMT arrives 30 minutes prior for setup. |
| Mama's Sole Relief | 60 min | $190 | 45-minute full-body massage alleviating weight-bearing joints, light to firm pressure + 15-min foot massage, hot towels. | 2nd & 3rd trimester clients. LMT arrives 30 minutes prior for setup. |
| Mama's Sole Relief | 90 min | $225 | 60-min full body massage alleviating weight-bearing joints, gentle trigger point therapy, light to firm pressure + 15-min foot soak, 15-min foot massage, foot exfoliant, hot towels. | 2nd & 3rd trimester clients. LMT arrives 30 minutes prior for setup. |
| Recovery Lounge | per hour, 3-hour minimum | $190/hr | Therapeutic 15-minute or 20-minute massages in a specialized chair, fully clothed, improving mobility within your scalp, neck, back & shoulders. Convenient for corporate events, community events, and special events. | Minimum 3 hours, additional LMTs available upon request, arrives 30 minutes prior for setup. |
| Foot Loose | per hour, 3-hour minimum | $190/hr | Foot massages for overworked feet, reducing chronic tension throughout your body + improving posture. Convenient for corporate events, community events, and special events. | Minimum 3 hours, additional licensed massage therapists available upon request, arrives 30 minutes prior for setup. |

**Add-on:** Foot soaks, $50/hr, for Foot Loose only ("Add foot soaks $50/hr.").

Group the services by family (Sole Cleanse, Mama's Sole Relief, Recovery Lounge, Foot Loose). Recovery Lounge and Foot Loose are **events**.

On an existing database, the two Nov 12, 2026 description changes (Mama's Sole Relief 60 and Foot Loose) are applied on startup, but only where the old wording is still there unchanged, so her own admin edits are never overwritten.

**Weekly Deals (her text, Nov 12, 2026):**
> Weekly Deals: Mondays South Coast; Wednesdays Boston. $30 off 60-minute & 90-minute sessions. Not available for Recovery Lounge or Foot Loose services.

- Eligible: the 60-minute and 90-minute sessions of Sole Cleanse and Mama's Sole Relief only. Not the 120-minute Sole Cleanse, Recovery Lounge or Foot Loose.
- $30 off the total when the **appointment date** (not the booking date) is a Monday and the client's area is South Coast, or a Wednesday and the area is Boston. Rules are in section 8.
- Show her text as a "Weekly Deals" banner on Home and Services. The server builds it from the Settings, so with the default settings it is exactly her text. Hide it when Weekly Deals are off.
- This replaces the earlier generic "specials" feature, which is removed.

## 4. Her text: reservation policies

Heading: **Reservation policies**
- All reservations require a $75 deposit to secure reservation date & time.
- All deposits are non-refundable.
- Deposits are applied to remaining balance.
- Cancellations or rescheduled reservations require 24 hours' notice prior to service date.
- One-time deposit transfer for rescheduled reservations 24 hours prior to service date.
- Same-day cancellations forfeit the deposit.

## 5. Her text: about

Heading: **Hello! I'm Kerimah, your licensed massage therapist.**

> My learning experience into holistic health started in 2011, earning credentials from The Salter School & The Costa Rica School of Massage Therapy. Licensed by the Commonwealth of Massachusetts, I am certified in reflexology and insured through Associated Bodywork & Massage Professionals.
>
> My great-grandfather was a massage therapist in Panama, and I am grateful to continue his journey through his talents. As an earth sign, my healing element is water. I enjoy good food, creative writing, sunrises, and swimming.

Credentials box, headed "About your LMT" (these restate her bio, so they're allowed): Licensed by the Commonwealth of Massachusetts · Certified in reflexology · Insured through Associated Bodywork & Massage Professionals · The Salter School · The Costa Rica School of Massage Therapy · Studying holistic health since 2011. Show them as a list, not joined with dots.

## 6. Pages

The header nav is Home, Services, About, Contact, plus a "Book now" button. Add a Shop link only when at least one product is active. Every page sets its own browser title ("Page | SoleScape Foot Spa & Massage") and meta description.

1. **Home (`/`)**
   - Hero: the headline "A complete sole to soul recovery experience." and her paragraph (section 3). Under the paragraph and above the buttons, her line "She travels to you" on its own line, styled as a short highlighted tagline (display font, gold left rule on sage), not body text. Buttons: "Book an appointment" and "See services and prices". Under them, a short list of her three lines: all services by your LMT at your home or workplace, all equipment provided, LMT arrives 30 minutes prior for setup.
   - Hero image: `chair-boston.jpg`, framed in the map-pin shape from her logo (a CSS mask with a thin gold ring). This is the site's signature visual.
   - "How it works": 3 numbered steps (Book online and pay the $75 deposit → she comes to you, arriving 30 minutes early with all equipment → relax and pay the balance; reschedule once online with 24 hours' notice). *Written by us.*
   - Her "Weekly Deals" banner (section 3) under the hero.
   - "Mobile services": one card per family showing her first description and "From $190" or "$190/hr". Each card links to that family on the Services page.
   - Photo gallery: foot-soak, hot-stones, back-massage, foot-massage, table-outdoors.
   - About teaser on espresso brown: her portrait, her heading and her first bio paragraph, and a "Read her story" button.
   - Closing call to action: "Wellness that comes to you." with buttons to Book and to Contact.
2. **Services (`/services`)**
   - Her intro (section 3), the "Weekly Deals" banner near the top, then "Mobile services" (massage families as cards, each length with its price and a Book button that opens `/book?service=<slug>`), with her note under each family.
   - "Events" section on a sage background: "Convenient for corporate events, community events, and special events." plus the Recovery Lounge and Foot Loose cards and the foot soak add-on.
   - "Reservation policies" (section 4), with anchor `#policies`.
   - "Questions": an FAQ using `<details>`, with answers built only from facts in this brief. Cover where she comes, equipment, arrival time, the deposit, rescheduling, pregnancy (Mama's Sole Relief is for the 2nd and 3rd trimester) and events (3-hour minimum, extra LMTs on request). *Written by us.*
3. **About (`/about`)**
   - Portrait and her heading, her bio (section 5), the credentials box, and a "Book with Kerimah" button.
   - A "Why mobile" band with `table-outdoors.jpg`. *Written by us; keep it to facts: she brings everything, sets up 30 minutes early, and comes to your home, office or event.*
4. **Contact (`/contact`)**
   - Text or call, email, Instagram, the service area ("Your home or workplace, Boston to the South Coast"), and appointment hours pulled from the API.
   - A message form: name, email, optional phone, topic (appointment question / event or workplace booking / something else) and message. Add a hidden honeypot field for spam.
   - The message is saved, emailed to her, and appears in an admin Messages inbox.
5. **Book (`/book`)**: see section 8.
6. **Your appointment (`/booking/:token`)**: the confirmation page the client reaches after paying. It's also linked in their email. Shows service, date, time, arrival time, address, total, deposit paid and balance. Actions: "Add to my calendar" (.ics), "Reschedule" and "Cancel appointment" (rules in section 8).
7. **Shop (`/shop`), Cart (`/cart`) and Order confirmation (`/order/:token`)**: built, but hidden from the nav until she adds a product in the admin.
8. **Admin (`/admin`)**: see section 9.

**Footer** (dark green): the logo with "Wellness that comes to you."; links to Services, About, Reservation policies and Book; contact details; "At your home or workplace, Boston to the South Coast. Licensed by the Commonwealth of Massachusetts, insured through ABMP."; "© {year} SoleScape Foot Spa & Massage" and a small "Owner sign in" link.

**On phones:** a fixed "Book an appointment" pill stays at the bottom of every page except the booking, payment and confirmation pages.

Add JSON-LD (`HealthAndBeautyBusiness`) to `index.html` with her name, phone, email, logo, image, area served, price range "$190-$300", and her Instagram as `sameAs`. Add Open Graph tags too.

## 7. Design

- **Colors:** green and coffee brown, taken from her logo.
  - `--forest #1f4a2f` (header, primary buttons)
  - `--forest-deep #143220` (footer)
  - `--coffee #6a4329` (prices, accents, outline buttons)
  - `--espresso #3a2416` (headings, the about band)
  - `--foam #f8f3ea` (page background)
  - `--paper #fffdf8` (cards, inputs)
  - `--sage #e4e8d6` (light panels)
  - `--olive #7d8f5f`
  - `--gold #b5852f` (thin rings, focus outline)
  - `--line #ddd0bd`
  - `--ink #2b1d13`
  - `--muted #6a5a4b`
- **Type:** Young Serif for headings, Figtree for body, both self-hosted through `@fontsource/young-serif` and `@fontsource-variable/figtree`.
- **Style:** sentence case, warm and plain. No all-caps labels, no fake stats, no stock icons, and no "→" arrows on buttons. Cards have a 5px colored top border (green, coffee or olive) instead of drop shadows.
- **Quality bar:**
  - No horizontal scroll at 375px wide.
  - Visible keyboard focus.
  - Every input has a label.
  - Alt text on every image.
  - Respect `prefers-reduced-motion`.
  - Lazy-load images below the fold.
  - Plain CSS in one `styles.css`; no CSS framework.

## 8. Booking and payment rules

**Booking flow on `/book`:**
1. Choose a service, grouped by family.
2. For hourly events, pick the number of hours (min 3, max 8), the optional add-on (foot soaks, $50/hr), and the checkbox "I'd like more than one therapist. Kerimah will confirm availability and pricing." That checkbox is a request only and isn't priced.
3. Pick a date and time.
   - First a required **Area** choice: "Boston area", "South Coast" or "Other". The Weekly Deal applies automatically when the day and area match.
   - A month calendar shows only days with openings, and the chosen day shows its open times. Show "Kerimah arrives at {time} to set up."
   - When the chosen service and area qualify for a Weekly Deal, mark those open days (Mondays for South Coast, Wednesdays for Boston) with a small "$30 off" tag. The server says which days qualify.
4. Enter details:
   - Where: "My home" or "My workplace or event venue"
   - Street address (required), full name, email and mobile phone
   - Notes for parking or access
   - For Mama's Sole Relief, a required checkbox: "I'm in my 2nd or 3rd trimester."
   - Her policies list and a required checkbox: "I agree to the reservation policies".
5. Pay the deposit. A sticky summary shows the total, "Deposit today", and "Due at appointment". With a Weekly Deal it shows "Regular price", "Weekly Deal −$30" and the new total.

**Rules that must hold:**
- **Money:** store integer cents. The **server** calculates every total and deposit; never trust prices sent by the browser.
- **Deposit:** a flat **$75** per reservation (an admin setting), capped at the total. A per-service override is optional.
- **Weekly Deals:**
  - The server alone decides and calculates the deal from the service, the area and the appointment date (in Boston time). Anything the browser sends about prices or discounts is ignored.
  - The deposit stays $75 and is applied to the balance; a discount never takes the total below the deposit. Discounts never stack: if two could apply, the larger wins.
  - Save on each booking the area, the regular price, whether the deal was applied (`discount_kind = "weekly_deal"`) and the amount, so later setting changes never alter past bookings.
  - Rescheduling (by the client or by her in the admin) recalculates the deal for the new date and the booking's area. The client sees the new total (regular price, Weekly Deal line if any, total, deposit paid and balance) before confirming. Phone bookings, where she set the total herself, are not repriced.
  - The summary, the confirmation page and the emails show the regular price, "Weekly Deal −$30" and the new total. Her emails also show the area.
- **Calendar blocking:** each booking blocks the calendar from 30 minutes before the start (setup, adjustable per service) until the end. A travel buffer between bookings (default 30 min, an admin setting) applies between appointments, but not around time off.
- **Hours:** setup and session must both fit inside working hours. Default hours: Mon, Tue and Thu 11:00–19:00; Wed 11:30–19:00; Fri and Sat 10:00–18:00; Sun closed. She edits them in the admin.
- **Booking window:** minimum notice 24 hours, booking up to 90 days ahead, start times every 30 minutes. All are admin settings.
- **No double booking**, even when two people submit at the same moment. Before checking availability at write time, take a lock: a one-row `calendar_lock` table that each writer UPDATEs first, which works on both SQLite and Postgres.
- **Holds during checkout:** a submitted booking holds the slot for 35 minutes. The Stripe Checkout session expires at 31 minutes, so it always closes first. If the client cancels checkout, release the hold right away; expired holds free themselves.
- **Webhooks:** verify the signature and make them idempotent. If a payment arrives for a slot someone else took after the hold expired, mark it `payment_conflict`, show it in red in the admin, and email her. Never drop it silently.
- **Rescheduling by the client:** allowed once (`reschedule_count == 0`), only while the appointment is confirmed and at least 24 hours away (an admin setting). The new time is checked with the same rules, ignoring the booking's own current slot. The deposit carries over.
- **Cancellation by the client:** allowed any time before the start. The confirm step says "Your $75 deposit is non-refundable." and offers rescheduling instead when that's still allowed. Record `cancelled_by = client`.
- **Time zones:** store UTC, display America/New_York, and stay correct across daylight saving.
- **Demo mode:** with no Stripe keys, a test-payment page stands in for Stripe and a banner says "Demo mode: no real payments are taken." It must be impossible to reach in production.
- **Emails:** sent on confirmation, reschedule, cancellation, a new order, a payment conflict and a contact message, to the client and/or to her. A failed email must never break a booking or a payment. With no SMTP settings, emails are only logged.
- **Calendar:** each confirmation page offers an .ics download. She also gets a private, secret-token .ics feed of her appointments, starting at arrival time, to subscribe to from her phone.
- **Rate limits:** booking 20/hour, reschedule and cancel 10/hour, contact 5/hour, and admin login 10 per 15 minutes, all per IP.

## 9. Admin (`/admin`)

Password sign-in using a server session cookie. The password comes from `ADMIN_PASSWORD`, compared with `hmac.compare_digest`. The admin has these screens:
- **Calendar:**
  - A month grid with appointment counts and time-off days marked.
  - Clicking a day lists its appointments: time, arrival time, service, hours, add-ons, client name, phone and email, home or workplace, address, the area the client chose (so she can check it against the address) with a "Weekly Deal" tag when it applied, notes, any extra-therapist request, and whether the client rescheduled or cancelled.
  - Actions: mark balance paid, mark completed, no-show, reschedule (with a collision check), cancel, and refund what's left of the deposit.
  - She can also add a phone or text booking on any day, with an optional area.
- **Messages:** contact form messages, with an unread count and mark read/unread.
- **Orders:** paid orders, with mark fulfilled and refund.
- **Services and products:**
  - Services: edit price (per hour for events), minutes or minimum hours, setup minutes and deposit override, and show/hide each one.
  - Products: add products with price, stock and a taxable flag. Adding an active product turns on the Shop.
- **Hours and time off:** weekly hours per day and time-off blocks.
- **Settings:**
  - Deposit amount ($), travel time, minimum notice, notice needed to reschedule, booking horizon and start-time step.
  - Sales tax % for taxable products, and the policies text (one per line, shown everywhere).
  - Weekly Deals: an on/off switch, the dollars off (default $30), and which day goes with each area (South Coast: Monday, Boston area: Wednesday by default, or "No deal").
  - The private calendar feed link, with a warning not to share it.

## 10. Tech stack and commands

- **Frontend:** React 18, Vite 5, React Router 6, plain CSS. `package.json` scripts: `"start": "vite"`, `"build": "vite build"`.
- **Vite dev server:** port 3000, `host: '0.0.0.0'`, `strictPort: true`, `allowedHosts: true`, and proxy `/api` to `http://127.0.0.1:5001`. For GitHub Codespaces, set `hmr: { clientPort: 443 }` when `process.env.CODESPACE_NAME` is set.
- **Backend:** Flask 3, Flask-SQLAlchemy (SQLAlchemy 2), Flask-Limiter, python-dotenv, stripe, gunicorn, psycopg2-binary, tzdata. pytest as a dev package.
- **Pipfile scripts:**
  ```toml
  [scripts]
  start = "flask --app api.app:create_app run --host 0.0.0.0 --port 5001 --debug"
  seed  = "flask --app api.app:create_app seed"
  test  = "pytest -q"
  ```
- **Running it locally**, two terminals from the project root:
  ```bash
  pipenv install --dev && pipenv run start   # API on :5001
  npm install && npm run start               # site on :3000
  ```
- **Database:** SQLite by default (`instance/solescape.db`), Postgres when `DATABASE_URL` is set (convert `postgres://` to `postgresql://`). On first start, create the tables and seed her services, add-on and hours automatically. `pipenv run seed` only fills an empty database.
- **Production:** `npm run build` makes `dist/`, which Flask serves with an SPA fallback, so one process serves everything:
  `pipenv run gunicorn "api.app:create_app()" --bind 0.0.0.0:$PORT --workers 2`.
  With `APP_ENV=production`:
  - Apply ProxyFix and secure cookies.
  - Refuse to start if `SECRET_KEY`, a non-default `ADMIN_PASSWORD`, `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing, or if `PUBLIC_URL` contains "localhost".
- **Environment (`.env.example`):** `APP_ENV`, `SECRET_KEY`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `BUSINESS_TIMEZONE=America/New_York`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `OWNER_EMAIL=solescapefootspa@gmail.com`.
- **Stripe webhook:** `POST /api/stripe/webhook`, handling `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Ignore events whose metadata isn't ours.

**Project layout:**
```
Pipfile  package.json  vite.config.js  index.html  .env.example  .gitignore  README.md
api/      app.py config.py extensions.py models.py seed.py availability.py public.py admin.py
          payments.py notify.py ics.py serializers.py
src/      main.jsx App.jsx api.js cart.jsx usePage.js styles.css
          components/ Calendar.jsx SlotPicker.jsx Services.jsx
          pages/      Home.jsx ServicesPage.jsx About.jsx Contact.jsx Book.jsx BookingDone.jsx
                      Shop.jsx Cart.jsx OrderDone.jsx DemoPay.jsx
          admin/      Admin.jsx AdminCalendar.jsx AdminMessages.jsx AdminOrders.jsx
                      AdminCatalog.jsx AdminSchedule.jsx AdminSettings.jsx
public/images/        (photos, see below)
tests/test_app.py
```

**Main API (all JSON under `/api`):**
- Public:
  - `GET config` (payment mode, deposit, policies, hours, shop_open)
  - `GET services` (each service says whether it's eligible for Weekly Deals)
  - `GET quote?service=&hours=&addons=&start_at=&area=` (regular price, discount, total and deposit, worked out by the server)
  - `GET availability?service=&hours=&addons=&month=YYYY-MM` (open days, the quote, and `deal_days`: which days have a Weekly Deal for which area) and `GET availability/day?...&date=` (open times). Both also accept `booking=<token>` for rescheduling.
  - `POST bookings`, `GET bookings/<token>`, `GET bookings/<token>/calendar.ics`
  - `POST bookings/<token>/release`, `.../reschedule` and `.../cancel`
  - `GET bookings/<token>/reschedule-quote?start_at=` (the new total before the client confirms a reschedule)
  - `POST messages`, `GET products`, `POST orders`, `GET orders/<token>`
  - `POST stripe/webhook`, `GET calendar/<secret>.ics`
- Admin, under `/api/admin`:
  - `login`, `logout`, `me`
  - `calendar`, `bookings` (create and patch), `bookings/<id>/refund`
  - `messages`, `orders`
  - `catalog`, `services`, `addons`, `products`
  - `schedule`, `hours`, `time-off`, `settings`

## 11. Photos (in `public/images/`)

Resize them (longest side about 1000–1200px, JPEG quality around 80) and **strip EXIF/GPS data**.

| File | What it shows | Where it's used |
|---|---|---|
| `chair-boston.jpg` | Her massage chair by a window high above Boston Common | Home hero, in the pin frame; Open Graph image |
| `kerimah.jpg` | Her headshot (small, about 278px wide; show it in a circle with a gold ring, at most 240px) | Home about teaser, About page |
| `logo.png` (320px) and `logo-small.png` (128px) | Her round SoleScape logo | Header (52px, in a circle), footer, favicon |
| `foot-soak.jpg` | An herbal foot soak melt held over a foot bath | Home gallery |
| `hot-stones.jpg` | Hot stones on a client's back | Home gallery |
| `back-massage.jpg` | Hands on a client's upper back | Home gallery (can hide on phones) |
| `foot-massage.jpg` | Foot reflexology | Home gallery |
| `table-outdoors.jpg` | Her massage table on a lawn | Home gallery, About "Why mobile" |
| `arriving.jpg` | Her packed chair at a downtown hotel entrance | Not used for now: the "Canopy Boston Downtown" mat is clearly readable, so ask before using it |

## 12. Tests (`pipenv run test` must pass)

Cover at least:
- Seeded prices and her Nov 12 wording match section 3. Service descriptions show on the Services page, the Home cards and the booking page.
- Weekly Deals:
  - $30 off only on Monday + South Coast or Wednesday + Boston, by appointment date.
  - Only the 60- and 90-minute Sole Cleanse and Mama's Sole Relief.
  - Area is required.
  - The browser can't apply the discount.
  - The deal is saved on the booking, and later setting changes don't alter it.
  - Rescheduling recalculates it and shows the new total first.
  - The emails show the lines.
  - Settings are validated.
- The $75 deposit and balance math.
- Setup plus travel buffer: on a Tuesday, the first slot is 11:30 with arrival at 11:00. After booking it, the next open slot is 1:30 PM.
- Hourly pricing: Foot Loose for 3 hours with soaks is $720. Under 3 hours is rejected.
- The add-on applies only to its own service.
- The trimester confirmation is required.
- The browser can't set prices.
- Sunday is closed, and minimum notice is enforced.
- Holds block a slot and then expire. Releasing a hold frees the slot.
- 12 simultaneous requests for one slot result in exactly one success.
- Contact details are validated.
- Client reschedule works once, is refused a second time, and is refused inside 24 hours.
- Client cancel frees the slot and keeps the deposit.
- Time off removes slots, and the daylight-saving boundary is handled.
- The shop turns on when a product is added.
- Admin routes need a login. The deposit setting works. Manual bookings respect setup time.
- The calendar feed is private.
- Contact messages reach the admin, and the honeypot drops bots.
- Stripe:
  - A signed webhook confirms a booking once.
  - A bad signature is rejected.
  - Foreign events are ignored.
  - An expired session releases its hold.
  - A late payment on a taken slot is flagged `payment_conflict`.
  - A Stripe failure releases the slot.
  - Demo pay is disabled when Stripe keys are set.
  - Production refuses unsafe config.

## 13. Still to confirm with Kerimah

Treat these as open. Don't guess.
1. Her real working hours (the defaults come from her old MassageBook listing).
2. Pricing for additional therapists, and whether there's a travel fee.
3. Whether events can be booked outside normal hours.
4. Whether the hot stone, back massage and foot massage photos are hers or licensed stock.
5. Whether to bring back the Senior Foot Health program from her old site, and whether to link her LinkedIn.
6. Whether she keeps MassageBook during the switch. If so, block those times so nobody is double-booked.
7. Whether she has products to sell.

## 14. How to work with me

- Work in small steps, and tell me exactly what to run to see each change.
- Read existing code before changing it.
- Give me complete files, or exact patches with file paths.
- Keep `pipenv run test` passing and add a test for every behavior change.
- Say plainly when something is untested or a business fact is unknown.
- At the end of each answer, list any customer-facing text you wrote that isn't hers.
