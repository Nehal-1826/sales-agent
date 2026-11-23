"""Live-guide persona polish — opener rotation, live-number anchors, single
next step. Structural behavior (actions, knowledge base, member/owner split
of workspace_state) is covered by test_permissions / test_isolation_api."""
from unittest import mock

from core import convo, guide
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

        def fake_chat(system, prompt, **kw):
            calls.append({'prompt': prompt, 'system': system})
            return {'text': 'Answer.'}

        patcher = mock.patch.multiple(
            'core.guide', llm_available=mock.DEFAULT, llm_chat=mock.DEFAULT)
        patched = patcher.start()
        patched['llm_available'].return_value = True
        patched['llm_chat'].side_effect = fake_chat
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


class GuideMemoryTests(TenantTestCase):
    """The guide answers inside the model's window: a long conversation is
    compressed into a memory note, the least relevant knowledge is left out,
    and a made-up answer is never shown."""

    LONG = ('please explain again in detail how the pipeline finds companies and what '
            'happens with every draft before it is sent ') * 3

    def setUp(self):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = 'Ollama', ''
        s.save()
        self.owner = User.objects.create_user(username='owner', password='pw123456')
        lead = Lead.objects.create(company='Acme', website='acme.com')
        EmailDraft.objects.create(lead=lead, company='Acme', to_email='a@acme.com',
                                  subject='s', body='b')
        self.prompts = []

    def _chat(self, answers):
        """Replace the model: memory calls get a note, answers come from `answers`."""
        state = {'left': list(answers)}

        def fake_chat(system, prompt, **_kw):
            self.prompts.append((system, prompt))
            if 'memory notes' in system:
                text = 'The user is setting up email sending step by step.'
            else:
                text = state['left'].pop(0) if len(state['left']) > 1 else state['left'][0]
            return {'text': text, 'prompt_tokens': 0, 'eval_tokens': 0}

        patcher = mock.patch('core.guide.llm_chat', side_effect=fake_chat)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _long_history(self):
        return [{'from': 'user', 'text': f'TURN {i}: ' + self.LONG} if i % 2 == 0 else
                {'from': 'ai', 'text': f'TURN {i}: first open Settings and read every option. ' * 6}
                for i in range(30)]

    def test_a_long_conversation_is_compressed_into_a_memory_note(self):
        self._chat(['Answer.'])
        history = self._long_history()
        self.assertEqual(guide_answer('what is next?', history=history, user=self.owner), 'Answer.')
        prompt = self.prompts[-1][1]
        self.assertIn('CONVERSATION SO FAR', prompt)
        self.assertIn('setting up email sending', prompt)
        self.assertNotIn('TURN 0:', prompt)                     # the oldest turns are folded into the note
        self.assertIn('TURN 29:', prompt)                       # the newest stay word for word
        self.assertEqual(len(self.prompts), 2)                  # one compression call, one answer
        system = self.prompts[-1][0]
        self.assertLessEqual(convo.estimate_tokens(system) + convo.estimate_tokens(prompt),
                             guide.GUIDE_BUDGET)

    def test_a_short_conversation_keeps_every_word(self):
        self._chat(['Answer.'])
        history = [{'from': 'user', 'text': 'how do I add a mailbox?'},
                   {'from': 'ai', 'text': 'Settings, then Email sending.'}]
        guide_answer('and then?', history=history, user=self.owner)
        prompt = self.prompts[-1][1]
        self.assertEqual(len(self.prompts), 1)                   # nothing to compress
        self.assertIn('User: how do I add a mailbox?', prompt)
        self.assertIn('Assistant: Settings, then Email sending.', prompt)

    def test_only_the_knowledge_the_question_is_about_is_sent(self):
        """Reading the whole base costs the model about 40 seconds before it
        writes a word."""
        self._chat(['Answer.'])
        guide_answer('how do I connect my mailbox?', user=self.owner)
        system, prompt = self.prompts[-1]
        self.assertIn('Settings → Email sending', prompt)
        self.assertIn('PRODUCT: WarmPulse', prompt)              # the one-line summary stays
        self.assertNotIn('TROUBLESHOOTING', prompt)              # nothing to do with the question
        self.assertLess(convo.estimate_tokens(system) + convo.estimate_tokens(prompt), 1500)

    def test_a_question_that_matches_nothing_still_gets_all_the_knowledge(self):
        self._chat(['Answer.'])
        guide_answer('xyzzy plugh', user=self.owner)
        prompt = self.prompts[-1][1]
        self.assertIn('WHATSAPP', prompt)
        self.assertIn('TROUBLESHOOTING', prompt)

    def test_a_follow_up_question_is_answered_with_the_earlier_topic(self):
        self._chat(['Answer.'])
        history = [{'from': 'user', 'text': 'how do I set up follow-ups?'},
                   {'from': 'ai', 'text': 'Settings, then Follow-ups.'}]
        guide_answer('what else should I know?', history=history, user=self.owner)
        prompt = self.prompts[-1][1]
        self.assertIn('FOLLOW-UPS', prompt)
        self.assertNotIn('Settings → Email templates', prompt)

    def test_when_the_window_is_small_only_the_closest_knowledge_survives(self):
        self._chat(['Answer.'])
        with mock.patch.object(guide, 'GUIDE_KNOWLEDGE_TOKENS', 200):
            guide_answer('how do I connect my mailbox?', user=self.owner)
        system, prompt = self.prompts[-1]
        self.assertIn('Settings → Email sending', prompt)       # the area the question is about
        self.assertIn('PRODUCT: WarmPulse', prompt)              # the one-line summary always stays
        self.assertNotIn('FOLLOW-UPS (', prompt)                 # related, but no longer fits
        self.assertLess(convo.estimate_tokens(prompt), 1200)

    def test_an_answer_that_ends_on_a_page_path_is_not_a_cut_off_answer(self):
        self._chat(['Hey — open Settings, Email sending, add a mailbox'])
        answer = guide_answer('how do I connect my mailbox?', user=self.owner)
        self.assertEqual(answer, 'Hey — open Settings, Email sending, add a mailbox')
        self.assertEqual(len(self.prompts), 1)                   # not flagged, not retried)

    def test_asking_who_to_find_works_in_the_guide_too(self):
        found = {'buyers': ['school', 'college'], 'ideal_client': 'Schools.', 'services': ['Courses'],
                 'customer_type': 'organisations'}
        with mock.patch('core.business_profile.analyse_buyers', return_value=found):
            reply = guide_answer('who should I find?', user=self.owner)
        self.assertIn('Reply "yes"', reply)
        self.assertIn('school', reply)
