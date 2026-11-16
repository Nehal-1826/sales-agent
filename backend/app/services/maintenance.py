"""Maintenance-mode state — cached read of ``app_settings.danger``.

The HTTP middleware in ``app.main`` calls :func:`is_maintenance_on` on every
request, so the DB is read at most once every ``_REFRESH_SECONDS`` behind an
async lock (per-process cache — the flag is toggled rarely and a 10s
convergence window is fine for "site down for maintenance").

Fail-open by design: if the DB read raises, traffic is NEVER blocked — the
cached/previous value is ignored and ``False`` is returned with a warning.
Blocking every request because the settings table hiccupped would turn a
maintenance toggle into an outage.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.app_settings import AppSetting

logger = logging.getLogger(__name__)

_REFRESH_SECONDS = 10.0

# Module-level process cache. ``on`` is the last known flag; ``checked`` is a
# time.monotonic() timestamp of the last successful refresh (0 forces a read).
_state: dict[str, float | bool] = {"on": False, "checked": 0.0}
_lock = asyncio.Lock()


def force_refresh() -> None:
    """Invalidate the cache so the next ``is_maintenance_on`` re-reads the DB."""
    _state["checked"] = 0.0


async def is_maintenance_on(session: AsyncSession | None = None) -> bool:
    """Return whether maintenance mode is currently enabled.

    Accepts an optional caller-owned session (tests, admin toggle handlers);
    otherwise opens its own ``SessionLocal`` — imported inside the function to
    avoid an import cycle (db.session imports config/models, not services).
    """
    now = time.monotonic()
    if now - float(_state["checked"]) < _REFRESH_SECONDS:
        return bool(_state["on"])

    async with _lock:
        # Re-check inside the lock — another request may have refreshed while
        # we waited; skip the DB hit entirely in that case.
        now = time.monotonic()
        if now - float(_state["checked"]) < _REFRESH_SECONDS:
            return bool(_state["on"])

        owns_session = session is None
        try:
            if session is None:
                from app.db.session import SessionLocal  # avoid import cycle

                session = SessionLocal()
            row = (
                await session.execute(select(AppSetting).where(AppSetting.key == "danger"))
            ).scalar_one_or_none()
            value = bool((row.value or {}).get("maintenance_mode", False)) if row else False
            _state["on"] = value
            _state["checked"] = time.monotonic()
            return value
        except Exception:  # noqa: BLE001 — fail open, never block traffic
            logger.warning("maintenance-mode refresh failed — failing open", exc_info=True)
            _state["on"] = False
            _state["checked"] = time.monotonic()
            return False
        finally:
            if owns_session and session is not None:
                await session.close()


async def set_maintenance_mode(session: AsyncSession, *, enabled: bool) -> None:
    """Upsert ``app_settings.danger.maintenance_mode`` and drop the cache.

    Mirrors the persistence shape used by ``admin_settings._save`` so the
    middleware, the admin PATCH endpoint and tests all agree on one row.
    """
    row = (
        await session.execute(select(AppSetting).where(AppSetting.key == "danger"))
    ).scalar_one_or_none()
    if row is None:
        session.add(
            AppSetting(
                key="danger",
                value={"maintenance_mode": enabled},
                updated_at=datetime.now(UTC),
            )
        )
    else:
        row.value = {"maintenance_mode": enabled}
        row.updated_at = datetime.now(UTC)
    await session.commit()
    force_refresh()


def sync_flag_file(enabled: bool, *, path: str | None = None) -> bool:
    """Mirror the DB flag into the nginx maintenance flag file.

    Nginx serves the static maintenance page whenever this file exists —
    which keeps the maintenance UX alive even while the API/frontend
    containers are being rebuilt (the whole point of the file-based gate).
    Best-effort: a missing/unwritable path logs a warning and returns False;
    the API-level middleware still works from the DB flag alone.

    ``path`` overrides ``MAINTENANCE_FLAG_PATH`` (tests pass a tmp path).
    """
    from app.config import get_settings

    flag = path or get_settings().maintenance_flag_path
    if not flag:
        return False
    try:
        if enabled:
            with open(flag, "a", encoding="utf-8") as fh:  # touch — never truncate
                fh.write("")
        else:
            import os

            if os.path.exists(flag):
                os.remove(flag)
        return True
    except OSError as exc:
        logger.warning("maintenance flag file sync failed (%s): %s", flag, exc)
        return False
