"""Audit-log viewer routes (§5.2 item 9) — super_admin only.

This router is mounted by ``admin.py`` with the ``/api/admin`` prefix, so
relative paths are used here.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.session import get_db
from app.schemas.audit import AuditLogListResponse, AuditStatsResponse
from app.services import audit_query_service

router = APIRouter(prefix="/audit-log", tags=["admin-audit-log"])


def _coerce_day_from(d) -> datetime | None:
    if d is None:
        return None
    if isinstance(d, datetime):
        return d
    return datetime.combine(d, time.min)


def _coerce_day_to(d) -> datetime | None:
    if d is None:
        return None
    if isinstance(d, datetime):
        return d
    return datetime.combine(d, time.max)


@router.get(
    "/stats",
    response_model=AuditStatsResponse,
    dependencies=[Depends(require_super_admin)],
)
async def stats(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AuditStatsResponse:
    return await audit_query_service.audit_stats(session)


@router.get(
    "/export.csv",
    dependencies=[Depends(require_super_admin)],
)
async def export_csv(
    session: Annotated[AsyncSession, Depends(get_db)],
    actor_user_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    target_type: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    ip: str | None = Query(None),
    search: str | None = Query(None),
) -> StreamingResponse:
    from_dt = datetime.fromisoformat(from_) if from_ else None
    to_dt = datetime.fromisoformat(to) if to else None

    chunks = await audit_query_service.collect_csv_bytes(
        session,
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        from_=from_dt,
        to=to_dt,
        ip=ip,
        search=search,
    )

    async def _gen():
        for chunk in chunks:
            yield chunk

    return StreamingResponse(
        _gen(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
    )


@router.get(
    "/",
    response_model=AuditLogListResponse,
    dependencies=[Depends(require_super_admin)],
)
async def list_audit(
    session: Annotated[AsyncSession, Depends(get_db)],
    actor_user_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    target_type: str | None = Query(None),
    from_: str | None = Query(None, alias="from"),
    to: str | None = Query(None),
    ip: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> AuditLogListResponse:
    from_dt = datetime.fromisoformat(from_) if from_ else None
    to_dt = datetime.fromisoformat(to) if to else None
    return await audit_query_service.list_audit(
        session,
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        from_=from_dt,
        to=to_dt,
        ip=ip,
        search=search,
        page=page,
        page_size=page_size,
    )
