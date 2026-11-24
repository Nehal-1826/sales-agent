"""FastAPI request-scoped dependencies: auth + role guards."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any

import bcrypt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.api_keys import ApiKey
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.session import get_db
from app.services.auth_service import load_user_by_id
from app.services.security import InvalidTokenError, decode_token

_API_KEY_PREFIX = "wp_live_"
_BRIDGE_ISSUER = "agent-bridge"


def _extract_bearer(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return parts[1]


def get_current_claims(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Decode the JWT and return its claims. Raises 401 on any failure."""
    token = _extract_bearer(authorization)
    try:
        claims = decode_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if claims.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


async def _provision_bridge_user(session: AsyncSession, claims: dict[str, Any]) -> User:
    """Resolve a Django-minted agent-bridge JWT to a WarmPulse user.

    ``sub`` on bridge tokens is the *Django* user id, so the WarmPulse side
    keys on ``email`` instead: create a passwordless user on first login
    (email-verified, mailbox_pending onboarding, role from claims), return
    the existing row on every later login. Existing users are returned
    untouched — role/email are never modified (idempotent re-login).
    Lookup is case-insensitive (``func.lower``): a native row stored with
    mixed case must be matched, never duplicated by a re-provision.
    """
    email = str(claims.get("email", "")).lower()
    if not email:
        raise HTTPException(status_code=401, detail="Bridge token missing email")
    role = UserRole.super_admin if claims.get("role") == "super_admin" else UserRole.client
    user = (
        await session.execute(select(User).where(func.lower(User.email) == email))
    ).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            hashed_password=None,
            role=role,
            email_verified=True,
            onboarding_status=OnboardingStatus.mailbox_pending,
        )
        session.add(user)
        try:
            await session.commit()
        except IntegrityError:
            # A first sign-in fires several requests at once and each one
            # got here with "no user yet"; another of them inserted this
            # email first. Take its row instead of failing with a 500.
            await session.rollback()
            user = (
                await session.execute(select(User).where(func.lower(User.email) == email))
            ).scalar_one()
    return user


async def _bridge_user_or_reject_foreign_iss(
    session: AsyncSession, claims: dict[str, Any]
) -> User | None:
    """Shared ``iss`` handling for both JWT bearer paths.

    - no ``iss`` claim (every WarmPulse-issued token) → ``None``: caller
      continues with the normal sub lookup, unchanged for the mobile app.
    - ``iss=agent-bridge`` (Django-minted) → resolve through provisioning and
      return that user. The bridge ``sub`` is a Django user id and must never
      be fed to ``load_user_by_id`` — on these routes it would resolve to
      whatever WarmPulse user shares that id (cross-tenant confusion).
    - any other issuer → hard 401: a foreign-iss token must never fall
      through to the normal path, even when its sub matches a real user.

    Bridge users pass the same admin-suspension chokepoint as the normal
    path — provisioning must not become a way around a suspension.
    """
    iss = claims.get("iss")
    if iss is None:
        return None
    if iss != _BRIDGE_ISSUER:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Untrusted token issuer",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not get_settings().agent_bridge_enabled:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bridge authentication disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await _provision_bridge_user(session, claims)
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    return user


async def get_current_user(
    claims: Annotated[dict[str, Any], Depends(get_current_claims)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Decode JWT and load the user from the DB. 401 if token invalid / user missing."""
    # Agent-bridge JWTs (iss=agent-bridge, minted by the Django sales-agent)
    # resolve by email + auto-provision instead of the local sub lookup below;
    # foreign issuers are a hard 401 (see _bridge_user_or_reject_foreign_iss).
    bridge_user = await _bridge_user_or_reject_foreign_iss(session, claims)
    if bridge_user is not None:
        return bridge_user
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token (no sub)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await load_user_by_id(session, sub)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Suspended/banned users lose access immediately, even with an unexpired
    # token. Single chokepoint covering every authenticated route.
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    return user


async def _resolve_api_key(
    session: AsyncSession, raw: str
) -> User | None:
    """Match a ``wp_live_xxxx`` token against api_keys and return its owner.

    Filters by the 12-char ``prefix`` first (indexed) then bcrypt-checks the
    full key against each candidate. Updates ``last_used_at`` on a successful
    match. Returns None on any miss.
    """
    if not raw.startswith(_API_KEY_PREFIX):
        return None
    prefix = raw[:12]
    candidates = (
        await session.execute(
            select(ApiKey).where(ApiKey.prefix == prefix, ApiKey.revoked_at.is_(None))
        )
    ).scalars().all()
    for key in candidates:
        try:
            if bcrypt.checkpw(raw.encode("utf-8"), key.key_hash.encode("utf-8")):
                key.last_used_at = datetime.now(UTC)
                # Pick the first client user in the workspace as the actor.
                user = (
                    await session.execute(
                        select(User)
                        .where(
                            User.workspace_id == key.workspace_id,
                            User.role == UserRole.client,
                        )
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if user is None:
                    return None
                if getattr(user, "is_suspended", False):
                    return None
                await session.commit()
                return user
        except ValueError:
            # Malformed hash in DB — skip rather than crash the request.
            continue
    return None


async def get_current_user_or_api_key(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_db),
) -> User:
    """Bearer auth that accepts a JWT access token OR a ``wp_live_xxxx`` key.

    Programmatic clients on the Agency plan use the raw key directly:

        Authorization: Bearer wp_live_abc123...

    JWT requests fall through to the existing decode + load path.
    """
    token = _extract_bearer(authorization)
    if token.startswith(_API_KEY_PREFIX):
        user = await _resolve_api_key(session, token)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    try:
        claims = decode_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if claims.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Same iss handling as get_current_user: bridge JWTs resolve through
    # provisioning (their sub is a Django id — load_user_by_id must never see
    # it), foreign issuers are a hard 401. WarmPulse-issued tokens carry no
    # iss claim, so the normal path below is unchanged; the wp_live_ API-key
    # path above is untouched.
    bridge_user = await _bridge_user_or_reject_foreign_iss(session, claims)
    if bridge_user is not None:
        return bridge_user
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token (no sub)",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await load_user_by_id(session, sub)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Same suspension chokepoint as get_current_user — an iss-less JWT on
    # these routes must not be a way around an admin suspension.
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )
    return user


def require_super_admin(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="super_admin role required",
        )
    return user


def require_client(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="client role required",
        )
    return user
