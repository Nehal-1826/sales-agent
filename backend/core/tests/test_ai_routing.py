"""LLM routing: never post a key to the wrong company; never send a foreign model id."""
import os
from unittest import mock

from django.test import TestCase

from core import ai
from core.models import AppSettings
from core.onboarding import _provider_for_key


class RoutingTests(TestCase):
    def _settings(self, provider, key='k-123'):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = provider, key
        s.save()
        return s

    def test_unknown_provider_never_calls_openai(self):
        self._settings('Anthropic')
        with mock.patch('core.ai.requests.post') as post:
            self.assertIsNone(ai.llm_complete('hi'))
        post.assert_not_called()
        self.assertFalse(ai.llm_available())

    def test_other_provider_disables_ai(self):
        self._settings('Other')
        with mock.patch('core.ai.requests.post') as post:
            self.assertIsNone(ai.llm_complete('hi'))
        post.assert_not_called()
        self.assertFalse(ai.llm_available())

    def test_resolve_provider(self):
        self.assertIsNone(ai.resolve_provider('Anthropic'))
        self.assertIsNone(ai.resolve_provider('Other'))
        self.assertIsNone(ai.resolve_provider('Gemni'))
        self.assertEqual(ai.resolve_provider(''), 'openai')
        self.assertEqual(ai.resolve_provider(None), 'openai')
        self.assertEqual(ai.resolve_provider('OpenAI'), 'openai')
        self.assertEqual(ai.resolve_provider('Zhipu (GLM)'), 'glm')
        self.assertEqual(ai.resolve_provider('Google AI'), 'google')

    def test_known_provider_available(self):
        self._settings('Gemini')
        self.assertTrue(ai.llm_available())

    def test_no_key_not_available(self):
        self._settings('Gemini', key='')
        self.assertFalse(ai.llm_available())

    def test_model_for_rejects_foreign_family(self):
        self.assertEqual(ai.model_for('gemini', 'GLM-4.6'), ai.DEFAULT_MODELS['gemini'])
        self.assertEqual(ai.model_for('gemini', 'gemini-2.5-flash'), 'gemini-2.5-flash')
        self.assertEqual(ai.model_for('openai', ''), ai.DEFAULT_MODELS['openai'])
        self.assertEqual(ai.model_for('glm', 'GLM-4.6'), 'GLM-4.6')

    def test_model_for_accepts_anything_on_multi_family_hosts(self):
        self.assertEqual(ai.model_for('groq', 'llama-3.1-8b-instant'), 'llama-3.1-8b-instant')
        self.assertEqual(ai.model_for('ollama', 'qwen2.5'), 'qwen2.5')
        self.assertEqual(ai.model_for('groq', ''), ai.DEFAULT_MODELS['groq'])

    def test_request_uses_fitting_model(self):
        self._settings('Gemini')
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'choices': [{'message': {'content': 'ok'}}]}
        with mock.patch('core.ai.requests.post', return_value=resp) as post:
            ai.llm_complete('hi', model='GLM-4.6')
        self.assertEqual(post.call_args.kwargs['json']['model'], ai.DEFAULT_MODELS['gemini'])

    def test_request_keeps_matching_model(self):
        self._settings('Gemini')
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'choices': [{'message': {'content': 'ok'}}]}
        with mock.patch('core.ai.requests.post', return_value=resp) as post:
            self.assertEqual(ai.llm_complete('hi', model='gemini-2.5-flash'), 'ok')
        self.assertEqual(post.call_args.kwargs['json']['model'], 'gemini-2.5-flash')
        self.assertIn('generativelanguage.googleapis.com', post.call_args.args[0])

    def test_env_provider_absorbed_with_key(self):
        AppSettings.objects.all().delete()
        with mock.patch.dict(os.environ, {'AI_KEY': 'AIza-test', 'AI_PROVIDER': 'Gemini'}):
            s = AppSettings.load()
        self.assertEqual(s.ai_provider, 'Gemini')

    def test_env_provider_persisted(self):
        AppSettings.objects.all().delete()
        with mock.patch.dict(os.environ, {'AI_KEY': 'AIza-test', 'AI_PROVIDER': 'Gemini'}):
            AppSettings.load()
        s = AppSettings.objects.get(pk=1)
        self.assertEqual((s.ai_provider, s.ai_key), ('Gemini', 'AIza-test'))

    def test_env_provider_does_not_override_existing_key(self):
        # A key already in the DB is the source of truth — env must not swap
        # the provider underneath it (that would point a key at the wrong host).
        self._settings('Groq', key='gsk_existing')
        with mock.patch.dict(os.environ, {'AI_KEY': 'AIza-test', 'AI_PROVIDER': 'Gemini'}):
            s = AppSettings.load()
        self.assertEqual((s.ai_provider, s.ai_key), ('Groq', 'gsk_existing'))

    def test_absorb_never_full_row_saves(self):
        # The pipeline run lock lives on this row; absorbing env secrets must
        # only write the columns it touched.
        AppSettings.load()  # row exists, so get_or_create doesn't insert via save()
        with mock.patch.dict(os.environ, {'AI_KEY': 'AIza-test', 'AI_PROVIDER': 'Gemini'}):
            with mock.patch.object(AppSettings, 'save', autospec=True) as save:
                AppSettings.load()
        self.assertTrue(save.called)
        for call in save.call_args_list:
            self.assertIn('update_fields', call.kwargs)
            self.assertIn('ai_provider', call.kwargs['update_fields'])


class ProviderForKeyTests(TestCase):
    def test_key_prefixes(self):
        self.assertEqual(_provider_for_key('gsk_abc123'), 'Groq')
        self.assertEqual(_provider_for_key('AIzaSyABC'), 'Gemini')
        self.assertEqual(_provider_for_key('sk-abc123'), 'OpenAI')
        self.assertEqual(_provider_for_key('sk-proj-abc123'), 'OpenAI')

    def test_glm_style_key(self):
        self.assertEqual(_provider_for_key('0123456789abcdef0123456789abcdef.AbCdEfGh12345678'),
                         'Zhipu (GLM)')

    def test_unrecognised_key_is_not_guessed(self):
        self.assertEqual(_provider_for_key('abcdefghijklmnopqrstuvwxyz0123456789'), '')
        self.assertEqual(_provider_for_key('sk-or-v1-abcdef0123456789'), '')
        self.assertEqual(_provider_for_key('sk-ant-api03-abcdef'), '')

    def test_guessed_provider_is_routable(self):
        for key in ('gsk_abc', 'AIzaSyABC', 'sk-abc', '0123456789abcdef.AbCdEf'):
            self.assertIsNotNone(ai.resolve_provider(_provider_for_key(key)), key)
