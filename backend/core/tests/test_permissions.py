"""Role boundary: a member (support teammate) must not read or change the
owner's workspace configuration, send mail, export leads or run cycles —
over the API or through the chat."""
from unittest import mock

from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.actions import NOT_ALLOWED, handle_command
from core.guide import workspace_state
from core.models import AgentConfig, AppSettings, EmailDraft, EmailTemplate, Lead, SearchProfile, User


def client_for(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.get_or_create(user=user)[0].key}')
    return c


class RolePermissionTests(TestCase):
    def setUp(self):
        # first user ever becomes owner, so seed the owner before the member
        self.owner = User.objects.create_user(username='owner', password='pass12345')
        self.member = User.objects.create_user(username='support', password='pass12345', role='member')
        self.admin = User.objects.create_user(username='adm', password='pass12345', role='admin')
        s = AppSettings.load()
        s.report_email = 'boss@shailog.com'
        s.save(update_fields=['report_email'])
        self.profile = SearchProfile.objects.create(name='Owner private profile')
        self.tpl = EmailTemplate.objects.create(name='T', subject='s', body='b')
        AgentConfig.objects.get_or_create(agent='copywright')
        self.lead = Lead.objects.create(company='Acme', website='acme.com')
        self.draft = EmailDraft.objects.create(lead=self.lead, company='Acme',
                                               to_email='a@acme.com', subject='s', body='b')
        self.m = client_for(self.member)

    # --- reads of owner configuration -------------------------------------
    def test_member_cannot_read_settings_profiles_templates_agent_config(self):
        for url in ('/api/settings/', '/api/profiles/', '/api/templates/',
                    '/api/agents/copywright/config/'):
            r = self.m.get(url)
            self.assertEqual(r.status_code, 403, url)
        self.assertNotIn('boss@shailog.com', self.m.get('/api/settings/').content.decode())
        self.assertNotIn('Owner private profile', self.m.get('/api/profiles/').content.decode())

    # --- writes / privileged operations -----------------------------------
    def test_member_cannot_change_or_trigger_anything(self):
        calls = [
            ('put', '/api/settings/', {'runs': {'enabled': False}}),
            ('post', '/api/profiles/', {'name': 'x'}),
            ('post', f'/api/profiles/{self.profile.id}/activate/', {}),
            ('post', '/api/templates/', {'name': 'n', 'subject': 's', 'body': 'b'}),
            ('put', f'/api/templates/{self.tpl.id}/', {'name': 'n2'}),
            ('delete', f'/api/templates/{self.tpl.id}/', None),
            ('put', '/api/agents/copywright/config/', {'systemPrompt': 'pwn'}),
            ('post', '/api/settings/smtp_connect/', {'user': 'a@b.com', 'password': 'x'}),
            ('post', '/api/report/test/', {}),
            ('post', '/api/report/generate/', {'email': True}),
            ('post', '/api/pipeline/run/', {}),
            ('post', f'/api/leads/{self.lead.id}/draft_email/', {}),
            ('post', f'/api/drafts/{self.draft.id}/approve/', {}),
            ('post', f'/api/drafts/{self.draft.id}/send/', {}),
            ('post', f'/api/drafts/{self.draft.id}/reject/', {}),
            ('put', f'/api/drafts/{self.draft.id}/', {'toEmail': 'evil@x.com'}),
            ('post', '/api/drafts/bulk_approve/', {'ids': [self.draft.id]}),
            ('post', '/api/leads/', {'company': 'x'}),
            ('delete', f'/api/leads/{self.lead.id}/', None),
        ]
        with mock.patch('core.mailer.send_draft') as send:
            for method, url, body in calls:
                r = getattr(self.m, method)(url, body, format='json') if body is not None \
                    else getattr(self.m, method)(url)
                self.assertEqual(r.status_code, 403, f'{method} {url}')
            send.assert_not_called()
        # nothing changed
        self.draft.refresh_from_db()
        self.assertEqual((self.draft.status, self.draft.to_email), ('draft', 'a@acme.com'))
        self.assertTrue(Lead.objects.filter(pk=self.lead.pk).exists())
        self.assertTrue(EmailTemplate.objects.filter(pk=self.tpl.pk).exists())
        self.assertEqual(AppSettings.load().report_email, 'boss@shailog.com')

    def test_member_cannot_export_the_lead_book(self):
        self.assertEqual(self.m.get('/api/leads/export/').status_code, 403)

    def test_member_can_still_read_the_crm(self):
        for url in ('/api/leads/', '/api/drafts/', '/api/potential/', '/api/replies/',
                    '/api/pipeline/status/', '/api/outreach/status/', '/api/auth/me/'):
            self.assertEqual(self.m.get(url).status_code, 200, url)

    def test_owner_admin_and_superuser_keep_access(self):
        for user in (self.owner, self.admin):
            c = client_for(user)
            self.assertEqual(c.get('/api/settings/').status_code, 200)
            self.assertEqual(c.get('/api/profiles/').status_code, 200)
            self.assertEqual(c.get('/api/leads/export/').status_code, 200)
        su = User.objects.create_superuser(username='root', password='pass12345', email='r@x.com')
        su.role = 'member'   # default role on a Django-created account
        su.save(update_fields=['role'])
        self.assertEqual(client_for(su).get('/api/settings/').status_code, 200)

    def test_unauthenticated_still_401(self):
        self.assertEqual(APIClient().get('/api/settings/').status_code, 401)

    # --- chat / guide are a second door -----------------------------------
    def test_member_chat_cannot_trigger_actions(self):
        self.assertEqual(handle_command('approve all drafts', self.member), NOT_ALLOWED)
        self.assertEqual(handle_command('switch to the backup profile', self.member), NOT_ALLOWED)
        self.assertEqual(handle_command('pause the runs', self.member), NOT_ALLOWED)
        self.assertEqual(handle_command('run a cycle', self.member), NOT_ALLOWED)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'draft')
        self.assertTrue(AppSettings.load().runs_enabled)

    def test_member_cannot_confirm_a_stored_action(self):
        # an action confirmed while the user WAS privileged must not run after a demotion
        self.admin.pending_action = {
            'spec': {'action': 'approve_all', 'draft_ids': [self.draft.id]},
            'summary': 's', 'expires': '2999-01-01T00:00:00+00:00'}
        self.admin.role = 'member'
        self.admin.save(update_fields=['pending_action', 'role'])
        self.assertEqual(handle_command('yes', self.admin), NOT_ALLOWED)
        self.draft.refresh_from_db()
        self.assertEqual(self.draft.status, 'draft')

    def test_admin_chat_action_still_asks_to_confirm(self):
        self.assertIn('yes', handle_command('approve all drafts', self.admin).lower())

    def test_guide_prompt_hides_owner_config_from_members(self):
        member_view = workspace_state(self.member)
        self.assertNotIn('boss@shailog.com', member_view)
        self.assertNotIn('AI key', member_view)
        self.assertIn('boss@shailog.com', workspace_state(self.owner))


class TokenLifecycleTests(TestCase):
    """Tokens expire, die on logout and on password change."""

    def setUp(self):
        self.user = User.objects.create_user(username='u1', password='pass12345', role='owner')
        self.token = Token.objects.create(user=self.user)

    def _get(self, key=None):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {key or self.token.key}')
        return c.get('/api/auth/me/')

    def test_fresh_token_works(self):
        self.assertEqual(self._get().status_code, 200)

    def test_expired_token_is_rejected_and_deleted(self):
        from datetime import timedelta
        from django.utils import timezone
        Token.objects.filter(pk=self.token.pk).update(created=timezone.now() - timedelta(days=15))
        self.assertEqual(self._get().status_code, 401)
        self.assertFalse(Token.objects.filter(pk=self.token.pk).exists())

    def test_login_replaces_an_expired_token(self):
        from datetime import timedelta
        from django.utils import timezone
        Token.objects.filter(pk=self.token.pk).update(created=timezone.now() - timedelta(days=15))
        r = APIClient().post('/api/auth/login/', {'username': 'u1', 'password': 'pass12345'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertNotEqual(r.json()['token'], self.token.key)
        self.assertEqual(self._get(r.json()['token']).status_code, 200)

    def test_logout_revokes_server_side(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        self.assertEqual(c.post('/api/auth/logout/').status_code, 200)
        self.assertEqual(self._get().status_code, 401)

    def test_password_change_kills_existing_tokens(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        r = c.post('/api/auth/password/', {'currentPassword': 'pass12345',
                                           'newPassword': 'newpass12345',
                                           'confirmPassword': 'newpass12345'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self._get().status_code, 401)

    def test_stock_token_endpoint_is_gone(self):
        from django.urls import Resolver404, resolve
        with self.assertRaises(Resolver404):
            resolve('/api/auth/token/')
