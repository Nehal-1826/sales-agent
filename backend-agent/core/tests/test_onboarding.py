"""Chat onboarding (first-login setup wizard) + the switch_profile action.

The wizard is pure heuristics (no AI key needed) — these tests drive a fresh
workspace through every step with plain-text answers, exactly like an
operator would type them.
"""

from unittest import mock

from core.tests.base import TenantTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.actions import detect_action_regex, execute
from core.models import AppSettings, Lead, SearchProfile, User
from core.onboarding import onboarding_reply, onboarding_status


def fresh_settings():
    """A workspace that has never been configured."""
    s = AppSettings.load()
    s.company_name = ''
    s.company_website = ''
    s.company_description = ''
    s.services = []
    s.target_countries = ''
    s.target_industries = ''
    s.target_cities = ''
    s.icp_mode = 'buyer'
    s.ai_key = ''
    s.onboarding = {}
    s.save()
    return s


class OnboardingStatusTests(TenantTestCase):
    def test_new_user_needs_onboarding(self):
        u = User.objects.create_user(username='newop', password='pass12345')
        status = onboarding_status(u, fresh_settings())
        self.assertTrue(status['needed'])
        self.assertEqual(status['stepIndex'], 0)
        self.assertEqual(status['stepKey'], 'company')
        self.assertIn('company', status['question'].lower())

    def test_new_user_on_configured_workspace_still_onboards(self):
        """Per-user state: every NEW client gets the wizard, even on a
        workspace another client already configured."""
        s = fresh_settings()
        s.company_name = 'Shailog Technologies'
        s.company_website = 'shailog.com'
        s.services = ['web design']
        s.save()
        u = User.objects.create_user(username='client2', password='pass12345')
        status = onboarding_status(u, s)
        self.assertTrue(status['needed'])

    def test_backfilled_legacy_user_is_never_hijacked(self):
        s = fresh_settings()
        u = User.objects.create_user(username='legacy', password='pass12345')
        u.onboarding = {'done': True, 'backfilled': True}  # what migration 0017 sets
        u.save(update_fields=['onboarding'])
        status = onboarding_status(u, s)
        self.assertFalse(status['needed'])


def no_website_read(testcase):
    """These flows type every answer by hand: a bare domain at the website
    step must take the 'saved, but the page can't be read' path — never the
    network or the model."""
    from core.company_scrape import BadUrl
    patcher = mock.patch('core.onboarding.profile_from_domain',
                         side_effect=BadUrl('That website answered HTTP 404.'))
    patcher.start()
    testcase.addCleanup(patcher.stop)


class OnboardingFlowTests(TenantTestCase):
    """Drive the whole wizard with messy, human answers."""

    def setUp(self):
        self.s = fresh_settings()
        self.u = User.objects.create_user(username='op', password='pass12345')
        no_website_read(self)

    def answer(self, text):
        return onboarding_reply(text, self.u, self.s)

    def test_full_happy_path_buyer(self):
        r = self.answer('My company is Brew & Byte Studios')
        self.assertIn('what do you sell', r.lower())
        self.assertEqual(self.s.company_name, 'Brew & Byte Studios')

        r = self.answer('web design, SEO and branding')
        self.assertEqual(self.s.services, ['web design', 'SEO', 'branding'])
        self.assertIn('website', r.lower())

        r = self.answer('check us at www.brewbyte.in')
        self.assertEqual(self.s.company_website, 'brewbyte.in')

        r = self.answer('cafes and local shops mostly')
        self.assertEqual(self.s.icp_mode, 'buyer')
        self.assertIn('countries', r.lower())

        r = self.answer('India and UAE')
        self.assertEqual(self.s.target_countries, 'India, UAE')

        r = self.answer('skip')  # ICP step
        self.assertIn('default targeting', r)

        r = self.answer('skip')
        self.assertIn('template mode', r)

        r = self.answer('skip')  # email step
        self.assertIn('set up', r.lower())
        # wizard done — settings live, snapshot profile active
        self.assertTrue(onboarding_status(self.u, self.s)['done'])
        profile = SearchProfile.objects.get(name='Setup — chat wizard')
        self.assertTrue(profile.is_active)
        self.assertEqual(profile.icp_mode, 'buyer')
        self.assertEqual(profile.target_countries, 'India, UAE')

    def test_agency_mode_detected_and_worldwide(self):
        self.answer('Acme Software')
        self.answer('custom software, mobile apps')
        self.answer('acme.dev')
        r = self.answer('we want partnerships with other agencies')
        self.assertEqual(self.s.icp_mode, 'agency')
        r = self.answer('worldwide please')
        self.assertEqual(self.s.target_countries, '')

    def test_country_aliases(self):
        self.answer('Acme')
        self.answer('stuff')
        self.answer('acme.com')
        self.answer('buyers')
        self.answer('US, UK, Germany')
        self.assertEqual(self.s.target_countries, 'United States, United Kingdom, Germany')

    def test_ai_key_saved_with_provider_guess(self):
        self.answer('Acme')
        self.answer('stuff')
        self.answer('acme.com')
        self.answer('buyers')
        self.answer('India')
        self.answer('skip')  # ICP step
        r = self.answer('AIzaSy1234567890abcdefghijklmnopqrstuvw')
        self.assertEqual(self.s.ai_provider, 'Gemini')
        self.assertTrue(self.s.ai_key.startswith('AIza'))

    def _to_ai_key_step(self):
        for a in ('Acme', 'stuff', 'acme.com', 'buyers', 'India', 'skip'):
            self.answer(a)

    def test_unknown_key_shape_is_not_guessed_as_zhipu(self):
        self._to_ai_key_step()
        self.s.ai_provider = 'Gemini'
        self.s.save(update_fields=['ai_provider', 'updated_at'])
        r = self.answer('mistralkeyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
        self.s.refresh_from_db()
        self.assertEqual(self.s.ai_provider, 'Gemini')  # unchanged, not Zhipu
        self.assertTrue(self.s.ai_key)
        for name in ('Gemini', 'OpenAI', 'Zhipu (GLM)', 'DeepSeek', 'Groq', 'Mistral', 'Ollama'):
            self.assertIn(name, r)
        # still on the key step; naming the provider completes it
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'ai_key')
        self.answer('mistral')
        self.s.refresh_from_db()
        self.assertEqual(self.s.ai_provider, 'Mistral')
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'email')

    def test_unknown_key_then_skip_moves_on(self):
        self._to_ai_key_step()
        self.answer('mistralkeyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
        self.answer('skip')
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'email')

    def test_anthropic_key_is_refused_plainly(self):
        self._to_ai_key_step()
        r = self.answer('sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789')
        self.s.refresh_from_db()
        self.assertIn('Anthropic', r)
        self.assertIn('not supported', r)
        self.assertNotEqual(self.s.ai_provider, 'Zhipu (GLM)')
        self.assertFalse((self.s.ai_key or '').startswith('sk-ant-'))

    def test_key_embedded_in_sentence_is_extracted(self):
        self._to_ai_key_step()
        self.answer('my key is AIzaSy1234567890abcdefghijklmnopqrstuvw thanks')
        self.s.refresh_from_db()
        self.assertEqual(self.s.ai_key, 'AIzaSy1234567890abcdefghijklmnopqrstuvw')
        self.assertEqual(self.s.ai_provider, 'Gemini')

    def test_email_step_connects_via_shared_helper(self):
        self.answer('Acme')
        self.answer('stuff')
        self.answer('acme.com')
        self.answer('buyers')
        self.answer('India')
        self.answer('skip')  # ICP step
        self.answer('skip')  # AI key step
        with mock.patch('core.mailer.verify_smtp', return_value=''):
            r = self.answer('hello@acme.com:apppass123')
        self.assertIn('set up', r.lower())
        self.s.refresh_from_db()  # connect_mailbox saves its own settings row
        self.assertEqual(self.s.smtp_user, 'hello@acme.com')
        self.assertEqual(self.s.from_email, 'hello@acme.com')

    def test_email_step_failure_retries(self):
        self.answer('Acme')
        self.answer('stuff')
        self.answer('acme.com')
        self.answer('buyers')
        self.answer('India')
        self.answer('skip')  # ICP step
        self.answer('skip')  # AI key step
        with mock.patch('core.mailer.verify_smtp', return_value='auth'):
            r = self.answer('hello@acme.com:wrongpass')
        self.assertIn('app password', r.lower())
        self.assertFalse(onboarding_status(self.u, self.s)['done'])

    def test_skip_setup_escapes_anytime(self):
        r = self.answer('skip setup, ill do it later')
        self.assertIn('skipped', r.lower())
        self.assertTrue(onboarding_status(self.u, self.s)['done'])

    def test_garbage_answer_reasks(self):
        r = self.answer('   ')
        self.assertIn('catch a name', r.lower())
        self.assertEqual(onboarding_status(self.u, self.s)['stepIndex'], 0)


class OnboardingChatApiTests(TenantTestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_chat_routes_through_wizard_when_active(self):
        fresh_settings()
        resp = self.client.post('/api/chat/', {'text': 'My company is Acme'}, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn('onboarding', body)
        self.assertTrue(body['onboarding']['needed'])
        self.assertEqual(body['onboarding']['stepIndex'], 1)  # advanced
        self.assertEqual(AppSettings.load().company_name, 'Acme')

    def test_chat_get_returns_onboarding_state(self):
        fresh_settings()
        resp = self.client.get('/api/chat/')
        self.assertTrue(resp.json()['onboarding']['needed'])

    def test_onboarding_endpoint(self):
        fresh_settings()
        resp = self.client.get('/api/onboarding/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['needed'])


class TourFlagApiTests(TenantTestCase):
    """First-login UI tour flag — PATCH /api/onboarding/ {'tourDone': bool}."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='tourist', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_fresh_user_tour_not_done(self):
        resp = self.client.get('/api/onboarding/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()['tourDone'])

    def test_patch_marks_tour_done_once(self):
        resp = self.client.patch('/api/onboarding/', {'tourDone': True}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['tourDone'])
        # persists for THIS user across requests — the tour never re-opens
        self.assertTrue(self.client.get('/api/onboarding/').json()['tourDone'])
        self.user.refresh_from_db()
        self.assertTrue(self.user.onboarding['tour_done'])

    def test_patch_survives_wizard_writes(self):
        """The chat wizard rewrites User.onboarding with its own keys — the
        separate tour_done key must survive those saves."""
        from core.onboarding import _save_state
        self.client.patch('/api/onboarding/', {'tourDone': True}, format='json')
        self.user.refresh_from_db()   # the API wrote via its own user instance
        _save_state(self.user, done=True)
        self.user.refresh_from_db()
        self.assertTrue(self.user.onboarding.get('tour_done'))
        self.assertTrue(self.client.get('/api/onboarding/').json()['tourDone'])

    def test_patch_can_reset_tour(self):
        self.client.patch('/api/onboarding/', {'tourDone': True}, format='json')
        resp = self.client.patch('/api/onboarding/', {'tourDone': False}, format='json')
        self.assertFalse(resp.json()['tourDone'])


class SwitchProfileActionTests(TenantTestCase):
    workspace_slug = 'shailog'  # relies on rows the data migrations seeded
    def test_regex_detects_switch(self):
        spec = detect_action_regex('switch to the backup profile')
        self.assertEqual(spec['action'], 'switch_profile')

    def test_execute_switches_live_targeting(self):
        s = AppSettings.load()
        s.icp_mode = 'agency'
        s.target_countries = 'United States'
        s.save()
        backup = SearchProfile.objects.get(name='Backup — Buyer Targeting')
        backup.target_countries = 'India'
        backup.save()
        result = execute({'action': 'switch_profile', 'profile': 'backup'})
        self.assertIn('Switched', result)
        s.refresh_from_db()
        self.assertEqual(s.icp_mode, 'buyer')
        self.assertEqual(s.target_countries, 'India')
        self.assertTrue(SearchProfile.objects.get(pk=backup.pk).is_active)

    def test_execute_asks_when_ambiguous(self):
        result = execute({'action': 'switch_profile', 'profile': ''})
        self.assertIn('Which profile', result)

    def test_chat_phrases_resolve_profiles(self):
        # natural chat language, not exact names
        self.answer_switch = None
        from core.actions import detect_action_regex, match_profile
        from core.models import SearchProfile
        profiles = list(SearchProfile.objects.all())
        self.assertEqual(match_profile('the backup one', profiles).name,
                         'Backup — Buyer Targeting')
        self.assertEqual(match_profile('shailog please', profiles).name,
                         'Shailog Tech — Agency Partners')
        spec = detect_action_regex('switch to the backup profile')
        self.assertEqual(spec['action'], 'switch_profile')
        result = execute(spec)
        self.assertIn('Switched to "Backup', result)


class ApproveAllActionTests(TenantTestCase):
    """Chat bulk approval — 'approve all drafts' sends the whole queue."""

    def _draft(self, company, to):
        from core.models import EmailDraft, Lead
        lead = Lead.objects.create(company=company, website=f'{company.lower()}.com', score=80)
        return EmailDraft.objects.create(
            lead=lead, company=company, to_email=to, subject='Hi', body='Body',
            status=EmailDraft.Statuses.DRAFT)

    def test_regex_detects_approve_all(self):
        from core.actions import detect_action_regex
        for msg in ('approve all drafts', 'approve everything', 'send all the emails'):
            self.assertEqual(detect_action_regex(msg)['action'], 'approve_all', msg)

    def test_execute_approves_and_sends_all(self):
        from core.models import EmailDraft
        self._draft('Acme', 'hi@acme.com')
        self._draft('Beta', 'hi@beta.com')
        with mock.patch('core.outbox.send_draft') as send:
            result = execute({'action': 'approve_all'})
        send.assert_not_called()  # approve queues; the outbox drain sends
        self.assertIn('2 of 2', result)
        self.assertEqual(EmailDraft.objects.filter(status='queued').count(), 2)

    def test_execute_empty_queue(self):
        result = execute({'action': 'approve_all'})
        self.assertIn('Nothing is waiting', result)


class PendingApprovalReplyTests(TenantTestCase):
    """'What needs my approval?' gets a concrete answer, keyless mode too."""

    def test_keyword_reply_lists_pending(self):
        from core.chat import _keyword_reply
        from core.models import EmailDraft, Lead
        lead = Lead.objects.create(company='Acme', website='acme.com', score=80)
        EmailDraft.objects.create(lead=lead, company='Acme', to_email='hi@acme.com',
                                  subject='Hi', body='Body', status=EmailDraft.Statuses.DRAFT)
        reply = _keyword_reply('what needs my approval?')
        self.assertIn('Acme', reply)
        self.assertIn('approve all drafts', reply)

    def test_keyword_reply_empty_queue(self):
        from core.chat import _keyword_reply
        reply = _keyword_reply('what is pending?')
        self.assertIn('empty', reply)


class SetReportEmailActionTests(TenantTestCase):
    """The exact flow from the field: tell the recipient in chat, then send."""

    def test_regex_detects_recipient_statement(self):
        from core.actions import detect_action_regex
        for msg in ('the daily report recipient is cto@shailog.com',
                    'send reports to cto@shailog.com',
                    'report email: cto@shailog.com'):
            spec = detect_action_regex(msg)
            self.assertEqual(spec['action'], 'set_report_email', msg)
            self.assertEqual(spec['email'], 'cto@shailog.com')

    def test_execute_saves_recipient(self):
        from core.models import AppSettings
        result = execute({'action': 'set_report_email', 'email': 'cto@shailog.com'})
        self.assertIn('cto@shailog.com', result)
        self.assertEqual(AppSettings.load().report_email, 'cto@shailog.com')

    def test_execute_rejects_bad_email(self):
        result = execute({'action': 'set_report_email', 'email': 'not-an-email'})
        self.assertIn("doesn't look like", result)

    def test_report_sends_after_recipient_set(self):
        """The bug from the field: set recipient via chat → send_report works."""
        from core.actions import detect_action_regex
        from core.models import AppSettings
        s = AppSettings.load()
        s.report_email = ''
        s.save(update_fields=['report_email'])
        def fake_send():
            from core.models import AppSettings
            if not AppSettings.load().report_email:
                return ('skipped', '')
            return ('smtp', 'Daily report')

        with mock.patch('core.actions.send_daily_report', side_effect=fake_send) as send:
            before = execute({'action': 'send_report'})
            self.assertIn('No report recipient', before)
            execute({'action': 'set_report_email', 'email': 'cto@shailog.com'})
            after = execute({'action': 'send_report'})
            self.assertIn('Emailed', after)
            self.assertEqual(send.call_count, 2)

    def test_send_report_phrase_without_email_not_captured(self):
        from core.actions import detect_action_regex
        # no email in text → must stay the plain send_report action
        spec = detect_action_regex('send the daily report')
        self.assertEqual(spec['action'], 'send_report')


class ManualDraftTests(TenantTestCase):
    """On-demand outreach drafts for ANY lead — qualified or not."""

    def setUp(self):
        from core.models import Lead
        self.low_lead = Lead.objects.create(
            company='LoW_score Cafe', industry='cafe', website='lowscore.example',
            score=32, profiled=True, has_website=True,
            contact_email='hi@lowscore.example',
            findings=[{'area': 'SEO', 'issue': 'No meta description.',
                       'recommendation': 'Add one.', 'severity': 'medium'}])

    def test_endpoint_drafts_for_unqualified_lead(self):
        from core.models import EmailDraft, Potential
        from rest_framework.authtoken.models import Token
        from rest_framework.test import APIClient
        from core.models import User
        u = User.objects.create_user(username='t2', password='pass12345')
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=u).key}')

        self.assertEqual(Potential.objects.count(), 0)  # unqualified: no flag
        resp = c.post(f'/api/leads/{self.low_lead.pk}/draft_email/')
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertTrue(body['ok'])
        self.assertEqual(body['draft']['company'], 'LoW_score Cafe')
        self.assertNotEqual(body['draft']['subject'], '')  # template fallback works
        self.assertEqual(EmailDraft.objects.filter(lead=self.low_lead).count(), 1)

        # duplicate guard
        resp2 = c.post(f'/api/leads/{self.low_lead.pk}/draft_email/')
        self.assertEqual(resp2.status_code, 200)
        self.assertFalse(resp2.json()['ok'])
        self.assertIn('already has an email waiting for approval', resp2.json()['detail'])

        # unknown lead
        self.assertEqual(c.post('/api/leads/99999/draft_email/').status_code, 404)

    def test_chat_action_creates_manual_draft(self):
        from core.actions import detect_action_regex, execute
        from core.models import EmailDraft
        spec = detect_action_regex('send a mail to LoW_score Cafe')
        self.assertEqual(spec['action'], 'draft_email')
        result = execute(spec)
        self.assertIn('Drafted an email', result)
        self.assertIn('approve the draft for LoW_score Cafe', result)
        self.assertEqual(EmailDraft.objects.filter(lead=self.low_lead).count(), 1)
        # second attempt reports the duplicate instead of double-drafting
        self.assertIn('already has an email waiting for approval', execute(spec))

    def test_chat_action_unknown_lead(self):
        from core.actions import execute
        result = execute({'action': 'draft_email', 'company': 'Nonexistent Corp'})
        self.assertIn('No lead matching', result)


class IcpStepTests(TenantTestCase):
    """The ICP step: typed or uploaded ideal-client description."""

    def setUp(self):
        self.s = fresh_settings()
        self.s.target_countries = 'United States'
        self.s.save()
        self.u = User.objects.create_user(username='op', password='pass12345')
        no_website_read(self)

    def test_icp_stored_and_llm_extraction_merged(self):
        self.s.target_industries = ''
        self.s.save()
        for q, a in [('Acme', 'Acme'), ('x', 'stuff'), ('acme.com', 'acme.com'),
                     ('buyers', 'buyers'), ('India', 'India')]:
            onboarding_reply(a, self.u, self.s)
        with mock.patch('core.ai.llm_available', return_value=True), \
                mock.patch('core.ai.llm_complete',
                           return_value='{"industries":["e-commerce brand","D2C store"],'
                                        '"countries":["United States","Singapore"]}'):
            r = onboarding_reply(
                'E-commerce brands doing 100k+/mo revenue, ideally US and Singapore, '
                'hiring CS agents', self.u, self.s)
        self.s.refresh_from_db()
        self.assertIn('E-commerce brands doing 100k+', self.s.icp_notes)  # raw stored
        self.assertIn('e-commerce brand', self.s.target_industries)
        self.assertIn('D2C store', self.s.target_industries)
        self.assertIn('Singapore', self.s.target_countries)   # merged, not overwritten
        self.assertIn('India', self.s.target_countries)
        self.assertIn('ideal client', r.lower())

    def test_icp_falls_back_to_raw_notes_without_llm(self):
        onboarding_reply('Acme', self.u, self.s)
        onboarding_reply('stuff', self.u, self.s)
        onboarding_reply('acme.com', self.u, self.s)
        onboarding_reply('buyers', self.u, self.s)
        onboarding_reply('India', self.u, self.s)
        with mock.patch('core.ai.llm_available', return_value=False):
            onboarding_reply('B2B SaaS companies with 10-50 employees',
                             self.u, self.s)
        self.s.refresh_from_db()
        self.assertIn('B2B SaaS', self.s.icp_notes)  # raw notes still steer prompts

    def test_icp_skip_moves_on(self):
        for a in ('Acme', 'stuff', 'acme.com', 'buyers', 'India'):
            onboarding_reply(a, self.u, self.s)
        r = onboarding_reply('skip', self.u, self.s)
        self.assertIn('default targeting', r)
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'ai_key')

    def test_step_order_includes_icp(self):
        from core.onboarding import STEP_KEYS
        self.assertEqual(STEP_KEYS,
                         ['company', 'services', 'website', 'target', 'countries',
                          'icp', 'ai_key', 'email'])


class RunsGateTests(TenantTestCase):
    """New workspaces are born PAUSED; completing (or skipping) the setup
    wizard is what turns the autopilot on — nothing scrapes leads before
    the owner has configured the workspace."""

    def setUp(self):
        from billing.tests.test_entitlements import make_ws
        self.u = User.objects.create_user(username='gate-owner', password='pw123456',
                                          role='owner', workspace=make_ws('gate-co'))

    def test_new_workspace_runs_paused(self):
        from core.tenancy import workspace_context
        with workspace_context(self.u.workspace):
            self.assertFalse(AppSettings.load().runs_enabled)

    def test_onboarding_done_enables_runs(self):
        from core.onboarding import _save_state
        from core.tenancy import workspace_context
        with workspace_context(self.u.workspace):
            _save_state(self.u, done=True)
            self.assertTrue(AppSettings.load().runs_enabled)

    def test_partial_setup_keeps_runs_paused(self):
        from core.onboarding import _save_state
        from core.tenancy import workspace_context
        with workspace_context(self.u.workspace):
            _save_state(self.u, started=True, step='company')   # mid-wizard
            self.assertFalse(AppSettings.load().runs_enabled)


class GenericTemplateTests(TenantTestCase):
    """Every new workspace gets the GENERIC default email template —
    placeholders only, filled from the workspace's OWN settings. No tenant
    (not even the operator) has its copy baked into another's drafts."""

    def test_provision_seeds_generic_default_template(self):
        from core.workspaces import provision_workspace, GENERIC_EMAIL_TEMPLATE
        from core.models import EmailTemplate
        from billing.tests.test_entitlements import make_ws
        from core.tenancy import workspace_context

        ws = make_ws('generic-co')
        provision_workspace(ws)
        with workspace_context(ws):
            t = EmailTemplate.objects.filter(is_default=True).first()
            self.assertIsNotNone(t)
            self.assertEqual(t.subject, GENERIC_EMAIL_TEMPLATE['subject'])
            # pure placeholders — no tenant name/brand anywhere in it
            for brand in ('Shailog', 'julex', 'ijrnexus', 'WarmPulse'):
                self.assertNotIn(brand, t.subject + t.body)

    def test_draft_uses_workspace_own_data_not_other_tenants(self):
        """A workspace with NO company name set drafts with neutral sender
        identity — never the operator's Shailog persona."""
        from core.tenancy import workspace_context
        from core.models import Lead, AppSettings
        from core.pipeline import _draft_email
        from billing.tests.test_entitlements import make_ws

        ws = make_ws('plain-co')
        with workspace_context(ws):
            s = AppSettings.load()
            s.company_name = ''            # nothing configured
            s.shipped_work = ''
            s.ai_key = ''                  # keyless → template path
            s.save()
            lead = Lead.objects.create(company='DentalCo', website='dentalco.com',
                                       industry='dental clinics', has_website=True,
                                       description='Family dental clinic.',
                                       findings=[{'area': 'Website', 'issue': 'No online booking.',
                                                  'recommendation': 'Add booking.', 'severity': 'medium'}])
            subject, body, used_llm = _draft_email(lead)
            self.assertFalse(used_llm)
            self.assertIn('DentalCo', subject + body)          # the LEAD is the topic
            self.assertNotIn('Shailog', body)                 # never another tenant
            self.assertNotIn('julex', body)
            # the SaaS-pitch fallback is the OPERATOR's vertical — with nothing
            # configured the draft must pitch NOTHING specific instead
            self.assertNotIn('custom SaaS platforms, marketplaces', body)


class DomainAutofillTests(TenantTestCase):
    """The owner pastes their DOMAIN — the AI reads the site and fills BOTH
    setup cards: the business (name, website, what you sell, address) and
    who to find (kinds of buyers, country). The model call itself lives in
    core.business_profile (tested there); these tests pin the wizard."""

    PROFILE = {
        'domain': 'zylker.com', 'name': 'Zylker',
        'description': 'CRM software for small teams.', 'address': '495 Chuves St',
        'services': ['CRM platform', 'Sales automation'],
        'customer_type': 'organisations',
        'target_industries': ['small business', 'startup'],
        'target_countries': [], 'target_cities': [], 'icp_notes': 'Small sales teams.',
        'inferred': True,
    }

    def setUp(self):
        self.s = fresh_settings()
        self.u = User.objects.create_user(username='af-owner', password='pass12345')

    def _paste(self, domain='zylker.com', profile=None, ai_available=True):
        profile = dict(self.PROFILE, **(profile or {}))
        with mock.patch('core.onboarding.profile_from_domain', return_value=profile) as pfd, \
            mock.patch('core.onboarding.llm_available', return_value=ai_available):
            onboarding_reply('hi', self.u)            # starts the wizard at step 0
            reply = onboarding_reply(domain, self.u)
        pfd.assert_called_once_with(domain)
        self.s.refresh_from_db()
        return reply

    def test_fills_the_business_card(self):
        self._paste()
        self.assertEqual(self.s.company_name, 'Zylker')
        self.assertEqual(self.s.company_website, 'zylker.com')
        self.assertEqual(self.s.company_description, 'CRM software for small teams.')
        self.assertEqual(self.s.company_address, '495 Chuves St')
        self.assertEqual(self.s.services, ['CRM platform', 'Sales automation'])

    def test_fills_the_who_to_find_card(self):
        self._paste()
        self.assertEqual(self.s.target_industries, 'small business, startup')
        self.assertEqual(self.s.icp_notes, 'Small sales teams.')
        self.assertEqual(self.s.target_countries, '')      # .com → worldwide

    def test_reply_lists_what_was_filled_for_both_cards(self):
        reply = self._paste()
        self.assertIn('what you sell: CRM platform, Sales automation', reply)
        self.assertIn("who I'll look for: small business, startup", reply)
        self.assertIn('worldwide', reply)

    def test_country_tld_sets_the_search_country(self):
        self._paste(domain='zylker.in', profile={'domain': 'zylker.in',
                                                 'target_countries': ['India']})
        self.assertEqual(self.s.target_countries, 'India')

    def test_only_the_mailbox_question_is_left(self):
        reply = self._paste(ai_available=True)
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'email')
        self.assertIn('mailbox', reply.lower())

    def test_an_ai_key_is_asked_for_only_without_a_local_model(self):
        self._paste(ai_available=False)
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'ai_key')

    def test_individual_customers_get_no_invented_company_leads(self):
        reply = self._paste(profile={'customer_type': 'individuals',
                                     'target_industries': [], 'icp_notes': ''})
        self.assertEqual(self.s.target_industries, '')
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'target')
        self.assertIn('individual people', reply)

    def test_site_read_but_no_buyers_worked_out_still_asks(self):
        """Page facts only (model down, or nothing it can pin down): the
        business card is filled, 'who to find' is still asked — never guessed."""
        reply = self._paste(profile={'inferred': False, 'customer_type': '',
                                     'target_industries': [], 'icp_notes': ''})
        self.assertEqual(self.s.company_name, 'Zylker')
        self.assertEqual(self.s.services, ['CRM platform', 'Sales automation'])
        self.assertEqual(self.s.target_industries, '')
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'target')
        self.assertIn("couldn't work out who buys", reply)

    def test_unreadable_site_at_the_website_step_still_saves_it(self):
        """Asked only "what's your website?": the answer stands even when the
        page is down — the wizard just continues the normal way."""
        from core.company_scrape import BadUrl
        with mock.patch('core.onboarding.profile_from_domain',
                        side_effect=BadUrl('That website answered HTTP 404.')):
            onboarding_reply('Acme Corp', self.u)
            onboarding_reply('gadgets', self.u)
            reply = onboarding_reply('zylker.com', self.u)
        self.s.refresh_from_db()
        self.assertEqual(self.s.company_website, 'zylker.com')
        self.assertEqual(self.s.company_name, 'Acme Corp')
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'target')
        self.assertIn("I saved zylker.com", reply)
        self.assertIn("couldn't read the page", reply)

    def test_unreadable_site_is_reported_and_nothing_is_guessed(self):
        from core.company_scrape import BadUrl
        with mock.patch('core.onboarding.profile_from_domain',
                        side_effect=BadUrl('That website answered HTTP 403.')), \
                            mock.patch('core.onboarding.llm_available', return_value=True):
            onboarding_reply('hi', self.u)
            reply = onboarding_reply('dead-site.com', self.u)
        self.s.refresh_from_db()
        self.assertEqual((self.s.company_name, self.s.company_website, self.s.services),
                         ('', '', []))
        self.assertIn("couldn't read dead-site.com", reply)
        self.assertIn('HTTP 403', reply)
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'company')

    def test_typed_answers_are_not_overwritten_by_the_site(self):
        with mock.patch('core.onboarding.profile_from_domain',
                        return_value=dict(self.PROFILE)), \
                            mock.patch('core.onboarding.llm_available', return_value=True):
            onboarding_reply('Acme Corp', self.u)       # typed by hand at step 0
            onboarding_reply('gadgets, gizmos', self.u)  # typed by hand at step 1
            onboarding_reply('zylker.com', self.u)       # domain pasted at step 2
        self.s.refresh_from_db()
        self.assertEqual(self.s.company_name, 'Acme Corp')
        self.assertEqual(self.s.services, ['gadgets', 'gizmos'])
        self.assertEqual(self.s.company_website, 'zylker.com')
        self.assertEqual(self.s.target_industries, 'small business, startup')

    def test_a_plain_company_name_still_takes_the_normal_path(self):
        with mock.patch('core.onboarding.profile_from_domain') as pfd:
            onboarding_reply('hi', self.u)
            onboarding_reply('Acme Corp', self.u)
        pfd.assert_not_called()
        self.s.refresh_from_db()
        self.assertEqual(self.s.company_name, 'Acme Corp')
        self.assertEqual(onboarding_status(self.u, self.s)['stepKey'], 'services')
