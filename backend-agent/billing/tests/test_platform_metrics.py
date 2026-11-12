from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from billing import metrics
from billing.models import Invoice, Payment, Plan, PlatformAuditLog, Refund, Subscription
from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import make_admin
from core import lockout
from core.models import LoginAttempt, User, Workspace
from core.tenancy import workspace_context


def add_payment(ws, sub, amount, cur, when, pid, refunded=0):
    with workspace_context(ws):
        inv = Invoice.objects.create(workspace=ws, number=f'T-{pid}', subscription=sub, status='paid',
                                     currency=cur, subtotal=amount, total=amount, issued_at=when)
        p = Payment.objects.create(workspace=ws, invoice=inv, gateway='stripe', gateway_payment_id=pid,
                                   amount=amount, currency=cur)
        Payment.all_tenants.filter(pk=p.pk).update(created_at=when)
        if refunded:
            r = Refund.objects.create(workspace=ws, payment=p, amount=refunded, status='processed')
            Refund.all_tenants.filter(pk=r.pk).update(created_at=when)
    return p


class MetricsTests(TestCase):
    def setUp(self):
        cache.clear()
        no_template_capture(self)
        quiet_logs(self)
        self.now = timezone.now()
        Workspace.all_tenants.filter(slug='shailog').delete()   # migration-seeded legacy tenant
        env = mock.patch.dict('os.environ', {'USD_INR_RATE': '80'})
        env.start()
        self.addCleanup(env.stop)

    def sub(self, slug, plan, status, cur='INR', interval='month', gateway='razorpay', age=100, paid=True):
        ws = make_ws(slug, plan=plan, status=status, gateway=gateway)
        Workspace.all_tenants.filter(pk=ws.pk).update(created_at=self.now - timedelta(days=age))
        Subscription.all_tenants.filter(workspace=ws).update(
            currency=cur, interval=interval,
            first_paid_at=self.now - timedelta(days=age) if paid else None)
        return ws

    def test_mrr_rules(self):
        biz, st = Plan.objects.get(code='business'), Plan.objects.get(code='startups')
        self.sub('a', 'business', 'active')                                  # INR month
        self.sub('b', 'business', 'past_due', cur='USD', interval='year')    # USD year / 12
        self.sub('c', 'startups', 'canceled')                                # excluded
        self.sub('d', 'startups', 'pending', paid=False)                     # excluded
        self.sub('e', 'startups', 'active', gateway='manual')                # excluded
        m = metrics.mrr()
        self.assertEqual(m['INR'], biz.price_inr_month)
        self.assertEqual(m['USD'], biz.price_usd_year // 12)
        eq = metrics.inr_eq(m)
        self.assertEqual(eq, m['INR'] + round(m['USD'] * 80))
        o = metrics.overview(self.now)
        self.assertEqual((o['mrr']['inr_equivalent'], o['arr_inr_equivalent']), (eq, eq * 12))
        self.assertEqual(o['counts'], {'active': 2, 'pending': 1, 'past_due': 1, 'canceled': 1})

    def test_conversion_churn_signups(self):
        # signups in the last 30d: 4 workspaces, 1 paid
        self.sub('n1', 'startups', 'active', age=3)
        for i in range(3):
            self.sub(f'n{i + 2}', 'startups', 'pending', age=10, paid=False)
        # older cohort: 3 live, 1 churned inside the window
        for i in range(3):
            self.sub(f'o{i}', 'startups', 'active', age=90)
        gone = self.sub('gone', 'startups', 'canceled', age=90)
        Subscription.all_tenants.filter(workspace=gone).update(canceled_at=self.now - timedelta(days=5))
        old = self.sub('old', 'startups', 'canceled', age=90)   # churned long ago: not in base
        Subscription.all_tenants.filter(workspace=old).update(canceled_at=self.now - timedelta(days=60))
        o = metrics.overview(self.now)
        self.assertEqual(o['signups_30d'], 4)
        self.assertEqual(o['signups_7d'], 1)
        self.assertEqual(o['conversion_30d'], 0.25)
        self.assertEqual(o['churn_30d'], 0.25)   # 1 churned / (3 live + 1 churned) at start

    def test_revenue_and_refunds(self):
        ws = self.sub('r', 'business', 'active', cur='USD')
        sub = Subscription.all_tenants.get(workspace=ws)
        add_payment(ws, sub, 1000, 'USD', self.now, 'p1', refunded=250)
        add_payment(ws, sub, 50000, 'INR', self.now - timedelta(days=45), 'p2')
        o = metrics.overview(self.now)
        series = o['revenue_12m']
        self.assertEqual(len(series), 12)
        self.assertEqual(series[-1]['month'], f'{self.now.year:04d}-{self.now.month:02d}')
        self.assertEqual(series[-1]['inr_equivalent'], (1000 - 250) * 80 if self.now.day > 0 else 0)
        self.assertEqual(sum(s['inr_equivalent'] for s in series), 750 * 80 + 50000)
        self.assertEqual(o['refunds_30d'], {'count': 1, 'amount_inr_equivalent': 250 * 80})

    def test_marketing_funnel(self):
        a = self.sub('m1', 'business', 'active', age=5)
        Workspace.all_tenants.filter(pk=a.pk).update(signup_source='google', country='IN', signup_campaign='launch')
        b = self.sub('m2', 'startups', 'pending', age=5, paid=False)
        Workspace.all_tenants.filter(pk=b.pk).update(signup_source='google', country='US')
        User.objects.create_user('v@x.test', password='pass12345-x', workspace=a, email_verified_at=self.now)
        PlatformAuditLog.objects.create(action='billing.checkout_started', target_workspace=a)
        m = metrics.marketing(self.now)
        self.assertEqual(m['funnel'], {'signups': 2, 'verified': 1, 'checkout_started': 1, 'paid': 1})
        self.assertEqual(m['by_source'][0], {'source': 'google', 'count': 2, 'paid': 1})
        self.assertEqual(len(m['signups_by_day']), 90)
        self.assertEqual(m['signups_by_day'][-1]['count'], 0)
        self.assertEqual({p['plan']: p['count'] for p in m['plan_mix']}, {'business': 1})
        c, _, _ = make_admin()
        self.assertEqual(c.get('/api/platform/marketing/').status_code, 200)
        self.assertEqual(c.get('/api/platform/overview/').status_code, 200)


class PlanPutTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        self.c, self.u, _ = make_admin()
        self.row = self.c.get('/api/platform/plans/').json()
        self.plan = next(p for p in self.row if p['code'] == 'startups')

    def put(self, **over):
        return self.c.put('/api/platform/plans/startups/', {**self.plan, **over}, format='json')

    def test_roundtrip_and_audit(self):
        r = self.put(price_inr_month=123400, limits={**self.plan['limits'], 'leads': -1}, reason='promo')
        self.assertEqual(r.status_code, 200, r.content)
        p = Plan.objects.get(code='startups')
        self.assertEqual((p.price_inr_month, p.limits['leads']), (123400, -1))
        a = PlatformAuditLog.objects.get(action='platform.plan_update')
        self.assertEqual((a.meta['reason'], a.meta['plan']), ('promo', 'startups'))
        self.assertIn('price_inr_month', a.meta['changed'])

    def test_validation(self):
        for bad in ({'price_usd_month': -1}, {'price_usd_year': 1.5}, {'price_inr_year': '9'},
                    {'price_inr_month': True}, {'limits': {'leads': -2}}, {'limits': {'bogus': 5}},
                    {'limits': {'leads': 'x'}}, {'limits': []}, {'name': ''}, {'active': 'yes'},
                    {'code': 'other'}):
            self.assertEqual(self.put(**bad).status_code, 400, bad)
        self.assertEqual(Plan.objects.get(code='startups').price_usd_month, self.plan['price_usd_month'])
        self.assertEqual(self.c.put('/api/platform/plans/nope/', {**self.plan, 'code': 'nope'}, format='json').status_code, 404)


class LockoutDbTests(TestCase):
    def test_counter_is_db_backed_and_hashed(self):
        for _ in range(10):
            lockout.record_failure('Bob', '1.1.1.1')
        row = LoginAttempt.objects.get()
        self.assertNotIn('bob', row.key)
        cache.clear()   # a different process has a different cache; the DB still says locked
        self.assertTrue(lockout.is_locked('bob', '1.1.1.1'))
        self.assertFalse(lockout.is_locked('bob', '2.2.2.2'))
        LoginAttempt.objects.update(window_start=timezone.now() - timedelta(minutes=16))
        self.assertFalse(lockout.is_locked('bob', '1.1.1.1'))
        lockout.record_failure('bob', '1.1.1.1')   # new window restarts at 1
        self.assertEqual(LoginAttempt.objects.get().count, 1)
        lockout.clear('bob', '1.1.1.1')
        self.assertEqual(LoginAttempt.objects.count(), 0)


class CommandTests(TestCase):
    def test_create_platform_admin_env_password(self):
        from io import StringIO
        out = StringIO()
        with mock.patch.dict('os.environ', {'PA_PW': 'a-long-unusual-pass-77'}):
            call_command('create_platform_admin', '--username', 'ops', '--email', 'Ops@Shailog.test',
                         '--password-env', 'PA_PW', stdout=out)
        u = User.objects.get(username='ops')
        self.assertEqual((u.is_staff, u.workspace_id, u.email), (True, None, 'ops@shailog.test'))
        self.assertTrue(u.check_password('a-long-unusual-pass-77'))
        self.assertNotIn('a-long-unusual-pass-77', out.getvalue())
