"""Her menu, sent Nov 2026 (wording updated Nov 12, 2026; event sentence moved to the Events intro after that). Prices in cents. Hourly services charge
price_cents per hour."""
from .models import AddOn, CalendarLock, Service, WeeklyHours, db

SETUP = "LMT arrives 30 minutes prior for setup."

SERVICES = [
    dict(slug="sole-cleanse-60", family="Sole Cleanse", name="Sole Cleanse, 60 minutes", duration_min=60,
         price_cents=19000, note=SETUP,
         summary="45-min full body massage, trigger point therapy, gentle stretch, firm pressure + 15-min foot "
         "massage, hot towels."),
    dict(slug="sole-cleanse-90", family="Sole Cleanse", name="Sole Cleanse, 90 minutes", duration_min=90,
         price_cents=22500, note=SETUP,
         summary="60-min full body massage, trigger point therapy, firm pressure, gentle stretch + 15-min foot soak, "
         "15-min foot massage, foot exfoliant, hot towels."),
    dict(slug="sole-cleanse-120", family="Sole Cleanse", name="Sole Cleanse, 120 minutes", duration_min=120,
         price_cents=30000, note=SETUP,
         summary="90-min full body massage, trigger point therapy, hot stone therapy, firm pressure, gentle stretch "
         "+ 15-min foot soak, 15-min foot massage, foot exfoliant, hot towels."),
    dict(slug="mamas-sole-relief-60", family="Mama's Sole Relief", name="Mama's Sole Relief, 60 minutes",
         duration_min=60, price_cents=19000, note="2nd & 3rd trimester clients. " + SETUP,
         confirm_text="I'm in my 2nd or 3rd trimester.",
         summary="45-minute full-body massage alleviating weight-bearing joints, light to firm pressure + 15-min "
         "foot massage, hot towels."),
    dict(slug="mamas-sole-relief-90", family="Mama's Sole Relief", name="Mama's Sole Relief, 90 minutes",
         duration_min=90, price_cents=22500, note="2nd & 3rd trimester clients. " + SETUP,
         confirm_text="I'm in my 2nd or 3rd trimester.",
         summary="60-min full body massage alleviating weight-bearing joints, gentle trigger point therapy, light to "
         "firm pressure + 15-min foot soak, 15-min foot massage, foot exfoliant, hot towels."),
    dict(slug="recovery-lounge", family="Recovery Lounge", name="Recovery Lounge", category="event",
         pricing="hourly", min_hours=3, max_hours=8, price_cents=19000,
         note="Minimum 3 hours, additional LMTs available upon request, arrives 30 minutes prior for setup.",
         summary="Therapeutic 15-minute or 20-minute massages in a specialized chair, fully clothed, improving "
         "mobility within your scalp, neck, back & shoulders."),
    dict(slug="foot-loose", family="Foot Loose", name="Foot Loose", category="event", pricing="hourly",
         min_hours=3, max_hours=8, price_cents=19000,
         note="Minimum 3 hours, additional licensed massage therapists available upon request, arrives 30 minutes "
         "prior for setup.",
         summary="Foot massages for overworked feet, reducing chronic tension throughout your body + improving "
         "posture."),
]

HOURS = {0: ("11:00", "19:00"), 1: ("11:00", "19:00"), 2: ("11:30", "19:00"), 3: ("11:00", "19:00"),
         4: ("10:00", "18:00"), 5: ("10:00", "18:00"), 6: (None, None)}


def ensure_lock():
    if not db.session.get(CalendarLock, 1):
        db.session.add(CalendarLock(id=1, version=0))
        db.session.commit()


# Her earlier wording, replaced in Nov 2026. update_wording() swaps it on an existing database, but only where
# the text is still exactly one of the old versions, so an edit she made in the admin is never overwritten.
# "Convenient for corporate events, community events, and special events." now lives only in the Events intro.
EVENTS_LINE = " Convenient for corporate events, community events, and special events."
OLD_SUMMARIES = {
    "mamas-sole-relief-60": ["Full body massage alleviating weight-bearing joints, light to firm pressure + 15-min "
                             "foot massage, hot towels."],
    "recovery-lounge": ["Therapeutic 15-minute or 20-minute massages in a specialized chair, fully clothed, improving "
                        "mobility within your scalp, neck, back & shoulders." + EVENTS_LINE],
    "foot-loose": ["Foot massages for overworked feet, reducing chronic tension throughout your body + improving "
                   "posture." + EVENTS_LINE],
}


def update_wording():
    new = {row["slug"]: row["summary"] for row in SERVICES}
    changed = False
    for slug, olds in OLD_SUMMARIES.items():
        s = Service.query.filter_by(slug=slug).first()
        if s and s.summary in olds and s.summary != new[slug]:
            s.summary = new[slug]
            changed = True
    if changed:
        db.session.commit()
    return changed


def seed_if_empty():
    ensure_lock()
    if Service.query.first():
        return False
    for i, row in enumerate(SERVICES):
        db.session.add(Service(sort_order=i, **row))
    db.session.flush()
    foot_loose = Service.query.filter_by(slug="foot-loose").first()
    db.session.add(AddOn(name="Foot soaks", price_cents=5000, per_hour=True, service_id=foot_loose.id,
                         summary="Add foot soaks."))
    for day, (opens, closes) in HOURS.items():
        db.session.add(WeeklyHours(weekday=day, opens=opens, closes=closes))
    db.session.commit()
    return True
