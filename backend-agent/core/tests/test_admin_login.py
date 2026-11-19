from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from billing.tests.helpers import no_template_capture, quiet_logs
from billing.tests.test_entitlements import make_ws
from core.authz import is_platform_admin
from core.models import User


class AdminLoginDoorTests(TestCase):
    """Two server-enforced doors: /auth/login/ for workspace users only,
    /auth/admin-login/ for platform admins only."""

    def setUp(self):
        no_template_capture(self)
        quiet_logs(self)
        cache.clear()
        self.c = APIClient()
        self.admin = User.objects.create_superuser(
            'root', email='root@platform.test', password='admin-pass-123')
        self.assertTrue(is_platform_admin(self.admin))  # superuser: staff + no workspace
        self.owner = User.objects.create_user(
            'owner1', password='owner-pass-123', email='owner@x.test',
            workspace=make_ws('adm-door'), role='owner')

    def post(self, url, username, password):
        return self.c.post(url, {'username': username, 'password': password}, format='json')

    def test_platform_admin_rejected_on_default_login(self):
        r = self.post('/api/auth/login/', 'root', 'admin-pass-123')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json(), {'detail': 'Platform admins sign in from the admin login page.',
                                    'admin_only': True})
        self.assertFalse(Token.objects.filter(user=self.admin).exists())  # no token minted

    def test_platform_admin_logs_in_on_admin_door(self):
        r = self.post('/api/auth/admin-login/', 'root', 'admin-pass-123')
        self.assertEqual(r.status_code, 200)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Token {r.json()['token']}")
        me = c.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.json()['platform_admin'])

    def test_workspace_owner_rejected_on_admin_door(self):
        r = self.post('/api/auth/admin-login/', 'owner1', 'owner-pass-123')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(r.json(), {'detail': 'This page is for platform administrators only.'})
        self.assertFalse(Token.objects.filter(user=self.owner).exists())

    def test_workspace_owner_still_logs_in_on_default_login(self):
        r = self.post('/api/auth/login/', 'owner1', 'owner-pass-123')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['token'])

    def test_wrong_password_on_admin_door(self):
        r = self.post('/api/auth/admin-login/', 'root', 'totally-wrong-9')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json(), {'detail': 'invalid credentials'})

    def test_platform_admin_by_email_on_admin_door(self):
        r = self.post('/api/auth/admin-login/', 'root@platform.test', 'admin-pass-123')
        self.assertEqual(r.status_code, 200)
