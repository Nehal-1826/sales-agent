import time
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from billing.models import Invoice, Payment, PlatformAuditLog, Subscription, WebhookEvent
from billing.tests.helpers import env_patch, pending_ws, rzp_charged, rzp_post, quiet_logs


def sub_of(ws):
    return Subscription.all_tenants.get(workspace=ws)


class RazorpayWebhookTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()
        self.ws = pending_ws('rz1')
        p = env_patch()
        p.start()
        self.addCleanup(p.stop)

    def test_bad_signature_400_and_nothing_recorded(self):
        r = rzp_post(self.c, rzp_charged(), sig='0' * 64)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(WebhookEvent.objects.count(), 0)
        self.assertEqual(sub_of(self.ws).status, 'pending')

    def test_signature_with_wrong_secret_rejected(self):
        self.assertEqual(rzp_post(self.c, rzp_charged(), secret='other').status_code, 400)

    def test_missing_secret_503(self):
        quiet_logs(self)
        with env_patch(RAZORPAY_WEBHOOK_SECRET=''):
            r = rzp_post(self.c, rzp_charged())
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json(), {'error': 'gateway_not_configured'})

    def test_charge_activates_with_bonus_once_and_invoice(self):
        r = rzp_post(self.c, rzp_charged(ws_id=self.ws.pk))
        self.assertEqual(r.status_code, 200)
        s = sub_of(self.ws)
        self.assertEqual(s.status, 'active')
        self.assertIsNotNone(s.first_paid_at)
        inv = Invoice.all_tenants.get(workspace=self.ws)
        self.assertEqual(inv.total, 353882)
        self.assertEqual((inv.subtotal, inv.tax_amount, inv.tax_rate_bp), (299900, 53982, 1800))
        self.assertEqual(s.current_period_end - inv.period_end, timedelta(days=10))
        now = int(time.time())
        r = rzp_post(self.c, rzp_charged(pay_id='pay_2', start=now + 30 * 86400, end=now + 60 * 86400),
                     event_id='evt_2')
        self.assertEqual(r.status_code, 200)
        s = sub_of(self.ws)
        inv2 = Invoice.all_tenants.get(gateway_payment_id='pay_2')
        self.assertEqual(s.current_period_end, inv2.period_end)   # no second bonus
        self.assertEqual(Invoice.all_tenants.count(), 2)

    def test_duplicate_event_idempotent(self):
        rzp_post(self.c, rzp_charged())
        r = rzp_post(self.c, rzp_charged())
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {'status': 'duplicate'})
        self.assertEqual(Invoice.all_tenants.count(), 1)
        self.assertEqual(Payment.all_tenants.count(), 1)

    def test_same_payment_new_event_id_not_double_invoiced(self):
        rzp_post(self.c, rzp_charged(), event_id='a')
        rzp_post(self.c, rzp_charged(), event_id='b')
        self.assertEqual(Invoice.all_tenants.count(), 1)

    def test_unknown_subscription_rejected(self):
        r = rzp_post(self.c, rzp_charged(sub_id='sub_unknown'))
        self.assertEqual(r.json(), {'status': 'rejected'})
        self.assertEqual(Invoice.all_tenants.count(), 0)

    def test_notes_pointing_at_other_workspace_rejected(self):
        other = pending_ws('rz2', sub_id='sub_R2')
        r = rzp_post(self.c, rzp_charged(sub_id='sub_R1', ws_id=other.pk))
        self.assertEqual(r.json(), {'status': 'rejected'})
        self.assertEqual(sub_of(self.ws).status, 'pending')
        self.assertEqual(sub_of(other).status, 'pending')
        self.assertEqual(WebhookEvent.objects.get().status, 'rejected')

    def test_payment_failed_past_due_then_halted_expired(self):
        rzp_post(self.c, rzp_charged())
        ev = {'event': 'payment.failed', 'payload': {'payment': {'entity': {
            'id': 'pay_f', 'subscription_id': 'sub_R1', 'amount': 1, 'currency': 'INR'}}}}
        rzp_post(self.c, ev, event_id='f1')
        self.assertEqual(sub_of(self.ws).status, 'past_due')
        halted = {'event': 'subscription.halted', 'payload': {'subscription': {'entity': {'id': 'sub_R1'}}}}
        rzp_post(self.c, halted, event_id='h1')
        self.assertEqual(sub_of(self.ws).status, 'expired')

    def test_cancelled_event(self):
        rzp_post(self.c, rzp_charged())
        ev = {'event': 'subscription.cancelled', 'payload': {'subscription': {'entity': {'id': 'sub_R1'}}}}
        rzp_post(self.c, ev, event_id='c1')
        self.assertEqual(sub_of(self.ws).status, 'canceled')
        self.assertTrue(PlatformAuditLog.objects.filter(action='billing.canceled').exists())

    def test_payload_hash_only_stored(self):
        rzp_post(self.c, rzp_charged())
        e = WebhookEvent.objects.get()
        self.assertEqual(len(e.payload_hash), 64)
        self.assertEqual(e.status, 'processed')
