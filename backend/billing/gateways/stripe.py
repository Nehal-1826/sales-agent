"""Stripe Checkout (subscription mode) via REST (bearer secret key).  USD only."""

import hashlib
import hmac
import json
import time
from datetime import datetime, timezone as dt_timezone

import requests

from .base import TIMEOUT, Gateway, GatewayError, NormalizedEvent, require_env

API = 'https://api.stripe.com/v1'
TOLERANCE = 300
TYPES = {
    'checkout.session.completed': 'activated', 'invoice.paid': 'charged',
    'invoice.payment_failed': 'payment_failed', 'customer.subscription.deleted': 'cancelled',
    'charge.refunded': 'refunded',
}


def _ts(v):
    return datetime.fromtimestamp(int(v), tz=dt_timezone.utc) if v else None


def parse_signature_header(value):
    t, sigs = None, []
    for part in (value or '').split(','):
        k, _, v = part.strip().partition('=')
        if k == 't':
            t = v
        elif k == 'v1' and v:
            sigs.append(v)
    return t, sigs


class StripeGateway(Gateway):
    name = 'stripe'

    def _call(self, method, path, data=None):
        key = require_env('STRIPE_SECRET_KEY')[0]
        try:
            r = requests.request(method, f'{API}{path}', data=data, timeout=TIMEOUT,
                                 headers={'Authorization': f'Bearer {key}'})
        except requests.RequestException as e:
            raise GatewayError(f'stripe unreachable: {type(e).__name__}')
        if r.status_code >= 300:
            raise GatewayError(f'stripe {r.status_code}')
        return r.json()

    def create_checkout(self, workspace, plan, interval, currency, customer_email,
                        success_url, cancel_url, user_name=''):
        require_env('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET')
        wid = str(workspace.pk)
        form = {
            'mode': 'subscription', 'success_url': success_url, 'cancel_url': cancel_url,
            'client_reference_id': wid, 'customer_email': customer_email,
            'metadata[workspace_id]': wid, 'subscription_data[metadata][workspace_id]': wid,
            'line_items[0][quantity]': '1',
        }
        price_id = (plan.stripe_price_ids or {}).get(interval)
        if price_id:
            form['line_items[0][price]'] = price_id
        else:
            amount = plan.price_usd_year if interval == 'year' else plan.price_usd_month
            form.update({
                'line_items[0][price_data][currency]': 'usd',
                'line_items[0][price_data][unit_amount]': str(amount),
                'line_items[0][price_data][recurring][interval]': interval,
                'line_items[0][price_data][product_data][name]': f'Shailog {plan.name}',
            })
        s = self._call('POST', '/checkout/sessions', form)
        return {'gateway': 'stripe', 'redirect_url': s['url']}, {'subscription_id': '', 'customer_id': ''}

    def verify_webhook(self, raw_body, headers, now=None):
        secret = require_env('STRIPE_WEBHOOK_SECRET')[0]
        t, sigs = parse_signature_header(headers.get('Stripe-Signature', ''))
        if not t or not sigs or not t.isdigit():
            return False
        if abs((now or time.time()) - int(t)) > TOLERANCE:
            return False
        expected = hmac.new(secret.encode(), t.encode() + b'.' + raw_body, hashlib.sha256).hexdigest()
        return any(hmac.compare_digest(expected, s) for s in sigs)

    def parse_event(self, raw_body, headers):
        ev = json.loads(raw_body)
        raw_type = ev.get('type', '')
        o = (ev.get('data') or {}).get('object') or {}
        meta = o.get('metadata') if isinstance(o.get('metadata'), dict) else {}
        sd = o.get('subscription_details') or {}
        if not meta.get('workspace_id') and isinstance(sd.get('metadata'), dict):
            meta = sd['metadata']
        wid = meta.get('workspace_id') or o.get('client_reference_id') or ''
        line = ((o.get('lines') or {}).get('data') or [{}])[0].get('period') or {}
        typ = TYPES.get(raw_type, 'ignored')
        if raw_type.startswith('invoice.'):
            sub_id = o.get('subscription') or ''
            pay = o.get('payment_intent') or o.get('charge') or o.get('id') or ''
            amount = int(o.get('amount_paid') or 0) if typ == 'charged' else int(o.get('amount_due') or 0)
        elif raw_type == 'charge.refunded':
            sub_id, pay, amount = '', o.get('payment_intent') or o.get('id') or '', int(o.get('amount_refunded') or 0)
        elif raw_type == 'customer.subscription.deleted':
            sub_id, pay, amount = o.get('id') or '', '', 0
        else:
            sub_id, pay, amount = o.get('subscription') or '', '', 0
        return NormalizedEvent(
            gateway='stripe', event_id=ev.get('id', ''), raw_type=raw_type, type=typ,
            workspace_id=str(wid), subscription_id=sub_id, customer_id=o.get('customer') or '',
            payment_id=pay, amount=amount, currency=(o.get('currency') or 'usd').upper(),
            period_start=_ts(line.get('start')), period_end=_ts(line.get('end')),
            extra={'invoice_id': o.get('id', '') if raw_type.startswith('invoice.') else ''})

    def refund(self, payment_id, amount, currency=''):
        return self._call('POST', '/refunds', {'payment_intent': payment_id, 'amount': str(int(amount))})['id']

    def cancel(self, subscription_id, at_period_end):
        if at_period_end:
            self._call('POST', f'/subscriptions/{subscription_id}', {'cancel_at_period_end': 'true'})
        else:
            self._call('DELETE', f'/subscriptions/{subscription_id}')

    def change_plan(self, subscription_id, plan, interval, currency, now=True):
        s = self._call('GET', f'/subscriptions/{subscription_id}')
        item = s['items']['data'][0]['id']
        form = {'items[0][id]': item,
                'proration_behavior': 'create_prorations' if now else 'none'}
        price_id = (plan.stripe_price_ids or {}).get(interval)
        if not price_id:   # inline price_data needs an existing Product id, which we do not store
            from .base import GatewayNotConfigured
            raise GatewayNotConfigured(f'stripe price id for {plan.code}/{interval}')
        form['items[0][price]'] = price_id
        self._call('POST', f'/subscriptions/{subscription_id}', form)
