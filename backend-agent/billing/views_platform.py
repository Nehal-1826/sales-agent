"""Platform admin API (/api/platform/*).  Platform operators only: every route
is IsPlatformAdmin (workspace None, is_staff) and, except the 2FA routes, also
requires a session that passed the second check (core.authz.otp_satisfied: a
verified code when the admin has two-factor, the password when not).
Tenant data is read with the explicit `all_tenants` managers HERE ONLY;
per-tenant work runs inside workspace_context.  Every write needs a reason and
is written to PlatformAuditLog."""

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

from core import impersonation, lockout
from core.authz import (
    handle_2fa_confirm,
    handle_2fa_disable,
    handle_2fa_rotate_confirm,
    handle_2fa_rotate_start,
    handle_2fa_setup,
    handle_2fa_status,
    handle_2fa_verify,
    is_platform_admin,
)
from core.models import ImpersonationTicket, User, Workspace
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
@platform_api('GET', otp=True)
def tfa_status(request):
    return handle_2fa_status(request)


@platform_api('POST', otp=False)
def tfa_setup(request):
    return handle_2fa_setup(request, already_detail='Two-factor is already set up.')


@platform_api('POST', otp=False, extra_throttles=(OtpThrottle,))
def tfa_confirm(request):
    return handle_2fa_confirm(
        request,
        already_detail='Two-factor is already set up.',
        on_done=lambda: _audit(request, 'platform.2fa_enrolled', None),
    )


@platform_api('POST', otp=False, extra_throttles=(OtpThrottle,))
def tfa_verify(request):
    return handle_2fa_verify(request, not_enrolled_detail='Set up two-factor first.')


@platform_api('POST', otp=True, extra_throttles=(OtpThrottle,))
def tfa_disable(request):
    return handle_2fa_disable(
        request,
        on_done=lambda: _audit(request, 'platform.2fa_disabled', None),
    )


@platform_api('POST', otp=True, extra_throttles=(OtpThrottle,))
def tfa_rotate(request):
    return handle_2fa_rotate_start(request)


@platform_api('POST', otp=True, extra_throttles=(OtpThrottle,))
def tfa_rotate_confirm(request):
    return handle_2fa_rotate_confirm(
        request,
        on_done=lambda: _audit(request, 'platform.2fa_rotated', None),
    )



# ------------------------------------------------------------------ overview / marketing
@platform_api('GET')
def overview(request):
    return Response(metrics.overview())


@platform_api('GET')
def marketing(request):
    return Response(metrics.marketing())


# ------------------------------------------------------------------ accounts
# The console's Users page lists the REAL accounts (everyone who can sign
# in). The warmup side's copies of people are only joined to them, by email,
# in the app.

# what core.authz.is_platform_admin decides, as a query
_PLATFORM_ADMIN_Q = Q(workspace__isnull=True, is_staff=True, is_active=True)
_UNVERIFIED_Q = Q(email_verified_at__isnull=True) & ~_PLATFORM_ADMIN_Q
_ACCOUNT_STATUS_Q = {
    'pending': _UNVERIFIED_Q,
    'suspended': Q(is_active=False) | Q(workspace__is_active=False),
    'active': (Q(is_active=True) & (Q(email_verified_at__isnull=False) | _PLATFORM_ADMIN_Q)
               & (Q(workspace__isnull=True) | Q(workspace__is_active=True))),
}
_ACCOUNT_STATUS_Q['suspended'] = _ACCOUNT_STATUS_Q['suspended'] & ~_UNVERIFIED_Q


def _account_status(u):
    """"pending" = the email was not verified yet. A platform admin is never
    pending (the owner creates those accounts by hand)."""
    if getattr(u, 'deleted_at', None) is not None:
        return 'deleted'
    if u.email_verified_at is None and not is_platform_admin(u):
        return 'pending'
    if not u.is_active or (u.workspace is not None and not u.workspace.is_active):
        return 'suspended'
    return 'active'


def _account_row(u, sub=None):
    ws = u.workspace
    name = f'{u.first_name} {u.last_name}'.strip()
    deleted_by = getattr(u, 'deleted_by', None)
    return {
        'id': u.pk, 'email': u.email, 'username': u.username, 'name': name,
        'role': 'platform_admin' if is_platform_admin(u) else u.role,
        'is_platform_admin': is_platform_admin(u),
        'workspace': {'id': ws.pk, 'name': ws.name, 'slug': ws.slug} if ws else None,
        # owners + admins that could take over, this account included
        'workspace_admins': (User.objects.filter(workspace=ws, role__in=('owner', 'admin'),
                                                 is_active=True).count() if ws else 0),
        'plan': sub.plan.name if sub else None,
        'plan_code': sub.plan.code if sub else None,
        'plan_status': sub.status if sub else None,
        'status': _account_status(u),
        'two_factor': bool(u.totp_secret),
        'last_login': u.last_login,
        'joined': u.date_joined,
        'deleted_at': getattr(u, 'deleted_at', None),
        'deleted_by': deleted_by.username if deleted_by else None,
        'purges_at': getattr(u, 'purges_at', None),
    }


@platform_api('GET')
def users(request):
    qs = User.objects.select_related('workspace').order_by('-id')
    for word in (request.query_params.get('q') or '').split():
        qs = qs.filter(Q(email__icontains=word) | Q(username__icontains=word)
                       | Q(first_name__icontains=word) | Q(last_name__icontains=word)
                       | Q(workspace__name__icontains=word))
    role = request.query_params.get('role') or ''
    if role == 'platform_admin':
        qs = qs.filter(_PLATFORM_ADMIN_Q)
    elif role:
        qs = qs.filter(role=role, workspace__isnull=False)
    status = request.query_params.get('status') or ''
    if status and status not in _ACCOUNT_STATUS_Q:
        # never ignored: a filter that matched nothing would quietly list every account
        return _bad('bad_status', 'Unknown status.')
    if status:
        qs = qs.filter(_ACCOUNT_STATUS_Q[status])
    pg = _Pager()
    items = pg.paginate_queryset(qs, request)
    subs = _subs_for([u.workspace_id for u in items if u.workspace_id])
    return pg.get_paginated_response(
        [_account_row(u, subs.get(u.workspace_id) if u.workspace_id else None) for u in items])


def _cannot_enter(admin, target):
    """(error, detail, status) when `admin` may not enter as `target`, else None."""
    if target is None:
        return 'not_found', 'No such account.', 404
    if is_platform_admin(target):
        return 'cannot_impersonate', 'Platform admins cannot be entered — not even yourself.', 400
    if target.workspace is None:      # an account nobody gave a company (made by hand)
        return 'cannot_impersonate', 'This account has no workspace to enter.', 400
    if getattr(target, 'deleted_at', None) is not None:
        return 'cannot_impersonate', 'This account was deleted.', 400
    if not target.is_active:
        return 'cannot_impersonate', 'This account is switched off.', 400
    if not target.workspace.is_active:
        return 'cannot_impersonate', 'This workspace is stopped.', 400
    return None


@platform_api('POST')
def user_impersonate(request, user_id):
    """Issue an "Enter as user" ticket for one workspace account. The ticket
    is returned once, raw; only its hash is kept (core.impersonation)."""
    reason, err = _reason(request)
    if err:
        return err
    target = User.objects.select_related('workspace').filter(pk=user_id).first()
    problem = _cannot_enter(request.user, target)
    if problem:
        return _bad(*problem)
    ticket = impersonation.new_ticket()
    ImpersonationTicket.objects.create(
        key_hash=impersonation.hash_ticket(ticket), admin=request.user, target=target,
        workspace=target.workspace, reason=reason, admin_ip=_ip(request))
    _audit(request, 'platform.impersonate.issue', target.workspace, reason=reason,
           target_user_id=target.pk, target_email=target.email, target_username=target.username)
    ws = target.workspace
    return Response({
        'ticket': ticket,
        'starts_within_minutes': int(impersonation.START_WITHIN.total_seconds() // 60),
        'lasts_minutes': int(impersonation.LASTS.total_seconds() // 60),
        'user': {'id': target.pk, 'username': target.username, 'email': target.email},
        'workspace': {'id': ws.pk, 'name': ws.name, 'slug': ws.slug},
    })


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
