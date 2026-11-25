"""A deleted account cannot sign in — and is told so, on both doors.

(Google's door is in test_google_auth.) The message is given only to someone
who types the right password: otherwise the sign-in page would tell which
names were deleted."""

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from billing.tests.test_platform_base import make_admin
from core.models import LoginAttempt, User

DELETED = 'This account was deleted.'
PW = 'pw12345678'


def gone(user, when=None):
    """What a deletion does to an account (core.accounts.delete_account marks it the same way)."""
    User.objects.filter(pk=user.pk).update(deleted_at=when or timezone.now(), is_active=False)


def owner(slug='gone', username='ada', email='ada@acme.test'):
    return User.objects.create_user(username=username, password=PW, workspace=make_ws(slug),
                                    role='owner', email=email)


class Base(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()

    def sign_in(self, **fields):
        return APIClient().post('/api/auth/login/', fields, format='json')


class WorkspaceDoorTests(Base):
    def test_a_deleted_account_is_told_so(self):
        gone(owner())
        r = self.sign_in(username='ada', password=PW)
        self.assertEqual((r.status_code, r.json()['detail']), (403, DELETED))

    def test_by_e_mail_too(self):
        gone(owner())
        r = self.sign_in(username='Ada@Acme.test', password=PW)
        self.assertEqual((r.status_code, r.json()['detail']), (403, DELETED))

    def test_the_wrong_password_hears_nothing_about_it(self):
        gone(owner())
        r = self.sign_in(username='ada', password='not-the-password')
        self.assertEqual((r.status_code, r.json()['detail']), (401, 'invalid credentials'))

    def test_a_name_that_was_never_deleted_hears_nothing_either(self):
        owner()
        r = self.sign_in(username='ada', password='not-the-password')
        self.assertEqual((r.status_code, r.json()['detail']), (401, 'invalid credentials'))

    def test_trying_a_deleted_account_is_not_a_failed_attempt(self):
        # the password is right: nothing is counted towards a lockout
        gone(owner())
        for _ in range(3):
            self.assertEqual(self.sign_in(username='ada', password=PW).status_code, 403)
        self.assertEqual(LoginAttempt.objects.count(), 0)

    def test_an_account_that_is_not_deleted_signs_in_as_before(self):
        u = owner()
        r = self.sign_in(username='ada', password=PW)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['user']['username'], u.username)

    def test_the_old_token_of_a_deleted_account_is_dead(self):
        u = owner()
        token = Token.objects.create(user=u)
        gone(u)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.assertEqual(c.get('/api/auth/me/').status_code, 401)


class ConsoleDoorTests(Base):
    def test_a_deleted_platform_admin_is_told_so_at_the_admin_door(self):
        _, admin_u, _ = make_admin()
        gone(admin_u)
        r = APIClient().post('/api/auth/admin-login/', {'username': 'root', 'password': 'pass12345-x'},
                             format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (403, DELETED))

    def test_with_the_wrong_password_the_admin_door_hears_nothing_either(self):
        _, admin_u, _ = make_admin()
        gone(admin_u)
        r = APIClient().post('/api/auth/admin-login/', {'username': 'root', 'password': 'nope-nope-nope'},
                             format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (401, 'invalid credentials'))
