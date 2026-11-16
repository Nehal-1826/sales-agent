"""Workspace-scoped Tools endpoints (spec §5.1 item 6).

Four sub-pages, one router — everything is mounted under
``/api/workspace/tools``:

* ``/placement`` — inbox placement tester (peer-pool mocked for MVP).
* ``/spam-scan`` — subject+body spam-trigger scanner.
* ``/templates`` — email template CRUD + LLM generation + HTML preview.
* ``/warmup-preview`` — dry-run sample messages from the content generator.

All handlers are thin; real work happens in ``app.services.tools_service``.
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.tools import (
    PlacementTestListResponse,
    PlacementTestRequest,
    PlacementTestResult,
    SpamScanListResponse,
    SpamScanRequest,
    SpamScanResult,
    TemplateCreateRequest,
    TemplateGenerateRequest,
    TemplateGenerateResponse,
    TemplateListResponse,
    TemplateOut,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    TemplateUpdateRequest,
    WarmupPreviewRequest,
    WarmupPreviewResult,
    WarmupSample,
)
from app.services import tools_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace/tools", tags=["workspace-tools"])


# --------------------------------------------------------------------------- #
# Placement Tester                                                             #
# --------------------------------------------------------------------------- #


@router.post("/placement", response_model=PlacementTestResult, status_code=status.HTTP_201_CREATED)
async def run_placement(
    payload: PlacementTestRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PlacementTestResult:
    logger.info("placement.run user=%s mailbox=%s", user.id, payload.mailbox_id)
    row = await tools_service.run_placement_test(
        session,
        user=user,
        mailbox_id=payload.mailbox_id,
        subject=payload.subject,
        body=payload.body,
        is_html=payload.is_html,
    )
    return PlacementTestResult(**tools_service.placement_to_dict(row))


@router.get("/placement", response_model=PlacementTestListResponse)
async def list_placement(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PlacementTestListResponse:
    rows, total = await tools_service.list_placement_tests(
        session, workspace_id=user.workspace_id, page=page, page_size=page_size
    )
    return PlacementTestListResponse(
        items=[PlacementTestResult(**tools_service.placement_to_dict(r)) for r in rows],
        total=total,
    )


@router.get("/placement/{test_id}", response_model=PlacementTestResult)
async def get_placement(
    test_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> PlacementTestResult:
    row = await tools_service.get_placement_test(
        session, workspace_id=user.workspace_id, test_id=test_id
    )
    return PlacementTestResult(**tools_service.placement_to_dict(row))


# --------------------------------------------------------------------------- #
# Spam Scanner                                                                #
# --------------------------------------------------------------------------- #


@router.post("/spam-scan", response_model=SpamScanResult, status_code=status.HTTP_201_CREATED)
async def run_scan(
    payload: SpamScanRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> SpamScanResult:
    logger.info("spam_scan.run user=%s is_html=%s", user.id, payload.is_html)
    row = await tools_service.run_spam_scan(
        session,
        user=user,
        subject=payload.subject,
        body=payload.body,
        is_html=payload.is_html,
    )
    return SpamScanResult(**tools_service.spam_scan_to_dict(row))


@router.get("/spam-scan", response_model=SpamScanListResponse)
async def list_scans(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> SpamScanListResponse:
    rows, total = await tools_service.list_spam_scans(
        session, user=user, page=page, page_size=page_size
    )
    return SpamScanListResponse(
        items=[SpamScanResult(**tools_service.spam_scan_to_dict(r)) for r in rows],
        total=total,
    )


# --------------------------------------------------------------------------- #
# Template Designer                                                           #
# --------------------------------------------------------------------------- #


@router.get("/templates", response_model=TemplateListResponse)
async def list_templates_route(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TemplateListResponse:
    rows = await tools_service.list_templates(session, workspace_id=user.workspace_id)
    items = [TemplateOut(**tools_service.template_to_dict(r)) for r in rows]
    return TemplateListResponse(items=items, total=len(items))


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template_route(
    payload: TemplateCreateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TemplateOut:
    row = await tools_service.create_template(
        session,
        user=user,
        name=payload.name,
        html=payload.html,
        thumbnail=payload.thumbnail,
        created_with_llm=payload.created_with_llm,
    )
    return TemplateOut(**tools_service.template_to_dict(row))


@router.patch("/templates/{template_id}", response_model=TemplateOut)
async def update_template_route(
    template_id: uuid.UUID,
    payload: TemplateUpdateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TemplateOut:
    row = await tools_service.update_template(
        session,
        user=user,
        template_id=template_id,
        name=payload.name,
        html=payload.html,
        thumbnail=payload.thumbnail,
    )
    return TemplateOut(**tools_service.template_to_dict(row))


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_route(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    await tools_service.delete_template(session, user=user, template_id=template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/templates/{template_id}/generate-llm", response_model=TemplateGenerateResponse
)
async def generate_template_route(
    template_id: uuid.UUID,
    payload: TemplateGenerateRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> TemplateGenerateResponse:
    html = await tools_service.generate_template_with_llm(
        session,
        user=user,
        template_id=template_id,
        prompt=payload.prompt,
        settings=get_settings(),
    )
    return TemplateGenerateResponse(html=html)


@router.post("/templates/preview", response_model=TemplatePreviewResponse)
async def preview_template_route(
    payload: TemplatePreviewRequest,
    _user: Annotated[User, Depends(get_current_user)],
) -> TemplatePreviewResponse:
    return TemplatePreviewResponse(html=tools_service.sanitize_html(payload.html))


# --------------------------------------------------------------------------- #
# Warmup Preview                                                              #
# --------------------------------------------------------------------------- #


@router.post("/warmup-preview", response_model=WarmupPreviewResult)
async def warmup_preview_route(
    payload: WarmupPreviewRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> WarmupPreviewResult:
    samples = await tools_service.warmup_preview(
        session,
        user=user,
        mailbox_id=payload.mailbox_id,
        count=payload.count,
        mode=payload.mode,
        settings=get_settings(),
    )
    return WarmupPreviewResult(samples=[WarmupSample(**s) for s in samples])
