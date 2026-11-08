from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.models import Invoice, Subscription
from billing.tests.test_entitlements import make_ws
from core.models import EmailDraft, Lead, Mailbox, PipelineRun, User
from core.tenancy import workspace_context


def client_for(ws, username, role='owner'):
    user = User.objects.create_user(username=username, password='pass12345-x', role=role,
                                    workspace=ws)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
    return c, user


class PaywallTests(TestCase):
    def setUp(self):
        self.ws = make_ws('pw', status='expired', end=timezone.now() - timedelta(days=1))
        self.c, _ = client_for(self.ws, 'pw_owner')

    def test_get_allowed_when_unpaid(self):
        self.assertEqual(self.c.get('/api/leads/').status_code, 200)
        self.assertEqual(self.c.get('/api/auth/me/').status_code, 200)

    def test_write_blocked_with_payment_required(self):
        r = self.c.post('/api/templates/', {'name': 'x', 'subject': 's', 'body': 'b'}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json(), {'error': 'payment_required'})
        # default-permission view (no explicit permission_classes) is paywalled too
        r = self.c.post('/api/chat/', {'text': 'hi'}, format='json')
        self.assertEqual(r.status_code, 402)

    def test_exempt_paths_still_work(self):
        self.assertEqual(self.c.post('/api/auth/logout/').status_code, 200)
        self.assertNotEqual(self.c.post('/api/auth/password/', {}, format='json').status_code, 402)

    def test_paid_workspace_writes_ok(self):
        Subscription.all_tenants.filter(workspace=self.ws).update(
            status='active', current_period_end=timezone.now() + timedelta(days=5))
        r = self.c.post('/api/templates/', {'name': 'x', 'subject': 's', 'body': 'b'}, format='json')
        self.assertNotEqual(r.status_code, 402)

    def test_platform_operator_unaffected(self):
        root = User.objects.create_superuser(username='root', password='pass12345-x', email='r@x.test')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=root).key}')
        self.assertNotEqual(c.post('/api/templates/', {}, format='json').status_code, 402)


class QuotaApiTests(TestCase):
    def setUp(self):
        self.ws = make_ws('qa')   # startups, paid
        self.c, self.user = client_for(self.ws, 'qa_owner')

    def test_mailbox_create_quota(self):
        body = {'fromEmail': 'a@x.test', 'smtpHost': 'smtp.x.test', 'smtpUser': 'a@x.test',
                'smtpPassword': 'p'}
        with workspace_context(self.ws):
            Mailbox.objects.create(from_email='1@x.test')
            Mailbox.objects.create(from_email='2@x.test')
        r = self.c.post('/api/mailboxes/', body, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json(), {'error': 'quota_exceeded', 'meter': 'mailboxes',
                                    'limit': 2, 'used': 2})

    def test_pipeline_run_blocked_when_runs_per_day_used(self):
        with workspace_context(self.ws):
            PipelineRun.objects.create()
            PipelineRun.objects.create()
        with mock.patch('core.pipeline.acquire_run_lock') as lock:
            r = self.c.post('/api/pipeline/run/', {}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()['meter'], 'runs_day')
        lock.assert_not_called()

    def test_pipeline_run_blocked_when_lead_quota_full(self):
        from billing.models import Plan
        Plan.objects.filter(code='startups').update(limits={**Plan.objects.get(code='startups').limits,
                                                            'leads': 1})
        with workspace_context(self.ws):
            Lead.objects.create(company='one')
        r = self.c.post('/api/pipeline/run/', {}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()['meter'], 'leads')

    def test_approve_blocked_when_email_quota_full(self):
        from billing.models import Plan
        Plan.objects.filter(code='startups').update(
            limits={**Plan.objects.get(code='startups').limits, 'emails': 1})
        with workspace_context(self.ws):
            lead = Lead.objects.create(company='L', contact_email='a@l.test')
            EmailDraft.objects.create(lead=lead, company='L', to_email='z@l.test', subject='s',
                                      body='b', status='sent', sent_at=timezone.now())
            d = EmailDraft.objects.create(lead=lead, company='L', to_email='a@l.test',
                                          subject='s', body='b')
        r = self.c.post(f'/api/drafts/{d.id}/approve/')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()['meter'], 'emails')
        with workspace_context(self.ws):
            self.assertEqual(EmailDraft.objects.get(pk=d.pk).status, 'draft')  # never claimed

    def test_send_draft_fails_closed_without_sending(self):
        from core import mailer
        Subscription.all_tenants.filter(workspace=self.ws).update(status='expired')
        with workspace_context(self.ws):
            lead = Lead.objects.create(company='L', contact_email='a@l.test')
            d = EmailDraft.objects.create(lead=lead, company='L', to_email='a@l.test', subject='s',
                                          body='b', status='approved')
            with mock.patch('core.mailer.send_email_message') as smtp:
                mailer.send_draft(d)
            d.refresh_from_db()
        smtp.assert_not_called()
        self.assertEqual(d.status, 'failed')
        self.assertEqual(d.error, mailer.PLAN_LIMIT_ERROR)

    def test_sequence_create_quota(self):
        with workspace_context(self.ws):
            from core.models import Sequence
            for i in range(5):
                Sequence.objects.create(name=f's{i}')
        r = self.c.post('/api/sequences/', {'name': 'one more'}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()['meter'], 'sequences')

    def test_chat_quota(self):
        from billing.models import Plan
        Plan.objects.filter(code='startups').update(
            limits={**Plan.objects.get(code='startups').limits, 'ai_msgs': 0})
        r = self.c.post('/api/chat/', {'text': 'hello'}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()['meter'], 'ai_msgs')

    def test_whatsapp_approve_needs_plan_feature(self):
        from core.models import WhatsAppMessage
        with workspace_context(self.ws):
            m = WhatsAppMessage.objects.create(to_phone='+919999999999', text='hi')
        r = self.c.post(f'/api/whatsapp/messages/{m.id}/approve/', {}, format='json')
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json()['meter'], 'whatsapp')


class WorkerSkipTests(TestCase):
    def test_workers_skip_unpaid_workspace(self):
        from core import outbox
        ws = make_ws('wk', status='expired', end=timezone.now() - timedelta(days=1))
        with mock.patch('core.outbox.drain_outbox') as drain:
            totals = outbox.drain_all_workspaces()
        self.assertNotIn(ws.slug, totals)
        self.assertEqual(sorted(c.args for c in drain.call_args_list), [()] * drain.call_count)

    def test_inbox_polls_within_seven_days(self):
        from core import inbox
        make_ws('ib', status='expired', end=timezone.now() - timedelta(days=3))
        make_ws('ib2', status='expired', end=timezone.now() - timedelta(days=9))
        with mock.patch('core.inbox.poll_inbox', return_value={}):
            totals = inbox.poll_all_workspaces()
        self.assertIn('ib', totals)
        self.assertNotIn('ib2', totals)


class TenantIsolationTests(TestCase):
    def test_subscription_and_invoice_scoped(self):
        a, b = make_ws('iso-a'), make_ws('iso-b')
        with workspace_context(a):
            sub = Subscription.objects.get()
            Invoice.objects.create(number='SHL-2026-000001', subscription=sub, currency='INR')
        with workspace_context(b):
            self.assertEqual(Subscription.objects.get().workspace_id, b.pk)
            self.assertEqual(Invoice.objects.count(), 0)
            with self.assertRaises(ValueError):   # parent from another tenant
                Invoice.objects.create(number='SHL-2026-000002', subscription=sub, currency='INR')

    def test_no_context_raises(self):
        from core.tenancy import TenantContextMissing
        with self.assertRaises(TenantContextMissing):
            Subscription.objects.count()
