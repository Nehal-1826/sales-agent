"""LLM routing: never post a key to the wrong company; never send a foreign model id."""
import os
from unittest import mock

import requests as requests_lib

from core.tests.base import TenantTestCase

from core import ai
from core.models import AppSettings
from core.onboarding import _provider_for_key


class RoutingTests(TenantTestCase):
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
        self.assertEqual(ai.resolve_provider('Qwen (DashScope)'), 'qwen')
        self.assertEqual(ai.resolve_provider('dashscope'), 'dashscope')
        self.assertTrue(
            ai.provider_base_url('Qwen').startswith('https://dashscope-intl'))
        self.assertEqual(ai.model_for('qwen', 'qwen3-1.7b'), 'qwen3-1.7b')
        # a foreign model id falls back to the Qwen default, never leaks to another provider
        self.assertEqual(ai.model_for('qwen', 'GLM-4.6'), 'qwen3-1.7b')

    def test_known_provider_available(self):
        self._settings('Gemini')
        self.assertTrue(ai.llm_available())

    def test_local_provider_needs_no_key(self):
        self._settings('Ollama', key='')
        self.assertTrue(ai.llm_available())
        self.assertEqual(ai.provider_base_url('Ollama'), 'http://localhost:11434/v1')

    def test_local_base_url_env_override(self):
        import os
        with mock.patch.dict(os.environ, {'OLLAMA_BASE_URL': 'http://ollama:11434/v1'}):
            self.assertEqual(ai.provider_base_url('ollama'), 'http://ollama:11434/v1')

    def test_llm_complete_keyless_local_posts_without_auth(self):
        self._settings('Ollama', key='')
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'choices': [{'message': {'content': 'ok'}}]}
        with mock.patch('core.ai.requests.post', return_value=resp) as post:
            self.assertEqual(ai.llm_complete('hi', model='qwen3:1.7b'), 'ok')
        self.assertNotIn('Authorization', post.call_args.kwargs['headers'])
        self.assertEqual(post.call_args.kwargs['json']['model'], 'qwen3:1.7b')

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
        self.assertEqual(ai.model_for('groq', ''), ai.DEFAULT_MODELS['groq'])
        # the self-hosted runtime is the exception — only a model it HAS
        # (test_local_runtime_model.py); its address is asked from the
        # environment, so nothing here reaches the network unexpectedly
        with mock.patch.dict(os.environ, {'OLLAMA_BASE_URL': 'http://127.0.0.1:9/v1'}):
            self.assertEqual(ai.model_for('ollama', 'qwen2.5'), ai.DEFAULT_MODELS['ollama'])

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
        s = AppSettings.objects.get(workspace=self.workspace)
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


class ProviderForKeyTests(TenantTestCase):
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


class LlmJsonTests(TenantTestCase):
    """llm_json — schema-constrained JSON from the LOCAL runtime only. The
    grammar makes the reply parse; cloud providers and any failure give None."""

    SCHEMA = {'type': 'object', 'properties': {'kind': {'type': 'string'}},
              'required': ['kind']}

    def _local(self):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = 'Ollama', ''
        s.save()

    def _post_returning(self, content):
        resp = mock.Mock(status_code=200)
        resp.json.return_value = {'message': {'content': content}}
        return mock.patch('core.ai.requests.post', return_value=resp)

    def test_posts_to_the_native_api_with_the_schema_and_no_thinking(self):
        self._local()
        with self._post_returning('{"kind": "clinic"}') as post:
            out = ai.llm_json('sys', 'prompt', self.SCHEMA)
        self.assertEqual(out, {'kind': 'clinic'})
        url = post.call_args.args[0]
        self.assertEqual(url, 'http://localhost:11434/api/chat')
        body = post.call_args.kwargs['json']
        self.assertEqual(body['format'], self.SCHEMA)
        self.assertIs(body['stream'], False)
        self.assertIs(body['think'], False)
        self.assertEqual(body['model'], ai.DEFAULT_MODELS['ollama'])
        self.assertEqual(body['messages'][0], {'role': 'system', 'content': 'sys'})

    def test_honours_the_configured_ollama_address(self):
        self._local()
        with mock.patch.dict(os.environ, {'OLLAMA_BASE_URL': 'http://ollama:11434/v1'}), \
                self._post_returning('{"kind": "x"}') as post:
            ai.llm_json('s', 'p', self.SCHEMA)
        self.assertEqual(post.call_args.args[0], 'http://ollama:11434/api/chat')

    def test_reply_that_is_not_a_json_object_is_none(self):
        self._local()
        for junk in ('[1, 2]', 'not json', '', 'null'):
            with self.subTest(junk=junk), self._post_returning(junk):
                self.assertIsNone(ai.llm_json('s', 'p', self.SCHEMA))

    def test_transport_error_is_none(self):
        import requests
        self._local()
        with mock.patch('core.ai.requests.post', side_effect=requests.ConnectionError('down')):
            self.assertIsNone(ai.llm_json('s', 'p', self.SCHEMA))

    def test_cloud_providers_are_never_asked_for_json(self):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = 'OpenAI', 'sk-test-000000000000'
        s.save()
        with mock.patch('core.ai.requests.post') as post:
            self.assertIsNone(ai.llm_json('s', 'p', self.SCHEMA))
        post.assert_not_called()


class AiReadyTests(TenantTestCase):
    """Settings → aiKey.ready: the Home checklist must not nag for an API key
    when the product's own local model does the work."""

    def _ready(self, provider, key):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = provider, key
        s.save()
        from core.serializers import SettingsSerializer
        return SettingsSerializer(AppSettings.load()).data['aiKey']['ready']

    def test_local_runtime_is_ready_without_a_key(self):
        self.assertTrue(self._ready('Ollama', ''))

    def test_cloud_provider_is_ready_only_with_its_key(self):
        self.assertFalse(self._ready('OpenAI', ''))
        self.assertTrue(self._ready('OpenAI', 'sk-test-000000000000'))

    def test_unknown_provider_is_never_ready(self):
        self.assertFalse(self._ready('Anthropic', 'some-key-000000'))


class LlmChatTests(TenantTestCase):
    """The conversation call. On the self-hosted runtime the model's private
    thinking is OFF — it ran 150-400 hidden tokens per answer (a five-word
    reply took 155), so every chat turn cost 20-45 s — and it reports how
    many tokens it was given, so a conversation can be kept inside the
    model's memory window."""

    def setUp(self):
        self.s = AppSettings.load()
        self.s.ai_provider, self.s.ai_key = 'Ollama', ''
        self.s.save()

    @staticmethod
    def _ok(payload):
        resp = mock.Mock(status_code=200)
        resp.json.return_value = payload
        return resp

    def test_local_runtime_is_asked_without_thinking(self):
        payload = {'message': {'content': '  Sure.  ', 'thinking': 'let me see'},
                   'prompt_eval_count': 412, 'eval_count': 9}
        with mock.patch('core.ai.requests.post', return_value=self._ok(payload)) as post:
            out = ai.llm_chat('sys', 'prompt')
        self.assertEqual(post.call_args.args[0], 'http://localhost:11434/api/chat')
        body = post.call_args.kwargs['json']
        self.assertIs(body['think'], False)
        self.assertIs(body['stream'], False)
        self.assertNotIn('format', body)
        self.assertEqual(body['model'], 'qwen3:1.7b')
        self.assertEqual(body['messages'][0], {'role': 'system', 'content': 'sys'})
        self.assertEqual(body['messages'][1], {'role': 'user', 'content': 'prompt'})
        self.assertLessEqual(body['options']['num_predict'], 400)
        # the reply is the answer only — the hidden thinking never reaches the user
        self.assertEqual(out, {'text': 'Sure.', 'prompt_tokens': 412, 'eval_tokens': 9, 'cut': False})

    def test_a_schema_locks_the_answer_shape(self):
        schema = {'type': 'object', 'properties': {'action': {'type': 'string'}}}
        with mock.patch('core.ai.requests.post', return_value=self._ok({'message': {'content': '{}'}})) as post:
            ai.llm_chat('sys', 'prompt', schema=schema, max_tokens=120)
        self.assertEqual(post.call_args.kwargs['json']['format'], schema)
        self.assertEqual(post.call_args.kwargs['json']['options']['num_predict'], 120)

    def test_cloud_provider_uses_the_standard_endpoint(self):
        self.s.ai_provider, self.s.ai_key = 'OpenAI', 'sk-test-000000000000'
        self.s.save()
        payload = {'choices': [{'message': {'content': 'Hello there'}}],
                   'usage': {'prompt_tokens': 20, 'completion_tokens': 3}}
        with mock.patch('core.ai.requests.post', return_value=self._ok(payload)) as post:
            out = ai.llm_chat('sys', 'prompt')
        url = post.call_args.args[0]
        self.assertEqual(url, 'https://api.openai.com/v1/chat/completions')
        body = post.call_args.kwargs['json']
        self.assertNotIn('think', body)
        self.assertEqual(post.call_args.kwargs['headers']['Authorization'], 'Bearer sk-test-000000000000')
        self.assertEqual(out, {'text': 'Hello there', 'prompt_tokens': 20, 'eval_tokens': 3, 'cut': False})

    def test_an_answer_stopped_by_the_length_limit_says_so(self):
        """The runtime reports why it stopped: 'length' means the sentence
        was cut off — callers never show half an answer."""
        payload = {'message': {'content': 'You have 12 leads and the first one'},
                   'prompt_eval_count': 300, 'eval_count': 220, 'done_reason': 'length'}
        with mock.patch('core.ai.requests.post', return_value=self._ok(payload)):
            self.assertTrue(ai.llm_chat('sys', 'prompt', max_tokens=220)['cut'])
        self.s.ai_provider, self.s.ai_key = 'OpenAI', 'sk-test-000000000000'
        self.s.save()
        payload = {'choices': [{'message': {'content': 'cut short here'}, 'finish_reason': 'length'}],
                   'usage': {}}
        with mock.patch('core.ai.requests.post', return_value=self._ok(payload)):
            self.assertTrue(ai.llm_chat('sys', 'prompt')['cut'])

    def test_failures_answer_none_never_raise(self):
        cases = [mock.Mock(status_code=500), requests_lib.ConnectionError('down')]
        for resp in cases:
            with self.subTest(resp=type(resp).__name__),                     mock.patch('core.ai.requests.post', **{'side_effect': [resp]} if isinstance(resp, Exception) else {'return_value': resp}):
                self.assertIsNone(ai.llm_chat('sys', 'prompt'))
        # the runtime answering an error object, an empty reply, a provider with no key
        with mock.patch('core.ai.requests.post', return_value=self._ok({'error': 'model not found'})):
            self.assertIsNone(ai.llm_chat('sys', 'prompt'))
        with mock.patch('core.ai.requests.post', return_value=self._ok({'message': {'content': '   '}})):
            self.assertIsNone(ai.llm_chat('sys', 'prompt'))
        self.s.ai_provider, self.s.ai_key = 'OpenAI', ''
        self.s.save()
        self.assertIsNone(ai.llm_chat('sys', 'prompt'))

class DefaultProviderTests(TenantTestCase):
    """A NEW workspace starts on the self-hosted runtime when this deployment
    runs one: the local model is a platform capability, not a secret each
    company has to bring. (Without this the AI-filled setup — and the search
    itself — silently did nothing for every workspace after the first.)"""

    def _fresh(self, slug, env):
        from billing.tests.test_entitlements import make_ws
        from core.tenancy import workspace_context
        ws = make_ws(slug)
        with mock.patch.dict(os.environ, env), workspace_context(ws):
            return AppSettings.load()

    def test_new_workspace_starts_on_the_local_runtime(self):
        s = self._fresh('fresh-co', {'AI_PROVIDER': 'Ollama'})
        self.assertEqual(s.ai_provider, 'Ollama')
        self.assertTrue(ai.llm_ready_for(s))          # and needs no key

    def test_without_a_local_runtime_a_new_workspace_starts_on_openai(self):
        s = self._fresh('plain-co', {'AI_PROVIDER': ''})
        self.assertEqual(s.ai_provider, 'OpenAI')

    def test_a_provider_the_workspace_already_chose_is_kept(self):
        from billing.tests.test_entitlements import make_ws
        from core.tenancy import workspace_context
        ws = make_ws('chosen-co')
        with workspace_context(ws):
            AppSettings.load().delete()
            s = AppSettings.load()
            s.ai_provider = 'Gemini'
            s.save()
        with mock.patch.dict(os.environ, {'AI_PROVIDER': 'Ollama'}), workspace_context(ws):
            self.assertEqual(AppSettings.load().ai_provider, 'Gemini')
