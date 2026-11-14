"""The website wording Kerimah edits on the Site text page.

The originals, limits and labels are in site_text.json (the React build reads the same file, so a page can show
the original if the API is slow). Her edits are rows in the site_text table; "Reset to original" deletes the row.
Everything is plain text: line breaks are kept, anything that looks like an HTML tag is refused, and React
renders it as text, never as HTML.
"""
import json
import os
import re

from .models import SiteText, db, deposit_default_cents, utcnow

with open(os.path.join(os.path.dirname(__file__), "site_text.json"), encoding="utf-8") as f:
    PAGES = json.load(f)["pages"]

BLOCKS = {}
for _page in PAGES:
    for _block in _page["blocks"]:
        BLOCKS[_block["key"]] = dict(_block, page=_page["name"], path=_page["path"])

# A "<" followed by a letter, "/", "!" or "?" starts an HTML tag or comment. "<3" and "5 < 6" are fine.
TAG_RE = re.compile(r"<\s*[/!?]?\s*[a-zA-Z!?]")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏  ‪-‮⁦-⁩]")
EMPTY = "This can't be empty. To go back to the original wording, press Reset to original."


class TextError(ValueError):
    pass


def money_label(cents):
    return f"${cents / 100:,.2f}".replace(".00", "")


def clean_text(raw, multiline=True, what="This text"):
    """Plain text with line breaks kept (multiline) or folded into spaces. Raises TextError on HTML."""
    if raw is None:
        raw = ""
    if not isinstance(raw, str):
        raise TextError(f"{what} must be text.")
    s = CONTROL_RE.sub("", raw.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " "))
    tag = TAG_RE.search(s)
    if tag:
        snippet = re.match(r"<[^>\n]{0,15}>?", s[tag.start():]).group()
        raise TextError(f"{what} has something that looks like website code ({snippet}). "
                        "Plain text only: take out the < and > signs.")
    lines = [re.sub(r" {2,}", " ", line).strip() for line in s.split("\n")]
    if not multiline:
        return " ".join(line for line in lines if line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def check_length(text, limit, what):
    if len(text) > limit:
        raise TextError(f"{what} is too long: {len(text)} characters. The limit is {limit}.")


def default_value(key):
    """The original wording, with today's deposit and Weekly Deals settings filled in."""
    block = BLOCKS[key]
    if key == "deals.banner":
        from .pricing import deal_text
        return deal_text(even_if_off=True) or ""
    deposit = money_label(deposit_default_cents())
    value = block["default"]
    if block["kind"] == "pairs":
        return [dict(q=p["q"], a=p["a"].replace("{deposit}", deposit)) for p in value]
    return value.replace("{deposit}", deposit)


def _decode(block, stored):
    if block["kind"] == "pairs":
        try:
            rows = json.loads(stored)
            return [dict(q=str(r["q"]), a=str(r["a"])) for r in rows]
        except (ValueError, TypeError, KeyError):
            return None  # never expected; fall back to the original rather than break the page
    return stored


def edited_value(key):
    """Her saved version, or None if she hasn't changed it."""
    row = db.session.get(SiteText, key)
    return _decode(BLOCKS[key], row.value) if row else None


def current_value(key):
    value = edited_value(key)
    return default_value(key) if value is None else value


def public_texts():
    rows = {r.key: r for r in SiteText.query.all()}
    out = {}
    for key, block in BLOCKS.items():
        value = _decode(block, rows[key].value) if key in rows else None
        out[key] = default_value(key) if value is None else value
    return out


def validate(block, raw):
    """Returns the cleaned value (a string, or a list of {q, a}) or raises TextError."""
    kind = block["kind"]
    if kind == "pairs":
        if not isinstance(raw, list):
            raise TextError("Send a list of questions and answers.")
        first, second = block["fields"]
        rows = []
        for i, item in enumerate(raw, start=1):
            if not isinstance(item, dict):
                raise TextError("Send a list of questions and answers.")
            q = clean_text(item.get("q"), multiline=False, what=f"{first} {i}")
            a = clean_text(item.get("a"), multiline=True, what=f"{second} {i}")
            if not q or not a:
                raise TextError(f"Fill in both the {first.lower()} and the {second.lower()} for number {i}, "
                                "or delete it.")
            check_length(q, block["q_max"], f"{first} {i}")
            check_length(a, block["a_max"], f"{second} {i}")
            rows.append(dict(q=q, a=a))
        low, high = block.get("min_items", 1), block.get("max_items", 20)
        if len(rows) < low:
            raise TextError(f"Keep at least {low}." if low > 1 else EMPTY)
        if len(rows) > high:
            raise TextError(f"There can be at most {high}.")
        return rows

    what = block["label"]
    text = clean_text(raw, multiline=kind != "line", what=what)
    if kind == "list":
        items = [line for line in text.split("\n") if line]
        for i, item in enumerate(items, start=1):
            check_length(item, block["item_max"], f"Line {i}")
        if len(items) > block["max_items"]:
            raise TextError(f"{what} can have at most {block['max_items']} lines. It has {len(items)}.")
        text = "\n".join(items)
    if not text:
        raise TextError(EMPTY)
    check_length(text, block["max"], what)
    return text


def save(key, raw):
    block = BLOCKS[key]
    value = validate(block, raw)
    row = db.session.get(SiteText, key)
    if value == default_value(key):
        # The same as the original: keep no copy, so the block stays "original".
        if row:
            db.session.delete(row)
    else:
        stored = json.dumps(value, ensure_ascii=False) if block["kind"] == "pairs" else value
        if row:
            row.value = stored
            row.updated_at = utcnow()
        else:
            db.session.add(SiteText(key=key, value=stored, updated_at=utcnow()))
    db.session.commit()


def reset(key):
    row = db.session.get(SiteText, key)
    if row:
        db.session.delete(row)
        db.session.commit()


def admin_block(key, row=None, rows=None):
    block = BLOCKS[key]
    if rows is not None:
        row = rows.get(key)
    elif row is None:
        row = db.session.get(SiteText, key)
    edited = _decode(block, row.value) if row else None
    original = default_value(key)
    out = {k: v for k, v in block.items() if k != "default"}
    out.update(value=original if edited is None else edited, original=original, edited=edited is not None,
               view=block["path"] + (f"#{block['hash']}" if block.get("hash") else ""))
    return out


def admin_pages():
    rows = {r.key: r for r in SiteText.query.all()}
    return [dict(name=p["name"], path=p["path"], blocks=[admin_block(b["key"], rows=rows) for b in p["blocks"]])
            for p in PAGES]


# Service descriptions and notes, edited on the Services and products page

SERVICE_TEXT = {"summary": ("The description", 600), "note": ("The note", 300)}


def clean_service_text(key, raw):
    what, limit = SERVICE_TEXT[key]
    text = clean_text(raw, multiline=True, what=what)
    check_length(text, limit, what)
    return text
