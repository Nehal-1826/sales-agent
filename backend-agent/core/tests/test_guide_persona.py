"""Live-guide persona polish — opener rotation, live-number anchors, single
next step. Structural behavior (actions, knowledge base, member/owner split
of workspace_state) is covered by test_permissions / test_isolation_api."""
from unittest import mock

from core.guide import (FALLBACK_ANSWER, GUIDE_OPENERS, _next_opener,
                        guide_answer, workspace_state)
from core.models import AppSettings, EmailDraft, Lead, Mailbox, User
from core.tests.base import TenantTestCase


class OpenerRotationTests(TenantTestCase):
    def test_at_least_four_distinct_openers(self):
        self.assertGreaterEqual(len(GUIDE_OPENERS), 4)
        self.assertEqual(len(set(GUIDE_OPENERS)), len(GUIDE_OPENERS))

    def test_next_opener_rotates(self):
        seen = [_next_opener() for _ in range(len(GUIDE_OPENERS))]
        self.assertEqual(len(set(seen)), len(GUIDE_OPENERS))
        self.assertIn(_next_opener(), GUIDE_OPENERS)


class WorkspaceStateLiveNumbersTests(TenantTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(workspace=self.workspace,
                                              username='owner', password='pass12345')

    def test_mailbox_counts_anchor_the_prompt(self):
        Mailbox.objects.create(from_email='a@shailog.com', label='A',
                               smtp_host='smtp.shailog.com', smtp_user='a@shailog.com',
                               smtp_password='pw', is_active=True)
        Mailbox.objects.create(from_email='b@shailog.com', label='B')  # unconfigured
        state = workspace_state(self.owner)
        self.assertIn('Sending mailboxes: 2 total, 1 fully configured, 1 warmup-capable', state)

    def test_no_mailboxes_points_at_settings(self):
        state = workspace_state(self.owner)
        self.assertIn('Sending mailboxes: 0 total', state)
        self.assertIn('Settings → Mailboxes', state)

    def test_member_state_still_hides_owner_config(self):
        Mailbox.objects.create(from_email='a@shailog.com', label='A',
                               smtp_host='smtp.shailog.com', smtp_user='a@shailog.com',
                               smtp_password='pw')
        member = User.objects.create_user(workspace=self.workspace, username='support',
                                          password='pass12345', role='member')
        state = workspace_state(member)
        self.assertIn('Leads in CRM', state)
        self.assertNotIn('Sending mailboxes', state)
        self.assertNotIn('AI key', state)


class FallbackAnswerTests(TenantTestCase):
    """No AI key → templated answer must still quote live numbers and end in
    one concrete next step."""

    def setUp(self):
        self.owner = User.objects.create_user(workspace=self.workspace,
                                              username='owner', password='pass12345')
        # never absorb an operator's env secrets into the test workspace
        env = mock.patch.dict('os.environ',
                              {k: '' for k in ('AI_KEY', 'SMTP_HOST', 'SMTP_USER',
                                               'SMTP_PASSWORD', 'FROM_EMAIL', 'REPORT_EMAIL')})
        env.start()
        self.addCleanup(env.stop)
        self.assertFalse(AppSettings.load().ai_key)  # keyless → template path

    def test_drafts_anchor_and_single_next_step(self):
        lead = Lead.objects.create(company='Acme', website='acme.com')
        EmailDraft.objects.create(lead=lead, company='Acme', to_email='a@acme.com',
                                  subject='s', body='b')
        EmailDraft.objects.create(lead=lead, company='Acme2', to_email='b@acme.com',
                                  subject='s', body='b')
        answer = guide_answer('what should I do next?', user=self.owner)
        self.assertIn('2 drafts waiting', answer)
        self.assertIn('CRM → OUTREACH', answer)

    def test_empty_crm_points_at_first_cycle(self):
        answer = guide_answer('how do I start?', user=self.owner)
        self.assertIn(FALLBACK_ANSWER.split('. ')[0], answer)
        self.assertIn('Run cycle', answer)


class LLMPromptVoiceTests(TenantTestCase):
    """With an AI key, the system prompt + user prompt enforce the voice:
    rotating opener, live-number quoting, one next step with its page."""

    def setUp(self):
        self.owner = User.objects.create_user(workspace=self.workspace,
                                              username='owner', password='pass12345')
        lead = Lead.objects.create(company='Acme', website='acme.com')
        EmailDraft.objects.create(lead=lead, company='Acme', to_email='a@acme.com',
                                  subject='s', body='b')

    def _capture(self):
        calls = []

        def fake_complete(prompt, system='', **kw):
            calls.append({'prompt': prompt, 'system': system})
            return 'Answer.'

        patcher = mock.patch.multiple(
            'core.guide', llm_available=mock.DEFAULT, llm_complete=mock.DEFAULT)
        patched = patcher.start()
        patched['llm_available'].return_value = True
        patched['llm_complete'].side_effect = fake_complete
        self.addCleanup(patcher.stop)
        return calls

    def test_prompt_carries_opener_live_numbers_and_next_step_rules(self):
        calls = self._capture()
        answer = guide_answer('how do I send my first email?', user=self.owner)
        self.assertEqual(answer, 'Answer.')
        self.assertEqual(len(calls), 1)
        prompt, system = calls[0]['prompt'], calls[0]['system']
        self.assertRegex(prompt, r'OPENER: \S')
        self.assertIn('drafts awaiting approval: 1', prompt)  # live number quoted
        self.assertIn('single best next step', prompt)
        self.assertIn('first-run checklist', system)
        self.assertIn('never "you may have drafts"', system)
        for filler in ('"certainly"', '"great question"'):
            self.assertIn(filler, system)  # banned explicitly

    def test_openers_rotate_across_answers(self):
        calls = self._capture()
        guide_answer('question one?', user=self.owner)
        guide_answer('question two?', user=self.owner)
        openers = [c['prompt'].split('OPENER: ')[1].split('\n')[0] for c in calls]
        self.assertEqual(len(openers), 2)
        self.assertNotEqual(openers[0], openers[1])
        for opener in openers:
            self.assertIn(opener, GUIDE_OPENERS)
