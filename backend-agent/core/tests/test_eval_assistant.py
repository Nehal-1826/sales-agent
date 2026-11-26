"""The regression run itself must work: it scores scripted conversations
against the model, reports, and leaves nothing behind. The model here is a
stand-in; on the server the same run talks to the real one."""

import os
from io import StringIO
from unittest import mock

from django.core.management import call_command

from core.models import User, Workspace
from core.tenancy import workspace_context
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
        asked = prompt.rsplit('User: ', 1)[-1].lower()       # the message just written
        if 'who are you' in asked:
            text = "I'm the AI sales assistant for Eval Journals - I find leads and write the outreach emails."
        elif 'எத்தனை' in asked:
            text = 'உங்களுக்கு 5 leads உள்ளன.'
        elif 'did you send' in asked:
            text = 'Not yet - nothing sends until you approve it.'
        elif 'my name' in asked:
            text = 'Your name is Karthik - you handle partnerships.'
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
        self.assertIn('RESULT: 12/12 checks passed (quick run)', text)
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
        self.assertIn('RESULT: 6/12 checks passed', text)
        self.assertIn('FAILED: counts, remembers the conversation, '
                      'each turn continues the last prompt, answers in Tamil, guide: mailbox, '
                      'guide: who to find', text)                      # a retry compresses, so the
                                                            # transcript no longer continues
        self.assertNotIn('661 leads', text)                       # never shown, not even in the report
        self.assertIn('8 made-up answer(s) caught (0 answered again cleanly, 8 honest fallback', text)
        self.assertFalse(Workspace.all_tenants.filter(slug__startswith='eval-').exists())

    def test_without_a_model_it_says_so_instead_of_scoring_keyword_replies(self):
        out = StringIO()
        with mock.patch('core.ai.llm_chat', side_effect=fake_model):
            with self.assertRaises(SystemExit) as stopped:
                call_command('eval_assistant', '--quick', stdout=out)
        self.assertIn('no model to answer', str(stopped.exception))
        self.assertFalse(Workspace.all_tenants.filter(slug__startswith='eval-').exists())

    def test_what_a_killed_run_left_behind_is_swept_by_the_next_run(self):
        """A run killed hard cannot clean up: one such workspace stayed on
        the live server (2026-11-23). The next run removes old leftovers -
        and never one that may belong to a run still going."""
        stale = 'eval-20000101-000000'                           # long ago
        # not old yet: a run that could still be going. Not "now": the command
        # makes its own workspace from the clock's second, and when both fell
        # in one the test died on the slug's UNIQUE constraint (26 Nov 2026).
        fresh = 'eval-20991231-235959'
        for slug in (stale, fresh):
            workspace = Workspace.all_tenants.create(slug=slug, name=slug)
            with workspace_context(workspace):
                User.objects.create_user(username=slug, password='pw12345678')
        with LOCAL, mock.patch('core.ai.llm_chat', side_effect=fake_model), \
                mock.patch('core.business_profile.llm_json', return_value=dict(READING)):
            call_command('eval_assistant', '--quick', stdout=StringIO())
        self.assertFalse(Workspace.all_tenants.filter(slug=stale).exists())
        self.assertFalse(User.objects.filter(username=stale).exists())
        self.assertTrue(Workspace.all_tenants.filter(slug=fresh).exists())
        self.assertTrue(User.objects.filter(username=fresh).exists())
        User.objects.filter(username=fresh).delete()
        Workspace.all_tenants.filter(slug=fresh).delete()

    def test_only_our_own_throwaway_workspaces_are_ever_swept(self):
        """Nothing that is not an 'eval-<timestamp>' of this command moves."""
        from core.management.commands.eval_assistant import sweep_leftovers
        real = Workspace.all_tenants.create(slug='evaluation-client', name='A real customer')
        with workspace_context(real):
            User.objects.create_user(username='their-owner', password='pw12345678')
        self.assertEqual(sweep_leftovers(), 0)
        self.assertTrue(Workspace.all_tenants.filter(slug='evaluation-client').exists())
        self.assertTrue(User.objects.filter(username='their-owner').exists())
        User.objects.filter(username='their-owner').delete()
        Workspace.all_tenants.filter(slug='evaluation-client').delete()

    def test_a_malformed_or_dated_stamp_is_never_guessed(self):
        """Only a slug that is exactly this command's 'eval-<stamp>' can go."""
        from core.management.commands.eval_assistant import sweep_leftovers
        Workspace.all_tenants.create(slug='eval-', name='no stamp')
        Workspace.all_tenants.create(slug='eval-not-a-date', name='not a date')
        Workspace.all_tenants.create(slug='eval-20990101-000000', name='from the future')
        self.assertEqual(sweep_leftovers(), 0)
        self.assertEqual(Workspace.all_tenants.filter(slug__startswith='eval-').count(), 3)
        Workspace.all_tenants.filter(slug__in=('eval-', 'eval-not-a-date',
                                               'eval-20990101-000000')).delete()

    def test_the_termination_signal_handler_leaves_through_the_cleanup(self):
        """pkill sends SIGTERM; as an exception it runs the command's
        `finally`. (SIGKILL cannot be caught at all - the sweep above is
        for that. The real wiring is checked on the server with a pkill.)"""
        from core.management.commands.eval_assistant import _leave
        for name in ('SIGTERM', 'SIGINT', 'SIGHUP'):
            with self.subTest(name=name), self.assertRaises(SystemExit) as left:
                _leave(name)(0, None)
            self.assertEqual(str(left.exception), f'{name} received')
