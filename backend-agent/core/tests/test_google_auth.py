"""Google sign-in via Firebase ID tokens — existing users only, two-door split.

The crypto is PyJWT against Google's public certs; tests mock the cert fetch
and mint REAL RS256 tokens so the verification path itself is exercised."""
import datetime
from unittest import mock

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import google_auth
from core.models import User
from billing.tests.test_entitlements import make_ws

PROJECT = 'warm-test'


def _mint_token(private_key, kid, email, verified=True, aud=PROJECT,
                iss=f'https://securetoken.google.com/{PROJECT}'):
    now = datetime.datetime.now(datetime.timezone.utc)
    claims = {
        'iss': iss, 'aud': aud, 'sub': 'uid-1', 'email': email,
        'email_verified': verified,
        'iat': now, 'exp': now + datetime.timedelta(hours=1),
    }
    return jwt.encode(claims, private_key, algorithm='RS256', headers={'kid': kid})


class FirebaseVerifyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.ws = make_ws('goog-co')
        self.user = User.objects.create_user(
            'goog-owner', password='pw123456', email='Owner@Example.com',
            role='owner', workspace=self.ws)
        self.admin = User.objects.create_superuser(
            'goog-admin', password='pw123456', email='admin@warmpulse.tech')
        User.objects.filter(pk=self.admin.pk).update(workspace=None)

        # a real keypair + Google-shaped cert response
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        from cryptography.hazmat.primitives import serialization
        pub_pem = self.key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        # x509 metadata endpoint returns PEM certificates; PyJWT accepts PEM keys
        self.certs = {'kid-1': pub_pem}
        self.patch_cert = mock.patch.object(google_auth, '_certs', return_value=self.certs)
        self.patch_cert.start()
        self.addCleanup(self.patch_cert.stop)
        self.env = mock.patch.dict('os.environ', {'FIREBASE_PROJECT_ID': PROJECT})
        self.env.start()
        self.addCleanup(self.env.stop)

    def post_token(self, **kw):
        token = _mint_token(self.key, 'kid-1', **kw)
        return self.client.post('/api/auth/google/verify/', {'idToken': token}, format='json')

    def test_unconfigured_503(self):
        import os
        with mock.patch.dict(os.environ, {'FIREBASE_PROJECT_ID': ''}):
            r = self.client.post('/api/auth/google/verify/', {'idToken': 'x'}, format='json')
        self.assertEqual(r.status_code, 503)

    def test_valid_token_existing_user_gets_drftoken(self):
        r = self.post_token(email='owner@example.com')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(Token.objects.filter(user=self.user).exists())
        self.assertEqual(r.json()['user']['username'], 'goog-owner')

    def test_unknown_email_rejected(self):
        r = self.post_token(email='nobody@example.com')
        self.assertEqual(r.status_code, 400)
        self.assertIn('No account exists', r.json()['detail'])
        self.assertFalse(Token.objects.filter(user=self.user).exists())

    def test_platform_admin_refused_on_this_door(self):
        r = self.post_token(email='admin@warmpulse.tech')
        self.assertEqual(r.status_code, 403)
        self.assertIn('admin login page', r.json()['detail'])
        self.assertFalse(Token.objects.filter(user=self.admin).exists())

    def test_bad_signature_rejected(self):
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        token = _mint_token(other, 'kid-1', email='owner@example.com')
        r = self.client.post('/api/auth/google/verify/', {'idToken': token}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_unverified_email_rejected(self):
        r = self.post_token(email='owner@example.com', verified=False)
        self.assertEqual(r.status_code, 400)
        self.assertIn('not verified', r.json()['detail'])

    def test_a_deleted_account_cannot_come_back_through_google(self):
        from django.utils import timezone
        User.objects.filter(pk=self.user.pk).update(deleted_at=timezone.now(), is_active=False)
        r = self.post_token(email='owner@example.com')
        self.assertEqual((r.status_code, r.json()['detail']), (403, 'This account was deleted.'))
        self.assertFalse(Token.objects.filter(user=self.user).exists())
