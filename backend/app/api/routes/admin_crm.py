"""Admin CRM routes — cross-workspace, super_admin only.

Endpoints:
  GET  /admin/crm/overview                   → AdminCrmOverview
  GET  /admin/crm/workspaces/{workspace_id}  → AdminCrmWorkspaceDetail
  POST /admin/crm/sequences/{sequence_id}/status → SequenceStatusOut
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_super_admin
from app.db.models.users import User
from app.schemas.admin_crm import (
    AdminCrmOverview,
    AdminCrmWorkspaceDetail,
    SequenceStatusOut,
    SequenceStatusRequest,
)
from app.services import admin_crm_service

router = APIRouter(
    prefix="/crm",
    tags=["admin-crm"],
    dependencies=[Depends(require_super_admin)],
)


@router.get("/overview", response_model=AdminCrmOverview)
async def crm_overview(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AdminCrmOverview:
    return await admin_crm_service.get_overview(session)


@router.get("/workspaces/{workspace_id}", response_model=AdminCrmWorkspaceDetail)
async def crm_workspace_detail(
    workspace_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> AdminCrmWorkspaceDetail:
    detail = await admin_crm_service.get_workspace_detail(session, workspace_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found or has no CRM data",
        )
    return detail


@router.post("/sequences/{sequence_id}/status", response_model=SequenceStatusOut)
async def set_sequence_status(
    sequence_id: uuid.UUID,
    body: SequenceStatusRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    actor: Annotated[User, Depends(require_super_admin)],
) -> SequenceStatusOut:
    seq = await admin_crm_service.set_sequence_status(
        session,
        sequence_id=sequence_id,
        paused=body.paused,
        actor=actor,
    )
    seq_status = seq.status.value if hasattr(seq.status, "value") else str(seq.status)
    return SequenceStatusOut(
        id=seq.id,
        name=seq.name,
        status=seq_status,
        paused=(seq_status == "paused"),
    )
