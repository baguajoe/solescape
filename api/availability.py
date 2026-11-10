"""Slots, calendar locking and time zones.

Datetimes are stored as naive UTC. Each booking blocks her calendar from
block_start_at (arrival for setup) to end_at, plus a travel buffer between bookings.
"""
import calendar as cal
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import and_, or_, update

from .models import Booking, CalendarLock, TimeOff, WeeklyHours, db, get_int_setting, utcnow

BLOCKING = ("confirmed", "payment_conflict")


def tz():
    return ZoneInfo(current_app.config["TIMEZONE"])


def to_utc(local_naive):
    return local_naive.replace(tzinfo=tz()).astimezone(timezone.utc).replace(tzinfo=None)


def to_local(utc_naive):
    return utc_naive.replace(tzinfo=timezone.utc).astimezone(tz())


def time_label(utc_naive):
    return to_local(utc_naive).strftime("%-I:%M %p")


def date_label(utc_naive):
    return to_local(utc_naive).strftime("%A, %B %-d, %Y")


def iso_utc(utc_naive):
    return utc_naive.isoformat() + "Z" if utc_naive else None


def lock_calendar():
    """Take the calendar lock. Held until commit or rollback."""
    db.session.execute(update(CalendarLock).where(CalendarLock.id == 1)
                       .values(version=CalendarLock.version + 1))


def busy_intervals(start, end, exclude_id=None):
    now = utcnow()
    q = Booking.query.filter(
        Booking.block_start_at < end, Booking.end_at > start,
        or_(Booking.status.in_(BLOCKING),
            and_(Booking.status == "held", Booking.hold_expires_at > now)),
    )
    if exclude_id:
        q = q.filter(Booking.id != exclude_id)
    bookings = [(b.block_start_at, b.end_at) for b in q.all()]
    blocks = [(t.start_at, t.end_at) for t in
              TimeOff.query.filter(TimeOff.start_at < end, TimeOff.end_at > start).all()]
    return bookings, blocks


def conflicts(start, end, bookings, blocks, buffer_min):
    """Travel buffer applies between appointments, not around time off."""
    pad = timedelta(minutes=buffer_min)
    return (any(start < be + pad and end + pad > bs for bs, be in bookings)
            or any(start < be and end > bs for bs, be in blocks))


def _hm(value):
    h, m = value.split(":")
    return time(int(h), int(m))


def _day_starts(day, duration_min, setup_min, hours, step):
    """Session start times whose setup and session both fit inside working hours."""
    row = hours.get(day.weekday())
    if not row or not row.opens or not row.closes:
        return []
    cursor = datetime.combine(day, _hm(row.opens)) + timedelta(minutes=setup_min)
    closes = datetime.combine(day, _hm(row.closes))
    out = []
    while cursor + timedelta(minutes=duration_min) <= closes:
        out.append(cursor)
        cursor += timedelta(minutes=step)
    return out


def slots_between(first, last, duration_min, setup_min, exclude_id=None):
    """Open session start times per day, as {date: [utc start, ...]}."""
    hours = {r.weekday: r for r in WeeklyHours.query.all()}
    step = max(get_int_setting("slot_step_min"), 5)
    buffer_min = get_int_setting("buffer_min")
    now = utcnow()
    earliest = now + timedelta(hours=get_int_setting("lead_hours"))
    latest = now + timedelta(days=get_int_setting("horizon_days"))
    window_start = to_utc(datetime.combine(first, time.min)) - timedelta(days=1)
    window_end = to_utc(datetime.combine(last, time.max)) + timedelta(days=1)
    bookings, blocks = busy_intervals(window_start, window_end, exclude_id)

    out = {}
    day = first
    while day <= last:
        open_starts = []
        for local in _day_starts(day, duration_min, setup_min, hours, step):
            start = to_utc(local)
            if start < earliest or start > latest:
                continue
            block = start - timedelta(minutes=setup_min)
            if not conflicts(block, start + timedelta(minutes=duration_min), bookings, blocks, buffer_min):
                open_starts.append(start)
        out[day] = open_starts
        day += timedelta(days=1)
    return out


def month_bounds(month):
    year, mon = (int(x) for x in month.split("-"))
    return date(year, mon, 1), date(year, mon, cal.monthrange(year, mon)[1])


def slot_is_open(start, duration_min, setup_min, exclude_id=None):
    """Exact re-check at write time. Call after lock_calendar()."""
    day = to_local(start).date()
    return start in slots_between(day, day, duration_min, setup_min, exclude_id).get(day, [])


def still_free(block_start, end, exclude_id=None):
    """Collision check only: ignores notice and hours. For paid or owner-entered bookings."""
    bookings, blocks = busy_intervals(block_start - timedelta(days=1), end + timedelta(days=1), exclude_id)
    return not conflicts(block_start, end, bookings, blocks, get_int_setting("buffer_min"))
