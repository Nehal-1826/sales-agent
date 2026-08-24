"""Peer-inbox selection for an outbound warmup send.

Routing rules (spec §7 — peer pools):
    1. The mailbox's workspace picks a pool via ``client_pool_assignments``.
    2. If assigned + the dedicated pool has eligible peers: pick from there.
    3. If assigned but the dedicated pool is empty (no eligible peers), fall
       back to the default pool AND write an audit row so support can react.
    4. If unassigned: pick from ``peer_pools.is_default=True``.
    5. Candidates are peers in the chosen pool where:
          - ``is_active = true``
          - ``used_today < daily_capacity``
          - NOT used by this mailbox in the last 24 h (cooldown)
          - NOT sharing an email with any client mailbox or login
            account (contamination guard — clients must never warm up
            each other), and never the mailbox's own address
    6. Among candidates, weighted random pick by ``reputation_score``.

Weighted draw: peers with score 0 never win; a floor of 0.01 is applied so
numerically-zero (but still eligible) peers *can* be picked occasionally as
the system bootstraps new peers.
"""
from __future__ import annotations

import logging
import random
import uuid
from datetime import UTC, datetime, timedelta
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.client_pool_assignments import ClientPoolAssignment
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.peer_pools import PeerPool, PeerPoolMember
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupDirection, WarmupLog

logger = logging.getLogger(__name__)


async def _resolve_assignment(
    workspace_id: uuid.UUID, db: AsyncSession
) -> uuid.UUID | None:
    """Return the dedicated pool_id this workspace is pinned to, if any."""
    assigned = await db.scalar(
        select(ClientPoolAssignment.pool_id).where(
            ClientPoolAssignment.workspace_id == workspace_id
        )
    )
    return cast("uuid.UUID | None", assigned)


async def _default_pool_id(db: AsyncSession) -> uuid.UUID | None:
    fallback = await db.scalar(
        select(PeerPool.id).where(PeerPool.is_default.is_(True))
    )
    return cast("uuid.UUID | None", fallback)


async def _eligible_in_pool(
    pool_id: uuid.UUID, db: AsyncSession
) -> list[PeerInbox]:
    # Defense-in-depth against peer-network contamination: a peer whose email
    # matches ANY client mailbox or login account must never be selected,
    # even if a contaminated row already exists in the pool (rows created
    # before the create/import guards landed). Anti-join via correlated NOT
    # EXISTS keeps this a single query.
    mailbox_overlap = (
        select(Mailbox.id)
        .where(
            func.lower(Mailbox.email_address) == func.lower(PeerInbox.email_address)
        )
        .exists()
        .correlate(PeerInbox)
    )
    user_overlap = (
        select(User.id)
        .where(func.lower(User.email) == func.lower(PeerInbox.email_address))
        .exists()
        .correlate(PeerInbox)
    )
    stmt = (
        select(PeerInbox)
        .join(PeerPoolMember, PeerPoolMember.peer_inbox_id == PeerInbox.id)
        .where(
            PeerPoolMember.pool_id == pool_id,
            PeerInbox.is_active.is_(True),
            PeerInbox.used_today < PeerInbox.daily_capacity,
            ~mailbox_overlap,
            ~user_overlap,
        )
    )
    return list((await db.scalars(stmt)).all())


async def _audit_dedicated_pool_starved(
    db: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    dedicated_pool_id: uuid.UUID,
    fallback_pool_id: uuid.UUID | None,
) -> None:
    """Emit an audit row when a dedicated pool has no eligible peers.

    Uses a SAVEPOINT so audit-write failures can't poison the surrounding
    transaction — matches the per-service ``_write_audit`` convention.
    """
    entry = AuditLog(
        actor_user_id=None,
        actor_role="system",
        action="peer_pool.dedicated_starved",
        target_type="peer_pool",
        target_id=dedicated_pool_id,
        payload={
            "workspace_id": str(workspace_id),
            "dedicated_pool_id": str(dedicated_pool_id),
            "fallback_pool_id": (
                str(fallback_pool_id) if fallback_pool_id else None
            ),
        },
    )
    try:
        async with db.begin_nested():
            db.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("dedicated_pool_starved audit failed: %s", exc)


async def pick_peer_inbox(mailbox_id: uuid.UUID, db: AsyncSession) -> PeerInbox | None:
    """Select a peer inbox to receive the next warmup send, or None."""
    mailbox = await db.get(Mailbox, mailbox_id)
    if mailbox is None:
        return None

    # Per-mailbox pin wins over the workspace assignment; otherwise fall back
    # to the workspace's ClientPoolAssignment (existing behaviour).
    if mailbox.pool_id is not None:
        dedicated_pool_id: uuid.UUID | None = mailbox.pool_id
    else:
        dedicated_pool_id = await _resolve_assignment(mailbox.workspace_id, db)

    candidates: list[PeerInbox] = []
    chosen_pool_id: uuid.UUID | None = None

    if dedicated_pool_id is not None:
        candidates = await _eligible_in_pool(dedicated_pool_id, db)
        if candidates:
            chosen_pool_id = dedicated_pool_id
        else:
            # Dedicated pool starved — audit + fall back to default pool so
            # we don't drop the send entirely.
            fallback = await _default_pool_id(db)
            await _audit_dedicated_pool_starved(
                db,
                workspace_id=mailbox.workspace_id,
                dedicated_pool_id=dedicated_pool_id,
                fallback_pool_id=fallback,
            )
            if fallback is not None and fallback != dedicated_pool_id:
                candidates = await _eligible_in_pool(fallback, db)
                chosen_pool_id = fallback
    else:
        default_id = await _default_pool_id(db)
        if default_id is None:
            return None
        candidates = await _eligible_in_pool(default_id, db)
        chosen_pool_id = default_id

    # Belt-and-suspenders self-send guard: even if a contaminated peer row
    # slipped past the anti-join above, a peer sharing the mailbox's own
    # address must never receive a warmup send from that mailbox.
    candidates = [
        c
        for c in candidates
        if c.email_address.lower() != mailbox.email_address.lower()
    ]

    if not candidates or chosen_pool_id is None:
        return None

    # Exclude peers this mailbox contacted in the last 24 h.
    since = datetime.now(UTC) - timedelta(hours=24)
    recent_stmt = select(WarmupLog.peer_inbox_id).where(
        WarmupLog.mailbox_id == mailbox_id,
        WarmupLog.direction == WarmupDirection.outbound,
        WarmupLog.created_at >= since,
    )
    recent_peer_ids = set((await db.scalars(recent_stmt)).all())

    eligible = [p for p in candidates if p.id not in recent_peer_ids]
    if not eligible:
        # Pool fully dedup-exhausted: this mailbox already contacted every
        # capacity-eligible peer in the last 24h (more sends/day than the pool
        # has peers). Rather than DROP the send (no_peer_available), fall back
        # to the least-recently-contacted peers so a small pool keeps warming.
        # This re-uses a peer sooner than 24h — the lesser evil vs stalling.
        last_contact = dict(
            (
                await db.execute(
                    select(WarmupLog.peer_inbox_id, func.max(WarmupLog.created_at))
                    .where(
                        WarmupLog.mailbox_id == mailbox_id,
                        WarmupLog.direction == WarmupDirection.outbound,
                        WarmupLog.peer_inbox_id.in_([p.id for p in candidates]),
                    )
                    .group_by(WarmupLog.peer_inbox_id)
                )
            ).all()
        )
        # Oldest last-contact first; take the less-recently-used half so the
        # weighted pick below still spreads load instead of hammering one peer.
        ordered = sorted(candidates, key=lambda p: last_contact.get(p.id) or since)
        eligible = ordered[: max(1, len(ordered) // 2)]
        logger.info(
            "pairing.dedup_exhausted mailbox=%s pool=%s reusing_lru=%d",
            mailbox_id, chosen_pool_id, len(eligible),
        )

    # Weighted random pick — reputation_score weight, floored at 0.01 so fresh
    # peers aren't permanently shut out. Score 0.0 explicitly maps to 0 weight.
    weights = [max(p.reputation_score, 0.01) if p.reputation_score > 0 else 0.0 for p in eligible]
    if sum(weights) == 0:
        # All candidates have reputation 0 — fall back to uniform draw so we
        # still deliver a peer rather than None.
        return random.choice(eligible)

    return random.choices(eligible, weights=weights, k=1)[0]
