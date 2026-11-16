"""Workspace — reputation & health endpoints (spec §5.1 #5).

Aggregates from ``mailboxes`` + ``daily_metrics`` + ``warmup_logs``.
External integrations (Postmaster, SNDS, blacklist providers) return
``connected: false`` until wired up. The frontend in
``features/reputation/api.ts`` is tolerant: a 200 with empty domains or
``connected: false`` renders the appropriate empty state.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_or_api_key as get_current_user
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import Mailbox
from app.db.models.users import User
from app.db.session import get_db
from app.services import blacklist_checker

router = APIRouter(prefix="/api/workspace/reputation", tags=["workspace-reputation"])


def _domain_of(email: str) -> str:
    at = email.rfind("@")
    return email[at + 1 :].lower() if at >= 0 else email.lower()


@router.get("/overview")
async def reputation_overview(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Per-domain rollup + workspace-wide warmth/bounce-rate."""
    rows = (
        await session.execute(
            select(Mailbox).where(Mailbox.workspace_id == user.workspace_id)
        )
    ).scalars().all()

    by_domain: dict[str, list[Mailbox]] = {}
    for mb in rows:
        by_domain.setdefault(_domain_of(mb.email_address), []).append(mb)

    domains: list[dict[str, Any]] = []
    def _agg_bool(rows_for_domain: list[Mailbox], key: str) -> bool | None:
        vals = [getattr(m, key) for m in rows_for_domain]
        if all(v is True for v in vals):
            return True
        if any(v is False for v in vals):
            return False
        return None

    for domain, items in by_domain.items():

        rep = (
            sum((m.warmth_score or 0) for m in items) / len(items) if items else 0.0
        )
        # Latest blacklist hits come from the cache the hourly scan / on-demand
        # check populate — keeps this hot endpoint free of live DNS. Cache miss
        # (or no Redis) → empty list = "no known listings yet".
        blacklist_hits = blacklist_checker.cache_hits_get(domain) or []
        domains.append(
            {
                "domain": domain,
                "spf_valid": _agg_bool(items, "spf_valid"),
                "dkim_valid": _agg_bool(items, "dkim_valid"),
                "dmarc_valid": _agg_bool(items, "dmarc_valid"),
                "reputation_score": round(rep),
                "blacklist_hits": blacklist_hits,
            }
        )

    overall_warmth = (
        sum((m.warmth_score or 0) for m in rows) / len(rows) if rows else 0.0
    )

    # Bounce rate over last 30 days = bounces / max(sent, 1) * 100.
    cutoff = datetime.now(UTC).date() - timedelta(days=30)
    metric_rows = (
        await session.execute(
            select(
                func.coalesce(func.sum(DailyMetric.emails_sent), 0),
                func.coalesce(func.sum(DailyMetric.bounce_count), 0),
            )
            .join(Mailbox, Mailbox.id == DailyMetric.mailbox_id)
            .where(
                Mailbox.workspace_id == user.workspace_id,
                DailyMetric.date >= cutoff,
            )
        )
    ).one()
    sent_total = int(metric_rows[0] or 0)
    bounce_total = int(metric_rows[1] or 0)
    bounce_rate = (bounce_total / sent_total * 100.0) if sent_total > 0 else 0.0

    return {
        "domains": domains,
        "overall_reputation": round(overall_warmth),
        "overall_warmth": round(overall_warmth),
        "bounce_rate": round(bounce_rate, 2),
    }


@router.get("/trend")
async def reputation_trend(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
    mailbox_id: uuid.UUID | None = Query(None),
    days: int = Query(30, ge=1, le=365),
) -> list[dict[str, Any]]:
    """Daily warmth trend, scoped to a mailbox or the whole workspace."""
    cutoff = datetime.now(UTC).date() - timedelta(days=days)

    q = (
        select(
            DailyMetric.date,
            func.avg(DailyMetric.warmth_score).label("warmth"),
        )
        .join(Mailbox, Mailbox.id == DailyMetric.mailbox_id)
        .where(
            Mailbox.workspace_id == user.workspace_id,
            DailyMetric.date >= cutoff,
        )
        .group_by(DailyMetric.date)
        .order_by(DailyMetric.date.asc())
    )
    if mailbox_id is not None:
        q = q.where(DailyMetric.mailbox_id == mailbox_id)

    rows = (await session.execute(q)).all()
    return [
        {"date": d.isoformat(), "score": round(float(score or 0))}
        for d, score in rows
    ]


@router.get("/blacklist")
async def blacklist_check(
    user: Annotated[User, Depends(get_current_user)],
    domain: str = Query(..., min_length=3, max_length=255),
) -> dict[str, Any]:
    """Live DNSBL check for ``domain`` against the public blocklists.

    Resolves the domain's sending IP and queries Spamhaus ZEN/DBL, Barracuda,
    SpamCop, SORBS, UCEPROTECT and Lashback. Returns the standard envelope
    (``domain`` / ``checked_against`` / ``hits`` / ``checked_at``) plus
    ``checked_ip`` and a per-provider ``providers`` array. When
    ``MAILBOX_PROBES_DUMMY`` is on the checker returns a clean result without
    touching the network. The result refreshes the cache the reputation
    overview reads from.
    """
    result = await blacklist_checker.check_domain_blacklists(domain)
    blacklist_checker.cache_hits_put(result.domain, result.hits)
    return result.to_envelope()


@router.get("/postmaster/status")
async def postmaster_status(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    return {"connected": False, "last_sync_at": None, "domains_tracked": 0}


@router.get("/snds/status")
async def snds_status(
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, Any]:
    return {"connected": False, "last_sync_at": None, "ips_tracked": 0}
