"""Admin LLM usage + cost tracking (spec §6).

All endpoints are ``super_admin``-only. Handlers stay thin — filtering and
aggregation live inline because there is no existing ``llm_usage_service``
and the surface is small. The endpoints power a single dashboard page
(per-user usage, mode breakdown, EOM forecast, cap editor).
"""
from __future__ import annotations

import calendar
import logging
import uuid
from datetime import UTC, datetime, time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.audit_logs import AuditLog
from app.db.models.llm_usage import LlmUsage
from app.db.models.mailboxes import ContentMode
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.llm_usage import (
    LlmModeSummary,
    LlmPerUserDetail,
    LlmPerUserSummary,
    LlmTimeSeriesPoint,
    LlmUsageListResponse,
    LlmUsageRow,
    LlmUsageSummary,
    LlmUsageTimeSeries,
    TokenCapUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/llm-usage", tags=["admin-llm-usage"])


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _month_start_utc(now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    return datetime.combine(now.date().replace(day=1), time.min, tzinfo=UTC)


def _mode_str(mode: Any) -> str:
    return mode.value if hasattr(mode, "value") else str(mode)


def _row_to_out(row: LlmUsage, email: str | None, plan_name: str | None) -> LlmUsageRow:
    return LlmUsageRow(
        id=row.id,
        user_id=row.user_id,
        user_email=email,
        plan_name=plan_name,
        mailbox_id=row.mailbox_id,
        mode=_mode_str(row.mode),
        prompt_tokens=row.prompt_tokens,
        completion_tokens=row.completion_tokens,
        total_tokens=row.prompt_tokens + row.completion_tokens,
        cost_cents=row.cost_cents,
        created_at=row.created_at,
    )


# --------------------------------------------------------------------------- #
# Summary (mounted BEFORE /{user_id} so the router doesn't swallow it)        #
# --------------------------------------------------------------------------- #


@router.get(
    "/summary",
    response_model=LlmUsageSummary,
    dependencies=[Depends(require_super_admin)],
)
async def get_summary(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LlmUsageSummary:
    since = _month_start_utc()
    now = datetime.now(UTC)

    totals = await session.execute(
        select(
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ),
            func.coalesce(func.sum(LlmUsage.cost_cents), 0),
        ).where(LlmUsage.created_at >= since)
    )
    total_tokens, total_cost = totals.one()

    by_user_stmt = (
        select(
            User.id,
            User.email,
            Plan.name,
            Plan.token_cap_per_month,
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ).label("tokens"),
            func.coalesce(func.sum(LlmUsage.cost_cents), 0).label("cost"),
        )
        .select_from(LlmUsage)
        .join(User, User.id == LlmUsage.user_id)
        .join(Plan, Plan.id == User.plan_id, isouter=True)
        .where(LlmUsage.created_at >= since)
        .group_by(User.id, User.email, Plan.name, Plan.token_cap_per_month)
    )
    user_rows = (await session.execute(by_user_stmt)).all()
    by_user = [
        LlmPerUserSummary(
            user_id=r[0],
            email=r[1],
            plan=r[2],
            tokens_mtd=int(r[4]),
            cost_cents_mtd=int(r[5]),
            cap=int(r[3] or 0),
            pct_used=(float(r[4]) / r[3] * 100.0) if r[3] else 0.0,
        )
        for r in user_rows
    ]

    by_mode_stmt = (
        select(
            LlmUsage.mode,
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ),
        )
        .where(LlmUsage.created_at >= since)
        .group_by(LlmUsage.mode)
    )
    mode_raw = {
        _mode_str(m): int(t) for m, t in (await session.execute(by_mode_stmt)).all()
    }
    by_mode = LlmModeSummary(
        A=mode_raw.get("A", 0),
        B=mode_raw.get("B", 0),
        C=mode_raw.get("C", 0),
        D=mode_raw.get("D", 0),
    )

    days_elapsed = max((now.date() - since.date()).days + 1, 1)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    days_left = max(days_in_month - now.day, 0)
    daily_avg = float(total_cost) / days_elapsed
    forecast = int(round(total_cost + daily_avg * days_left))

    return LlmUsageSummary(
        total_tokens_mtd=int(total_tokens),
        total_cost_cents_mtd=int(total_cost),
        by_user=by_user,
        by_mode=by_mode,
        forecast_eom_cents=forecast,
    )


# --------------------------------------------------------------------------- #
# List (filterable, paginated)                                                #
# --------------------------------------------------------------------------- #


@router.get(
    "",
    response_model=LlmUsageListResponse,
    dependencies=[Depends(require_super_admin)],
)
async def list_usage(
    session: Annotated[AsyncSession, Depends(get_db)],
    user_id: uuid.UUID | None = Query(default=None),
    mode: str | None = Query(default=None, pattern="^[ABCD]$"),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
) -> LlmUsageListResponse:
    filters = []
    if user_id:
        filters.append(LlmUsage.user_id == user_id)
    if mode:
        filters.append(LlmUsage.mode == ContentMode(mode))
    if from_:
        filters.append(LlmUsage.created_at >= from_)
    if to:
        filters.append(LlmUsage.created_at <= to)
    where = and_(*filters) if filters else None

    total_stmt = select(func.count()).select_from(LlmUsage)
    if where is not None:
        total_stmt = total_stmt.where(where)
    total = int(await session.scalar(total_stmt) or 0)

    stmt = (
        select(LlmUsage, User.email, Plan.name)
        .join(User, User.id == LlmUsage.user_id)
        .join(Plan, Plan.id == User.plan_id, isouter=True)
        .order_by(LlmUsage.created_at.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    if where is not None:
        stmt = stmt.where(where)
    rows = (await session.execute(stmt)).all()
    items = [_row_to_out(r[0], r[1], r[2]) for r in rows]
    return LlmUsageListResponse(items=items, page=page, page_size=page_size, total=total)


# --------------------------------------------------------------------------- #
# Per-user detail                                                             #
# --------------------------------------------------------------------------- #


@router.get(
    "/by-user/{user_id}",
    response_model=LlmPerUserDetail,
    dependencies=[Depends(require_super_admin)],
)
async def get_user_detail(
    user_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> LlmPerUserDetail:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user not found")
    plan = await session.get(Plan, user.plan_id) if user.plan_id else None
    cap = int(getattr(plan, "token_cap_per_month", 0) or 0)
    since = _month_start_utc()

    agg = await session.execute(
        select(
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ),
            func.coalesce(func.sum(LlmUsage.cost_cents), 0),
        ).where(and_(LlmUsage.user_id == user_id, LlmUsage.created_at >= since))
    )
    tokens_mtd, cost_mtd = agg.one()

    ts_rows = (await session.execute(
        select(
            func.date(LlmUsage.created_at).label("d"),
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ),
            func.coalesce(func.sum(LlmUsage.cost_cents), 0),
        )
        .where(and_(LlmUsage.user_id == user_id, LlmUsage.created_at >= since))
        .group_by(func.date(LlmUsage.created_at))
        .order_by(func.date(LlmUsage.created_at))
    )).all()
    points = [
        LlmTimeSeriesPoint(date=str(r[0]), tokens=int(r[1]), cost_cents=int(r[2]))
        for r in ts_rows
    ]

    mode_rows = (await session.execute(
        select(
            LlmUsage.mode,
            func.coalesce(
                func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
            ),
        )
        .where(and_(LlmUsage.user_id == user_id, LlmUsage.created_at >= since))
        .group_by(LlmUsage.mode)
    )).all()
    mode_map = {_mode_str(m): int(t) for m, t in mode_rows}
    by_mode = LlmModeSummary(
        A=mode_map.get("A", 0),
        B=mode_map.get("B", 0),
        C=mode_map.get("C", 0),
        D=mode_map.get("D", 0),
    )

    return LlmPerUserDetail(
        user_id=user.id,
        email=user.email,
        plan=plan.name if plan else None,
        tokens_mtd=int(tokens_mtd),
        cost_cents_mtd=int(cost_mtd),
        cap=cap,
        pct_used=(float(tokens_mtd) / cap * 100.0) if cap else 0.0,
        time_series=LlmUsageTimeSeries(points=points),
        by_mode=by_mode,
    )


# --------------------------------------------------------------------------- #
# Update cap on a plan                                                         #
# --------------------------------------------------------------------------- #


@router.post(
    "/caps/{plan_id}",
    response_model=dict,
)
async def update_plan_cap(
    plan_id: uuid.UUID,
    payload: TokenCapUpdate,
    session: Annotated[AsyncSession, Depends(get_db)],
    admin: Annotated[User, Depends(require_super_admin)],
) -> dict:
    plan = await session.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="plan not found")
    old_cap = plan.token_cap_per_month
    plan.token_cap_per_month = payload.token_cap_per_month
    session.add(
        AuditLog(
            actor_user_id=admin.id,
            actor_role="super_admin",
            action="plan.token_cap.update",
            target_type="plan",
            target_id=plan.id,
            payload={"old": old_cap, "new": payload.token_cap_per_month},
        )
    )
    await session.commit()
    return {
        "plan_id": str(plan.id),
        "token_cap_per_month": plan.token_cap_per_month,
    }
