"""Discounts: the weekly special and the corporate loyalty program. Server-side only, in cents.

Rules:
- A special and a corporate discount never stack. The larger one wins; on a tie the special wins,
  so a company keeps an earned reward for later.
- The discount comes off the total. The deposit never changes, so a discount can't bring the total
  below the deposit.
- What was applied is copied onto the booking, so editing or deleting a special later changes nothing.
"""
import re
import secrets
from datetime import datetime

from .availability import to_local
from .models import Booking, Company, Special, deposit_default_cents, get_float_setting, get_int_setting, get_setting, utcnow

CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I/L to misread
USED = ("confirmed", "completed", "no_show", "payment_conflict")


def deposit_for(service, total):
    dep = service.deposit_cents if service.deposit_cents is not None else deposit_default_cents()
    return min(max(dep, 100), total)


def pct_of(cents, pct):
    return int(round(cents * pct / 100))


def fmt_pct(pct):
    return f"{pct:g}%"


def fmt_money(cents):
    return f"${cents / 100:,.2f}".replace(".00", "")


# Specials

def today_local():
    return to_local(utcnow()).date()


def special_on(day):
    return Special.query.filter(Special.starts_on <= day, Special.ends_on >= day).first()


def active_special():
    """The special running today. Turns itself off once the end date has passed."""
    return special_on(today_local())


def special_for(service, start_at=None):
    """The special that applies to a booking of this service, per the date-basis setting."""
    if get_setting("special_date_basis") == "appointment":
        if start_at is None:
            return None
        sp = special_on(to_local(start_at).date())
    else:
        sp = active_special()
    return sp if sp and service.id in (sp.service_ids or []) else None


def special_discount(sp, regular):
    if sp.discount_type == "percent":
        return pct_of(regular, sp.discount_value)
    return sp.discount_value


def special_terms(sp):
    return f"{sp.discount_value}% off" if sp.discount_type == "percent" else f"{fmt_money(sp.discount_value)} off"


def sale_price(sp, service):
    """For the menu: the sale price per booking (or per hour), or None when it depends on hours."""
    if sp.discount_type == "percent":
        return service.price_cents - pct_of(service.price_cents, sp.discount_value)
    if service.hourly:
        return None  # a dollar amount comes off the whole booking, not each hour
    return max(service.price_cents - sp.discount_value, 0)


# Corporate program

def corporate_live():
    """Codes work, and the site mentions the program, only when it's on and she has described it."""
    return get_setting("corporate_enabled") == "1" and bool(get_setting("corporate_description").strip())


def normalize_code(code):
    return re.sub(r"[^A-Z0-9-]", "", str(code or "").upper())[:40]


def new_code(name):
    prefix = re.sub(r"[^A-Z0-9]", "", name.upper())[:6] or "CORP"
    while True:
        code = f"{prefix}-{''.join(secrets.choice(CODE_CHARS) for _ in range(5))}"
        if not Company.query.filter_by(code=code).first():
            return code


def find_company(code):
    code = normalize_code(code)
    if not code:
        return None
    return Company.query.filter_by(code=code, active=True).first()


def company_progress(company):
    """Reward tracking for the "after N completed events" reward."""
    n = max(get_int_setting("corporate_every_n"), 1)
    rows = Booking.query.filter_by(company_id=company.id).all()
    now = utcnow()
    qualifying = sum(1 for b in rows if b.status == "completed" and b.discount_kind != "corporate_reward")
    used = sum(1 for b in rows if b.discount_kind == "corporate_reward" and (
        b.status in USED or (b.status == "held" and b.hold_expires_at and b.hold_expires_at > now)))
    earned = qualifying // n
    return dict(every_n=n, qualifying=qualifying, toward_next=qualifying % n, earned=earned, used=used,
                available=max(earned - used, 0))


def reward_terms():
    if get_setting("corporate_reward_type") == "nth":
        if get_setting("corporate_nth_reward") == "hours":
            hours = get_int_setting("corporate_nth_hours")
            return f"{hours} hour{'s' if hours != 1 else ''} free"
        return f"{fmt_pct(get_float_setting('corporate_nth_percent'))} off"
    return f"{fmt_pct(get_float_setting('corporate_percent'))} off"


def corporate_discount(company, service, addons, hours, regular):
    """Returns (cents, kind, label) for this company's booking, or None."""
    if not company or service.category != "event" or not corporate_live():
        return None
    if get_setting("corporate_reward_type") != "nth":
        pct = get_float_setting("corporate_percent")
        return pct_of(regular, pct), "corporate", f"Corporate rate ({fmt_pct(pct)} off)"
    if company_progress(company)["available"] < 1:
        return None
    if get_setting("corporate_nth_reward") == "hours":
        if not service.hourly or not hours:
            return None
        free = min(get_int_setting("corporate_nth_hours"), hours)
        rate = service.price_cents + sum(a.price_cents for a in addons if a.per_hour)
        return free * rate, "corporate_reward", f"Corporate reward ({reward_terms()})"
    pct = get_float_setting("corporate_nth_percent")
    return pct_of(regular, pct), "corporate_reward", f"Corporate reward ({fmt_pct(pct)} off)"


# Putting it together

def price(service, addons, hours, regular, start_at=None, company=None):
    """The full breakdown for one booking. regular is the undiscounted total from quote()."""
    deposit = deposit_for(service, regular)
    room = max(regular - deposit, 0)  # the most any discount can take off
    options = []
    sp = special_for(service, start_at)
    if sp:
        options.append((min(special_discount(sp, regular), room), 1, "special",
                        f"{sp.title} ({special_terms(sp)})", sp.id))
    corp = corporate_discount(company, service, addons, hours, regular)
    if corp:
        options.append((min(corp[0], room), 0, corp[1], corp[2], None))
    best = max(options, key=lambda o: (o[0], o[1]), default=None)
    if not best or best[0] <= 0:
        best = (0, 0, None, None, None)
    discount, _, kind, label, special_id = best
    return dict(regular_cents=regular, discount_cents=discount, discount_kind=kind, discount_label=label,
                special_id=special_id, total_cents=regular - discount, deposit_cents=deposit,
                company_id=company.id if company else None)


# Public views

def special_public(sp):
    if not sp:
        return None
    basis = get_setting("special_date_basis")
    return dict(title=sp.title, description=sp.description, terms=special_terms(sp),
                starts_on=sp.starts_on.isoformat(), ends_on=sp.ends_on.isoformat(),
                ends_label=datetime.combine(sp.ends_on, datetime.min.time()).strftime("%A, %B %-d"),
                starts_label=datetime.combine(sp.starts_on, datetime.min.time()).strftime("%B %-d"),
                date_basis=basis, service_ids=sp.service_ids or [])
