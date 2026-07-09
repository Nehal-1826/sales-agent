"""Beat heartbeat — writes a 1 Hz tick to Redis so the admin /system-health
page can compute beat drift and a Redis ops/s sparkline without external
metrics infra.

Three Redis keys (all under the ``warmpulse:`` namespace so they're easy to
distinguish from Celery's own broker keys):

* ``warmpulse:beat:last_tick`` — UTC ISO timestamp of the most recent tick.
  ``beat_delay_s = now - last_tick``. A healthy beat ticks every minute;
  values much above that indicate beat is wedged.
* ``warmpulse:beat:delay_series`` — last 60 deltas (in seconds) between
  consecutive ticks. LPUSH + LTRIM. Renders as the "Beat delay" sparkline.
* ``warmpulse:redis:ops_series`` — last 60 samples of
  ``INFO stats.instantaneous_ops_per_sec``. Cheap snapshot of broker load.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.celery_app import celery_app
from app.config import get_settings

logger = logging.getLogger(__name__)

_LAST_TICK_KEY = "warmpulse:beat:last_tick"
_DELAY_SERIES_KEY = "warmpulse:beat:delay_series"
_OPS_SERIES_KEY = "warmpulse:redis:ops_series"
_SERIES_LEN = 60


def _redis_client():
    import redis  # local import keeps cold-start cheap
    settings = get_settings()
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


@celery_app.task(name="app.tasks.beat_heartbeat.tick", queue="default")
def tick() -> dict:
    """Run every 60 s. Writes the heartbeat + samples Redis ops."""
    now = datetime.now(UTC)
    try:
        client = _redis_client()
        prev = client.get(_LAST_TICK_KEY)
        if prev:
            try:
                prev_dt = datetime.fromisoformat(prev)
                delta = (now - prev_dt).total_seconds()
                # Cap absurd values (clock jumps, paused workers).
                delta = max(0.0, min(delta, 600.0))
                client.lpush(_DELAY_SERIES_KEY, f"{delta:.2f}")
                client.ltrim(_DELAY_SERIES_KEY, 0, _SERIES_LEN - 1)
            except ValueError:
                pass
        client.set(_LAST_TICK_KEY, now.isoformat())

        info = client.info("stats")
        ops = int(info.get("instantaneous_ops_per_sec", 0))
        client.lpush(_OPS_SERIES_KEY, str(ops))
        client.ltrim(_OPS_SERIES_KEY, 0, _SERIES_LEN - 1)
    except Exception:
        logger.exception("beat_heartbeat.tick failed")
        return {"status": "error"}
    return {"status": "ok", "ts": now.isoformat()}
