"""POST /api/company/scrape — signup's "Fetch details" helper.

The endpoint fetches the user's own homepage once and returns the brand
name + a short description so signup can prefill the company profile.
Every test mocks the network (DNS + HTTP): nothing ever leaves the
machine, and the SSRF cases pin exactly the addresses the guard refuses.
"""

from unittest import mock

import requests as requests_lib
from bs4 import BeautifulSoup
from django.core.cache import cache
from django.test import SimpleTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import User
from core.tests.base import TenantTestCase
from core.throttles import CompanyScrapeThrottle

# getaddrinfo payload shape for a PUBLIC host (family, type, proto, canon, sockaddr)
PUBLIC_DNS = [(2, 1, 6, '', ('93.184.216.34', 443))]
PRIVATE_DNS = [(2, 1, 6, '', ('10.0.0.7', 80))]

PAGE = """
<html><head>
  <meta property="og:site_name" content="Acme Rockets">
  <meta name="description" content="We build small rockets for campus teams.">
  <title>Acme Rockets | Home</title>
</head><body>
  <nav>Home Shop About</nav>
  <p>Acme Rockets designs and builds low-cost sounding rockets for
  university teams, with kits, launch support and a two-week turnaround
  on custom parts from our workshop in Pune.</p>
</body></html>
"""

NO_META_PAGE = """
<html><head><title>Bright Dental Clinic</title></head><body>
  <p>Gentle family dentistry in Salem since 2009. Cleanings, braces and
  implants with same-day appointments and transparent pricing for every
  treatment we offer in the clinic.</p>
</body></html>
"""


def resp(html='', status=200, url='https://acme.example/'):
    r = requests_lib.Response()
    r.status_code = status
    r.url = url
    r.encoding = 'utf-8'
    r._content = html.encode()
    return r


class CompanyScrapeTests(TenantTestCase):
    def setUp(self):
        cache.clear()  # throttle history must not leak between tests
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def call(self, url, **over):
        return self.client.post('/api/company/scrape/', {'url': url, **over}, format='json')

    # -- auth + throttle ---------------------------------------------------

    def test_anonymous_refused_owner_lockdown(self):
        """Owner order: anonymous scraping DISABLED — signup autofill is off,
        the endpoint serves signed-in accounts only."""
        r = self.client.post('/api/company/scrape/', {'url': 'https://x.test'}, format='json')
        self.assertIn(r.status_code, (401, 422))  # 401 no-creds; 422 read-only GET shape


    def test_authenticated_hits_the_scoped_throttle(self):
        """Per-IP throttle still guards the endpoint for signed-in callers."""
        from rest_framework.authtoken.models import Token
        from billing.tests.test_entitlements import make_ws
        from core.models import User
        ws = make_ws('scrape-co')
        u = User.objects.create_user('scrape-owner', password='pw123456', workspace=ws, role='owner')
        tok = Token.objects.create(user=u).key
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
            mock.patch('core.company_scrape.requests.get', return_value=resp(PAGE)):
            first = self.client.post('/api/company/scrape/', {'url': 'https://a.test'}, format='json',
                                     HTTP_AUTHORIZATION=f'Token {tok}')
            self.assertEqual(first.status_code, 200, first.content)
            for i in range(12):
                r = self.client.post('/api/company/scrape/', {'url': f'https://{i}.test'}, format='json',
                                     HTTP_AUTHORIZATION=f'Token {tok}')
                if r.status_code == 429:
                    self.assertIn('throttled', str(r.content))
                    return
        self.fail('throttle never engaged')


    def test_returns_name_from_og_site_name_and_description(self):
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get', return_value=resp(PAGE)):
            r = self.call('acme.example')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['name'], 'Acme Rockets')
        self.assertEqual(data['description'], 'We build small rockets for campus teams.')
        self.assertLessEqual(len(data['description']), 300)

    def test_title_fallback_and_text_excerpt_when_no_meta(self):
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get',
                           return_value=resp(NO_META_PAGE, url='https://bright.example/')):
            r = self.call('https://bright.example/')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['name'], 'Bright Dental Clinic')
        self.assertTrue(data['description'].startswith('Gentle family dentistry'), data['description'])
        self.assertLessEqual(len(data['description']), 300)

    def test_generic_title_falls_back_to_domain_name(self):
        page = '<html><head><title>Home</title></head><body><p>Content here.</p></body></html>'
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get',
                           return_value=resp(page, url='https://www.mabya.example/')):
            r = self.call('https://www.mabya.example/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['name'], 'Mabya')

    # -- redirect handling ----------------------------------------------

    def test_follows_public_redirect(self):
        first = resp(status=301, url='https://acme.example/')
        first.headers['Location'] = 'https://www.acme.example/home'
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get',
                           side_effect=[first, resp(PAGE, url='https://www.acme.example/home')]):
            r = self.call('https://acme.example/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['name'], 'Acme Rockets')

    def test_redirect_to_private_address_is_422(self):
        first = resp(status=302, url='https://acme.example/')
        first.headers['Location'] = 'http://127.0.0.2/pivot'
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get', return_value=first) as get:
            r = self.call('https://acme.example/')
        self.assertEqual(r.status_code, 422, r.content)
        self.assertIn('detail', r.json())
        self.assertEqual(get.call_count, 1)  # the private hop was never fetched

    # -- SSRF guard ------------------------------------------------------

    def test_private_ip_literals_are_422_without_any_fetch(self):
        for url in ('http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.0.9/',
                    'http://169.254.169.254/', 'http://[::1]/'):
            with self.subTest(url=url), \
                    mock.patch('core.company_scrape.requests.get',
                               side_effect=AssertionError('must not fetch')) as get:
                r = self.call(url)
                self.assertEqual(r.status_code, 422, f'{url}: {r.content}')
                self.assertIn('detail', r.json())
                get.assert_not_called()

    def test_hostname_resolving_to_private_ip_is_422(self):
        with mock.patch('socket.getaddrinfo', return_value=PRIVATE_DNS), \
                mock.patch('core.company_scrape.requests.get',
                           side_effect=AssertionError('must not fetch')) as get:
            r = self.call('http://intranet.corp/')
        self.assertEqual(r.status_code, 422, r.content)
        get.assert_not_called()

    # -- bad input, unreachable sites ------------------------------------

    def test_invalid_urls_are_422(self):
        for url in ('', 'not a url', 'ftp://acme.example/'):
            with self.subTest(url=url):
                r = self.call(url)
                self.assertEqual(r.status_code, 422, f'{url!r}: {r.content}')
                self.assertIn('detail', r.json())

    def test_unreachable_site_is_422(self):
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get',
                           side_effect=requests_lib.ConnectionError('no route')):
            r = self.call('https://acme.example/')
        self.assertEqual(r.status_code, 422, r.content)
        self.assertIn('detail', r.json())

    def test_http_error_status_is_422(self):
        with mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS), \
                mock.patch('core.company_scrape.requests.get', return_value=resp(status=404)):
            r = self.call('https://acme.example/')
        self.assertEqual(r.status_code, 422, r.content)
        self.assertIn('detail', r.json())


ABOUT_PAGE = """
<html><head><title>About us</title></head><body>
  <nav>Home About Journals Contact</nav>
  <h2>Contact Us</h2>
  <p>Email</p><p>editor@example-journal.org</p>
  <p>Mobile</p><p>+91 8300169682</p>
  <p>Website</p><p>www.example-journal.org</p>
  <p>Address</p>
  <p>158, E Block, TNHB, Green Park Avenue, Omalur Main Road, Perumanur, Salem, Tamil Nadu, India</p>
  <h3>Ready to publish your research?</h3>
  <p>Join a growing community of researchers.</p>
</body></html>
"""

ADDRESS = '158, E Block, TNHB, Green Park Avenue, Omalur Main Road, Perumanur, Salem, Tamil Nadu, India'


class AddressExtractionTests(SimpleTestCase):
    """Where a business prints its postal address. The owner's own site puts
    it on /about under an 'Address' label with NO PIN code — and the old
    reader demanded a PIN code and looked at each page as one long line, so
    long pages and un-coded addresses never matched."""

    def test_address_line_without_a_pin_code(self):
        from core.company_scrape import looks_like_address
        self.assertTrue(looks_like_address(ADDRESS))
        self.assertTrue(looks_like_address('490 Anna Salai, Chennai 600002, Tamil Nadu'))
        self.assertTrue(looks_like_address('12 Workshop Road, Pune, Maharashtra, India'))

    def test_ordinary_sentences_are_not_addresses(self):
        from core.company_scrape import looks_like_address
        for line in ('Contact Us', 'Email editor@example-journal.org', 'Mobile +91 8300169682',
                     'Website www.example-journal.org', 'Ready to publish your research?',
                     'We are located near the main road bus stop in Salem town',
                     'Call us at +91 98765 43210 for door-step service',
                     'Copyright 2026 | Privacy Policy | Terms'):
            self.assertFalse(looks_like_address(line), line)

    def test_label_then_address_on_the_next_line(self):
        from core.company_scrape import address_in_text
        self.assertEqual(address_in_text(ABOUT_PAGE), ADDRESS)

    def test_label_and_address_on_one_line(self):
        from core.company_scrape import address_in_text
        html = ('<html><body><footer>Address: 12 Workshop Road, Pune, Maharashtra, India '
                'Phone: +91 90000 00000 Email: hello@example.org</footer></body></html>')
        self.assertEqual(address_in_text(html), '12 Workshop Road, Pune, Maharashtra, India')

    def test_footer_address_on_a_long_page(self):
        """Regression: the page used to be read as ONE line, so the footer of
        any real-sized page was too 'long' to be an address."""
        from core.company_scrape import address_in_text
        filler = ''.join(f'<p>Paragraph number {i} about our journal and its editorial board.</p>'
                         for i in range(80))
        html = (f'<html><body>{filler}<footer>© 2026 Example Journal · '
                '490 Anna Salai, Chennai 600002, Tamil Nadu, India</footer></body></html>')
        self.assertGreater(len(filler), 3000)
        self.assertEqual(address_in_text(html), '490 Anna Salai, Chennai 600002, Tamil Nadu, India')

    def test_page_without_an_address(self):
        from core.company_scrape import address_in_text
        self.assertEqual(address_in_text(PAGE), '')
        self.assertEqual(address_in_text('<html><body><p>Nothing here. Our address is on request.</p></body></html>'), '')

    def test_long_sentences_with_commas_are_not_addresses(self):
        """Seen on a real site: a course blurb was taken for the address."""
        from core.company_scrape import looks_like_address
        self.assertFalse(looks_like_address(
            'CSS for styling the web — layout, flexbox, grid and responsive design. Taught step by step'))
        self.assertFalse(looks_like_address(
            'Founded in 2010, we work with startups, small shops, schools and clinics across India'))
        self.assertTrue(looks_like_address(ADDRESS))        # the real one still passes

    def test_garbled_text_is_never_an_address(self):
        """Seen on a real site: a stray data block read '250008, ChÃ­a'."""
        from core.company_scrape import looks_like_address, _jsonld_address
        self.assertFalse(looks_like_address('2500008, ChÃ­a, Cundinamarca'))
        html = ('<html><head><script type="application/ld+json">{"@type":"Organization",'
                '"address":{"streetAddress":"Av. 9 No. 5", "addressLocality":"ChÃ­a"}}'
                '</script></head><body><p>Hola</p></body></html>')
        self.assertEqual(_jsonld_address(BeautifulSoup(html, 'lxml')), '')

    def test_structured_town_only_loses_to_a_printed_street_address(self):
        """A town alone in the structured data ('Salem, Tamil Nadu, IN') must
        not shadow a full address the page prints."""
        from core.company_scrape import company_details
        html = ('<html><head><script type="application/ld+json">{"@type":"Organization",'
                '"address":{"addressLocality":"Pleasanton","addressCountry":"US"}}'
                '</script></head><body><p>Welcome to Acme, makers of fine software for teams.</p>'
                '<footer>Acme Inc · 4950 Hopyard Road, Pleasanton, CA 94588 · Privacy</footer>'
                '</body></html>')
        with mock.patch('core.company_scrape._scrape_address_from_contact_pages', return_value=''):
            found = company_details(html, 'https://acme.example/')
        self.assertEqual(found['address'], '4950 Hopyard Road, Pleasanton, CA 94588')

    def test_town_only_structured_address_is_still_an_answer(self):
        """Nothing printed on the page, but the site declares its town — that
        is better than an empty address box."""
        from core.company_scrape import company_details
        html = ('<html><head><script type="application/ld+json">{"@type":"Organization",'
                '"address":{"addressLocality":"Salem","addressRegion":"Tamil Nadu",'
                '"addressCountry":"IN"}}</script></head>'
                '<body><p>We build software for ambitious teams everywhere.</p></body></html>')
        with mock.patch('core.company_scrape._scrape_address_from_contact_pages', return_value=''):
            self.assertEqual(company_details(html, 'https://acme.example/')['address'],
                             'Salem, Tamil Nadu, IN')

    def test_contact_page_fetches_are_short(self):
        """Four contact paths must not hold the request for 4 × 6 seconds."""
        from core import company_scrape as cs
        seen = []
        with mock.patch.object(cs, 'fetch_public',
                               side_effect=lambda url, **kw: (seen.append(kw), resp(status=404))[1]):
            cs._scrape_address_from_contact_pages('https://slow.example/')
        self.assertTrue(seen)
        self.assertTrue(all(0 < kw['budget'] <= 3 for kw in seen), seen)

    def test_services_come_from_structured_data_not_headings(self):
        """Headings are mostly marketing lines ('What a website-gap audit looks
        like') — on real sites they made a wrong 'what you sell'. The model
        reads the page for that; here only explicit offers count."""
        from core.company_scrape import company_details
        html = ('<html><head><title>WarmPulse</title></head><body>'
                '<h2>What a website-gap audit looks like</h2>'
                '<h2>Example Dental Clinic, Chennai</h2><h3>Safe by design</h3>'
                '</body></html>')
        with mock.patch('core.company_scrape._scrape_address_from_contact_pages', return_value=''):
            self.assertEqual(company_details(html, 'https://wp.example/')['services'], [])
        html = ('<html><head><script type="application/ld+json">{"@type":"ProfessionalService",'
                '"makesOffer":[{"itemOffered":{"name":"Cold email warmup"}}]}</script></head>'
                '<body><p>x</p></body></html>')
        with mock.patch('core.company_scrape._scrape_address_from_contact_pages', return_value=''):
            self.assertEqual(company_details(html, 'https://wp.example/')['services'], ['Cold email warmup'])

    def test_contact_pages_are_tried_and_the_search_is_bounded(self):
        """Homepage without an address → /about is read. A site that answers
        404 everywhere must not hold the request for 8 slow round-trips."""
        from core import company_scrape as cs
        calls = []

        def fake_get(url, **_kw):
            calls.append(url)
            if url.endswith('/about'):
                return resp(ABOUT_PAGE)
            return resp(status=404)

        with mock.patch('core.company_scrape.requests.get', side_effect=fake_get),                 mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS):
            found = cs._scrape_address_from_contact_pages('https://journal.example/')
        self.assertEqual(found, ADDRESS)
        self.assertLessEqual(len(calls), len(cs.CONTACT_PATHS))

        calls.clear()

        def all_missing(url, **_kw):
            calls.append(url)
            return resp(status=404)

        with mock.patch('core.company_scrape.requests.get', side_effect=all_missing),                 mock.patch('socket.getaddrinfo', return_value=PUBLIC_DNS):
            self.assertEqual(cs._scrape_address_from_contact_pages('https://gone.example/'), '')
        self.assertLessEqual(len(calls), 4, calls)   # gives up after a few misses
