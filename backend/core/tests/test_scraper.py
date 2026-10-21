"""Query-builder + SERP-filter tests for the ICP-aware discovery sweep."""

from django.test import SimpleTestCase

from core import icp
from core.scraper import (BLOCKED_DOMAINS, INDUSTRY_QUERIES, REGIONS,
                          _plausible_company_name, search_queries_for_cycle)


class QueryBuilderTests(SimpleTestCase):
    def test_legacy_default_still_works_without_icp(self):
        slices = search_queries_for_cycle(0)
        self.assertEqual(len(slices), 3)
        # slice #0 is the India-priority metro
        self.assertIn('India', slices[0][0])
        for query, industry in slices:
            self.assertEqual(query, f'{industry} in {query.rsplit(" in ", 1)[-1]}')

    def test_icp_industries_replace_the_agency_heavy_defaults(self):
        buyers = icp.BUYER_INDUSTRIES  # the default seller persona's list
        slices = search_queries_for_cycle(0, industries=buyers)
        for query, industry in slices:
            self.assertIn(industry, buyers)
            self.assertFalse(icp.NEVER_SEARCH_INDUSTRIES.search(industry),
                             msg=f'{industry} must never be searched for a web seller')

    def test_no_legacy_agency_query_survives_with_icp_industries(self):
        buyers = icp.BUYER_INDUSTRIES
        # the AGENCY terms from the legacy list must never be searched again;
        # genuine buyer industries (dental clinic, boutique hotel) legitimately
        # exist in both lists and are fine
        legacy_agencies = [q for q in INDUSTRY_QUERIES
                           if icp.NEVER_SEARCH_INDUSTRIES.search(q)]
        self.assertGreaterEqual(len(legacy_agencies), 4)  # sanity: we know 5+
        for cycle in range(0, len(buyers) * 3, 7):   # sample many rotation points
            for _, industry in search_queries_for_cycle(cycle, industries=buyers):
                self.assertNotIn(industry, legacy_agencies)

    def test_rotation_is_deterministic(self):
        buyers = icp.BUYER_INDUSTRIES
        a = search_queries_for_cycle(3, industries=buyers)
        b = search_queries_for_cycle(3, industries=buyers)
        self.assertEqual(a, b)

    def test_india_priority_slice_uses_icp_industries(self):
        buyers = icp.BUYER_INDUSTRIES
        slices = search_queries_for_cycle(5, industries=buyers)
        query, industry = slices[0]
        self.assertIn('India', query)
        self.assertIn(industry, buyers)

    def test_target_country_pool_respects_industries(self):
        buyers = icp.BUYER_INDUSTRIES
        slices = search_queries_for_cycle(0, regions=['India'], industries=buyers)
        for query, industry in slices:
            self.assertTrue(query.endswith(' in India'), msg=query)
            self.assertIn(industry, buyers)

    def test_every_region_yields_valid_queries_with_buyers(self):
        buyers = icp.BUYER_INDUSTRIES[:5]
        # sample many rotation points: each slice pairs a buyer industry with a region
        for cycle in range(0, 50):
            for query, industry in search_queries_for_cycle(cycle, industries=buyers):
                self.assertIn(' in ', query)
                self.assertIn(industry, buyers)


class SerpJunkFilterTests(SimpleTestCase):
    """The keyless-mode gate against directory / listicle / deal SERP junk."""

    def test_junk_titles_rejected(self):
        for bad in ('Dental Care in Sweden: Complete English Guide (2026)',
                    'Expert Home Services in Hyderabad with Upto 50% OFF',
                    'Dental treatment in Austria: 23 clinics & cost (2026)',
                    'Denmark Dental Clinic Ranking (2026)',
                    'Top 10 Best Spas in Chennai',
                    'The Expat Guide to Finnish Dentists'):
            self.assertFalse(_plausible_company_name(bad, 'example.com'), msg=bad)

    def test_real_company_names_pass(self):
        for good in ('Smile Dental Clinic', 'RG Architects',
                     'Vistas Ad Media Communications Pvt. Ltd',
                     'Mazaya Spa and Massage',
                     'Wellmap', 'Swedish Dental Group'):
            self.assertTrue(_plausible_company_name(good, 'example.com'), msg=good)

    def test_marketplace_domains_blocked(self):
        self.assertIn('urbancompany.com', BLOCKED_DOMAINS)
        self.assertIn('justdial.com', BLOCKED_DOMAINS)
