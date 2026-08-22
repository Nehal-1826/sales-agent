"""Julex (julex.shop) store-link service.

A merchant pastes their Julex Public API key (``pk_live_...``) into
WarmPulse. We verify it against Julex's public settings endpoint and
persist the workspace ↔ store link on ``workspace_settings``. Julex later
polls the public status endpoint (see ``api/routes/integrations_julex.py``)
to discover the workspace's mailbox count and plan.

Network calls are strictly best-effort: :func:`verify_store_key` never
raises — it maps every failure onto a ``VerifyResult`` the route can
translate into a user-facing error.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.mailboxes import Mailbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.workspace_settings import WorkspaceSetting

logger = logging.getLogger(__name__)

# Julex rejects an unknown/revoked store key with one of these statuses.
_INVALID_KEY_STATUSES = {401, 403, 404}
_TIMEOUT = 10.0


@dataclass(frozen=True)
class VerifyResult:
    """Outcome of a store-key verification. ``error`` is a stable machine
    key ("invalid key" | "julex unreachable"), not user-facing prose."""

    ok: bool
    store_name: str | None = None
    error: str | None = None


async def verify_store_key(store_key: str) -> VerifyResult:
    """GET ``{julex_base_url}/api/public/settings`` with the store key header.

    200 → ok + store name (accepts ``storeName`` or ``store_name``; the name
    is optional so a missing key degrades to ``None``). 401/403/404 → the
    key is invalid. Any other status or a network error → "julex
    unreachable". Never raises.
    """
    settings = get_settings()
    url = f"{settings.julex_base_url}/api/public/settings"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            resp = await http.get(url, headers={"x-store-key": store_key})
    except Exception as exc:  # noqa: BLE001 — transport errors must not raise
        logger.warning("julex.verify.unreachable err=%s", exc)
        return VerifyResult(ok=False, error="julex unreachable")

    if resp.status_code == 200:
        try:
            data = resp.json()
        except Exception:  # noqa: BLE001 — malformed JSON → name-less success
            data = {}
        name = data.get("storeName") or data.get("store_name") or None
        return VerifyResult(ok=True, store_name=name)

    if resp.status_code in _INVALID_KEY_STATUSES:
        logger.info("julex.verify.invalid_key status=%s", resp.status_code)
        return VerifyResult(ok=False, error="invalid key")

    logger.warning("julex.verify.unexpected_status status=%s", resp.status_code)
    return VerifyResult(ok=False, error="julex unreachable")


async def _load_or_create_workspace_settings(
    session: AsyncSession, *, workspace_id: uuid.UUID, default_sender: str | None
) -> WorkspaceSetting:
    """Fetch the workspace's settings row, creating the default one on first
    touch (same defaults as the Pro Settings loader in workspace_settings)."""
    row = await session.get(WorkspaceSetting, workspace_id)
    if row is not None:
        return row
    row = WorkspaceSetting(
        workspace_id=workspace_id,
        name=None,
        slug=None,
        default_sender=default_sender,
        brand_color="#F26522",
        retention_days=90,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


async def connect_workspace(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    store_key: str,
    store_name: str | None,
    default_sender: str | None = None,
) -> None:
    """Link (or re-link) the workspace to a Julex store.

    Raises ``ValueError("already_linked")`` when another workspace already
    holds this store key (unique-index violation) — the route maps that to
    a 409.
    """
    row = await _load_or_create_workspace_settings(
        session, workspace_id=workspace_id, default_sender=default_sender
    )
    row.julex_store_key = store_key
    row.julex_store_name = store_name
    row.julex_connected_at = datetime.now(UTC)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise ValueError("already_linked") from exc


async def disconnect_workspace(session: AsyncSession, *, workspace_id: uuid.UUID) -> None:
    """Clear the Julex link on the workspace (idempotent — no row, no-op)."""
    row = await session.get(WorkspaceSetting, workspace_id)
    if row is None:
        return
    row.julex_store_key = None
    row.julex_store_name = None
    row.julex_connected_at = None
    await session.commit()


async def get_workspace_settings(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> WorkspaceSetting | None:
    """Read the workspace settings row, if one exists."""
    return await session.get(WorkspaceSetting, workspace_id)


async def get_public_status(
    session: AsyncSession, *, store_key: str
) -> dict[str, object] | None:
    """Public status payload for Julex polling, or None when unlinked.

    Exposed (unauthenticated) via ``GET /api/integrations/julex/status`` —
    restricted to what Julex needs: store name, active mailbox count, plan
    name, connection timestamp. The workspace owner (earliest-created user)
    supplies the plan name so the answer is deterministic.
    """
    row = (
        await session.execute(
            select(WorkspaceSetting).where(WorkspaceSetting.julex_store_key == store_key)
        )
    ).scalar_one_or_none()
    if row is None:
        return None

    mailboxes = (
        await session.execute(
            select(func.count())
            .select_from(Mailbox)
            .where(Mailbox.workspace_id == row.workspace_id)
        )
    ).scalar_one()

    plan_name = (
        await session.execute(
            select(Plan.name)
            .join(User, User.plan_id == Plan.id)
            .where(User.workspace_id == row.workspace_id)
            .order_by(User.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()

    return {
        "connected": True,
        "store_name": row.julex_store_name,
        "mailboxes": int(mailboxes),
        "plan": plan_name,
        "connected_at": row.julex_connected_at,
    }
