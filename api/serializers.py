from datetime import timedelta

from .availability import date_label, iso_utc, time_label, to_local
from .models import get_int_setting, utcnow


def service_json(s):
    return dict(id=s.id, slug=s.slug, family=s.family, name=s.name, category=s.category, summary=s.summary,
                note=s.note, confirm_text=s.confirm_text, pricing=s.pricing, duration_min=s.duration_min,
                min_hours=s.min_hours, max_hours=s.max_hours, setup_min=s.setup_min, price_cents=s.price_cents,
                deposit_cents=s.deposit_cents, active=s.active, bookable=s.bookable, sort_order=s.sort_order)


def addon_json(a):
    return dict(id=a.id, name=a.name, summary=a.summary, price_cents=a.price_cents, per_hour=a.per_hour,
                extra_min=a.extra_min, service_id=a.service_id, active=a.active)


def product_json(p):
    return dict(id=p.id, slug=p.slug, name=p.name, kind=p.kind, summary=p.summary, price_cents=p.price_cents,
                stock=p.stock, taxable=p.taxable, active=p.active, sold_out=p.stock is not None and p.stock <= 0)


def booking_public(b):
    notice = timedelta(hours=get_int_setting("notice_hours"))
    upcoming = b.status == "confirmed" and b.start_at > utcnow()
    return dict(token=b.token, service_name=b.service_name, addons=b.addons or [], hours=b.hours, status=b.status,
                start_at=iso_utc(b.start_at), end_at=iso_utc(b.end_at), date_label=date_label(b.start_at),
                time_label=time_label(b.start_at), end_time_label=time_label(b.end_at),
                arrival_label=time_label(b.block_start_at), location_type=b.location_type, address=b.address,
                customer_name=b.customer_name, total_cents=b.total_cents, deposit_cents=b.deposit_cents,
                deposit_paid_cents=b.deposit_paid_cents, balance_cents=b.total_cents - b.deposit_paid_cents,
                reschedule_count=b.reschedule_count, cancelled_by=b.cancelled_by,
                can_reschedule=upcoming and b.reschedule_count == 0 and b.start_at - utcnow() >= notice,
                can_cancel=upcoming, notice_hours=get_int_setting("notice_hours"))


def booking_admin(b):
    return dict(booking_public(b), id=b.id, customer_email=b.customer_email, customer_phone=b.customer_phone,
                notes=b.notes, admin_notes=b.admin_notes, balance_paid=b.balance_paid,
                refunded_cents=b.refunded_cents, source=b.source, extra_therapists=b.extra_therapists,
                local_date=to_local(b.start_at).strftime("%Y-%m-%d"))


def order_public(o):
    return dict(token=o.token, status=o.status, customer_name=o.customer_name, subtotal_cents=o.subtotal_cents,
                tax_cents=o.tax_cents, total_cents=o.total_cents,
                items=[dict(name=i.name, qty=i.qty, unit_cents=i.unit_cents) for i in o.items])


def order_admin(o):
    return dict(order_public(o), id=o.id, customer_email=o.customer_email, customer_phone=o.customer_phone,
                notes=o.notes, created_at=iso_utc(o.created_at),
                created_label=f"{date_label(o.created_at)}, {time_label(o.created_at)}")
