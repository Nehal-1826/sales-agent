"""core.convo — the Assistant's memory and its honesty guard.

Pure logic (no model, no network): the token estimate, fitting a conversation
into the model's memory window, compressing what no longer fits, and the
detector that recognises a made-up answer. The bad replies quoted here are
real ones the live model gave the owner on 2026-11-21/22.
"""

from unittest import mock

from core import convo
from core.models import User
from core.tests.base import TenantTestCase

DATA = ('Company: Acme Journals - what we sell: journal publishing\n'
        'Leads: 12 total, 3 waiting for approval\n'
        'Waiting for approval: Smile Dental Clinic <info@smiledental.in>\n')


def turn(role, text, id=0):
    return {'id': id, 'role': role, 'text': text}


class TokenEstimateTests(TenantTestCase):
    def test_english_is_a_little_over_counted(self):
        # the live model read 2,930 chars as 689 tokens (4.25 chars/token);
        # estimating high keeps the conversation under the limit
        self.assertGreater(convo.estimate_tokens('word ' * 586), 689)
        self.assertLess(convo.estimate_tokens('word ' * 586), 689 * 1.25)

    def test_every_tamil_letter_counts(self):
        english = convo.estimate_tokens('a' * 100)
        self.assertGreater(convo.estimate_tokens('ச' * 100), english * 2)

    def test_empty(self):
        self.assertEqual(convo.estimate_tokens(''), 0)


class FitTurnsTests(TenantTestCase):
    def setUp(self):
        self.turns = [turn('user', f'question number {i} about leads and drafts', id=i * 2 + 1) for i in range(8)]

    def test_everything_fits(self):
        kept, overflow = convo.fit_turns(self.turns, 10_000)
        self.assertEqual(kept, self.turns)
        self.assertEqual(overflow, [])

    def test_the_newest_turns_are_kept_inside_the_budget(self):
        kept, overflow = convo.fit_turns(self.turns, 40)
        self.assertTrue(kept, 'the newest turns always stay')
        self.assertLessEqual(sum(convo.estimate_tokens(t['text']) for t in kept), 40)
        self.assertEqual(kept, self.turns[-len(kept):])          # a suffix, in order
        self.assertEqual(overflow, self.turns[:-len(kept)])      # everything older

    def test_a_huge_latest_turn_is_cut_rather_than_dropped(self):
        turns = [turn('user', 'short one', id=1), turn('assistant', 'long answer ' * 400, id=2)]
        kept, overflow = convo.fit_turns(turns, 60)
        self.assertEqual([t['id'] for t in kept], [2])
        self.assertLessEqual(convo.estimate_tokens(kept[0]['text']), 60)
        self.assertEqual([t['id'] for t in overflow], [1])


class RollUpTests(TenantTestCase):
    """What no longer fits is folded into a short memory, never dropped."""

    def setUp(self):
        self.turns = [turn('user', 'We publish an open-access journal.', id=5),
                      turn('assistant', 'Got it - noted for the next cycle.', id=6),
                      turn('user', 'Please find universities for me.', id=7)]

    def test_the_model_summary_is_kept_short(self):
        model = mock.Mock(return_value='The user publishes a journal ' + 'and wants universities. ' * 80)
        summary = convo.roll_up('Earlier: they said hello.', self.turns, model=model)
        self.assertLessEqual(len(summary), convo.SUMMARY_CHARS)
        self.assertTrue(summary.startswith('The user publishes a journal'))
        # the model is given both the earlier memory and the exact messages
        prompt = model.call_args.args[0]
        self.assertIn('Earlier: they said hello.', prompt)
        self.assertIn('We publish an open-access journal.', prompt)
        self.assertIn('Please find universities for me.', prompt)

    def test_without_a_model_the_messages_are_shortened_not_invented(self):
        """Deterministic fallback: only words the user or the assistant
        actually wrote."""
        long_turns = [turn('user', 'We sell handmade soap and candles to shops ' * 20, id=i) for i in range(8)]
        summary = convo.roll_up('', long_turns, model=None)
        self.assertLessEqual(len(summary), convo.SUMMARY_CHARS)
        self.assertIn('User: We sell handmade soap', summary)
        self.assertNotIn('Earlier', summary)

    def test_an_earlier_memory_is_carried_over_without_a_model(self):
        summary = convo.roll_up('They sell soap.', [turn('user', 'Find shops.', id=9)], model=None)
        self.assertTrue(summary.startswith('They sell soap.'))


class MemoryTests(TenantTestCase):
    def test_a_new_user_has_no_memory_and_it_persists_once_saved(self):
        user = User.objects.create_user(username='mem-owner', password='pw123456')
        self.assertEqual(convo.load_memory(user), {'summary': '', 'through': 0})
        convo.save_memory(user, {'summary': 'They sell soap.', 'through': 9})
        self.assertEqual(convo.load_memory(User.objects.get(pk=user.pk)),
                         {'summary': 'They sell soap.', 'through': 9})


class DetectProblemsTests(TenantTestCase):
    def problems(self, reply, data=DATA, **kw):
        return set(convo.detect_problems(reply, data=data, **kw))

    def test_a_grounded_reply_is_clean(self):
        reply = ('You have 12 leads right now, and 3 drafts are waiting for your '
                 'approval - the first is Smile Dental Clinic. Say "approve all drafts" to send them.')
        self.assertEqual(self.problems(reply), set())

    def test_made_up_totals(self):
        """Live reply: 'We have 661 leads, 435 potential clients, and 158 draft
        messages pending' - the CRM had a handful."""
        self.assertEqual(self.problems(
            'Here is the verification: We have 661 leads, 435 potential clients, and 158 draft messages pending.'),
            {'ungrounded_numbers'})
        self.assertEqual(self.problems('You have 5 leads at the moment.'), {'ungrounded_numbers'})
        self.assertEqual(self.problems('There are 2 new replies from prospects.'), {'ungrounded_numbers'})

    def test_ordinary_small_numbers_are_not_facts(self):
        for reply in ('I can do that in 2 minutes - the first results take about 24 hours.',
                      'Here are the top 5 leads right now: Smile Dental Clinic.',
                      'There are 3 steps: approve, send, wait.',
                      'It runs every 15 minutes while it is on.'):
            self.assertEqual(self.problems(reply), set(), reply)

    def test_claiming_something_was_done(self):
        for reply in ("I've sent the report to anna@example.com.",
                      'I have paused the runs.',
                      'Done - I updated your email address.',
                      "I've drafted the email and it's waiting in Approvals.",
                      'I set up the filter for you.',
                      'I deleted the old leads.'):
            self.assertEqual(self.problems(reply), {'claims_action'}, reply)

    def test_when_a_command_really_ran_saying_so_is_fine(self):
        reply = "I've sent the daily report to anna@example.com."
        self.assertEqual(convo.detect_problems(reply, data='ACTION RESULT: Emailed the daily report.', action_ran=True),
                         [])

    def test_talking_about_doing_is_not_claiming(self):
        for reply in ("I'll pause the runs as soon as you say \"pause the runs\".",
                      'Nothing is sent until you approve it.',
                      "I've noted that for next time.",
                      'You sent 3 emails yesterday.',
                      'The report was sent at 8 PM.',
                      'I can send it once you approve - say "send the report".'):
            self.assertEqual(self.problems(reply), set(), reply)

    def test_made_up_names(self):
        self.assertEqual(self.problems('Hi Rahul, you have 3 drafts waiting.'), {'ungrounded_names'})
        self.assertEqual(self.problems('Iron Gym wants a call back.'), {'ungrounded_names'})
        self.assertEqual(self.problems('Smile Dental Clinic wants a call back.'), set())      # it is in the data
        self.assertEqual(self.problems('Hi Rahul, you have 3 drafts waiting.', data=DATA + 'Owner: Rahul\n'), set())

    def test_places_and_product_words_are_not_made_up_names(self):
        for reply in ('Open Settings, then Who to find, and add towns such as Salem.',
                      "I'd look for universities in and around Tamil Nadu first.",
                      'The Assistant runs on the WarmPulse model, not on ChatGPT.'.replace('ChatGPT', 'another service'),
                      'Run a cycle from Home, then check Approvals on Monday.'):
            self.assertEqual(self.problems(reply), set(), reply)

    def test_names_the_user_wrote_are_known(self):
        reply = 'Zenith Events is waiting - shall I approve it?'
        self.assertEqual(self.problems(reply), {'ungrounded_names'})
        self.assertEqual(convo.detect_problems(reply, data=DATA, turns='User: what about Zenith Events?'), [])

    def test_repetition_and_leaks(self):
        self.assertEqual(self.problems('Got it. Got it. Got it. Anything else?'), {'repeat'})
        self.assertEqual(self.problems('<think>The user asks about leads.</think>You have 12 leads.'),
                         {'thinking_leak'})
        self.assertEqual(self.problems('Okay, the user is asking about the leads. You have 12 leads.'),
                         {'thinking_leak'})
        self.assertEqual(self.problems('Okay, the run finished - 12 leads so far.'), set())
        self.assertEqual(self.problems('As an AI language model developed by OpenAI, I can help with that.'),
                         {'identity_leak'})
        self.assertEqual(self.problems("I'm the AI sales assistant for Acme Journals."), set())
        self.assertEqual(self.problems('Best, [Your Name] from [Company]'), {'placeholder'})

    def test_live_reply_that_refused_for_no_reason(self):
        self.assertIn('false_refusal', self.problems(
            "I'm sorry, but I don't have access to your personal information."))

    def test_language_and_shape(self):
        self.assertEqual(convo.detect_problems('You have 12 leads.', data=DATA, language='tamil'), ['language'])
        self.assertEqual(convo.detect_problems('உங்களுக்கு 12 leads உள்ளன.', data=DATA, language='tamil'), [])
        self.assertEqual(self.problems('   '), {'empty'})
        self.assertEqual(self.problems('word ' * 900), {'too_long'})
        self.assertEqual(self.problems('You have 12 leads in total, and the first one is'),
                         {'cut_off'})
        self.assertEqual(self.problems('Your leads are'), {'cut_off'})
        # an answer that simply ends on a word is complete (a page path, Tamil)
        self.assertEqual(self.problems('Go to Settings, then Mailboxes and speed'), set())
        self.assertEqual(self.problems('உங்களுக்கு 12 leads உள்ளன'), set())
        self.assertEqual(self.problems('Say "approve all drafts" and I will ask first.'), set())
        self.assertEqual(self.problems('உங்களுக்கு 12 leads உள்ளன.'), set())


class GuardedTests(TenantTestCase):
    def test_a_clean_first_answer_is_used_as_is(self):
        generate = mock.Mock(side_effect=lambda mode: 'You have 12 leads.')
        reply, problems, regenerated = convo.guarded(
            generate, fallback=lambda: 'FALLBACK', data=DATA)
        self.assertEqual((reply, problems, regenerated), ('You have 12 leads.', [], False))
        self.assertEqual([c.args[0] for c in generate.call_args_list], ['normal'])

    def test_a_made_up_answer_is_replaced_by_a_compressed_retry(self):
        generate = mock.Mock(side_effect=['You have 661 leads.', 'You have 12 leads.'])
        reply, problems, regenerated = convo.guarded(
            generate, fallback=lambda: 'FALLBACK', data=DATA)
        self.assertEqual(reply, 'You have 12 leads.')
        self.assertEqual(problems, ['ungrounded_numbers'])
        self.assertTrue(regenerated)
        self.assertEqual([c.args[0] for c in generate.call_args_list], ['normal', 'tight'])

    def test_two_bad_answers_get_an_honest_fallback_never_a_guess(self):
        generate = mock.Mock(side_effect=['You have 661 leads.', 'You have 990 leads.'])
        reply, problems, regenerated = convo.guarded(
            generate, fallback=lambda: 'FALLBACK', data=DATA)
        self.assertEqual((reply, problems, regenerated), ('FALLBACK', ['ungrounded_numbers'], True))

    def test_no_answer_at_all_gets_the_fallback(self):
        generate = mock.Mock(side_effect=lambda mode: None)
        reply, _problems, _regenerated = convo.guarded(
            generate, fallback=lambda: 'FALLBACK', data=DATA)
        self.assertEqual(reply, 'FALLBACK')

    def test_the_tight_retry_is_judged_without_the_old_messages(self):
        """In the retry the model is no longer shown the earlier messages, so
        a name it repeats from them is now made up."""
        def generate(mode):
            return 'You have 661 leads.' if mode == 'normal' else 'Zenith Events wants a call.'
        reply, problems, regenerated = convo.guarded(
            generate, fallback=lambda: 'FALLBACK', data=DATA, turns='User: what about Zenith Events?')
        self.assertEqual((reply, problems, regenerated), ('FALLBACK', ['ungrounded_numbers'], True))
