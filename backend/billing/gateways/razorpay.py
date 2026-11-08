"""Razorpay Subscriptions via REST (basic auth).  INR only."""

import hashlib
import hmac
import json
from datetime import datetime, timezone as dt_timezone

import requests

from .base import (TIMEOUT, Gateway, GatewayError, GatewayNotConfigured, NormalizedEvent,
                   require_env)

API = 'https://api.razorpay.com/v1'
TYPES = {
    'subscription.activated': 'activated', 'subscription.charged': 'charged',
    'subscription.halted': 'halted', 'subscription.cancelled': 'cancelled',
    'subscription.completed': 'cancelled', 'payment.failed': 'payment_failed',
    'refund.processed': 'refunded',
}


def _hmac_hex(secret, msg: bytes):
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()


def _ts(v):
    return datetime.fromtimestamp(int(v), tz=dt_timezone.utc) if v else None


class RazorpayGateway(Gateway):
    name = 'razorpay'

    def _call(self, method, path, **kw):
        key_id, secret = require_env('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET')
        try:
            r = requests.request(method, f'{API}{path}', auth=(key_id, secret), timeout=TIMEOUT, **kw)
        except requests.RequestException as e:
            raise GatewayError(f'razorpay unreachable: {type(e).__name__}')
        if r.status_code >= 300:
            raise GatewayError(f'razorpay {r.status_code}')
        return r.json()

    def create_checkout(self, workspace, plan, interval, currency, customer_email,
                        success_url, cancel_url, user_name=''):
        require_env('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET')
        plan_id = (plan.razorpay_plan_ids or {}).get(interval)
        if not plan_id:
            raise GatewayNotConfigured(f'razorpay plan id for {plan.code}/{interval}')
        notes = {'workspace_id': str(workspace.pk), 'plan': plan.code}
        sub = self._call('POST', '/subscriptions', json={
            'plan_id': plan_id, 'total_count': 120 if interval == 'month' else 10,
            'customer_notify': 1, 'notes': notes})
        key_id = require_env('RAZORPAY_KEY_ID')[0]
        options = {'key': key_id, 'subscription_id': sub['id'], 'name': 'Shailog',
                   'description': f'{plan.name} ({interval}ly)',
                   'prefill': {'email': customer_email, 'name': user_name}, 'notes': notes}
        return {'gateway': 'razorpay', 'razorpay_options': options}, \
            {'subscription_id': sub['id'], 'customer_id': sub.get('customer_id') or ''}

    # --- checkout callback ---
    def verify_checkout_signature(self, payment_id, subscription_id, signature):
        secret = require_env('RAZORPAY_KEY_SECRET')[0]
        expected = _hmac_hex(secret, f'{payment_id}|{subscription_id}'.encode())
        return hmac.compare_digest(expected, signature or '')

    def fetch_subscription(self, subscription_id):
        return self._call('GET', f'/subscriptions/{subscription_id}')

    # --- webhook ---
    def verify_webhook(self, raw_body, headers):
        secret = require_env('RAZORPAY_WEBHOOK_SECRET')[0]
        sig = headers.get('X-Razorpay-Signature', '')
        return hmac.compare_digest(_hmac_hex(secret, raw_body), sig)

    def parse_event(self, raw_body, headers):
        data = json.loads(raw_body)
        raw_type = data.get('event', '')
        pl = data.get('payload') or {}
        sub = (pl.get('subscription') or {}).get('entity') or {}
        pay = (pl.get('payment') or {}).get('entity') or {}
        ref = (pl.get('refund') or {}).get('entity') or {}
        event_id = headers.get('X-Razorpay-Event-Id') or hashlib.sha256(raw_body).hexdigest()
        notes = sub.get('notes') if isinstance(sub.get('notes'), dict) else {}
        return NormalizedEvent(
            gateway='razorpay', event_id=event_id, raw_type=raw_type,
            type=TYPES.get(raw_type, 'ignored'),
            workspace_id=str(notes.get('workspace_id') or ''),
            subscription_id=sub.get('id') or pay.get('subscription_id') or '',
            customer_id=sub.get('customer_id') or '',
            payment_id=pay.get('id') or ref.get('payment_id') or '',
            amount=int(ref.get('amount') or pay.get('amount') or 0),
            currency=(pay.get('currency') or ref.get('currency') or 'INR').upper(),
            period_start=_ts(sub.get('current_start')), period_end=_ts(sub.get('current_end')),
            extra={'refund_id': ref.get('id', '')})

    def refund(self, payment_id, amount, currency=''):
        return self._call('POST', f'/payments/{payment_id}/refund', json={'amount': int(amount)})['id']

    def cancel(self, subscription_id, at_period_end):
        self._call('POST', f'/subscriptions/{subscription_id}/cancel',
                   json={'cancel_at_cycle_end': 1 if at_period_end else 0})

    def change_plan(self, subscription_id, plan, interval, currency, now=True):
        plan_id = (plan.razorpay_plan_ids or {}).get(interval)
        if not plan_id:
            raise GatewayNotConfigured(f'razorpay plan id for {plan.code}/{interval}')
        self._call('PATCH', f'/subscriptions/{subscription_id}', json={
            'plan_id': plan_id, 'schedule_change_at': 'now' if now else 'cycle_end'})

    def fetch_payment(self, payment_id):
        return self._call('GET', f'/payments/{payment_id}')
