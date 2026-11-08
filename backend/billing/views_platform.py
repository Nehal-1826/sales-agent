"""Platform admin API (/api/platform/*).  Platform operators only: every route
is IsPlatformAdmin (workspace None, is_staff) and, except 2fa setup/confirm/
verify, also requires a TOTP-verified token session.  Tenant data is read with
the explicit `all_tenants` managers HERE ONLY; per-tenant work runs inside
workspace_context.  Every write needs a reason and is written to PlatformAuditLog."""

import functools
import os
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import render
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from core import lockout, totp
from core.models import PlatformSession, User, Workspace
from core.permissions import IsPlatformAdmin, IsPlatformAdminWithOTP
from core.tenancy import workspace_context
from core.throttles import OtpThrottle

from . import metrics, payments
from .entitlements import METERS, get_entitlement
from .models import Invoice, Payment, Plan, PlatformAuditLog, Subscription
from .views import invoice_context


def platform_api(*methods, otp=True, extra_throttles=()):
    def deco(fn):
        # permission/throttle decorators must wrap the function BEFORE api_view
        fn = throttle_classes([AnonRateThrottle, UserRateThrottle, *extra_throttles])(fn)
        fn = permission_classes([IsPlatformAdminWithOTP if otp else IsPlatformAdmin])(fn)
        return api_view(list(methods))(fn)
    return deco


def _ip(request):
    return lockout.client_ip(request) or None


def _bad(error, detail, status=400, **extra):
    return Response({'error': error, 'detail': detail, **extra}, status=status)


def _reason(request):
    r = request.data.get('reason') if hasattr(request.data, 'get') else None
    r = r.strip() if isinstance(r, str) else ''
    return (r[:500], None) if r else (None, _bad('reason_required', 'A reason is required.',
                                                  reason=['This field is required.']))


def _audit(request, action, ws, **meta):
    payments.audit(action, ws, meta, actor=request.user, ip=_ip(request))


class _Pager(PageNumberPagination):
    page_size = 25
    page_size_query_param = None


def _page(request, qs, row):
    pg = _Pager()
    items = pg.paginate_queryset(qs, request)
    return pg.get_paginated_response([row(x) for x in items])


# ------------------------------------------------------------------ 2FA
def _otp_locked_key(user):
    return f'otp:{user.pk}'


def _check_code(request, secret):
    """(step, error Response).  Lockout: 10 failures / 15 min per user."""
    user = request.user
    if lockout.is_locked(_otp_locked_key(user), ''):
        return None, Response({'error': 'too_many_attempts'}, status=429)
    code = request.data.get('code') if hasattr(request.data, 'get') else ''
    last = 0
    if secret == user.totp_secret:   # replay guard across all of this admin's sessions
        last = max([ps.last_otp_step for ps in
                    PlatformSession.objects.filter(token__user=user)] or [0])
    step = totp.match_step(secret, code if isinstance(code, str) else '', last_step=last)
    if step is None:
        lockout.record_failure(_otp_locked_key(user), '')
        return None, _bad('invalid_code', 'Invalid or expired code.')
    lockout.clear(_otp_locked_key(user), '')
    return step, None


def _mark_verified(request, step):
    PlatformSession.objects.update_or_create(
        token=request.auth, defaults={'otp_verified_at': timezone.now(), 'last_otp_step': step})


@platform_api('POST', otp=False)
def tfa_setup(request):
    u = request.user
    if u.totp_secret:
        return _bad('already_enrolled', 'Two-factor is already set up.', 409)
    u.totp_pending = totp.new_secret()
    u.save(update_fields=['totp_pending'])
    return Response({'secret': u.totp_pending,
                     'otpauth_uri': totp.otpauth_uri(u.totp_pending, u.email or u.username)})


@platform_api('POST', otp=False, extra_throttles=(OtpThrottle,))
def tfa_confirm(request):
    u = request.user
    if u.totp_secret:
        return _bad('already_enrolled', 'Two-factor is already set up.', 409)
    if not u.totp_pending:
        return _bad('not_started', 'Start setup first.')
    step, err = _check_code(request, u.totp_pending)
    if err:
        return err
    u.totp_secret, u.totp_pending = u.totp_pending, ''
    u.save(update_fields=['totp_secret', 'totp_pending'])
    _mark_verified(request, step)
    _audit(request, 'platform.2fa_enrolled', None)
    return Response({'enrolled': True, 'verified': True})


@platform_api('POST', otp=False, extra_throttles=(OtpThrottle,))
def tfa_verify(request):
    u = request.user
    if not u.totp_secret:
        return _bad('not_enrolled', 'Set up two-factor first.', 409)
    step, err = _check_code(request, u.totp_secret)
    if err:
        return err
    _mark_verified(request, step)
    return Response({'verified': True})


# ------------------------------------------------------------------ overview / marketing
@platform_api('GET')
def overview(request):
    return Response(metrics.overview())


@platform_api('GET')
def marketing(request):
    return Response(metrics.marketing())


# ------------------------------------------------------------------ tenants
def _last_activity(ws):
    from core.models import EmailDraft, PipelineRun
    a = PipelineRun.objects.order_by('-started_at').values_list('started_at', flat=True).first()
    b = EmailDraft.objects.filter(sent_at__isnull=False).order_by('-sent_at') \
        .values_list('sent_at', flat=True).first()
    return max([x for x in (a, b) if x], default=None)


def _owner_emails(ids):
    out = {}
    for u in User.objects.filter(workspace_id__in=ids, role='owner').order_by('-id'):
        out[u.workspace_id] = u.email or u.username   # lowest id wins (iterated last)
    return out


def _tenant_row(ws, sub, owner, detail=False):
    with workspace_context(ws):
        ent = get_entitlement(ws)
        last = _last_activity(ws)
        users = User.objects.filter(workspace=ws).count() if detail else None
    usage = {m: {'used': ent.usage.get(m, 0), 'limit': ent.limits.get(m, 0)}
             for m in METERS if m != 'whatsapp'}
    row = {'id': ws.pk, 'workspace': ws.name, 'owner_email': owner or '',
           'plan': {'code': sub.plan.code, 'name': sub.plan.name} if sub else None,
           'status': sub.status if sub else 'none', 'suspended': not ws.is_active,
           'period_end': sub.current_period_end if sub else None, 'usage': usage,
           'created': ws.created_at, 'last_activity': last, 'country': ws.country,
           'signup_source': ws.signup_source}
    if detail:
        row.update({'slug': ws.slug, 'users': users, 'billing_email': ws.billing_email,
                    'signup_campaign': ws.signup_campaign, 'signup_referrer': ws.signup_referrer,
                    'subscription': None if sub is None else {
                        'interval': sub.interval, 'currency': sub.currency, 'gateway': sub.gateway,
                        'current_period_start': sub.current_period_start, 'bonus_days': sub.bonus_days,
                        'first_paid_at': sub.first_paid_at, 'cancel_at_period_end': sub.cancel_at_period_end,
                        'canceled_at': sub.canceled_at}})
    return row


def _subs_for(ids):
    return {s.workspace_id: s for s in
            Subscription.all_tenants.filter(workspace_id__in=ids).select_related('plan')}


@platform_api('GET')
def tenants(request):
    qs = Workspace.all_tenants.order_by('-id')
    q = (request.query_params.get('q') or '').strip()
    if q:
        owners = User.objects.filter(role='owner', email__icontains=q).values('workspace_id')
        qs = qs.filter(Q(name__icontains=q) | Q(slug__icontains=q) | Q(pk__in=owners))
    status = request.query_params.get('status') or ''
    if status == 'suspended':
        qs = qs.filter(is_active=False)
    elif status == 'none':
        qs = qs.exclude(pk__in=Subscription.all_tenants.values('workspace_id'))
    elif status:
        qs = qs.filter(pk__in=Subscription.all_tenants.filter(status=status).values('workspace_id'))
    plan = request.query_params.get('plan') or ''
    if plan:
        qs = qs.filter(pk__in=Subscription.all_tenants.filter(plan__code=plan).values('workspace_id'))
    pg = _Pager()
    items = pg.paginate_queryset(qs, request)
    ids = [w.pk for w in items]
    subs, owners = _subs_for(ids), _owner_emails(ids)
    return pg.get_paginated_response([_tenant_row(w, subs.get(w.pk), owners.get(w.pk)) for w in items])


def _ws_or_404(tid):
    ws = Workspace.all_tenants.filter(pk=tid).first()
    return ws, (None if ws else _bad('not_found', 'No such tenant.', 404))


def _tenant_detail(ws):
    sub = _subs_for([ws.pk]).get(ws.pk)
    return _tenant_row(ws, sub, _owner_emails([ws.pk]).get(ws.pk), detail=True)


@platform_api('GET')
def tenant_detail(request, tenant_id):
    ws, err = _ws_or_404(tenant_id)
    return err or Response(_tenant_detail(ws))


def _tenant_write(request, tenant_id, action, fn):
    """Shared shell: 404 / reason check / lock / fn(ws, sub, request) -> (meta, error)."""
    ws, err = _ws_or_404(tenant_id)
    if err:
        return err
    reason, err = _reason(request)
    if err:
        return err
    with workspace_context(ws), transaction.atomic():
        ws = Workspace.all_tenants.select_for_update().get(pk=ws.pk)
        sub = Subscription.objects.select_for_update().select_related('plan').filter(workspace=ws).first()
        meta, err = fn(ws, sub, request)
        if err:
            return err
        _audit(request, f'platform.{action}', ws, reason=reason, **meta)
    return Response(_tenant_detail(Workspace.all_tenants.get(pk=ws.pk)))


@platform_api('POST')
def tenant_suspend(request, tenant_id):
    def run(ws, sub, req):
        ws.is_active = False
        ws.save(update_fields=['is_active'])
        return {}, None
    return _tenant_write(request, tenant_id, 'suspend', run)


@platform_api('POST')
def tenant_unsuspend(request, tenant_id):
    def run(ws, sub, req):
        ws.is_active = True
        ws.save(update_fields=['is_active'])
        return {}, None
    return _tenant_write(request, tenant_id, 'unsuspend', run)


@platform_api('POST')
def tenant_extend(request, tenant_id):
    days = request.data.get('days')
    if isinstance(days, bool) or not isinstance(days, int) or not 1 <= days <= 3650:
        return _bad('invalid_days', 'days must be a whole number between 1 and 3650.', days=['invalid'])

    def run(ws, sub, req):
        if sub is None or sub.status not in ('active', 'past_due', 'expired'):
            return None, _bad('not_extendable', 'Only active, past-due or expired subscriptions can be extended.')
        now = timezone.now()
        old = sub.current_period_end
        sub.current_period_end = max(old or now, now) + timedelta(days=days)
        if sub.status == 'expired':
            sub.status = 'active'
        sub.save()
        return {'days': days, 'from': old.isoformat() if old else None,
                'to': sub.current_period_end.isoformat()}, None
    return _tenant_write(request, tenant_id, 'extend', run)


@platform_api('POST')
def tenant_change_plan(request, tenant_id):
    code = request.data.get('plan_code')
    plan = Plan.objects.filter(code=code).first() if isinstance(code, str) else None
    if plan is None:
        return _bad('unknown_plan', 'No such plan.', plan_code=['unknown plan'])

    def run(ws, sub, req):
        if sub is None:
            return None, _bad('no_subscription', 'Tenant has no subscription.')
        old = sub.plan.code
        sub.plan, sub.pending_plan_code = plan, ''
        sub.save()
        return {'from': old, 'to': plan.code}, None
    return _tenant_write(request, tenant_id, 'change_plan', run)


# ------------------------------------------------------------------ payments / invoices
def _payment_row(p):
    inv = p.invoice
    captured = p.status == Payment.Statuses.CAPTURED
    return {'id': p.pk, 'workspace': p.workspace.name, 'created_at': p.created_at, 'amount': p.amount,
            'currency': p.currency, 'refunded_amount': inv.amount_refunded,
            'refundable': max(inv.total - inv.amount_refunded, 0) if captured else 0,
            'gateway': p.gateway, 'status': p.status, 'invoice': inv.number}


@platform_api('GET')
def payments_list(request):
    qs = Payment.all_tenants.select_related('invoice', 'workspace').order_by('-id')
    return _page(request, qs, _payment_row)


@platform_api('POST')
def payment_refund(request, payment_id):
    pay = Payment.all_tenants.select_related('workspace').filter(pk=payment_id).first()
    if pay is None:
        return _bad('not_found', 'No such payment.', 404)
    reason, err = _reason(request)
    if err:
        return err
    amount = request.data.get('amount')
    if isinstance(amount, bool) or not isinstance(amount, int) or amount <= 0:
        return _bad('amount_invalid', 'amount must be a positive integer (minor units).', amount=['invalid'])
    with workspace_context(pay.workspace):
        body, code = payments.platform_refund(pay.pk, amount, reason, actor=request.user, ip=_ip(request))
    if code != 200:
        body = {**body, 'detail': body.get('detail') or body['error'].replace('_', ' ')}
    return Response(body, status=code)


@platform_api('GET')
def invoices_list(request):
    qs = Invoice.all_tenants.select_related('workspace').order_by('-id')
    return _page(request, qs, lambda i: {
        'id': i.pk, 'workspace': i.workspace.name, 'number': i.number, 'total': i.total,
        'currency': i.currency, 'status': i.status, 'issued_at': i.issued_at})


@platform_api('GET')
def invoice_html(request, invoice_id):
    inv = Invoice.all_tenants.select_related('subscription__plan').filter(pk=invoice_id).first()
    if inv is None:
        return _bad('not_found', 'No such invoice.', 404)
    resp = render(request._request, 'billing/invoice.html', invoice_context(inv))
    resp['Cache-Control'] = 'private, no-store'
    return resp


# ------------------------------------------------------------------ plans
def _plan_row(p):
    return {'code': p.code, 'name': p.name, 'active': p.is_active, 'sort': p.sort,
            'price_inr_month': p.price_inr_month, 'price_usd_month': p.price_usd_month,
            'price_inr_year': p.price_inr_year, 'price_usd_year': p.price_usd_year,
            'limits': p.limits, 'features': p.features}


PRICE_FIELDS = ('price_inr_month', 'price_usd_month', 'price_inr_year', 'price_usd_year')
LIMIT_KEYS = tuple(m for m in METERS if m != 'whatsapp')
MAX_INT = 2_000_000_000


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _validate_plan(plan, data):
    """-> (updates dict, errors dict)."""
    up, errs = {}, {}
    if 'name' in data:
        n = data['name']
        if isinstance(n, str) and 1 <= len(n.strip()) <= 60:
            up['name'] = n.strip()
        else:
            errs['name'] = ['1-60 characters']
    if 'active' in data:
        if isinstance(data['active'], bool):
            up['is_active'] = data['active']
        else:
            errs['active'] = ['must be true or false']
    if 'sort' in data:
        if _is_int(data['sort']) and 0 <= data['sort'] <= 32767:
            up['sort'] = data['sort']
        else:
            errs['sort'] = ['0-32767']
    for f in PRICE_FIELDS:
        if f in data:
            if _is_int(data[f]) and 0 <= data[f] <= MAX_INT:
                up[f] = data[f]
            else:
                errs[f] = ['must be a non-negative integer (minor units)']
    if 'limits' in data:
        lim = data['limits']
        bad = (not isinstance(lim, dict) or any(k not in LIMIT_KEYS for k in lim)
               or any(not _is_int(v) or v < -1 or v > MAX_INT for v in lim.values()))
        if bad:
            errs['limits'] = [f'keys must be among {", ".join(LIMIT_KEYS)}; values integers >= -1 (-1 = unlimited)']
        else:
            up['limits'] = lim
    if 'features' in data:
        f = data['features']
        if isinstance(f, dict) and all(isinstance(k, str) and isinstance(v, bool) for k, v in f.items()):
            up['features'] = f
        else:
            errs['features'] = ['must map names to true/false']
    return up, errs


@platform_api('GET')
def plans_list(request):
    return Response([_plan_row(p) for p in Plan.objects.all()])


@platform_api('PUT')
def plan_update(request, code):
    data = request.data if hasattr(request.data, 'get') else {}
    if data.get('code', code) != code:
        return _bad('code_mismatch', 'Plan code cannot be changed.', code=['mismatch'])
    # the console sends the whole plan with no reason field: optional here, audited when given
    reason = data.get('reason')
    reason = reason.strip()[:500] if isinstance(reason, str) else ''
    with transaction.atomic():
        plan = Plan.objects.select_for_update().filter(code=code).first()
        if plan is None:
            return _bad('not_found', 'No such plan.', 404)
        up, errs = _validate_plan(plan, data)
        if errs:
            return Response({'error': 'invalid', 'detail': 'Invalid plan values.', **errs}, status=400)
        before = _plan_row(plan)
        for k, v in up.items():
            setattr(plan, k, v)
        plan.save()
        after = _plan_row(plan)
        changed = {k: [before[k], after[k]] for k in after if before[k] != after[k]}
        _audit(request, 'platform.plan_update', None, reason=reason, plan=code, changed=changed)
    return Response(after)


# ------------------------------------------------------------------ audit
@platform_api('GET')
def audit_list(request):
    qs = PlatformAuditLog.objects.select_related('actor', 'target_workspace').order_by('-id')
    return _page(request, qs, lambda a: {
        'id': a.pk, 'created_at': a.created_at,
        'actor': a.actor.username if a.actor else '', 'action': a.action,
        'target': a.target_workspace.name if a.target_workspace else '',
        'reason': (a.meta or {}).get('reason', ''), 'ip': a.ip or '', 'detail': a.meta})
