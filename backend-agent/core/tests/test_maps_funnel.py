from unittest import mock

from django.test import SimpleTestCase

from core import maps_funnel as mf


def P(name, site, category='Real estate agency', phone='+971 4 1'):
    return {'name': name, 'website': site, 'category': category, 'phone': phone, 'address': 'Dubai'}


class NlpPrefilterTests(SimpleTestCase):
    def test_keeps_property_businesses(self):
        kept = mf.nlp_prefilter([P('Strada Real Estate Brokerage', 'https://stradauae.com/')])
        self.assertEqual(len(kept), 1)

    def test_drops_listicles_portals_and_unrelated(self):
        places = [
            P('Dubai Developers: List of Real Estate Developers', 'https://x.ae/', 'Real estate'),
            P('Top 10 Best Real Estate Agencies', 'https://blog.ae/', 'Real estate'),
            P('Bayut', 'https://www.bayut.com/', 'Real estate'),
            P('Dubai Web Design Agency', 'https://web.ae/', 'Web designer'),
            P('Al Noor Clinic', 'https://clinic.ae/', 'Medical clinic'),
            P('Gulf Bakery', 'https://bakery.ae/', 'Bakery'),
        ]
        self.assertEqual(mf.nlp_prefilter(places), [])

    def test_dedupes_by_domain(self):
        places = [P('A Realty', 'https://a.ae/'), P('A Realty Branch', 'https://www.a.ae/contact')]
        self.assertEqual(len(mf.nlp_prefilter(places)), 1)


class AiFitBatchTests(SimpleTestCase):
    def test_parses_fit_and_not_fit_lines(self):
        places = [P('One', 'https://one.ae/'), P('Two', 'https://two.ae/')]
        reply = '1: FIT - real estate brokerage\n2: NOT_FIT - web design agency'
        with mock.patch.object(mf, 'llm_available', return_value=True), \
                mock.patch.object(mf, 'llm_complete', return_value=reply):
            out = mf.ai_fit_batch(places, goal='g')
        self.assertEqual([(p['name'], fit) for p, fit in out], [('One', True), ('Two', False)])

    def test_unanswered_batch_admits_nobody(self):
        places = [P('One', 'https://one.ae/')]
        with mock.patch.object(mf, 'llm_available', return_value=True), \
                mock.patch.object(mf, 'llm_complete', return_value=None):
            self.assertEqual(mf.ai_fit_batch(places, goal='g'), [])

    def test_no_ai_key_passes_nlp_survivors(self):
        places = [P('One', 'https://one.ae/')]
        with mock.patch.object(mf, 'llm_available', return_value=False):
            self.assertEqual([fit for _, fit in mf.ai_fit_batch(places, goal='g')], [True])
