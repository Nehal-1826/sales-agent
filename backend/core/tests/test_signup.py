from datetime import timedelta
from unittest import mock

from django.core import signing
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from billing.models import Subscription
from billing.tests.helpers import no_template_capture, quiet_logs
from core import signup as su
from core.models import User, Workspace

PW = 'Zq7-hollow-River-93'


def body(**over):
    d = {'company': 'Acme Rockets', 'name': 'Ann Lee', 'email': 'Ann@Acme.test', 'password': PW,
         'country': 'IN', 'plan_code': 'business', 'interval': 'month'}
    d.update(over)
    return d


class SignupTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.c = APIClient()

    def post(self, **over):
        return self.c.post('/api/auth/signup/', body(**over), format='json')

    def test_happy_path_pending_paywalled(self):
        r = self.post()
        self.assertEqual(r.status_code, 201, r.content)
        u = User.objects.get(username='ann@acme.test')
        self.assertEqual((u.role, u.email, u.email_verified_at), ('owner', 'ann@acme.test', None))
        sub = Subscription.all_tenants.get(workspace=u.workspace)
        self.assertEqual((sub.status, sub.plan.code, sub.interval, sub.currency),
                         ('pending', 'business', 'month', 'INR'))
        self.assertEqual(u.workspace.slug, 'acme-rockets')
        self.assertFalse(r.json()['user']['email_verified'])
        auth = APIClient()
        auth.credentials(HTTP_AUTHORIZATION=f"Token {r.json()['token']}")
        self.assertEqual(auth.get('/api/leads/').status_code, 200)
        w = auth.post('/api/leads/', {'company': 'X', 'website': 'https://x.test'}, format='json')
        self.assertEqual(w.status_code, 402)
        self.assertEqual(w.json(), {'error': 'payment_required'})

    def test_currency_by_country_and_explicit(self):
        self.post(email='a@x.test', country='US')
        self.post(email='b@x.test', country='IN', currency='USD', company='B')
        cur = {u.username: Subscription.all_tenants.get(workspace=u.workspace).currency
               for u in User.objects.filter(username__in=['a@x.test', 'b@x.test'])}
        self.assertEqual(cur, {'a@x.test': 'USD', 'b@x.test': 'USD'})

    def test_duplicate_email_any_case(self):
        self.assertEqual(self.post().status_code, 201)
        n = Workspace.all_tenants.count()
        r = self.post(email='ANN@acme.test', company='Other')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json(), {'email': ['Could not use this email.']})
        self.assertEqual(Workspace.all_tenants.count(), n)

    def test_weak_passwords(self):
        for pw in ('short1', 'password123', '1234567890123', 'ann@acme.test'):
            r = self.post(password=pw)
            self.assertEqual(r.status_code, 400, pw)
            self.assertIn('password', r.json())
        self.assertEqual(User.objects.count(), 0)

    def test_sanitization(self):
        r = self.post(utm_source='go\x00o\x1bgle' + 'x' * 300, utm_campaign='c\nd', referrer=5, country='india')
        self.assertEqual(r.status_code, 201)
        ws = Workspace.all_tenants.get(name='Acme Rockets')
        self.assertEqual(len(ws.signup_source), 200)
        self.assertNotIn('\x00', ws.signup_source)
        self.assertEqual((ws.signup_campaign, ws.signup_referrer, ws.country), ('cd', '', ''))

    def test_bad_plan(self):
        self.assertEqual(self.post(plan_code='nope').status_code, 400)

    def test_unique_slug(self):
        self.post()
        self.post(email='z@x.test')
        slugs = list(Workspace.all_tenants.filter(name='Acme Rockets').values_list('slug', flat=True))
        self.assertEqual(len(set(slugs)), 2)

    def test_old_register_closed(self):
        self.assertEqual(self.c.post('/api/auth/register/', {}, format='json').status_code, 403)

    def test_throttle(self):
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'signup': '2/hour'}):
            codes = [self.post(email=f'u{i}@x.test', company=f'C{i}').status_code for i in range(3)]
        self.assertEqual(codes, [201, 201, 429])


class VerifyTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.c = APIClient()
        r = self.c.post('/api/auth/signup/', body(), format='json')
        self.user = User.objects.get(username='ann@acme.test')
        self.tok = r.json()['token']

    def verify(self, token):
        return self.c.post('/api/auth/verify_email/', {'token': token}, format='json')

    def test_valid_then_reused(self):
        t = su.make_token(self.user)
        self.assertEqual(self.verify(t).status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.email_verified_at)
        self.assertEqual(self.verify(t).status_code, 400)

    def test_tampered_and_garbage(self):
        t = su.make_token(self.user)
        self.assertEqual(self.verify(t[:-2] + 'xx').status_code, 400)
        self.assertEqual(self.verify('junk').status_code, 400)
        self.assertEqual(self.verify(None).status_code, 400)

    def test_expired(self):
        t = su.make_token(self.user)
        future = timezone.now() + timedelta(hours=49)
        with mock.patch('django.core.signing.time.time', return_value=future.timestamp()):
            self.assertEqual(self.verify(t).status_code, 400)

    def test_email_changed(self):
        t = su.make_token(self.user)
        User.objects.filter(pk=self.user.pk).update(email='new@acme.test')
        self.assertEqual(self.verify(t).status_code, 400)

    def test_wrong_salt(self):
        t = signing.TimestampSigner(salt='other').sign_object({'u': self.user.pk, 'e': self.user.email})
        self.assertEqual(self.verify(t).status_code, 400)

    def test_resend_and_throttle(self):
        a = APIClient()
        a.credentials(HTTP_AUTHORIZATION=f'Token {self.tok}')
        with mock.patch('core.signup.send_verification') as sv:
            self.assertEqual(a.post('/api/auth/resend_verification/').status_code, 200)
            sv.assert_called_once()
        self.assertEqual(self.c.post('/api/auth/resend_verification/').status_code, 401)
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {'resend': '1/hour'}), \
                mock.patch('core.signup.send_verification'):
            cache.clear()
            self.assertEqual(a.post('/api/auth/resend_verification/').status_code, 200)
            self.assertEqual(a.post('/api/auth/resend_verification/').status_code, 429)

    def test_resend_noop_when_verified(self):
        User.objects.filter(pk=self.user.pk).update(email_verified_at=timezone.now())
        a = APIClient()
        a.credentials(HTTP_AUTHORIZATION=f'Token {self.tok}')
        with mock.patch('core.signup.send_verification') as sv:
            self.assertEqual(a.post('/api/auth/resend_verification/').status_code, 200)
            sv.assert_not_called()

    def test_checkout_blocked_until_verified(self):
        a = APIClient()
        a.credentials(HTTP_AUTHORIZATION=f'Token {self.tok}')
        r = a.post('/api/billing/checkout/', {'plan_code': 'business', 'interval': 'month',
                                              'currency': 'INR'}, format='json')
        self.assertEqual((r.status_code, r.json()), (403, {'error': 'email_not_verified'}))

    def test_mail_via_platform_smtp(self):
        env = {'PLATFORM_SMTP_HOST': 'smtp.x.test', 'PLATFORM_SMTP_PORT': '465',
               'PLATFORM_SMTP_USER': 'u', 'PLATFORM_SMTP_PASSWORD': 'p', 'PLATFORM_SMTP_FROM': 'hi@x.test'}
        with mock.patch.dict('os.environ', env), mock.patch('core.signup.get_connection') as gc, \
                mock.patch('core.signup.EmailMessage') as em:
            self.assertTrue(su.send_verification(self.user))
        self.assertEqual(gc.call_args.kwargs['host'], 'smtp.x.test')
        self.assertTrue(gc.call_args.kwargs['use_ssl'])
        self.assertIn('/?verify=', em.call_args.args[1])

    def test_no_smtp_logs_warning_not_link(self):
        with mock.patch.dict('os.environ', {'PLATFORM_SMTP_HOST': ''}), \
                self.settings(DEBUG=False), mock.patch.object(su, 'log') as lg:
            self.assertFalse(su.send_verification(self.user))
        lg.warning.assert_called_once()
        lg.info.assert_not_called()
