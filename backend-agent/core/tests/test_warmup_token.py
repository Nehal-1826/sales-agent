"""POST /api/auth/warmup-token/ — HS256 bridge JWT consumed by backend-warmup."""
import os
from datetime import timedelta

import jwt as pyjwt
from django.utils import timezone
from rest_framework.authtoken.models import Token

from core.models import PlatformSession, User
from core.tenancy import reset_workspace, set_workspace
from core.tests.base import TenantTestCase  # the suite's auth-test base: workspace-scoped TestCase
from core.warmup_bridge import mint_warmup_token

# 32+ chars — mint_warmup_token refuses shorter bridge secrets
SECRET = "test-bridge-secret-0123456789abcdef0123456789abcdef"


def _set_secret(test):
    os.environ["WARMUP_JWT_SECRET"] = SECRET
    test.addCleanup(os.environ.pop, "WARMUP_JWT_SECRET", None)


class WarmupTokenTests(TenantTestCase):
    def setUp(self):
        # same user+token pattern as test_permissions.py / billing client_for()
        self.user = User.objects.create_user(workspace=self.workspace, username="bridge",
                                             password="pass12345", role="owner",
                                             email="bridge@x.test")
        self.token = Token.objects.create(user=self.user)

    def test_mints_valid_bridge_jwt(self):
        _set_secret(self)
        res = self.client.post(
            "/api/auth/warmup-token/",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )
        self.assertEqual(res.status_code, 200)
        claims = pyjwt.decode(res.json()["token"], SECRET, algorithms=["HS256"])
        self.assertEqual(claims["iss"], "agent-bridge")
        self.assertEqual(claims["type"], "access")
        self.assertEqual(claims["sub"], str(self.user.id))
        self.assertEqual(claims["email"], self.user.email)
        self.assertIn(claims["role"], ("client", "super_admin"))
        self.assertEqual(claims["role"], "client")  # workspace user is never super_admin
        self.assertEqual(claims["workspace"], self.workspace.slug)  # real slug, not hardcoded
        self.assertEqual(claims["exp"] - claims["iat"], 12 * 60 * 60)  # 12 h TTL

    def test_requires_auth(self):
        res = self.client.post("/api/auth/warmup-token/")
        self.assertEqual(res.status_code, 401)

    # ── Second check on platform-admin (super_admin) minting ────────────
    # Same pattern as billing/tests/test_platform_base.make_admin: staff
    # user with no workspace + Token + PlatformSession(otp_verified_at).
    # The admin has two-factor unless a test says otherwise: for such an
    # account a verified code is the second check (2026-11-25 it became the
    # admin's own choice; without it the password is the second check).

    ADMIN_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

    def _admin_token(self, otp_verified_at, enrolled=True):
        # User.save() inherits the ACTIVE workspace — create the operator with
        # the tenant context cleared so workspace_id stays None (platform admin).
        ctx = set_workspace(None)
        try:
            admin = User.objects.create_user(username="root", password="pass12345-x",
                                             email="root@shailog.test", is_staff=True)
            if enrolled:
                # a plain UPDATE: save() here would give the admin the test's workspace
                User.objects.filter(pk=admin.pk).update(totp_secret=self.ADMIN_SECRET)
                admin.refresh_from_db()
        finally:
            reset_workspace(ctx)
        self.assertIsNone(admin.workspace_id)   # platform operator, not a tenant
        tok = Token.objects.create(user=admin)
        if otp_verified_at is not None:
            PlatformSession.objects.create(token=tok, otp_verified_at=otp_verified_at)
        return admin, tok

    def _post(self, tok):
        return self.client.post(
            "/api/auth/warmup-token/",
            HTTP_AUTHORIZATION=f"Token {tok.key}",
        )

    def test_platform_admin_without_otp_session_gets_403(self):
        # A bare DRF token of an admin WITH two-factor must never buy a 12 h
        # super_admin FastAPI session.
        _set_secret(self)
        _, tok = self._admin_token(otp_verified_at=None)
        res = self._post(tok)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json(), {"detail": "OTP required"})

    def test_platform_admin_without_two_factor_mints_with_the_password_alone(self):
        """Two-factor is the admin's own choice (2026-11-25): without it the
        password was the second check, so the token it issued may mint."""
        _set_secret(self)
        admin, tok = self._admin_token(otp_verified_at=None, enrolled=False)
        self.assertFalse(admin.totp_secret)
        res = self._post(tok)
        self.assertEqual(res.status_code, 200)
        claims = pyjwt.decode(res.json()["token"], SECRET, algorithms=["HS256"])
        self.assertEqual((claims["role"], claims["sub"]), ("super_admin", str(admin.id)))

    def test_platform_admin_with_expired_otp_gets_403(self):
        _set_secret(self)
        _, tok = self._admin_token(otp_verified_at=timezone.now() - timedelta(hours=13))  # > 12 h TTL
        res = self._post(tok)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.json(), {"detail": "OTP required"})

    def test_platform_admin_with_otp_mints_super_admin(self):
        _set_secret(self)
        admin, tok = self._admin_token(otp_verified_at=timezone.now())
        res = self._post(tok)
        self.assertEqual(res.status_code, 200)
        claims = pyjwt.decode(res.json()["token"], SECRET, algorithms=["HS256"])
        self.assertEqual(claims["role"], "super_admin")   # privileged mint is the gated branch
        self.assertEqual(claims["sub"], str(admin.id))
        self.assertEqual(claims["workspace"], "default")  # no workspace → default slug

    def test_short_bridge_secret_refused(self):
        # Mirror of backend/app/config.py: the bridge secret must be 32+ chars.
        os.environ["WARMUP_JWT_SECRET"] = "too-short-secret"
        self.addCleanup(os.environ.pop, "WARMUP_JWT_SECRET", None)
        with self.assertRaises(RuntimeError):
            mint_warmup_token(user=self.user, workspace_slug=self.workspace.slug)

    def test_missing_bridge_secret_refused(self):
        os.environ.pop("WARMUP_JWT_SECRET", None)
        self.addCleanup(os.environ.pop, "WARMUP_JWT_SECRET", None)
        with self.assertRaises(RuntimeError):
            mint_warmup_token(user=self.user, workspace_slug=self.workspace.slug)
