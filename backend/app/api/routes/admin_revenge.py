"""Admin Revenge Activity dashboard — super-admin only.

Thin handlers; all logic in ``services/revenge_dashboard_service``. Undo
(unsabotage) reuses the existing ``admin.unsabotage_user`` route — not
duplicated here.
"""
from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.users import User
from app.db.session import get_db
from app.services import revenge_dashboard_service as svc

router = APIRouter(
    prefix="/revenge",
    tags=["admin-revenge"],
    dependencies=[Depends(require_super_admin)],
)


@router.get("/kpis")
async def revenge_kpis(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    return await svc.get_kpis(session)


@router.get("/events")
async def revenge_events(
    session: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: Annotated[str | None, Query()] = None,
    trigger: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
) -> dict[str, Any]:
    return await svc.list_events(
        session, limit=limit, offset=offset, status=status, trigger=trigger, q=q
    )


@router.get("/sabotaged")
async def revenge_sabotaged(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    return await svc.list_sabotaged_users(session)


@router.get("/events/{event_id}/recipients")
async def revenge_recipients(
    event_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    try:
        ev_uuid = uuid.UUID(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid event id") from exc
    result = await svc.get_recipients(session, event_id=ev_uuid)
    if result is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return result


@router.post("/events/{event_id}/rerun")
async def revenge_rerun(
    event_id: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> dict[str, Any]:
    try:
        ev_uuid = uuid.UUID(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid event id") from exc
    result = await svc.rerun(session, event_id=ev_uuid, actor=actor)
    if result is None:
        raise HTTPException(status_code=404, detail="Event or target user not found")
    return result
