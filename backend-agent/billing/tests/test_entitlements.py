from datetime import datetime, timedelta, timezone as dt_tz

from django.test import TestCase
from django.utils import timezone

from billing.entitlements import (PaymentRequired, QuotaExceeded, check, get_entitlement,
                                  has_inbox_access, has_paid_access, headroom, month_window,
                                  require_paid)
from billing.models import Plan, Subscription
from billing.services import ensure_manual_subscription
from core.models import EmailDraft, Lead, Mailbox, Sequence, User, Workspace
from core.tenancy import workspace_context


def make_ws(slug, plan='startups', status='active', end=None, gateway='stripe', start=None):
    ws = Workspace.all_tenants.create(slug=slug, name=slug)
    now = timezone.now()
    with workspace_context(ws):
        Subscription.objects.create(
            workspace=ws, plan=Plan.objects.get(code=plan), status=status, gateway=gateway,
            current_period_start=start or now - timedelta(days=2),
            current_period_end=end or now + timedelta(days=28))
    return ws


class SeedAndBackfillTests(TestCase):
    def test_three_plans_seeded_in_minor_units(self):
        plans = {p.code: p for p in Plan.objects.all()}
        self.assertEqual(set(plans), {'startups', 'business', 'enterprise'})
        self.assertEqual(plans['startups'].price_inr_month, 299900)
        self.assertEqual(plans['startups'].price_usd_month, 3900)
        self.assertEqual(plans['enterprise'].limits['sequences'], -1)
        self.assertFalse(plans['startups'].features['whatsapp'])

    def test_legacy_workspace_gets_manual_enterprise(self):
        # 'shailog' is created by an earlier data migration, before billing existed
        ws = Workspace.all_tenants.get(slug='shailog')
        sub = Subscription.all_tenants.get(workspace=ws)
        self.assertEqual((sub.gateway, sub.status, sub.plan.code), ('manual', 'active', 'enterprise'))
        self.assertEqual(sub.current_period_end.year, 2099)
        self.assertTrue(has_paid_access(ws))


class EntitlementMathTests(TestCase):
    def test_usage_derived_and_quota_blocks_at_limit(self):
        ws = make_ws('q1')   # startups: 2 mailboxes, 5 sequences
        with workspace_context(ws):
            Mailbox.objects.create(from_email='a@x.test')
            check(ws, 'mailboxes')                      # 1 used, 2nd fits
            Mailbox.objects.create(from_email='b@x.test')
            with self.assertRaises(QuotaExceeded) as cm:
                check(ws, 'mailboxes')
        self.assertEqual(cm.exception.payload,
                         {'error': 'quota_exceeded', 'meter': 'mailboxes', 'limit': 2, 'used': 2})

    def test_unlimited_meter_never_blocks(self):
        ws = make_ws('q2', plan='enterprise')
        with workspace_context(ws):
            for i in range(30):
                Sequence.objects.create(name=f's{i}')
        check(ws, 'sequences')

    def test_leads_counted_in_current_period_only(self):
        ws = make_ws('q3')
        with workspace_context(ws):
            old = Lead.objects.create(company='old')
            Lead.all_tenants.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=90))
            Lead.objects.create(company='new')
        ent = get_entitlement(ws)
        self.assertEqual(ent.usage['leads'], 1)
        self.assertEqual(headroom(ws, 'leads'), 499)

    def test_emails_counted_by_sent_at(self):
        ws = make_ws('q4')
        with workspace_context(ws):
            lead = Lead.objects.create(company='L')
            EmailDraft.objects.create(lead=lead, company='L', to_email='a@l.test', subject='s',
                                      body='b', sent_at=timezone.now())
            EmailDraft.objects.create(lead=lead, company='L', to_email='b@l.test', subject='s', body='b')
        self.assertEqual(get_entitlement(ws).usage['emails'], 1)

    def test_whatsapp_is_a_plan_feature(self):
        free = make_ws('w1', plan='startups')
        biz = make_ws('w2', plan='business')
        with self.assertRaises(QuotaExceeded) as cm:
            check(free, 'whatsapp')
        self.assertEqual(cm.exception.payload['meter'], 'whatsapp')
        check(biz, 'whatsapp')

    def test_seats_counted_from_users(self):
        ws = make_ws('s1')   # startups: 2 seats
        User.objects.create_user(username='u1', password='x', workspace=ws)
        User.objects.create_user(username='u2', password='x', workspace=ws)
        with self.assertRaises(QuotaExceeded):
            User.objects.create_user(username='u3', password='x', workspace=ws)

    def test_platform_operator_unlimited(self):
        check(None, 'leads', add=10 ** 6)
        require_paid(None)


class AccessWindowTests(TestCase):
    def test_active_until_period_end(self):
        self.assertTrue(has_paid_access(make_ws('a1')))
        self.assertFalse(has_paid_access(make_ws('a2', end=timezone.now() - timedelta(hours=1))))

    def test_past_due_has_three_day_grace(self):
        inside = make_ws('a3', status='past_due', end=timezone.now() - timedelta(days=2))
        outside = make_ws('a4', status='past_due', end=timezone.now() - timedelta(days=4))
        self.assertTrue(has_paid_access(inside))
        self.assertFalse(has_paid_access(outside))

    def test_pending_canceled_expired_and_missing_have_no_access(self):
        for i, st in enumerate(['pending', 'canceled', 'expired']):
            self.assertFalse(has_paid_access(make_ws(f'n{i}', status=st)))
        bare = Workspace.all_tenants.create(slug='bare', name='bare')
        self.assertFalse(has_paid_access(bare))
        with self.assertRaises(PaymentRequired):
            require_paid(bare)
        with self.assertRaises(PaymentRequired):
            check(bare, 'leads')

    def test_inbox_keeps_polling_seven_days_after_expiry(self):
        ws3 = make_ws('i1', status='expired', end=timezone.now() - timedelta(days=3))
        ws9 = make_ws('i2', status='expired', end=timezone.now() - timedelta(days=9))
        self.assertTrue(has_inbox_access(ws3))
        self.assertFalse(has_inbox_access(ws9))
        self.assertFalse(has_paid_access(ws3))

    def test_month_window_manual_is_calendar_month(self):
        ws = Workspace.all_tenants.create(slug='mw', name='mw')
        sub = ensure_manual_subscription(ws)
        now = datetime(2026, 11, 8, 12, tzinfo=dt_tz.utc)
        start, end = month_window(sub, now)
        self.assertEqual((start.month, start.day, end.month), (11, 1, 12))

    def test_month_window_yearly_gateway_steps_monthly(self):
        ws = make_ws('mw2', start=datetime(2026, 1, 15, tzinfo=dt_tz.utc),
                     end=datetime(2027, 1, 15, tzinfo=dt_tz.utc))
        sub = Subscription.all_tenants.get(workspace=ws)
        start, end = month_window(sub, datetime(2026, 4, 20, tzinfo=dt_tz.utc))
        self.assertEqual((start.month, start.day, end.month, end.day), (4, 15, 5, 15))
        start, _ = month_window(sub, datetime(2026, 4, 10, tzinfo=dt_tz.utc))
        self.assertEqual((start.month, start.day), (3, 15))
