"""Workspace — dedicated peer-pool status (Agency / Enterprise tier).

GET /api/workspace/dedicated-pool — returns the workspace's
dedicated-pool routing status. Non-Agency/Enterprise plans receive a 402
so the frontend can render an upgrade prompt rather than a misleading
"no dedicated pool" empty state.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.session import get_db
from app.services import peer_pool_service

router = APIRouter(
    prefix="/api/workspace/dedicated-pool",
    tags=["workspace-dedicated-pool"],
)

_AGENCY_PLAN_SLUGS = {"agency", "enterprise"}


async def _require_agency_or_enterprise(
    session: AsyncSession, user: User
) -> None:
    """Raise 402 when the workspace owner is not on Agency/Enterprise.

    Mirrors the gate used by ``branding_service`` and
    ``custom_domain_service`` so the upgrade UX is consistent.
    """
    stmt = (
        select(Plan.name)
        .join(User, User.plan_id == Plan.id)
        .where(User.workspace_id == user.workspace_id)
    )
    names = [
        (n or "").strip().lower()
        for n in (await session.execute(stmt)).scalars().all()
    ]
    if not any(n in _AGENCY_PLAN_SLUGS for n in names):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Dedicated pool is an Agency/Enterprise feature",
        )


@router.get("")
async def get_dedicated_pool(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    await _require_agency_or_enterprise(session, user)
    return await peer_pool_service.get_status_for_workspace(
        session, user.workspace_id
    )


__all__ = ["router"]
