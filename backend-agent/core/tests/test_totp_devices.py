"""Multi-device TOTP (max 3) — /api/auth/2fa/devices/* + the slug lockout.

Codes are MINTED with core.totp (never hardcoded); device confirms run at a
pinned time so later real-time codes are never replays of the confirm step."""

from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import SECRET
from core import totp
from core.models import PlatformSession, TotpDevice, User


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


def add_device(c, name='Authy'):
    r = c.post('/api/auth/2fa/devices/', {'name': name}, format='json')
    assert r.status_code == 201, r.content
    return TotpDevice.objects.get(pk=r.json()['id'])


def confirm_device(c, device, now=2_000_000):
    with mock.patch('core.totp.time.time', return_value=now):
        r = c.post(f'/api/auth/2fa/devices/{device.id}/confirm/',
                   {'code': totp.totp(device.secret, now=now)}, format='json')
    assert r.status_code == 200, r.content
    device.refresh_from_db()


class TotpDeviceTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()

    def test_add_returns_uri_only_and_blocks_second_pending(self):
        c, u = make_user('dev1', 'dv1', enrolled=True)
        self.assertEqual(c.get('/api/auth/2fa/devices/').json(),
                         {'primary': True, 'remaining': 2, 'devices': []})
        no_name = c.post('/api/auth/2fa/devices/', {'name': '   '}, format='json')
        self.assertEqual((no_name.status_code, no_name.json()['detail']),
                         (400, 'Give the device a name.'))
        r = c.post('/api/auth/2fa/devices/', {'name': 'Authy'}, format='json')
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(body['name'], 'Authy')
        self.assertTrue(body['otpauth_uri'].startswith('otpauth://totp/'))
        self.assertNotIn('secret', body)   # QR only — the raw secret never leaves the server
        again = c.post('/api/auth/2fa/devices/', {'name': 'Phone'}, format='json')
        self.assertEqual((again.status_code, again.json()['detail']),
                         (400, 'Confirm or remove the pending device first.'))

    def test_pending_code_never_satisfies_verify_until_confirmed(self):
        c, u = make_user('dev2', 'dv2', enrolled=True)
        d = add_device(c)
        pending = c.post('/api/auth/2fa/verify/', {'code': totp.totp(d.secret)}, format='json')
        self.assertEqual((pending.status_code, pending.json()['error']), (400, 'invalid_code'))
        confirm_device(c, d)
        self.assertTrue(d.confirmed)
        # a confirmed device is no longer confirmable
        re_confirm = c.post(f'/api/auth/2fa/devices/{d.id}/confirm/',
                            {'code': totp.totp(d.secret)}, format='json')
        self.assertEqual(re_confirm.status_code, 404)

    def test_confirmed_device_satisfies_verify_and_stamps_last_used(self):
        c, u = make_user('dev3', 'dv3', enrolled=True)
        d = add_device(c)
        confirm_device(c, d, now=2_000_000)
        r = c.post('/api/auth/2fa/verify/', {'code': totp.totp(d.secret)}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'verified': True}))
        d.refresh_from_db()
        self.assertIsNotNone(d.last_used_at)
        listed = c.get('/api/auth/2fa/devices/').json()
        self.assertEqual(listed['remaining'], 1)
        self.assertEqual((listed['devices'][0]['confirmed'],
                          listed['devices'][0]['last_used_at'] is not None), (True, True))

    def test_limit_with_primary_secret(self):
        c, u = make_user('dev4', 'dv4', enrolled=True)
        d1 = add_device(c, 'One')
        confirm_device(c, d1, now=2_000_000)
        d2 = add_device(c, 'Two')
        confirm_device(c, d2, now=2_000_030)
        full = c.post('/api/auth/2fa/devices/', {'name': 'Three'}, format='json')
        self.assertEqual((full.status_code, full.json()['detail']),
                         (400, 'Device limit reached — remove one first (max 3).'))
        self.assertEqual(c.get('/api/auth/2fa/devices/').json()['remaining'], 0)

    def test_remove_last_method_blocked_non_last_ok(self):
        c, u = make_user('dev5', 'dv5', enrolled=True)
        d = add_device(c)
        confirm_device(c, d)
        self.assertEqual(c.delete(f'/api/auth/2fa/devices/{d.id}/').status_code, 204)   # primary remains

        c2, u2 = make_user('dev6', 'dv6')   # device-only user: the device IS the last method
        d2 = add_device(c2)
        confirm_device(c2, d2)
        last = c2.delete(f'/api/auth/2fa/devices/{d2.id}/')
        self.assertEqual((last.status_code, last.json()['detail']),
                         (400, 'Add another device before removing the last one.'))
        self.assertEqual(c2.delete(f'/api/auth/2fa/devices/{d2.id + 99}/').status_code, 404)

        c3, u3 = make_user('dev7', 'dv7')   # a pending device is not a method — always removable
        d3 = add_device(c3)
        self.assertEqual(c3.delete(f'/api/auth/2fa/devices/{d3.id}/').status_code, 204)

    def test_disable_accepts_device_code_and_deletes_devices(self):
        c, u = make_user('dev8', 'dv8', enrolled=True)
        d = add_device(c)
        confirm_device(c, d, now=2_000_000)
        dis = c.post('/api/auth/2fa/disable/', {'code': totp.totp(d.secret)}, format='json')
        self.assertEqual((dis.status_code, dis.json()), (200, {'enabled': False}))
        u.refresh_from_db()
        self.assertEqual(u.totp_secret, '')
        self.assertEqual(TotpDevice.objects.filter(user=u).count(), 0)


class AdminSlugLockoutTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()

    def post_slug(self, slug):
        # AdminSlugThrottle (5/min per IP) must not mask the lockout under test
        cache.delete('throttle_admin-slug_127.0.0.1')
        return APIClient().post('/api/admin-slug/check/', {'slug': slug}, format='json')

    def test_ten_wrong_hits_lock_the_ip_for_the_window(self):
        for i in range(10):
            r = self.post_slug(f'{100000 + i:06d}')
            self.assertEqual((r.status_code, r.json()['valid']), (404, False), i)
        eleventh = self.post_slug('999999')
        self.assertEqual((eleventh.status_code, eleventh.json()),
                         (429, {'error': 'too_many_attempts'}))
