"""Auth routes — signup, login, refresh, /me, logout, 2FA.

Handlers stay thin: all logic lives in ``app.services.auth_service``.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TotpSetupResponse,
    TotpVerifyRequest,
    UserResponse,
)
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    response = await auth_service.signup_user(
        session,
        email=payload.email,
        password=payload.password,
        ip=_client_ip(request),
    )
    # Send verification email — failures never block signup.
    try:
        from app.config import get_settings
        from app.services.transactional_mail import send_verification_email
        token = response.user.id  # not the token — grab from DB
        # Re-fetch the token we stored in signup_user
        from app.db.models.users import User as _User
        from sqlalchemy import select as _select
        row = (await session.execute(
            _select(_User).where(_User.id == response.user.id)
        )).scalar_one_or_none()
        if row and row.email_verification_token:
            verify_url = (
                f"{get_settings().frontend_base_url}"
                f"/verify-email?token={row.email_verification_token}"
            )
            await send_verification_email(to=payload.email, verify_url=verify_url)
    except Exception:  # noqa: BLE001
        pass
    return response


@router.get("/verify-email")
async def verify_email(
    token: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    from datetime import UTC, datetime, timedelta
    from fastapi import HTTPException
    from sqlalchemy import select as _select
    from app.db.models.users import User as _User

    user = (await session.execute(
        _select(_User).where(_User.email_verification_token == token)
    )).scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

    # Idempotent: verifying an already-verified account is a success, not an
    # error. This endpoint gets hit more than once routinely — the client
    # effect can fire twice, users double-click the link, and corporate mail
    # scanners (Outlook Safe Links, antivirus gateways) PREFETCH links in
    # email before the human ever clicks. Previously the first hit consumed
    # the token and every later hit 400'd, so the account was verified in the
    # database while the user was told the link was invalid.
    if user.email_verified:
        return {"message": "Email already verified. You can log in."}

    # Tokens expire after 24h. SQLite hands back naive datetimes even for
    # timezone=True columns, so normalise before subtracting.
    if user.email_verification_sent_at:
        sent_at = user.email_verification_sent_at
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=UTC)
        age = datetime.now(UTC) - sent_at
        if age > timedelta(hours=24):
            raise HTTPException(status_code=400, detail="Verification link has expired. Request a new one.")

    user.email_verified = True
    # Deliberately keep email_verification_token. Clearing it here made the
    # endpoint single-use: a second request could no longer find the user and
    # returned "Invalid or expired verification link" for an account that had
    # just been verified successfully. Retaining it lets the already_verified
    # branch above answer repeat hits with a success. The token grants nothing
    # once email_verified is true — it only reaches that branch — and it is
    # replaced whenever a fresh verification email is issued.
    await session.commit()
    return {"message": "Email verified. You can now log in."}


@router.post("/resend-verification")
async def resend_verification(
    payload: LoginRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    import secrets as _secrets
    from datetime import UTC, datetime, timedelta
    from fastapi import HTTPException
    from sqlalchemy import select as _select
    from app.db.models.users import User as _User
    from app.config import get_settings
    from app.services.transactional_mail import send_verification_email

    user = (await session.execute(
        _select(_User).where(_User.email == payload.email.lower())
    )).scalar_one_or_none()

    # Always return 200 to not leak account existence
    if user is None or user.email_verified:
        return {"message": "If that account exists and is unverified, a new link has been sent."}

    # Rate-limit: 1 resend per minute (normalise naive datetimes — SQLite).
    if user.email_verification_sent_at:
        sent_at = user.email_verification_sent_at
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=UTC)
        age = datetime.now(UTC) - sent_at
        if age < timedelta(minutes=1):
            raise HTTPException(status_code=429, detail="Please wait before requesting another verification email.")

    token = _secrets.token_urlsafe(32)
    user.email_verification_token = token
    user.email_verification_sent_at = datetime.now(UTC)
    await session.commit()

    try:
        verify_url = (
            f"{get_settings().frontend_base_url}"
            f"/verify-email?token={token}"
        )
        await send_verification_email(to=user.email, verify_url=verify_url)
    except Exception:  # noqa: BLE001
        pass

    return {"message": "If that account exists and is unverified, a new link has been sent."}


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    return await auth_service.login_user(
        session,
        email=payload.email,
        password=payload.password,
        totp_code=payload.totp_code,
        ip=_client_ip(request),
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    payload: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    return await auth_service.refresh_tokens(
        session, refresh_token=payload.refresh_token
    )


@router.get("/me", response_model=UserResponse)
async def me(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    return await auth_service.build_me_response(session, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout() -> Response:
    # JWTs are stateless — client drops the tokens. We might add a denylist later.
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/2fa/enable", response_model=TotpSetupResponse)
async def totp_enable(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TotpSetupResponse:
    from fastapi import HTTPException
    import uuid
    STARTER_PLAN_ID = uuid.UUID("34b9234b-da0b-44c1-9150-abfeb2705c62")
    if user.plan_id == STARTER_PLAN_ID:
        raise HTTPException(
            status_code=403,
            detail="Two-factor authentication is not available on the Starter plan. Please upgrade to Pro or above."
        )
    secret, uri = await auth_service.enable_totp(session, user=user)
    return TotpSetupResponse(secret=secret, qr_provisioning_uri=uri)


@router.post("/2fa/verify", status_code=status.HTTP_204_NO_CONTENT)
async def totp_verify(
    payload: TotpVerifyRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await auth_service.verify_and_enable_totp(session, user=user, code=payload.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def totp_disable(
    payload: TotpVerifyRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await auth_service.disable_totp(session, user=user, code=payload.code)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
