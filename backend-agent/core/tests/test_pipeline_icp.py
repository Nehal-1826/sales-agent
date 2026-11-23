"""End-to-end pipeline test with the network fully mocked.

Proves the three behaviours this change shipped:
  1. competitor agencies discovered by search are DELETED + blacklisted
     (and stay out on the next cycle — blacklist memory),
  2. a Google-Maps no-website lead keeps its phone/address through the
     Profile step and is flagged POTENTIAL,
  3. a real buyer is profiled, flagged and drafted for.
Runs keyless (no AI): the ICP heuristic alone must do the competitor work.
"""

from unittest import mock

from core.tests.base import TenantTestCase

from core.models import AppSettings, EmailDraft, Lead, PipelineRun, Potential
from core.pipeline import run_pipeline


def fake_audit(name, website, prefer_country=''):
    """Stand-in for scraper.analyze_website with the two shapes that matter."""
    if not website:      # the Maps no-website lead
        return {'has_website': False, 'score': 95, 'contact_email': '',
                'contact_phone': '', 'findings': [{
                    'area': 'Web presence', 'severity': 'high', 'weight': 50,
                    'issue': f'{name} has no website at all.',
                    'recommendation': 'Pitch an end-to-end website.'}],
                'analysis': {}, 'state': '', 'country': ''}
    return {'has_website': True, 'score': 88, 'contact_email': 'info@smiledental.in',
            'contact_phone': '+91 20 1234 5678',
            'findings': [{'area': 'SEO', 'severity': 'high', 'weight': 8,
                          'issue': 'Missing meta description.',
                          'recommendation': 'Write meta descriptions.'}],
            'analysis': {'text_excerpt': 'Family dental clinic in Pune.'},
            'state': 'Maharashtra', 'country': 'India'}


INFERRED_BUYERS = ['dental clinic', 'gym']

MAPS_PLACE = {'name': 'Iron Gym', 'phone': '+91 98765 43210', 'website': '',
              'address': 'FC Road, Pune', 'rating': 4.5, 'reviews': 88,
              'category': 'Gym'}

DDG_RESULTS = [
    {'name': 'Pixel Web Design Agency', 'website': 'pixelwebdesign.example',
     'snippet': 'We build websites and run SEO campaigns.'},
    {'name': 'Smile Dental Clinic', 'website': 'smiledental.example',
     'snippet': 'Family dentistry in Pune since 2009.'},
]


def pipeline_patches():
    """Mock every network touchpoint in core.pipeline's namespace."""
    return [
        mock.patch('core.pipeline.search_companies', return_value=DDG_RESULTS),
        mock.patch('core.pipeline.analyze_website', side_effect=fake_audit),
        mock.patch('core.pipeline.discover_no_website_places',
                   return_value=[MAPS_PLACE]),
        mock.patch('core.pipeline.discover_places_with_website', return_value=[]),
        mock.patch('core.pipeline.enrich_leads_via_gmaps', return_value=[]),
        mock.patch('core.pipeline.gmaps_available', return_value=True),
        mock.patch('core.pipeline.llm_available', return_value=False),
        mock.patch('core.pipeline.scalelist_phone_find', return_value=''),
        mock.patch('core.pipeline.apollo_enrich_domain', return_value={}),
        mock.patch('core.pipeline.apify_maps_available', return_value=False),
        mock.patch('core.pipeline.time.sleep', lambda *_: None),
        # nobody set 'Who to find' here: the model is said to have read the
        # seller's site and named these buyers (core.business_profile)
        mock.patch('core.icp.infer_buyers_for_settings', return_value=list(INFERRED_BUYERS)),
    ]


class RunPipelineIcpTests(TenantTestCase):
    def setUp(self):
        s = AppSettings.load()
        s.company_name = 'Shailog Technologies'
        s.company_website = 'shailog.example'
        s.services = ['web design', 'SEO', 'digital marketing']
        s.target_countries = ''
        s.target_industries = ''
        s.icp_mode = 'buyer'   # buyer-mode tests — agency-partner mode has its own suite
        s.ai_key = ''            # keyless — ICP heuristic is the only gate
        s.save()
        self.settings = s

    def _run(self, *extra):
        patches = pipeline_patches() + list(extra)
        for p in patches:
            p.start()
        try:
            return run_pipeline(triggered_by='test')
        finally:
            for p in reversed(patches):   # innermost first, or a mock gets left behind
                p.stop()

    def test_agency_is_deleted_and_blacklisted(self):
        self._run()
        self.assertFalse(Lead.objects.filter(company__icontains='Pixel').exists())
        self.assertIn('pixelwebdesign.example',
                      AppSettings.load().rejected_domains)

    def test_blacklisted_agency_never_returns_on_later_cycles(self):
        self._run()
        self._run()   # same SERP again — blacklist must hold
        self.assertFalse(Lead.objects.filter(company__icontains='Pixel').exists())

    def test_maps_lead_keeps_phone_and_becomes_potential(self):
        self._run()
        gym = Lead.objects.filter(company='Iron Gym').first()
        self.assertIsNotNone(gym, 'Maps no-website lead must enter the CRM')
        self.assertEqual(gym.contact_phone, '+91 98765 43210')  # not wiped by Profile
        self.assertFalse(gym.has_website)
        self.assertEqual(gym.score, 95)
        self.assertTrue(gym.profiled)
        self.assertEqual((gym.analysis or {}).get('phone_source'), 'google-maps')
        self.assertEqual((gym.analysis or {}).get('gmaps_address'), 'FC Road, Pune')
        pot = gym.potentials.first()
        self.assertIsNotNone(pot, 'no-website lead is top-potential')
        self.assertIn('New website', pot.opportunity)

    def test_buyer_is_profiled_flagged_and_drafted(self):
        self._run()
        clinic = Lead.objects.filter(company='Smile Dental Clinic').first()
        self.assertIsNotNone(clinic)
        self.assertTrue(clinic.profiled)
        self.assertEqual(clinic.contact_email, 'info@smiledental.in')
        self.assertEqual(clinic.contact_phone, '+91 20 1234 5678')
        self.assertTrue(clinic.potentials.exists())
        draft = EmailDraft.objects.filter(lead=clinic).first()
        self.assertIsNotNone(draft, 'contact-first policy: clinic has an email')
        self.assertEqual(draft.to_email, 'info@smiledental.in')

    def test_cycle_summary_reports_icp_and_sources(self):
        run = self._run()
        notes = ' | '.join(run.summary['notes'])
        self.assertIn('looking for dental clinic, gym', notes)   # who, in plain words
        self.assertIn('Google Maps', notes)
        self.assertIn('competitor/peer', notes)   # the rejection is explained
        self.assertEqual(run.leads_created, 2)    # clinic + gym, agency rejected
        agents = {a['agent']: a['action'] for a in run.summary['agents']}
        self.assertIn('DuckDuckGo + Google Maps', agents['search'])

    def test_who_to_find_came_from_the_website_says_so(self):
        notes = ' | '.join(self._run().summary['notes'])
        self.assertIn('worked out from your website', notes)
        self.assertIn('Who to find', notes)      # and where to change it

    def test_a_who_to_find_the_user_typed_is_named_as_theirs(self):
        self.settings.target_industries = 'dental clinic, gym'
        self.settings.save()
        notes = ' | '.join(self._run().summary['notes'])
        self.assertIn('looking for dental clinic, gym', notes)
        self.assertNotIn('worked out from your website', notes)

    def test_no_buyers_worked_out_skips_the_search_with_a_plain_note(self):
        """The bug the owner hit: with nothing to go on, discovery used to
        fall back to a fixed list of somebody else's customers (clinics, yoga
        studios…) and fill the CRM with leads from the wrong line of work."""
        search, maps = mock.Mock(return_value=DDG_RESULTS), mock.Mock(return_value=[MAPS_PLACE])
        run = self._run(mock.patch('core.pipeline.search_companies', search),
                        mock.patch('core.pipeline.discover_no_website_places', maps),
                        mock.patch('core.icp.infer_buyers_for_settings', return_value=[]))
        search.assert_not_called()
        maps.assert_not_called()
        self.assertFalse(Lead.objects.exists())
        self.assertEqual(run.leads_created, 0)
        notes = ' | '.join(run.summary['notes'])
        self.assertIn('Search: SKIPPED', notes)
        self.assertIn('Who to find', notes)
        self.assertNotIn('Search sources', notes)   # nothing ran, nothing to report

    def test_maps_lead_survives_without_phone_being_overwritten_by_audit(self):
        # regression guard: Profile used to assign audit's empty phone over the
        # Maps listing number — the merge must only fill, never wipe
        self._run()
        gym = Lead.objects.get(company='Iron Gym')
        self.assertEqual(gym.contact_phone, '+91 98765 43210')


class PerCycleNotesTests(TenantTestCase):
    def test_old_leads_without_email_are_not_counted_in_this_cycles_notes(self):
        from core.tests.test_runlock import quiet_cycle
        Lead.objects.create(company='OldNoMail', website='oldnomail.example', profiled=True,
                            has_website=True, contact_email='')
        Lead.objects.create(company='OldBlocked', website='oldblocked.example', profiled=True,
                            contact_email='a@oldblocked.example', analysis={'blocked': True})
        patches = quiet_cycle()
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        run = run_pipeline(triggered_by='test')
        notes = ' '.join(run.summary['notes'])
        self.assertNotIn('without a contact email held', notes)
        self.assertNotIn('site blocks bots', notes)

    def test_enrich_due_tolerates_non_string_timestamp(self):
        from core.pipeline import _enrich_due
        lead = Lead(company='X', analysis={'enrich_tried_at': 12345})
        self.assertTrue(_enrich_due(lead))
