"""The regression run itself must work: it scores scripted conversations
against the model, reports, and leaves nothing behind. The model here is a
stand-in; on the server the same run talks to the real one."""

import os
from io import StringIO
from unittest import mock

from django.core.management import call_command

from core.models import User, Workspace
from core.tests.base import TenantTestCase

READING = {'services': ['Journal publishing'], 'customer_type': 'organisations',
           'buyers': ['university', 'research institute'], 'own_kind': 'other',
           'ideal_client': 'A research institute that wants to publish.'}

LOCAL = mock.patch.dict(os.environ, {'AI_PROVIDER': 'Ollama'})


def fake_model(system, prompt, **_kw):
    """Answers that fit whatever was asked last (earlier turns are in the
    prompt too), so every check should pass."""
    if 'memory notes' in system:
        text = 'The user publishes a journal and asked about leads.'
    elif 'classify commands' in system:
        text = '{"action": "none"}'
    elif 'in-product guide' in system:
        asked = prompt.rsplit('USER QUESTION:', 1)[-1]
        text = ('Hey — open Settings → Who to find and pick the kinds of businesses.'
                if 'who to find' in asked else 'Hey — open Settings → Email sending and pick your provider.')
    elif 'ACTION RESULT' in prompt:
        text = 'Done.'
    else:
        asked = prompt.rsplit('PERSON WROTE:', 1)[-1].lower()
        if 'who are you' in asked:
            text = "I'm the AI sales assistant for Eval Journals - I find leads and write the outreach emails."
        elif 'எத்தனை' in asked:
            text = 'உங்களுக்கு 5 leads உள்ளன.'
        elif 'did you send' in asked:
            text = 'Not yet - nothing sends until you approve it.'
        elif 'what do we sell' in asked:
            text = 'You publish a peer-reviewed journal.'
        else:
            text = 'You have 5 leads at the moment.'
    return {'text': text, 'prompt_tokens': 400, 'eval_tokens': 20}


class EvalAssistantTests(TenantTestCase):
    def test_the_quick_run_passes_with_a_good_model_and_cleans_up(self):
        out = StringIO()
        with LOCAL, mock.patch('core.ai.llm_chat', side_effect=fake_model), \
                mock.patch('core.business_profile.llm_json', return_value=dict(READING)):
            call_command('eval_assistant', '--quick', stdout=out)
        text = out.getvalue()
        self.assertIn('RESULT: 11/11 checks passed (quick run)', text)
        self.assertIn('model calls:', text)
        self.assertIn('honesty guard:', text)
        self.assertFalse(Workspace.all_tenants.filter(slug__startswith='eval-').exists())
        self.assertFalse(User.objects.filter(username__startswith='eval-').exists())

    def test_a_made_up_model_fails_the_run_and_the_guard_limits_the_damage(self):
        def bad_model(system, prompt, **_kw):
            if 'memory notes' in system or 'classify commands' in system:
                return fake_model(system, prompt)
            return {'text': 'You have 661 leads.', 'prompt_tokens': 400, 'eval_tokens': 20}

        out = StringIO()
        with LOCAL, mock.patch('core.ai.llm_chat', side_effect=bad_model), \
                mock.patch('core.business_profile.llm_json', return_value=dict(READING)):
            with self.assertRaises(SystemExit):
                call_command('eval_assistant', '--quick', stdout=out)
        text = out.getvalue()
        self.assertIn('RESULT: 5/11 checks passed', text)
        self.assertIn('FAILED: counts, no false "I sent it", remembers the chat, answers in Tamil, '
                      'guide: mailbox, guide: who to find', text)
        self.assertNotIn('661 leads', text)                       # never shown, not even in the report
        self.assertIn('7 made-up answer(s) caught (0 answered again cleanly, 7 honest fallback', text)
        self.assertFalse(Workspace.all_tenants.filter(slug__startswith='eval-').exists())

    def test_without_a_model_it_says_so_instead_of_scoring_keyword_replies(self):
        out = StringIO()
        with mock.patch('core.ai.llm_chat', side_effect=fake_model):
            with self.assertRaises(SystemExit) as stopped:
                call_command('eval_assistant', '--quick', stdout=out)
        self.assertIn('no model to answer', str(stopped.exception))
        self.assertFalse(Workspace.all_tenants.filter(slug__startswith='eval-').exists())
