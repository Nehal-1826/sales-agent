"""Offline tests for the Google Maps scraper plumbing (core.gmaps).

No network: the tbm=map JSON layout is reproduced synthetically, exactly as
the reference scrapers document it (data[0][1][i] → entry, entry[14] → the
business record).  Malformed/missing fields degrade to '' — never a crash.
"""

import json

from django.test import SimpleTestCase

from core import gmaps


def make_item(name, phone='', website='', address_parts=None, rating=None,
              reviews=None, category=None):
    """Build one tbm=map business record (entry[14]) with the documented
    slots: 11 name, 7 website, 2 address parts, 4 rating/reviews, 13 category,
    178 phone."""
    b = [None] * 190
    b[11] = name
    if website:
        b[7] = [website]
    b[2] = list(address_parts or [])
    if rating is not None or reviews is not None:
        r = [None] * 12
        if rating is not None:
            r[7] = rating
        if reviews is not None:
            r[8] = reviews
        b[4] = r
    if category:
        b[13] = [category]
    if phone:
        b[178] = [[phone]]          # real layout: phone at business[178][0][0]
    return b


def make_body(items):
    """Full response: junk first line, then data[0][1] = [header, entries…]."""
    entries = [[None] * 20 for _ in items]        # outer wrappers (entry[14] used)
    for wrapper, business in zip(entries, items):
        wrapper[14] = business
    return 'while(1);\n' + json.dumps([[None, [None] + entries]])


class ParseTests(SimpleTestCase):
    def test_full_record_roundtrip(self):
        body = make_body([make_item(
            'Smile Dental Clinic', phone='+91 98765 43210',
            website='https://smiledental.in/contact?utm_source=google',
            address_parts=['12 MG Road', 'Bengaluru', 'Karnataka'],
            rating=4.7, reviews=212, category='Dental clinic')])
        places = gmaps._parse_places(body)
        self.assertEqual(len(places), 1)
        p = places[0]
        self.assertEqual(p['name'], 'Smile Dental Clinic')
        self.assertEqual(p['phone'], '+91 98765 43210')
        # UTM garbage stripped — domain matching in enrichment depends on it
        self.assertEqual(p['website'], 'https://smiledental.in/contact')
        self.assertEqual(p['rating'], 4.7)
        self.assertEqual(p['reviews'], 212)
        self.assertEqual(p['category'], 'Dental clinic')
        self.assertIn('12 MG Road', p['address'])

    def test_missing_fields_degrade_to_empty(self):
        body = make_body([make_item('Anon Gym')])
        p = gmaps._parse_places(body)[0]
        self.assertEqual((p['phone'], p['website'], p['address'],
                          p['rating'], p['category']), ('', '', '', None, ''))

    def test_junk_names_are_skipped(self):
        body = make_body([make_item(''), make_item('x'),
                          make_item('A' * 120), make_item('Real Business')])
        names = [p['name'] for p in gmaps._parse_places(body)]
        self.assertEqual(names, ['Real Business'])

    def test_duplicates_are_deduped(self):
        body = make_body([make_item('Iron Gym', phone='111'),
                          make_item('Iron Gym', phone='222')])
        self.assertEqual(len(gmaps._parse_places(body)), 1)

    def test_malformed_body_raises_and_caller_returns_empty(self):
        # gmaps_search would return [] — assert the parse guard directly
        with self.assertRaises((ValueError, IndexError, TypeError)):
            gmaps._parse_places('this is not json at all')
        with self.assertRaises((ValueError, IndexError, TypeError)):
            gmaps._parse_places('[]')          # empty top array
        with self.assertRaises((ValueError, IndexError, TypeError)):
            gmaps._parse_places(json.dumps([[[None]]]))  # container without items


class WebsiteClassificationTests(SimpleTestCase):
    def test_social_only_listing_counts_as_no_website(self):
        for social in ('https://www.facebook.com/fitzone',
                       'https://instagram.com/fitzone',
                       'https://wa.me/919876543210',
                       'https://linktr.ee/fitzone',
                       'https://business.site/fitzone'):
            self.assertFalse(gmaps.has_real_website({'website': social}), msg=social)

    def test_real_websites_count(self):
        for real in ('https://fitzone.in', 'http://www.irongym.co.uk/pricing',
                     'https://www.mysmiledentalclinic.com/'):
            self.assertTrue(gmaps.has_real_website({'website': real}), msg=real)

    def test_no_website_at_all(self):
        self.assertFalse(gmaps.has_real_website({'website': ''}))
        self.assertFalse(gmaps.has_real_website({}))


class ViewportTests(SimpleTestCase):
    def test_indian_metro_resolution(self):
        lat, lon, zoom = gmaps._viewport_for('dental clinic in Mumbai, India')
        self.assertAlmostEqual(lat, 19.0760, places=2)
        self.assertAlmostEqual(lon, 72.8777, places=2)
        self.assertEqual(zoom, 12)

    def test_country_resolution(self):
        lat, lon, zoom = gmaps._viewport_for('dental clinic in Germany')
        self.assertEqual(zoom, 6)

    def test_state_suffix_resolution(self):
        # 'Chennai' also appears inside the city table with the state attached
        lat, lon, zoom = gmaps._viewport_for('spa in Chennai, Tamil Nadu')
        self.assertEqual(zoom, 12)

    def test_unknown_region_falls_back_to_world(self):
        self.assertEqual(gmaps._viewport_for('gym in Reykjavik'),
                         gmaps.WORLD_FALLBACK)

    def test_country_word_inside_longer_region_still_resolves(self):
        # 'New Zealand' contains 'new' but must resolve as a whole city entry
        lat, lon, zoom = gmaps._viewport_for('restaurant in Auckland')
        self.assertEqual(zoom, 12)


class NormTests(SimpleTestCase):
    def test_domain_normalization(self):
        cases = {
            'https://www.fitzone.in/pricing': 'fitzone.in',
            'http://fitzone.in': 'fitzone.in',
            'www.fitzone.in': 'fitzone.in',
            'fitzone.in/contact': 'fitzone.in',
            '': '',
        }
        for raw, expected in cases.items():
            self.assertEqual(gmaps._norm(raw), expected, msg=raw)
