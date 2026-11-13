"""Stripe Checkout, plus a demo mode for running the site with no Stripe keys."""
import logging
from datetime import timedelta, timezone

import stripe
from flask import current_app

from . import notify
from .availability import lock_calendar, still_free
from .models import Booking, Order, Product, db, utcnow

log = logging.getLogger("solescape.payments")
STRIPE_MIN_EXPIRY_MIN = 31  # Stripe requires at least 30


def demo_mode():
    """No real payments: without Stripe keys, and always on a preview site, even if keys were added.
    Production can't get here, because it refuses to start without Stripe keys."""
    cfg = current_app.config
    if cfg["APP_ENV"] == "production":
        return False
    return cfg["APP_ENV"] == "preview" or not cfg["STRIPE_SECRET_KEY"]


def _checkout(name, amount_cents, email, success_url, cancel_url, metadata):
    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{
            "price_data": {"currency": "usd", "product_data": {"name": name}, "unit_amount": amount_cents},
            "quantity": 1,
        }],
        customer_email=email,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        expires_at=int((utcnow() + timedelta(minutes=STRIPE_MIN_EXPIRY_MIN))
                       .replace(tzinfo=timezone.utc).timestamp()),
    )
    return session["id"], session["url"]


def start_booking_checkout(b):
    base = current_app.config["PUBLIC_URL"]
    if demo_mode():
        return None, f"{base}/demo-pay/booking/{b.token}"
    return _checkout(f"Deposit: {b.service_name}", b.deposit_cents, b.customer_email,
                     f"{base}/booking/{b.token}", f"{base}/book?released={b.token}",
                     {"kind": "booking", "token": b.token})


def start_order_checkout(o):
    base = current_app.config["PUBLIC_URL"]
    if demo_mode():
        return None, f"{base}/demo-pay/order/{o.token}"
    return _checkout("SoleScape order", o.total_cents, o.customer_email,
                     f"{base}/order/{o.token}", f"{base}/cart",
                     {"kind": "order", "token": o.token})


def expire_session(session_id):
    if not session_id or demo_mode():
        return
    try:
        stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]
        stripe.checkout.Session.expire(session_id)
    except Exception:
        log.warning("Could not expire Stripe session %s", session_id)


def mark_booking_paid(token, amount_cents, payment_ref):
    """Idempotent: Stripe can deliver the same event more than once."""
    lock_calendar()
    b = Booking.query.filter_by(token=token).first()
    if not b:
        db.session.rollback()
        log.error("Payment for unknown booking %s", token)
        return None
    if b.deposit_paid_at:
        db.session.rollback()
        return b

    b.deposit_paid_cents = amount_cents
    b.deposit_paid_at = utcnow()
    b.stripe_payment_intent = payment_ref
    hold_valid = b.status == "held" and b.hold_expires_at and b.hold_expires_at > utcnow()
    if hold_valid or still_free(b.block_start_at, b.end_at, exclude_id=b.id):
        b.status = "confirmed"
    else:
        b.status = "payment_conflict"  # Money taken, slot gone: she has to resolve it
    b.hold_expires_at = None
    db.session.commit()
    if b.status == "confirmed":
        notify.booking_confirmed(b)
    else:
        notify.booking_conflict(b)
    return b


def mark_order_paid(token, payment_ref):
    o = Order.query.filter_by(token=token).first()
    if not o:
        log.error("Payment for unknown order %s", token)
        return None
    if o.paid_at:
        return o
    o.status = "paid"
    o.paid_at = utcnow()
    o.stripe_payment_intent = payment_ref
    for item in o.items:
        p = db.session.get(Product, item.product_id) if item.product_id else None
        if p and p.stock is not None:
            p.stock = max(p.stock - item.qty, 0)
    db.session.commit()
    notify.order_paid(o)
    return o


def handle_event(event):
    obj = event["data"]["object"]
    metadata = obj["metadata"] or {}
    kind = metadata["kind"] if "kind" in metadata else None
    token = metadata["token"] if "token" in metadata else None
    if not kind or not token:
        return  # Not ours: some other payment on the same Stripe account

    if event["type"] == "checkout.session.expired":
        if kind == "booking":
            b = Booking.query.filter_by(token=token).first()
            if b and b.status == "held":
                b.status = "cancelled"
                db.session.commit()
    elif event["type"] in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if obj["payment_status"] != "paid":
            return
        if kind == "booking":
            mark_booking_paid(token, obj["amount_total"], obj["payment_intent"])
        elif kind == "order":
            mark_order_paid(token, obj["payment_intent"])


def refund(payment_ref, amount_cents):
    """Returns True once the money is on its way back. Demo payments have no reference."""
    if demo_mode() or not payment_ref:
        return True
    stripe.api_key = current_app.config["STRIPE_SECRET_KEY"]
    stripe.Refund.create(payment_intent=payment_ref, amount=amount_cents)
    return True
