import time

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from billing.models import Invoice, Subscription
from billing.payments import next_invoice_number, split_tax
from billing.tests.helpers import env_patch, pending_ws, stripe_invoice_paid, stripe_post, quiet_logs


def sub_of(ws):
    return Subscription.all_tenants.get(workspace=ws)


class StripeWebhookTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()
        self.ws = pending_ws('st1', gateway='stripe', sub_id='', currency='USD')
        p = env_patch()
        p.start()
        self.addCleanup(p.stop)

    def test_good_signature_activates_and_binds_ids(self):
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk))
        self.assertEqual(r.status_code, 200)
        s = sub_of(self.ws)
        self.assertEqual((s.status, s.gateway_subscription_id, s.gateway_customer_id),
                         ('active', 'sub_S1', 'cus_1'))
        inv = Invoice.all_tenants.get()
        self.assertEqual((inv.subtotal, inv.tax_amount, inv.tax_rate_bp, inv.total), (3900, 0, 0, 3900))

    def test_bad_signature(self):
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk), sig='ab' * 32)
        self.assertEqual(r.status_code, 400)

    def test_stale_timestamp_rejected(self):
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk), t=int(time.time()) - 301)
        self.assertEqual(r.status_code, 400)

    def test_fresh_edge_accepted(self):
        r = stripe_post(self.c, stripe_invoice_paid(ws_id=self.ws.pk), t=int(time.time()) - 290)
        self.assertEqual(r.status_code, 200)

    def test_replayed_event_is_duplicate(self):
        body = stripe_invoice_paid(ws_id=self.ws.pk)
        stripe_post(self.c, body)
        r = stripe_post(self.c, body)
        self.assertEqual(r.json(), {'status': 'duplicate'})
        self.assertEqual(Invoice.all_tenants.count(), 1)

    def test_cross_tenant_spoof_rejected(self):
        victim = pending_ws('st2', gateway='stripe', sub_id='sub_V', cust='cus_V', currency='USD')
        r = stripe_post(self.c, stripe_invoice_paid(sub='sub_V', cust='cus_ATTACKER', ws_id=self.ws.pk))
        self.assertEqual(r.json(), {'status': 'rejected'})
        self.assertEqual(sub_of(victim).status, 'pending')
        self.assertEqual(sub_of(self.ws).status, 'pending')
        self.assertEqual(Invoice.all_tenants.count(), 0)

    def test_claim_cannot_override_stored_ids(self):
        bound = pending_ws('st3', gateway='stripe', sub_id='sub_B', cust='cus_B', currency='USD')
        r = stripe_post(self.c, stripe_invoice_paid(sub='sub_OTHER', cust='cus_OTHER', ws_id=bound.pk))
        self.assertEqual(r.json(), {'status': 'rejected'})
        self.assertEqual(sub_of(bound).status, 'pending')

    def test_missing_secret_503(self):
        quiet_logs(self)
        with env_patch(STRIPE_WEBHOOK_SECRET=''):
            self.assertEqual(stripe_post(self.c, stripe_invoice_paid()).status_code, 503)


class InvoiceNumberTests(TestCase):
    def test_sequential_unique_format(self):
        nums = [next_invoice_number() for _ in range(3)]
        y = timezone.now().year
        self.assertEqual(nums, [f'SHL-{y}-00000{i}' for i in (1, 2, 3)])

    def test_gst_split(self):
        self.assertEqual(split_tax(11800, 'INR'), (10000, 1800, 1800))
        self.assertEqual(split_tax(353882, 'INR'), (299900, 1800, 53982))
        sub, _rate, tax = split_tax(1001, 'INR')
        self.assertEqual(sub + tax, 1001)
        self.assertEqual(split_tax(3900, 'USD'), (3900, 0, 0))
