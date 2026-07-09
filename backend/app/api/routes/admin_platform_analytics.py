"""Admin platform-wide analytics (spec §5.2 item 5).

All routes are ``super_admin``-only. Mounted under the admin aggregator
at ``/api/admin/platform-analytics``. Read-only — no writes, no audit
rows (admins merely observe aggregate state).
"""
from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox
from app.db.models.warmup_logs import WarmupAction, WarmupLog
from app.db.session import get_db
from app.schemas.analytics import (
    PlanDistribution,
    PlanDistributionRow,
    PlatformOverview,
    SignupPoint,
    TopClient,
    VolumePoint,
    WarmthDistribution,
    WarmthDistributionBin,
)
from app.services import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/platform-analytics", tags=["admin-platform-analytics"])


def _default_range(
    from_: date | None, to: date | None, *, days: int = 30
) -> tuple[date, date]:
    return analytics_service._range_default(from_, to, days=days)


# --------------------------------------------------------------------------- #
# 11. Overview                                                                #
# --------------------------------------------------------------------------- #


@router.get(
    "/overview",
    response_model=PlatformOverview,
    dependencies=[Depends(require_super_admin)],
)
async def overview(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PlatformOverview:
    payload = await analytics_service.platform_overview(session)
    return PlatformOverview(**payload)


# --------------------------------------------------------------------------- #
# 12. Warmth distribution                                                     #
# --------------------------------------------------------------------------- #


@router.get(
    "/warmth-distribution",
    response_model=WarmthDistribution,
    dependencies=[Depends(require_super_admin)],
)
async def warmth_distribution(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> WarmthDistribution:
    bins = await analytics_service.warmth_distribution(session)
    return WarmthDistribution(bins=[WarmthDistributionBin(**b) for b in bins])


# --------------------------------------------------------------------------- #
# 13. Send volume                                                             #
# --------------------------------------------------------------------------- #


@router.get(
    "/send-volume",
    response_model=list[VolumePoint],
    dependencies=[Depends(require_super_admin)],
)
async def send_volume(
    session: Annotated[AsyncSession, Depends(get_db)],
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    granularity: Literal["day", "week"] = Query("day"),
) -> list[VolumePoint]:
    frm, to_ = _default_range(from_, to)
    rows = await analytics_service.send_volume(
        session, from_=frm, to=to_, granularity=granularity
    )
    return [VolumePoint(**r) for r in rows]


# --------------------------------------------------------------------------- #
# 14. Plan distribution                                                       #
# --------------------------------------------------------------------------- #


@router.get(
    "/plan-distribution",
    response_model=PlanDistribution,
    dependencies=[Depends(require_super_admin)],
)
async def plan_distribution(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> PlanDistribution:
    rows = await analytics_service.plan_distribution(session)
    return PlanDistribution(by_plan=[PlanDistributionRow(**r) for r in rows])


# --------------------------------------------------------------------------- #
# 15. Signup rate                                                             #
# --------------------------------------------------------------------------- #


@router.get(
    "/signup-rate",
    response_model=list[SignupPoint],
    dependencies=[Depends(require_super_admin)],
)
async def signup_rate(
    session: Annotated[AsyncSession, Depends(get_db)],
    from_: date | None = Query(None, alias="from"),
    to: date | None = Query(None),
    granularity: Literal["day", "week"] = Query("day"),
) -> list[SignupPoint]:
    frm, to_ = _default_range(from_, to)
    rows = await analytics_service.signup_rate(
        session, from_=frm, to=to_, granularity=granularity
    )
    return [SignupPoint(**r) for r in rows]


# --------------------------------------------------------------------------- #
# 16. Top clients                                                             #
# --------------------------------------------------------------------------- #


@router.get(
    "/top-clients",
    response_model=list[TopClient],
    dependencies=[Depends(require_super_admin)],
)
async def top_clients(
    session: Annotated[AsyncSession, Depends(get_db)],
    by: Literal["send_volume", "warmth", "mailboxes"] = Query("send_volume"),
    limit: int = Query(20, ge=1, le=100),
) -> list[TopClient]:
    rows = await analytics_service.top_clients(session, by=by, limit=limit)
    return [TopClient(**r) for r in rows]


# --------------------------------------------------------------------------- #
# 17. Placement trend                                                         #
# --------------------------------------------------------------------------- #


@router.get(
    "/placement-trend",
    dependencies=[Depends(require_super_admin)],
)
async def placement_trend(
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=365),
) -> list[dict[str, Any]]:
    """Daily inbox / promotions / spam % across the platform.

    Spam % is approximated from ``bounce_count / emails_sent`` until a real
    placement classifier ships. Promotions = 100 − inbox − spam.
    """
    cutoff = datetime.now(UTC).date() - timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(
                DailyMetric.date,
                func.avg(DailyMetric.inbox_placement_pct).label("inbox"),
                func.coalesce(func.sum(DailyMetric.bounce_count), 0).label("bounces"),
                func.coalesce(func.sum(DailyMetric.emails_sent), 0).label("sent"),
            )
            .where(DailyMetric.date >= cutoff)
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()
    out: list[dict[str, Any]] = []
    for d, inbox, bounces, sent in rows:
        sent_i = int(sent or 0)
        spam = (int(bounces or 0) / sent_i * 100.0) if sent_i > 0 else 0.0
        inbox_pct = float(inbox or 0)
        promotions = max(0.0, 100.0 - inbox_pct - spam)
        out.append(
            {
                "date": d.isoformat(),
                "inbox_pct": round(inbox_pct, 2),
                "promotions_pct": round(promotions, 2),
                "spam_pct": round(spam, 2),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# 18. Provider breakdown                                                      #
# --------------------------------------------------------------------------- #


@router.get(
    "/provider-breakdown",
    dependencies=[Depends(require_super_admin)],
)
async def provider_breakdown(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, Any]]:
    """Count of client mailboxes per provider (gmail/outlook/yahoo/smtp)."""
    rows = (
        await session.execute(
            select(Mailbox.provider, func.count().label("n"))
            .group_by(Mailbox.provider)
            .order_by(func.count().desc())
        )
    ).all()
    return [
        {
            "provider": (
                provider.value if hasattr(provider, "value") else str(provider)
            ),
            "count": int(n or 0),
        }
        for provider, n in rows
    ]


# --------------------------------------------------------------------------- #
# 19. Engagement funnel                                                       #
# --------------------------------------------------------------------------- #


@router.get(
    "/engagement-funnel",
    dependencies=[Depends(require_super_admin)],
)
async def engagement_funnel(
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=365),
) -> list[dict[str, Any]]:
    """Sent → opened → replied → spam_rescued across the platform."""
    cutoff = datetime.now(UTC) - timedelta(days=days)
    rows = (
        await session.execute(
            select(WarmupLog.action, func.count().label("n"))
            .where(WarmupLog.created_at >= cutoff)
            .group_by(WarmupLog.action)
        )
    ).all()
    counts: dict[str, int] = {a.value if hasattr(a, "value") else str(a): int(n or 0) for a, n in rows}
    funnel_order: list[tuple[str, str]] = [
        ("Sent", WarmupAction.sent.value),
        ("Opened", WarmupAction.opened.value),
        ("Replied", WarmupAction.replied.value),
        ("Spam-rescued", WarmupAction.spam_rescued.value),
    ]
    return [{"stage": label, "value": counts.get(key, 0)} for label, key in funnel_order]


# --------------------------------------------------------------------------- #
# 20. Spam rate                                                               #
# --------------------------------------------------------------------------- #


@router.get(
    "/spam-rate",
    dependencies=[Depends(require_super_admin)],
)
async def spam_rate(
    session: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(30, ge=1, le=365),
) -> list[dict[str, Any]]:
    """Daily platform-wide spam rate (bounces / sends * 100)."""
    cutoff = datetime.now(UTC).date() - timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(
                DailyMetric.date,
                func.coalesce(func.sum(DailyMetric.emails_sent), 0).label("sent"),
                func.coalesce(func.sum(DailyMetric.bounce_count), 0).label("bounces"),
            )
            .where(DailyMetric.date >= cutoff)
            .group_by(DailyMetric.date)
            .order_by(DailyMetric.date.asc())
        )
    ).all()
    out: list[dict[str, Any]] = []
    for d, sent, bounces in rows:
        sent_i = int(sent or 0)
        rate = (int(bounces or 0) / sent_i * 100.0) if sent_i > 0 else 0.0
        out.append({"date": d.isoformat(), "spam_rate": round(rate, 2)})
    return out
