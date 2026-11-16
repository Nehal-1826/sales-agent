"""Workspace-scoped analytics routes (spec §5.1 items 1, 4).

Every handler is JWT-scoped via ``user.workspace_id``; the service layer
enforces cross-workspace isolation. All endpoints are read-only — no
writes to any table, no audit rows.
"""
from __future__ import annotations

import logging
import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_or_api_key as get_current_user
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.analytics import (
    BounceSpamPoint,
    DailyMetricRow,
    DashboardSummary,
    EngagementPoint,
    PlacementTrendPoint,
    WarmthHeatmap,
)
from app.services import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/workspace/analytics", tags=["workspace-analytics"]
)


def _default_range(
    from_: date | None, to: date | None, *, days: int = 30
) -> tuple[date, date]:
    return analytics_service._range_default(from_, to, days=days)


# --------------------------------------------------------------------------- #
# 1. Dashboard summary                                                        #
# --------------------------------------------------------------------------- #


@router.get("/dashboard/summary", response_model=DashboardSummary)
async def dashboard_summary(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> DashboardSummary:
    payload = await analytics_service.dashboard_summary(
        session, workspace_id=user.workspace_id
    )
    return DashboardSummary(**payload)


# --------------------------------------------------------------------------- #
# 2. Daily metrics                                                            #
# --------------------------------------------------------------------------- #


@router.get("/daily-metrics", response_model=list[DailyMetricRow])
async def daily_metrics(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    granularity: Literal["day", "week"] = Query("day"),
) -> list[DailyMetricRow]:
    frm, to_ = _default_range(from_, to)
    rows = await analytics_service.daily_metrics_rows(
        session,
        workspace_id=user.workspace_id,
        mailbox_id=mailbox_id,
        from_=frm,
        to=to_,
        granularity=granularity,
    )
    return [DailyMetricRow(**r) for r in rows]


# --------------------------------------------------------------------------- #
# 3. Placement trend                                                          #
# --------------------------------------------------------------------------- #


@router.get("/placement-trend", response_model=list[PlacementTrendPoint])
async def placement_trend(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
) -> list[PlacementTrendPoint]:
    frm, to_ = _default_range(from_, to)
    rows = await analytics_service.placement_trend(
        session,
        workspace_id=user.workspace_id,
        mailbox_id=mailbox_id,
        from_=frm,
        to=to_,
    )
    return [PlacementTrendPoint(**r) for r in rows]


# --------------------------------------------------------------------------- #
# 4. Engagement rates                                                         #
# --------------------------------------------------------------------------- #


@router.get("/engagement", response_model=list[EngagementPoint])
async def engagement(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
) -> list[EngagementPoint]:
    frm, to_ = _default_range(from_, to)
    rows = await analytics_service.engagement_rates(
        session,
        workspace_id=user.workspace_id,
        mailbox_id=mailbox_id,
        from_=frm,
        to=to_,
    )
    return [EngagementPoint(**r) for r in rows]


# --------------------------------------------------------------------------- #
# 5. Warmth heatmap                                                           #
# --------------------------------------------------------------------------- #


@router.get("/warmth-heatmap", response_model=WarmthHeatmap)
async def warmth_heatmap(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
) -> WarmthHeatmap:
    cells = await analytics_service.warmth_heatmap(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    return WarmthHeatmap(cells=cells)


# --------------------------------------------------------------------------- #
# 6. Bounce / spam trend                                                      #
# --------------------------------------------------------------------------- #


@router.get("/bounce-spam", response_model=list[BounceSpamPoint])
async def bounce_spam(
    session: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    mailbox_id: uuid.UUID | None = Query(None),
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
) -> list[BounceSpamPoint]:
    frm, to_ = _default_range(from_, to)
    rows = await analytics_service.bounce_spam_trend(
        session,
        workspace_id=user.workspace_id,
        mailbox_id=mailbox_id,
        from_=frm,
        to=to_,
    )
    return [BounceSpamPoint(**r) for r in rows]
