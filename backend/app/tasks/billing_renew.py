"""Daily auto-renew charge — dummy-charges users whose plan is due.

Selects auto_pay_enabled users with next_billing_date <= today and a plan, then
records a dummy renewal Payment (advancing next_billing_date) and emails an
invoice. Redis-backed per-user/day dedupe (best-effort) guards double charges.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, date, datetime

from sqlalchemy import select

from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.users import User
from app.db.session import SessionLocal
from app.services import payments_service

logger = logging.getLogger(__name__)

_TTL_SECONDS = 36 * 3600


def _redis_or_none():
    try:
        import redis

        return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001
        logger.debug("billing renew redis unavailable: %s", exc)
        return None


def _key(user_id: str) -> str:
    day = datetime.now(UTC).date().isoformat()
    return f"{get_settings().redis_key_prefix}billing:renew:{user_id}:{day}"


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
    today = date.today()
    renewed = 0
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(User).where(
                    User.auto_pay_enabled.is_(True),
                    User.next_billing_date.is_not(None),
                    User.next_billing_date <= today,
                    User.plan_id.is_not(None),
                    User.is_suspended.is_(False),
                )
            )
        ).scalars().all()
        for u in rows:
            if _already(str(u.id)):
                continue
            # Dedupe BEFORE charging so a mid-loop crash can't double-charge on
            # the next beat tick within the TTL window.
            _mark(str(u.id))
            try:
                payment = await payments_service.renew_subscription_dummy(session, user=u)
                if payment is not None:
                    renewed += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("auto-renew failed user=%s err=%s", u.id, exc)
    logger.info("billing_renew renewed=%d due=%d", renewed, len(rows))
    return {"renewed": renewed, "due": len(rows)}


@celery_app.task(name="app.tasks.billing_renew.tick")
def tick() -> dict[str, int]:
    return asyncio.run(_run())
