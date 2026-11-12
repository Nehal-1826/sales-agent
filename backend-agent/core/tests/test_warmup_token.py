"""POST /api/auth/warmup-token/ — HS256 bridge JWT consumed by backend-warmup."""
import os

import jwt as pyjwt
from rest_framework.authtoken.models import Token

from core.models import User
from core.tests.base import TenantTestCase  # the suite's auth-test base: workspace-scoped TestCase

SECRET = "test-bridge-secret"


class WarmupTokenTests(TenantTestCase):
    def setUp(self):
        # same user+token pattern as test_permissions.py / billing client_for()
        self.user = User.objects.create_user(workspace=self.workspace, username="bridge",
                                             password="pass12345", role="owner",
                                             email="bridge@x.test")
        self.token = Token.objects.create(user=self.user)

    def test_mints_valid_bridge_jwt(self):
        os.environ["WARMUP_JWT_SECRET"] = SECRET
        self.addCleanup(os.environ.pop, "WARMUP_JWT_SECRET", None)
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
