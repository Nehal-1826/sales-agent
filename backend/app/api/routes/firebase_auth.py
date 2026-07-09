"""Firebase Auth — frontend does Google sign-in with Firebase, backend
verifies the resulting ID token and issues our own JWT pair.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.session import get_db
from app.schemas.auth import AuthResponse
from app.services.auth_service import _build_user_response, _issue_token_pair, _write_audit
from app.services.crypto import get_fernet_service
from app.services.firebase_auth import verify_firebase_id_token
from app.services.security import verify_totp

router = APIRouter(prefix="/api/auth/firebase", tags=["auth", "firebase"])


class FirebaseLoginRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=4096)
    totp_code: str | None = None


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()


@router.post("", response_model=AuthResponse)
async def firebase_login(
    payload: FirebaseLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    decoded = await verify_firebase_id_token(
        payload.id_token, project_id=settings.firebase_project_id
    )

    email = (decoded.get("email") or "").lower()
    if not email or not decoded.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Firebase token has no verified email",
        )

    user = await _get_user_by_email(db, email)

    # Provider binding: refuse to let a federated (Google) identity adopt an
    # existing PASSWORD-origin account that has never verified its email — the
    # pre-account-takeover vector (attacker owns a Google account at the
    # victim's unverified signup email). Verified / pure-federated accounts log
    # in normally.
    if user is not None and user.hashed_password is not None and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "An account with this email already exists. Verify your email or "
                "sign in with your password first."
            ),
        )

    if user is None:
        new_user = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
            email_verified=True,  # Firebase asserted email_verified above
        )
        try:
            # SAVEPOINT so a racing duplicate insert rolls back just this
            # INSERT instead of poisoning the whole request transaction.
            # This endpoint is get-or-create (one route serves both login
            # and first-time signup) and the frontend fires it more than
            # once per Google sign-in, so two concurrent requests for a
            # brand-new email both pass the lookup above and both INSERT —
            # the loser hits the users_email_key unique constraint.
            #
            # The add() goes INSIDE the savepoint and the flush is left to
            # the savepoint release: an explicit flush() that fails leaves
            # the session needing a full rollback, whereas a savepoint-driven
            # flush rolls back cleanly to the savepoint (same reason
            # _write_audit adds inside begin_nested).
            async with db.begin_nested():
                db.add(new_user)
        except IntegrityError:
            # The other request won the race and already created this user.
            # Treat it as a login: re-fetch and skip the signup audit (the
            # winner wrote it).
            user = await _get_user_by_email(db, email)
            if user is None:
                raise
        else:
            user = new_user
            await _write_audit(
                db,
                action="user.signed_up",
                actor_user_id=user.id,
                actor_role=user.role.value,
                target_type="user",
                target_id=user.id,
                payload={"email": user.email, "via": "firebase"},
            )

    if user.totp_enabled:
        if not payload.totp_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="TOTP code required",
            )
        if user.totp_secret_encrypted is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="TOTP enabled but no secret on record",
            )
        secret = get_fernet_service().decrypt(user.totp_secret_encrypted).decode("utf-8")
        if not verify_totp(secret, payload.totp_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid TOTP code",
            )

    tokens = _issue_token_pair(user, plan_name=None)
    user_resp = await _build_user_response(db, user)
    await db.commit()
    return AuthResponse(tokens=tokens, user=user_resp)
