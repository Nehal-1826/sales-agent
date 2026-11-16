"""Tenant billing API under /api/billing/ (paywall-exempt via billing.permissions)."""

import os
import re

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import render
from django.utils import timezone
from rest_framework.decorators import (api_view, authentication_classes, permission_classes,
                                       throttle_classes)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .entitlements import UNLIMITED, get_entitlement
from .gateways import GatewayError, GatewayNotConfigured, gateway_by_name, gateway_for_currency
from .models import Invoice, Plan, Subscription
from . import payments

GSTIN_RE = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
CURRENCIES = ('INR', 'USD')
INTERVALS = ('month', 'year')


def billing_api(*methods):
    """api_view + scoped 'billing' throttle (30/min)."""
    def deco(fn):
        v = api_view(list(methods))(fn)
        v.cls.throttle_classes = [ScopedRateThrottle]
        v.cls.throttle_scope = 'billing'
        return v
    return deco


def _ws(request):
    return getattr(request.user, 'workspace', None)


def _no_ws():
    return Response({'error': 'no_workspace'}, status=403)


def _owner_only(request):
    return request.user.role != 'owner'


def _gateway_503():
    return Response({'error': 'gateway_not_configured'}, status=503)


def _sub(ws):
    return Subscription.objects.select_related('plan').filter(workspace=ws).first()


def plan_dict(p):
    return {'code': p.code, 'name': p.name, 'price_inr_month': p.price_inr_month,
            'price_usd_month': p.price_usd_month, 'price_inr_year': p.price_inr_year,
            'price_usd_year': p.price_usd_year, 'limits': p.limits, 'features': p.features}


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def plans(request):
    return Response([plan_dict(p) for p in Plan.objects.filter(is_active=True)])


@billing_api('GET')
def subscription(request):
    ws = _ws(request)
    if ws is None:
        return _no_ws()
    sub = _sub(ws)
    ent = get_entitlement(ws)
    now = timezone.now()
    amount, _pay = payments.refund_preview(sub, now) if sub else (0, None)
    usage = [{'meter': m, 'limit': ent.limits.get(m, 0), 'used': u} for m, u in ent.usage.items()]
    until = (payments.refund_window_start(sub) + payments.REFUND_WINDOW) if amount > 0 else None
    return Response({
        'plan': {'code': sub.plan.code, 'name': sub.plan.name} if sub else None,
        'status': ent.status, 'interval': sub.interval if sub else None,
        'currency': sub.currency if sub else None, 'gateway': sub.gateway if sub else None,
        'current_period_start': sub.current_period_start if sub else None,
        'current_period_end': sub.current_period_end if sub else None,
        'bonus_days': sub.bonus_days if sub else 0,
        'first_paid_at': sub.first_paid_at if sub else None,
        'cancel_at_period_end': sub.cancel_at_period_end if sub else False,
        'pending_plan_code': sub.pending_plan_code if sub else '',
        'can_refund_until': until, 'refund_preview': {'amount': amount, 'currency': sub.currency if sub else None},
        'email_verified': request.user.email_verified_at is not None,
        'is_paid_access': ent.is_paid_access, 'usage': usage})


BD_FIELDS = ('billing_name', 'billing_email', 'billing_address', 'gstin')


@billing_api('GET', 'PUT')
def billing_details(request):
    ws = _ws(request)
    if ws is None:
        return _no_ws()
    with transaction.atomic():
        sub = Subscription.objects.select_for_update().filter(workspace=ws).first()
        if sub is None:
            return Response({'error': 'no_subscription'}, status=404)
        if request.method == 'PUT':
            if _owner_only(request):
                return Response({'error': 'owner_only'}, status=403)
            d = request.data if isinstance(request.data, dict) else {}
            errs = {}
            vals = {k: str(d.get(k, getattr(sub, k)) or '').strip() for k in BD_FIELDS}
            vals['gstin'] = vals['gstin'].upper()
            if vals['gstin'] and not GSTIN_RE.match(vals['gstin']):
                errs['gstin'] = ['Enter a valid 15-character GSTIN.']
            if vals['billing_email'] and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', vals['billing_email']):
                errs['billing_email'] = ['Enter a valid email address.']
            if errs:
                return Response(errs, status=400)
            for k, v in vals.items():
                setattr(sub, k, v)
            sub.save(update_fields=list(BD_FIELDS) + ['updated_at'])
    return Response({k: getattr(sub, k) or (ws.billing_email if k == 'billing_email' else '')
                     for k in BD_FIELDS})


def _public_url(path):
    base = getattr(settings, 'PUBLIC_BASE_URL', '').rstrip('/')
    return f'{base}/#/settings/billing{path}'


def _parse_choice(request):
    d = request.data if isinstance(request.data, dict) else {}
    plan = Plan.objects.filter(code=str(d.get('plan_code', '')), is_active=True).first()
    interval, currency = d.get('interval'), d.get('currency')
    if plan is None or interval not in INTERVALS or currency not in CURRENCIES:
        return None, None, None
    return plan, interval, currency


@billing_api('POST')
def checkout(request):
    ws = _ws(request)
    if ws is None:
        return _no_ws()
    if _owner_only(request):
        return Response({'error': 'owner_only'}, status=403)
    if request.user.email_verified_at is None:
        return Response({'error': 'email_not_verified'}, status=403)
    plan, interval, currency = _parse_choice(request)
    if plan is None:
        return Response({'error': 'invalid_choice'}, status=400)
    with transaction.atomic():
        sub = Subscription.objects.select_for_update().filter(workspace=ws).first()
        if sub is None:
            return Response({'error': 'no_subscription'}, status=404)
        if sub.status in ('active', 'past_due') and sub.gateway != 'manual':
            return Response({'error': 'already_subscribed'}, status=409)
        try:
            payload, ids = gateway_for_currency(currency).create_checkout(
                ws, plan, interval, currency, request.user.email or ws.billing_email,
                _public_url('?checkout=success'), _public_url('?checkout=cancel'),
                user_name=request.user.get_full_name() or request.user.username)
        except GatewayNotConfigured:
            return _gateway_503()
        except GatewayError:
            return Response({'error': 'gateway_error'}, status=502)
        # the chosen plan is only PENDING until a charge matching it lands (never sub.plan here)
        sub.currency = currency
        sub.pending_checkout_id = ids.get('checkout_id', '')
        sub.pending_plan, sub.pending_interval = plan, interval
        sub.pending_amount = payments.expected_amount(plan, interval, currency)
        sub.gateway = payload['gateway']
        sub.gateway_subscription_id = ids.get('subscription_id', '')
        sub.gateway_customer_id = ids.get('customer_id', '')
        sub.status = Subscription.Statuses.PENDING if sub.status != 'active' else sub.status
        sub.save()
        payments.audit('billing.checkout_started', ws, {'plan': plan.code, 'interval': interval,
                                                       'currency': currency}, actor=request.user)
    return Response(payload)


@billing_api('POST')
def razorpay_verify(request):
    """Checkout callback: verify the signature, then confirm with Razorpay
    server-side before activating (a client claim alone never activates)."""
    from .gateways.base import NormalizedEvent
    ws = _ws(request)
    if ws is None:
        return _no_ws()
    d = request.data if isinstance(request.data, dict) else {}
    pid, sid, sig = (str(d.get(k, '')) for k in
                     ('razorpay_payment_id', 'razorpay_subscription_id', 'razorpay_signature'))
    gw = gateway_by_name('razorpay')
    try:
        if not gw.verify_checkout_signature(pid, sid, sig):
            return Response({'error': 'bad_signature'}, status=400)
        sub = _sub(ws)
        if sub is None or sub.gateway != 'razorpay' or sub.gateway_subscription_id != sid:
            return Response({'error': 'bad_signature'}, status=400)
        rs, rp = gw.fetch_subscription(sid), gw.fetch_payment(pid)
    except GatewayNotConfigured:
        return _gateway_503()
    except GatewayError:
        return Response({'error': 'gateway_error'}, status=502)
    if rs.get('status') not in ('active', 'authenticated') or rp.get('status') != 'captured':
        return Response({'status': 'pending'}, status=202)
    from .gateways.razorpay import _ts
    ev = NormalizedEvent(gateway='razorpay', event_id=f'verify:{pid}', type='charged',
                         subscription_id=sid, customer_id=rs.get('customer_id') or '',
                         payment_id=pid, amount=int(rp.get('amount') or 0),
                         currency=(rp.get('currency') or 'INR').upper(),
                         period_start=_ts(rs.get('current_start')), period_end=_ts(rs.get('current_end')),
                         extra={'plan_id': rs.get('plan_id') or ''})
    with transaction.atomic():
        res = payments.apply_event(payments.lock_subscription(sub.pk), ev)
    if res == 'rejected':
        return Response({'status': 'rejected'}, status=409)
    return Response({'status': 'active' if get_entitlement(ws).is_paid_access else 'pending'})


@billing_api('POST')
def cancel(request):
    ws = _ws(request)
    if ws is None:
        return _no_ws()
    if _owner_only(request):
        return Response({'error': 'owner_only'}, status=403)
    sub = _sub(ws)
    if sub is None:
        return Response({'error': 'no_subscription'}, status=404)
    try:
        out = payments.cancel_subscription(sub.pk, user=request.user,
                                           ip=request.META.get('REMOTE_ADDR'))
    except GatewayNotConfigured:
        return _gateway_503()
    except GatewayError:
        return Response({'error': 'gateway_error'}, status=502)
    if out.get('error'):
        return Response(out, status=400)
    return Response(out)


def _price(plan, interval, currency):
    return getattr(plan, f'price_{currency.lower()}_{interval}')


@billing_api('POST')
def change_plan(request):
    """Same interval + currency only.  Upgrade applies now (gateway prorates);
    downgrade is scheduled and applied on the next renewal charge."""
    ws = _ws(request)
    if ws is None:
        return _no_ws()
    if _owner_only(request):
        return Response({'error': 'owner_only'}, status=403)
    if request.user.email_verified_at is None:
        return Response({'error': 'email_not_verified'}, status=403)
    plan, interval, currency = _parse_choice(request)
    if plan is None:
        return Response({'error': 'invalid_choice'}, status=400)
    sub = _sub(ws)
    if sub is None or sub.status not in ('active', 'past_due') or sub.gateway == 'manual' \
            or not sub.gateway_subscription_id:
        return checkout(request._request) if sub is not None and sub.status != 'active' else \
            Response({'error': 'no_active_subscription'}, status=400)
    if (interval, currency) != (sub.interval, sub.currency):
        return Response({'error': 'interval_change_unsupported'}, status=400)
    if plan.pk == sub.plan_id:
        return Response({'error': 'same_plan'}, status=400)
    upgrade = _price(plan, interval, currency) > _price(sub.plan, interval, currency)
    try:
        gateway_by_name(sub.gateway).change_plan(sub.gateway_subscription_id, plan, interval,
                                                 currency, now=upgrade)
    except GatewayNotConfigured:
        return _gateway_503()
    except GatewayError:
        return Response({'error': 'gateway_error'}, status=502)
    with transaction.atomic():
        s = payments.lock_subscription(sub.pk)
        if upgrade:
            s.plan, s.pending_plan_code = plan, ''
        else:
            s.pending_plan_code = plan.code
        s.save()
        payments.audit('billing.change_plan', ws, {'plan': plan.code, 'upgrade': upgrade},
                       actor=request.user)
    return Response({'status': 'changed' if upgrade else 'scheduled', 'plan': plan.code})


def invoice_row(i):
    return {'id': i.pk, 'number': i.number, 'status': i.status, 'currency': i.currency,
            'subtotal': i.subtotal, 'tax_amount': i.tax_amount, 'total': i.total,
            'amount_refunded': i.amount_refunded, 'issued_at': i.issued_at}


@billing_api('GET')
def invoices(request):
    if _ws(request) is None:
        return _no_ws()
    return Response([invoice_row(i) for i in Invoice.objects.all()[:200]])


def money(minor, currency):
    sym = {'INR': 'Rs. ', 'USD': 'USD '}.get(currency, currency + ' ')
    return f'{sym}{minor // 100:,}.{minor % 100:02d}'


def invoice_context(inv):
    env = os.environ.get
    return {'inv': inv, 'seller_name': env('BILLING_LEGAL_NAME', 'Shailog Technologies'),
            'seller_gstin': env('BILLING_GSTIN', ''), 'seller_address': env('BILLING_ADDRESS', ''),
            'sac': '998314', 'gst_pct': inv.tax_rate_bp / 100,
            'subtotal': money(inv.subtotal, inv.currency), 'tax': money(inv.tax_amount, inv.currency),
            'total': money(inv.total, inv.currency),
            'refunded': money(inv.amount_refunded, inv.currency)}


@billing_api('GET')
def invoice_html(request, invoice_id):
    if _ws(request) is None:
        return _no_ws()
    inv = Invoice.objects.filter(pk=invoice_id).first()   # tenant-scoped manager
    if inv is None:
        return Response({'error': 'not_found'}, status=404)
    resp = render(request._request, 'billing/invoice.html', invoice_context(inv))
    resp['Cache-Control'] = 'private, no-store'
    return resp
