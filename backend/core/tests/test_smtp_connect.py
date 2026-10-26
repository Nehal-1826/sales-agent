"""One-click SMTP connector (/api/settings/smtp_connect/).

The endpoint probes the provider's servers with a real SMTP login (mocked
here) and saves the first that authenticates.  Expected failures come back
as 200 {ok: false, message} — answers, not HTTP errors.
"""

from unittest import mock

from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core.models import AppSettings, User


class SmtpConnectTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='tester', password='testpass1234', role=User.Roles.OWNER)
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_zoho_connects_on_second_datacenter(self):
        # .in unreachable, .com authenticates — the connector finds the DC
        with mock.patch('core.mailer.verify_smtp',
                        side_effect=['connect: SMTPConnectError', '', 'auth']) as probe:
            resp = self.client.post('/api/settings/smtp_connect/', {
                'provider': 'zoho', 'user': 'hello@shailog.com', 'password': 'secret',
            }, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body['ok'])
        self.assertEqual(body['host'], 'smtp.zoho.com')
        self.assertEqual(probe.call_count, 2)
        s = AppSettings.load()
        self.assertEqual(s.smtp_host, 'smtp.zoho.com')
        self.assertEqual(s.smtp_port, 587)
        self.assertEqual(s.smtp_user, 'hello@shailog.com')
        self.assertEqual(s.smtp_password, 'secret')
        self.assertEqual(s.from_email, 'hello@shailog.com')  # auto-filled

    def test_zoho_auth_failure_explains_app_password(self):
        with mock.patch('core.mailer.verify_smtp', return_value='auth') as probe:
            resp = self.client.post('/api/settings/smtp_connect/', {
                'provider': 'zoho', 'user': 'hello@shailog.com', 'password': 'wrong',
            }, format='json')
        body = resp.json()
        self.assertFalse(body['ok'])
        self.assertIn('App Password', body['message'])
        self.assertEqual(probe.call_count, 3)  # every datacenter got its chance
        self.assertFalse(AppSettings.load().smtp_password)

    def test_unreachable_servers_reported(self):
        with mock.patch('core.mailer.verify_smtp', return_value='connect: timeout'):
            resp = self.client.post('/api/settings/smtp_connect/', {
                'provider': 'zoho', 'user': 'hello@shailog.com', 'password': 'secret',
            }, format='json')
        body = resp.json()
        self.assertFalse(body['ok'])
        self.assertIn('Could not reach', body['message'])
        self.assertIn('smtp.zoho.in', body['message'])

    def test_custom_provider_uses_supplied_host(self):
        with mock.patch('core.mailer.verify_smtp', return_value='') as probe:
            resp = self.client.post('/api/settings/smtp_connect/', {
                'provider': 'custom', 'user': 'me@corp.io', 'password': 'pw',
                'host': 'mail.corp.io', 'port': '465',
            }, format='json')
        body = resp.json()
        self.assertTrue(body['ok'])
        probe.assert_called_once_with('mail.corp.io', 465, 'me@corp.io', 'pw')
        self.assertEqual(AppSettings.load().smtp_port, 465)

    def test_custom_provider_requires_host(self):
        resp = self.client.post('/api/settings/smtp_connect/', {
            'provider': 'custom', 'user': 'me@corp.io', 'password': 'pw',
        }, format='json')
        # expected failure → 200 {ok: false} (answer, not an HTTP error)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()['ok'])
        self.assertIn('host', resp.json()['message'])

    def test_missing_credentials_400(self):
        resp = self.client.post('/api/settings/smtp_connect/', {
            'provider': 'zoho', 'user': '', 'password': '',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_existing_from_email_not_overwritten(self):
        s = AppSettings.load()
        s.from_email = 'outreach@shailog.com'
        s.save(update_fields=['from_email'])
        with mock.patch('core.mailer.verify_smtp', return_value=''):
            self.client.post('/api/settings/smtp_connect/', {
                'provider': 'zoho', 'user': 'hello@shailog.com', 'password': 'secret',
            }, format='json')
        self.assertEqual(AppSettings.load().from_email, 'outreach@shailog.com')
