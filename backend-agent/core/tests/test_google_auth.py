"""Google OAuth sign-in — existing users only, two-door split respected.

The Google side (consent + token + userinfo) is mocked; what we test is OUR
flow: start config gate, CSRF state, one-time code exchange, user matching
and the admin-door refusal."""
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import google_auth
from core.models import User
from billing.tests.test_entitlements import make_ws


def setUpModule():   # clean cache between modules
    cache.clear()


class GoogleFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ws = make_ws('goog-co')
        self.user = User.objects.create_user(
            'goog-owner', password='pw123456', email='Owner@Example.com',
            role='owner', workspace=self.ws)
        self.admin = User.objects.create_superuser(
            'goog-admin', password='pw123456', email='admin@warmpulse.tech')
        User.objects.filter(pk=self.admin.pk).update(workspace=None)

    def test_start_unconfigured_is_503(self):
        r = self.client.get('/api/auth/google/start/')
        self.assertEqual(r.status_code, 503)

    @override_settings()
    def test_full_flow_existing_user_gets_token(self):
        with mock.patch.dict('os.environ', {'GOOGLE_CLIENT_ID': 'cid', 'GOOGLE_CLIENT_SECRET': 'sec',
                                            'PUBLIC_BASE_URL': 'https://x.test'}):
            # start mints a state
            r = self.client.get('/api/auth/google/start/')
            self.assertIn(r.status_code, (301, 302))
            self.assertIn('accounts.google.com', r['Location'])
            state = r['Location'].split('state=')[1].split('&')[0]

            # callback: mocked exchange → userinfo (verified email, mixed case)
            token_json = {'access_token': 'at'}
            profile = {'email': 'owner@example.com', 'email_verified': True}
            with mock.patch.object(google_auth.requests, 'post',
                                   return_value=mock.Mock(**{'status_code': 200, 'json.return_value': token_json})), \
                 mock.patch.object(google_auth.requests, 'get',
                                   return_value=mock.Mock(**{'status_code': 200, 'json.return_value': profile})):
                r = self.client.get(f'/api/auth/google/callback/?code=c&state={state}')
            self.assertIn(r.status_code, (301, 302))
            gcode = r['Location'].split('gcode=')[1]
            # the one-time code exchanges exactly once for a DRF token
            ex = self.client.post('/api/auth/google/exchange/', {'code': gcode}, format='json')
            self.assertEqual(ex.status_code, 200, ex.content)
            self.assertTrue(Token.objects.filter(user=self.user).exists())
            self.assertEqual(ex.json()['user']['username'], 'goog-owner')
            # second use of the same code is dead
            again = self.client.post('/api/auth/google/exchange/', {'code': gcode}, format='json')
            self.assertEqual(again.status_code, 400)

    def test_unknown_email_is_not_found(self):
        cache.set('google-oauth:state:s1', True, 60)
        with mock.patch.dict('os.environ', {'GOOGLE_CLIENT_ID': 'cid', 'GOOGLE_CLIENT_SECRET': 'sec',
                                            'PUBLIC_BASE_URL': 'https://x.test'}):
            profile = {'email': 'nobody@example.com', 'email_verified': True}
            with mock.patch.object(google_auth.requests, 'post',
                                   return_value=mock.Mock(**{'status_code': 200, 'json.return_value': {'access_token': 'at'}})), \
                 mock.patch.object(google_auth.requests, 'get',
                                   return_value=mock.Mock(**{'status_code': 200, 'json.return_value': profile})):
                r = self.client.get('/api/auth/google/callback/?code=c&state=s1')
            self.assertIn('google=not_found', r['Location'])
            self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_platform_admin_refused_on_this_door(self):
        cache.set('google-oauth:state:s2', True, 60)
        with mock.patch.dict('os.environ', {'GOOGLE_CLIENT_ID': 'cid', 'GOOGLE_CLIENT_SECRET': 'sec',
                                            'PUBLIC_BASE_URL': 'https://x.test'}):
            profile = {'email': 'admin@warmpulse.tech', 'email_verified': True}
            with mock.patch.object(google_auth.requests, 'post',
                                   return_value=mock.Mock(**{'status_code': 200, 'json.return_value': {'access_token': 'at'}})), \
                 mock.patch.object(google_auth.requests, 'get',
                                   return_value=mock.Mock(**{'status_code': 200, 'json.return_value': profile})):
                r = self.client.get('/api/auth/google/callback/?code=c&state=s2')
            self.assertIn('google=admin_only', r['Location'])
            self.assertFalse(Token.objects.filter(user=self.admin).exists())

    def test_bad_state_rejected(self):
        with mock.patch.dict('os.environ', {'GOOGLE_CLIENT_ID': 'cid', 'GOOGLE_CLIENT_SECRET': 'sec',
                                            'PUBLIC_BASE_URL': 'https://x.test'}):
            r = self.client.get('/api/auth/google/callback/?code=c&state=bogus')
            self.assertIn('google=failed', r['Location'])
