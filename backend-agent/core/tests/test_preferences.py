"""A person's format choice (User.format, User.clock): India and the 12-hour
clock by default, carried by the profile, changed through one endpoint — and
never from inside "Enter as user" (it is the person's own setting)."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_platform_base import make_admin
from core.models import User
from core.tests.base import TenantTestCase

REFUSED = 'Not available while you are inside as another user.'
INDIA = {'format': 'IN', 'clock': '12h'}


def signed_in(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {Token.objects.create(user=user).key}')
    return c


class DefaultTests(TenantTestCase):
    def setUp(self):
        self.u = User.objects.create_user(workspace=self.workspace, username='ada', password='pass12345', role='member')

    def test_everyone_starts_on_india_and_the_12_hour_clock(self):
        self.assertEqual((self.u.format, self.u.clock), ('IN', '12h'))

    def test_the_profile_carries_them(self):
        r = signed_in(self.u).get('/api/auth/me/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['preferences'], INDIA)

    def test_a_person_changes_their_own(self):
        c = signed_in(self.u)
        r = c.put('/api/auth/preferences/', {'format': 'US'}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'format': 'US', 'clock': '12h'}), r.content)
        self.assertEqual(c.get('/api/auth/me/').json()['preferences'], {'format': 'US', 'clock': '12h'})
        r = c.put('/api/auth/preferences/', {'format': 'device', 'clock': '24h'}, format='json')
        self.assertEqual(r.json(), {'format': 'device', 'clock': '24h'})
        self.assertEqual(c.get('/api/auth/me/').json()['preferences'], {'format': 'device', 'clock': '24h'})

    def test_every_value_there_is_can_be_chosen(self):
        c = signed_in(self.u)
        for fmt in ('IN', 'US', 'GB', 'device'):
            self.assertEqual(c.put('/api/auth/preferences/', {'format': fmt}, format='json').status_code, 200, fmt)
        for clock in ('12h', '24h'):
            self.assertEqual(c.put('/api/auth/preferences/', {'clock': clock}, format='json').status_code, 200, clock)

    def test_an_unknown_value_is_refused_and_changes_nothing(self):
        c = signed_in(self.u)
        for body in ({'format': 'EU'}, {'clock': '48h'}, {'format': 12}, {'format': 'GB', 'clock': 'nope'}):
            r = c.put('/api/auth/preferences/', body, format='json')
            self.assertEqual(r.status_code, 400, r.content)
        self.u.refresh_from_db()
        self.assertEqual((self.u.format, self.u.clock), ('IN', '12h'))

    def test_an_empty_body_changes_nothing(self):
        r = signed_in(self.u).put('/api/auth/preferences/', {}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, INDIA))

    def test_nobody_signed_in(self):
        self.assertEqual(APIClient().put('/api/auth/preferences/', {'format': 'US'}, format='json').status_code, 401)


class ConsoleTests(TestCase):
    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.admin, self.admin_u, _ = make_admin()

    def test_a_super_admin_starts_on_india_too(self):
        self.assertEqual(self.admin.get('/api/auth/me/').json()['preferences'], INDIA)

    def test_a_super_admin_changes_theirs_too(self):
        r = self.admin.put('/api/auth/preferences/', {'format': 'GB'}, format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'format': 'GB', 'clock': '12h'}), r.content)
        self.assertEqual(self.admin.get('/api/auth/me/').json()['preferences']['format'], 'GB')


class InsideTests(TenantTestCase):
    def test_it_cannot_be_changed_from_inside_enter_as_user(self):
        # refused before anything is looked at: the scheme alone is enough
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION='Impersonation not-even-a-real-ticket')
        r = c.put('/api/auth/preferences/', {'format': 'US'}, format='json')
        self.assertEqual((r.status_code, r.json()['detail']), (403, REFUSED))
