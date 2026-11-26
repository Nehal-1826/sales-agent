"""Indian formats for the warmup service's documents — its invoice PDF, mails
and reports.

Fixed on purpose: a document goes to whoever reads it, often more than one
person, so it cannot follow one person's choice. The same rules as the main
system's ``core/formatting`` (kept apart on purpose: the two services share no
code): lakhs and crores, day-first dates, 12-hour times, Indian time.
Portable code only: no ``%-d`` in strftime (it does not exist on Windows)."""

from __future__ import annotations

from datetime import date as a_date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
SYMBOLS = {"INR": "₹", "USD": "$"}


def indian_grouping(digits: str) -> str:
    """'100000' → '1,00,000', '1234567' → '12,34,567' — lakhs and crores."""
    if len(digits) <= 3:
        return digits
    head, parts = digits[:-3], [digits[-3:]]
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ",".join([head, *parts]) if head else ",".join(parts)


def number(n: int | float) -> str:
    """A number with Indian grouping ('1,00,000', '1,234.5')."""
    text = str(n)
    sign = "-" if text.startswith("-") else ""
    whole, dot, rest = text.lstrip("-").partition(".")
    return sign + indian_grouping(whole) + (dot + rest if dot else "")


def money(minor: int, currency: str) -> str:
    """An amount in minor units (paise, cents): '₹499.00', '$39.00'."""
    sign = "-" if minor < 0 else ""
    minor = abs(int(minor))
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{indian_grouping(str(minor // 100))}.{minor % 100:02d}"


def money_major(major: float, currency: str, digits: int = 2) -> str:
    """An amount in whole units, rounded half-up the way money is: '₹499', '₹1,234.00'."""
    sign = "-" if major < 0 else ""
    rounded = Decimal(str(abs(major))).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    whole, dot, rest = str(rounded).partition(".")
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{indian_grouping(whole)}{dot}{rest}"


def in_india(value: datetime | None) -> datetime | None:
    """A datetime in Indian time; a naive one is taken as UTC."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST)


def date(value: a_date | datetime | None) -> str:
    """'26/11/2026'. Also takes a plain day."""
    if isinstance(value, a_date) and not isinstance(value, datetime):
        return f"{value:%d/%m/%Y}"
    moment = in_india(value)
    return f"{moment:%d/%m/%Y}" if moment else ""


def clock(value: datetime | None) -> str:
    """'2:05 PM'."""
    moment = in_india(value)
    if not moment:
        return ""
    hour = f"{moment:%I}".lstrip("0") or "12"
    return f"{hour}:{moment:%M} {moment:%p}"


def datetime_label(value: datetime | None) -> str:
    """'26/11/2026, 2:05 PM IST'."""
    moment = in_india(value)
    return f"{date(moment)}, {clock(moment)} IST" if moment else ""
