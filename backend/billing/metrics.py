"""Platform analytics.  Reads every tenant on purpose (all_tenants); callers are
platform-admin views only.  Money = integer minor units."""

import os
from collections import defaultdict
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from core.models import User, Workspace

from .models import Payment, PlatformAuditLog, Refund, Subscription

LIVE = ('active', 'past_due')


def usd_inr():
    try:
        return float(os.environ.get('USD_INR_RATE', '84'))
    except ValueError:
        return 84.0


def inr_eq(amounts, rate=None):
    """{'INR': n, 'USD': n} -> INR-equivalent minor units."""
    rate = usd_inr() if rate is None else rate
    return int(round(amounts.get('INR', 0) + amounts.get('USD', 0) * rate))


def monthly_price(sub):
    cur = sub.currency.lower()
    if sub.interval == 'year':
        return getattr(sub.plan, f'price_{cur}_year') // 12
    return getattr(sub.plan, f'price_{cur}_month')


def mrr():
    out = {'INR': 0, 'USD': 0}
    subs = (Subscription.all_tenants.filter(status__in=LIVE).exclude(gateway='manual')
            .select_related('plan'))
    for s in subs:
        out[s.currency] = out.get(s.currency, 0) + monthly_price(s)
    return out


def _month_key(dt):
    return f'{dt.year:04d}-{dt.month:02d}'


def revenue_12m(now=None, rate=None):
    now = now or timezone.now()
    keys, y, m = [], now.year, now.month
    for _ in range(12):
        keys.append(f'{y:04d}-{m:02d}')
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    keys.reverse()
    since = now.replace(year=int(keys[0][:4]), month=int(keys[0][5:]), day=1, hour=0, minute=0,
                        second=0, microsecond=0)
    by = {k: defaultdict(int) for k in keys}
    for p in Payment.all_tenants.filter(created_at__gte=since).exclude(status='failed'):
        by[_month_key(p.created_at)][p.currency] += p.amount
    for r in Refund.all_tenants.filter(created_at__gte=since, status='processed') \
            .select_related('payment'):
        by[_month_key(r.created_at)][r.payment.currency] -= r.amount
    return [{'month': k, 'inr_equivalent': inr_eq(by[k], rate)} for k in keys]


def overview(now=None):
    now = now or timezone.now()
    rate = usd_inr()
    d7, d30 = now - timedelta(days=7), now - timedelta(days=30)
    m = mrr()
    meq = inr_eq(m, rate)
    S = Subscription.all_tenants
    counts = {'active': S.filter(status='active').count(),
              'pending': S.filter(status='pending').count(),
              'past_due': S.filter(status='past_due').count(),
              'canceled': S.filter(status__in=('canceled', 'expired')).count()}
    signups_30 = Workspace.all_tenants.filter(created_at__gte=d30).count()
    paid_30 = S.filter(workspace__created_at__gte=d30, first_paid_at__isnull=False).count()
    churned = Q(status__in=('canceled', 'expired')) & (
        Q(canceled_at__gte=d30) | Q(canceled_at__isnull=True, updated_at__gte=d30))
    started = S.filter(first_paid_at__lt=d30)
    churn_n = started.filter(churned).count()
    base = started.filter(Q(status__in=LIVE) | churned).count()
    ref = defaultdict(int)
    n_ref = 0
    for r in Refund.all_tenants.filter(created_at__gte=d30, status='processed').select_related('payment'):
        ref[r.payment.currency] += r.amount
        n_ref += 1
    return {
        'mrr': {'INR': m['INR'], 'USD': m['USD'], 'inr_equivalent': meq},
        'arr_inr_equivalent': meq * 12,
        'counts': counts,
        'signups_7d': Workspace.all_tenants.filter(created_at__gte=d7).count(),
        'signups_30d': signups_30,
        'conversion_30d': round(paid_30 / signups_30, 4) if signups_30 else 0,
        'churn_30d': round(churn_n / base, 4) if base else 0,
        'refunds_30d': {'count': n_ref, 'amount_inr_equivalent': inr_eq(ref, rate)},
        'revenue_12m': revenue_12m(now, rate),
    }


def _group(rows, field, blank):
    agg = defaultdict(lambda: [0, 0])
    for ws_val, paid in rows:
        a = agg[(ws_val or blank)]
        a[0] += 1
        a[1] += 1 if paid else 0
    return sorted(agg.items(), key=lambda kv: (-kv[1][0], kv[0]))


def marketing(now=None):
    now = now or timezone.now()
    since = now - timedelta(days=90)
    wss = list(Workspace.all_tenants.filter(created_at__gte=since)
               .values('id', 'created_at', 'signup_source', 'signup_campaign', 'country'))
    ids = [w['id'] for w in wss]
    paid_ids = set(Subscription.all_tenants.filter(workspace_id__in=ids, first_paid_at__isnull=False)
                   .values_list('workspace_id', flat=True))
    verified = set(User.objects.filter(workspace_id__in=ids, email_verified_at__isnull=False)
                   .values_list('workspace_id', flat=True))
    started = set(PlatformAuditLog.objects.filter(action='billing.checkout_started', target_workspace_id__in=ids)
                  .values_list('target_workspace_id', flat=True))
    days = defaultdict(int)
    for w in wss:
        days[w['created_at'].date().isoformat()] += 1
    today = now.date()
    by_day = [{'date': (today - timedelta(days=i)).isoformat(),
               'count': days.get((today - timedelta(days=i)).isoformat(), 0)} for i in range(89, -1, -1)]
    rows = lambda f: [(w[f], w['id'] in paid_ids) for w in wss]  # noqa: E731
    plan_mix = defaultdict(int)
    for s in Subscription.all_tenants.filter(status__in=LIVE).select_related('plan'):
        plan_mix[s.plan.code] += 1
    return {
        'signups_by_day': by_day,
        'by_source': [{'source': k, 'count': v[0], 'paid': v[1]} for k, v in _group(rows('signup_source'), 's', 'direct')],
        'by_campaign': [{'campaign': k, 'count': v[0], 'paid': v[1]} for k, v in _group(rows('signup_campaign'), 'c', '(none)')],
        'by_country': [{'country': k, 'count': v[0], 'paid': v[1]} for k, v in _group(rows('country'), 'k', 'unknown')],
        'funnel': {'signups': len(wss), 'verified': len(verified), 'checkout_started': len(started),
                   'paid': len(paid_ids)},
        'plan_mix': [{'plan': k, 'count': v} for k, v in sorted(plan_mix.items())],
    }
