import logging
import smtplib
from email.message import EmailMessage

from flask import after_this_request, current_app, has_request_context

from .availability import date_label, time_label
from .serializers import AREA_LABELS

log = logging.getLogger("solescape.mail")


def money(cents):
    return f"${cents / 100:,.2f}"


SMTP_TIMEOUT = 10


def send(to, subject, body):
    """Email must never break or slow down a payment or booking. During a request the message is sent after
    the response has gone to the browser (Werkzeug's call_on_close, which Vercel, gunicorn and the dev
    server all run once the body is written), and failures are only logged."""
    cfg = current_app.config
    if not cfg["SMTP_HOST"]:
        log.info("Email not configured. Would send to %s: %s", to, subject)
        return False
    try:
        msg = EmailMessage()
        msg["From"] = cfg["MAIL_FROM"] or cfg["SMTP_USER"]
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
    except Exception:
        log.exception("Could not build email to %s", to)
        return False
    smtp = {k: cfg[k] for k in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD")}
    if has_request_context():
        @after_this_request
        def later(response):
            response.call_on_close(lambda: deliver(msg, smtp))
            return response
        return True
    return deliver(msg, smtp)


def deliver(msg, smtp):
    try:
        with smtplib.SMTP(smtp["SMTP_HOST"], smtp["SMTP_PORT"], timeout=SMTP_TIMEOUT) as conn:
            conn.starttls()
            if smtp["SMTP_USER"]:
                conn.login(smtp["SMTP_USER"], smtp["SMTP_PASSWORD"])
            conn.send_message(msg)
        return True
    except Exception:
        log.exception("Could not send email to %s", msg["To"])
        return False


def _when(b):
    return f"{date_label(b.start_at)} at {time_label(b.start_at)}"


def price_lines(b):
    """Regular price, discount and total on separate lines when a discount was applied."""
    if not b.discount:
        return f"Total: {money(b.total_cents)}\n"
    return (f"Regular price: {money(b.regular)}\n{b.discount_label} \u2212{money(b.discount)}\n"
            f"Total: {money(b.total_cents)}\n")


def booking_confirmed(b):
    url = f"{current_app.config['PUBLIC_URL']}/booking/{b.token}"
    balance = b.total_cents - b.deposit_paid_cents
    company = f"Company: {b.company.name}\n" if b.company_id and b.company else ""
    send(b.customer_email, f"Your SoleScape appointment: {_when(b)}",
         f"Hi {b.customer_name},\n\nYou're booked for {b.service_name} on {_when(b)}.\n"
         f"Kerimah will arrive at {time_label(b.block_start_at)} to set up at {b.address}.\n\n"
         f"{price_lines(b)}"
         f"Deposit paid: {money(b.deposit_paid_cents)} (non-refundable, applied to your balance)\n"
         f"Balance due: {money(balance)}\n\n"
         f"View, reschedule or cancel: {url}\n\nQuestions? Text 617.297.8564.\n\nKerimah\n"
         "SoleScape Foot Spa & Massage\n")
    send(current_app.config["OWNER_EMAIL"], f"New booking: {b.service_name}, {_when(b)}",
         f"{b.customer_name} ({b.customer_phone}, {b.customer_email})\n{b.service_name}\n{_when(b)}\n"
         f"Arrive for setup: {time_label(b.block_start_at)}\nWhere ({b.location_type}): {b.address}\n"
         f"Area: {AREA_LABELS.get(b.area, 'not given')}\n"
         f"Extra therapists requested: {'yes' if b.extra_therapists else 'no'}\n{company}"
         f"{price_lines(b)}"
         f"Deposit: {money(b.deposit_paid_cents)}, balance {money(balance)}\nNotes: {b.notes or 'none'}\n")


def booking_rescheduled(b, old_when, old_total=None):
    balance = b.total_cents - b.deposit_paid_cents
    changed = old_total is not None and old_total != b.total_cents
    note = f"Your total changed from {money(old_total)} to {money(b.total_cents)}.\n" if changed else ""
    send(b.customer_email, f"Rescheduled: {_when(b)}",
         f"Hi {b.customer_name},\n\nYour {b.service_name} has moved from {old_when} to {_when(b)}. "
         "Your deposit has been transferred to the new time. This was your one deposit transfer.\n\n"
         f"{note}{price_lines(b)}"
         f"Deposit paid: {money(b.deposit_paid_cents)} (applied to your balance)\n"
         f"Balance due: {money(balance)}\n")
    send(current_app.config["OWNER_EMAIL"], f"Rescheduled by client: {b.customer_name}",
         f"{b.customer_name} moved {b.service_name} from {old_when} to {_when(b)}.\n"
         f"Area: {AREA_LABELS.get(b.area, 'not given')}\n{note}{price_lines(b)}"
         f"Balance due: {money(balance)}\n")


def booking_cancelled(b):
    send(b.customer_email, "Your SoleScape appointment was cancelled",
         f"Hi {b.customer_name},\n\nYour {b.service_name} on {_when(b)} is cancelled. "
         "As in the reservation policy, the deposit is non-refundable.\n")
    send(current_app.config["OWNER_EMAIL"], f"Cancelled by client: {b.customer_name}",
         f"{b.customer_name} cancelled {b.service_name} on {_when(b)}.\n")


def booking_conflict(b):
    send(current_app.config["OWNER_EMAIL"], "Action needed: a paid booking collided",
         f"{b.customer_name} ({b.customer_phone}) paid a deposit for {b.service_name} on "
         f"{_when(b)}, but that time was already taken. "
         "Contact them to rebook, or refund the deposit from the admin calendar.\n")


def message_received(m):
    send(current_app.config["OWNER_EMAIL"], f"Website message from {m.name}",
         f"{m.name} ({m.email}{', ' + m.phone if m.phone else ''})\nTopic: {m.topic}\n\n{m.body}\n")


def order_paid(o):
    lines = "\n".join(f"{i.qty} x {i.name}: {money(i.unit_cents * i.qty)}" for i in o.items)
    send(o.customer_email, "Your SoleScape order",
         f"Hi {o.customer_name},\n\nThanks for your order.\n\n{lines}\nTotal paid: "
         f"{money(o.total_cents)}\n\nKerimah will text you if anything needs arranging.\n")
    send(current_app.config["OWNER_EMAIL"], f"New order from {o.customer_name}",
         f"{o.customer_name} ({o.customer_phone}, {o.customer_email})\n\n{lines}\n"
         f"Total: {money(o.total_cents)}\nNotes: {o.notes or 'none'}\n")
