"""Exhaustive offline tests for the ICP engine (core.icp).

Covers: vertical detection, buyer-industry selection (default + user override
+ agency-term dropping), and the competitor heuristic — including the
false-positive traps that motivated the two-signal free-text rule.
"""

from django.test import SimpleTestCase

from core import icp


class Settings:  # minimal stand-in for AppSettings (icp only reads attributes)
    def __init__(self, **kw):
        self.company_name = kw.get('company_name', '')
        self.company_website = kw.get('company_website', '')
        self.company_description = kw.get('company_description', '')
        self.services = kw.get('services', [])
        self.target_industries = kw.get('target_industries', '')


def web_seller(**kw):
    base = dict(company_name='Shailog Technologies', company_website='shailog.com',
                services=['web design', 'SEO', 'digital marketing'])
    base.update(kw)
    return Settings(**base)


def lead(company='', industry='', website='', description='', snippet=''):
    return {'company': company, 'industry': industry, 'website': website,
            'description': description, 'analysis': {'serp_snippet': snippet}}


def gifting_seller(**kw):
    base = dict(company_name='Shri Fragrance', company_website='shrifragrance.in',
                services=['Customized Corporate Gifting with Company Logos',
                          'Bulk Orders & Festive Gift Hampers',
                          'Employee Joining & Client Welcome Kits',
                          'Event Return Gifts & Souvenirs',
                          'Private Labeling & Custom Fragrance'])
    base.update(kw)
    return Settings(**base)


class GiftingVerticalTests(SimpleTestCase):
    """Shri Fragrance-style profile: corporate gifting / fragrance seller."""

    def test_vertical_detected_from_gifting_services(self):
        self.assertEqual(icp.vertical(gifting_seller()), 'corporate_gifting')

    def test_web_signals_do_not_shadow_gifting(self):
        # a gifting seller whose description mentions their website — still gifting
        s = gifting_seller(company_description='Order via our website shrifragrance.in')
        self.assertEqual(icp.vertical(s), 'corporate_gifting')

    def test_buyers_are_event_and_corporate_industries(self):
        buyers = icp.buyer_industries(gifting_seller())
        self.assertIn('event management company', buyers)
        self.assertIn('real estate builder', buyers)
        self.assertIn('IT company', buyers)
        for industry in buyers:
            self.assertFalse(icp.NEVER_SEARCH_INDUSTRIES.search(industry),
                             msg=f'{industry} is a web-agency term')
            for p in icp.GIFTING_COMPETITOR_PATTERNS:
                self.assertFalse(p.search(industry),
                                 msg=f'{industry} is a gifting competitor term')

    def test_gift_shops_and_fragrance_brands_are_competitors(self):
        s = gifting_seller()
        for name in ('Ferns N Petals Gifts', 'Giftsmatica Corporate Gifting',
                     'Aroma Attars & Fragrances', 'Diwali Hamper Hub',
                     'Sacred Souvenirs', 'Pooja Essentials Store',
                     'Scent & Serenity Candles'):
            self.assertTrue(icp.looks_like_competitor(lead(company=name), s),
                            msg=f'{name} is a gifting competitor')

    def test_corporate_buyers_are_not_flagged(self):
        s = gifting_seller()
        for name in ('Zenith Events Pvt Ltd', 'Skyline Constructions',
                     'TechNova IT Services', 'Grand Hyatt Residency',
                     'Kumar Wedding Planners', 'Aptech Coaching Center'):
            self.assertFalse(icp.looks_like_competitor(lead(company=name), s),
                             msg=f'{name} is a gifting buyer')

    def test_override_drops_gift_shop_terms(self):
        s = gifting_seller(target_industries='IT company, gift shop, wedding planner, perfume store')
        self.assertEqual(icp.buyer_industries(s), ['IT company', 'wedding planner'])

    def test_gift_mention_in_buyer_description_is_not_competitor(self):
        # an event company that hands out gifts at events is a BUYER
        s = gifting_seller()
        l = lead(company='Zenith Events', industry='event management company',
                 description='We organize corporate events and source gifts '
                             ' and hampers for attendees.')
        self.assertFalse(icp.looks_like_competitor(l, s))


class VerticalTests(SimpleTestCase):
    def test_empty_profile_defaults_to_web_seller(self):
        self.assertEqual(icp.vertical(Settings()), 'web_services')

    def test_web_seller_signals(self):
        for services in (['web design'], ['SEO'], ['digital marketing'],
                         ['shopify stores'], ['wordpress development'],
                         ['logo design', 'branding'], ['app development']):
            self.assertEqual(icp.vertical(Settings(services=services)), 'web_services',
                             msg=str(services))

    def test_generic_seller_is_not_web(self):
        s = Settings(company_name='Krishna Dairy Farm',
                     company_description='We sell organic milk and ghee',
                     services=['dairy products', 'home delivery'])
        self.assertEqual(icp.vertical(s), 'generic')

    def test_generic_vertical_only_rejects_same_name(self):
        s = Settings(company_name='Krishna Dairy Farm', services=['dairy products'])
        self.assertTrue(icp.looks_like_competitor(lead(company='Krishna Dairy Farm'), s))
        self.assertFalse(icp.looks_like_competitor(lead(company='Dental Clinic'), s))


class BuyerIndustryTests(SimpleTestCase):
    def test_default_list_has_no_agency_terms(self):
        for industry in icp.buyer_industries(web_seller()):
            self.assertFalse(icp.NEVER_SEARCH_INDUSTRIES.search(industry),
                             msg=f'{industry} is a peer/agency term')

    def test_default_list_is_substantial(self):
        self.assertGreaterEqual(len(icp.buyer_industries(web_seller())), 30)

    def test_user_override_is_used(self):
        s = web_seller(target_industries='dental clinic, gym, boutique hotel')
        self.assertEqual(icp.buyer_industries(s),
                         ['dental clinic', 'gym', 'boutique hotel'])

    def test_override_drops_agency_terms(self):
        s = web_seller(target_industries='dental clinic, web design agency, seo agency, gym')
        self.assertEqual(icp.buyer_industries(s), ['dental clinic', 'gym'])

    def test_override_of_only_agency_terms_falls_back_to_buyers(self):
        s = web_seller(target_industries='web design agency, digital marketing agency')
        self.assertEqual(icp.buyer_industries(s), icp.BUYER_INDUSTRIES)

    def test_override_handles_newlines_and_spaces(self):
        s = web_seller(target_industries=' dental clinic ,\ngym ,  spa  ')
        self.assertEqual(icp.buyer_industries(s), ['dental clinic', 'gym', 'spa'])


class CompetitorDetectionTests(SimpleTestCase):
    """The case the user reported: agencies must never enter the CRM."""

    AGENCIES = [
        ('Pixel Web Design Agency', ''),
        ('Weblance Web Development', ''),
        ('Mumbai SEO Experts', ''),
        ('DigiMark Digital Marketing', ''),
        ('Codecraft Software House', ''),
        ('TechFlow IT Consulting', ''),
        ('CreativeMind Branding Agency', ''),
        ('SocialPulse Social Media Agency', ''),
        ('AppFactory Mobile App Development', ''),
        ('HostIt Web Hosting', ''),
        ('UX Studio — ui/ux design', ''),
        ('GrowthHacks Performance Marketing', ''),
        ('LeadX Lead Generation', ''),
        ('CloudSoft — SaaS & CRM solutions', ''),
        ('PixelPerfect Graphic Design Studio', ''),
        ('WordPress Wizards', ''),
        ('Shopify Partner Studio', ''),
        ('NoCode Automation Agency', ''),
        ('AdSpend PPC Agency', ''),
        ('WebWorks webstudio', ''),
    ]

    def test_every_agency_pattern_is_caught(self):
        s = web_seller()
        for name, _ in self.AGENCIES:
            self.assertTrue(icp.looks_like_competitor(lead(company=name), s),
                            msg=f'{name} should be flagged as a competitor')

    def test_agency_industry_tag_is_caught_even_with_clean_name(self):
        s = web_seller()
        for industry in ('web design agency', 'digital marketing agency',
                         'SEO', 'IT consulting firm', 'SaaS startup',
                         'software development', 'marketing agency'):
            self.assertTrue(
                icp.looks_like_competitor(lead(company='Some Company Pty Ltd',
                                               industry=industry), s),
                msg=f'industry "{industry}" should flag the lead')

    def test_buyers_are_never_flagged(self):
        s = web_seller()
        for name in ('Smile Dental Clinic', 'Grand Boutique Hotel', 'FitZone Gym',
                     'Apex Construction Pvt Ltd', 'RG Architects', 'Mazaya Spa',
                     'Kumar Law Associates', 'Sunrise Bakery', 'CityPharma',
                     'Niwara Gym by V3 Fitness', 'The Iron Gym', 'P9 Fitness & Gym'):
            self.assertFalse(icp.looks_like_competitor(lead(company=name), s),
                             msg=f'{name} is a buyer, not a competitor')

    def test_buyer_industry_tags_are_never_flagged(self):
        s = web_seller()
        for industry in icp.BUYER_INDUSTRIES:
            self.assertFalse(
                icp.looks_like_competitor(lead(company='Some Local Business',
                                               industry=industry), s),
                msg=f'buyer industry "{industry}" must not flag')

    def test_single_marketing_mention_in_description_is_not_a_competitor(self):
        # the false-positive trap: a clinic whose site text mentions 'SEO' once
        s = web_seller()
        l = lead(company='Smile Dental Clinic', industry='dental clinic',
                 website='smiledental.in',
                 description='Dental implants and cleaning. Our site ranks well '
                             'thanks to good SEO.')
        self.assertFalse(icp.looks_like_competitor(l, s))

    def test_two_distinct_signals_in_description_flag(self):
        s = web_seller()
        l = lead(company='Dentco', industry='dental clinic',
                 description='We provide dental care. We also offer digital '
                             'marketing and SEO services for clinics nationwide.')
        self.assertTrue(icp.looks_like_competitor(l, s))

    def test_serp_snippet_counts_as_free_text_signal(self):
        s = web_seller()
        l = lead(company='Dentco', industry='dental clinic',
                 description='Web development for dentists is our specialty.',
                 snippet='Full-service digital marketing and SEO company.')
        self.assertTrue(icp.looks_like_competitor(l, s))

    def test_our_own_company_and_website_are_rejected(self):
        s = web_seller()
        self.assertTrue(icp.looks_like_competitor(
            lead(company='Shailog Technologies', website='shailog.com'), s))
        self.assertTrue(icp.looks_like_competitor(
            lead(company='Something Else', website='https://www.shailog.com/about'), s))

    def test_empty_lead_is_safe(self):
        s = web_seller()
        self.assertFalse(icp.looks_like_competitor(lead(), s))

    def test_services_text_fallback(self):
        self.assertIn('web', icp.our_services_text(web_seller()))
        empty = Settings()
        # empty profile still names the default seller offering
        self.assertTrue(icp.our_services_text(empty))
