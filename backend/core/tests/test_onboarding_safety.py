"""Onboarding never overwrites a configured workspace; secrets never land in chat history."""
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import AgentConfig, AppSettings, ChatMessage, User
from core.onboarding import (
    STEP_KEYS, _parse_mailbox, _parse_target, onboarding_reply, onboarding_status,
    redact_for_history,
)


class ExistingWorkspaceTests(TestCase):
    def setUp(self):
        s = AppSettings.load()
        s.company_name, s.services = 'Shailog', ['SaaS builds']
        s.save(update_fields=['company_name', 'services'])
        # the first user ever created becomes owner, so seed one before the teammate
        self.owner = User.objects.create_user(username='boss', password='pass12345')
        self.user = User.objects.create_user(username='teammate', password='pass12345',
                                        role='member')

    def test_existing_setup_offered_to_the_owner(self):
        status = onboarding_status(self.owner)
        self.assertEqual(status['stepKey'], 'existing')
        self.assertIn('Shailog', status['question'])

    def test_teammate_is_never_sent_into_setup(self):
        # the frontend redirects to the Assistant on needed=True — a member
        # can't reconfigure the workspace, so they must never land there
        self.assertFalse(onboarding_status(self.user)['needed'])

    def test_keep_finishes_without_writing(self):
        onboarding_reply('keep', self.user)
        self.assertTrue(onboarding_status(self.user)['done'])
        self.assertEqual(AppSettings.load().company_name, 'Shailog')

    def test_unclear_answer_reasks(self):
        self.user.role = 'owner'
        self.user.save(update_fields=['role'])
        reply = onboarding_reply('what is this?', self.user)
        self.assertIn('keep', reply)
        self.assertEqual(onboarding_status(self.user)['stepKey'], 'existing')

    def test_greeting_is_not_a_company_name(self):
        self.user.role = 'owner'
        self.user.save(update_fields=['role'])
        onboarding_reply('change', self.user)
        onboarding_reply("hi, what's the status of my leads?", self.user)
        self.assertEqual(AppSettings.load().company_name, 'Shailog')

    def test_member_cannot_restart_wizard(self):
        reply = onboarding_reply('change', self.user)
        self.user.refresh_from_db()
        self.assertTrue(self.user.onboarding.get('done'))
        self.assertFalse(self.user.onboarding.get('started'))
        self.assertIn('Settings', reply)
        s = AppSettings.load()
        self.assertEqual((s.company_name, s.services), ('Shailog', ['SaaS builds']))
        self.assertFalse(onboarding_status(self.user)['needed'])

    def test_owner_can_restart_wizard(self):
        self.user.role = 'owner'
        self.user.save(update_fields=['role'])
        onboarding_reply('change.', self.user)
        self.assertEqual(onboarding_status(self.user)['stepKey'], 'company')

    def test_loose_answers_reask(self):
        self.user.role = 'owner'
        self.user.save(update_fields=['role'])
        for text in ('setup status?', 'ok but change the name'):
            reply = onboarding_reply(text, self.user)
            self.assertIn('keep', reply)
            self.assertEqual(onboarding_status(self.user)['stepKey'], 'existing')
            self.assertFalse(onboarding_status(self.user)['done'])

    def test_whitespace_company_name_is_unconfigured(self):
        s = AppSettings.load()
        s.company_name = '   '
        s.save(update_fields=['company_name'])
        self.assertEqual(onboarding_status(self.user)['stepKey'], 'company')
        onboarding_reply('Acme Inc', self.user)
        self.assertEqual(AppSettings.load().company_name, 'Acme Inc')

    def test_target_unclear_reasks(self):
        self.assertIsNone(_parse_target('hmm not sure'))
        self.assertEqual(_parse_target('agencies'), 'agency')


class RedactionTests(TestCase):
    def test_redaction(self):
        self.assertNotIn('AIzaSyD', redact_for_history('AIzaSyD-1234567890abcdefghijkl', 'ai_key'))
        red = redact_for_history('hello@x.com:supersecret', 'email')
        self.assertIn('hello@x.com', red)
        self.assertNotIn('supersecret', red)
        self.assertEqual(redact_for_history('Acme Inc', 'company'), 'Acme Inc')

    def test_key_pasted_at_wrong_step_is_redacted(self):
        key = 'AIzaSyD-1234567890abcdefghijkl'
        self.assertNotIn('AIza', redact_for_history(key, 'company'))
        self.assertNotIn('AIza', redact_for_history(f'here is my key {key} ok', 'services'))
        self.assertNotIn('secret', redact_for_history('me@x.com:secret99', 'company'))
        self.assertEqual(redact_for_history('contact me@x.com please', 'company'),
                         'contact me@x.com please')

    def test_chat_history_redacts_key_at_company_step(self):
        user = User.objects.create_user(username='fresh2', password='pass12345', role='owner')
        user.onboarding = {'started': True, 'step': 0, 'answers': {}}
        user.save()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        client.post('/api/chat/', {'text': 'AIzaSyD-1234567890abcdefghijkl'}, format='json')
        stored = ChatMessage.objects.filter(user=user, role='user').first().text
        self.assertNotIn('AIzaSyD', stored)

    def test_gmail_app_password_with_spaces(self):
        self.assertEqual(_parse_mailbox('me@gmail.com abcd efgh ijkl mnop'),
                         ('me@gmail.com', 'abcdefghijklmnop'))

    def test_chat_history_stores_redacted_key(self):
        user = User.objects.create_user(username='fresh', password='pass12345', role='owner')
        user.onboarding = {'started': True, 'step': STEP_KEYS.index('ai_key'), 'answers': {}}
        user.save()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        client.post('/api/chat/', {'text': 'AIzaSyD-1234567890abcdefghijkl'}, format='json')
        stored = ChatMessage.objects.filter(user=user, role='user').first().text
        self.assertNotIn('AIzaSyD', stored)
        self.assertEqual(AppSettings.load().ai_key, 'AIzaSyD-1234567890abcdefghijkl')


class SecretHygieneTests(TestCase):
    def test_agent_config_masks_secrets(self):
        from core.serializers import AgentConfigSerializer
        cfg = AgentConfig.objects.create(agent='search', api_auth='secret-token-1234',
                                         db_connection='mongodb://u:p@h/9876')
        data = AgentConfigSerializer(cfg).data
        self.assertEqual(data['api']['auth'], '••••1234')
        self.assertEqual(data['db']['connection'], '••••9876')
        ser = AgentConfigSerializer(cfg, data={'api': {'auth': data['api']['auth']},
                                               'db': {'connection': data['db']['connection']}},
                                    partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        cfg.refresh_from_db()
        self.assertEqual(cfg.api_auth, 'secret-token-1234')
        self.assertEqual(cfg.db_connection, 'mongodb://u:p@h/9876')

    def test_apify_token_in_header_not_url(self):
        from core import apify_maps
        resp = mock.Mock(status_code=201)
        resp.json.return_value = {'data': {'id': 'r1', 'defaultDatasetId': 'd1'}}
        done = mock.Mock(status_code=200)
        done.json.return_value = {'data': {'status': 'SUCCEEDED'}}
        items = mock.Mock(status_code=200)
        items.json.return_value = []
        with mock.patch.dict('os.environ', {'APIFY_API_KEY': 'tok123'}), \
             mock.patch('core.apify_maps.time.sleep'), \
             mock.patch('core.apify_maps.requests.post', return_value=resp) as post, \
             mock.patch('core.apify_maps.requests.get', side_effect=[done, items]) as get:
            apify_maps.maps_places(['x in y'])
        calls = [post.call_args] + get.call_args_list
        for c in calls:
            self.assertNotIn('tok123', str(c.args))
            self.assertNotIn('token', c.kwargs.get('params') or {})
            self.assertEqual(c.kwargs['headers'], {'Authorization': 'Bearer tok123'})

    def test_unverified_tls_only_in_debug(self):
        from core.mailer import _ssl_contexts
        with override_settings(DEBUG=False):
            prod = list(_ssl_contexts())
        with override_settings(DEBUG=True):
            dev = list(_ssl_contexts())
        self.assertEqual(len(dev), len(prod) + 1)


class ConsoleDeliveryEncodingTests(TestCase):
    def test_console_delivery_survives_cp1252_stdout(self):
        import io
        import sys
        from core.mailer import send_draft
        from core.models import EmailDraft
        draft = EmailDraft.objects.create(company='Acme', to_email='a@acme.com',
                                          subject='Hello', body='Next steps \u2192 call \u2713')
        stream = io.TextIOWrapper(io.BytesIO(), encoding='cp1252')
        with mock.patch.object(sys, 'stdout', stream):
            send_draft(draft)
        draft.refresh_from_db()
        self.assertEqual(draft.status, EmailDraft.Statuses.SENT)
        self.assertEqual(draft.sent_via, EmailDraft.Via.CONSOLE)
