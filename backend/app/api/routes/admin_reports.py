"""Admin Reports routes — cross-workspace, super_admin only.

Endpoints:
  GET  /admin/reports/types                 → list[ReportTypeItem]
  POST /admin/reports/generate              → GenerateResult
  POST /admin/reports/export                → file response (CSV/PDF/XLSX)
  GET  /admin/reports/schedules             → list[ReportScheduleOut]
  POST /admin/reports/schedules             → ReportScheduleOut
  PATCH /admin/reports/schedules/{id}       → ReportScheduleOut
  DELETE /admin/reports/schedules/{id}      → 204
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_super_admin
from app.db.models.users import User
from app.schemas.admin_reports import (
    ExportRequest,
    GenerateRequest,
    GenerateResult,
    ReportScheduleCreate,
    ReportScheduleOut,
    ReportScheduleUpdate,
    ReportTypeItem,
)
from app.services import admin_reports_service

router = APIRouter(
    prefix="/reports",
    tags=["admin-reports"],
    dependencies=[Depends(require_super_admin)],
)


@router.get("/types", response_model=list[ReportTypeItem])
async def list_types() -> list[ReportTypeItem]:
    return admin_reports_service.list_report_types()


@router.post("/generate", response_model=GenerateResult)
async def generate_report(
    body: GenerateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> GenerateResult:
    return await admin_reports_service.generate(session, body)


@router.post("/export")
async def export_report(
    body: ExportRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> Response:
    data, media_type, filename = await admin_reports_service.export(session, body, actor)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/schedules", response_model=list[ReportScheduleOut])
async def list_schedules(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[ReportScheduleOut]:
    rows = await admin_reports_service.list_schedules(session)
    return [admin_reports_service._schedule_to_out(r) for r in rows]


@router.post("/schedules", response_model=ReportScheduleOut)
async def create_schedule(
    body: ReportScheduleCreate,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> ReportScheduleOut:
    row = await admin_reports_service.create_schedule(session, payload=body, actor=actor)
    return admin_reports_service._schedule_to_out(row)


@router.patch("/schedules/{schedule_id}", response_model=ReportScheduleOut)
async def update_schedule(
    schedule_id: uuid.UUID,
    body: ReportScheduleUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> ReportScheduleOut:
    row = await admin_reports_service.update_schedule(
        session, schedule_id=schedule_id, payload=body, actor=actor
    )
    return admin_reports_service._schedule_to_out(row)


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> None:
    await admin_reports_service.delete_schedule(
        session, schedule_id=schedule_id, actor=actor
    )
