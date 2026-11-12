import hmac
import re
from datetime import date, datetime, time, timedelta
from functools import wraps

from flask import Blueprint, current_app, jsonify, request, session
from sqlalchemy import or_

from . import payments, pricing
from .availability import (BLOCKING, iso_utc, date_label, lock_calendar, month_bounds, overlapping_appointments,
                           recurring_occurrences, still_free, time_label, to_local, to_utc)
from .extensions import limiter
from .models import (AddOn, Booking, Company, DEFAULT_SETTINGS, Message, Order, Product, RecurringBlock, Service,
                     TimeOff, WeeklyHours, db, deposit_default_cents, get_setting, set_setting, utcnow)
from .public import clean, contact_error, fail, feed_token
from .serializers import (addon_json, booking_admin, order_admin, product_json, service_json)

bp = Blueprint("admin", __name__, url_prefix="/api/admin")
HM_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def admin_required(fn):
    @wraps(fn)
    def inner(*args, **kwargs):
        if not session.get("admin"):
            return fail("Sign in to continue.", 401)
        return fn(*args, **kwargs)
    return inner


@bp.post("/login")
@limiter.limit("10 per 15 minutes")
def login():
    password = str((request.get_json(silent=True) or {}).get("password") or "")
    if not hmac.compare_digest(password.encode(), current_app.config["ADMIN_PASSWORD"].encode()):
        return fail("That password isn't right.", 401)
    session.clear()
    session["admin"] = True
    return jsonify(ok=True)


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/me")
def me():
    return jsonify(admin=bool(session.get("admin")))


@bp.get("/calendar")
@admin_required
def calendar_month():
    try:
        first, last = month_bounds(request.args.get("month", ""))
    except (ValueError, TypeError):
        return fail("Use a month like 2026-11.")
    start = to_utc(datetime.combine(first, time.min))
    end = to_utc(datetime.combine(last + timedelta(days=1), time.min))
    now = utcnow()
    rows = (Booking.query.filter(Booking.start_at < end, Booking.end_at > start)
            .filter(or_(Booking.status != "held", Booking.hold_expires_at > now))
            .order_by(Booking.start_at).all())
    blocks = TimeOff.query.filter(TimeOff.start_at < end, TimeOff.end_at > start).order_by(TimeOff.start_at).all()
    return jsonify(bookings=[booking_admin(b) for b in rows], time_off=[timeoff_json(t) for t in blocks],
                   blocks=day_blocks(first, last, blocks, recurring_occurrences(start, end)))


def day_blocks(first, last, time_off, weekly):
    """Every block shown per local day, with the part of that day it covers."""
    out = []
    for t in time_off:
        day = max(first, to_local(t.start_at).date())
        while day <= min(last, to_local(t.end_at - timedelta(seconds=1)).date()):
            d0 = to_utc(datetime.combine(day, time.min))
            d1 = to_utc(datetime.combine(day + timedelta(days=1), time.min))
            s, e = max(t.start_at, d0), min(t.end_at, d1)
            whole = s == d0 and e == d1
            out.append(dict(kind="once", id=t.id, local_date=day.isoformat(), reason=t.reason, whole_day=whole,
                            label="All day" if whole else f"{time_label(s)} to {time_label(e)}",
                            span=timeoff_json(t)["label"]))
            day += timedelta(days=1)
    for r, s, e in weekly:
        out.append(dict(kind="weekly", id=r.id, local_date=to_local(s).date().isoformat(), reason=r.reason,
                        whole_day=False, label=f"{time_label(s)} to {time_label(e)}", span=weekly_label(r)))
    return sorted(out, key=lambda x: (x["local_date"], x["label"]))


def timeoff_json(t):
    first, last = to_local(t.start_at).date(), to_local(t.end_at - timedelta(seconds=1)).date()
    days = [(first + timedelta(days=i)).isoformat() for i in range((last - first).days + 1)]
    return dict(id=t.id, start_at=iso_utc(t.start_at), end_at=iso_utc(t.end_at), reason=t.reason,
                local_dates=days,
                label=f"{date_label(t.start_at)}, {time_label(t.start_at)} to "
                      f"{date_label(t.end_at)}, {time_label(t.end_at)}")


def parse_local(value):
    return to_utc(datetime.fromisoformat(value))


DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _hm_label(hm):
    return datetime.strptime(hm, "%H:%M").strftime("%-I:%M %p")


def weekly_label(r):
    until = f", until {r.ends_on.strftime('%B %-d, %Y')}" if r.ends_on else ""
    return (f"Every {DAY_NAMES[r.weekday]}, {_hm_label(r.start_hm)} to {_hm_label(r.end_hm)}, "
            f"from {r.starts_on.strftime('%B %-d, %Y')}{until}")


def weekly_json(r):
    return dict(id=r.id, weekday=r.weekday, start_hm=r.start_hm, end_hm=r.end_hm, reason=r.reason,
                starts_on=r.starts_on.isoformat(), ends_on=r.ends_on.isoformat() if r.ends_on else None,
                label=weekly_label(r))


def overlap_json(rows):
    return [dict(id=b.id, local_date=to_local(b.start_at).strftime("%Y-%m-%d"),
                 label=f"{date_label(b.start_at)}, {time_label(b.start_at)}: {b.service_name}, {b.customer_name}")
            for b in rows]


@bp.post("/bookings")
@admin_required
def manual_booking():
    """For clients who call or text. Deposit is whatever she already collected."""
    data = request.get_json(silent=True) or {}
    if len(clean(data, "name")) < 2:
        return fail("Enter the client's name.", field="name")
    s = db.session.get(Service, data.get("service_id") or 0)
    if not s:
        return fail("Choose a service.", field="service_id")
    try:
        start = parse_local(clean(data, "start_local"))
        minutes = int(data.get("duration_min") or s.duration_min or (s.min_hours or 0) * 60)
        total = int(data.get("total_cents") or (s.price_cents or 0) * (minutes // 60 if s.hourly else 1))
        deposit = int(data.get("deposit_paid_cents") or 0)
    except (ValueError, TypeError):
        return fail("Check the date, time and amounts.")
    if minutes <= 0:
        return fail("Enter how many minutes this appointment takes.", field="duration_min")
    area = clean(data, "area", 20)
    if area and area not in pricing.AREAS:
        return fail("Choose Boston area, South Coast or Other.", field="area")
    company = db.session.get(Company, int(data.get("company_id") or 0)) if data.get("company_id") else None
    if data.get("company_id") and not company:
        return fail("Company not found.", field="company_id")
    end = start + timedelta(minutes=minutes)
    block = start - timedelta(minutes=s.setup_min)
    lock_calendar()
    if not still_free(block, end) and not data.get("override"):
        db.session.rollback()
        return fail("That overlaps another appointment or its travel time.", 409, "start_local")
    b = Booking(service_id=s.id, service_name=s.name, addons=[], block_start_at=block, start_at=start, end_at=end,
                status="confirmed", hours=minutes // 60 if s.hourly else None,
                customer_name=clean(data, "name"), customer_email=clean(data, "email", 160).lower(),
                customer_phone=clean(data, "phone", 40), location_type="home", area=area or None,
                address=clean(data, "address", 400), notes=clean(data, "notes", 1000), total_cents=total,
                deposit_cents=deposit, deposit_paid_cents=deposit, deposit_paid_at=utcnow() if deposit else None,
                source="manual", regular_cents=total, discount_cents=0,
                company_id=company.id if company else None)
    db.session.add(b)
    db.session.commit()
    return jsonify(booking_admin(b)), 201


@bp.patch("/bookings/<int:bid>")
@admin_required
def update_booking(bid):
    b = db.session.get(Booking, bid)
    if not b:
        return fail("Booking not found.", 404)
    data = request.get_json(silent=True) or {}
    if "status" in data:
        if data["status"] not in ("confirmed", "completed", "cancelled", "no_show"):
            return fail("That status isn't valid.")
        if data["status"] == "confirmed" and b.status != "confirmed":
            lock_calendar()
            if not still_free(b.block_start_at, b.end_at, exclude_id=b.id):
                db.session.rollback()
                return fail("That time is taken. Move or cancel the other appointment first.", 409)
        b.status = data["status"]
        if b.status == "cancelled":
            b.cancelled_by = "owner"
    if "balance_paid" in data:
        b.balance_paid = bool(data["balance_paid"])
    if "admin_notes" in data:
        b.admin_notes = clean(data, "admin_notes", 2000)
    if "start_local" in data:
        try:
            start = parse_local(clean(data, "start_local"))
        except ValueError:
            return fail("Check the date and time.")
        end = start + (b.end_at - b.start_at)
        block = start - (b.start_at - b.block_start_at)
        lock_calendar()
        if not still_free(block, end, exclude_id=b.id):
            db.session.rollback()
            return fail("That overlaps another appointment, its setup or travel time.", 409)
        b.block_start_at, b.start_at, b.end_at = block, start, end
        pricing.apply_pricing(b, pricing.repriced(b, start))  # Weekly Deal follows the new date
        if b.status == "payment_conflict":
            b.status = "confirmed"
    db.session.commit()
    return jsonify(booking_admin(b))


@bp.post("/bookings/<int:bid>/refund")
@admin_required
def refund_booking(bid):
    b = db.session.get(Booking, bid)
    if not b:
        return fail("Booking not found.", 404)
    remaining = b.deposit_paid_cents - b.refunded_cents
    if remaining <= 0:
        return fail("There's nothing left to refund on this booking.")
    try:
        amount = int((request.get_json(silent=True) or {}).get("amount_cents") or remaining)
    except (TypeError, ValueError):
        return fail("Enter a valid amount.")
    if amount <= 0 or amount > remaining:
        return fail("The refund can't be more than what's left of the deposit.")
    try:
        payments.refund(b.stripe_payment_intent, amount)
    except Exception:
        return fail("Stripe couldn't process that refund. Check your Stripe dashboard.", 502)
    b.refunded_cents += amount
    db.session.commit()
    return jsonify(booking_admin(b))


@bp.get("/messages")
@admin_required
def messages():
    rows = Message.query.order_by(Message.created_at.desc()).limit(300).all()
    return jsonify(unread=Message.query.filter_by(read=False).count(), messages=[
        dict(id=m.id, name=m.name, email=m.email, phone=m.phone, topic=m.topic, body=m.body, read=m.read,
             created_label=f"{date_label(m.created_at)}, {time_label(m.created_at)}") for m in rows])


@bp.patch("/messages/<int:mid>")
@admin_required
def update_message(mid):
    m = db.session.get(Message, mid)
    if not m:
        return fail("Message not found.", 404)
    m.read = bool((request.get_json(silent=True) or {}).get("read", True))
    db.session.commit()
    return jsonify(ok=True)


@bp.get("/orders")
@admin_required
def orders():
    rows = Order.query.filter(Order.status != "pending").order_by(Order.created_at.desc()).limit(200).all()
    return jsonify(orders=[order_admin(o) for o in rows])


@bp.patch("/orders/<int:oid>")
@admin_required
def update_order(oid):
    o = db.session.get(Order, oid)
    if not o:
        return fail("Order not found.", 404)
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in ("paid", "fulfilled", "cancelled"):
        return fail("That status isn't valid.")
    o.status = status
    db.session.commit()
    return jsonify(order_admin(o))


@bp.post("/orders/<int:oid>/refund")
@admin_required
def refund_order(oid):
    o = db.session.get(Order, oid)
    if not o:
        return fail("Order not found.", 404)
    if not o.paid_at or o.status == "refunded":
        return fail("This order can't be refunded.")
    try:
        payments.refund(o.stripe_payment_intent, o.total_cents)
    except Exception:
        return fail("Stripe couldn't process that refund. Check your Stripe dashboard.", 502)
    o.status = "refunded"
    db.session.commit()
    return jsonify(order_admin(o))


def _money_or_none(value):
    if value in (None, ""):
        return None
    cents = int(value)
    if cents < 0:
        raise ValueError
    return cents


@bp.get("/catalog")
@admin_required
def catalog():
    return jsonify(services=[service_json(s) for s in Service.query.order_by(Service.sort_order).all()],
                   addons=[addon_json(a) for a in AddOn.query.all()],
                   products=[product_json(p) for p in Product.query.order_by(Product.sort_order).all()])


@bp.post("/services")
@admin_required
def create_service():
    data = request.get_json(silent=True) or {}
    name = clean(data, "name", 120)
    if len(name) < 2:
        return fail("Enter a service name.", field="name")
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if Service.query.filter_by(slug=slug).first():
        return fail("A service with that name already exists.", field="name")
    s = Service(slug=slug, name=name, family=name, category=clean(data, "category", 20) or "massage",
                pricing="hourly" if data.get("pricing") == "hourly" else "fixed",
                sort_order=(db.session.query(db.func.max(Service.sort_order)).scalar() or 0) + 1)
    db.session.add(s)
    return _apply_service(s, data, 201)


@bp.patch("/services/<int:sid>")
@admin_required
def update_service(sid):
    s = db.session.get(Service, sid)
    if not s:
        return fail("Service not found.", 404)
    return _apply_service(s, request.get_json(silent=True) or {}, 200)


def _apply_service(s, data, code):
    try:
        for key in ("price_cents", "deposit_cents", "duration_min", "min_hours", "max_hours", "setup_min"):
            if key in data:
                setattr(s, key, _money_or_none(data[key]))
    except (ValueError, TypeError):
        db.session.rollback()
        return fail("Prices and minutes must be whole positive numbers.")
    if s.setup_min is None:
        s.setup_min = 30
    for key in ("name", "family", "summary", "note", "confirm_text"):
        if key in data and data[key] is not None:
            setattr(s, key, clean(data, key, 1000))
    for key in ("active", "first_time_only"):
        if key in data:
            setattr(s, key, bool(data[key]))
    db.session.commit()
    return jsonify(service_json(s)), code


@bp.patch("/addons/<int:aid>")
@admin_required
def update_addon(aid):
    a = db.session.get(AddOn, aid)
    if not a:
        return fail("Add-on not found.", 404)
    data = request.get_json(silent=True) or {}
    try:
        if "price_cents" in data:
            a.price_cents = _money_or_none(data["price_cents"]) or 0
        if "extra_min" in data:
            a.extra_min = _money_or_none(data["extra_min"]) or 0
    except (ValueError, TypeError):
        return fail("Prices and minutes must be whole positive numbers.")
    if "active" in data:
        a.active = bool(data["active"])
    db.session.commit()
    return jsonify(addon_json(a))


@bp.post("/products")
@admin_required
def create_product():
    data = request.get_json(silent=True) or {}
    name = clean(data, "name", 120)
    if len(name) < 2:
        return fail("Enter a product name.", field="name")
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if Product.query.filter_by(slug=slug).first():
        return fail("A product with that name already exists.", field="name")
    p = Product(slug=slug, name=name, price_cents=0, active=False)
    db.session.add(p)
    return _apply_product(p, data, 201)


@bp.patch("/products/<int:pid>")
@admin_required
def update_product(pid):
    p = db.session.get(Product, pid)
    if not p:
        return fail("Product not found.", 404)
    return _apply_product(p, request.get_json(silent=True) or {}, 200)


def _apply_product(p, data, code):
    try:
        if "price_cents" in data:
            p.price_cents = _money_or_none(data["price_cents"]) or 0
        if "stock" in data:
            p.stock = _money_or_none(data["stock"])
    except (ValueError, TypeError):
        db.session.rollback()
        return fail("Prices and stock must be whole positive numbers.")
    for key in ("name", "summary"):
        if key in data and data[key] is not None:
            setattr(p, key, clean(data, key, 500))
    for key in ("active", "taxable"):
        if key in data:
            setattr(p, key, bool(data[key]))
    db.session.commit()
    return jsonify(product_json(p)), code


@bp.get("/schedule")
@admin_required
def schedule():
    hours = WeeklyHours.query.order_by(WeeklyHours.weekday).all()
    rows = TimeOff.query.filter(TimeOff.end_at > utcnow()).order_by(TimeOff.start_at).all()
    weekly = RecurringBlock.query.order_by(RecurringBlock.weekday, RecurringBlock.start_hm).all()
    today = to_local(utcnow()).date()
    return jsonify(hours=[dict(weekday=h.weekday, opens=h.opens, closes=h.closes) for h in hours],
                   time_off=[timeoff_json(t) for t in rows],
                   weekly=[weekly_json(r) for r in weekly if r.ends_on is None or r.ends_on >= today])


@bp.put("/hours")
@admin_required
def update_hours():
    for row in (request.get_json(silent=True) or {}).get("hours", []):
        h = db.session.get(WeeklyHours, row.get("weekday"))
        if not h:
            return fail("That day isn't valid.")
        opens, closes = row.get("opens") or None, row.get("closes") or None
        if opens or closes:
            if not (opens and closes and HM_RE.match(opens) and HM_RE.match(closes) and opens < closes):
                db.session.rollback()
                return fail("Each open day needs an opening time before its closing time.")
        h.opens, h.closes = opens, closes
    db.session.commit()
    return schedule()


@bp.post("/time-off")
@admin_required
def add_time_off():
    data = request.get_json(silent=True) or {}
    try:
        start, end = parse_local(clean(data, "start_local")), parse_local(clean(data, "end_local"))
    except ValueError:
        return fail("Enter a start and end.")
    if end <= start:
        return fail("The end has to be after the start.")
    t = TimeOff(start_at=start, end_at=end, reason=clean(data, "reason"))
    db.session.add(t)
    db.session.commit()
    # Appointments are never cancelled by a block. She is told, and decides.
    return jsonify({**timeoff_json(t), "overlaps": overlap_json(overlapping_appointments([(start, end)]))}), 201


@bp.post("/recurring-blocks")
@admin_required
def add_recurring_block():
    data = request.get_json(silent=True) or {}
    try:
        weekday = int(data.get("weekday"))
        starts_on = date.fromisoformat(clean(data, "starts_on")) if data.get("starts_on") else \
            to_local(utcnow()).date()
        ends_on = date.fromisoformat(clean(data, "ends_on")) if data.get("ends_on") else None
    except (TypeError, ValueError):
        return fail("Choose a day and check the dates.")
    start_hm, end_hm = clean(data, "start_time"), clean(data, "end_time")
    if not 0 <= weekday <= 6:
        return fail("Choose a day of the week.")
    if not (HM_RE.match(start_hm) and HM_RE.match(end_hm) and start_hm < end_hm):
        return fail("Enter a start time before the end time.")
    if ends_on and ends_on < starts_on:
        return fail("The end date has to be after the start date.")
    r = RecurringBlock(weekday=weekday, start_hm=start_hm, end_hm=end_hm, starts_on=starts_on, ends_on=ends_on,
                       reason=clean(data, "reason"))
    db.session.add(r)
    db.session.commit()
    upcoming = Booking.query.filter(Booking.status.in_(BLOCKING), Booking.end_at > utcnow())
    last = max([b.end_at for b in upcoming] or [utcnow()])
    hits = [(s, e) for _, s, e in recurring_occurrences(utcnow(), last + timedelta(days=1), [r])]
    return jsonify({**weekly_json(r), "overlaps": overlap_json(overlapping_appointments(hits))}), 201


@bp.delete("/recurring-blocks/<int:rid>")
@admin_required
def delete_recurring_block(rid):
    r = db.session.get(RecurringBlock, rid)
    if not r:
        return fail("Weekly block not found.", 404)
    db.session.delete(r)
    db.session.commit()
    return jsonify(ok=True)


@bp.delete("/time-off/<int:tid>")
@admin_required
def delete_time_off(tid):
    t = db.session.get(TimeOff, tid)
    if not t:
        return fail("Time off not found.", 404)
    db.session.delete(t)
    db.session.commit()
    return jsonify(ok=True)


@bp.get("/settings")
@admin_required
def settings():
    return jsonify(settings={k: get_setting(k) for k in DEFAULT_SETTINGS},
                   calendar_feed=f"{current_app.config['PUBLIC_URL']}/api/calendar/{feed_token()}.ics")


@bp.put("/settings")
@admin_required
def update_settings():
    data = request.get_json(silent=True) or {}
    numeric = {"deposit_dollars": (1, 1000), "buffer_min": (0, 240), "lead_hours": (0, 720),
               "notice_hours": (0, 168), "horizon_days": (1, 365), "slot_step_min": (5, 120),
               "hold_min": (35, 120), "tax_percent": (0, 25)}
    numeric.update(corporate_percent=(1, 100), corporate_every_n=(1, 100), corporate_nth_percent=(1, 100),
                   corporate_nth_hours=(1, 12))
    numeric.update(weekly_deal_dollars=(1, 500))
    days = ("",) + tuple(str(d) for d in range(7))
    choices = {"weekly_deal_enabled": ("0", "1"), "weekly_deal_south_coast_day": days,
               "weekly_deal_boston_day": days, "corporate_enabled": ("0", "1"),
               "corporate_reward_type": ("percent", "nth"), "corporate_nth_reward": ("percent", "hours")}
    labels = {"weekly_deal_dollars": "The Weekly Deal discount ($)", "corporate_percent": "The corporate discount", "corporate_every_n": "The number of events",
              "corporate_nth_percent": "The reward discount", "corporate_nth_hours": "The free hours"}
    for key, value in data.items():
        if key not in DEFAULT_SETTINGS:
            continue
        if key in choices:
            value = str(value)
            if value not in choices[key]:
                return fail(f"{labels.get(key, key)} isn't a valid choice.")
        if key in numeric:
            low, high = numeric[key]
            try:
                number = float(value)
            except (TypeError, ValueError):
                return fail(f"{key} must be a number.")
            if not low <= number <= high:
                return fail(f"{labels.get(key, key)} must be between {low} and {high}.")
        set_setting(key, str(value).strip())
    db.session.commit()
    return settings()


# Corporate clients

def company_json(c, history=False):
    rows = Booking.query.filter_by(company_id=c.id).order_by(Booking.start_at.desc()).all()
    now = utcnow()
    live = [b for b in rows if b.status != "held" or (b.hold_expires_at and b.hold_expires_at > now)]
    out = dict(id=c.id, name=c.name, contact_name=c.contact_name, email=c.email, phone=c.phone, notes=c.notes,
               code=c.code, active=c.active, progress=pricing.company_progress(c),
               booking_count=sum(1 for b in live if b.status in pricing.USED),
               spent_cents=sum(b.total_cents for b in live if b.status == "completed"),
               upcoming_count=sum(1 for b in live if b.status == "confirmed" and b.start_at > now))
    if history:
        out["bookings"] = [booking_admin(b) for b in live]
    return out


@bp.get("/companies")
@admin_required
def companies():
    rows = Company.query.order_by(Company.name).all()
    return jsonify(companies=[company_json(c, history=True) for c in rows],
                   program=dict(live=pricing.corporate_live(), enabled=get_setting("corporate_enabled") == "1",
                                reward_type=get_setting("corporate_reward_type"), terms=pricing.reward_terms(),
                                every_n=max(int(float(get_setting("corporate_every_n"))), 1)))


def _apply_company(c, data):
    for key, limit in (("name", 160), ("contact_name", 120), ("phone", 40), ("notes", 2000)):
        if key in data:
            setattr(c, key, clean(data, key, limit))
    if "email" in data:
        c.email = clean(data, "email", 160).lower()
    if "active" in data:
        c.active = bool(data["active"])
    if len(c.name or "") < 2:
        return "Enter the company name.", "name"
    if c.email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", c.email):
        return "Enter a valid email address.", "email"
    if "code" in data and clean(data, "code"):
        code = pricing.normalize_code(data["code"])
        if len(code) < 4:
            return "Use at least 4 letters or numbers for the code.", "code"
        taken = Company.query.filter(Company.code == code, Company.id != (c.id or 0)).first()
        if taken:
            return "Another company already uses that code.", "code"
        c.code = code
    if not c.code:
        c.code = pricing.new_code(c.name)
    return None


@bp.post("/companies")
@admin_required
def create_company():
    c = Company()
    err = _apply_company(c, request.get_json(silent=True) or {})
    if err:
        return fail(err[0], field=err[1])
    db.session.add(c)
    db.session.commit()
    return jsonify(company_json(c, history=True)), 201


@bp.patch("/companies/<int:cid>")
@admin_required
def update_company(cid):
    c = db.session.get(Company, cid)
    if not c:
        return fail("Company not found.", 404)
    err = _apply_company(c, request.get_json(silent=True) or {})
    if err:
        db.session.rollback()
        return fail(err[0], field=err[1])
    db.session.commit()
    return jsonify(company_json(c, history=True))
