import hashlib
import hmac
import os
import time
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from billing.models import Invoice, Plan, Subscription
from billing.tests.helpers import client_for, env_patch, pending_ws, quiet_logs, rzp_post, rzp_charged
from billing.tests.test_refunds import fake_response

RZP = 'billing.gateways.razorpay.requests.request'
STR = 'billing.gateways.stripe.requests.request'
BODY = {'plan_code': 'startups', 'interval': 'month', 'currency': 'INR'}


class CheckoutTests(TestCase):
    def setUp(self):
        cache.clear()
        self.ws = pending_ws('co1', sub_id='')
        self.owner, self.user = client_for(self.ws, 'own')
        Plan.objects.filter(code='startups').update(razorpay_plan_ids={'month': 'plan_rzp_m'})

    def test_member_forbidden(self):
        member, _ = client_for(self.ws, 'mem', role='member')
        with env_patch():
            r = member.post('/api/billing/checkout/', BODY, format='json')
        self.assertEqual((r.status_code, r.json()), (403, {'error': 'owner_only'}))

    def test_unverified_email_forbidden(self):
        ws = pending_ws('co2', sub_id='')
        c, _ = client_for(ws, 'unv', verified=False)
        with env_patch():
            r = c.post('/api/billing/checkout/', BODY, format='json')
        self.assertEqual((r.status_code, r.json()), (403, {'error': 'email_not_verified'}))

    def test_gateway_not_configured_503(self):
        quiet_logs(self)
        with mock.patch.dict(os.environ, {}, clear=False):
            for k in ('RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'):
                os.environ.pop(k, None)
            r = self.owner.post('/api/billing/checkout/', BODY, format='json')
        self.assertEqual((r.status_code, r.json()), (503, {'error': 'gateway_not_configured'}))

    def test_razorpay_plan_id_missing_503(self):
        quiet_logs(self)
        Plan.objects.filter(code='startups').update(razorpay_plan_ids={})
        with env_patch():
            r = self.owner.post('/api/billing/checkout/', BODY, format='json')
        self.assertEqual((r.status_code, r.json()), (503, {'error': 'gateway_not_configured'}))

    def test_razorpay_checkout_shape_and_binding(self):
        with env_patch(), mock.patch(RZP, return_value=fake_response({'id': 'sub_new'})) as req:
            r = self.owner.post('/api/billing/checkout/', BODY, format='json')
        self.assertEqual(r.status_code, 200)
        j = r.json()
        self.assertEqual(j['gateway'], 'razorpay')
        o = j['razorpay_options']
        self.assertEqual((o['key'], o['subscription_id']), ('rzp_test_id', 'sub_new'))
        self.assertEqual(o['prefill']['email'], 'own@x.test')
        self.assertEqual(req.call_args.kwargs['json']['plan_id'], 'plan_rzp_m')
        self.assertEqual(req.call_args.kwargs['timeout'], 15)
        self.assertNotIn('rzp_secret', r.content.decode())
        sub = Subscription.all_tenants.get(workspace=self.ws)
        self.assertEqual((sub.gateway_subscription_id, sub.status), ('sub_new', 'pending'))

    def test_stripe_inline_price_data_when_no_price_id(self):
        body = {'plan_code': 'startups', 'interval': 'year', 'currency': 'USD'}
        with env_patch(), mock.patch(STR, return_value=fake_response({'url': 'https://stripe.test/c'})) as req:
            r = self.owner.post('/api/billing/checkout/', body, format='json')
        self.assertEqual(r.json(), {'gateway': 'stripe', 'redirect_url': 'https://stripe.test/c'})
        form = req.call_args.kwargs['data']
        self.assertEqual(form['line_items[0][price_data][unit_amount]'], '39000')
        self.assertEqual(form['line_items[0][price_data][recurring][interval]'], 'year')
        self.assertEqual(form['metadata[workspace_id]'], str(self.ws.pk))
        self.assertEqual(req.call_args.kwargs['headers']['Authorization'], 'Bearer sk_test_x')

    def test_stripe_uses_stored_price_id(self):
        Plan.objects.filter(code='startups').update(stripe_price_ids={'month': 'price_123'})
        body = {'plan_code': 'startups', 'interval': 'month', 'currency': 'USD'}
        with env_patch(), mock.patch(STR, return_value=fake_response({'url': 'u'})) as req:
            self.owner.post('/api/billing/checkout/', body, format='json')
        self.assertEqual(req.call_args.kwargs['data']['line_items[0][price]'], 'price_123')

    def test_invalid_choice_400(self):
        with env_patch():
            r = self.owner.post('/api/billing/checkout/', {**BODY, 'currency': 'EUR'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_plans_public(self):
        from rest_framework.test import APIClient
        r = APIClient().get('/api/billing/plans/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual({p['code'] for p in r.json()}, {'startups', 'business', 'enterprise'})


class VerifyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.ws = pending_ws('vf1', sub_id='sub_V1')
        self.c, _ = client_for(self.ws, 'vown')

    def post(self, sig=None, pid='pay_v', sid='sub_V1'):
        good = hmac.new(b'rzp_secret', f'{pid}|{sid}'.encode(), hashlib.sha256).hexdigest()
        return self.c.post('/api/billing/razorpay/verify/', {
            'razorpay_payment_id': pid, 'razorpay_subscription_id': sid,
            'razorpay_signature': sig or good}, format='json')

    def test_bad_signature_never_activates(self):
        with env_patch():
            r = self.post(sig='0' * 64)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Subscription.all_tenants.get(workspace=self.ws).status, 'pending')

    def test_good_signature_confirms_server_side_then_activates_once(self):
        now = int(time.time())
        resp = [fake_response({'status': 'active', 'current_start': now, 'current_end': now + 30 * 86400,
                               'customer_id': 'cust_v'}),
                fake_response({'status': 'captured', 'amount': 353882, 'currency': 'INR'})]
        with env_patch(), mock.patch(RZP, side_effect=resp):
            r = self.post()
        self.assertEqual(r.json(), {'status': 'active'})
        sub = Subscription.all_tenants.get(workspace=self.ws)
        self.assertEqual(sub.status, 'active')
        self.assertEqual(Invoice.all_tenants.count(), 1)
        # the later webhook for the same payment must not double-invoice
        with env_patch():
            rzp_post(self.c, rzp_charged(sub_id='sub_V1', pay_id='pay_v'), event_id='late')
        self.assertEqual(Invoice.all_tenants.count(), 1)

    def test_uncaptured_payment_stays_pending(self):
        resp = [fake_response({'status': 'created'}), fake_response({'status': 'failed', 'amount': 1})]
        with env_patch(), mock.patch(RZP, side_effect=resp):
            r = self.post()
        self.assertEqual(r.status_code, 202)
        self.assertEqual(Subscription.all_tenants.get(workspace=self.ws).status, 'pending')

    def test_signature_for_other_subscription_id_rejected(self):
        with env_patch():
            r = self.post(sid='sub_OTHER')   # valid HMAC, but not OUR bound subscription
        self.assertEqual(r.status_code, 400)
