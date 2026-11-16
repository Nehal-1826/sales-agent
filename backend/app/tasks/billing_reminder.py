"""Daily renewal-reminder email — fires ~3 days before next_billing_date.

Dummy/beta: emails are dry-run when TRANSACTIONAL_SMTP_* is unset. Redis-backed
per-user/day dedupe (best-effort) prevents double sends if beat double-fires.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.session import SessionLocal
from app.services import transactional_mail

logger = logging.getLogger(__name__)

_TTL_SECONDS = 36 * 3600
_REMINDER_DAYS_BEFORE = 3


def _redis_or_none():
    try:
        import redis

        return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001
        logger.debug("billing reminder redis unavailable: %s", exc)
        return None


def _key(user_id: str) -> str:
    day = datetime.now(UTC).date().isoformat()
    return f"{get_settings().redis_key_prefix}billing:reminder:{user_id}:{day}"


def _already(user_id: str) -> bool:
    c = _redis_or_none()
    if c is None:
        return False
    try:
        return bool(c.get(_key(user_id)))
    except Exception:  # noqa: BLE001
        return False


def _mark(user_id: str) -> None:
    c = _redis_or_none()
    if c is None:
        return
    try:
        c.setex(_key(user_id), _TTL_SECONDS, "1")
    except Exception:  # noqa: BLE001
        pass


async def _run() -> dict[str, int]:
    target = date.today() + timedelta(days=_REMINDER_DAYS_BEFORE)
    sent = 0
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(User).where(
                    User.next_billing_date == target,
                    User.plan_id.is_not(None),
                    User.is_suspended.is_(False),
                )
            )
        ).scalars().all()
        for u in rows:
            if not u.email or _already(str(u.id)):
                continue
            plan = await session.get(Plan, u.plan_id)
            if plan is None:
                continue
            try:
                await transactional_mail.send_payment_reminder(
                    to=u.email,
                    plan_name=plan.name,
                    amount_cents=plan.price_cents,
                    due_date=u.next_billing_date.isoformat(),
                    auto_pay=u.auto_pay_enabled,
                )
                _mark(str(u.id))
                sent += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("billing reminder failed user=%s err=%s", u.id, exc)
    logger.info("billing_reminder sent=%d candidates=%d target=%s", sent, len(rows), target)
    return {"sent": sent, "candidates": len(rows)}


@celery_app.task(name="app.tasks.billing_reminder.tick")
def tick() -> dict[str, int]:
    return asyncio.run(_run())
