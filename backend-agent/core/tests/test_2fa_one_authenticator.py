"""One authenticator per account, and two-factor is the platform admin's own
choice (owner's order, 2026-11-25).

Until now every platform admin was forced through a code screen and enrolled
an authenticator on first sign-in, and an account could hold up to 3
authenticators. Now:

- the second check is passed when a code was verified OR the account has no
  two-factor on (`core.authz.otp_satisfied` is the one place that decides);
- an admin without two-factor signs in with the password alone and can turn
  it on (and off again with a code) in the console's Settings;
- the extra-authenticator routes and table are gone.

Codes are MINTED with core.totp (never hardcoded); verifies run at pinned
times so a later real-time code is never a replay of an earlier step."""

import os
from unittest import mock

from django.core.cache import cache
from django.core.management import call_command
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.models import PlatformAuditLog
from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import SECRET, code_now, make_admin
from core import totp
from core.models import PlatformSession, User


def admin_client(token):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {token}')
    return c


def sign_in(username='free', password='pw12345678'):
    """The admin door. Returns (status, body)."""
    r = APIClient().post('/api/auth/admin-login/', {'username': username, 'password': password}, format='json')
    return r.status_code, r.json()


class QuietCase(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()


class AdminWithoutTwoFactorTests(QuietCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user('free', password='pw12345678',
                                              email='free@shailog.test', is_staff=True)

    def test_the_password_alone_opens_the_console(self):
        status, body = sign_in()
        self.assertEqual(status, 200, body)
        self.assertEqual((body['user']['platform_admin'], body['user']['totp_enabled'],
                          body['user']['otp_required']), (True, False, False))
        c = admin_client(body['token'])
        self.assertFalse(c.get('/api/auth/me/').json()['otp_required'])
        self.assertEqual(c.get('/api/platform/overview/').status_code, 200)
        self.assertEqual(c.get('/api/platform/tenants/').status_code, 200)
        # the bridge token refuses to be minted without the shared secret (fail-loud rule)
        os.environ['WARMUP_JWT_SECRET'] = 'unit-test-bridge-secret-0123456789abcdef'
        self.addCleanup(os.environ.pop, 'WARMUP_JWT_SECRET', None)
        self.assertEqual(c.post('/api/auth/warmup-token/', {}, format='json').status_code, 200)

    def test_turning_it_on_makes_the_next_sign_in_ask_for_a_code(self):
        _, body = sign_in()
        c = admin_client(body['token'])
        r = c.post('/api/platform/2fa/setup/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        secret = r.json()['secret']
        # a key waiting to be confirmed is not "on": still no code asked
        status, body = sign_in()
        self.assertEqual((status, body['user']['totp_enabled'], body['user']['otp_required']),
                         (200, False, False))
        ok = c.post('/api/platform/2fa/confirm/', {'code': totp.totp(secret)}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        # from now on a sign-in stops at the code
        status, body = sign_in()
        self.assertEqual((status, body['user']['totp_enabled'], body['user']['otp_required']),
                         (200, True, True))
        fresh = admin_client(body['token'])
        self.assertEqual(fresh.get('/api/platform/overview/').status_code, 403)
        self.assertEqual(fresh.post('/api/platform/2fa/verify/', {'code': totp.totp(secret)},
                                    format='json').status_code, 200)
        self.assertEqual(fresh.get('/api/platform/overview/').status_code, 200)

    def test_turning_it_off_makes_the_next_sign_in_password_only(self):
        self.admin.totp_secret = SECRET
        self.admin.save(update_fields=['totp_secret'])
        status, body = sign_in()
        self.assertEqual((status, body['user']['otp_required']), (200, True))
        c = admin_client(body['token'])
        self.assertEqual(c.post('/api/platform/2fa/verify/', {'code': code_now()}, format='json').status_code, 200)
        # a code from a LATER step (the one just used would be a replay)
        later = (totp.current_step() + 3) * totp.STEP
        with mock.patch('core.totp.time.time', return_value=later):
            off = c.post('/api/platform/2fa/disable/', {'code': totp.totp(SECRET, now=later)}, format='json')
        self.assertEqual(off.status_code, 200, off.content)
        self.assertEqual(off.json(), {'enabled': False})
        self.admin.refresh_from_db()
        self.assertEqual((self.admin.totp_secret, self.admin.totp_pending), ('', ''))
        self.assertTrue(PlatformAuditLog.objects.filter(action='platform.2fa_disabled').exists())
        status, body = sign_in()
        self.assertEqual((status, body['user']['totp_enabled'], body['user']['otp_required']),
                         (200, False, False))
        self.assertEqual(admin_client(body['token']).get('/api/platform/overview/').status_code, 200)

    def test_a_stolen_password_is_all_it_takes_once_two_factor_is_off(self):
        """Stated plainly as a test so nobody thinks the gate was forgotten:
        with two-factor off, the password alone is the second check."""
        self.assertFalse(PlatformSession.objects.exists())
        status, body = sign_in()
        c = admin_client(body['token'])
        self.assertEqual(c.get('/api/platform/overview/').status_code, 200)


class AdminWithTwoFactorTests(QuietCase):
    def test_an_enrolled_admin_is_stopped_at_the_code_on_every_new_sign_in(self):
        u = User.objects.create_user('locked', password='pw12345678', email='locked@shailog.test',
                                     is_staff=True)
        u.totp_secret = SECRET
        u.save(update_fields=['totp_secret'])
        status, body = sign_in('locked')
        self.assertEqual((status, body['user']['otp_required']), (200, True))
        self.assertEqual(admin_client(body['token']).get('/api/platform/overview/').status_code, 403)
        # a token with no verified session behind it gets no free pass either
        tok = Token.objects.get(user=u)
        PlatformSession.objects.filter(token=tok).delete()
        behind = admin_client(tok.key)
        self.assertTrue(behind.get('/api/auth/me/').json()['otp_required'])
        self.assertEqual(behind.get('/api/platform/overview/').status_code, 403)


def make_user(name, slug, enrolled=False, verified=True):
    """Workspace user + token client; `verified` pre-satisfies the OTP gate."""
    u = User.objects.create_user(name, password='dev-pass-12345', workspace=make_ws(slug),
                                 email=f'{name}@shailog.test')
    if enrolled:
        u.totp_secret = SECRET
        u.save(update_fields=['totp_secret'])
    tok = Token.objects.create(user=u)
    if verified:
        PlatformSession.objects.create(token=tok, otp_verified_at=timezone.now())
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {tok.key}')
    return c, u


class UserDoorUnchangedTests(QuietCase):
    def test_a_user_without_two_factor_is_never_asked_for_a_code(self):
        c, _ = make_user('plain', 'ud1')
        self.assertEqual(c.get('/api/auth/me/').json()['otp_required'], False)
        self.assertEqual(c.get('/api/leads/').status_code, 200)
        r = c.post('/api/auth/2fa/verify/', {'code': '000000'}, format='json')
        self.assertEqual((r.status_code, r.json()['error']), (409, 'not_enrolled'))

    def test_a_user_with_two_factor_is_asked_until_the_code_is_verified(self):
        c, u = make_user('coded', 'ud2', enrolled=True, verified=False)
        self.assertEqual(c.get('/api/auth/me/').json()['otp_required'], True)
        self.assertEqual(c.get('/api/leads/').status_code, 403)
        with mock.patch('core.totp.time.time', return_value=2_000_120):
            r = c.post('/api/auth/2fa/verify/', {'code': totp.totp(u.totp_secret, now=2_000_120)},
                       format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(c.get('/api/auth/me/').json()['otp_required'], False)


class OneAuthenticatorTests(QuietCase):
    def test_the_extra_authenticator_routes_are_gone_on_both_doors(self):
        c, _ = make_user('solo', 'ud3')
        self.assertEqual(c.get('/api/auth/2fa/devices/').status_code, 404)
        self.assertEqual(c.post('/api/auth/2fa/devices/', {'name': 'Phone'}, format='json').status_code, 404)
        self.assertEqual(c.post('/api/auth/2fa/devices/1/confirm/', {'code': '000000'}, format='json').status_code, 404)
        self.assertEqual(c.delete('/api/auth/2fa/devices/1/').status_code, 404)
        a, _, _ = make_admin()
        self.assertEqual(a.get('/api/platform/2fa/devices/').status_code, 404)
        self.assertEqual(a.post('/api/platform/2fa/devices/', {'name': 'Phone'}, format='json').status_code, 404)
        self.assertEqual(a.post('/api/platform/2fa/devices/1/confirm/', {'code': '000000'}, format='json').status_code, 404)
        self.assertEqual(a.delete('/api/platform/2fa/devices/1/').status_code, 404)

    def test_the_status_carries_the_single_authenticators_trail(self):
        """Enrolling, rotating and verifying stamp WHERE and FROM WHAT; the
        status shows it; turning two-factor off clears it."""
        c, u = make_user('dev9', 'dv9')
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.get(user=u).key}',
                      REMOTE_ADDR='198.51.100.9',
                      HTTP_USER_AGENT='Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile')
        before = c.get('/api/auth/2fa/status/').json()
        self.assertEqual((before['enabled'], before['enrolled_at']), (False, None))

        u.totp_pending = totp.new_secret()
        u.save(update_fields=['totp_pending'])
        with mock.patch('core.totp.time.time', return_value=2_000_060):
            r = c.post('/api/auth/2fa/confirm/', {'code': totp.totp(u.totp_pending, now=2_000_060)},
                       format='json')
        self.assertEqual(r.status_code, 200, r.content)
        u.refresh_from_db()   # the confirmed key is the account's authenticator now

        with mock.patch('core.totp.time.time', return_value=2_000_120):
            r = c.post('/api/auth/2fa/verify/', {'code': totp.totp(u.totp_secret, now=2_000_120)},
                       format='json')
        self.assertEqual(r.status_code, 200, r.content)

        status = c.get('/api/auth/2fa/status/').json()
        self.assertEqual((status['enabled'], status['enrolled_ip'], status['enrolled_device'],
                          status['last_used_ip']),
                         (True, '198.51.100.9', 'Chrome · Android', '198.51.100.9'))
        self.assertTrue(status['enrolled_at'])

        with mock.patch('core.totp.time.time', return_value=2_000_180):
            r = c.post('/api/auth/2fa/disable/', {'code': totp.totp(u.totp_secret, now=2_000_180)},
                       format='json')
        self.assertEqual(r.status_code, 200, r.content)
        after = c.get('/api/auth/2fa/status/').json()
        self.assertEqual(after, {'enabled': False, 'enrolled_at': None, 'enrolled_ip': '',
                                 'enrolled_device': '', 'last_used_ip': ''})


class OneAuthenticatorMigrationTests(TransactionTestCase):
    """The extra-authenticator table is removed by migration 0046."""

    def test_the_extra_devices_table_is_gone(self):
        call_command('migrate', 'core', '0045_autopilot_needs_proper_data', verbosity=0)
        self.assertIn('core_totpdevice', connection.introspection.table_names())
        call_command('migrate', 'core', '0046_one_authenticator', verbosity=0)
        self.assertNotIn('core_totpdevice', connection.introspection.table_names())
        self.assertFalse(hasattr(__import__('core.models', fromlist=['User']), 'TotpDevice'))
