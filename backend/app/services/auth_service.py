"""Business logic for signup / login / refresh / 2FA.

Route handlers stay thin — they parse requests, call these helpers, and
format responses. Anything that touches the DB, crypto, or security
helpers lives here so it can be tested in isolation.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

import pyotp
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.audit_logs import AuditLog
from app.db.models.plans import Plan
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.models.workspace_settings import WorkspaceSetting
from app.schemas.auth import (
    AuthResponse,
    TokenPair,
    UserResponse,
)
from app.services.crypto import FernetService, get_fernet_service
from app.services.security import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    hash_password,
    totp_provisioning_uri,
    verify_password,
    verify_totp,
)

logger = logging.getLogger(__name__)


# ---------- audit helper (best-effort) ----------

async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor_user_id: uuid.UUID | None,
    actor_role: str | None,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Best-effort audit write. Uses a savepoint so a failure here can't
    poison the outer transaction — the caller's subsequent commit will still
    succeed."""
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
        ip=ip,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover — audit never fails the request
        logger.warning("audit write failed action=%s: %s", action, exc)


# ---------- user -> response helpers ----------

async def _plan_name_for_user(session: AsyncSession, user: User) -> str | None:
    if user.plan_id is None:
        return None
    plan = await session.get(Plan, user.plan_id)
    return plan.name if plan else None


async def _build_user_response(session: AsyncSession, user: User) -> UserResponse:
    plan_name = await _plan_name_for_user(session, user)
    ws = await session.get(WorkspaceSetting, user.workspace_id)
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        onboarding_status=(
            user.onboarding_status.value
            if hasattr(user.onboarding_status, "value")
            else str(user.onboarding_status)
        ),
        workspace_id=user.workspace_id,
        plan=plan_name,
        crm_addon=bool(ws and ws.crm_addon_enabled),
        totp_enabled=user.totp_enabled,
        email_verified=bool(user.email_verified),
        created_at=user.created_at,
    )


def _issue_token_pair(user: User, plan_name: str | None) -> TokenPair:
    settings = get_settings()
    jti_access = uuid.uuid4().hex
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    access = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
        plan=plan_name,
        extra={"jti": jti_access},
    )
    refresh = create_refresh_token(
        subject=str(user.id),
        role=role,
    )
    # create_refresh_token doesn't support extra claims; re-issue via _encode is
    # unnecessary here — rotation is driven by short TTL + rotation-on-use.
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        expires_in=settings.jwt_access_ttl_minutes * 60,
    )


async def _fetch_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


# ---------- signup ----------

async def signup_user(
    session: AsyncSession, *, email: str, password: str, ip: str | None = None
) -> AuthResponse:
    from fastapi import HTTPException, status

    existing = await _fetch_user_by_email(session, email)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    import secrets as _secrets
    from datetime import UTC, datetime

    verification_token = _secrets.token_urlsafe(32)
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        workspace_id=uuid.uuid4(),
        role=UserRole.client,
        onboarding_status=OnboardingStatus.signed_up,
        totp_enabled=False,
        email_verified=False,
        email_verification_token=verification_token,
        email_verification_sent_at=datetime.now(UTC),
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        ) from None

    await _write_audit(
        session,
        action="user.signed_up",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="user",
        target_id=user.id,
        payload={"email": user.email},
        ip=ip,
    )
    tokens = _issue_token_pair(user, plan_name=None)
    user_resp = await _build_user_response(session, user)
    await session.commit()
    return AuthResponse(tokens=tokens, user=user_resp)


# ---------- login ----------

async def login_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    totp_code: str | None,
    ip: str | None = None,
) -> AuthResponse:
    from fastapi import HTTPException, status

    user = await _fetch_user_by_email(session, email)
    if user is None or user.hashed_password is None or not verify_password(
        password, user.hashed_password
    ):
        await _write_audit(
            session,
            action="user.login_failed",
            actor_user_id=user.id if user else None,
            actor_role=(user.role.value if user else None),
            payload={"email": email.lower(), "reason": "invalid_credentials"},
            ip=ip,
        )
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended",
        )

    if not user.email_verified and user.role != UserRole.super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_not_verified",
        )

    if user.totp_enabled:
        if not totp_code:
            await _write_audit(
                session,
                action="user.login_failed",
                actor_user_id=user.id,
                actor_role=user.role.value,
                payload={"reason": "totp_required"},
                ip=ip,
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="TOTP code required",
            )
        if user.totp_secret_encrypted is None:
            # Shouldn't happen — totp_enabled without secret. Treat as misconfig.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="TOTP enabled but no secret on record",
            )
        fernet = get_fernet_service()
        secret = fernet.decrypt(user.totp_secret_encrypted).decode("utf-8")
        if not verify_totp(secret, totp_code):
            await _write_audit(
                session,
                action="user.login_failed",
                actor_user_id=user.id,
                actor_role=user.role.value,
                payload={"reason": "invalid_totp"},
                ip=ip,
            )
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid TOTP code",
            )

    plan_name = await _plan_name_for_user(session, user)
    tokens = _issue_token_pair(user, plan_name=plan_name)
    user_resp = await _build_user_response(session, user)
    await _write_audit(
        session,
        action="user.login",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="user",
        target_id=user.id,
        ip=ip,
    )
    await session.commit()
    return AuthResponse(tokens=tokens, user=user_resp)


# ---------- refresh ----------

async def refresh_tokens(session: AsyncSession, *, refresh_token: str) -> AuthResponse:
    from fastapi import HTTPException, status

    try:
        claims = decode_token(refresh_token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid refresh token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    if claims.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Expected refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_raw = claims.get("sub")
    if not user_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token (no sub)"
        )
    try:
        user_id = uuid.UUID(user_id_raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token (bad sub)"
        ) from exc

    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists"
        )
    if user.is_suspended:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended"
        )

    plan_name = await _plan_name_for_user(session, user)
    tokens = _issue_token_pair(user, plan_name=plan_name)
    user_resp = await _build_user_response(session, user)
    return AuthResponse(tokens=tokens, user=user_resp)


# ---------- /me ----------

async def build_me_response(session: AsyncSession, user: User) -> UserResponse:
    return await _build_user_response(session, user)


# ---------- 2FA ----------

async def enable_totp(
    session: AsyncSession, *, user: User
) -> tuple[str, str]:
    """Generate + persist (encrypted) a new TOTP secret. Returns (secret, uri).

    Does NOT flip ``totp_enabled`` — caller must verify a code first.
    """
    fernet: FernetService = get_fernet_service()
    secret = generate_totp_secret()
    user.totp_secret_encrypted = fernet.encrypt(secret.encode("utf-8"))
    # leave totp_enabled = False until /2fa/verify
    await session.flush()
    uri = totp_provisioning_uri(secret, account_name=user.email, issuer="WarmPulse")
    await _write_audit(
        session,
        action="user.totp_setup_initiated",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="user",
        target_id=user.id,
    )
    await session.commit()
    return secret, uri


async def verify_and_enable_totp(
    session: AsyncSession, *, user: User, code: str
) -> None:
    from fastapi import HTTPException, status

    if user.totp_secret_encrypted is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No TOTP setup in progress — call /2fa/enable first",
        )
    fernet = get_fernet_service()
    secret = fernet.decrypt(user.totp_secret_encrypted).decode("utf-8")
    if not verify_totp(secret, code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP code"
        )
    user.totp_enabled = True
    await session.flush()
    await _write_audit(
        session,
        action="user.totp_enabled",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="user",
        target_id=user.id,
    )
    await session.commit()


async def disable_totp(session: AsyncSession, *, user: User, code: str) -> None:
    from fastapi import HTTPException, status

    if not user.totp_enabled or user.totp_secret_encrypted is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP is not enabled"
        )
    fernet = get_fernet_service()
    secret = fernet.decrypt(user.totp_secret_encrypted).decode("utf-8")
    if not verify_totp(secret, code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP code"
        )
    user.totp_enabled = False
    user.totp_secret_encrypted = None
    await session.flush()
    await _write_audit(
        session,
        action="user.totp_disabled",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="user",
        target_id=user.id,
    )
    await session.commit()


# ---------- lookup helper used by deps.get_current_user ----------

async def load_user_by_id(
    session: AsyncSession, user_id: uuid.UUID | str
) -> User | None:
    if isinstance(user_id, str):
        try:
            user_id = uuid.UUID(user_id)
        except (ValueError, TypeError):
            return None
    return await session.get(User, user_id)


_pyotp = pyotp  # re-export so tests can monkeypatch via auth_service._pyotp if needed
