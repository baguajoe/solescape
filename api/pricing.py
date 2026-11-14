"""Discounts: Weekly Deals and the corporate loyalty program. Server-side only, in cents.

Rules:
- Weekly Deals (her text, Nov 2026): "Mondays South Coast; Wednesdays Boston. $30 off 60-minute & 90-minute
  sessions. Not available for Recovery Lounge or Foot Loose services." The appointment date counts, not the
  booking date, and the client's chosen area must match that day.
- Discounts never stack. The larger one wins; on a tie the Weekly Deal wins, so a company keeps an earned
  reward for later. (Today they can't meet: the deal is for massages, the corporate program for events.)
- The discount comes off the total. The deposit never changes, so a discount can't bring the total
  below the deposit.
- What was applied is copied onto the booking, so changing the settings later changes nothing.
"""
import re
import secrets
from datetime import timedelta

from .availability import to_local
from .models import (Booking, Company, Service, db, deposit_default_cents, get_float_setting, get_int_setting,
                     get_setting, utcnow)

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


# Weekly Deals

AREAS = {"boston": "Boston area", "south_coast": "South Coast", "other": "Other"}
# Which area each day setting belongs to, and how her banner names it. South Coast first, as she wrote it.
DEAL_AREAS = (("south_coast", "South Coast", "weekly_deal_south_coast_day"),
              ("boston", "Boston", "weekly_deal_boston_day"))
# 60- and 90-minute Sole Cleanse and Mama's Sole Relief only. Not the 120-minute session or events.
DEAL_SERVICES = ("sole-cleanse-60", "sole-cleanse-90", "mamas-sole-relief-60", "mamas-sole-relief-90")
DAYS = ("Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays")
DEAL_KIND = "weekly_deal"
DEAL_LABEL = "Weekly Deal"


def deal_on():
    return get_setting("weekly_deal_enabled") == "1"


def deal_cents():
    try:
        return max(int(round(float(get_setting("weekly_deal_dollars")) * 100)), 0)
    except ValueError:
        return 3000


def deal_day(area):
    """The weekday (0 = Monday) with a deal for this area, or None."""
    for key, _, setting in DEAL_AREAS:
        if key == area:
            value = get_setting(setting)
            return int(value) if value.isdigit() and int(value) <= 6 else None
    return None


def deal_eligible(service):
    return bool(service) and service.slug in DEAL_SERVICES


def weekly_deal_for(service, area, start_at):
    """Cents off for this service, area and appointment time (UTC), or 0."""
    if not (deal_on() and deal_eligible(service) and start_at is not None):
        return 0
    day = deal_day(area)
    return deal_cents() if day is not None and to_local(start_at).weekday() == day else 0


def deal_dates(service, first, last, area=None):
    """{"YYYY-MM-DD": [areas]} for days between first and last (local dates) with a deal for this service."""
    if not (deal_on() and deal_eligible(service)):
        return {}
    days = {}
    for key, _, _ in DEAL_AREAS:
        if area and key != area:
            continue
        wd = deal_day(key)
        if wd is None:
            continue
        d = first
        while d <= last:
            if d.weekday() == wd:
                days.setdefault(d.isoformat(), []).append(key)
            d += timedelta(days=1)
    return days


def deal_text(even_if_off=False):
    """Her banner text, built from the settings. With the default settings it's exactly what she wrote.
    The Site text page can replace it (deal_public uses her version)."""
    parts = []
    for key, name, _ in DEAL_AREAS:
        day = deal_day(key)
        if day is not None:
            parts.append((day, f"{DAYS[day]} {name}"))
    if not ((even_if_off or deal_on()) and parts):
        return None
    days = "; ".join(p for _, p in sorted(parts))
    return (f"{days}. {fmt_money(deal_cents())} off 60-minute & 90-minute sessions. "
            "Not available for Recovery Lounge or Foot Loose services.")


def deal_public():
    """The banner, shown only while a deal is on: her own wording from the Site text page, or the built text."""
    from .site_text import edited_value
    text = deal_text()
    if not text:
        return None
    return dict(text=edited_value("deals.banner") or text, amount_cents=deal_cents())


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

def price(service, addons, hours, regular, start_at=None, company=None, area=None):
    """The full breakdown for one booking. regular is the undiscounted total from quote()."""
    deposit = deposit_for(service, regular)
    room = max(regular - deposit, 0)  # the most any discount can take off
    options = []
    deal = weekly_deal_for(service, area, start_at)
    if deal:
        options.append((min(deal, room), 1, DEAL_KIND, DEAL_LABEL))
    corp = corporate_discount(company, service, addons, hours, regular)
    if corp:
        options.append((min(corp[0], room), 0, corp[1], corp[2]))
    best = max(options, key=lambda o: (o[0], o[1]), default=None)
    if not best or best[0] <= 0:
        best = (0, 0, None, None)
    discount, _, kind, label = best
    return dict(regular_cents=regular, discount_cents=discount, discount_kind=kind, discount_label=label,
                total_cents=regular - discount, deposit_cents=deposit, company_id=company.id if company else None)


def repriced(b, new_start):
    """Pricing for booking b moved to new_start. The Weekly Deal is worked out again for the new date and the
    booking's area; the regular price and deposit stay as booked. Corporate discounts and phone bookings
    (where she set the total herself) don't change."""
    keep = dict(regular_cents=b.regular, discount_cents=b.discount, discount_kind=b.discount_kind,
                discount_label=b.discount_label, total_cents=b.total_cents)
    if b.source == "manual" or b.discount_kind not in (None, DEAL_KIND):
        return keep
    service = db.session.get(Service, b.service_id) if b.service_id else None
    room = max(b.regular - b.deposit_cents, 0)
    cents = min(weekly_deal_for(service, b.area, new_start), room)
    return dict(regular_cents=b.regular, discount_cents=cents, discount_kind=DEAL_KIND if cents else None,
                discount_label=DEAL_LABEL if cents else None, total_cents=b.regular - cents)


def apply_pricing(b, p):
    for key in ("regular_cents", "discount_cents", "discount_kind", "discount_label", "total_cents"):
        setattr(b, key, p[key])
