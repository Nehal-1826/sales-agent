"""Indian formats for everything a person reads OFF a screen — invoices,
reports, digests, e-mails.

Fixed on purpose: a document goes to whoever reads it, often more than one
person, so it cannot follow one person's choice. On screens the app follows
the person's own choice instead (frontend/src/lib/format.ts, which reads
User.format and User.clock).

Portable code only: no `%-d` or `%-I` in strftime (they do not exist on
Windows), so leading zeros are removed by hand."""

from datetime import date as a_date, datetime, timezone as dt_timezone
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from django.utils import timezone

IST = ZoneInfo('Asia/Kolkata')
SYMBOLS = {'INR': '₹', 'USD': '$'}


def indian_grouping(digits):
    """'100000' → '1,00,000', '1234567' → '12,34,567' — lakhs and crores."""
    if len(digits) <= 3:
        return digits
    head, parts = digits[:-3], [digits[-3:]]
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    return ','.join([head, *parts]) if head else ','.join(parts)


def number(n):
    """A number with Indian grouping ('1,00,000', '1,234.5', '-1,50,000')."""
    text = str(n)                                   # str keeps a float as short as it is (1234.5, not 1234.500000)
    sign = '-' if text.startswith('-') else ''
    whole, dot, rest = text.lstrip('-').partition('.')
    return sign + indian_grouping(whole) + (dot + rest if dot else '')


def money(minor, currency):
    """An amount in minor units (paise, cents): '₹2,999.00', '$39.00'."""
    sign = '-' if minor < 0 else ''
    minor = abs(int(minor))
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{indian_grouping(str(minor // 100))}.{minor % 100:02d}"


def money_major(major, currency, digits=2):
    """An amount in whole units (rupees, dollars), rounded half-up the way money
    is: '₹499', '₹1,234.00'."""
    sign = '-' if major < 0 else ''
    whole, dot, rest = str(Decimal(str(abs(major))).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)) \
        .partition('.')
    return f"{sign}{SYMBOLS.get(currency, currency + ' ')}{indian_grouping(whole)}{dot}{rest}"


def in_india(value):
    """A datetime in Indian time; a naive one is taken as UTC."""
    if value is None:
        return None
    if timezone.is_naive(value):
        value = value.replace(tzinfo=dt_timezone.utc)
    return value.astimezone(IST)


def date(value):
    """'26/11/2026'. Also takes a plain day (the daily report's `day`)."""
    if isinstance(value, a_date) and not isinstance(value, datetime):
        return f'{value:%d/%m/%Y}'
    moment = in_india(value)
    return f'{moment:%d/%m/%Y}' if moment else ''


def day_month(value):
    """'26/11'."""
    moment = in_india(value)
    return f'{moment:%d/%m}' if moment else ''


def clock(value):
    """'2:05 PM'."""
    moment = in_india(value)
    if not moment:
        return ''
    hour = f'{moment:%I}'.lstrip('0') or '12'
    return f'{hour}:{moment:%M} {moment:%p}'


def datetime_label(value):
    """'26/11/2026, 2:05 PM IST'."""
    moment = in_india(value)
    return f'{date(moment)}, {clock(moment)} IST' if moment else ''
