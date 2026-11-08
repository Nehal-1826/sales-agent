from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from billing.tests.helpers import client_for, no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import READ_ROUTES, WRITE_ROUTES, SECRET, code_now, make_admin
from core import totp
from core.models import PlatformSession, User


class TotpMathTests(TestCase):
    def test_rfc6238_vector(self):
        # RFC 6238 appendix B, SHA1, T=59 -> 94287082; 6-digit truncation 287082
        self.assertEqual(totp.totp(SECRET, now=59), '287082')
        self.assertEqual(totp.hotp(SECRET, 1, digits=8), '94287082')
        self.assertEqual(totp.totp(SECRET, now=1111111109, digits=8), '07081804')

    def test_window_and_replay(self):
        now = 1_000_000
        step = totp.current_step(now)
        for off in (-1, 0, 1):
            self.assertEqual(totp.match_step(SECRET, totp.hotp(SECRET, step + off), now=now), step + off)
        self.assertIsNone(totp.match_step(SECRET, totp.hotp(SECRET, step + 2), now=now))
        self.assertIsNone(totp.match_step(SECRET, totp.hotp(SECRET, step), now=now, last_step=step))
        self.assertIsNone(totp.match_step(SECRET, 'abc123', now=now))

    def test_secret_shape(self):
        s = totp.new_secret()
        self.assertEqual(len(s), 32)
        self.assertIn('Shailog%20Technologies', totp.otpauth_uri(s, 'a@b.c'))


class AccessTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        ws = make_ws('tn1')
        self.tenant, _ = client_for(ws, 'tenantowner')

    def hit(self, c, route, method):
        return getattr(c, method)('/api/platform/' + route, {}, format='json')

    def test_tenant_user_403_everywhere(self):
        for r in READ_ROUTES:
            self.assertEqual(self.hit(self.tenant, r, 'get').status_code, 403, r)
        for r in WRITE_ROUTES:
            self.assertEqual(self.hit(self.tenant, r, 'post').status_code, 403, r)
        self.assertEqual(self.hit(self.tenant, 'plans/startups/', 'put').status_code, 403)

    def test_anonymous_rejected(self):
        self.assertIn(self.hit(APIClient(), 'overview/', 'get').status_code, (401, 403))

    def test_staff_with_workspace_is_not_platform_admin(self):
        c, u = client_for(make_ws('tn2'), 'staffer')
        u.is_staff = True
        u.save()
        self.assertEqual(self.hit(c, 'overview/', 'get').status_code, 403)
        self.assertEqual(self.hit(c, '2fa/setup/', 'post').status_code, 403)

    def test_admin_without_otp_403_on_data_routes(self):
        c, _, _ = make_admin(verified=False)
        for r in READ_ROUTES:
            self.assertEqual(self.hit(c, r, 'get').status_code, 403, r)
        for r in WRITE_ROUTES[3:]:
            self.assertEqual(self.hit(c, r, 'post').status_code, 403, r)
        self.assertEqual(self.hit(c, 'plans/startups/', 'put').status_code, 403)

    def test_expired_otp_session(self):
        from datetime import timedelta
        from django.utils import timezone
        c, _, tok = make_admin()
        self.assertEqual(self.hit(c, 'overview/', 'get').status_code, 200)
        PlatformSession.objects.filter(token=tok).update(otp_verified_at=timezone.now() - timedelta(hours=13))
        self.assertEqual(self.hit(c, 'overview/', 'get').status_code, 403)

    def test_inactive_admin_rejected(self):
        c, u, _ = make_admin()
        u.is_active = False
        u.save()
        self.assertIn(self.hit(c, 'overview/', 'get').status_code, (401, 403))


class TwoFactorFlowTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)

    def test_setup_confirm_verify_logout(self):
        c, u, tok = make_admin(verified=False, enrolled=False)
        r = c.post('/api/platform/2fa/setup/')
        self.assertEqual(r.status_code, 200)
        secret = r.json()['secret']
        self.assertTrue(r.json()['otpauth_uri'].startswith('otpauth://totp/'))
        self.assertEqual(c.get('/api/auth/me/').json()['otp_required'], True)
        bad = c.post('/api/platform/2fa/confirm/', {'code': '000000'}, format='json')
        self.assertEqual(bad.status_code, 400)
        ok = c.post('/api/platform/2fa/confirm/', {'code': totp.totp(secret)}, format='json')
        self.assertEqual(ok.status_code, 200)
        u.refresh_from_db()
        self.assertEqual((u.totp_secret, u.totp_pending), (secret, ''))
        self.assertEqual(c.post('/api/platform/2fa/setup/').status_code, 409)   # only while not enrolled
        self.assertFalse(c.get('/api/auth/me/').json()['otp_required'])
        self.assertEqual(c.get('/api/platform/overview/').status_code, 200)
        self.assertNotIn(secret, c.get('/api/auth/me/').content.decode())
        c.post('/api/auth/logout/')
        self.assertFalse(PlatformSession.objects.exists())

    def test_replay_rejected(self):
        c, _, _ = make_admin(verified=False)
        code = code_now()
        self.assertEqual(c.post('/api/platform/2fa/verify/', {'code': code}, format='json').status_code, 200)
        # a second session replaying the same code is refused
        c2, _, _ = make_admin('root2', verified=False)
        u2 = User.objects.get(username='root2')
        u2.totp_secret = SECRET
        u2.save()
        self.assertEqual(c2.post('/api/platform/2fa/verify/', {'code': code}, format='json').status_code, 200)
        PlatformSession.objects.filter(token__user__username='root').update(otp_verified_at=None)
        r = c.post('/api/platform/2fa/verify/', {'code': code}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_login_requires_otp_again(self):
        c, u, tok = make_admin()
        r = APIClient().post('/api/auth/login/', {'username': 'root', 'password': 'pass12345-x'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['user']['otp_required'])
        self.assertTrue(r.json()['user']['platform_admin'])
        self.assertFalse(PlatformSession.objects.exists())

    def test_lock_after_10_failures(self):
        c, _, _ = make_admin(verified=False)
        for _ in range(10):
            self.assertEqual(c.post('/api/platform/2fa/verify/', {'code': '111111'}, format='json').status_code, 400)
        r = c.post('/api/platform/2fa/verify/', {'code': code_now()}, format='json')
        self.assertEqual(r.status_code, 429)

    def test_otp_throttle(self):
        c, _, _ = make_admin(verified=False)
        cache.clear()
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'otp': '2/min'}):
            codes = [c.post('/api/platform/2fa/verify/', {'code': '111111'}, format='json').status_code
                     for _ in range(3)]
        self.assertEqual(codes, [400, 400, 429])
