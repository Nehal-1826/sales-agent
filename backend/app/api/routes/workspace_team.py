"""Workspace — team members, sub-clients, API keys (spec §5.1 #8)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.team_members import TeamMember as TeamMemberModel
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.team import (
    ApiKeyCreateRequest,
    ApiKeyCreateResponse,
    ApiKeyOut,
    SubClientCreate,
    SubClientOut,
    TeamMemberInvite,
    TeamMemberOut,
)
from app.services import team_service

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _ip(r: Request) -> str | None:
    return r.client.host if r.client else None


# ---------------- Team members ----------------

@router.get("/team-members", response_model=list[TeamMemberOut])
async def list_team_members(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamMemberOut]:
    rows = await team_service.list_team_members(session, workspace_id=user.workspace_id)
    return [TeamMemberOut.model_validate(r) for r in rows]


@router.post(
    "/team-members",
    response_model=TeamMemberOut,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    payload: TeamMemberInvite,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberOut:
    row = await team_service.invite_team_member(
        session, user=user, payload=payload, ip=_ip(request)
    )
    return TeamMemberOut.model_validate(row)


@router.post("/team-members/{member_id}/accept", response_model=TeamMemberOut)
async def accept_member(
    member_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberOut:
    row = await team_service.accept_invite(
        session, user=user, member_id=member_id, ip=_ip(request)
    )
    return TeamMemberOut.model_validate(row)


@router.delete("/team-members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_member(
    member_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await team_service.revoke_invite(
        session, user=user, member_id=member_id, ip=_ip(request)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- Sub-clients ----------------

@router.get("/sub-clients", response_model=list[SubClientOut])
async def list_sub_clients(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[SubClientOut]:
    rows = await team_service.list_sub_clients(session, user=user)
    return [SubClientOut.model_validate(r) for r in rows]


@router.post(
    "/sub-clients", response_model=SubClientOut, status_code=status.HTTP_201_CREATED
)
async def create_sub_client(
    payload: SubClientCreate,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> SubClientOut:
    row = await team_service.create_sub_client(
        session, user=user, payload=payload, ip=_ip(request)
    )
    return SubClientOut.model_validate(row)


@router.delete("/sub-clients/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sub_client(
    sub_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await team_service.delete_sub_client(
        session, user=user, sub_id=sub_id, ip=_ip(request)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- API keys ----------------

@router.get("/api-keys", response_model=list[ApiKeyOut])
async def list_api_keys(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[ApiKeyOut]:
    return await team_service.list_api_keys(session, user=user)


@router.post(
    "/api-keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> ApiKeyCreateResponse:
    response = await team_service.create_api_key(
        session, user=user, payload=payload, ip=_ip(request)
    )
    try:
        from app.services.transactional_mail import send_action_notice
        await send_action_notice(
            to=user.email,
            action="API key created",
            summary=f"A new API key was created on your account: {payload.name}.",
            details={"Key prefix": response.prefix},
        )
    except Exception:
        pass
    return response


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await team_service.revoke_api_key(
        session, user=user, key_id=key_id, ip=_ip(request)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- /team/* aliases that match the frontend WorkspaceData shape ----

class TeamInvitePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: str = Field(default="member", min_length=1, max_length=64)
    can_invite: bool | None = None


def _team_member_dict(row: TeamMemberModel) -> dict[str, Any]:
    role = row.role_in_workspace or "member"
    return {
        "id": str(row.id),
        "email": row.invited_email,
        "role": role,
        "can_invite": role in ("owner", "admin"),
        "invited_at": row.created_at.isoformat() if row.created_at else None,
        "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
    }


@router.post("/team/invites", status_code=status.HTTP_201_CREATED)
async def invite_member_alias(
    payload: TeamInvitePayload,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    row = await team_service.invite_team_member(
        session,
        user=user,
        payload=TeamMemberInvite(
            invited_email=payload.email,
            role_in_workspace=payload.role,
        ),
        ip=_ip(request),
    )
    return _team_member_dict(row)


@router.delete("/team/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member_alias(
    member_id: uuid.UUID,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await team_service.revoke_invite(
        session, user=user, member_id=member_id, ip=_ip(request)
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/team")
async def list_team_alias(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    rows = await team_service.list_team_members(session, workspace_id=user.workspace_id)
    return [_team_member_dict(r) for r in rows]


@router.get("/team-activity")
async def team_activity(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = 30,
) -> list[dict[str, Any]]:
    """Daily invite + accept counts for the team-activity chart."""
    days = max(1, min(days, 365))
    cutoff_date = (datetime.now(UTC) - timedelta(days=days - 1)).date()

    invites_rows = (
        await session.execute(
            select(
                func.date(TeamMemberModel.created_at).label("d"),
                func.count().label("n"),
            )
            .where(
                TeamMemberModel.workspace_id == user.workspace_id,
                func.date(TeamMemberModel.created_at) >= cutoff_date,
            )
            .group_by(func.date(TeamMemberModel.created_at))
        )
    ).all()
    accepts_rows = (
        await session.execute(
            select(
                func.date(TeamMemberModel.accepted_at).label("d"),
                func.count().label("n"),
            )
            .where(
                TeamMemberModel.workspace_id == user.workspace_id,
                TeamMemberModel.accepted_at.is_not(None),
                func.date(TeamMemberModel.accepted_at) >= cutoff_date,
            )
            .group_by(func.date(TeamMemberModel.accepted_at))
        )
    ).all()

    invites_by_day: dict[str, int] = {
        (d.isoformat() if hasattr(d, "isoformat") else str(d)): int(n)
        for d, n in invites_rows
    }
    accepts_by_day: dict[str, int] = {
        (d.isoformat() if hasattr(d, "isoformat") else str(d)): int(n)
        for d, n in accepts_rows
    }

    today = datetime.now(UTC).date()
    out: list[dict[str, Any]] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        key = d.isoformat()
        out.append(
            {
                "date": key,
                "invites": invites_by_day.get(key, 0),
                "accepted": accepts_by_day.get(key, 0),
            }
        )
    return out


# ---------------- Workspace summary ----------------
# The frontend's `useWorkspace()` hook hits `/workspace` for an all-in-one
# response, then falls back to `/workspace/info` plus parallel team/sub-client/
# api-key fetches. Without these, /app/workspace renders "No workspace yet"
# even though the user is in one — there is no separate Workspace table, so
# we synthesise the response from the user's row + collection counts.

def _workspace_name_from_user(u: User) -> str:
    """Best-effort workspace label.

    Tries the user's display_name → company_name → email domain →
    "Workspace". Anchors to the user, since we don't have a dedicated
    Workspace table yet.
    """
    name = (getattr(u, "company_name", None) or "").strip() or None
    if name:
        return name
    if u.display_name:
        return f"{u.display_name}'s workspace"
    if u.email and "@" in u.email:
        return u.email.split("@", 1)[1].split(".")[0].title() + " workspace"
    return "Workspace"


async def _plan_slug(session: AsyncSession, user: User) -> str:
    """Resolve the user's plan to a lowercase slug ("starter"/"pro"/"agency")
    rather than its UUID. The frontend gates Agency-only features on
    ``data.plan === 'agency'`` — returning the UUID locked every Agency
    feature even on Agency accounts.
    """
    from app.db.models.plans import Plan
    if not user.plan_id:
        return "free"
    plan = await session.get(Plan, user.plan_id)
    if plan is None:
        return "free"
    return (plan.name or "").strip().lower() or "free"


@router.get("/info")
async def workspace_info(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Lightweight identity payload for the workspace switcher / page header."""
    return {
        "id": str(user.workspace_id),
        "name": _workspace_name_from_user(user),
        "plan": await _plan_slug(session, user),
        "created_at": (user.created_at.isoformat() if user.created_at else None),
    }


@router.get("")
async def workspace_overview(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """All-in-one workspace data — feeds /app/workspace's Overview tab."""
    members = await team_service.list_team_members(session, workspace_id=user.workspace_id)
    subs = await team_service.list_sub_clients(session, user=user)
    keys = await team_service.list_api_keys(session, user=user)

    # Reuse the existing 30-day team activity series (above) by re-running its
    # aggregation logic — kept inline rather than refactored out so the alias
    # endpoint stays self-contained.
    days = 30
    cutoff_date = (datetime.now(UTC) - timedelta(days=days - 1)).date()
    invites_rows = (
        await session.execute(
            select(
                func.date(TeamMemberModel.created_at).label("d"),
                func.count().label("n"),
            )
            .where(
                TeamMemberModel.workspace_id == user.workspace_id,
                func.date(TeamMemberModel.created_at) >= cutoff_date,
            )
            .group_by(func.date(TeamMemberModel.created_at))
        )
    ).all()
    accepts_rows = (
        await session.execute(
            select(
                func.date(TeamMemberModel.accepted_at).label("d"),
                func.count().label("n"),
            )
            .where(
                TeamMemberModel.workspace_id == user.workspace_id,
                TeamMemberModel.accepted_at.is_not(None),
                func.date(TeamMemberModel.accepted_at) >= cutoff_date,
            )
            .group_by(func.date(TeamMemberModel.accepted_at))
        )
    ).all()
    invites_by_day = {
        (d.isoformat() if hasattr(d, "isoformat") else str(d)): int(n) for d, n in invites_rows
    }
    accepts_by_day = {
        (d.isoformat() if hasattr(d, "isoformat") else str(d)): int(n) for d, n in accepts_rows
    }
    today = datetime.now(UTC).date()
    series: list[dict[str, Any]] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        key = d.isoformat()
        series.append(
            {
                "date": key,
                "invites": invites_by_day.get(key, 0),
                "accepted": accepts_by_day.get(key, 0),
            }
        )

    return {
        "id": str(user.workspace_id),
        "name": _workspace_name_from_user(user),
        "plan": await _plan_slug(session, user),
        "created_at": (user.created_at.isoformat() if user.created_at else None),
        "team_members": [_team_member_dict(r) for r in members],
        "sub_clients": [SubClientOut.model_validate(r).model_dump(mode="json") for r in subs],
        "api_keys": [ApiKeyOut.model_validate(r).model_dump(mode="json") for r in keys],
        "team_activity_series": series,
    }
