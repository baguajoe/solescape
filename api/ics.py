from .models import utcnow


def _esc(text):
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _stamp(dt):
    return dt.strftime("%Y%m%dT%H%M%SZ")


def event(b, summary, description="", location="", from_arrival=False):
    start = b.block_start_at if from_arrival else b.start_at
    return ["BEGIN:VEVENT", f"UID:{b.token}@solescape", f"DTSTAMP:{_stamp(utcnow())}",
            f"DTSTART:{_stamp(start)}", f"DTEND:{_stamp(b.end_at)}", f"SUMMARY:{_esc(summary)}",
            f"DESCRIPTION:{_esc(description)}", f"LOCATION:{_esc(location)}", "END:VEVENT"]


def calendar(events, name="SoleScape"):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SoleScape//Booking//EN", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:{_esc(name)}"]
    for e in events:
        lines += e
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"
