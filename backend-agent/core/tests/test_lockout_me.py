from unittest import mock

from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from core import lockout
from core.models import User


class LockoutTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.ws = make_ws('lk')
        User.objects.create_user('bob@x.test', password='right-pass-1', workspace=self.ws)
        self.c = APIClient()

    def login(self, pw, name='bob@x.test', **extra):
        return self.c.post('/api/auth/login/', {'username': name, 'password': pw}, format='json', **extra)

    def test_lockout_even_with_correct_password(self):
        for _ in range(10):
            self.assertEqual(self.login('bad').status_code, 401)
        r = self.login('right-pass-1')
        self.assertEqual((r.status_code, r.json()), (429, {'error': 'too_many_attempts'}))
        # case-insensitive username key
        self.assertEqual(self.login('right-pass-1', name='BOB@X.TEST').status_code, 429)

    def test_other_ip_not_locked(self):
        for _ in range(10):
            self.login('bad')
        r = self.login('bad', REMOTE_ADDR='9.9.9.9')
        self.assertEqual(r.status_code, 401)

    def test_success_clears_counter(self):
        for _ in range(9):
            self.login('bad')
        self.assertEqual(self.login('right-pass-1').status_code, 200)
        for _ in range(9):
            self.login('bad')
        self.assertEqual(self.login('right-pass-1').status_code, 200)

    def test_login_throttle(self):
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'login': '2/min'}):
            codes = [self.login('bad', name=f'n{i}').status_code for i in range(3)]
        self.assertEqual(codes, [401, 401, 429])

    def test_client_ip_rules(self):
        rf = RequestFactory()
        req = rf.get('/', REMOTE_ADDR='1.1.1.1', HTTP_X_FORWARDED_FOR='6.6.6.6, 2.2.2.2')
        self.assertEqual(lockout.client_ip(req), '1.1.1.1')
        with override_settings(TRUSTED_PROXY_COUNT=1):
            self.assertEqual(lockout.client_ip(req), '2.2.2.2')
        with override_settings(TRUSTED_PROXY_COUNT=2):
            self.assertEqual(lockout.client_ip(req), '6.6.6.6')


class MeFieldsTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)

    def me(self, user):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
        return c.get('/api/auth/me/').json()

    def test_tenant_user(self):
        u = User.objects.create_user('t', password='x', workspace=make_ws('me1'))
        d = self.me(u)
        self.assertEqual((d['email_verified'], d['platform_admin'], d['otp_required']), (False, False, False))

    def test_platform_admin_needs_otp(self):
        u = User.objects.create_user('adm', password='x', is_staff=True)
        d = self.me(u)
        self.assertEqual((d['platform_admin'], d['otp_required']), (True, True))

    def test_staff_with_workspace_not_admin(self):
        u = User.objects.create_user('s', password='x', is_staff=True, workspace=make_ws('me2'))
        self.assertFalse(self.me(u)['platform_admin'])


class ChangePasswordPolicyTests(TestCase):
    def test_weak_rejected_strong_ok(self):
        no_template_capture(self)
        u = User.objects.create_user('cp', password='old-pass-12345', workspace=make_ws('cp1'))
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=u).key}')

        def go(new):
            return c.post('/api/auth/password/', {'currentPassword': 'old-pass-12345', 'newPassword': new,
                                                  'confirmPassword': new}, format='json')
        self.assertEqual(go('short1').status_code, 400)
        self.assertEqual(go('1234567890123').status_code, 400)
        self.assertEqual(go('Zq7-hollow-River-93').status_code, 200)
