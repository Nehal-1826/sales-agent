"""POST /api/company/scrape — signup's "Fetch details" helper.

The endpoint fetches the user's own homepage once and returns the brand
name + a short description so signup can prefill the company profile.
Every test mocks the network (DNS + HTTP): nothing ever leaves the
machine, and the SSRF cases pin exactly the addresses the guard refuses.
"""

from unittest import mock

import requests as requests_lib
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import User
from core.tests.base import TenantTestCase

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
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def call(self, url, **over):
        return self.client.post('/api/company/scrape/', {'url': url, **over}, format='json')

    # -- auth -----------------------------------------------------------

    def test_anonymous_is_401(self):
        anon = APIClient()
        r = anon.post('/api/company/scrape/', {'url': 'https://acme.example/'}, format='json')
        self.assertEqual(r.status_code, 401)

    # -- happy path -----------------------------------------------------

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
