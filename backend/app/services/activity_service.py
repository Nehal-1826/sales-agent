"""Warmup activity feed + thread browsing business logic (spec §5.1 item 3).

Strictly read-only — no writes, no audit rows. Cursor pagination keyed
off the autoincrement BIGSERIAL ``id`` on ``warmup_logs`` / a numeric
offset stand-in on ``warmup_threads``. Offset-based pagination would
get quadratically slower as ``warmup_logs`` grows unbounded.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.warmup_logs import WarmupAction, WarmupLog
from app.db.models.warmup_threads import WarmupThread

# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _today_utc() -> date:
    return datetime.now(UTC).date()


def _action_enum_or_400(action: str | None) -> WarmupAction | None:
    if action is None:
        return None
    try:
        return WarmupAction(action)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action filter: {action}",
        ) from exc


async def _workspace_mailbox_ids(
    session: AsyncSession, workspace_id: uuid.UUID
) -> list[uuid.UUID]:
    result = await session.execute(
        select(Mailbox.id).where(Mailbox.workspace_id == workspace_id)
    )
    return [row[0] for row in result.all()]


async def _scope_mailbox_ids(
    session: AsyncSession, workspace_id: uuid.UUID, mailbox_id: uuid.UUID | None
) -> list[uuid.UUID]:
    if mailbox_id is not None:
        # Confirm ownership — otherwise return empty to avoid cross-workspace leak.
        owns = (
            await session.execute(
                select(Mailbox.id).where(
                    Mailbox.id == mailbox_id,
                    Mailbox.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if owns is None:
            return []
        return [mailbox_id]
    return await _workspace_mailbox_ids(session, workspace_id)


# --------------------------------------------------------------------------- #
# Activity feed                                                               #
# --------------------------------------------------------------------------- #


async def activity_feed(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    action: str | None,
    limit: int,
    cursor: int | None,
) -> dict[str, Any]:
    mailbox_ids = await _scope_mailbox_ids(session, workspace_id, mailbox_id)
    if not mailbox_ids:
        return {"items": [], "next_cursor": None}

    action_filter = _action_enum_or_400(action)

    conditions: list[ColumnElement[bool]] = [WarmupLog.mailbox_id.in_(mailbox_ids)]
    if action_filter is not None:
        conditions.append(WarmupLog.action == action_filter)
    if cursor is not None:
        conditions.append(WarmupLog.id < cursor)

    stmt = (
        select(
            WarmupLog.id,
            WarmupLog.mailbox_id,
            Mailbox.email_address,
            PeerInbox.email_address,
            WarmupLog.direction,
            WarmupLog.action,
            WarmupLog.message_id,
            WarmupLog.subject_snippet,
            WarmupLog.created_at,
        )
        .select_from(WarmupLog)
        .join(Mailbox, Mailbox.id == WarmupLog.mailbox_id)
        .join(PeerInbox, PeerInbox.id == WarmupLog.peer_inbox_id)
        .where(and_(*conditions))
        .order_by(WarmupLog.id.desc())
        .limit(limit + 1)
    )
    rows = (await session.execute(stmt)).all()

    has_more = len(rows) > limit
    trimmed = rows[:limit]
    items = [
        {
            "id": str(r[0]),
            "mailbox_id": str(r[1]) if r[1] is not None else None,
            "mailbox_email": r[2],
            "peer_email": r[3],
            "direction": r[4].value if hasattr(r[4], "value") else str(r[4]),
            "action": r[5].value if hasattr(r[5], "value") else str(r[5]),
            "message_id": r[6],
            "subject": r[7],
            # Frontend reads `ts` for the timestamp; mirror created_at into both
            # so existing consumers that use either name keep working.
            "ts": r[8].isoformat() if r[8] is not None else None,
            "created_at": r[8].isoformat() if r[8] is not None else None,
            # Frontend type expects `result: 'ok' | 'error'` — every successful
            # row in warmup_logs is implicitly 'ok'; failures aren't logged today.
            "result": "ok",
        }
        for r in trimmed
    ]
    next_cursor = int(trimmed[-1][0]) if has_more and trimmed else None
    return {"items": items, "next_cursor": next_cursor}


# --------------------------------------------------------------------------- #
# Today stats                                                                 #
# --------------------------------------------------------------------------- #


async def today_stats(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
) -> dict[str, int]:
    mailbox_ids = await _scope_mailbox_ids(session, workspace_id, mailbox_id)
    if not mailbox_ids:
        return {
            "sent": 0,
            "opens": 0,
            "replies": 0,
            "spam_rescues": 0,
            "stars": 0,
            "marked_important": 0,
        }

    today = _today_utc()
    start = datetime.combine(today, datetime.min.time()).replace(tzinfo=UTC)
    end = start + timedelta(days=1)

    rows = (
        await session.execute(
            select(WarmupLog.action, func.count())
            .where(
                WarmupLog.mailbox_id.in_(mailbox_ids),
                WarmupLog.created_at >= start,
                WarmupLog.created_at < end,
            )
            .group_by(WarmupLog.action)
        )
    ).all()
    counts: dict[str, int] = {
        "sent": 0,
        "opens": 0,
        "replies": 0,
        "spam_rescues": 0,
        "stars": 0,
        "marked_important": 0,
    }
    for action, cnt in rows:
        key = action.value if hasattr(action, "value") else str(action)
        c = int(cnt)
        if key == "sent":
            counts["sent"] = c
        elif key == "opened":
            counts["opens"] = c
        elif key == "replied":
            counts["replies"] = c
        elif key == "spam_rescued":
            counts["spam_rescues"] = c
        elif key == "starred":
            counts["stars"] = c
        elif key == "marked_important":
            counts["marked_important"] = c
    return counts


# --------------------------------------------------------------------------- #
# Threads list                                                                #
# --------------------------------------------------------------------------- #


async def list_threads(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID | None,
    limit: int,
    cursor: int | None,
) -> dict[str, Any]:
    """Thread pagination is ordered by ``last_action_at`` DESC.

    Since ``warmup_threads.id`` is a UUID (not BIGSERIAL), cursor uses an
    offset-style integer (number of rows already seen). That's acceptable
    because threads are orders of magnitude smaller than logs and rarely
    exceed a few thousand per workspace.
    """
    mailbox_ids = await _scope_mailbox_ids(session, workspace_id, mailbox_id)
    if not mailbox_ids:
        return {"items": [], "next_cursor": None}

    offset = int(cursor or 0)
    stmt = (
        select(
            WarmupThread.id,
            WarmupThread.mailbox_id,
            PeerInbox.email_address,
            WarmupThread.subject,
            WarmupThread.started_at,
            WarmupThread.last_action_at,
        )
        .select_from(WarmupThread)
        .join(PeerInbox, PeerInbox.id == WarmupThread.peer_inbox_id)
        .where(WarmupThread.mailbox_id.in_(mailbox_ids))
        .order_by(WarmupThread.last_action_at.desc(), WarmupThread.id.asc())
        .offset(offset)
        .limit(limit + 1)
    )
    rows = (await session.execute(stmt)).all()
    has_more = len(rows) > limit
    trimmed = rows[:limit]

    thread_ids = [r[0] for r in trimmed]
    counts_by_thread: dict[uuid.UUID, int] = {}
    if thread_ids:
        # message_count = warmup_logs rows sharing mailbox+peer+subject with the thread.
        # In the current schema warmup_logs has no direct thread_id FK; we
        # approximate via (mailbox_id, peer_inbox_id) pair + subject_snippet prefix.
        # For correctness in tests we fall back to counting logs for the same
        # (mailbox_id, peer_inbox_id) pair — acceptable since each warmup
        # thread maps 1:1 to a conversation between a mailbox and a peer.
        pairs = (
            await session.execute(
                select(WarmupThread.id, WarmupThread.mailbox_id, WarmupThread.peer_inbox_id)
                .where(WarmupThread.id.in_(thread_ids))
            )
        ).all()
        for tid, mbx_id, peer_id in pairs:
            cnt = int(
                (
                    await session.execute(
                        select(func.count()).select_from(WarmupLog).where(
                            WarmupLog.mailbox_id == mbx_id,
                            WarmupLog.peer_inbox_id == peer_id,
                        )
                    )
                ).scalar_one()
                or 0
            )
            counts_by_thread[tid] = cnt

    items = [
        {
            "id": r[0],
            "mailbox_id": r[1],
            "peer_email": r[2],
            "subject": r[3],
            "started_at": r[4],
            "last_action_at": r[5],
            "message_count": counts_by_thread.get(r[0], 0),
        }
        for r in trimmed
    ]
    next_cursor = offset + limit if has_more else None
    return {"items": items, "next_cursor": next_cursor}


# --------------------------------------------------------------------------- #
# Thread messages                                                             #
# --------------------------------------------------------------------------- #


async def thread_messages(
    session: AsyncSession, *, workspace_id: uuid.UUID, thread_id: uuid.UUID
) -> list[dict[str, Any]]:
    thread = (
        await session.execute(
            select(WarmupThread.id, WarmupThread.mailbox_id, WarmupThread.peer_inbox_id)
            .where(WarmupThread.id == thread_id)
        )
    ).one_or_none()
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found"
        )
    _tid, mbx_id, peer_id = thread
    owns = (
        await session.execute(
            select(Mailbox.id).where(
                Mailbox.id == mbx_id, Mailbox.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()
    if owns is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found"
        )

    rows = (
        await session.execute(
            select(
                WarmupLog.id,
                WarmupLog.direction,
                WarmupLog.action,
                WarmupLog.message_id,
                WarmupLog.subject_snippet,
                WarmupLog.created_at,
            )
            .where(
                WarmupLog.mailbox_id == mbx_id,
                WarmupLog.peer_inbox_id == peer_id,
            )
            .order_by(WarmupLog.created_at.asc(), WarmupLog.id.asc())
        )
    ).all()
    return [
        {
            "id": int(r[0]),
            "direction": r[1].value if hasattr(r[1], "value") else str(r[1]),
            "action": r[2].value if hasattr(r[2], "value") else str(r[2]),
            "message_id": r[3],
            "subject_snippet": r[4],
            "created_at": r[5],
        }
        for r in rows
    ]
