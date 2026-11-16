"""Business logic for workspace team / sub-clients / api keys.

Handlers stay thin; capability gating, audit writes, and DB mutations all
live here. API-key raw values are returned to the caller ONCE and never
logged — only the bcrypt hash persists.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

import bcrypt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.api_keys import ApiKey
from app.db.models.audit_logs import AuditLog
from app.db.models.plans import Plan
from app.db.models.sub_clients import SubClient
from app.db.models.team_members import TeamMember
from app.db.models.users import User, UserRole
from app.schemas.team import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyOut,
    SubClientCreate,
    TeamMemberInvite,
)

logger = logging.getLogger(__name__)

_API_KEY_PREFIX = "wp_live_"


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
    except Exception as exc:  # pragma: no cover
        logger.warning("audit write failed action=%s: %s", action, exc)


# ---------------- capability helpers ----------------

async def _load_plan(session: AsyncSession, user: User) -> Plan | None:
    if user.plan_id is None:
        return None
    return await session.get(Plan, user.plan_id)


async def _require_capability(session: AsyncSession, user: User, cap: str) -> None:
    # super_admin bypasses plan gating.
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role == UserRole.super_admin.value:
        return
    plan = await _load_plan(session, user)
    caps = (plan.capabilities if plan else {}) or {}
    if not bool(caps.get(cap)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your current plan does not include '{cap}'. Please upgrade.",
        )


# ---------------- Team members ----------------

async def list_team_members(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[TeamMember]:
    result = await session.execute(
        select(TeamMember).where(TeamMember.workspace_id == workspace_id).order_by(
            TeamMember.created_at.desc()
        )
    )
    return list(result.scalars().all())


async def invite_team_member(
    session: AsyncSession,
    *,
    user: User,
    payload: TeamMemberInvite,
    ip: str | None = None,
) -> TeamMember:
    await _require_capability(session, user, "can_invite_team_members")
    member = TeamMember(
        workspace_id=user.workspace_id,
        invited_email=payload.invited_email.lower(),
        role_in_workspace=payload.role_in_workspace,
    )
    session.add(member)
    await session.flush()
    await _write_audit(
        session,
        action="team.invite_created",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="team_member",
        target_id=member.id,
        payload={"email": member.invited_email},
        ip=ip,
    )
    await session.commit()
    await session.refresh(member)
    return member


async def accept_invite(
    session: AsyncSession, *, user: User, member_id: uuid.UUID, ip: str | None = None
) -> TeamMember:
    member = await session.get(TeamMember, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if member.invited_email.lower() != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invite email does not match the current user",
        )
    member.accepted_at = datetime.now(UTC)
    await session.flush()
    await _write_audit(
        session,
        action="team.invite_accepted",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="team_member",
        target_id=member.id,
        ip=ip,
    )
    await session.commit()
    await session.refresh(member)
    return member


async def revoke_invite(
    session: AsyncSession, *, user: User, member_id: uuid.UUID, ip: str | None = None
) -> None:
    member = await session.get(TeamMember, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Invite not found")
    if member.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Invite not found")
    await session.delete(member)
    await _write_audit(
        session,
        action="team.invite_revoked",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="team_member",
        target_id=member_id,
        ip=ip,
    )
    await session.commit()


# ---------------- Sub-clients ----------------

async def list_sub_clients(
    session: AsyncSession, *, user: User
) -> list[SubClient]:
    await _require_capability(session, user, "can_create_sub_clients")
    result = await session.execute(
        select(SubClient).where(SubClient.parent_workspace_id == user.workspace_id)
    )
    return list(result.scalars().all())


async def create_sub_client(
    session: AsyncSession,
    *,
    user: User,
    payload: SubClientCreate,
    ip: str | None = None,
) -> SubClient:
    await _require_capability(session, user, "can_create_sub_clients")
    sub = SubClient(
        parent_workspace_id=user.workspace_id,
        name=payload.name,
        contact_email=payload.contact_email,
    )
    session.add(sub)
    await session.flush()
    await _write_audit(
        session,
        action="sub_client.created",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="sub_client",
        target_id=sub.id,
        payload={"name": sub.name},
        ip=ip,
    )
    await session.commit()
    await session.refresh(sub)
    return sub


async def delete_sub_client(
    session: AsyncSession, *, user: User, sub_id: uuid.UUID, ip: str | None = None
) -> None:
    await _require_capability(session, user, "can_create_sub_clients")
    sub = await session.get(SubClient, sub_id)
    if sub is None or sub.parent_workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="Sub-client not found")
    await session.delete(sub)
    await _write_audit(
        session,
        action="sub_client.deleted",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="sub_client",
        target_id=sub_id,
        ip=ip,
    )
    await session.commit()


# ---------------- API keys ----------------

def _generate_raw_key() -> tuple[str, str]:
    """Return (raw_key, prefix). Raw includes prefix: wp_live_<token>."""
    raw = _API_KEY_PREFIX + secrets.token_urlsafe(32)
    prefix = raw[:12]  # 'wp_live_' + 4 chars → recognisable but opaque
    return raw, prefix


def _mask(prefix: str) -> str:
    return f"{prefix}***"


def _to_out(key: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=key.id,
        workspace_id=key.workspace_id,
        name=key.name,
        prefix=key.prefix,
        masked=_mask(key.prefix),
        last_used_at=key.last_used_at,
        revoked_at=key.revoked_at,
        created_at=key.created_at,
    )


async def list_api_keys(
    session: AsyncSession, *, user: User
) -> list[ApiKeyOut]:
    await _require_capability(session, user, "can_issue_api_keys")
    result = await session.execute(
        select(ApiKey).where(ApiKey.workspace_id == user.workspace_id).order_by(
            ApiKey.created_at.desc()
        )
    )
    return [_to_out(k) for k in result.scalars().all()]


async def create_api_key(
    session: AsyncSession,
    *,
    user: User,
    payload: ApiKeyCreateRequest,
    ip: str | None = None,
) -> ApiKeyCreateResponse:
    await _require_capability(session, user, "can_issue_api_keys")
    raw, prefix = _generate_raw_key()
    key_hash = bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    key = ApiKey(
        workspace_id=user.workspace_id,
        key_hash=key_hash,
        prefix=prefix,
        name=payload.name,
    )
    session.add(key)
    await session.flush()
    await _write_audit(
        session,
        action="api_key.created",
        actor_user_id=user.id,
        actor_role=user.role.value,
        target_type="api_key",
        target_id=key.id,
        payload={"prefix": prefix, "name": payload.name},
        ip=ip,
    )
    await session.commit()
    await session.refresh(key)
    # raw key returned once; never logged.
    return ApiKeyCreateResponse(id=key.id, name=key.name, prefix=prefix, key=raw)


async def revoke_api_key(
    session: AsyncSession, *, user: User, key_id: uuid.UUID, ip: str | None = None
) -> ApiKey:
    await _require_capability(session, user, "can_issue_api_keys")
    key = await session.get(ApiKey, key_id)
    if key is None or key.workspace_id != user.workspace_id:
        raise HTTPException(status_code=404, detail="API key not found")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(UTC)
        await session.flush()
        await _write_audit(
            session,
            action="api_key.revoked",
            actor_user_id=user.id,
            actor_role=user.role.value,
            target_type="api_key",
            target_id=key.id,
            ip=ip,
        )
        await session.commit()
        await session.refresh(key)
    return key
