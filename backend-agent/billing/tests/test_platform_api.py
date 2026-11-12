from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from billing import payments
from billing.models import Invoice, Payment, Plan, PlatformAuditLog, Refund, Subscription
from billing.tests.helpers import (client_for, env_patch, no_template_capture, pending_ws, quiet_logs,
                                   rzp_charged, rzp_post)
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import make_admin
from billing.tests.test_refunds import fake_response
from core.models import Workspace
from rest_framework.test import APIClient


class Base(TestCase):
    def setUp(self):
        cache.clear()
        no_template_capture(self)
        quiet_logs(self)
        self.admin, self.user, _ = make_admin()
        self.ws = make_ws('acme', plan='business')

    def post(self, path, body=None):
        return self.admin.post('/api/platform/' + path, body or {}, format='json')


class WriteAuditTests(Base):
    def test_every_write_needs_reason_and_is_audited(self):
        tid = self.ws.pk
        cases = [(f'tenants/{tid}/suspend/', {}), (f'tenants/{tid}/unsuspend/', {}),
                 (f'tenants/{tid}/extend/', {'days': 5}),
                 (f'tenants/{tid}/change_plan/', {'plan_code': 'startups'})]
        for path, body in cases:
            self.assertEqual(self.post(path, body).status_code, 400, path)
            self.assertEqual(self.post(path, {**body, 'reason': '   '}).status_code, 400, path)
        self.assertEqual(PlatformAuditLog.objects.filter(action__startswith='platform.').count(), 0)
        for path, body in cases:
            r = self.post(path, {**body, 'reason': 'support ticket 42'})
            self.assertEqual(r.status_code, 200, (path, r.content))
        rows = PlatformAuditLog.objects.filter(action__startswith='platform.')
        self.assertEqual(sorted(a.action for a in rows),
                         ['platform.change_plan', 'platform.extend', 'platform.suspend', 'platform.unsuspend'])
        for a in rows:
            self.assertEqual((a.actor_id, a.target_workspace_id, a.meta['reason']),
                             (self.user.pk, self.ws.pk, 'support ticket 42'))
        sub = Subscription.all_tenants.get(workspace=self.ws)
        self.assertEqual(sub.plan.code, 'startups')
        audit = self.admin.get('/api/platform/audit/').json()['results'][0]
        self.assertEqual(set(audit) >= {'id', 'created_at', 'actor', 'action', 'target', 'reason', 'ip'}, True)
        self.assertEqual((audit['actor'], audit['reason']), ('root', 'support ticket 42'))

    def test_audit_records_ip(self):
        self.admin.post(f'/api/platform/tenants/{self.ws.pk}/suspend/', {'reason': 'x'}, format='json',
                        REMOTE_ADDR='7.7.7.7')
        self.assertEqual(PlatformAuditLog.objects.get(action='platform.suspend').ip, '7.7.7.7')

    def test_extend_adds_days_and_validates(self):
        before = Subscription.all_tenants.get(workspace=self.ws).current_period_end
        self.assertEqual(self.post(f'tenants/{self.ws.pk}/extend/', {'days': 0, 'reason': 'r'}).status_code, 400)
        self.assertEqual(self.post(f'tenants/{self.ws.pk}/extend/', {'days': 'x', 'reason': 'r'}).status_code, 400)
        self.assertEqual(self.post(f'tenants/{self.ws.pk}/extend/', {'days': 7, 'reason': 'r'}).status_code, 200)
        after = Subscription.all_tenants.get(workspace=self.ws).current_period_end
        self.assertEqual(after - before, timedelta(days=7))

    def test_unknown_plan_and_tenant(self):
        self.assertEqual(self.post(f'tenants/{self.ws.pk}/change_plan/', {'plan_code': 'nope', 'reason': 'r'}).status_code, 400)
        self.assertEqual(self.post('tenants/99999/suspend/', {'reason': 'r'}).status_code, 404)


class SuspendTests(Base):
    def test_suspend_blocks_tenant_token_then_unsuspend(self):
        c, _ = client_for(self.ws, 'acmeowner')
        self.assertEqual(c.get('/api/auth/me/').status_code, 200)
        self.assertEqual(self.post(f'tenants/{self.ws.pk}/suspend/', {'reason': 'abuse'}).status_code, 200)
        self.assertEqual(c.get('/api/auth/me/').status_code, 403)
        self.assertEqual(c.get('/api/leads/').status_code, 403)
        login = APIClient().post('/api/auth/login/', {'username': 'acmeowner', 'password': 'pass12345-x'}, format='json')
        self.assertEqual(login.status_code, 403)
        row = self.admin.get(f'/api/platform/tenants/{self.ws.pk}/').json()
        self.assertTrue(row['suspended'])
        self.post(f'tenants/{self.ws.pk}/unsuspend/', {'reason': 'resolved'})
        self.assertEqual(c.get('/api/auth/me/').status_code, 200)


class TenantListTests(Base):
    def test_shape_filters_search_pagination(self):
        client_for(self.ws, 'boss@acme.test')
        other = make_ws('zeta', plan='startups', status='past_due')
        r = self.admin.get('/api/platform/tenants/').json()
        self.assertEqual(set(r), {'count', 'next', 'previous', 'results'})
        row = next(x for x in r['results'] if x['workspace'] == 'acme')
        self.assertEqual(set(row) >= {'id', 'workspace', 'owner_email', 'plan', 'status', 'suspended', 'period_end',
                                      'usage', 'created', 'last_activity', 'country', 'signup_source'}, True)
        self.assertEqual(row['plan'], {'code': 'business', 'name': 'Business'})
        self.assertIn('used', row['usage']['leads'])
        self.assertEqual(row['owner_email'], 'boss@acme.test@x.test')
        q = lambda s: [x['workspace'] for x in self.admin.get('/api/platform/tenants/' + s).json()['results']]  # noqa
        self.assertEqual(q('?q=ACM'), ['acme'])
        self.assertEqual(q('?q=boss@acme'), ['acme'])
        self.assertEqual(q('?status=past_due'), ['zeta'])
        self.assertEqual(q('?plan=business'), ['acme'])
        self.admin.post(f'/api/platform/tenants/{other.pk}/suspend/', {'reason': 'r'}, format='json')
        self.assertEqual(q('?status=suspended'), ['zeta'])


class RefundTests(Base):
    def setUp(self):
        super().setUp()
        p = env_patch()
        p.start()
        self.addCleanup(p.stop)
        self.pws = pending_ws('payco')
        Subscription.all_tenants.filter(workspace=self.pws).update(pending_amount=300000)
        rzp_post(APIClient(), rzp_charged(pay_id='pay_1', amount=300000))
        self.pay = Payment.all_tenants.get(gateway_payment_id='pay_1')

    def refund(self, amount, reason='goodwill'):
        body = {'amount': amount}
        if reason is not None:
            body['reason'] = reason
        with mock.patch('billing.gateways.razorpay.requests.request',
                        return_value=fake_response({'id': 'rfnd_9'})):
            return self.post(f'payments/{self.pay.pk}/refund/', body)

    def test_list_shape(self):
        r = self.admin.get('/api/platform/payments/').json()['results'][0]
        self.assertEqual((r['workspace'], r['amount'], r['currency'], r['refunded_amount'], r['refundable'],
                          r['gateway'], r['status']), ('payco', 300000, 'INR', 0, 300000, 'razorpay', 'captured'))

    def test_refund_capped_audited_reason_required(self):
        self.assertEqual(self.refund(1000, reason=None).status_code, 400)
        self.assertEqual(Refund.all_tenants.count(), 0)
        self.assertEqual(self.refund(300001).status_code, 400)
        self.assertEqual(self.refund(0).status_code, 400)
        self.assertEqual(self.refund(100000).status_code, 200)
        a = PlatformAuditLog.objects.get(action='platform.refund')
        self.assertEqual((a.meta['reason'], a.meta['amount'], a.actor_id), ('goodwill', 100000, self.user.pk))
        self.assertEqual(self.refund(200001).status_code, 400)   # only 200000 left
        self.assertEqual(self.refund(200000).status_code, 200)
        inv = Invoice.all_tenants.get(pk=self.pay.invoice_id)
        self.assertEqual((inv.amount_refunded, inv.status), (300000, 'refunded'))
        self.assertEqual(self.refund(1).status_code, 400)

    def test_gateway_failure_changes_nothing(self):
        from billing.gateways import GatewayError
        with mock.patch('billing.gateways.razorpay.RazorpayGateway.refund', side_effect=GatewayError('x')):
            r = self.post(f'payments/{self.pay.pk}/refund/', {'amount': 1000, 'reason': 'r'})
        self.assertEqual(r.status_code, 502)
        self.assertEqual(Refund.all_tenants.count(), 0)
        self.assertEqual(Invoice.all_tenants.get(pk=self.pay.invoice_id).amount_refunded, 0)

    def test_invoices_list_and_html(self):
        r = self.admin.get('/api/platform/invoices/').json()['results'][0]
        self.assertEqual((r['workspace'], r['currency'], r['status'], r['total']), ('payco', 'INR', 'paid', 300000))
        h = self.admin.get(f'/api/platform/invoices/{r["id"]}/')
        self.assertEqual(h.status_code, 200)
        self.assertIn(r['number'], h.content.decode())
