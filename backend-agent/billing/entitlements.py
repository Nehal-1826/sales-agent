"""Plan entitlements: what a workspace may do and how much it has used.

Usage is DERIVED from existing rows (no counters = single source of truth).
Every enforcement point is server-side; the UI only mirrors it.

    get_entitlement(ws)      -> Entitlement
    check(ws, meter, add=1)  -> raises QuotaExceeded (402 quota_exceeded)
    require_paid(ws)         -> raises PaymentRequired (402 payment_required)
    has_paid_access(ws)      -> bool

`ws=None` (platform operator, no tenant) is never limited."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.utils import timezone

GRACE = timedelta(days=3)          # past_due keeps access this long after period end
INBOX_AFTER_EXPIRY = timedelta(days=7)   # replies/bounces/unsubscribes keep being read
IST = ZoneInfo('Asia/Kolkata')

# meter -> human label
METERS = {
    'leads': 'leads per month',
    'emails': 'emails per month',
    'mailboxes': 'mailboxes',
    'seats': 'team seats',
    'sequences': 'follow-up sequences',
    'runs_day': 'pipeline runs per day',
    'ai_msgs': 'AI assistant messages per month',
    'whatsapp': 'WhatsApp',
}
UNLIMITED = -1


class BillingError(Exception):
    """Base for 402 errors; core.exceptions turns `.payload` into the response."""

    status_code = 402
    payload = {}


class PaymentRequired(BillingError):
    def __init__(self):
        super().__init__('payment_required')
        self.payload = {'error': 'payment_required'}


class QuotaExceeded(BillingError):
    def __init__(self, meter, limit, used):
        super().__init__(f'quota_exceeded:{meter}')
        self.meter, self.limit, self.used = meter, limit, used
        self.payload = {'error': 'quota_exceeded', 'meter': meter, 'limit': limit, 'used': used}


@dataclass
class Entitlement:
    plan: object
    status: str
    limits: dict
    usage: dict
    period_start: datetime
    period_end: datetime
    is_paid_access: bool
    features: dict = field(default_factory=dict)


def _subscription(ws):
    from .models import Subscription
    return Subscription.all_tenants.filter(workspace_id=ws.pk).select_related('plan').first()


def _access(sub, now):
    if sub is None or sub.current_period_end is None:
        return False
    if sub.status == 'active':
        return now < sub.current_period_end
    if sub.status == 'past_due':
        return now < sub.current_period_end + GRACE
    return False


def has_paid_access(ws, now=None):
    if ws is None:
        return True
    return _access(_subscription(ws), now or timezone.now())


def has_inbox_access(ws, now=None):
    """Reply/bounce/unsubscribe polling continues for 7 days after expiry."""
    if ws is None:
        return True
    now = now or timezone.now()
    sub = _subscription(ws)
    if _access(sub, now):
        return True
    if sub is None or sub.current_period_end is None or sub.status == 'pending':
        return False
    return now < sub.current_period_end + INBOX_AFTER_EXPIRY


def _add_months(dt, n):
    month = dt.month - 1 + n
    year = dt.year + month // 12
    month = month % 12 + 1
    day = min(dt.day, 28)  # anchors on day 29-31 slide to 28: never skips a month
    return dt.replace(year=year, month=month, day=day)


def month_window(sub, now):
    """[start, end) of the current monthly meter window.  Manual subscriptions
    use the calendar month; gateway ones step monthly from the period start
    (so a yearly plan still gets its quota every month)."""
    if sub is None or sub.gateway == 'manual' or sub.current_period_start is None:
        start = now.astimezone(dt_timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return start, _add_months(start, 1)
    anchor = sub.current_period_start
    n = (now.year - anchor.year) * 12 + (now.month - anchor.month)
    start = _add_months(anchor, n)
    if start > now:
        n -= 1
        start = _add_months(anchor, n)
    return start, _add_months(anchor, n + 1)


def _usage(ws, meter, start, now):
    from core.models import (EmailDraft, Lead, Mailbox, PipelineRun, Sequence, User,
                             ChatMessage)
    if meter == 'leads':
        return Lead.all_tenants.filter(workspace_id=ws.pk, created_at__gte=start).count()
    if meter == 'emails':
        return EmailDraft.all_tenants.filter(workspace_id=ws.pk, sent_at__gte=start).count()
    if meter == 'mailboxes':
        return Mailbox.all_tenants.filter(workspace_id=ws.pk).count()
    if meter == 'seats':
        return User.objects.filter(workspace_id=ws.pk, is_active=True).count()
    if meter == 'sequences':
        return Sequence.all_tenants.filter(workspace_id=ws.pk).count()
    if meter == 'runs_day':
        ist_midnight = now.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
        return PipelineRun.all_tenants.filter(workspace_id=ws.pk, started_at__gte=ist_midnight).count()
    if meter == 'ai_msgs':
        return ChatMessage.all_tenants.filter(workspace_id=ws.pk, role='user',
                                              created_at__gte=start).count()
    return 0  # whatsapp is a feature flag, not a counted meter


def get_entitlement(ws, now=None):
    now = now or timezone.now()
    sub = _subscription(ws)
    start, end = month_window(sub, now)
    plan = sub.plan if sub is not None else None
    limits = dict(plan.limits) if plan is not None else {}
    features = dict(plan.features) if plan is not None else {}
    usage = {m: _usage(ws, m, start, now) for m in METERS if m != 'whatsapp'}
    return Entitlement(
        plan=plan, status=sub.status if sub is not None else 'none', limits=limits,
        usage=usage, period_start=sub.current_period_start if sub and sub.current_period_start else start,
        period_end=sub.current_period_end if sub and sub.current_period_end else end,
        is_paid_access=_access(sub, now), features=features)


def require_paid(ws, now=None):
    if ws is not None and not has_paid_access(ws, now):
        raise PaymentRequired()


def check(ws, meter, add=1, now=None):
    """Raise unless `add` more of `meter` still fits the plan.  Also fails when
    there is no paid access at all (fail closed)."""
    if ws is None:
        return
    now = now or timezone.now()
    ent = get_entitlement(ws, now)
    if not ent.is_paid_access:
        raise PaymentRequired()
    if meter == 'whatsapp':
        if not ent.features.get('whatsapp'):
            raise QuotaExceeded('whatsapp', 0, 0)
        return
    limit = ent.limits.get(meter, 0)   # a meter the plan does not define is 0, not unlimited
    if limit == UNLIMITED:
        return
    used = ent.usage.get(meter, 0)
    if used + add > limit:
        raise QuotaExceeded(meter, limit, used)


def check_new_seat(ws):
    """Seat gate for a NEW tenant user.  Only enforced while the workspace has
    paid access (a pending self-serve workspace must still create its owner);
    operator tooling on unpaid workspaces is therefore never blocked."""
    if ws is not None and has_paid_access(ws):
        check(ws, 'seats', add=1)


def headroom(ws, meter, now=None):
    """How many more of `meter` fit (None = unlimited; 0 when unpaid)."""
    if ws is None:
        return None
    ent = get_entitlement(ws, now)
    if not ent.is_paid_access:
        return 0
    limit = ent.limits.get(meter, 0)
    if limit == UNLIMITED:
        return None
    return max(0, limit - ent.usage.get(meter, 0))
