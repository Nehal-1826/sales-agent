"""The lead-finding gate: a workspace without proper data cannot fetch leads.

The owner found 726 leads that had nothing to do with the business
(veterinary clinics, tattoo shops, yoga studios…): the pipeline searched a
fixed list of somebody else's customers for a workspace nobody had set up.
Proper data is three SAVED things - company name, what you sell, who to
find - and until all three exist every door that starts lead finding is
shut: the button, the chat command, autopilot and the scheduler.
"""

from unittest import mock

from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import lead_gate
from core.actions import handle_command
from core.chat import responder_reply
from core.management.commands import pipeline_loop, run_worker
from core.models import AppSettings, PipelineRun, SearchProfile, User
from core.pipeline import run_pipeline, start_pipeline_async
from core.tenancy import workspace_context
from core.tests.base import TenantTestCase
from django.test import TransactionTestCase

ALL_THREE = ['company_name', 'services', 'who']


def setup_data(name='Acme Journals', services=('Journal publishing',), industries='university',
               mode='buyer'):
    """Write the workspace's setup directly, as Settings does."""
    s = AppSettings.load()
    s.company_name = name or ''
    s.services = list(services or ())
    s.target_industries = industries or ''
    s.icp_mode = mode
    s.runs_enabled = False
    s.save()
    return s


class OwnerTestCase(TenantTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='gate-owner', password='pw12345678',
                                              role='owner')


class ReadinessTests(OwnerTestCase):
    def test_an_empty_workspace_is_not_ready(self):
        setup_data(name='', services=(), industries='')
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ALL_THREE)

    def test_each_missing_piece_is_named(self):
        setup_data(name='', services=(), industries='')
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ALL_THREE)
        setup_data(services=(), industries='')                      # a name only
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ['services', 'who'])
        setup_data(industries='')                                    # name + what it sells
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ['who'])
        setup_data(name='')                                          # what it sells + who
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ['company_name'])

    def test_three_saved_things_make_it_ready(self):
        setup_data()
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), [])

    def test_choosing_partner_agencies_counts_as_who_to_find(self):
        setup_data(industries='', mode='agency')
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), [])

    def test_blank_values_do_not_count(self):
        setup_data(name='   ', services=('  ', ''), industries='   ')
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ALL_THREE)

    def test_a_who_list_made_only_of_peers_is_no_who_list(self):
        """A web studio listing "web design agency" is listing itself."""
        setup_data(name='Pixel Studio', services=('web design',), industries='web design agency')
        self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ['who'])

    def test_the_message_says_what_is_missing_and_where_to_add_it(self):
        setup_data(services=(), industries='')
        message = lead_gate.lead_fetch_message(['services', 'who'])
        self.assertIn('what you sell', message)
        self.assertIn('who to find', message)
        self.assertIn('Settings', message)
        self.assertNotIn('company name', message)                   # it has one
        self.assertEqual(lead_gate.lead_fetch_message([]), '')

    def test_nothing_is_guessed_when_deciding(self):
        """Not even by the model: who to find means what was saved."""
        setup_data(name='Thin Co', services=(), industries='')
        with mock.patch('core.business_profile.analyse_buyers') as analyse, \
                mock.patch('core.ai.llm_json') as ask:
            self.assertEqual(lead_gate.missing_lead_data(AppSettings.load()), ['services', 'who'])
        analyse.assert_not_called()
        ask.assert_not_called()


class RunRefusedTests(OwnerTestCase):
    def test_a_run_is_refused_before_anything_starts(self):
        setup_data(name='', services=(), industries='')
        with mock.patch('core.pipeline._run_cycle') as cycle:
            with self.assertRaises(lead_gate.LeadFetchNotReady) as refused:
                run_pipeline('test')
        cycle.assert_not_called()
        self.assertEqual(refused.exception.missing, ALL_THREE)
        self.assertEqual(PipelineRun.objects.count(), 0)

    def test_a_background_run_is_refused_too(self):
        setup_data(name='', services=(), industries='')
        with mock.patch('core.pipeline._run_cycle') as cycle:
            with self.assertRaises(lead_gate.LeadFetchNotReady):
                start_pipeline_async('test')
        cycle.assert_not_called()

    def test_the_refusal_leaves_no_lock_behind(self):
        setup_data(name='', services=(), industries='')
        with self.assertRaises(lead_gate.LeadFetchNotReady):
            run_pipeline('test')
        setup_data()                                    # the owner fills the setup in…
        done = mock.Mock(id=7)
        with mock.patch('core.pipeline._run_cycle', return_value=done):
            self.assertIs(run_pipeline('test'), done)   # …and the very next run works

    def test_with_proper_data_the_run_goes_ahead(self):
        setup_data()
        done = mock.Mock(id=7)
        with mock.patch('core.pipeline._run_cycle', return_value=done) as cycle:
            self.assertIs(run_pipeline('test'), done)
        cycle.assert_called_once_with('test')


class ApiTests(OwnerTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=self.owner).key}')

    def test_the_run_endpoint_refuses_and_says_what_is_missing(self):
        setup_data(services=(), industries='')
        for url in ('/api/pipeline/run/', '/api/pipeline/run/?wait=1'):
            with self.subTest(url=url), mock.patch('core.pipeline._run_cycle') as cycle:
                r = self.client.post(url, {}, format='json')
                cycle.assert_not_called()
            self.assertEqual(r.status_code, 422, r.content)
            self.assertEqual(r.json()['missing'], ['services', 'who'])
            self.assertIn('who to find', r.json()['detail'])
            self.assertIn('what you sell', r.json()['detail'])

    def test_the_run_endpoint_still_starts_a_run_for_a_ready_workspace(self):
        setup_data()
        with mock.patch('core.pipeline._run_cycle', return_value=mock.Mock(id=3)) as cycle, \
                mock.patch('core.views.PipelineRunSerializer',
                           return_value=mock.Mock(data={'id': 3})):      # a Mock is not JSON
            r = self.client.post('/api/pipeline/run/?wait=1', {}, format='json')
        cycle.assert_called_once_with('manual')
        self.assertEqual(r.status_code, 201, r.content)

    def test_status_says_whether_lead_finding_is_allowed(self):
        setup_data(services=(), industries='')
        gate = self.client.get('/api/pipeline/status/').json()['leadFetch']
        self.assertEqual(gate['ready'], False)
        self.assertEqual(gate['missing'], ['services', 'who'])
        self.assertIn('who to find', gate['message'])
        setup_data()
        gate = self.client.get('/api/pipeline/status/').json()['leadFetch']
        self.assertEqual((gate['ready'], gate['missing'], gate['message']), (True, [], ''))

    def test_autopilot_cannot_be_switched_on_without_the_data(self):
        setup_data(services=(), industries='')
        r = self.client.put('/api/settings/', {'runs': {'enabled': True}}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('who to find', r.json()['detail'])
        self.assertFalse(AppSettings.load().runs_enabled)

    def test_autopilot_can_be_switched_on_once_the_data_is_there(self):
        setup_data()
        r = self.client.put('/api/settings/', {'runs': {'enabled': True, 'frequency': 'daily'}},
                            format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(AppSettings.load().runs_enabled)

    def test_turning_autopilot_off_is_always_allowed(self):
        setup_data(services=(), industries='')
        s = AppSettings.load()
        s.runs_enabled = True
        s.save(update_fields=['runs_enabled'])
        r = self.client.put('/api/settings/', {'runs': {'enabled': False}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(AppSettings.load().runs_enabled)

    def test_saving_the_business_details_is_always_allowed(self):
        setup_data(services=(), industries='')
        r = self.client.put('/api/settings/', {'company': {'name': 'Acme Journals',
                                                           'services': ['Journal publishing']}},
                            format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(AppSettings.load().runs_enabled)           # filling in is not "switch on"

    def test_taking_the_data_away_while_autopilot_is_on_switches_it_off(self):
        """Autopilot is on and the owner empties "what you sell": their own
        profile is still saved (never held to ransom by a toggle in another
        section) and autopilot — a way of fetching leads — goes off with it.
        The answer says so."""
        setup_data()
        self.client.put('/api/settings/', {'runs': {'enabled': True}}, format='json')
        self.assertTrue(AppSettings.load().runs_enabled)
        r = self.client.put('/api/settings/', {'company': {'services': []}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['company']['services'], [])
        self.assertFalse(AppSettings.load().runs_enabled)
        self.assertIn('Automatic searching is now off', r.json()['notice'])
        self.assertIn('what you sell', r.json()['notice'])

    def test_no_notice_when_nothing_was_switched_off(self):
        setup_data()
        r = self.client.put('/api/settings/', {'company': {'name': 'Acme Journals'}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn('notice', r.json())
        self.client.put('/api/settings/', {'runs': {'enabled': True}}, format='json')
        r = self.client.put('/api/settings/', {'company': {'name': 'Acme Journals Ltd'}}, format='json')
        self.assertNotIn('notice', r.json())                       # the data is still all there
        self.assertTrue(AppSettings.load().runs_enabled)

    def test_switching_to_a_profile_with_nobody_to_find_switches_autopilot_off(self):
        """A saved search profile rewrites who to find behind the settings
        save — it follows the same rule as a save does."""
        setup_data()
        self.client.put('/api/settings/', {'runs': {'enabled': True}}, format='json')
        empty = SearchProfile.objects.create(name='Nowhere and nobody')
        full = SearchProfile.objects.create(name='Universities', target_industries='university')
        r = self.client.post(f'/api/profiles/{full.pk}/activate/', {}, format='json')
        self.assertNotIn('notice', r.json())
        self.assertTrue(AppSettings.load().runs_enabled)
        r = self.client.post(f'/api/profiles/{empty.pk}/activate/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(AppSettings.load().runs_enabled)
        self.assertFalse(r.json()['settings']['runs']['enabled'])
        self.assertIn('Automatic searching is now off', r.json()['notice'])
        self.assertIn('who to find', r.json()['notice'])


class AutopilotTests(OwnerTestCase):
    def setUp(self):
        super().setUp()
        setup_data(services=(), industries='')
        s = AppSettings.load()
        s.runs_enabled = True            # switched on before the data was removed, or by hand
        s.save(update_fields=['runs_enabled'])

    def tick(self, command_module):
        command = command_module.Command()
        with workspace_context(self.workspace), \
                mock.patch(f'{command_module.__name__}.run_pipeline', return_value=mock.Mock(id=1)) as run:
            if command_module is run_worker:
                command._tick_workspace(self.workspace, {})
            else:
                command._tick_workspace(self.workspace)
        return run

    def test_the_worker_never_runs_a_workspace_without_the_data(self):
        self.tick(run_worker).assert_not_called()

    def test_the_old_loop_command_never_does_either(self):
        self.tick(pipeline_loop).assert_not_called()

    def test_once_the_data_is_there_the_worker_runs_again(self):
        setup_data()
        s = AppSettings.load()
        s.runs_enabled = True
        s.save(update_fields=['runs_enabled'])
        self.tick(run_worker).assert_called_once()

    def test_a_chat_command_that_switches_autopilot_on_is_refused_too(self):
        s = AppSettings.load()
        s.runs_enabled = False            # off; the commands below would switch it on
        s.save(update_fields=['runs_enabled'])
        for command in ('run daily', 'run every hour', 'resume the runs'):
            with self.subTest(command=command):
                reply = handle_command(command, self.owner)
                self.assertIn("can't switch autopilot on", reply)
                self.assertIn('who to find', reply)
                self.assertIn('what you sell', reply)
                self.assertFalse(AppSettings.load().runs_enabled)

    def test_pausing_from_chat_still_works(self):
        self.assertEqual(handle_command('pause the runs', self.owner),
                         'Paused the autonomous runs — trigger cycles manually anytime.')
        self.assertFalse(AppSettings.load().runs_enabled)


class ChatTests(OwnerTestCase):
    def setUp(self):
        super().setUp()
        setup_data(services=(), industries='')

    def test_finding_leads_from_chat_says_what_is_missing(self):
        with mock.patch('core.pipeline._run_cycle') as cycle:
            reply = responder_reply('find me leads', user=self.owner)
        cycle.assert_not_called()
        self.assertEqual(PipelineRun.objects.count(), 0)
        self.assertIn("I can't find leads yet", reply)
        self.assertIn('what you sell', reply)
        self.assertIn('who to find', reply)
        self.assertIn('Settings', reply)

    def test_it_is_not_phrased_as_a_server_error(self):
        reply = responder_reply('run a cycle', user=self.owner)
        self.assertNotIn('failed on the server', reply)

    def test_with_the_data_there_the_command_starts_a_run(self):
        setup_data()
        with mock.patch('core.pipeline.start_pipeline_async', return_value=True) as start:
            responder_reply('find me leads', user=self.owner)
        start.assert_called_once()


class WizardTests(OwnerTestCase):
    """Completing OR SKIPPING the setup wizard used to switch autopilot on
    whatever had been typed - the root of "fetching for none users"."""

    def state(self, **patch):
        from core.onboarding import _save_state
        with workspace_context(self.workspace):
            _save_state(self.owner, **patch)
        return AppSettings.load().runs_enabled

    def test_skipping_setup_does_not_switch_autopilot_on(self):
        setup_data(name='', services=(), industries='')
        self.assertFalse(self.state(done=True, skipped=True))

    def test_finishing_without_the_data_does_not_switch_autopilot_on(self):
        setup_data(name='', services=(), industries='')
        self.assertFalse(self.state(done=True))

    def test_finishing_with_proper_data_switches_autopilot_on(self):
        setup_data()
        self.assertTrue(self.state(done=True))

    def _walk_to_the_end(self, plan):
        """hi → name → services → website → buyers → India → skip, skip, skip."""
        from core.onboarding import onboarding_reply
        from core.tests.test_onboarding import no_website_read
        no_website_read(self)
        with mock.patch('core.onboarding.plan_targeting', return_value=plan) as worked_out:
            for answer in ('hi', 'Acme Journals', 'journal publishing', 'acme.example', 'buyers',
                           'India', 'skip', 'skip', 'skip'):
                reply = onboarding_reply(answer, self.owner)
        return reply, worked_out

    PLAN = {'buyers': ['university', 'research institute'], 'countries': [], 'ideal': 'Readers.',
            'individuals': False, 'services': ['Journal publishing']}

    def test_the_wizard_works_out_who_to_find_from_what_they_sell(self):
        """"buyers → India → skip" used to leave Who to find empty (the pipeline
        then guessed). It is worked out from what the company sells and saved."""
        reply, worked_out = self._walk_to_the_end(self.PLAN)
        worked_out.assert_called_once()
        self.assertEqual(worked_out.call_args.kwargs['about'], 'journal publishing')
        s = AppSettings.load()
        self.assertEqual(s.target_industries, 'university, research institute')
        self.assertTrue(s.runs_enabled)
        self.assertIn('university, research institute', reply)

    def test_when_it_cannot_be_worked_out_the_wizard_says_so_and_stays_paused(self):
        reply, _worked_out = self._walk_to_the_end(None)
        self.assertEqual(AppSettings.load().target_industries, '')
        self.assertFalse(AppSettings.load().runs_enabled)
        self.assertIn("who to find", reply.lower())
        self.assertIn('off', reply.lower())


class AutopilotMigrationTests(TransactionTestCase):
    """What is already stored: a workspace saved with autopilot on but
    without proper data is switched off once, so "autopilot on" always means
    "may find leads". Drives the real migrations, as Django's docs recommend."""

    app = 'core'
    before = '0044_responder_is_the_assistant'
    after = '0045_autopilot_needs_proper_data'

    def _state(self, name):
        call_command('migrate', self.app, name, verbosity=0)
        return MigrationExecutor(connection).loader.project_state([(self.app, name)]).apps

    def test_autopilot_goes_off_exactly_where_the_data_is_missing(self):
        apps = self._state(self.before)
        Workspace = apps.get_model('core', 'Workspace')
        AppSettings = apps.get_model('core', 'AppSettings')
        cases = {                                  # slug -> (name, services, industries, mode)
            'ready': ('Acme Journals', ['Journal publishing'], 'university', 'buyer'),
            'agency-choice': ('Pixel Studio', ['web design'], '', 'agency'),
            'no-who': ('Thin Co', ['Widgets'], '', 'buyer'),
            'only-peers': ('Pixel Studio', ['web design'], 'web design agency', 'buyer'),
            'no-services': ('Name Only', [], 'school', 'buyer'),
            'nothing': ('', [], '', 'buyer'),
        }
        for slug, (name, services, industries, mode) in cases.items():
            ws = Workspace.objects.create(slug=slug, name=slug.title())
            AppSettings.objects.create(workspace=ws, company_name=name, services=services,
                                      target_industries=industries, icp_mode=mode,
                                      runs_enabled=True)

        apps = self._state(self.after)
        AppSettings = apps.get_model('core', 'AppSettings')
        on = {row.workspace.slug for row in AppSettings.objects.filter(runs_enabled=True)}
        self.assertEqual(on, {'ready', 'agency-choice'})
