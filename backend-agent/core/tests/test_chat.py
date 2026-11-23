"""
Tests for core.chat — Responder reply generation.

Verifies the keyword fallback always works and that the LLM path
is attempted when available (mocked).
"""
from unittest import mock
from unittest.mock import patch

from core.tests.base import TenantTestCase

from core import assistant, convo
from core.chat import responder_reply, _keyword_reply, _crm_snapshot
from core.models import AppSettings, ChatMessage, Lead, Potential, Reply, User


class KeywordReplyTests(TenantTestCase):
    """Keyword-based fallback replies — no LLM needed."""

    def test_greeting(self):
        reply = _keyword_reply('hello')
        self.assertIn("Pipeline's running", reply)
        self.assertIn('leads', reply)

    def test_identity_questions_answered_never_acked(self):
        """'who are you' is a QUESTION, not a pipeline instruction — it must
        get the persona answer, never the 'noted for next run' canned acks."""
        from core.chat import FALLBACK_REPLIES
        for q in ('who are you', 'WHAT ARE YOU', 'who r u', 'what can you do'):
            reply = _keyword_reply(q)
            self.assertIn('sales assistant', reply, q)
            self.assertNotIn(reply, FALLBACK_REPLIES, q)

    def test_lead_query_no_data(self):
        reply = _keyword_reply('show me the leads')
        self.assertIn('No leads yet', reply)

    def test_lead_query_with_data(self):
        Lead.objects.create(company='TestCo', score=90)
        reply = _keyword_reply('what leads do we have')
        self.assertIn('TestCo', reply)

    def test_email_query(self):
        Lead.objects.create(company='EmailCo', industry='Tech', score=80, profiled=True)
        reply = _keyword_reply('draft an email')
        self.assertIn('EmailCo', reply)

    def test_reply_query_no_data(self):
        reply = _keyword_reply('any replies?')
        self.assertIn('No replies from prospects yet', reply)

    def test_reply_query_with_data(self):
        Reply.objects.create(company='ReplyCo', contact='J', channel='email', status='awaiting',
                             classification='question', from_email='j@replyco.com')
        reply = _keyword_reply('check replies')
        self.assertIn('ReplyCo', reply)

    def test_schedule_query(self):
        AppSettings.load()  # ensure settings exist
        reply = _keyword_reply('when is the next run')
        self.assertIn('pipeline', reply)

    def test_potential_query_no_data(self):
        reply = _keyword_reply('what potential deals')
        self.assertIn('No potential', reply)

    def test_potential_query_with_data(self):
        Potential.objects.create(company='BigDeal', opportunity='Website', value='$10,000', stage='qualified')
        reply = _keyword_reply('show pipeline value')
        self.assertIn('BigDeal', reply)

    def test_fallback(self):
        reply = _keyword_reply('random gibberish 12345')
        # should return one of the FALLBACK_REPLIES
        self.assertTrue(len(reply) > 20)


class CrmSnapshotTests(TenantTestCase):
    """CRM snapshot string generation for LLM context."""

    def test_snapshot_empty(self):
        snapshot = _crm_snapshot()
        self.assertIn('CRM SNAPSHOT', snapshot)
        self.assertIn('0 leads', snapshot)

    def test_snapshot_with_data(self):
        Lead.objects.create(company='SnapCo', industry='Tech', score=85)
        snapshot = _crm_snapshot()
        self.assertIn('SnapCo', snapshot)
        self.assertIn('1 leads', snapshot)


class ResponderReplyIntegrationTests(TenantTestCase):
    """Test responder_reply() dispatches correctly."""

    def test_falls_back_to_keyword_when_no_key(self):
        """Without an AI key, keyword logic is used."""
        reply = responder_reply('hello', turn=0)
        self.assertIn("Pipeline's running", reply)

    @patch('core.chat.llm_available', return_value=True)
    @patch('core.chat._llm_reply', return_value='LLM says hello')
    def test_uses_llm_when_available(self, mock_llm, mock_avail):
        reply = responder_reply('hello', turn=0)
        self.assertEqual(reply, 'LLM says hello')
        mock_llm.assert_called_once()

    @patch('core.chat.llm_available', return_value=True)
    @patch('core.chat._llm_reply', return_value=None)
    def test_falls_back_when_llm_returns_none(self, mock_llm, mock_avail):
        reply = responder_reply('hello', turn=0)
        self.assertIn("Pipeline's running", reply)  # keyword fallback

    @patch('core.chat.llm_available', return_value=True)
    @patch('core.chat._llm_reply', side_effect=Exception('API error'))
    def test_falls_back_on_llm_exception(self, mock_llm, mock_avail):
        reply = responder_reply('hello', turn=0)
        self.assertIn("Pipeline's running", reply)  # keyword fallback


# ------------------------------------------------------------------
# Memory + honesty (core.assistant + core.convo)
# ------------------------------------------------------------------

class AssistantMemoryTests(TenantTestCase):
    """The Assistant remembers the conversation, keeps it inside the model's
    window, and never shows a made-up answer. The model is replaced by
    canned answers; the bad ones are real replies from the live model."""

    def setUp(self):
        self.s = AppSettings.load()
        self.s.ai_provider, self.s.ai_key = 'Ollama', ''
        self.s.company_name = 'Acme Journals'
        self.s.services = ['Journal publishing']
        self.s.save()
        self.user = User.objects.create_user(username='chat-owner', password='pw123456')
        Lead.objects.create(company='Smile Dental Clinic', industry='dental clinic', score=88)
        self.answers = []        # what the model answers, in order (the last one repeats)
        self.prompts = []        # (system, prompt) of every model call

    def _stored(self, messages):
        """Earlier conversation, as stored ChatMessages."""
        for role, text in messages:
            ChatMessage.objects.create(user=self.user, role=role, text=text)

    def _model(self, system, prompt, **_kw):
        self.prompts.append((system, prompt))
        if 'memory notes' in system:                       # the compression call
            text = 'The user runs a journal and wants universities.'
        else:
            text = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        return {'text': text, 'prompt_tokens': 0, 'eval_tokens': 0}

    def _reply(self, text, history=()):
        self._stored(history)
        with mock.patch('core.assistant.llm_chat', side_effect=self._model):
            return responder_reply(text, turn=10_000, user=self.user)

    def test_it_remembers_what_was_said_earlier(self):
        self.answers = ['You publish a journal.']
        reply = self._reply('so what do we sell?', history=[
            ('user', 'we publish a peer-reviewed journal'), ('ai', 'Got it.')])
        self.assertEqual(reply, 'You publish a journal.')
        system, prompt = self.prompts[-1]
        self.assertIn('we publish a peer-reviewed journal', prompt)
        self.assertIn('RECENT MESSAGES:', prompt)
        self.assertIn('User: so what do we sell?', prompt)
        self.assertTrue(prompt.endswith('Assistant:'), prompt[-60:])   # the model continues the transcript

    def test_the_model_is_told_its_real_job_and_the_facts(self):
        self.answers = ['You have 1 lead.']
        self._reply('how many leads do we have?')
        system, prompt = self.prompts[-1]
        self.assertIn('AI sales assistant', system)
        self.assertIn('never with a customer', system)
        self.assertNotIn('book meetings', system.lower())
        # the live facts sit in the instructions; the conversation is the last thing read
        self.assertIn('FACTS (live from this workspace', system)
        self.assertIn('Company: Acme Journals', system)
        self.assertIn('Leads: 1 in total', system)
        self.assertIn('Smile Dental Clinic', system)
        self.assertNotIn('FACTS (live', prompt)

    def test_a_made_up_answer_is_never_shown(self):
        self.answers = ['You have 661 leads.', 'You have 1 lead.']
        reply = self._reply('how many leads do we have?')
        self.assertEqual(reply, 'You have 1 lead.')
        self.assertEqual(len(self.prompts), 2)
        self.assertIn('ANSWER AGAIN, CAREFULLY', self.prompts[1][0])

    def _say_with(self, model, text, history=()):
        self._stored(list(history))
        with mock.patch('core.assistant.llm_chat', side_effect=model):
            return responder_reply(text, turn=10_000, user=self.user)

    def test_a_cut_off_answer_keeps_its_complete_sentences(self):
        """A long answer still holds its answer in its first sentences; only
        the unfinished tail is dropped."""
        seen = []

        def model(system, prompt, **_kw):
            seen.append(system)
            return {'text': 'You have 1 lead. The first one is called', 'cut': True}

        reply = self._say_with(model, 'how many leads do we have?')
        self.assertEqual(reply, 'You have 1 lead.')
        self.assertEqual(len(seen), 1)                          # shown as trimmed, no retry

    def test_a_cut_off_answer_without_one_complete_sentence_is_not_shown(self):
        def model(system, prompt, **_kw):
            if 'ANSWER AGAIN' in system:
                return {'text': 'You have 1 lead.', 'cut': False}
            return {'text': 'You have 1 lead and the', 'cut': True}

        self.assertEqual(self._say_with(model, 'how many leads do we have?'), 'You have 1 lead.')

    def test_an_indian_script_full_stop_ends_a_sentence_too(self):
        def model(system, prompt, **_kw):
            return {'text': 'உங்களுக்கு 1 lead உள்ளது. அதன் பெயர் ஸ்மைல் டென்டல் கிளினிக் மற்றும் அதன்', 'cut': True}

        reply = self._say_with(model, 'எத்தனை leads?')
        self.assertEqual(reply, 'உங்களுக்கு 1 lead உள்ளது.')

    def test_two_made_up_answers_get_the_honest_plain_reply(self):
        self.answers = ['You have 661 leads.', 'You have 990 leads.']
        question = 'how many leads do we have?'
        self.assertEqual(self._reply(question), _keyword_reply(question))

    def test_a_long_conversation_is_compressed_before_answering(self):
        history = []
        for i in range(24):
            history += [('user', f'Question {i}: ' + 'please explain how the pipeline finds companies ' * 4),
                        ('ai', 'Answer: ' + 'the search step looks for businesses that buy from you ' * 4)]
        self.answers = ['You have 1 lead.']
        self._reply('how many leads do we have?', history=history)
        memory = convo.load_memory(User.objects.get(pk=self.user.pk))
        self.assertEqual(memory['summary'], 'The user runs a journal and wants universities.')
        self.assertGreater(memory['through'], 0)
        system, prompt = self.prompts[-1]
        self.assertIn('CONVERSATION SO FAR', prompt)
        self.assertNotIn('Question 0:', prompt)                 # the oldest turns are folded into the note
        self.assertIn('Question 23:', prompt)                   # the newest stay word for word
        self.assertLessEqual(convo.estimate_tokens(system) + convo.estimate_tokens(prompt), convo.PROMPT_BUDGET)

    def test_a_made_up_answer_compresses_the_conversation_at_once(self):
        history = [('user', 'We publish a journal.'), ('ai', 'Got it.'),
                   ('user', 'We also run conferences.'), ('ai', 'Noted.'),
                   ('user', 'hello again'), ('ai', 'Hi!')]
        self.answers = ['You have 661 leads.', 'You have 1 lead.']
        self.assertEqual(convo.load_memory(self.user)['summary'], '')
        self._reply('how many leads do we have?', history=history)
        memory = convo.load_memory(User.objects.get(pk=self.user.pk))
        self.assertTrue(memory['summary'])                      # compressed because it made things up
        self.assertEqual(len(self.prompts), 3)                  # answer, compress, answer again
        system, prompt = self.prompts[-1]
        self.assertIn('ANSWER AGAIN, CAREFULLY', system)
        self.assertIn('CONVERSATION SO FAR', prompt)
        self.assertNotIn('We publish a journal.', prompt.split('CONVERSATION SO FAR')[1].split('RECENT MESSAGES')[0])
        self.assertNotIn('RECENT MESSAGES:\nUser: We publish a journal.', prompt)

    def test_an_answer_is_judged_on_honesty_not_on_a_repeated_closing_line(self):
        self._stored([('user', 'who are you?'),
                      ('ai', 'I am the sales assistant. Let me know if you would like to run a cycle.')])
        self.answers = ['You have 1 lead. Let me know if you would like to run a cycle.']
        with mock.patch('core.assistant.llm_chat', side_effect=self._model):
            reply = responder_reply('how many leads do we have?', turn=10_000, user=self.user)
        self.assertEqual(reply, 'You have 1 lead. Let me know if you would like to run a cycle.')
        self.assertEqual(len(self.prompts), 1)                  # shown as written

    def test_the_command_layer_is_shown_the_conversation(self):
        self._stored([('user', 'approve the draft for Smile Dental Clinic'),
                      ('ai', 'Reply "yes" to confirm.')])
        with mock.patch('core.actions.handle_command', return_value='') as command, \
                mock.patch('core.chat._llm_reply', return_value='ok'):
            responder_reply('yes do it', turn=10_000, user=self.user)
        shown = command.call_args.args[2]
        self.assertEqual([h['from'] for h in shown], ['user', 'ai'])
        self.assertIn('Smile Dental Clinic', shown[0]['text'])

    def test_clearing_the_chat_clears_the_memory(self):
        from rest_framework.authtoken.models import Token
        from rest_framework.test import APIClient
        convo.save_memory(self.user, {'summary': 'They sell soap.', 'through': 9})
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.user).key}')
        self.assertEqual(client.delete('/api/chat/').status_code, 200)
        self.assertEqual(convo.load_memory(User.objects.get(pk=self.user.pk)),
                         {'summary': '', 'through': 0})
