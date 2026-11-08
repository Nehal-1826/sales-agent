import time
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from billing import payments
from billing.models import Invoice, Payment, PlatformAuditLog, Refund, Subscription
from billing.tests.helpers import (client_for, env_patch, pending_ws, rzp_charged, rzp_post, quiet_logs)
from core.tenancy import workspace_context

T0 = int(time.time())
DAY = 86400


def fake_response(payload, status=200):
    m = mock.Mock(status_code=status)
    m.json.return_value = payload
    return m


class RefundTests(TestCase):
    def setUp(self):
        cache.clear()
        p = env_patch()
        p.start()
        self.addCleanup(p.stop)
        self.ws = pending_ws('rf1')
        Subscription.all_tenants.filter(workspace=self.ws).update(pending_amount=300000)   # round test figure
        rzp_post(APIClient(), rzp_charged(pay_id='pay_1', amount=300000, start=T0, end=T0 + 30 * DAY))
        self.sub = Subscription.all_tenants.get(workspace=self.ws)
        self.assertEqual(self.sub.status, 'active')

    def cancel(self, days, user=None):
        now = datetime.fromtimestamp(T0 + days * DAY, tz=dt_timezone.utc)
        with mock.patch('billing.gateways.razorpay.requests.request',
                        return_value=fake_response({'id': 'rfnd_1'})) as req, \
                workspace_context(self.ws):
            out = payments.cancel_subscription(self.sub.pk, user=user, now=now)
        return out, req

    def test_refund_within_10_days_pro_rata_minus_fee(self):
        out, req = self.cancel(5)
        # 300000 * 25/30 unused * (1 - 10 %) = 225000
        self.assertEqual(out['refunded'], 225000)
        self.assertTrue(out['canceled_immediately'])
        sub = Subscription.all_tenants.get(pk=self.sub.pk)
        self.assertEqual(sub.status, 'canceled')
        rf = Refund.all_tenants.get()
        self.assertEqual((rf.amount, rf.status, rf.gateway_refund_id), (225000, 'processed', 'rfnd_1'))
        inv = Invoice.all_tenants.get()
        self.assertEqual((inv.amount_refunded, inv.status), (225000, 'partially_refunded'))
        self.assertTrue(PlatformAuditLog.objects.filter(action='billing.cancel').exists())
        urls = [c.args[1] for c in req.call_args_list]
        self.assertTrue(any(u.endswith('/payments/pay_1/refund') for u in urls))

    def test_fee_pct_env_respected(self):
        with env_patch(REFUND_FEE_PCT='0'):
            out, _ = self.cancel(5)
        self.assertEqual(out['refunded'], 250000)

    def test_after_10_days_cancels_at_period_end_no_refund(self):
        out, req = self.cancel(11)
        self.assertEqual(out['refunded'], 0)
        self.assertTrue(out['cancel_at_period_end'])
        self.assertFalse(out['canceled_immediately'])
        sub = Subscription.all_tenants.get(pk=self.sub.pk)
        self.assertEqual((sub.status, sub.cancel_at_period_end), ('active', True))
        self.assertEqual(Refund.all_tenants.count(), 0)
        self.assertFalse(any(c.args[1].endswith('/refund') for c in req.call_args_list))

    def test_refund_capped_at_total_minus_already_refunded(self):
        Invoice.all_tenants.update(amount_refunded=280000)
        out, _ = self.cancel(5)
        self.assertEqual(out['refunded'], 20000)
        inv = Invoice.all_tenants.get()
        self.assertEqual(inv.amount_refunded, 300000)
        self.assertEqual(inv.status, 'refunded')
        self.assertEqual(Payment.all_tenants.get().status, 'refunded')

    def test_gateway_refund_failure_recorded_not_lost(self):
        now = datetime.fromtimestamp(T0 + 5 * DAY, tz=dt_timezone.utc)
        ok, bad = fake_response({}), fake_response({}, status=500)
        with mock.patch('billing.gateways.razorpay.requests.request', side_effect=[ok, bad]), \
                workspace_context(self.ws):
            out = payments.cancel_subscription(self.sub.pk, now=now)
        self.assertTrue(out['refund_failed'])
        self.assertEqual(Refund.all_tenants.get().status, 'failed')
        self.assertEqual(Invoice.all_tenants.get().amount_refunded, 0)

    def test_cancel_api_owner_only(self):
        quiet_logs(self)
        owner, _ = client_for(self.ws, 'o1')   # first user of a workspace is forced to owner
        member, _ = client_for(self.ws, 'm1', role='member')
        self.assertEqual(member.post('/api/billing/cancel/').status_code, 403)
        with mock.patch('billing.gateways.razorpay.requests.request',
                        return_value=fake_response({'id': 'rfnd_9'})):
            r = owner.post('/api/billing/cancel/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(set(r.json()), {'currency', 'refunded', 'canceled_immediately', 'cancel_at_period_end'})

    def test_subscription_endpoint_exposes_refund_preview(self):
        owner, _ = client_for(self.ws, 'o2')
        r = owner.get('/api/billing/subscription/')
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertGreater(body['refund_preview']['amount'], 0)
        self.assertIsNotNone(body['can_refund_until'])
        self.assertIsInstance(body['usage'], list)
        self.assertEqual(body['status'], 'active')


class RefundLoopTests(RefundTests):
    """Finding 2: refund-loop. One cancel-refund per workspace; latest cycle payment only."""

    def test_second_cycle_cancel_gets_no_refund_and_p1_untouched(self):
        from billing.tests.helpers import set_pending
        out, _ = self.cancel(0)
        self.assertGreater(out['refunded'], 0)
        p1 = Payment.all_tenants.get(gateway_payment_id='pay_1')
        p1_refunded = Invoice.all_tenants.get(pk=p1.invoice_id).amount_refunded
        # re-subscribe: new checkout + second payment
        Subscription.all_tenants.filter(pk=self.sub.pk).update(gateway_subscription_id='sub_R1')
        set_pending(self.ws, 'startups', 'month', checkout_id='sub_R1')
        Subscription.all_tenants.filter(pk=self.sub.pk).update(pending_amount=300000)
        rzp_post(APIClient(), rzp_charged(pay_id='pay_2', amount=300000, start=T0 + DAY, end=T0 + 31 * DAY),
                 event_id='evt_2')
        sub = Subscription.all_tenants.get(pk=self.sub.pk)
        self.assertEqual(sub.status, 'active')
        end_after_p2 = sub.current_period_end
        self.assertEqual(end_after_p2, datetime.fromtimestamp(T0 + 31 * DAY, tz=dt_timezone.utc))  # no 2nd bonus
        out2, _ = self.cancel(2)
        self.assertEqual((out2['refunded'], out2['canceled_immediately']), (0, False))
        self.assertTrue(Subscription.all_tenants.get(pk=self.sub.pk).cancel_at_period_end)
        self.assertEqual(Invoice.all_tenants.get(pk=p1.invoice_id).amount_refunded, p1_refunded)
        self.assertEqual(Refund.all_tenants.count(), 1)

    def test_refund_targets_latest_cycle_payment(self):
        sub = Subscription.all_tenants.get(pk=self.sub.pk)
        with workspace_context(self.ws):
            self.assertEqual(payments.latest_payment(sub).gateway_payment_id, 'pay_1')
