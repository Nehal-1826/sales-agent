"""Workspace — Microsoft SNDS connect/list/disconnect endpoints.

Three handlers, all workspace-scoped and JWT-authenticated:

* ``GET    /api/workspace/snds/domains``        — list this workspace's
  active SNDS credentials with their latest snapshot.
* ``POST   /api/workspace/snds/domains``        — connect a new domain.
  Body: ``{domain: str, access_key: str}``. We validate the key by
  attempting one CSV fetch; on failure we 400 with a hint pointing at
  postmaster.live.com. On success, we encrypt + persist the key.
* ``DELETE /api/workspace/snds/domains/{id}``   — soft-disconnect (sets
  ``is_active=false``). Writes an audit row.

The access key is treated like a credential: encrypted at rest with
``FernetService``, never returned in any response, never logged.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.audit_logs import AuditLog
from app.db.models.domain_credentials import DomainCredential
from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
from app.db.models.users import User
from app.db.session import get_db
from app.services.crypto import get_fernet_service
from app.services.snds_client import get_snds_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/snds", tags=["workspace-snds"])


# --------------------------------------------------------------------------- #
# Schemas                                                                      #
# --------------------------------------------------------------------------- #


class ConnectSndsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    domain: str = Field(min_length=3, max_length=255)
    access_key: str = Field(min_length=8, max_length=512)


class SndsDomainOut(BaseModel):
    id: uuid.UUID
    domain: str
    is_active: bool
    last_pulled_at: datetime | None
    last_status: str | None
    latest_snapshot: dict[str, Any] | None


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor: User,
    target_id: uuid.UUID | None,
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
        logger.warning("audit write failed action=%s err=%s", action, exc)


async def _latest_snapshot(
    session: AsyncSession, *, workspace_id: uuid.UUID, domain: str
) -> dict[str, Any] | None:
    row = (
        await session.execute(
            select(DomainReputationSnapshot)
            .where(
                DomainReputationSnapshot.workspace_id == workspace_id,
                DomainReputationSnapshot.domain == domain,
                DomainReputationSnapshot.provider == "snds",
            )
            .order_by(DomainReputationSnapshot.date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return None
    return {
        "date": row.date.isoformat() if row.date else None,
        "complaint_rate": float(row.complaint_rate) if row.complaint_rate is not None else None,
        "ip_reputation": row.ip_reputation,
        "trap_hits": (row.raw or {}).get("trap_hits", 0),
        "filter_result_counts": (row.raw or {}).get("filter_result_counts", {}),
    }


# --------------------------------------------------------------------------- #
# Routes                                                                       #
# --------------------------------------------------------------------------- #


@router.get("/domains")
async def list_snds_domains(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[SndsDomainOut]:
    """Active SNDS credentials in this workspace + latest snapshot per domain."""
    creds = (
        await session.execute(
            select(DomainCredential).where(
                DomainCredential.workspace_id == user.workspace_id,
                DomainCredential.provider == "snds",
                DomainCredential.is_active.is_(True),
            )
        )
    ).scalars().all()
    out: list[SndsDomainOut] = []
    for c in creds:
        snap = await _latest_snapshot(session, workspace_id=user.workspace_id, domain=c.domain)
        out.append(
            SndsDomainOut(
                id=c.id,
                domain=c.domain,
                is_active=c.is_active,
                last_pulled_at=c.last_pulled_at,
                last_status=c.last_status,
                latest_snapshot=snap,
            )
        )
    return out


@router.post("/domains", status_code=status.HTTP_201_CREATED)
async def connect_snds_domain(
    body: ConnectSndsBody,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SndsDomainOut:
    """Validate the access key by fetching once, then encrypt + persist."""
    domain = body.domain.strip().lower()
    access_key = body.access_key.strip()

    client = get_snds_client()
    ok = False
    try:
        ok = await client.validate_key(access_key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("snds.connect.validate_error domain=%s err=%s", domain, exc)
        ok = False
    if not ok:
        # Wipe the local plaintext before raising.
        access_key = "REDACTED"  # noqa: F841
        del access_key
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid SNDS access key or domain",
        )

    fernet = get_fernet_service()
    enc = fernet.encrypt(access_key.encode("utf-8"))
    # Drop plaintext from the local frame.
    access_key = "REDACTED"  # noqa: F841
    del access_key

    # Upsert by (workspace, domain, snds) — if a stale soft-disconnected
    # row exists, we revive it rather than insert-conflicting.
    existing = (
        await session.execute(
            select(DomainCredential).where(
                DomainCredential.workspace_id == user.workspace_id,
                DomainCredential.domain == domain,
                DomainCredential.provider == "snds",
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.access_key_encrypted = enc
        existing.is_active = True
        existing.last_status = "connected"
        cred = existing
    else:
        cred = DomainCredential(
            workspace_id=user.workspace_id,
            domain=domain,
            provider="snds",
            access_key_encrypted=enc,
            is_active=True,
            last_status="connected",
        )
        session.add(cred)

    await session.flush()
    await _write_audit(
        session,
        action="snds.connect",
        actor=user,
        target_id=cred.id,
        payload={"domain": domain},
    )
    await session.commit()

    snap = await _latest_snapshot(session, workspace_id=user.workspace_id, domain=domain)
    return SndsDomainOut(
        id=cred.id,
        domain=cred.domain,
        is_active=cred.is_active,
        last_pulled_at=cred.last_pulled_at,
        last_status=cred.last_status,
        latest_snapshot=snap,
    )


@router.delete("/domains/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_snds_domain(
    cred_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cred = (
        await session.execute(
            select(DomainCredential).where(
                DomainCredential.id == cred_id,
                DomainCredential.workspace_id == user.workspace_id,
                DomainCredential.provider == "snds",
            )
        )
    ).scalar_one_or_none()
    if cred is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SNDS credential not found")
    cred.is_active = False
    cred.last_status = "disconnected"
    await _write_audit(
        session,
        action="snds.disconnect",
        actor=user,
        target_id=cred.id,
        payload={"domain": cred.domain},
    )
    await session.commit()
    return None
