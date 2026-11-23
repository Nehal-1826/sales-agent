"""Business-profile inference — the AI that reads a company's website and
works out (a) what it sells and (b) WHO BUYS from it.

The local model is not allowed to invent: buyer kinds must come from the
fixed catalogue, and countries only from the domain's country TLD (a free
model invented "New York, London, Sydney" for a journal — see the git
history). Every test here mocks the model itself; the contract is what
matters, not the model's mood."""
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase

from core import business_profile as bp
from core.models import AppSettings, User
from core.scraper import REGIONS
from core.tenancy import workspace_context
from billing.tests.test_entitlements import make_ws

from .base import TenantTestCase

PAGE = """
<html><head><title>MyVet — Animal Hospital</title>
<meta name="description" content="Veterinary hospital for cats and dogs in Austin, Texas."></head>
<body><nav>Home Services Contact Book Now</nav>
<h1>Welcome to MyVet</h1><h2>Dental care for pets</h2>
<script>var tracking = 'pixel';</script>
<p>We treat cats and dogs   in   Austin, Texas.   Same-day appointments.</p>
<footer>Austin, Texas · phone</footer></body></html>"""


def ai_reply(**over):
    base = {'services': ['Routine checkups', 'Pet dental care', 'Surgery'],
            'customer_type': 'organisations',
            'buyers': ['research institute', 'university', 'publishing house'],
            'own_kind': 'publishing house', 'ideal_client': 'Research institutions.'}
    base.update(over)
    return base


class CountryFromDomainTests(SimpleTestCase):
    """Countries come from the domain's country TLD only — never from the model."""

    def test_country_tlds_map_to_the_scraper_region_names(self):
        self.assertEqual(bp.country_from_domain('shailog.in'), 'India')
        self.assertEqual(bp.country_from_domain('clinic.co.in'), 'India')
        self.assertEqual(bp.country_from_domain('shop.co.uk'), 'United Kingdom')
        self.assertEqual(bp.country_from_domain('vet.com.au'), 'Australia')
        self.assertEqual(bp.country_from_domain('praxis.de'), 'Germany')
        self.assertEqual(bp.country_from_domain('clinic.ca'), 'Canada')
        self.assertEqual(bp.country_from_domain('loja.com.br'), 'Brazil')
        self.assertEqual(bp.country_from_domain('store.ae'), 'UAE')

    def test_global_tlds_mean_worldwide(self):
        for domain in ('ijrnexus.com', 'example.org', 'example.net', 'example.io',
                       'example.ai', 'example.co', 'example.me', 'example.md'):
            self.assertEqual(bp.country_from_domain(domain), '', domain)

    def test_www_and_case_are_ignored(self):
        self.assertEqual(bp.country_from_domain('WWW.Shailog.IN'), 'India')

    def test_every_mapped_country_is_one_the_scraper_can_search(self):
        """A country the scraper does not know would be dropped at query time,
        leaving the workspace with an empty region list and no warning."""
        unknown = sorted(set(bp.CCTLD_COUNTRY.values()) - set(REGIONS))
        self.assertEqual(unknown, [])


class PageBriefTests(SimpleTestCase):
    def test_brief_keeps_title_description_headings_and_visible_text(self):
        b = bp.page_brief(PAGE)
        self.assertEqual(b['title'], 'MyVet — Animal Hospital')
        self.assertEqual(b['description'], 'Veterinary hospital for cats and dogs in Austin, Texas.')
        self.assertEqual(b['headings'], ['Welcome to MyVet', 'Dental care for pets'])
        self.assertIn('Same-day appointments.', b['text'])

    def test_brief_drops_scripts_and_navigation_noise(self):
        b = bp.page_brief(PAGE)
        for noise in ('tracking', 'pixel', 'Home Services Contact', 'Book Now'):
            self.assertNotIn(noise, b['text'])

    def test_brief_whitespace_is_normalised_and_bounded(self):
        b = bp.page_brief(PAGE)
        self.assertNotIn('  ', b['text'])
        self.assertLessEqual(len(b['text']), bp.BRIEF_TEXT_CHARS)

    def test_missing_description_falls_back_to_og_description(self):
        html = ('<html><head><title>T</title>'
                '<meta property="og:description" content="Open access journal"></head>'
                '<body>hello</body></html>')
        self.assertEqual(bp.page_brief(html)['description'], 'Open access journal')


class NormalizeInferenceTests(SimpleTestCase):
    """Whatever the model says, the normalised profile is clean and on-catalogue."""

    def test_none_stays_none(self):
        self.assertIsNone(bp.normalize_inference(None))

    def test_buyers_outside_the_catalogue_are_dropped(self):
        out = bp.normalize_inference(ai_reply(
            buyers=['university', 'dental clinic', 'New York', '5paisa.com']))
        self.assertEqual(out['buyers'], ['university', 'dental clinic'])

    def test_buyer_casing_follows_the_catalogue(self):
        out = bp.normalize_inference(ai_reply(buyers=['UNIVERSITY', 'small business']))
        self.assertEqual(out['buyers'], ['university', 'small business'])

    def test_the_sellers_own_kind_is_never_a_buyer(self):
        out = bp.normalize_inference(ai_reply(buyers=['publishing house', 'university']))
        self.assertEqual(out['buyers'], ['university'])

    def test_buyers_are_deduplicated_and_capped_at_four(self):
        out = bp.normalize_inference(ai_reply(own_kind='', buyers=[
            'university', 'school', 'college', 'startup', 'hospital', 'gym']))
        self.assertEqual(len(out['buyers']), 4)
        out = bp.normalize_inference(ai_reply(own_kind='', buyers=['university', 'university']))
        self.assertEqual(out['buyers'], ['university'])

    def test_services_are_cleaned_and_capped(self):
        out = bp.normalize_inference({'services': ['  CRM  ', 'Mail', 'Mail', 'x', 'a' * 80,
                                                   'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']})
        self.assertEqual(out['services'][0], 'CRM')
        self.assertEqual(out['services'].count('Mail'), 1)
        self.assertLessEqual(len(out['services']), 6)
        self.assertTrue(all(2 < len(s) <= 60 for s in out['services']))

    def test_unknown_customer_type_reads_as_organisations(self):
        out = bp.normalize_inference({'customer_type': 'aliens', 'services': ['A service']})
        self.assertEqual(out['customer_type'], 'organisations')

    def test_nothing_usable_is_none(self):
        self.assertIsNone(bp.normalize_inference({'services': [], 'buyers': []}))
        self.assertIsNone(bp.normalize_inference({'services': ['ok']}))
        self.assertIsNone(bp.normalize_inference({'buyers': ['university']}))

    def test_ideal_client_is_bounded_and_optional(self):
        out = bp.normalize_inference(ai_reply(ideal_client='x' * 900))
        self.assertEqual(len(out['ideal_client']), 240)
        out = bp.normalize_inference(ai_reply(ideal_client=None))
        self.assertEqual(out['ideal_client'], '')


class InferProfileTests(SimpleTestCase):
    def test_model_output_is_normalised_and_the_prompt_carries_the_page(self):
        with mock.patch.object(bp, 'llm_json', return_value=ai_reply()) as lj:
            out = bp.infer_profile(bp.page_brief(PAGE))
        self.assertEqual(out['services'], ['Routine checkups', 'Pet dental care', 'Surgery'])
        self.assertEqual(out['buyers'], ['research institute', 'university'])
        prompt = lj.call_args.kwargs['prompt']
        self.assertIn('Dental care for pets', prompt)
        self.assertIn('university', prompt, 'the model must see the catalogue to pick from it')

    def test_model_failure_is_none_not_a_guess(self):
        with mock.patch.object(bp, 'llm_json', return_value=None):
            self.assertIsNone(bp.infer_profile(bp.page_brief(PAGE)))


class ProfileFromDomainTests(SimpleTestCase):
    def _fetch(self, html=PAGE, url='https://www.myvet.example/'):
        resp = mock.Mock(status_code=200, text=html)
        resp.url = url
        return mock.patch.object(bp, 'fetch_public', return_value=resp)

    def test_full_profile_from_site_and_model(self):
        with self._fetch(), mock.patch.object(bp, 'llm_json', return_value=ai_reply(
                services=['Vet checkups', 'Pet surgery', 'Pet dental care'],
                buyers=['pet grooming service', 'veterinary clinic'], own_kind='',
                ideal_client='Pet groomers.')) as lj:
            p = bp.profile_from_domain('myvet.example')
        self.assertTrue(p['inferred'])
        self.assertEqual(p['domain'], 'myvet.example')
        self.assertEqual(p['name'], 'MyVet')   # brand before the em-dash (pick_site_name)
        self.assertEqual(p['description'], 'Veterinary hospital for cats and dogs in Austin, Texas.')
        self.assertEqual(p['services'], ['Vet checkups', 'Pet surgery', 'Pet dental care'])
        self.assertEqual(p['target_industries'], ['pet grooming service', 'veterinary clinic'])
        self.assertEqual(p['target_countries'], [])      # .example is not a country
        self.assertEqual(p['icp_notes'], 'Pet groomers.')
        self.assertEqual(lj.call_count, 1)

    def test_country_tld_narrows_the_search(self):
        with self._fetch(url='https://www.clinic.in/'), \
             mock.patch.object(bp, 'llm_json', return_value=ai_reply(own_kind='')):
            p = bp.profile_from_domain('clinic.in')
        self.assertEqual(p['target_countries'], ['India'])

    def test_model_services_are_the_ones_used(self):
        with self._fetch(), mock.patch.object(bp, 'llm_json', return_value=ai_reply(
                services=['Vet checkups', 'Pet surgery', 'Pet dental care'], own_kind='')):
            p = bp.profile_from_domain('myvet.example')
        self.assertEqual(p['services'], ['Vet checkups', 'Pet surgery', 'Pet dental care'])
        self.assertNotIn('Dental care for pets', p['services'])

    def test_without_the_model_the_site_still_fills_what_it_can(self):
        with self._fetch(), mock.patch.object(bp, 'llm_json', return_value=None):
            p = bp.profile_from_domain('myvet.example')
        self.assertFalse(p['inferred'])
        self.assertEqual(p['name'], 'MyVet')
        # no invented 'what you sell' from page headings — they are marketing
        # lines on real sites; only explicit schema.org offers count here
        self.assertEqual(p['services'], [])
        self.assertEqual(p['target_industries'], [])
        self.assertEqual(p['customer_type'], '')

    def test_customers_are_individuals_means_no_company_leads_are_invented(self):
        with self._fetch(), mock.patch.object(bp, 'llm_json', return_value=ai_reply(
                customer_type='individuals', buyers=['veterinary clinic', 'hospital'], own_kind='')):
            p = bp.profile_from_domain('myvet.example')
        self.assertEqual(p['customer_type'], 'individuals')
        self.assertEqual(p['target_industries'], [])

    def test_mixed_customers_still_get_company_leads(self):
        with self._fetch(), mock.patch.object(bp, 'llm_json', return_value=ai_reply(
                customer_type='both', buyers=['veterinary clinic'], own_kind='')):
            p = bp.profile_from_domain('myvet.example')
        self.assertEqual(p['target_industries'], ['veterinary clinic'])

    def test_unreachable_site_raises_so_the_wizard_can_say_so(self):
        from core.company_scrape import BadUrl
        with mock.patch.object(bp, 'fetch_public', side_effect=BadUrl('down')):
            with self.assertRaises(BadUrl):
                bp.profile_from_domain('dead.example')


class ApplyProfileTests(TenantTestCase):
    def setUp(self):
        cache.clear()
        self.s = AppSettings.load()

    def test_applies_business_and_targeting_to_the_settings(self):
        profile = {'domain': 'acme.in', 'name': 'Acme', 'description': 'Makes widgets.',
                   'address': '12 Main St, Pune', 'services': ['Widgets', 'Gadgets'],
                   'customer_type': 'organisations', 'target_industries': ['startup', 'gym'],
                   'target_countries': ['India'], 'target_cities': [], 'icp_notes': 'Startups.'}
        lines = bp.apply_profile(self.s, profile)
        self.s.refresh_from_db()
        self.assertEqual(self.s.company_name, 'Acme')
        self.assertEqual(self.s.company_website, 'acme.in')
        self.assertEqual(self.s.company_description, 'Makes widgets.')
        self.assertEqual(self.s.company_address, '12 Main St, Pune')
        self.assertEqual(self.s.services, ['Widgets', 'Gadgets'])
        self.assertEqual(self.s.target_industries, 'startup, gym')
        self.assertEqual(self.s.target_countries, 'India')
        self.assertEqual(self.s.icp_notes, 'Startups.')
        self.assertTrue(any('startup' in line for line in lines), lines)

    def test_no_inferred_leads_leaves_existing_targeting_alone(self):
        self.s.target_industries = 'dental clinic'
        self.s.target_countries = 'Brazil'
        self.s.save()
        bp.apply_profile(self.s, {'domain': 'acme.com', 'name': 'Acme', 'description': '',
                                  'address': '', 'services': [], 'customer_type': 'individuals',
                                  'target_industries': [], 'target_countries': [],
                                  'target_cities': [], 'icp_notes': ''})
        self.s.refresh_from_db()
        self.assertEqual(self.s.target_industries, 'dental clinic')
        self.assertEqual(self.s.target_countries, 'Brazil')
        self.assertEqual(self.s.icp_notes, '')


class InferBuyersForSettingsTests(TenantTestCase):
    """The pipeline's fallback when a workspace never set 'Who to find'."""

    def setUp(self):
        cache.clear()
        self.ws = make_ws('infer-co')
        self.s = AppSettings.load()

    def test_brief_is_built_from_the_workspace_own_profile(self):
        self.s.company_name = 'Zoho'
        self.s.services = ['CRM', 'Mail']
        self.s.company_website = ''
        self.s.save()
        with mock.patch.object(bp, 'llm_json', return_value=ai_reply(
                own_kind='', buyers=['small business', 'startup'])) as lj:
            self.assertEqual(bp.infer_buyers_for_settings(self.s), ['small business', 'startup'])
        prompt = lj.call_args.kwargs['prompt']
        self.assertIn('Zoho', prompt)
        self.assertIn('CRM', prompt)

    def test_result_is_cached_per_profile_so_the_pipeline_does_not_re_ask(self):
        self.s.company_name = 'Zoho'
        self.s.services = ['CRM']
        self.s.save()
        with mock.patch.object(bp, 'llm_json', return_value=ai_reply(own_kind='')) as lj:
            bp.infer_buyers_for_settings(self.s)
            bp.infer_buyers_for_settings(self.s)
            self.assertEqual(lj.call_count, 1)
            # a changed profile is a different question
            self.s.services = ['CRM', 'Mail']
            self.s.save()
            bp.infer_buyers_for_settings(self.s)
            self.assertEqual(lj.call_count, 2)

    def test_model_failure_is_not_cached(self):
        self.s.company_name = 'Zoho'
        self.s.services = ['CRM']
        self.s.save()
        with mock.patch.object(bp, 'llm_json', return_value=None) as lj:
            self.assertEqual(bp.infer_buyers_for_settings(self.s), [])
            self.assertEqual(bp.infer_buyers_for_settings(self.s), [])
        self.assertEqual(lj.call_count, 2, 'a miss must be retried, not remembered')

    def test_empty_profile_never_asks_the_model(self):
        with mock.patch.object(bp, 'llm_json') as lj:
            self.assertEqual(bp.infer_buyers_for_settings(self.s), [])
        lj.assert_not_called()

    def test_site_text_enriches_the_brief_but_a_dead_site_does_not_break_it(self):
        from core.company_scrape import BadUrl
        self.s.company_name = 'Zoho'
        self.s.services = ['CRM']
        self.s.company_website = 'zoho.example'
        self.s.save()
        resp = mock.Mock(status_code=200, text='<html><head><title>Zoho</title></head>'
                                             '<body><h2>CRM software for teams</h2></body></html>')
        with mock.patch.object(bp, 'fetch_public', return_value=resp), \
             mock.patch.object(bp, 'llm_json', return_value=ai_reply(own_kind='')) as lj:
            bp.infer_buyers_for_settings(self.s)
        self.assertIn('CRM software for teams', lj.call_args.kwargs['prompt'])

        self.s.services = ['CRM', 'Mail']      # new profile → cache miss
        self.s.save()
        with mock.patch.object(bp, 'fetch_public', side_effect=BadUrl('down')), \
             mock.patch.object(bp, 'llm_json', return_value=ai_reply(own_kind='')) as lj:
            bp.infer_buyers_for_settings(self.s)
        self.assertIn('Zoho', lj.call_args.kwargs['prompt'])
