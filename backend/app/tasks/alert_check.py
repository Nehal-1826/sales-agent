"""Hourly alert check — fans out to notification_settings.

Triggers (per spec §5.1 #6):
* ``warmup.warmth_drop`` — workspace mean warmth dropped >10 points in last 24h
* ``warmup.in_spam`` — any mailbox spent the last 24h with placement <30%
* ``warmup.peer_unhealthy`` — peer pool reputation score below 50

Idempotent within a 24h window: a redis-backed dedupe key
``alert:<workspace>:<event>:<YYYY-MM-DD>`` blocks duplicate dispatches.
We use the global redis client (already namespaced via REDIS_KEY_PREFIX).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select

from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox
from app.db.models.notification_settings import NotificationSetting
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.users import User
from app.db.session import SessionLocal
from app.services import blacklist_checker
from app.services.notifications_dispatch import fanout

logger = logging.getLogger(__name__)

_DEDUP_TTL_SECONDS = 24 * 3600


def _domain_of(email: str) -> str:
    at = email.rfind("@")
    return email[at + 1 :].strip().lower() if at >= 0 else email.strip().lower()


def _redis_client_or_none():
    """Best-effort Redis client for alert dedupe; ``None`` when unreachable.
    Without it the scan still fires (it just loses 24h idempotency)."""
    try:
        import redis  # local import keeps cold-start cheap

        return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
    except Exception as exc:  # noqa: BLE001
        logger.debug("alert redis client unavailable: %s", exc)
        return None


def _bl_dedup_key(workspace_id: str, domain: str) -> str:
    day = datetime.now(UTC).date().isoformat()
    return f"{get_settings().redis_key_prefix}alert:blacklist:{workspace_id}:{domain}:{day}"


def _blacklist_already_alerted(workspace_id: str, domain: str) -> bool:
    client = _redis_client_or_none()
    if client is None:
        return False
    try:
        return bool(client.get(_bl_dedup_key(workspace_id, domain)))
    except Exception as exc:  # noqa: BLE001
        logger.debug("alert dedupe get failed err=%s", exc)
        return False


def _mark_blacklist_alerted(workspace_id: str, domain: str) -> None:
    client = _redis_client_or_none()
    if client is None:
        return
    try:
        client.setex(_bl_dedup_key(workspace_id, domain), _DEDUP_TTL_SECONDS, "1")
    except Exception as exc:  # noqa: BLE001
        logger.debug("alert dedupe set failed err=%s", exc)


async def _settings_for_user(session, user_id) -> list[NotificationSetting]:
    rows = (
        await session.execute(
            select(NotificationSetting).where(NotificationSetting.user_id == user_id)
        )
    ).scalars().all()
    return list(rows)


async def _check_warmth_drops(session) -> list[dict[str, Any]]:
    """Per-workspace 24h warmth delta. Returns alerts to emit."""
    today = datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)
    rows = (
        await session.execute(
            select(
                Mailbox.workspace_id,
                DailyMetric.date,
                func.avg(DailyMetric.warmth_score).label("warmth"),
            )
            .join(Mailbox, Mailbox.id == DailyMetric.mailbox_id)
            .where(DailyMetric.date.in_([today, yesterday]))
            .group_by(Mailbox.workspace_id, DailyMetric.date)
        )
    ).all()

    by_ws: dict[str, dict[str, float]] = {}
    for ws_id, d, warmth in rows:
        bucket = by_ws.setdefault(str(ws_id), {})
        bucket[d.isoformat()] = float(warmth or 0)

    alerts: list[dict[str, Any]] = []
    for ws_id, days in by_ws.items():
        t = days.get(today.isoformat())
        y = days.get(yesterday.isoformat())
        if t is None or y is None:
            continue
        delta = t - y
        if delta <= -10.0:
            alerts.append(
                {
                    "workspace_id": ws_id,
                    "event": "warmup.warmth_drop",
                    "title": "Warmth dropped sharply",
                    "body": (
                        f"Workspace mean warmth dropped {abs(delta):.1f} points "
                        f"in the last 24h ({y:.1f} → {t:.1f})."
                    ),
                }
            )
    return alerts


async def _check_spam_placements(session) -> list[dict[str, Any]]:
    today = datetime.now(UTC).date()
    rows = (
        await session.execute(
            select(Mailbox.workspace_id, Mailbox.email_address, DailyMetric.inbox_placement_pct)
            .join(Mailbox, Mailbox.id == DailyMetric.mailbox_id)
            .where(
                DailyMetric.date == today,
                DailyMetric.inbox_placement_pct < 30.0,
                DailyMetric.emails_sent > 0,
            )
        )
    ).all()
    return [
        {
            "workspace_id": str(ws_id),
            "event": "warmup.in_spam",
            "title": "Mailbox in spam",
            "body": (
                f"{email} placement is {placement:.1f}% today — likely spam-foldered."
            ),
        }
        for ws_id, email, placement in rows
    ]


async def _check_peer_health(session) -> list[dict[str, Any]]:
    """Peer pool unhealthy = >20% of active peers with reputation < 50."""
    rows = (
        await session.execute(
            select(PeerInbox.reputation_score).where(PeerInbox.is_active.is_(True))
        )
    ).scalars().all()
    if not rows:
        return []
    total = len(rows)
    bad = sum(1 for r in rows if r < 50.0)
    if bad / total < 0.2:
        return []
    # Notify every workspace owner (clients only) — peer pool issues affect everyone.
    workspaces = (
        await session.execute(
            select(User.workspace_id).where(User.role == "client").distinct()
        )
    ).scalars().all()
    return [
        {
            "workspace_id": str(ws_id),
            "event": "warmup.peer_unhealthy",
            "title": "Peer pool reputation degraded",
            "body": (
                f"{bad} of {total} active peer inboxes have reputation < 50. "
                "Ramp may slow until they recover."
            ),
        }
        for ws_id in workspaces
    ]


async def _check_blacklist_listings(session) -> list[dict[str, Any]]:
    """Live DNSBL scan of every workspace's sending domains.

    Emits ``warmup.blacklisted`` when a domain is listed on any public
    blocklist. Each (workspace, domain) alerts at most once per day via a
    Redis dedupe key (best-effort — without Redis it fires each scan). The
    latest hit list is cached so the reputation overview reflects it without
    doing live DNS on the request path.
    """
    rows = (
        await session.execute(
            select(Mailbox.workspace_id, Mailbox.email_address)
        )
    ).all()

    by_ws: dict[str, set[str]] = {}
    for ws_id, email in rows:
        domain = _domain_of(email)
        if domain:
            by_ws.setdefault(str(ws_id), set()).add(domain)

    # Flatten to (ws, domain) pairs and apply a safety cap so a huge tenant
    # base can't turn one scan into thousands of live DNS fan-outs.
    pairs = [(ws_id, d) for ws_id, domains in by_ws.items() for d in sorted(domains)]
    if len(pairs) > blacklist_checker.MAX_DOMAINS_PER_SCAN:
        logger.warning(
            "alert_check.blacklist: %d domains exceeds cap %d — scanning first %d",
            len(pairs), blacklist_checker.MAX_DOMAINS_PER_SCAN,
            blacklist_checker.MAX_DOMAINS_PER_SCAN,
        )
        pairs = pairs[: blacklist_checker.MAX_DOMAINS_PER_SCAN]

    alerts: list[dict[str, Any]] = []
    for ws_id, domain in pairs:
        try:
            result = await blacklist_checker.check_domain_blacklists(domain)
        except Exception as exc:  # noqa: BLE001 — one bad domain can't stop the scan
            logger.warning("alert_check.blacklist.failed domain=%s err=%s", domain, exc)
            continue
        blacklist_checker.cache_hits_put(domain, result.hits)
        if not result.hits:
            continue
        if _blacklist_already_alerted(ws_id, domain):
            continue
        _mark_blacklist_alerted(ws_id, domain)
        listed_on = ", ".join(result.hits)
        alerts.append(
            {
                "workspace_id": ws_id,
                "event": "warmup.blacklisted",
                "title": "Domain on a blacklist",
                "body": (
                    f"{domain} is listed on {listed_on}. Deliverability will drop "
                    "until you request delisting from the affected provider(s)."
                ),
            }
        )
    return alerts


async def _run() -> dict[str, int]:
    async with SessionLocal() as session:
        all_alerts = (
            await _check_warmth_drops(session)
            + await _check_spam_placements(session)
            + await _check_peer_health(session)
            + await _check_blacklist_listings(session)
        )

        if not all_alerts:
            return {"alerts": 0, "delivered": 0}

        # Group alerts by workspace, then look up users in each workspace
        # so we can find their notification settings.
        delivered_total = 0
        for alert in all_alerts:
            ws_id = alert["workspace_id"]
            users = (
                await session.execute(
                    select(User).where(User.workspace_id == ws_id)
                )
            ).scalars().all()
            for u in users:
                settings = await _settings_for_user(session, u.id)
                if not settings:
                    continue
                delivered_total += await fanout(
                    settings,
                    {
                        "title": alert["title"],
                        "body": alert["body"],
                        "event": alert["event"],
                        "workspace_id": ws_id,
                    },
                    event_type=alert["event"],
                )
        return {"alerts": len(all_alerts), "delivered": delivered_total}


@celery_app.task(name="app.tasks.alert_check.scan_and_dispatch")
def scan_and_dispatch() -> dict[str, int]:
    """Celery beat entry. Scans for alert conditions and fans out."""
    try:
        return asyncio.run(_run())
    except Exception as exc:  # noqa: BLE001
        logger.warning("alert_check.failed err=%s", exc)
        return {"alerts": 0, "delivered": 0}
