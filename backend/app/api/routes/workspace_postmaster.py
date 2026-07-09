"""Workspace — Google Postmaster Tools connection management.

* ``GET    /api/workspace/postmaster/domains``        — list connected Postmaster credentials + latest snapshot.
* ``GET    /api/workspace/postmaster/oauth-start``    — return Google consent URL with packed state.
* ``GET    /api/workspace/postmaster/oauth-callback`` — exchange code, persist credential, redirect to frontend.
* ``DELETE /api/workspace/postmaster/domains/{id}``   — soft-delete (is_active=false) + audit.
"""
from __future__ import annotations

import datetime as dt
import logging
import secrets
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.models.audit_logs import AuditLog
from app.db.models.domain_credentials import DomainCredential
from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
from app.db.models.users import User
from app.db.session import get_db
from app.services import postmaster_client
from app.services.crypto import get_fernet_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/postmaster", tags=["workspace-postmaster"])

PROVIDER = "postmaster"


# --------------------------------------------------------------------------- #
# Schemas                                                                      #
# --------------------------------------------------------------------------- #


class PostmasterDomainOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    domain: str
    provider: str
    is_active: bool
    last_pulled_at: dt.datetime | None = None
    last_status: str | None = None
    created_at: dt.datetime
    latest_snapshot: dict[str, Any] | None = None


class OAuthStartResponse(BaseModel):
    auth_url: str


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    actor: User,
    action: str,
    target_id: uuid.UUID,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor.id,
        actor_role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
        action=action,
        target_type="domain_credential",
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("postmaster audit write failed action=%s: %s", action, exc)


def _pack_state(workspace_id: uuid.UUID, domain: str) -> str:
    nonce = secrets.token_urlsafe(16)
    return f"{workspace_id}:{domain}:{nonce}"


def _unpack_state(state: str) -> tuple[uuid.UUID, str]:
    parts = state.split(":", 2)
    if len(parts) < 2:
        raise ValueError("malformed state")
    ws_id = uuid.UUID(parts[0])
    domain = parts[1]
    if not domain:
        raise ValueError("missing domain")
    return ws_id, domain


async def _latest_snapshot(
    session: AsyncSession, workspace_id: uuid.UUID, domain: str
) -> DomainReputationSnapshot | None:
    return (
        await session.execute(
            select(DomainReputationSnapshot)
            .where(
                DomainReputationSnapshot.workspace_id == workspace_id,
                DomainReputationSnapshot.domain == domain,
                DomainReputationSnapshot.provider == PROVIDER,
            )
            .order_by(DomainReputationSnapshot.date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


def _snapshot_to_dict(s: DomainReputationSnapshot | None) -> dict[str, Any] | None:
    if s is None:
        return None
    return {
        "date": s.date.isoformat(),
        "spam_rate": float(s.spam_rate) if s.spam_rate is not None else None,
        "complaint_rate": (
            float(s.complaint_rate) if s.complaint_rate is not None else None
        ),
        "ip_reputation": s.ip_reputation,
        "domain_reputation": s.domain_reputation,
        "auth_pass_pct": (
            float(s.auth_pass_pct) if s.auth_pass_pct is not None else None
        ),
    }


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #


@router.get("/domains", response_model=list[PostmasterDomainOut])
async def list_postmaster_domains(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[PostmasterDomainOut]:
    rows = (
        await session.execute(
            select(DomainCredential)
            .where(
                DomainCredential.workspace_id == user.workspace_id,
                DomainCredential.provider == PROVIDER,
            )
            .order_by(DomainCredential.created_at.desc())
        )
    ).scalars().all()

    out: list[PostmasterDomainOut] = []
    for r in rows:
        snap = await _latest_snapshot(session, r.workspace_id, r.domain)
        out.append(
            PostmasterDomainOut(
                id=r.id,
                domain=r.domain,
                provider=r.provider,
                is_active=r.is_active,
                last_pulled_at=r.last_pulled_at,
                last_status=r.last_status,
                created_at=r.created_at,
                latest_snapshot=_snapshot_to_dict(snap),
            )
        )
    return out


@router.get("/oauth-start", response_model=OAuthStartResponse)
async def postmaster_oauth_start(
    user: Annotated[User, Depends(get_current_user)],
    domain: Annotated[str, Query(min_length=1, max_length=255)],
) -> OAuthStartResponse:
    state = _pack_state(user.workspace_id, domain.strip().lower())
    url = await postmaster_client.get_oauth_url(state)
    return OAuthStartResponse(auth_url=url)


@router.get("/oauth-callback")
async def postmaster_oauth_callback(
    code: Annotated[str, Query()],
    state: Annotated[str, Query()],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> RedirectResponse:
    settings = get_settings()
    try:
        workspace_id, domain = _unpack_state(state)
    except (ValueError, AttributeError) as exc:
        logger.warning("postmaster.callback.bad_state err=%s", exc)
        raise HTTPException(status_code=400, detail="Invalid state") from exc

    try:
        body = await postmaster_client.exchange_code(code)
    except Exception as exc:  # noqa: BLE001
        logger.warning("postmaster.callback.exchange_failed err=%s", exc)
        raise HTTPException(status_code=400, detail="OAuth exchange failed") from exc

    refresh_token = body.get("refresh_token")
    if not refresh_token:
        # Google omits refresh_token when the user has previously granted
        # offline access and we forgot to send ``prompt=consent``. The
        # client sends it explicitly so this should be rare — log and 400.
        logger.warning("postmaster.callback.no_refresh_token domain=%s", domain)
        raise HTTPException(
            status_code=400,
            detail="No refresh token returned. Re-run with prompt=consent.",
        )

    fernet = get_fernet_service()
    try:
        encrypted = fernet.encrypt(refresh_token.encode("utf-8"))
    finally:
        refresh_token = "REDACTED"  # noqa: F841
        del refresh_token

    existing = (
        await session.execute(
            select(DomainCredential).where(
                DomainCredential.workspace_id == workspace_id,
                DomainCredential.domain == domain,
                DomainCredential.provider == PROVIDER,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.refresh_token_encrypted = encrypted
        existing.is_active = True
        existing.last_status = "connected"
        cred_id = existing.id
    else:
        cred = DomainCredential(
            workspace_id=workspace_id,
            domain=domain,
            provider=PROVIDER,
            refresh_token_encrypted=encrypted,
            is_active=True,
            last_status="connected",
        )
        session.add(cred)
        await session.flush()
        cred_id = cred.id

    # Audit without an actor user — the OAuth callback is unauthenticated
    # in the FastAPI sense (Google is the caller), but we know the
    # workspace from the state token.
    audit = AuditLog(
        actor_user_id=None,
        actor_role="system",
        action="postmaster.connected",
        target_type="domain_credential",
        target_id=cred_id,
        payload={"domain": domain, "workspace_id": str(workspace_id)},
    )
    try:
        async with session.begin_nested():
            session.add(audit)
    except Exception as exc:  # pragma: no cover
        logger.warning("postmaster audit write failed: %s", exc)

    await session.commit()

    redirect = f"{settings.frontend_base_url.rstrip('/')}/app/reputation?postmaster=connected"
    return RedirectResponse(redirect, status_code=302)


@router.delete("/domains/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_postmaster_domain(
    cred_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    cred = await session.get(DomainCredential, cred_id)
    if cred is None or cred.workspace_id != user.workspace_id or cred.provider != PROVIDER:
        raise HTTPException(status_code=404, detail="Credential not found")
    cred.is_active = False
    cred.last_status = "disconnected"
    await _write_audit(
        session,
        actor=user,
        action="postmaster.disconnected",
        target_id=cred.id,
        payload={"domain": cred.domain},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


__all__ = ["router"]
