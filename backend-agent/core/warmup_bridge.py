"""Mint the HS256 bridge JWT consumed by backend-warmup (FastAPI)."""
import os
import time

import jwt

from .authz import is_platform_admin

TTL_SECONDS = 12 * 60 * 60


def mint_warmup_token(*, user, workspace_slug: str) -> str:
    secret = os.environ.get("WARMUP_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("WARMUP_JWT_SECRET is not set — cannot mint bridge tokens")
    now = int(time.time())
    claims = {
        "iss": "agent-bridge",
        "type": "access",
        "sub": str(user.id),
        # no `platform_admin` field on User — core.authz is the canonical check
        "role": "super_admin" if is_platform_admin(user) else "client",
        "email": user.email,
        "workspace": workspace_slug,
        "iat": now,
        "exp": now + TTL_SECONDS,
    }
    return jwt.encode(claims, secret, algorithm="HS256")
