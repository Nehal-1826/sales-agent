"""Data-quality gates: who gets enriched, who gets emailed, what a lead is called."""
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from core.gmaps import enrich_leads_via_gmaps
from core.icp import buyer_industries
from core.models import AppSettings, Lead
from core.pipeline import APOLLO_SWEEP_PER_CYCLE, MAX_PROFILE_PER_CYCLE, _ai_review, run_pipeline
from core.scraper import analyze_website, extract_contact_email, pick_site_name


class ContactEmailTests(TestCase):
    def test_third_party_vendor_address_rejected(self):
        html = 'Site by Pixel Studio hello@pixelstudio.in'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com/'), '')

    def test_own_domain_preferred(self):
        html = 'hello@pixelstudio.in · info@smiledental.com'
        self.assertEqual(extract_contact_email(html, 'https://www.smiledental.com/contact'),
                         'info@smiledental.com')

    def test_sibling_tld_of_own_brand_accepted(self):
        html = 'Reach us at info@smiledental.in'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com/'),
                         'info@smiledental.in')

    def test_base_url_with_port_still_matches_own_domain(self):
        html = 'info@smiledental.com'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com:8443/'),
                         'info@smiledental.com')

    def test_subdomain_email_accepted(self):
        html = 'info@mail.smiledental.com'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com/'),
                         'info@mail.smiledental.com')

    def test_third_party_sibling_tld_still_rejected(self):
        html = 'Design by hello@pixelstudio.in'
        self.assertEqual(extract_contact_email(html, 'https://www.smiledental.com:8443/'), '')

    def test_free_mail_inbox_allowed(self):
        html = 'Write to smiledental.pune@gmail.com'
        self.assertEqual(extract_contact_email(html, 'https://smiledental.com/'),
                         'smiledental.pune@gmail.com')


class SiteNameTests(TestCase):
    def test_generic_segment_skipped(self):
        self.assertEqual(pick_site_name('Home | Smile Dental Clinic'), 'Smile Dental Clinic')
        self.assertEqual(pick_site_name('Welcome — Iron Gym Pune'), 'Iron Gym Pune')
        self.assertEqual(pick_site_name('Home'), '')

    def test_spaced_separator_splits(self):
        self.assertEqual(pick_site_name('Smile Dental - Pune'), 'Smile Dental')

    def test_hyphenated_brands_stay_whole(self):
        self.assertEqual(pick_site_name('Coca-Cola Dental'), 'Coca-Cola Dental')
        self.assertEqual(pick_site_name('Rolls-Royce Repairs'), 'Rolls-Royce Repairs')
        self.assertEqual(pick_site_name('Wi-Fi Cafe'), 'Wi-Fi Cafe')


class AiVerdictTests(TestCase):
    def setUp(self):
        self.lead = Lead.objects.create(company='Smile', website='smile.com', industry='dental clinic')
        self.audit = {'analysis': {'text_excerpt': 'Family dentistry.'}}

    def _review(self, reply):
        with mock.patch('core.pipeline.llm_available', return_value=True), \
             mock.patch('core.pipeline.llm_complete', return_value=reply):
            return _ai_review(self.lead, self.audit, AppSettings.load())[0]

    def test_explicit_yes(self):
        self.assertTrue(self._review('RELEVANT: yes\nDESCRIPTION: A clinic.'))

    def test_markdown_no_is_rejected(self):
        self.assertFalse(self._review('**RELEVANT:** no\nDESCRIPTION: A blog.'))

    def test_refusal_is_held(self):
        self.assertIsNone(self._review('I cannot help with that.'))


class MapsMatchTests(TestCase):
    def test_name_match_skipped_when_listing_has_other_domain(self):
        lead = Lead.objects.create(company='Acme', website='acme.com')
        place = {'name': 'Acme Plumbing Works', 'phone': '+1 555 0100', 'website': 'acmeplumbing.com'}
        with mock.patch('core.gmaps.gmaps_search', return_value=[place]):
            self.assertEqual(enrich_leads_via_gmaps([lead], delay=0), [])


class IcpOverrideTests(TestCase):
    def test_override_that_matches_competitor_patterns_is_dropped(self):
        s = AppSettings.load()
        s.company_name, s.services = 'Shailog', ['web development', 'SEO']
        s.icp_mode = 'buyer'   # migration 0015 leaves the singleton in agency mode, which skips the guard
        s.target_industries = 'dental clinic, marketing firm'
        s.save()
        picked = buyer_industries(s)
        self.assertIn('dental clinic', picked)
        self.assertNotIn('marketing firm', picked)


class AnalyzeSiteNameTests(TestCase):
    """analyze_website must never record a generic page title as the brand."""

    def _audit(self, title):
        html = (f'<html><head><title>{title}</title></head><body>'
                f'<h1>Welcome</h1><p>We are a family dental clinic.</p></body></html>')

        def fake_scrape(url):
            if url.rstrip('/') in ('smiledental.com', 'https://smiledental.com'):
                return {'ok': True, 'status': 200, 'final_url': 'https://smiledental.com/',
                        'https': True, 'load_ms': 120, 'html': html, 'error': ''}
            return {'ok': False, 'status': 404, 'final_url': url, 'https': True,
                    'load_ms': 10, 'html': '', 'error': ''}

        with mock.patch('core.scraper.scrape_company', side_effect=fake_scrape):
            return analyze_website('Smile Dental', 'smiledental.com')

    def test_generic_title_does_not_become_site_name(self):
        self.assertNotIn('site_name', self._audit('Home')['analysis'])

    def test_brand_segment_after_generic_one_is_used(self):
        self.assertEqual(self._audit('Home | Smile Dental Clinic')['analysis']['site_name'],
                         'Smile Dental Clinic')


class MapsFallbackConflictTests(TestCase):
    """A name fallback must never attach a phone from a listing that has its own,
    different website — that is another business."""

    def _enrich(self, lead, place):
        with mock.patch('core.gmaps.gmaps_search', return_value=[place]):
            return enrich_leads_via_gmaps([lead], delay=0)

    def test_exact_name_with_other_domain_is_skipped(self):
        lead = Lead.objects.create(company='Acme Plumbing', website='acme.com')
        place = {'name': 'Acme Plumbing', 'phone': '+1 555 0100', 'website': 'https://www.acmeplumbing.com/'}
        self.assertEqual(self._enrich(lead, place), [])
        lead.refresh_from_db()
        self.assertEqual(lead.contact_phone, '')

    def test_exact_name_with_no_listing_website_still_matches(self):
        lead = Lead.objects.create(company='Acme Plumbing', website='acme.com')
        place = {'name': 'Acme Plumbing', 'phone': '+1 555 0100', 'website': ''}
        self.assertEqual(self._enrich(lead, place), [lead])
        self.assertEqual(lead.contact_phone, '+1 555 0100')

    def test_exact_name_with_same_domain_matches(self):
        lead = Lead.objects.create(company='Acme Plumbing', website='https://acme.com/')
        place = {'name': 'Acme Plumbing', 'phone': '+1 555 0100', 'website': 'http://www.acme.com/contact'}
        self.assertEqual(self._enrich(lead, place), [lead])


class ApifyTitleFallbackTests(TestCase):
    def _enrich(self, lead, place):
        from core.apify_maps import enrich_leads_via_apify
        with mock.patch('core.apify_maps.apify_available', return_value=True), \
             mock.patch('core.apify_maps.maps_places', return_value=[place]):
            return enrich_leads_via_apify([lead])

    def test_title_match_with_other_domain_is_skipped(self):
        lead = Lead.objects.create(company='Acme Plumbing', website='acme.com', profiled=True)
        place = {'title': 'Acme Plumbing', 'phone': '+1 555 0100', 'website': 'acmeplumbing.com',
                 'city': '', 'state': '', 'address': '', 'countryCode': ''}
        self.assertEqual(self._enrich(lead, place), [])

    def test_title_match_with_empty_listing_website_is_used(self):
        lead = Lead.objects.create(company='Acme Plumbing', website='acme.com', profiled=True)
        place = {'title': 'Acme Plumbing', 'phone': '+1 555 0100', 'website': '',
                 'city': 'Pune', 'state': '', 'address': '', 'countryCode': ''}
        self.assertEqual(self._enrich(lead, place), [lead])


def _audit(contact_phone='', score=50, excerpt='Family dental clinic in Pune.'):
    return {'has_website': True, 'score': score, 'contact_email': '',
            'contact_phone': contact_phone, 'findings': [],
            'analysis': {'text_excerpt': excerpt}, 'state': '', 'country': ''}


class PipelineGateTests(TestCase):
    """Cycle-level behaviour with every network touchpoint mocked."""

    analyze_result = None

    def setUp(self):
        s = AppSettings.load()
        s.company_name, s.services = 'Shailog Technologies', ['web design', 'SEO']
        s.icp_mode, s.target_industries, s.ai_key = 'buyer', '', ''
        s.save()
        self.scalelist = mock.Mock(return_value='')
        self.apollo = mock.Mock(return_value={})
        self.apify = mock.Mock(return_value=[])
        self.audited = []

    def _analyze(self, name, website, prefer_country=''):
        self.audited.append(name)
        return self.analyze_result or _audit()

    def _cycle(self, llm_reply=None, apify=False, paid=True, gmaps=None):
        """One cycle.  llm_reply=None -> keyless (no AI gate)."""
        patches = [
            mock.patch('core.pipeline.search_queries_for_cycle',
                       return_value=[('dentist pune', 'dental clinic')] if gmaps else []),
            mock.patch('core.pipeline.analyze_website', side_effect=self._analyze),
            mock.patch('core.pipeline.gmaps_available', return_value=gmaps is not None),
            mock.patch('core.pipeline.enrich_leads_via_gmaps', gmaps or mock.Mock(return_value=[])),
            mock.patch('core.pipeline._paid_lookup_configured', return_value=paid),
            mock.patch('core.pipeline.discover_no_website_places', return_value=[]),
            mock.patch('core.pipeline.search_companies', return_value=[]),
            mock.patch('core.pipeline.apify_maps_available', return_value=apify),
            mock.patch('core.pipeline.enrich_leads_via_apify', self.apify),
            mock.patch('core.pipeline.llm_available', return_value=llm_reply is not None),
            mock.patch('core.pipeline.llm_complete', return_value=llm_reply),
            mock.patch('core.pipeline.scalelist_phone_find', self.scalelist),
            mock.patch('core.pipeline.apollo_enrich_domain', self.apollo),
            mock.patch('core.pipeline.time.sleep', lambda *_: None),
        ]
        for p in patches:
            p.start()
        try:
            return run_pipeline(triggered_by='test')
        finally:
            for p in patches:
                p.stop()

    def _assert_no_paid_calls(self):
        self.scalelist.assert_not_called()
        self.apollo.assert_not_called()

    # -- paid lookups only after the gates ------------------------------------
    def test_ai_rejected_lead_triggers_no_paid_lookup(self):
        Lead.objects.create(company='Some Blog', website='someblog.com')
        self._cycle(llm_reply='RELEVANT: no\nDESCRIPTION: A blog.')
        self.assertFalse(Lead.objects.filter(company='Some Blog').exists())
        self._assert_no_paid_calls()

    def test_held_lead_triggers_no_paid_lookup(self):
        lead = Lead.objects.create(company='Smile Dental', website='smiledental.com')
        self._cycle(llm_reply='I cannot help with that.')
        lead.refresh_from_db()
        self.assertFalse(lead.profiled)
        self.assertNotIn('enrich_tried_at', lead.analysis or {})
        self._assert_no_paid_calls()

    def test_competitor_rejected_lead_triggers_no_paid_lookup(self):
        Lead.objects.create(company='Pixel Web Design Agency', website='pixelwebdesign.example')
        self._cycle()
        self.assertFalse(Lead.objects.filter(company__icontains='Pixel').exists())
        self._assert_no_paid_calls()

    def test_vetted_lead_gets_one_paid_lookup_and_is_stamped(self):
        Lead.objects.create(company='Smile Dental', website='smiledental.com')
        self.scalelist.return_value = '+91 20 5555 0001'
        self._cycle(llm_reply='RELEVANT: yes\nDESCRIPTION: A clinic.')
        lead = Lead.objects.get(company='Smile Dental')
        self.assertTrue(lead.profiled)
        self.assertEqual(lead.contact_phone, '+91 20 5555 0001')
        self.assertEqual(lead.analysis['phone_source'], 'scalelist')
        self.assertIn('enrich_tried_at', lead.analysis)
        self.assertEqual(self.scalelist.call_count, 1)   # profile only: the sweep skips it
        self.apollo.assert_not_called()

    def test_scraped_phone_skips_paid_lookup(self):
        Lead.objects.create(company='Smile Dental', website='smiledental.com')
        self.analyze_result = _audit(contact_phone='+91 20 1234 5678')
        self._cycle(llm_reply='RELEVANT: yes\nDESCRIPTION: A clinic.')
        self._assert_no_paid_calls()

    # -- 72h backoff on the sweep ---------------------------------------------
    def _profiled(self, company, hours_ago=None, score=50):
        analysis = {}
        if hours_ago is not None:
            tried = timezone.now() - timezone.timedelta(hours=hours_ago)
            analysis['enrich_tried_at'] = tried.isoformat()
        return Lead.objects.create(company=company, website=f'{company.lower()}.com',
                                   profiled=True, score=score, analysis=analysis)

    def test_sweep_skips_leads_tried_within_72h(self):
        self._profiled('Recent', hours_ago=1)
        self._cycle()
        self._assert_no_paid_calls()

    def test_sweep_retries_after_72h_and_restamps_on_a_miss(self):
        self._profiled('Stale', hours_ago=73)
        before = timezone.now()
        self._cycle()
        self.assertEqual(self.scalelist.call_count, 1)
        stamp = Lead.objects.get(company='Stale').analysis['enrich_tried_at']
        self.assertGreaterEqual(timezone.datetime.fromisoformat(stamp), before)
        self._cycle()    # restamped, so inside the window again
        self.assertEqual(self.scalelist.call_count, 1)

    def test_sweep_never_tried_lead_is_due(self):
        self._profiled('Fresh')
        self._cycle()
        self.assertEqual(self.scalelist.call_count, 1)

    def test_sweep_skipped_leads_do_not_use_up_the_attempt_cap(self):
        for i in range(3):
            self._profiled(f'Recent{i}', hours_ago=1, score=99)    # top-scored, not due
        for i in range(APOLLO_SWEEP_PER_CYCLE + 2):
            self._profiled(f'Due{i}', score=40)
        self._cycle()
        self.assertEqual(self.scalelist.call_count, APOLLO_SWEEP_PER_CYCLE)

    def test_sweep_reaches_due_lead_behind_many_not_due_high_scorers(self):
        for i in range(APOLLO_SWEEP_PER_CYCLE * 4 + 3):
            self._profiled(f'Recent{i}', hours_ago=1, score=99)
        self._profiled('LowDue', score=10)
        self._cycle()
        self.assertEqual(self.scalelist.call_count, 1)
        self.assertIn('enrich_tried_at', Lead.objects.get(company='LowDue').analysis)

    def test_no_paid_keys_means_no_stamp_and_free_maps_still_runs(self):
        self._profiled('Keyless')
        gmaps = mock.Mock(return_value=[])
        self._cycle(paid=False, gmaps=gmaps)
        self._cycle(paid=False, gmaps=gmaps)    # next cycle: still offered
        self._assert_no_paid_calls()
        self.assertNotIn('enrich_tried_at', Lead.objects.get(company='Keyless').analysis)
        self.assertEqual(gmaps.call_count, 2)
        offered = [lead.company for lead in gmaps.call_args[0][0]]
        self.assertEqual(offered, ['Keyless'])

    def test_free_maps_round_not_gated_by_paid_window(self):
        self._profiled('Recent', hours_ago=1)
        gmaps = mock.Mock(return_value=[])
        self._cycle(gmaps=gmaps)
        self._assert_no_paid_calls()
        self.assertEqual([l.company for l in gmaps.call_args[0][0]], ['Recent'])

    def test_apify_round_is_not_gated_by_paid_window(self):
        self._profiled('Recent', hours_ago=1)
        self._profiled('Stale', hours_ago=73)
        self._cycle(apify=True)
        self.assertEqual(self.apify.call_count, 1)
        passed = sorted(lead.company for lead in self.apify.call_args[0][0])
        self.assertEqual(passed, ['Recent', 'Stale'])
        self.assertEqual(self.scalelist.call_count, 1)    # paid lookup still only for the due lead

    # -- fair queue ------------------------------------------------------------
    def test_profile_queue_is_oldest_first(self):
        now = timezone.now()
        names = []
        for i in range(MAX_PROFILE_PER_CYCLE + 2):
            lead = Lead.objects.create(company=f'Lead{i}', website=f'lead{i}.com')
            Lead.objects.filter(pk=lead.pk).update(created_at=now - timezone.timedelta(days=10 - i))
            names.append(lead.company)
        self._cycle()
        self.assertEqual(sorted(self.audited), sorted(names[:MAX_PROFILE_PER_CYCLE]))
