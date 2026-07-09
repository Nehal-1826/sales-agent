"""LLM usage ledger + per-plan cap enforcement.

``record_usage`` writes one row per LLM call (cost computed from
``settings.llm_price_per_1k_tokens_usd``). ``check_cap`` returns one of
``ok | soft_cap | hard_cap`` based on the month-to-date sum vs the user's
plan's ``token_cap_per_month``. The content generator consults ``check_cap``
**before** calling the LLM so hard-capped users fall straight to static.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, time
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.llm_usage import LlmUsage
from app.services.llm.provider import TokenUsage


class TokenCapExceeded(Exception):
    """Raised when a user hits 100% of their monthly token cap."""

    def __init__(self, user_id: uuid.UUID, used: int, cap: int) -> None:
        super().__init__(
            f"Token cap exceeded: user={user_id} used={used} cap={cap}"
        )
        self.user_id = user_id
        self.used = used
        self.cap = cap


def _month_start_utc(now: datetime | None = None) -> datetime:
    now = now or datetime.now(UTC)
    return datetime.combine(
        now.date().replace(day=1), time.min, tzinfo=UTC
    )


async def record_usage(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    mode: str,
    usage: TokenUsage,
    settings,
) -> LlmUsage:
    """Persist a cost ledger row. Always flushed (not committed) so callers
    can roll the whole request back atomically on later failure."""
    total = usage.prompt_tokens + usage.completion_tokens
    cost_cents = int(
        round((total / 1000.0) * settings.llm_price_per_1k_tokens_usd * 100)
    )
    row = LlmUsage(
        user_id=user_id,
        mailbox_id=mailbox_id,
        mode=mode,
        prompt_tokens=usage.prompt_tokens,
        completion_tokens=usage.completion_tokens,
        cost_cents=cost_cents,
    )
    db.add(row)
    await db.flush()
    return row


async def month_usage(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Sum (prompt + completion) tokens for the current UTC calendar month."""
    since = _month_start_utc()
    stmt = select(
        func.coalesce(
            func.sum(LlmUsage.prompt_tokens + LlmUsage.completion_tokens), 0
        )
    ).where(
        LlmUsage.user_id == user_id,
        LlmUsage.created_at >= since,
    )
    result = await db.scalar(stmt)
    return int(result or 0)


async def check_cap(
    db: AsyncSession, user, plan
) -> Literal["ok", "soft_cap", "hard_cap"]:
    """Return the current cap bucket. Plan is expected to carry
    ``token_cap_per_month``. A zero/unset cap is treated as unbounded."""
    cap = getattr(plan, "token_cap_per_month", 0) or 0
    if cap <= 0:
        return "ok"
    used = await month_usage(db, user.id)
    if used >= cap:
        return "hard_cap"
    if used >= int(cap * 0.8):
        return "soft_cap"
    return "ok"
