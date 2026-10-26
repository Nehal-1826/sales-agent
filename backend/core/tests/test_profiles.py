"""Search profiles (one-click targeting switch) + agency-partner ICP mode.

Proves the behaviours this change shipped:
  1. migrations seed two switchable presets — the Shailog Tech agency
     profile ACTIVE (live settings already flipped) and the previous job
     kept as a buyer-mode backup,
  2. activate() writes the profile through to AppSettings — the pipeline
     reads settings as before, so the switch needs no restart — and only
     one profile is ever active,
  3. agency mode lets agency search terms through and stops rejecting
     peer-shaped leads (our own company is still never a lead),
  4. buyer mode keeps dropping peer terms exactly as before.
"""

from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import icp
from core.models import AppSettings, EmailTemplate, Lead, SearchProfile, User
from core.pipeline import _draft_email


class Settings:
    """Minimal AppSettings stand-in (icp only reads attributes)."""

    def __init__(self, **kw):
        self.company_name = kw.get('company_name', 'Shailog Technologies')
        self.company_website = kw.get('company_website', 'shailog.example')
        self.company_description = kw.get('company_description', '')
        self.services = kw.get('services', ['web design', 'SaaS development'])
        self.target_industries = kw.get('target_industries', '')
        self.icp_mode = kw.get('icp_mode', 'buyer')


def lead(company='', industry='', website='', description='', snippet=''):
    return {'company': company, 'industry': industry, 'website': website,
            'description': description, 'analysis': {'serp_snippet': snippet}}


class SeededProfileTests(TestCase):
    """Migration 0015 seeds — present on every fresh database."""

    def test_two_profiles_seeded(self):
        names = set(SearchProfile.objects.values_list('name', flat=True))
        self.assertIn('Shailog Tech — Agency Partners', names)
        self.assertIn('Backup — Buyer Targeting', names)

    def test_shailog_profile_is_active_and_flipped_live_settings(self):
        profile = SearchProfile.objects.get(name='Shailog Tech — Agency Partners')
        self.assertTrue(profile.is_active)
        self.assertEqual(profile.icp_mode, 'agency')
        s = AppSettings.load()
        self.assertEqual(s.icp_mode, 'agency')
        self.assertEqual(s.target_countries, 'United States, United Kingdom, Germany')
        self.assertIn('boutique digital agency', s.target_industries)

    def test_backup_kept_inactive_in_buyer_mode(self):
        backup = SearchProfile.objects.get(name='Backup — Buyer Targeting')
        self.assertFalse(backup.is_active)
        self.assertEqual(backup.icp_mode, 'buyer')


class ProfileSwitchTests(TestCase):
    """One-click switch — write-through to the live settings."""

    def test_activate_rewrites_settings_and_single_active(self):
        backup = SearchProfile.objects.get(name='Backup — Buyer Targeting')
        backup.target_countries = 'India'
        backup.target_industries = 'dental clinic'
        backup.save()

        shailog = SearchProfile.objects.get(name='Shailog Tech — Agency Partners')
        shailog.apply()

        s = AppSettings.load()
        self.assertEqual(s.icp_mode, 'agency')
        self.assertEqual(s.target_countries, 'United States, United Kingdom, Germany')
        self.assertEqual(list(SearchProfile.objects.filter(is_active=True)),
                         [shailog])

        backup.refresh_from_db()
        backup.apply()  # switch back — the backup restores the old job
        s = AppSettings.load()
        self.assertEqual(s.icp_mode, 'buyer')
        self.assertEqual(s.target_countries, 'India')
        self.assertEqual(s.target_industries, 'dental clinic')
        self.assertTrue(SearchProfile.objects.get(pk=backup.pk).is_active)
        self.assertFalse(SearchProfile.objects.get(pk=shailog.pk).is_active)

    def test_snapshot_captures_current_targeting(self):
        s = AppSettings.load()
        s.target_countries = 'UAE'
        s.target_industries = 'boutique hotel'
        s.icp_mode = 'buyer'
        s.save()
        profile = SearchProfile.snapshot('My Backup', 'saved from current job')
        self.assertEqual(profile.target_countries, 'UAE')
        self.assertEqual(profile.target_industries, 'boutique hotel')
        self.assertEqual(profile.icp_mode, 'buyer')


class AgencyModeIcpTests(TestCase):
    """Agency mode flips every competitor guard."""

    def test_agency_terms_survive_industry_override(self):
        s = Settings(icp_mode='agency',
                     target_industries='boutique digital agency, web design agency')
        self.assertEqual(icp.buyer_industries(s),
                         ['boutique digital agency', 'web design agency'])

    def test_agency_mode_default_industry_list(self):
        industries = icp.buyer_industries(Settings(icp_mode='agency'))
        self.assertIn('boutique digital agency', industries)
        self.assertIn('custom software development agency', industries)

    def test_buyer_mode_still_drops_peer_terms(self):
        s = Settings(target_industries='dental clinic, web design agency')
        self.assertEqual(icp.buyer_industries(s), ['dental clinic'])

    def test_agency_lead_is_not_competitor_in_agency_mode(self):
        s = Settings(icp_mode='agency')
        agency = lead(company='Pixel Web Design Agency', industry='web design agency',
                      website='pixelwebdesign.example',
                      description='We build websites, SEO and apps for clients.')
        self.assertFalse(icp.looks_like_competitor(agency, s))

    def test_own_company_still_rejected_in_agency_mode(self):
        s = Settings(icp_mode='agency')
        me = lead(company='Shailog Technologies', website='shailog.example')
        self.assertTrue(icp.looks_like_competitor(me, s))

    def test_agency_lead_still_competitor_in_buyer_mode(self):
        s = Settings(icp_mode='buyer')
        agency = lead(company='Pixel Web Design Agency', industry='web design agency',
                      website='pixelwebdesign.example')
        self.assertTrue(icp.looks_like_competitor(agency, s))


class ProfileApiTests(TestCase):
    """/api/profiles/ — list, create and the activate switch."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_list_profiles(self):
        resp = self.client.get('/api/profiles/')
        self.assertEqual(resp.status_code, 200)
        names = {p['name'] for p in resp.json()}
        self.assertIn('Shailog Tech — Agency Partners', names)

    def test_create_profile_does_not_activate(self):
        resp = self.client.post('/api/profiles/', {
            'name': 'UK Only', 'countries': ['United Kingdom'],
            'industries': ['digital product studio'], 'cities': [],
            'icpMode': 'agency',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data['countries'], ['United Kingdom'])
        self.assertFalse(data['isActive'])
        self.assertEqual(AppSettings.load().target_countries,
                         'United States, United Kingdom, Germany')  # untouched

    def test_activate_endpoint_switches_live_targeting(self):
        backup = SearchProfile.objects.get(name='Backup — Buyer Targeting')
        resp = self.client.post(f'/api/profiles/{backup.pk}/activate/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body['profile']['isActive'])
        self.assertEqual(body['settings']['targeting']['icpMode'], 'buyer')

        s = AppSettings.load()
        self.assertEqual(s.icp_mode, 'buyer')
        self.assertFalse(s.target_countries)  # worldwide sweep restored

    def test_activate_unknown_profile_404(self):
        resp = self.client.post('/api/profiles/99999/activate/')
        self.assertEqual(resp.status_code, 404)


class AgencyDraftTests(TestCase):
    """Agency-mode outreach: partnership-seeking, never a flaw audit."""

    def setUp(self):
        s = AppSettings.load()
        s.company_name = 'Shailog Technologies'
        s.company_website = 'https://shailog.com'
        s.services = ['Custom SaaS & web app development', 'React Native mobile apps']
        s.ai_key = ''  # keyless — the built-in fallback is what we assert on
        EmailTemplate.objects.all().delete()  # no user template → built-in path
        self.settings_obj = s
        self.lead = Lead.objects.create(
            company='Viget', industry='web design agency', website='viget.com',
            has_website=True, contact_email='hello@viget.com',
            description='Digital agency building web products.',
            findings=[{'area': 'SEO', 'issue': 'Missing meta description.',
                       'recommendation': 'Write meta descriptions.', 'severity': 'medium'}])

    def test_agency_mode_draft_is_partnership_not_audit(self):
        self.settings_obj.icp_mode = 'agency'
        self.settings_obj.save()
        subject, body, used_llm = _draft_email(self.lead)
        self.assertFalse(used_llm)
        self.assertIn('partnership', subject.lower())
        self.assertIn('partner', body.lower())
        self.assertIn('pilot', body.lower())          # the low-friction ask
        self.assertIn('julex.shop', body)             # real shipped work as proof
        # flaw-audit language must never reach a peer agency
        self.assertNotIn('caught my eye', body.lower())
        self.assertNotIn('meta description', body.lower())
        self.assertNotIn('finding', body.lower())

    def test_buyer_mode_draft_keeps_audit_angle(self):
        self.settings_obj.icp_mode = 'buyer'
        self.settings_obj.save()
        subject, body, used_llm = _draft_email(self.lead)
        self.assertIn('meta description', body)  # findings still used for buyers

    def test_user_template_wins_over_builtins_in_agency_mode(self):
        self.settings_obj.icp_mode = 'agency'
        self.settings_obj.save()
        EmailTemplate.objects.create(
            name='My partnership template', is_default=True,
            subject='Partnership with {{company}}',
            body='Hi {{company}} — let us take your overflow builds. — {{sender_name}}')
        subject, body, used_llm = _draft_email(self.lead)
        self.assertEqual(subject, 'Partnership with Viget')
        self.assertIn('overflow builds', body)
