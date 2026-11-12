"""Finding 1: activation is bound to the plan that was actually paid for."""
import time
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from billing.models import Invoice, Plan, PlatformAuditLog, Subscription
from billing.tests.helpers import (client_for, env_patch, no_template_capture, pending_ws,
                                   rzp_charged, rzp_post, stripe_invoice_paid, stripe_post)
from billing.tests.test_refunds import fake_response

STR = 'billing.gateways.stripe.requests.request'


def sub_of(ws):
    return Subscription.all_tenants.get(workspace=ws)


class StripeBindingTests(TestCase):
    def setUp(self):
        cache.clear()
        no_template_capture(self)
        p = env_patch()
        p.start()
        self.addCleanup(p.stop)
        self.ws = pending_ws('ab1', gateway='stripe', sub_id='', currency='USD')
        self.owner, _ = client_for(self.ws, 'abown')
        self.c = APIClient()

    def checkout(self, plan, sid):
        with mock.patch(STR, return_value=fake_response({'url': 'u', 'id': sid})):
            r = self.owner.post('/api/billing/checkout/',
                                {'plan_code': plan, 'interval': 'month', 'currency': 'USD'}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_checkout_does_not_mutate_plan(self):
        before = sub_of(self.ws).plan.code
        self.checkout('enterprise', 'cs_E')
        s = sub_of(self.ws)
        self.assertEqual((s.plan.code, s.pending_plan.code, s.pending_checkout_id),
                         (before, 'enterprise', 'cs_E'))

    def test_pay_cheap_session_after_second_checkout_is_rejected(self):
        self.checkout('startups', 'cs_S')
        self.checkout('enterprise', 'cs_E')
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk, amount=3900))
        self.assertEqual(r.json(), {'status': 'rejected'})
        s = sub_of(self.ws)
        self.assertEqual((s.status, s.plan.code), ('pending', 'startups'))
        self.assertEqual(Invoice.all_tenants.count(), 0)
        self.assertTrue(PlatformAuditLog.objects.filter(action='billing.activation_rejected').exists())

    def test_stale_session_completed_event_rejected(self):
        self.checkout('startups', 'cs_S')
        self.checkout('enterprise', 'cs_E')
        body = {'id': 'evt_c', 'type': 'checkout.session.completed', 'data': {'object': {
            'id': 'cs_S', 'subscription': 'sub_S1', 'customer': 'cus_1', 'client_reference_id': str(self.ws.pk),
            'metadata': {'workspace_id': str(self.ws.pk)}}}}
        r = stripe_post(self.c, body)
        self.assertEqual(r.json(), {'status': 'rejected'})
        self.assertEqual(sub_of(self.ws).gateway_subscription_id, '')

    def test_matching_payment_activates_on_paid_plan(self):
        self.checkout('enterprise', 'cs_E')
        amount = Plan.objects.get(code='enterprise').price_usd_month
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk, amount=amount))
        self.assertEqual(r.json(), {'status': 'ok'})
        s = sub_of(self.ws)
        self.assertEqual((s.status, s.plan.code, s.pending_checkout_id), ('active', 'enterprise', ''))

    def test_charge_below_plan_price_is_recorded_but_grants_nothing(self):
        # prorated upgrade difference: money is invoiced, period/plan/status untouched
        self.checkout('startups', 'cs_S')
        stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk, amount=3900, ev_id='e1', pi='pi_1'))
        before = sub_of(self.ws)
        self.assertEqual(before.status, 'active')
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk, amount=100, ev_id='e2', pi='pi_2'))
        self.assertEqual(r.json(), {'status': 'ok'})
        after = sub_of(self.ws)
        self.assertEqual(Invoice.all_tenants.count(), 2)
        self.assertEqual((after.current_period_end, after.plan_id, after.status),
                         (before.current_period_end, before.plan_id, before.status))
        self.assertTrue(PlatformAuditLog.objects.filter(action='billing.proration_charge').exists())


class RazorpayBindingTests(TestCase):
    def setUp(self):
        cache.clear()
        p = env_patch()
        p.start()
        self.addCleanup(p.stop)
        self.ws = pending_ws('ab2')

    def test_wrong_plan_id_rejected(self):
        r = rzp_post(APIClient(), rzp_charged(plan_id='plan_rzp_e'))
        self.assertEqual(r.json(), {'status': 'rejected'})
        self.assertEqual(sub_of(self.ws).status, 'pending')

    def test_underpaid_rejected(self):
        r = rzp_post(APIClient(), rzp_charged(amount=100))
        self.assertEqual(r.json(), {'status': 'rejected'})

    def test_missing_plan_id_fails_closed(self):
        r = rzp_post(APIClient(), rzp_charged(plan_id=''))
        self.assertEqual(r.json(), {'status': 'rejected'})
