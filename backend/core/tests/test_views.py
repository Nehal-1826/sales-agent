"""
Tests for core.views — API endpoint integration tests.

Each test creates its own data and hits the endpoint through Django's
test client, verifying status codes and response shapes.
"""
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

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


class SetupMixin:
    """Creates a demo user + token and configures the API client."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER,
        )
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')


class HealthTests(TestCase):
    """GET /api/health/ — open endpoint, no auth required."""

    def test_health_ok(self):
        resp = self.client.get('/api/health/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['status'], 'ok')
        self.assertIn('database', data)
        self.assertIn('time', data)


class AuthTests(TestCase):
    """Registration, login, me, password change."""

    def test_register_and_login(self):
        # Register
        resp = self.client.post('/api/auth/register/', {
            'username': 'newuser',
            'password': 'securepass123',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        token = resp.json()['token']
        self.assertTrue(len(token) > 0)

        # Login
        resp = self.client.post('/api/auth/login/', {
            'username': 'newuser',
            'password': 'securepass123',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('token', resp.json())

    def test_register_short_password(self):
        resp = self.client.post('/api/auth/register/', {
            'username': 'user', 'password': 'short',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 400)

    def test_login_invalid(self):
        resp = self.client.post('/api/auth/login/', {
            'username': 'nobody', 'password': 'wrong',
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 401)

    def test_me_requires_auth(self):
        resp = self.client.get('/api/auth/me/')
        self.assertEqual(resp.status_code, 401)


class LeadViewTests(SetupMixin, TestCase):
    """CRUD on /api/leads/."""

    def test_list_leads(self):
        Lead.objects.create(company='A', score=90)
        Lead.objects.create(company='B', score=80)
        resp = self.client.get('/api/leads/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 2)

    def test_create_lead(self):
        resp = self.client.post('/api/leads/', {
            'company': 'NewCo',
            'industry': 'Tech',
            'score': 75,
            'hasWebsite': True,
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()['company'], 'NewCo')

    def test_lead_detail(self):
        lead = Lead.objects.create(company='Detail Co', score=50)
        resp = self.client.get(f'/api/leads/{lead.pk}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['company'], 'Detail Co')


class PotentialViewTests(SetupMixin, TestCase):
    """CRUD on /api/potential/."""

    def test_list_potentials(self):
        Potential.objects.create(company='PotCo', opportunity='Deal', value='$5000', stage='discovery')
        resp = self.client.get('/api/potential/')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.json()), 1)


class ReplyViewTests(SetupMixin, TestCase):
    """CRUD on /api/replies/."""

    def test_list_replies(self):
        Reply.objects.create(company='ReplyCo', contact='J. Doe', channel='email', status='awaiting')
        resp = self.client.get('/api/replies/')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.json()), 1)


class AgentViewTests(SetupMixin, TestCase):
    """GET /api/agents/ and GET/PUT /api/agents/<key>/config/."""

    def setUp(self):
        super().setUp()
        for agent in ('search', 'profile', 'copywright', 'responder'):
            AgentConfig.objects.create(agent=agent, system_prompt=f'{agent} prompt')

    def test_list_agents(self):
        resp = self.client.get('/api/agents/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 4)
        keys = {a['key'] for a in data}
        self.assertEqual(keys, {'search', 'profile', 'copywright', 'responder'})

    def test_get_agent_config(self):
        resp = self.client.get('/api/agents/search/config/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['agent'], 'search')
        self.assertIn('db', data)
        self.assertIn('systemPrompt', data)

    def test_put_agent_config(self):
        resp = self.client.put('/api/agents/search/config/', {
            'systemPrompt': 'Updated prompt',
            'model': 'GPT-4o',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        cfg = AgentConfig.objects.get(agent='search')
        self.assertEqual(cfg.system_prompt, 'Updated prompt')
        self.assertEqual(cfg.model, 'GPT-4o')

    def test_unknown_agent(self):
        resp = self.client.get('/api/agents/unknown/config/')
        self.assertEqual(resp.status_code, 404)


class SettingsViewTests(SetupMixin, TestCase):
    """GET/PUT /api/settings/."""

    def test_get_settings(self):
        AppSettings.load()  # ensure singleton exists
        resp = self.client.get('/api/settings/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('company', data)
        self.assertIn('aiKey', data)
        self.assertIn('runs', data)

    def test_put_settings(self):
        AppSettings.load()
        resp = self.client.put('/api/settings/', {
            'company': {'name': 'Updated Corp', 'website': 'https://updated.com'},
            'runs': {'enabled': False, 'frequency': '6h'},
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        s = AppSettings.load()
        self.assertEqual(s.company_name, 'Updated Corp')
        self.assertFalse(s.runs_enabled)
        self.assertEqual(s.run_frequency, '6h')


class ChatViewTests(SetupMixin, TestCase):
    """GET/POST /api/chat/."""

    def test_get_empty_history(self):
        resp = self.client.get('/api/chat/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    def test_send_message(self):
        resp = self.client.post('/api/chat/', {'text': 'hello'}, format='json')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('userMessage', data)
        self.assertIn('reply', data)
        self.assertEqual(data['userMessage']['from'], 'user')
        self.assertEqual(data['reply']['from'], 'ai')

    def test_send_empty_message(self):
        resp = self.client.post('/api/chat/', {'text': ''}, format='json')
        self.assertEqual(resp.status_code, 400)


class DraftViewTests(SetupMixin, TestCase):
    """OUTREACH — draft lifecycle: list, edit, approve, reject."""

    def setUp(self):
        super().setUp()
        self.lead = Lead.objects.create(company='DraftCo', website='draftco.com', score=80)
        self.draft = EmailDraft.objects.create(
            lead=self.lead,
            company='DraftCo',
            to_email='hi@draftco.com',
            subject='Test',
            body='Body',
            status=EmailDraft.Statuses.DRAFT,
        )

    def test_list_drafts(self):
        resp = self.client.get('/api/drafts/')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.json()), 1)

    def test_edit_draft(self):
        resp = self.client.put(f'/api/drafts/{self.draft.pk}/', {
            'subject': 'Updated subject',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.subject, 'Updated subject')

    def test_approve_draft(self):
        resp = self.client.post(f'/api/drafts/{self.draft.pk}/approve/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertIn(self.draft.status, (EmailDraft.Statuses.SENT, EmailDraft.Statuses.FAILED))

    def test_reject_draft(self):
        resp = self.client.post(f'/api/drafts/{self.draft.pk}/reject/', {}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, EmailDraft.Statuses.REJECTED)

    def test_cannot_edit_sent(self):
        self.draft.status = EmailDraft.Statuses.SENT
        self.draft.save()
        resp = self.client.put(f'/api/drafts/{self.draft.pk}/', {
            'subject': 'Nope',
        }, format='json')
        self.assertEqual(resp.status_code, 409)


class PipelineViewTests(SetupMixin, TestCase):
    """GET /api/pipeline/status/, GET /api/pipeline/runs/."""

    def setUp(self):
        super().setUp()
        AppSettings.load()  # ensure settings exist

    def test_pipeline_status(self):
        resp = self.client.get('/api/pipeline/status/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('running', data)
        self.assertIn('frequency', data)

    def test_pipeline_runs_empty(self):
        resp = self.client.get('/api/pipeline/runs/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])
