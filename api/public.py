import hashlib
import hmac
import logging
import re
from datetime import date, datetime, timedelta

import stripe
from flask import Blueprint, Response, abort, current_app, jsonify, request

from . import ics, notify, payments, pricing
from .availability import (BLOCKING, date_label, iso_utc, lock_calendar, month_bounds, slot_is_open,
                           slots_between, time_label, to_utc)
from .extensions import limiter
from .models import (AddOn, Booking, Message, Order, OrderItem, Product, Service, WeeklyHours, db, deposit_default_cents,
                     get_int_setting, get_setting, utcnow)
from .serializers import addon_json, booking_public, order_public, product_json, service_json

log = logging.getLogger("solescape.api")
bp = Blueprint("public", __name__, url_prefix="/api")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TEXT_HER = "Text 617.297.8564"
CODE_INVALID = "That corporate code isn't valid. Check it with your company, or leave it blank."


class QuoteError(ValueError):
    pass


def fail(message, code=400, field=None):
    payload = {"error": message}
    if field:
        payload["field"] = field
    return jsonify(payload), code


def clean(data, key, limit=200):
    return str(data.get(key) or "").strip()[:limit]


def contact_error(data):
    if len(clean(data, "name")) < 2:
        return "Enter your full name.", "name"
    if not EMAIL_RE.match(clean(data, "email")):
        return "Enter a valid email address.", "email"
    if len(re.sub(r"\D", "", clean(data, "phone"))) < 10:
        return "Enter a 10-digit phone number.", "phone"
    return None


def feed_token():
    key = current_app.config["SECRET_KEY"].encode()
    return hmac.new(key, b"calendar-feed", hashlib.sha256).hexdigest()[:40]


def parse_start(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)


def selected_addons(raw, service):
    ids = [int(x) for x in raw if str(x).isdigit()]
    if not ids:
        return []
    return AddOn.query.filter(AddOn.id.in_(ids), AddOn.active.is_(True),
                              (AddOn.service_id == service.id) | (AddOn.service_id.is_(None))).all()


def get_bookable(slug):
    s = Service.query.filter_by(slug=slug).first()
    return s if s and s.bookable else None


def quote(service, addons, hours=None):
    """Returns (total_cents, minutes, deposit_cents, hours). Server-side only."""
    if service.hourly:
        try:
            hours = int(hours if hours not in (None, "") else service.min_hours)
        except (TypeError, ValueError):
            raise QuoteError("Choose how many hours.")
        if hours < service.min_hours or hours > (service.max_hours or 12):
            raise QuoteError(f"{service.name} is booked for {service.min_hours} to {service.max_hours or 12} hours.")
        total = service.price_cents * hours + sum(a.price_cents * (hours if a.per_hour else 1) for a in addons)
        minutes = hours * 60
    else:
        hours = None
        total = service.price_cents + sum(a.price_cents for a in addons)
        minutes = service.duration_min + sum(a.extra_min or 0 for a in addons)
    return total, minutes, pricing.deposit_for(service, total), hours


@bp.get("/config")
def config():
    hours = {r.weekday: r for r in WeeklyHours.query.all()}
    return jsonify(
        payment_mode="demo" if payments.demo_mode() else "stripe",
        deposit_cents=deposit_default_cents(),
        policies=[p for p in get_setting("policies").splitlines() if p.strip()],
        notice_hours=get_int_setting("notice_hours"),
        lead_hours=get_int_setting("lead_hours"),
        shop_open=Product.query.filter_by(active=True).count() > 0,
        special=pricing.special_public(pricing.active_special()),
        corporate=dict(description=get_setting("corporate_description").strip()) if pricing.corporate_live() else None,
        hours=[dict(weekday=d, opens=hours[d].opens, closes=hours[d].closes) for d in sorted(hours)],
    )


@bp.get("/services")
def services():
    rows = Service.query.filter_by(active=True).order_by(Service.sort_order).all()
    addons = AddOn.query.filter_by(active=True).all()
    sp = pricing.active_special()
    out = []
    for s in rows:
        row = service_json(s)
        if sp and s.id in (sp.service_ids or []) and s.price_cents:
            row["sale"] = dict(price_cents=pricing.sale_price(sp, s), terms=pricing.special_terms(sp))
        out.append(row)
    return jsonify(services=out, addons=[addon_json(a) for a in addons])


@bp.get("/quote")
@limiter.limit("300 per hour")
def price_quote():
    """Price breakdown for the booking form: regular price, any discount, total and deposit."""
    s = get_bookable(request.args.get("service", ""))
    if not s:
        return fail("That service can't be booked online.", 404)
    addons = selected_addons(request.args.get("addons", "").split(","), s)
    try:
        regular, _, _, hours = quote(s, addons, request.args.get("hours"))
    except QuoteError as e:
        return fail(str(e), field="hours")
    try:
        start = parse_start(request.args["start_at"]) if request.args.get("start_at") else None
    except ValueError:
        start = None
    code = request.args.get("code", "")
    company = pricing.find_company(code) if code and s.category == "event" and pricing.corporate_live() else None
    if code and s.category == "event" and not company:
        return fail(CODE_INVALID, field="corporate_code")
    out = pricing.price(s, addons, hours, regular, start, company)
    out.pop("company_id")
    out.pop("special_id")
    return jsonify({**out, "company_name": company.name if company else None})


def _availability_args():
    """Either a service being booked, or an existing booking being rescheduled."""
    token = request.args.get("booking")
    if token:
        b = Booking.query.filter_by(token=token).first()
        if not b:
            return None
        minutes = int((b.end_at - b.start_at).total_seconds() // 60)
        setup = int((b.start_at - b.block_start_at).total_seconds() // 60)
        return dict(minutes=minutes, setup=setup, exclude=b.id, quote=None)
    s = get_bookable(request.args.get("service", ""))
    if not s:
        return None
    addons = selected_addons(request.args.get("addons", "").split(","), s)
    total, minutes, deposit, hours = quote(s, addons, request.args.get("hours"))
    return dict(minutes=minutes, setup=s.setup_min, exclude=None,
                quote=dict(total_cents=total, duration_min=minutes, deposit_cents=deposit, hours=hours))


@bp.get("/availability")
def availability_month():
    try:
        args = _availability_args()
    except QuoteError as e:
        return fail(str(e), field="hours")
    if not args:
        return fail("That service can't be booked online.", 404)
    try:
        first, last = month_bounds(request.args.get("month", ""))
    except (ValueError, TypeError):
        return fail("Use a month like 2026-11.")
    days = slots_between(first, last, args["minutes"], args["setup"], args["exclude"])
    return jsonify(days={d.isoformat(): len(v) for d, v in days.items()}, **(args["quote"] or {}))


@bp.get("/availability/day")
def availability_day():
    try:
        args = _availability_args()
    except QuoteError as e:
        return fail(str(e), field="hours")
    if not args:
        return fail("That service can't be booked online.", 404)
    try:
        day = date.fromisoformat(request.args.get("date", ""))
    except ValueError:
        return fail("Use a date like 2026-11-20.")
    starts = slots_between(day, day, args["minutes"], args["setup"], args["exclude"])[day]
    return jsonify(date_label=date_label(to_utc(datetime(day.year, day.month, day.day, 12))),
                   slots=[dict(start_at=iso_utc(x), label=time_label(x),
                               arrival_label=time_label(x - timedelta(minutes=args["setup"])))
                          for x in starts])


@bp.post("/bookings")
@limiter.limit("20 per hour")
def create_booking():
    data = request.get_json(silent=True) or {}
    s = get_bookable(clean(data, "service"))
    if not s:
        return fail("That service can't be booked online.", 404)
    err = contact_error(data)
    if err:
        return fail(err[0], field=err[1])
    location = "workplace" if data.get("location_type") == "workplace" else "home"
    address = clean(data, "address", 400)
    if len(address) < 8:
        return fail("Enter the street address where Kerimah should come.", field="address")
    if s.confirm_text and not data.get("confirmed_requirement"):
        return fail(f"Confirm this to book {s.family}: {s.confirm_text}", field="confirmed_requirement")
    if not data.get("agreed_policy"):
        return fail("Agree to the reservation policies to continue.", field="agreed_policy")
    try:
        start = parse_start(clean(data, "start_at"))
    except ValueError:
        return fail("Choose a time.", field="start_at")

    email = clean(data, "email", 160).lower()
    if s.first_time_only and Booking.query.filter(
            Booking.customer_email == email, Booking.status.in_(("confirmed", "completed"))).first():
        return fail(f"{s.name} is for first-time clients.", 409, "service")

    addons = selected_addons(data.get("addon_ids") or [], s)
    try:
        regular, minutes, _, hours = quote(s, addons, data.get("hours"))
    except QuoteError as e:
        return fail(str(e), field="hours")
    unit = lambda a: a.price_cents * (hours if a.per_hour and hours else 1)  # noqa: E731
    company = None
    code = clean(data, "corporate_code", 40)
    if code and s.category == "event":
        company = pricing.find_company(code) if pricing.corporate_live() else None
        if not company:
            return fail(CODE_INVALID, field="corporate_code")

    lock_calendar()  # also serializes claims on a company's earned reward
    if not slot_is_open(start, minutes, s.setup_min):
        db.session.rollback()
        return fail("That time was just taken. Choose another.", 409, "start_at")
    p = pricing.price(s, addons, hours, regular, start, company)
    b = Booking(service_id=s.id, service_name=s.name, hours=hours,
                addons=[dict(name=a.name, price_cents=unit(a)) for a in addons],
                block_start_at=start - timedelta(minutes=s.setup_min), start_at=start,
                end_at=start + timedelta(minutes=minutes), status="held",
                hold_expires_at=utcnow() + timedelta(minutes=get_int_setting("hold_min")),
                customer_name=clean(data, "name"), customer_email=email,
                customer_phone=clean(data, "phone", 40), location_type=location, address=address,
                extra_therapists=bool(data.get("extra_therapists")) and s.category == "event",
                notes=clean(data, "notes", 1000), total_cents=p["total_cents"], deposit_cents=p["deposit_cents"],
                regular_cents=p["regular_cents"], discount_cents=p["discount_cents"],
                discount_kind=p["discount_kind"], discount_label=p["discount_label"],
                special_id=p["special_id"], company_id=p["company_id"])
    db.session.add(b)
    db.session.commit()

    try:
        session_id, url = payments.start_booking_checkout(b)
    except Exception:
        log.exception("Could not start checkout for booking %s", b.id)
        b.status = "cancelled"
        db.session.commit()
        return fail(f"Payment could not be started, so your time was released. Try again, or {TEXT_HER.lower()}.", 502)
    b.stripe_session_id = session_id
    db.session.commit()
    return jsonify(token=b.token, checkout_url=url), 201


@bp.get("/bookings/<token>")
def get_booking(token):
    return jsonify(booking_public(Booking.query.filter_by(token=token).first_or_404()))


@bp.get("/bookings/<token>/calendar.ics")
def booking_ics(token):
    b = Booking.query.filter_by(token=token).first_or_404()
    body = ics.calendar([ics.event(b, f"{b.service_name} with Kerimah",
                                   f"Kerimah arrives at {time_label(b.block_start_at)} to set up.", b.address)])
    return Response(body, mimetype="text/calendar",
                    headers={"Content-Disposition": "attachment; filename=solescape-appointment.ics"})


@bp.post("/bookings/<token>/release")
def release_booking(token):
    """Client backed out of checkout: free the time now."""
    b = Booking.query.filter_by(token=token).first_or_404()
    if b.status == "held":
        b.status = "cancelled"
        db.session.commit()
        payments.expire_session(b.stripe_session_id)
    return jsonify(status=b.status)


@bp.post("/bookings/<token>/reschedule")
@limiter.limit("10 per hour")
def reschedule_booking(token):
    """Her policy: one deposit transfer, with at least 24 hours' notice."""
    b = Booking.query.filter_by(token=token).first_or_404()
    info = booking_public(b)
    if b.status != "confirmed" or b.start_at <= utcnow():
        return fail(f"This appointment can't be changed online. {TEXT_HER}.", 409)
    if b.reschedule_count >= 1:
        return fail(f"This appointment has already been rescheduled once, which is the one deposit transfer "
                    f"allowed. {TEXT_HER} for help.", 409)
    if not info["can_reschedule"]:
        return fail(f"Rescheduling needs {info['notice_hours']} hours' notice. {TEXT_HER}.", 409)
    try:
        start = parse_start((request.get_json(silent=True) or {}).get("start_at", ""))
    except ValueError:
        return fail("Choose a new time.", field="start_at")
    minutes = int((b.end_at - b.start_at).total_seconds() // 60)
    setup = int((b.start_at - b.block_start_at).total_seconds() // 60)
    old_when = f"{date_label(b.start_at)} at {time_label(b.start_at)}"
    lock_calendar()
    if not slot_is_open(start, minutes, setup, exclude_id=b.id):
        db.session.rollback()
        return fail("That time was just taken. Choose another.", 409, "start_at")
    b.block_start_at = start - timedelta(minutes=setup)
    b.start_at, b.end_at = start, start + timedelta(minutes=minutes)
    b.reschedule_count += 1
    db.session.commit()
    notify.booking_rescheduled(b, old_when)
    return jsonify(booking_public(b))


@bp.post("/bookings/<token>/cancel")
@limiter.limit("10 per hour")
def cancel_booking(token):
    b = Booking.query.filter_by(token=token).first_or_404()
    if b.status != "confirmed" or b.start_at <= utcnow():
        return fail(f"This appointment can't be cancelled online. {TEXT_HER}.", 409)
    b.status = "cancelled"
    b.cancelled_by = "client"
    db.session.commit()
    notify.booking_cancelled(b)
    return jsonify(booking_public(b))


TOPICS = ("question", "event", "other")


@bp.post("/messages")
@limiter.limit("5 per hour")
def send_message():
    data = request.get_json(silent=True) or {}
    if data.get("website"):  # hidden field only bots fill in
        return jsonify(ok=True), 201
    if len(clean(data, "name")) < 2:
        return fail("Enter your name.", field="name")
    if not EMAIL_RE.match(clean(data, "email")):
        return fail("Enter a valid email address.", field="email")
    body = clean(data, "message", 3000)
    if len(body) < 5:
        return fail("Write a short message.", field="message")
    topic = clean(data, "topic", 40)
    m = Message(name=clean(data, "name"), email=clean(data, "email", 160).lower(), phone=clean(data, "phone", 40),
                topic=topic if topic in TOPICS else "other", body=body)
    db.session.add(m)
    db.session.commit()
    notify.message_received(m)
    return jsonify(ok=True), 201


@bp.get("/products")
def products():
    rows = Product.query.filter_by(active=True).order_by(Product.sort_order).all()
    return jsonify(products=[product_json(p) for p in rows])


@bp.post("/orders")
@limiter.limit("20 per hour")
def create_order():
    data = request.get_json(silent=True) or {}
    err = contact_error(data)
    if err:
        return fail(err[0], field=err[1])
    lines = data.get("items") or []
    if not lines:
        return fail("Your cart is empty.")
    subtotal = taxable = 0
    order = Order(customer_name=clean(data, "name"), customer_email=clean(data, "email", 160).lower(),
                  customer_phone=clean(data, "phone", 40), notes=clean(data, "notes", 1000),
                  subtotal_cents=0, total_cents=0)
    for line in lines:
        try:
            pid, qty = int(line.get("product_id")), int(line.get("qty"))
        except (TypeError, ValueError, AttributeError):
            return fail("One of the items in your cart isn't valid.")
        p = db.session.get(Product, pid)
        if not p or not p.active:
            return fail("One of the items in your cart is no longer available.")
        if qty < 1 or qty > 50:
            return fail(f"Choose a quantity between 1 and 50 for {p.name}.")
        if p.stock is not None and p.stock < qty:
            return fail(f"Only {p.stock} of {p.name} left.")
        order.items.append(OrderItem(product_id=p.id, name=p.name, unit_cents=p.price_cents, qty=qty))
        subtotal += p.price_cents * qty
        if p.taxable:
            taxable += p.price_cents * qty
    order.subtotal_cents = subtotal
    order.tax_cents = round(taxable * float(get_setting("tax_percent") or 0) / 100)
    order.total_cents = subtotal + order.tax_cents
    db.session.add(order)
    db.session.commit()
    try:
        session_id, url = payments.start_order_checkout(order)
    except Exception:
        log.exception("Could not start checkout for order %s", order.id)
        order.status = "cancelled"
        db.session.commit()
        return fail(f"Payment could not be started. Try again, or {TEXT_HER.lower()}.", 502)
    order.stripe_session_id = session_id
    db.session.commit()
    return jsonify(token=order.token, checkout_url=url), 201


@bp.get("/orders/<token>")
def get_order(token):
    return jsonify(order_public(Order.query.filter_by(token=token).first_or_404()))


@bp.post("/demo/pay/<kind>/<token>")
def demo_pay(kind, token):
    if not payments.demo_mode() or current_app.config["APP_ENV"] == "production":
        abort(404)
    if kind == "booking":
        b = Booking.query.filter_by(token=token).first_or_404()
        payments.mark_booking_paid(token, b.deposit_cents, None)
    elif kind == "order":
        payments.mark_order_paid(token, None)
    else:
        abort(404)
    return jsonify(ok=True)


@bp.post("/stripe/webhook")
def stripe_webhook():
    secret = current_app.config["STRIPE_WEBHOOK_SECRET"]
    if not secret:
        abort(404)
    try:
        event = stripe.Webhook.construct_event(request.get_data(), request.headers.get("Stripe-Signature", ""), secret)
    except (ValueError, stripe.SignatureVerificationError):
        return fail("Invalid signature.", 400)
    payments.handle_event(event)
    return jsonify(received=True)


@bp.get("/calendar/<token>.ics")
def calendar_feed(token):
    """Private feed for her phone calendar. Events start when she needs to arrive."""
    if not hmac.compare_digest(token, feed_token()):
        abort(404)
    since = utcnow() - timedelta(days=60)
    rows = Booking.query.filter(Booking.status.in_(BLOCKING), Booking.start_at >= since).all()
    events = [ics.event(b, f"{b.service_name}: {b.customer_name}",
                        f"Arrive {time_label(b.block_start_at)} to set up, session {time_label(b.start_at)}\n"
                        f"Phone: {b.customer_phone}\n{b.notes or ''}", b.address, from_arrival=True)
              for b in rows]
    return Response(ics.calendar(events, "SoleScape appointments"), mimetype="text/calendar")
