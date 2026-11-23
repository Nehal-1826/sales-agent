"""POST /api/company/infer — Settings → Fetch, step 2: the local model reads
the site and says what the company sells and who buys from it.

The reading itself is core.business_profile (tested there); these pin the
endpoint: who may call it, how it fails, and that it only ANSWERS — the
browser applies the result through the normal Settings save, so nothing is
written behind the user's back.
"""

from unittest import mock

from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import AppSettings, User
from core.tests.base import TenantTestCase

PROFILE = {
    'domain': 'acme.example', 'name': 'Acme Rockets',
    'description': 'Low-cost sounding rockets for campus teams.',
    'address': '12 Workshop Road, Pune 411001',
    'services': ['Sounding rocket kits', 'Launch support'],
    'customer_type': 'organisations',
    'target_industries': ['university', 'research institute'],
    'target_countries': [], 'target_cities': [],
    'icp_notes': 'University rocket teams with a budget.',
    'inferred': True,
}


class CompanyInferTests(TenantTestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # throttle history must not leak between tests
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def call(self, url):
        return self.client.post('/api/company/infer/', {'url': url}, format='json')

    def test_anonymous_is_refused(self):
        self.assertIn(APIClient().post('/api/company/infer/', {'url': 'x.test'}, format='json').status_code,
                      (401, 403))

    def test_returns_the_reading_in_the_browsers_naming(self):
        with mock.patch('core.company_infer.profile_from_domain',
                        return_value=dict(PROFILE)) as read:
            r = self.call('acme.example')
        self.assertEqual(r.status_code, 200, r.content)
        read.assert_called_once_with('acme.example')
        self.assertEqual(r.json(), {
            'domain': 'acme.example', 'name': 'Acme Rockets',
            'description': 'Low-cost sounding rockets for campus teams.',
            'address': '12 Workshop Road, Pune 411001',
            'services': ['Sounding rocket kits', 'Launch support'],
            'customerType': 'organisations',
            'targetIndustries': ['university', 'research institute'],
            'targetCountries': [],
            'icpNotes': 'University rocket teams with a budget.',
            'inferred': True,
        })

    def test_page_facts_without_a_model_reading_are_still_an_answer(self):
        with mock.patch('core.company_infer.profile_from_domain', return_value=dict(
                PROFILE, services=['Kits'], customer_type='', target_industries=[],
                icp_notes='', inferred=False)):
            r = self.call('acme.example')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()['inferred'])
        self.assertEqual(r.json()['targetIndustries'], [])

    def test_it_only_answers_nothing_is_saved(self):
        before = AppSettings.load()
        before = (before.company_name, before.services, before.target_industries, before.icp_notes)
        with mock.patch('core.company_infer.profile_from_domain', return_value=dict(PROFILE)):
            self.assertEqual(self.call('acme.example').status_code, 200)
        after = AppSettings.load()
        self.assertEqual((after.company_name, after.services, after.target_industries, after.icp_notes),
                         before)

    def test_unreadable_site_is_422_with_the_reason(self):
        from core.company_scrape import BadUrl
        with mock.patch('core.company_infer.profile_from_domain',
                        side_effect=BadUrl('That website answered HTTP 403.')):
            r = self.call('dead-site.example')
        self.assertEqual(r.status_code, 422)
        self.assertIn('HTTP 403', r.json()['detail'])

    def test_missing_url_is_422(self):
        self.assertEqual(self.client.post('/api/company/infer/', {}, format='json').status_code, 422)

    def test_a_member_cannot_spend_the_model(self):
        """Reading a site costs ~a minute of the shared model; only the
        people allowed to change the setup may ask for it."""
        member = User.objects.create_user(username='infer-member', password='pw123456', role='member')
        tok = Token.objects.create(user=member).key
        # a fresh client: self.client carries the owner's credentials, which
        # DRF applies over any per-request header
        r = APIClient().post('/api/company/infer/', {'url': 'acme.example'}, format='json',
                             HTTP_AUTHORIZATION=f'Token {tok}')
        self.assertEqual(r.status_code, 403)

    def test_each_call_is_throttled_per_user(self):
        with mock.patch('core.company_infer.profile_from_domain', return_value=dict(PROFILE)):
            for _ in range(5):
                self.assertEqual(self.call('acme.example').status_code, 200)
            r = self.call('acme.example')
        self.assertEqual(r.status_code, 429)
        self.assertIn('throttled', str(r.content))


class TargetingNotesTests(TenantTestCase):
    """Settings → Who to find carries the model's one-line 'ideal customer'
    too (icp_notes steers lead vetting and every email)."""

    def test_notes_round_trip_through_the_settings_api(self):
        user = User.objects.create_user(username='owner', password='pw123456', role=User.Roles.OWNER)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        r = client.put('/api/settings/', {'targeting': {
            'industries': ['university', 'research institute'], 'countries': [], 'cities': [],
            'icpMode': 'buyer', 'notes': 'University rocket teams with a budget.',
        }}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        targeting = client.get('/api/settings/').json()['targeting']
        self.assertEqual(targeting['industries'], ['university', 'research institute'])
        self.assertEqual(targeting['notes'], 'University rocket teams with a budget.')
        self.assertEqual(AppSettings.load().icp_notes, 'University rocket teams with a budget.')
