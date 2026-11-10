import secrets
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_token():
    return secrets.token_urlsafe(24)


class Service(db.Model):
    __tablename__ = "services"
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(80), unique=True, nullable=False)
    family = db.Column(db.String(80), nullable=False)  # groups lengths, e.g. "Sole Cleanse"
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(20), nullable=False, default="massage")  # massage | event
    summary = db.Column(db.Text, default="")
    note = db.Column(db.Text, default="")
    confirm_text = db.Column(db.String(200), default="")  # client must tick this to book
    pricing = db.Column(db.String(10), nullable=False, default="fixed")  # fixed | hourly
    duration_min = db.Column(db.Integer, nullable=True)  # fixed pricing only
    min_hours = db.Column(db.Integer, nullable=True)  # hourly pricing only
    max_hours = db.Column(db.Integer, nullable=True)
    setup_min = db.Column(db.Integer, nullable=False, default=30)  # she arrives this early
    price_cents = db.Column(db.Integer, nullable=True)  # per hour when hourly
    deposit_cents = db.Column(db.Integer, nullable=True)  # None = deposit setting
    first_time_only = db.Column(db.Boolean, default=False)
    active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)

    @property
    def hourly(self):
        return self.pricing == "hourly"

    @property
    def bookable(self):
        if not (self.active and self.price_cents):
            return False
        return bool(self.min_hours) if self.hourly else bool(self.duration_min)


class AddOn(db.Model):
    __tablename__ = "addons"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    summary = db.Column(db.Text, default="")
    price_cents = db.Column(db.Integer, nullable=False)
    per_hour = db.Column(db.Boolean, default=False)
    extra_min = db.Column(db.Integer, default=0)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=True)  # None = any service
    active = db.Column(db.Boolean, default=True)


class Product(db.Model):
    __tablename__ = "products"
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(80), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    kind = db.Column(db.String(20), default="retail")
    summary = db.Column(db.Text, default="")
    price_cents = db.Column(db.Integer, nullable=False)
    stock = db.Column(db.Integer, nullable=True)
    taxable = db.Column(db.Boolean, default=False)
    active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False, default=new_token)
    service_id = db.Column(db.Integer, db.ForeignKey("services.id"), nullable=True)
    service_name = db.Column(db.String(120), nullable=False)
    addons = db.Column(db.JSON, default=list)
    hours = db.Column(db.Integer, nullable=True)
    block_start_at = db.Column(db.DateTime, nullable=False, index=True)  # UTC, when she arrives to set up
    start_at = db.Column(db.DateTime, nullable=False, index=True)  # UTC, when the session starts
    end_at = db.Column(db.DateTime, nullable=False, index=True)
    # held | confirmed | completed | cancelled | no_show | payment_conflict
    status = db.Column(db.String(20), nullable=False, default="held", index=True)
    hold_expires_at = db.Column(db.DateTime, nullable=True)
    reschedule_count = db.Column(db.Integer, nullable=False, default=0)
    cancelled_by = db.Column(db.String(20), nullable=True)  # client | owner
    customer_name = db.Column(db.String(120), nullable=False)
    customer_email = db.Column(db.String(160), nullable=False, index=True)
    customer_phone = db.Column(db.String(40), nullable=False)
    location_type = db.Column(db.String(20), default="home")  # home | workplace
    address = db.Column(db.Text, default="")
    extra_therapists = db.Column(db.Boolean, default=False)
    notes = db.Column(db.Text, default="")
    admin_notes = db.Column(db.Text, default="")
    total_cents = db.Column(db.Integer, nullable=False)
    deposit_cents = db.Column(db.Integer, nullable=False, default=0)
    deposit_paid_cents = db.Column(db.Integer, nullable=False, default=0)
    deposit_paid_at = db.Column(db.DateTime, nullable=True)
    balance_paid = db.Column(db.Boolean, default=False)
    refunded_cents = db.Column(db.Integer, nullable=False, default=0)
    stripe_session_id = db.Column(db.String(255), nullable=True, index=True)
    stripe_payment_intent = db.Column(db.String(255), nullable=True)
    source = db.Column(db.String(20), default="online")
    created_at = db.Column(db.DateTime, default=utcnow)


class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), unique=True, nullable=False, default=new_token)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    customer_name = db.Column(db.String(120), nullable=False)
    customer_email = db.Column(db.String(160), nullable=False)
    customer_phone = db.Column(db.String(40), nullable=False)
    notes = db.Column(db.Text, default="")
    subtotal_cents = db.Column(db.Integer, nullable=False)
    tax_cents = db.Column(db.Integer, nullable=False, default=0)
    total_cents = db.Column(db.Integer, nullable=False)
    stripe_session_id = db.Column(db.String(255), nullable=True, index=True)
    stripe_payment_intent = db.Column(db.String(255), nullable=True)
    paid_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)
    items = db.relationship("OrderItem", backref="order", cascade="all, delete-orphan")


class OrderItem(db.Model):
    __tablename__ = "order_items"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True)
    name = db.Column(db.String(120), nullable=False)
    unit_cents = db.Column(db.Integer, nullable=False)
    qty = db.Column(db.Integer, nullable=False)


class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), nullable=False)
    phone = db.Column(db.String(40), default="")
    topic = db.Column(db.String(40), default="question")  # question | event | other
    body = db.Column(db.Text, nullable=False)
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utcnow)


class WeeklyHours(db.Model):
    __tablename__ = "weekly_hours"
    weekday = db.Column(db.Integer, primary_key=True)
    opens = db.Column(db.String(5), nullable=True)
    closes = db.Column(db.String(5), nullable=True)


class TimeOff(db.Model):
    __tablename__ = "time_off"
    id = db.Column(db.Integer, primary_key=True)
    start_at = db.Column(db.DateTime, nullable=False, index=True)
    end_at = db.Column(db.DateTime, nullable=False, index=True)
    reason = db.Column(db.String(200), default="")


class Setting(db.Model):
    __tablename__ = "settings"
    key = db.Column(db.String(60), primary_key=True)
    value = db.Column(db.Text, nullable=False)


class CalendarLock(db.Model):
    """One row. Writers UPDATE it first, so booking checks run one at a time on SQLite and Postgres."""
    __tablename__ = "calendar_lock"
    id = db.Column(db.Integer, primary_key=True)
    version = db.Column(db.Integer, nullable=False, default=0)


# Her reservation policies, word for word with mistakes fixed (Nov 2026)
POLICIES = "\n".join([
    "All reservations require a $75 deposit to secure reservation date & time.",
    "All deposits are non-refundable.",
    "Deposits are applied to remaining balance.",
    "Cancellations or rescheduled reservations require 24 hours' notice prior to service date.",
    "One-time deposit transfer for rescheduled reservations 24 hours prior to service date.",
    "Same-day cancellations forfeit the deposit.",
])

DEFAULT_SETTINGS = {
    "deposit_dollars": "75",
    "buffer_min": "30",
    "lead_hours": "24",
    "notice_hours": "24",
    "horizon_days": "90",
    "slot_step_min": "30",
    "hold_min": "35",
    "tax_percent": "0",
    "policies": POLICIES,
}


def get_setting(key):
    row = db.session.get(Setting, key)
    return row.value if row else DEFAULT_SETTINGS[key]


def get_int_setting(key):
    try:
        return int(float(get_setting(key)))
    except ValueError:
        return int(DEFAULT_SETTINGS[key])


def deposit_default_cents():
    try:
        return round(float(get_setting("deposit_dollars")) * 100)
    except ValueError:
        return 7500


def set_setting(key, value):
    row = db.session.get(Setting, key)
    if row:
        row.value = str(value)
    else:
        db.session.add(Setting(key=key, value=str(value)))
