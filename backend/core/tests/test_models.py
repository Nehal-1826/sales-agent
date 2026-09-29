"""
Tests for core.models — verifies model creation, constraints and
the singleton AppSettings pattern.
"""
from django.test import TestCase

from core.models import (
    AgentConfig,
    AppSettings,
    ChatMessage,
    EmailDraft,
    Lead,
    PipelineRun,
    Potential,
    Reply,
    User,
)


class UserModelTests(TestCase):
    """User model with roles."""

    def test_first_user_becomes_owner(self):
        user = User.objects.create_user(username='first', password='testpass1234')
        self.assertEqual(user.role, User.Roles.OWNER)

    def test_second_user_is_member(self):
        User.objects.create_user(username='first', password='testpass1234')
        second = User.objects.create_user(username='second', password='testpass1234')
        self.assertEqual(second.role, User.Roles.MEMBER)

    def test_role_choices(self):
        values = {c[0] for c in User.Roles.choices}
        self.assertIn('owner', values)
        self.assertIn('admin', values)
        self.assertIn('member', values)


class LeadModelTests(TestCase):
    """Lead (CRM - LEADS) model."""

    def test_create_lead(self):
        lead = Lead.objects.create(
            company='Test Co',
            industry='Tech',
            website='test.com',
            score=85,
            source='Search · DuckDuckGo',
        )
        self.assertEqual(lead.company, 'Test Co')
        self.assertEqual(lead.score, 85)
        self.assertFalse(lead.profiled)
        self.assertFalse(lead.has_website)  # default

    def test_lead_ordering(self):
        from django.utils import timezone
        import datetime
        now = timezone.now()
        l1 = Lead.objects.create(company='First')
        l2 = Lead.objects.create(company='Second')
        Lead.objects.filter(pk=l1.pk).update(created_at=now - datetime.timedelta(seconds=10))
        Lead.objects.filter(pk=l2.pk).update(created_at=now)
        leads = list(Lead.objects.values_list('company', flat=True))
        # ordered by -created_at → Second first
        self.assertEqual(leads[0], 'Second')

    def test_lead_findings_default(self):
        lead = Lead.objects.create(company='No Findings')
        self.assertEqual(lead.findings, [])

    def test_lead_str(self):
        lead = Lead.objects.create(company='Acme')
        self.assertEqual(str(lead), 'Acme')


class EmailDraftModelTests(TestCase):
    """EmailDraft (outreach cold emails)."""

    def test_create_draft(self):
        lead = Lead.objects.create(company='Target', website='target.com')
        draft = EmailDraft.objects.create(
            lead=lead,
            company='Target',
            to_email='hi@target.com',
            subject='Test subject',
            body='Test body',
        )
        self.assertEqual(draft.status, EmailDraft.Statuses.DRAFT)
        self.assertEqual(draft.company, 'Target')
        self.assertEqual(draft.lead, lead)

    def test_draft_status_choices(self):
        values = {c[0] for c in EmailDraft.Statuses.choices}
        self.assertEqual(values, {'draft', 'approved', 'sent', 'rejected', 'failed'})

    def test_draft_str(self):
        draft = EmailDraft.objects.create(company='Co', status='draft')
        self.assertIn('Co', str(draft))


class PotentialModelTests(TestCase):
    """Potential (CRM - POTENTIAL)."""

    def test_create_potential(self):
        pot = Potential.objects.create(
            company='Big Co',
            opportunity='SEO package',
            value='$10,000',
            stage='qualified',
        )
        self.assertEqual(pot.company, 'Big Co')
        self.assertEqual(pot.get_stage_display(), 'Qualified')

    def test_potential_stage_choices(self):
        values = {c[0] for c in Potential.Stages.choices}
        self.assertEqual(values, {'discovery', 'qualified', 'proposal', 'negotiation'})


class ReplyModelTests(TestCase):
    """Reply (CRM - REPLY)."""

    def test_create_reply(self):
        reply = Reply.objects.create(
            company='Test',
            contact='John',
            channel='email',
            status='awaiting',
            summary='Asked for pricing',
        )
        self.assertEqual(reply.get_channel_display(), 'Email')
        self.assertEqual(reply.get_status_display(), 'Awaiting')


class AgentConfigModelTests(TestCase):
    """AgentConfig (per-agent settings)."""

    def test_create_agent_config(self):
        cfg = AgentConfig.objects.create(
            agent='search',
            system_prompt='You are the Search agent.',
            model='GPT-4o',
        )
        self.assertEqual(cfg.agent, 'search')
        self.assertEqual(cfg.model, 'GPT-4o')

    def test_agent_is_unique(self):
        AgentConfig.objects.create(agent='search')
        with self.assertRaises(Exception):
            AgentConfig.objects.create(agent='search')


class AppSettingsModelTests(TestCase):
    """AppSettings (singleton pattern)."""

    def test_singleton(self):
        s1 = AppSettings.load()
        s1.company_name = 'Test Corp'
        s1.save()
        s2 = AppSettings.load()
        self.assertEqual(s2.company_name, 'Test Corp')
        self.assertEqual(s1.pk, s2.pk)
        self.assertEqual(s1.pk, 1)

    def test_frequency_choices(self):
        values = {c[0] for c in AppSettings.Frequencies.choices}
        self.assertEqual(values, {'15m', '1h', '6h', 'daily'})


class ChatMessageModelTests(TestCase):
    """ChatMessage model."""

    def test_create_message(self):
        msg = ChatMessage.objects.create(role='user', text='Hello')
        self.assertEqual(msg.role, 'user')
        self.assertIn('Hello', str(msg))

    def test_ordering(self):
        ChatMessage.objects.create(role='user', text='First')
        ChatMessage.objects.create(role='ai', text='Second')
        msgs = list(ChatMessage.objects.values_list('text', flat=True))
        self.assertEqual(msgs[0], 'First')


class PipelineRunModelTests(TestCase):
    """PipelineRun model."""

    def test_create_run(self):
        run = PipelineRun.objects.create(
            triggered_by='manual',
            leads_created=3,
            potentials_created=1,
            replies_created=2,
            summary={'notes': ['test']},
        )
        self.assertEqual(run.triggered_by, 'manual')
        self.assertEqual(run.leads_created, 3)
        self.assertIn('#', str(run))
