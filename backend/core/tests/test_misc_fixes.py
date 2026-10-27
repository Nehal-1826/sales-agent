"""Small correctness fixes + fields the new UI relies on."""
from datetime import date
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.chat import _keyword_reply
from core.models import AppSettings, EmailDraft, EmailTemplate, Lead, Potential, SearchProfile, User
from core.pipeline import _draft_email
from core.serializers import EmailDraftSerializer, LeadSerializer

SAAS = 'Shailog — SaaS Builds (high level)'


class MiscTests(TestCase):
    def test_lead_has_iso_discovered_at(self):
        lead = Lead.objects.create(company='Acme')
        self.assertIn('T', LeadSerializer(lead).data['discoveredAt'])

    def test_draft_has_lead_id_and_sent_at(self):
        lead = Lead.objects.create(company='Acme')
        d = EmailDraft.objects.create(lead=lead, company='Acme', to_email='a@acme.com', subject='s', body='b')
        data = EmailDraftSerializer(d).data
        self.assertEqual(data['leadId'], lead.id)
        self.assertIsNone(data['sentAt'])
        d.sent_at = timezone.now()
        d.save()
        self.assertIn('T', EmailDraftSerializer(d).data['sentAt'])
        orphan = EmailDraft.objects.create(company='X', to_email='x@x.com', subject='s', body='b')
        self.assertIsNone(EmailDraftSerializer(orphan).data['leadId'])

    def test_empty_template_subject_gets_company(self):
        EmailTemplate.objects.create(name='t', subject='', body='Hi {{company}}', is_default=True)
        lead = Lead.objects.create(company='Acme', contact_email='a@acme.com')
        with mock.patch('core.pipeline.llm_available', return_value=False):
            subject, _body, _ = _draft_email(lead)
        self.assertEqual(subject, 'Quick idea for Acme')

    def test_daily_report_day_flag(self):
        with mock.patch('core.management.commands.daily_report.send_daily_report',
                        return_value=('console', 's')) as send:
            call_command('daily_report', '--day', '2026-10-01', stdout=StringIO())
        self.assertEqual(send.call_args.args[0], date(2026, 10, 1))

    def test_which_is_not_a_greeting(self):
        self.assertNotIn('Hey!', _keyword_reply('which leads are new'))

    def test_saas_profile_seeded(self):
        self.assertTrue(SearchProfile.objects.filter(name=SAAS).exists())

    def test_potentials_sorted_numerically(self):
        from core.reports import build_daily_report
        Potential.objects.create(company='Big', opportunity='o', value='$100,000')
        Potential.objects.create(company='Small', opportunity='o', value='$9,000')
        _subject, body = build_daily_report()
        self.assertLess(body.index('Big'), body.index('Small'))


class ApiFieldTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='o', password='pass12345', role='owner')
        self.c = APIClient()
        self.c.force_authenticate(self.user)

    def test_outreach_status_has_approved(self):
        EmailDraft.objects.create(company='A', to_email='a@a.com', subject='s', body='b',
                                  status=EmailDraft.Statuses.APPROVED)
        r = self.c.get('/api/outreach/status/')
        self.assertEqual(r.data['approved'], 1)

    def _statuses(self):
        r = self.c.get('/api/agents/')
        self.assertEqual(r.status_code, 200)
        return {a['status'] for a in r.data}

    def test_agents_status_ready_paused_running(self):
        from core.runlock import acquire_run_lock, release_run_lock
        s = AppSettings.load()
        s.runs_enabled = True
        s.save(update_fields=['runs_enabled'])
        self.assertEqual(self._statuses(), {'Ready'})
        self.assertTrue(acquire_run_lock())
        self.assertEqual(self._statuses(), {'Running'})
        release_run_lock()
        s.runs_enabled = False
        s.save(update_fields=['runs_enabled'])
        self.assertEqual(self._statuses(), {'Paused'})


class ReportValueSortTests(TestCase):
    """Potential.value is free text — sorting must read the real amount."""

    def _value(self, text):
        from core.reports import _value_number
        return _value_number(Potential(company='X', opportunity='Y', value=text))

    def test_plain_and_thousands(self):
        self.assertEqual(self._value('$36,000'), 36000)
        self.assertEqual(self._value('4000'), 4000)
        self.assertEqual(self._value(''), 0)
        self.assertEqual(self._value('TBD'), 0)

    def test_suffixes(self):
        self.assertEqual(self._value('$50k'), 50_000)
        self.assertEqual(self._value('$1.2M'), 1_200_000)
        self.assertEqual(self._value('5 lakh'), 500_000)

    def test_range_takes_the_first_number(self):
        # the old digit-concatenating version read this as 500010000 and
        # ranked it above every real deal
        self.assertEqual(self._value('$5,000-$10,000'), 5000)

    def test_biggest_first_in_the_daily_report(self):
        from core.reports import build_daily_report, now_ist
        for value in ('$5,000-$10,000', '$50k', '$9,000'):
            Potential.objects.create(company=f'C{value}', opportunity='o', value=value)
        _subject, text = build_daily_report(now_ist().date())
        order = [text.index(v) for v in ('$50k', '$9,000', '$5,000-$10,000')]
        self.assertEqual(order, sorted(order))

    def test_all_time_report_is_also_biggest_first(self):
        from core.reports import build_daily_report
        Potential.objects.create(company='Older', opportunity='o', value='$90,000')
        Potential.objects.create(company='Newer', opportunity='o', value='$1,000')
        _subject, text = build_daily_report()
        self.assertLess(text.index('Older'), text.index('Newer'))


class TeammateOnboardingTests(TestCase):
    """A teammate must never be sent into a wizard they cannot use."""

    def setUp(self):
        User.objects.create_user(username='owner1', password='pass12345', role='owner')
        self.member = User.objects.create_user(username='mate', password='pass12345', role='member')
        s = AppSettings.load()
        s.company_name = 'Shailog'
        s.save(update_fields=['company_name'])

    def test_member_is_not_redirected_into_setup(self):
        from core.onboarding import onboarding_status
        self.assertFalse(onboarding_status(self.member)['needed'])

    def test_owner_is_still_asked(self):
        from core.onboarding import onboarding_status
        owner = User.objects.get(username='owner1')
        state = onboarding_status(owner)
        self.assertTrue(state['needed'])
        self.assertEqual(state['stepKey'], 'existing')
