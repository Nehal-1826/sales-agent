"""Admin /system-health bundle.

Wires the live dashboard at /admin/system-health to real telemetry:

* **Queue depth**: ``LLEN`` on each Celery queue list in Redis (default,
  smtp). Cheap (O(1) per queue) so we recompute on every poll.
* **Workers**: ``celery.control.inspect().stats()`` + ``ping()`` to enumerate
  heartbeat-alive workers across the cluster.
* **Delivery rates**: per-minute counts of ``WarmupLog(direction=outbound,
  action=sent)`` (smtp) and ``direction=inbound`` (imap fetch outcome) over
  the last 60 minutes. ``error_rate`` is reserved for once we log failures —
  warmup_logs only carries successes today, so it's 0.
* **Latency**: p50/p95/p99 of HTTP request duration. We don't have a
  metrics middleware yet, so this returns zeros. Wiring is left for a
  follow-up — the schema is stable so the UI doesn't change.
* **Error types**: same story — no exception bookkeeping in the DB yet,
  Sentry holds them. Empty until we add a digest endpoint.

The page polls every 15 s; keep this handler fast (< 200 ms typical).
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_super_admin
from app.celery_app import celery_app
from app.config import get_settings
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.session import get_db
from app.observability_buffers import ERRORS, LATENCY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-system-health"])


# Celery queues — kept in sync with celery_app.create_celery_app's task_queues.
_QUEUES = ("default", "smtp")


def _redis_client():
    """Lazy import + connect so the route module imports cleanly even when
    redis is unreachable (the handler will fall back to zeros)."""
    import redis  # noqa: WPS433 — local import keeps cold-start cheap
    settings = get_settings()
    return redis.Redis.from_url(settings.redis_url, decode_responses=False)


def _queue_depth() -> dict[str, Any]:
    """Total Celery queue depth + per-queue breakdown via ``LLEN``."""
    breakdown: dict[str, int] = {q: 0 for q in _QUEUES}
    total = 0
    try:
        client = _redis_client()
        for q in _QUEUES:
            depth = int(client.llen(q) or 0)
            breakdown[q] = depth
            total += depth
    except Exception:
        logger.exception("system_health: redis depth probe failed")
    return {"total": total, "per_queue": breakdown}


def _beat_metrics() -> dict[str, Any]:
    """Read the beat-heartbeat Redis keys written by tasks.beat_heartbeat.tick.

    Returns ``{delay_s, delay_series, ops_series}``. All zeros / empty if the
    heartbeat task hasn't run yet (cold start, beat down, or first deploy).
    """
    out = {"delay_s": 0.0, "delay_series": [], "ops_series": []}
    try:
        client = _redis_client()
        # decode_responses=False here, so the lrange returns bytes — decode.
        last_tick = client.get("warmpulse:beat:last_tick")
        if last_tick:
            tick_str = last_tick.decode() if isinstance(last_tick, bytes) else last_tick
            tick_dt = datetime.fromisoformat(tick_str)
            out["delay_s"] = round(
                (datetime.now(UTC) - tick_dt).total_seconds(), 2
            )
        delays = client.lrange("warmpulse:beat:delay_series", 0, 59) or []
        out["delay_series"] = [
            float(x.decode() if isinstance(x, bytes) else x) for x in delays
        ]
        ops = client.lrange("warmpulse:redis:ops_series", 0, 59) or []
        out["ops_series"] = [
            int(x.decode() if isinstance(x, bytes) else x) for x in ops
        ]
    except Exception:
        logger.exception("system_health: beat metrics probe failed")
    return out


def _redis_ops_per_s() -> int:
    """Server-wide command rate from ``INFO stats`` — instantaneous_ops_per_sec."""
    try:
        client = _redis_client()
        info = client.info("stats")
        return int(info.get("instantaneous_ops_per_sec", 0))
    except Exception:
        logger.exception("system_health: redis info probe failed")
        return 0


def _workers() -> list[dict[str, Any]]:
    """Enumerate alive Celery workers via the broker control plane.

    ``inspect().ping()`` returns ``{worker_name: {ok: 'pong'}}`` for every
    worker that responded within the broker's network timeout (~1 s). We
    pair that with ``stats()`` so the table can show the active task count
    and host. Returns ``[]`` when the broker is unreachable rather than
    raising, because the rest of the admin page is still useful.
    """
    try:
        insp = celery_app.control.inspect(timeout=1.0)
        ping = insp.ping() or {}
        stats = insp.stats() or {}
        active = insp.active() or {}
    except Exception:
        logger.exception("system_health: celery inspect failed")
        return []

    out: list[dict[str, Any]] = []
    now_iso = datetime.now(UTC).isoformat()
    for worker_name, _pong in ping.items():
        worker_stats = stats.get(worker_name) or {}
        running = active.get(worker_name) or []
        # `pool.processes` is a list of pids; len == prefetch concurrency.
        host = worker_name.split("@", 1)[1] if "@" in worker_name else worker_name
        current = (running[0] or {}).get("name") if running else None
        out.append(
            {
                "id": worker_name,
                "host": host,
                "status": "busy" if running else "idle",
                "last_heartbeat": now_iso,  # ping just succeeded
                "current_task": current,
            }
        )
    return out


async def _delivery_rates(session: AsyncSession) -> list[dict[str, Any]]:
    """Per-minute SMTP send + IMAP fetch counts for the last 60 minutes.

    Buckets are minute-aligned; missing minutes get filled with zeros so
    the chart can render a continuous line.
    """
    now = datetime.now(UTC).replace(second=0, microsecond=0)
    start = now - timedelta(minutes=59)
    rows = (
        await session.execute(
            select(
                func.date_trunc("minute", WarmupLog.created_at).label("bucket"),
                WarmupLog.direction,
                func.count().label("n"),
            )
            .where(WarmupLog.created_at >= start)
            .group_by("bucket", WarmupLog.direction)
        )
    ).all()

    by_minute: dict[datetime, dict[str, int]] = {}
    for bucket, direction, n in rows:
        key = bucket if isinstance(bucket, datetime) else datetime.fromisoformat(str(bucket))
        if key.tzinfo is None:
            key = key.replace(tzinfo=UTC)
        by_minute.setdefault(key, {"smtp_send": 0, "imap_fetch": 0})
        if direction == WarmupDirection.outbound:
            by_minute[key]["smtp_send"] += int(n)
        elif direction == WarmupDirection.inbound:
            by_minute[key]["imap_fetch"] += int(n)

    out: list[dict[str, Any]] = []
    for i in range(60):
        bucket = start + timedelta(minutes=i)
        cell = by_minute.get(bucket, {"smtp_send": 0, "imap_fetch": 0})
        out.append(
            {
                "t": bucket.isoformat(),
                "smtp_send": cell["smtp_send"],
                "imap_fetch": cell["imap_fetch"],
                "error_rate": 0.0,  # warmup_logs holds only successes today
            }
        )
    return out


@router.get("/system-health", dependencies=[Depends(require_super_admin)])
async def system_health(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    queues = _queue_depth()
    workers = _workers()
    delivery = await _delivery_rates(session)
    # Outbound+inbound row counts at 0/today are still meaningful for the
    # sparklines under the KPI tiles.
    spark = [
        {"t": p["t"], "value": p["smtp_send"] + p["imap_fetch"]} for p in delivery
    ]
    beat = _beat_metrics()
    return {
        "queues": {
            "celery_depth": queues["total"],
            "beat_delay_s": beat["delay_s"],
            "redis_ops_per_s": _redis_ops_per_s(),
            "celery_depth_series": spark,
            "beat_delay_series": beat["delay_series"],
            "redis_ops_series": beat["ops_series"],
            "per_queue": queues["per_queue"],
        },
        "workers": workers,
        "delivery_rates": delivery,
        "latency": {
            "api_p50": round(LATENCY.percentiles()["p50"], 1),
            "api_p95": round(LATENCY.percentiles()["p95"], 1),
            "api_p99": round(LATENCY.percentiles()["p99"], 1),
            "series": LATENCY.series(),
        },
        "error_types": ERRORS.top(),
    }
