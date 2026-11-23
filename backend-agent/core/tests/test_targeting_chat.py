"""Talking about WHO TO FIND in the Assistant, and the command check.

The owner typed what they sell and the model answered "those are what you
sell, not who to find" - correct, and useless. The Assistant must do the
next step itself: work out who is likely to buy, from what the company does
(its site and profile, plus anything the owner just said), and offer to set
it. Setting it is a real change, so it waits for "yes".
"""

import json
from unittest import mock

from core.actions import detect_action, detect_action_llm, handle_command
from core.business_profile import plan_targeting
from core.models import AppSettings, User
from core.tests.base import TenantTestCase

FOUND = {'buyers': ['university', 'research institute', 'nonprofit organization'],
         'ideal_client': 'A research institute that wants to publish.', 'services': ['Journal publishing'],
         'customer_type': 'organisations'}


def canned(found=FOUND):
    return mock.patch('core.business_profile.analyse_buyers', return_value=found)


class WhoToFindChatTests(TenantTestCase):
    def setUp(self):
        s = AppSettings.load()
        s.company_name, s.company_website = 'Acme Journals', 'acme.example'
        s.services, s.icp_mode = ['Journal publishing'], 'buyer'
        s.target_industries, s.target_countries = '', ''
        s.save()
        self.s = s
        self.user = User.objects.create_user(username='owner', password='pw123456')
        self.member = User.objects.create_user(username='mate', password='pw123456', role='member')

    def pending(self):
        return (User.objects.get(pk=self.user.pk).pending_action or {}).get('spec') or {}

    def test_asking_who_to_find_gets_an_analysis_and_an_offer(self):
        with canned():
            reply = handle_command('who should I find?', self.user)
        self.assertIn('university', reply)
        self.assertIn('research institute', reply)
        self.assertIn('Reply "yes"', reply)                 # a real change: it waits for a yes
        self.assertEqual(self.pending()['action'], 'set_targeting')
        self.assertEqual(self.pending()['industries'], FOUND['buyers'])
        self.assertEqual(AppSettings.load().target_industries, '')   # nothing is set before the yes

    def test_what_they_say_they_sell_is_used_for_the_analysis(self):
        with canned() as analyse:
            handle_command('We publish journals and run conferences. who should I find?', self.user)
        self.assertIn('publish journals', analyse.call_args.kwargs['about'])

    def test_yes_sets_who_to_find(self):
        with canned():
            handle_command('who should I find?', self.user)
            result = handle_command('yes', self.user)
        s = AppSettings.load()
        self.assertEqual(s.target_industries, 'university, research institute, nonprofit organization')
        self.assertEqual(s.icp_mode, 'buyer')
        self.assertEqual(s.icp_notes, 'A research institute that wants to publish.')
        self.assertEqual(s.target_countries, '')           # a .com gives no country: worldwide stays
        self.assertIn('university', result)

    def test_no_changes_nothing(self):
        with canned():
            handle_command('who should I find?', self.user)
            handle_command('no', self.user)
        self.assertEqual(AppSettings.load().target_industries, '')
        self.assertEqual(self.pending(), {})

    def test_a_member_only_gets_the_refusal(self):
        with canned() as analyse:
            reply = handle_command('who should I find?', self.member)
        self.assertIn('owner or an admin', reply)
        analyse.assert_not_called()

    def test_when_nothing_can_be_worked_out_it_says_so(self):
        with canned(None):
            reply = handle_command('who should I find?', self.user)
        self.assertNotIn('Reply "yes"', reply)
        self.assertIn("couldn't work out who buys", reply)
        self.assertEqual(self.pending(), {})

    def test_individual_customers_get_no_company_kinds(self):
        with canned(dict(FOUND, buyers=[], customer_type='individuals')):
            reply = handle_command('who should I find?', self.user)
        self.assertIn('individual people', reply)
        self.assertEqual(self.pending(), {})

    def test_saying_what_you_sell_offers_the_analysis_until_who_to_find_is_set(self):
        with canned() as analyse:
            first = handle_command('we sell online courses for engineers', self.user)
        self.assertIn('Reply "yes"', first)
        self.assertIn('online courses for engineers', analyse.call_args.kwargs['about'])
        self.s.target_industries = 'school'
        self.s.save()
        with canned() as analyse:
            second = handle_command('we sell online courses for engineers', self.user)
        self.assertEqual(second, '')                       # already set: ordinary conversation
        analyse.assert_not_called()

    def test_real_requests_in_everyday_wording(self):
        for text in ('who should I find?', 'who should we target?', 'who is likely to buy from us?',
                     'work out who to find', 'tell me who to find', 'who to find',
                     'What businesses should I look for?', 'suggest some leads for me'):
            with self.subTest(text=text), canned():
                self.assertIn('Reply "yes"', handle_command(text, self.user))

    def test_questions_about_the_setting_are_not_requests(self):
        """"where do I set who to find?" asks about the product - offering to
        overwrite the list there would be wrong."""
        for text in ('where do I set who to find?', 'what is who to find?', 'how does who to find work?'):
            with self.subTest(text=text), canned() as analyse:
                self.assertEqual(handle_command(text, self.user), '')
            analyse.assert_not_called()

    def test_in_agency_mode_the_offer_says_it_switches(self):
        self.s.icp_mode = 'agency'
        self.s.save()
        with canned():
            reply = handle_command('who should I find?', self.user)
        self.assertIn('customers', reply.lower())

    def test_a_domain_with_a_country_code_brings_the_country(self):
        self.s.company_website = 'acmejournal.in'
        self.s.save()
        with canned():
            handle_command('who should I find?', self.user)
            handle_command('yes', self.user)
        self.assertEqual(AppSettings.load().target_countries, 'India')


class PlanTargetingTests(TenantTestCase):
    def setUp(self):
        s = AppSettings.load()
        s.company_name, s.company_website = 'Shailog Technologies', 'shailog.com'
        s.services = ['web design', 'SEO']
        s.save()

    def test_it_drops_the_workspace_own_kind(self):
        """A web studio's own kind is never a buyer (the ICP peer guard)."""
        found = dict(FOUND, buyers=['school', 'web design agency', 'college'])
        with mock.patch('core.business_profile.analyse_buyers', return_value=found):
            plan = plan_targeting()
        self.assertEqual(plan['buyers'], ['school', 'college'])

    def test_nothing_to_go_on_is_none(self):
        with mock.patch('core.business_profile.analyse_buyers', return_value=None):
            self.assertIsNone(plan_targeting())


class CommandCheckTests(TenantTestCase):
    """Every message used to cost a model call to decide whether it was a
    command (23 s each, with the model's thinking on)."""

    def setUp(self):
        s = AppSettings.load()
        s.ai_provider, s.ai_key = 'Ollama', ''      # the model is "available"
        s.save()

    def test_small_talk_never_asks_the_model(self):
        with mock.patch('core.actions.detect_action_llm') as ask:
            for text in ('hello there', 'thanks a lot', 'nice weather today',
                         'vanakkam machan epdi irukka', 'I like the new design'):
                self.assertEqual(detect_action(text), {'action': 'none'}, text)
        ask.assert_not_called()

    def test_command_words_do_ask(self):
        with mock.patch('core.actions.detect_action_llm', return_value={'action': 'none'}) as ask:
            # none of these is caught by the keyword rules - only the model can tell
            for text in ('go ahead and find me some new companies', 'get rid of the lead called Zenith',
                         'zap the leads called Zenith', 'halt the pipeline', 'send everything',
                         'do it yourself'):
                detect_action(text)
        self.assertEqual(ask.call_count, 6)

    def test_the_answer_is_locked_and_only_relevant_fields_are_kept(self):
        raw = {'action': 'run_pipeline', 'company': 'Smile Dental Clinic', 'frequency': 'daily'}
        with mock.patch('core.actions.llm_chat', return_value={'text': json.dumps(raw)}) as call:
            spec = detect_action_llm('find me leads')
        self.assertEqual(spec, {'action': 'run_pipeline'})   # the stray fields cannot do anything
        self.assertEqual(call.call_args.kwargs['schema']['properties']['action']['enum'][-2:],
                         ['suggest_targeting', 'none'])
        self.assertLessEqual(call.call_args.kwargs['max_tokens'], 160)

    def test_an_unknown_or_empty_answer_is_none(self):
        for raw in ({'action': 'delete_everything'}, {}, 'not json at all'):
            with mock.patch('core.actions.llm_chat', return_value={'text': json.dumps(raw) if isinstance(raw, dict) else raw}):
                self.assertEqual(detect_action_llm('something'), {'action': 'none'}, raw)

    def test_a_failed_call_is_none(self):
        with mock.patch('core.actions.llm_chat', return_value=None):
            self.assertEqual(detect_action_llm('send everything'), {'action': 'none'})
