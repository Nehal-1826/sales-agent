"""Password hashing, JWT issuing/decoding, and TOTP helpers."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pyotp
from passlib.context import CryptContext

from app.config import get_settings

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------- passwords ----------

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------- JWT ----------

class InvalidTokenError(Exception):
    """Raised when a token is missing, expired, or has a bad signature."""


def _now_utc() -> datetime:
    return datetime.now(UTC)


def _encode(claims: dict[str, Any], expires_delta: timedelta) -> str:
    settings = get_settings()
    to_encode = dict(claims)
    to_encode["iat"] = _now_utc()
    to_encode["exp"] = _now_utc() + expires_delta
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(
    subject: str,
    *,
    role: str,
    workspace_id: str | None = None,
    plan: str | None = None,
    extra: dict[str, Any] | None = None,
    ttl_minutes: int | None = None,
) -> str:
    settings = get_settings()
    claims: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": "access",
    }
    if workspace_id is not None:
        claims["workspace_id"] = workspace_id
    if plan is not None:
        claims["plan"] = plan
    if extra:
        claims.update(extra)
    minutes = ttl_minutes if ttl_minutes is not None else settings.jwt_access_ttl_minutes
    return _encode(claims, timedelta(minutes=minutes))


def create_refresh_token(subject: str, *, role: str) -> str:
    settings = get_settings()
    return _encode(
        {"sub": subject, "role": role, "type": "refresh"},
        timedelta(days=settings.jwt_refresh_ttl_days),
    )


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc


# ---------- TOTP ----------

def generate_totp_secret() -> str:
    """Return a new base32 TOTP secret. Caller should Fernet-encrypt before storage."""
    return pyotp.random_base32()


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def totp_provisioning_uri(secret: str, *, account_name: str, issuer: str = "WarmPulse") -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account_name, issuer_name=issuer)
