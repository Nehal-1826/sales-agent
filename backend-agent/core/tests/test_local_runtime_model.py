"""The self-hosted runtime must only ever be sent a model it has.

New workspaces are seeded with a cloud model name in their agent settings
("GLM-4.6"). Sent to the local runtime that name is a 404 on every call -
the pipeline fell back to templates and the Assistant to keyword replies,
for every workspace after the first two. Found by eval_assistant on the
VPS (2026-11-23)."""

from unittest import mock

from core import ai
from core.models import AgentConfig, AppSettings
from core.tests.base import TenantTestCase


def runtime_with(*names):
    resp = mock.Mock(status_code=200)
    resp.json.return_value = {'models': [{'model': name} for name in names]}
    return resp


class LocalRuntimeModelTests(TenantTestCase):
    def setUp(self):
        ai._RUNTIME_MODELS.update(at=0.0, names=None)      # forget what was asked before
        s = AppSettings.load()
        s.ai_provider, s.ai_key = 'Ollama', ''
        s.save()

    def test_a_cloud_model_name_never_reaches_the_local_runtime(self):
        """The seeded default of every new workspace."""
        with mock.patch('core.ai.requests.get', return_value=runtime_with('qwen3:1.7b')):
            self.assertEqual(ai.model_for('ollama', 'GLM-4.6'), 'qwen3:1.7b')
            self.assertEqual(ai.model_for('ollama', 'gemini-2.5-flash'), 'qwen3:1.7b')
            self.assertEqual(ai.model_for('ollama', ''), 'qwen3:1.7b')

    def test_a_model_the_runtime_has_is_used(self):
        with mock.patch('core.ai.requests.get', return_value=runtime_with('qwen3:1.7b', 'qwen3:0.6b:16k')):
            self.assertEqual(ai.model_for('ollama', 'qwen3:0.6b:16k'), 'qwen3:0.6b:16k')
            self.assertEqual(ai.model_for('ollama', 'qwen3:1.7b'), 'qwen3:1.7b')

    def test_when_the_runtime_cannot_be_asked_only_the_default_is_trusted(self):
        with mock.patch('core.ai.requests.get', side_effect=RuntimeError('down')):
            self.assertEqual(ai.model_for('ollama', 'qwen3:0.6b'), 'qwen3:1.7b')

    def test_the_runtime_is_asked_once_and_remembered(self):
        with mock.patch('core.ai.requests.get', return_value=runtime_with('qwen3:1.7b')) as ask:
            ai.model_for('ollama', 'GLM-4.6')
            ai.model_for('ollama', 'qwen3:1.7b')
        self.assertEqual(ask.call_count, 1)
        self.assertEqual(ask.call_args.args[0], 'http://localhost:11434/api/tags')

    def test_cloud_providers_keep_their_own_rules(self):
        self.assertEqual(ai.model_for('groq', 'llama-3.1-8b-instant'), 'llama-3.1-8b-instant')
        self.assertEqual(ai.model_for('gemini', 'GLM-4.6'), ai.DEFAULT_MODELS['gemini'])
        self.assertEqual(ai.model_for('gemini', 'gemini-2.5-flash'), 'gemini-2.5-flash')

    def test_a_fresh_workspace_gets_answers_not_keyword_replies(self):
        """End to end through the real call layer: the workspace's agents
        still say GLM-4.6."""
        from core.actions import detect_action_llm
        from core.assistant import assistant_answer
        AgentConfig.objects.create(agent='responder', model='GLM-4.6')
        posted = []

        def fake_post(url, **kw):
            posted.append(kw['json']['model'])
            resp = mock.Mock(status_code=200)
            resp.json.return_value = {'message': {'content': 'You have 0 leads.'},
                                      'prompt_eval_count': 5, 'eval_count': 4}
            return resp

        with mock.patch('core.ai.requests.get', return_value=runtime_with('qwen3:1.7b')), \
                mock.patch('core.ai.requests.post', side_effect=fake_post):
            self.assertEqual(assistant_answer('how many leads do we have?'), 'You have 0 leads.')
            self.assertEqual(detect_action_llm('send everything'), {'action': 'none'})
        self.assertEqual(posted, ['qwen3:1.7b', 'qwen3:1.7b'])
