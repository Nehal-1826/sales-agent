import hashlib
import hmac
import json
import os
import time
from datetime import timedelta
from unittest import mock

from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.models import Subscription
from billing.tests.test_entitlements import make_ws
from core.models import User

ENV = {'RAZORPAY_KEY_ID': 'rzp_test_id', 'RAZORPAY_KEY_SECRET': 'rzp_secret',
       'RAZORPAY_WEBHOOK_SECRET': 'rzp_whsec', 'STRIPE_SECRET_KEY': 'sk_test_x',
       'STRIPE_WEBHOOK_SECRET': 'whsec_x', 'REFUND_FEE_PCT': '10'}


def env_patch(**over):
    return mock.patch.dict(os.environ, {**ENV, **over})


def pending_ws(slug, gateway='razorpay', sub_id='sub_R1', cust='', currency='INR'):
    ws = make_ws(slug, status='pending', gateway=gateway, end=timezone.now() - timedelta(days=1))
    Subscription.all_tenants.filter(workspace=ws).update(
        gateway_subscription_id=sub_id, gateway_customer_id=cust, currency=currency,
        current_period_start=None, current_period_end=None)
    set_pending(ws, 'startups', 'month', checkout_id=sub_id or 'cs_1')
    return ws


def set_pending(ws, plan_code='startups', interval='month', checkout_id='cs_1'):
    """Simulate a started checkout: pending plan + expected amount (no sub.plan change)."""
    from billing.models import Plan
    from billing.payments import expected_amount
    plan = Plan.objects.get(code=plan_code)
    ids = dict(plan.razorpay_plan_ids or {})
    ids.setdefault(interval, f'plan_rzp_{plan_code[0]}')
    Plan.objects.filter(pk=plan.pk).update(razorpay_plan_ids=ids)
    sub = Subscription.all_tenants.get(workspace=ws)
    cur = sub.currency
    Subscription.all_tenants.filter(pk=sub.pk).update(
        pending_checkout_id=checkout_id, pending_plan=plan, pending_interval=interval,
        pending_amount=expected_amount(plan, interval, cur))


def client_for(ws, username, role='owner', verified=True):
    user = User.objects.create_user(username=username, password='pass12345-x', role=role,
                                    workspace=ws, email=f'{username}@x.test')
    if verified:
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
    return c, user


def rzp_post(client, body: dict, event_id='evt_1', secret='rzp_whsec', sig=None):
    raw = json.dumps(body).encode()
    sig = sig if sig is not None else hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post('/api/webhooks/razorpay/', data=raw, content_type='application/json',
                       HTTP_X_RAZORPAY_SIGNATURE=sig, HTTP_X_RAZORPAY_EVENT_ID=event_id)


def rzp_charged(sub_id='sub_R1', pay_id='pay_1', amount=353882, ws_id=None, start=None, end=None,
                plan_id='plan_rzp_s'):
    now = int(time.time())
    return {'event': 'subscription.charged', 'payload': {
        'subscription': {'entity': {'id': sub_id, 'customer_id': 'cust_1',
                                    'notes': {'workspace_id': str(ws_id)} if ws_id else {},
                                    'plan_id': plan_id, 'current_start': start or now, 'current_end': end or now + 30 * 86400}},
        'payment': {'entity': {'id': pay_id, 'amount': amount, 'currency': 'INR'}}}}


def stripe_post(client, body: dict, secret='whsec_x', t=None, sig=None):
    raw = json.dumps(body).encode()
    t = int(time.time()) if t is None else t
    s = sig or hmac.new(secret.encode(), f'{t}.'.encode() + raw, hashlib.sha256).hexdigest()
    return client.post('/api/webhooks/stripe/', data=raw, content_type='application/json',
                       HTTP_STRIPE_SIGNATURE=f't={t},v1={s}')


def stripe_invoice_paid(ev_id='evt_s1', sub='sub_S1', cust='cus_1', ws_id=None, amount=3900, pi='pi_1'):
    now = int(time.time())
    meta = {'workspace_id': str(ws_id)} if ws_id else {}
    return {'id': ev_id, 'type': 'invoice.paid', 'data': {'object': {
        'id': 'in_1', 'subscription': sub, 'customer': cust, 'amount_paid': amount, 'currency': 'usd',
        'payment_intent': pi, 'subscription_details': {'metadata': meta},
        'lines': {'data': [{'period': {'start': now, 'end': now + 30 * 86400}}]}}}}


def quiet_logs(test):
    """5xx responses make Django's admin-mail handler render a debug template, which
    the test client's template signal cannot copy on Python 3.14 (env quirk)."""
    import logging
    logging.disable(logging.CRITICAL)
    test.addCleanup(logging.disable, logging.NOTSET)


def no_template_capture(test):
    """Python 3.14 + this Django: the test client's template-context capture crashes on
    any template render during a request.  Real rendering is untouched; only capture is off."""
    p = mock.patch('django.test.client.store_rendered_templates')
    p.start()
    test.addCleanup(p.stop)
