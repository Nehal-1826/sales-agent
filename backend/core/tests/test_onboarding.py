"""Chat onboarding (first-login setup wizard) + the switch_profile action.

The wizard is pure heuristics (no AI key needed) — these tests drive a fresh
workspace through every step with plain-text answers, exactly like an
operator would type them.
"""

from unittest import mock

from django.test import TestCase
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


class OnboardingStatusTests(TestCase):
    def test_fresh_workspace_needs_onboarding(self):
        status = onboarding_status(fresh_settings())
        self.assertTrue(status['needed'])
        self.assertEqual(status['stepIndex'], 0)
        self.assertIn('company', status['question'].lower())

    def test_configured_workspace_is_never_hijacked(self):
        s = fresh_settings()
        s.company_name = 'Shailog Technologies'
        s.company_website = 'shailog.com'
        s.services = ['web design']
        s.save()
        status = onboarding_status(s)
        self.assertFalse(status['needed'])
        self.assertTrue(status['done'])


class OnboardingFlowTests(TestCase):
    """Drive the whole wizard with messy, human answers."""

    def setUp(self):
        self.s = fresh_settings()

    def answer(self, text):
        return onboarding_reply(text, self.s)

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

        r = self.answer('skip')
        self.assertIn('template mode', r)

        r = self.answer('skip')
        self.assertIn('set up', r.lower())
        # wizard done — settings live, snapshot profile active
        self.assertTrue(onboarding_status(self.s)['done'])
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
        r = self.answer('AIzaSy1234567890abcdefghijklmnopqrstuvw')
        self.assertEqual(self.s.ai_provider, 'Google AI')
        self.assertTrue(self.s.ai_key.startswith('AIza'))

    def test_email_step_connects_via_shared_helper(self):
        self.answer('Acme')
        self.answer('stuff')
        self.answer('acme.com')
        self.answer('buyers')
        self.answer('India')
        self.answer('skip')
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
        self.answer('skip')
        with mock.patch('core.mailer.verify_smtp', return_value='auth'):
            r = self.answer('hello@acme.com:wrongpass')
        self.assertIn('app password', r.lower())
        self.assertFalse(onboarding_status(self.s)['done'])

    def test_skip_setup_escapes_anytime(self):
        r = self.answer('skip setup, ill do it later')
        self.assertIn('skipped', r.lower())
        self.assertTrue(onboarding_status(self.s)['done'])

    def test_garbage_answer_reasks(self):
        r = self.answer('   ')
        self.assertIn('catch a name', r.lower())
        self.assertEqual(onboarding_status(self.s)['stepIndex'], 0)


class OnboardingChatApiTests(TestCase):
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


class SwitchProfileActionTests(TestCase):
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


class ApproveAllActionTests(TestCase):
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
        with mock.patch('core.actions.send_draft',
                        side_effect=lambda d: setattr(d, 'status', EmailDraft.Statuses.SENT) or d.save(update_fields=['status', 'updated_at']) or d):
            result = execute({'action': 'approve_all'})
        self.assertIn('2 of 2', result)
        self.assertEqual(EmailDraft.objects.filter(status='sent').count(), 2)

    def test_execute_empty_queue(self):
        result = execute({'action': 'approve_all'})
        self.assertIn('Nothing is waiting', result)


class PendingApprovalReplyTests(TestCase):
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


class SetReportEmailActionTests(TestCase):
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


class ManualDraftTests(TestCase):
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
        self.assertIn('already has an active draft', resp2.json()['detail'])

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
        self.assertIn('already has an active draft', execute(spec))

    def test_chat_action_unknown_lead(self):
        from core.actions import execute
        result = execute({'action': 'draft_email', 'company': 'Nonexistent Corp'})
        self.assertIn('No lead matching', result)
