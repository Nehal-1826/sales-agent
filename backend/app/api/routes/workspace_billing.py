"""Workspace — billing usage rollup."""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_or_api_key as get_current_user
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.llm_usage import LlmUsage
from app.db.session import get_db

router = APIRouter(prefix="/api/workspace/billing", tags=["workspace-billing"])


def _month_start_utc() -> date:
    now = datetime.now(UTC)
    return date(now.year, now.month, 1)


@router.get("/usage")
async def current_usage(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Month-to-date billing snapshot for the dashboard usage card."""
    plan: Plan | None = None
    if user.plan_id is not None:
        plan = (
            await session.execute(select(Plan).where(Plan.id == user.plan_id))
        ).scalar_one_or_none()

    mailboxes_used = (
        await session.execute(
            select(func.count(Mailbox.id)).where(
                Mailbox.workspace_id == user.workspace_id
            )
        )
    ).scalar_one() or 0

    month_start = _month_start_utc()

    sent_mtd = (
        await session.execute(
            select(func.coalesce(func.sum(DailyMetric.emails_sent), 0))
            .join(Mailbox, Mailbox.id == DailyMetric.mailbox_id)
            .where(
                Mailbox.workspace_id == user.workspace_id,
                DailyMetric.date >= month_start,
            )
        )
    ).scalar_one() or 0

    tokens_mtd = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens),
                    0,
                )
            ).where(
                LlmUsage.user_id == user.id,
                LlmUsage.created_at >= datetime.combine(month_start, datetime.min.time(), tzinfo=UTC),
            )
        )
    ).scalar_one() or 0

    return {
        "mailboxes_used": int(mailboxes_used),
        "mailboxes_cap": int(plan.max_mailboxes) if plan else 1,
        "warmup_emails_sent_mtd": int(sent_mtd),
        "llm_tokens_used_mtd": int(tokens_mtd),
        "llm_tokens_cap": int(plan.token_cap_per_month) if plan else 30_000,
    }
