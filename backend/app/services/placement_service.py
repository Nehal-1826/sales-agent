"""Placement Tester (Pro Plus) — business logic.

start_test → pick ~30 seeds (10 per provider preferred), persist a
``PlacementTest`` plus N ``PlacementTestSeed`` rows, enqueue the per-seed
send task and the polling task.

finalize_test → aggregate seed rows into the public results JSON, mark the
test ``completed``, fire the ``placement_test_completed`` event.

The monthly quota is enforced via the hardcoded ``MONTHLY_CAP`` dict (v1).
A future migration may move this into ``plans.capabilities`` but a dict
keeps the surface area small for the first ship.
"""
from __future__ import annotations

import logging
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.placement_test_seeds import PlacementTestSeed
from app.db.models.placement_tests import PlacementTest
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.session import SessionLocal
from app.services import notifications_dispatch

logger = logging.getLogger(__name__)


# Per-plan monthly placement-test caps. v1 hardcode — easy to move into
# ``plans.capabilities`` later. Plan-name lookup is case-insensitive.
MONTHLY_CAP: dict[str, int] = {
    "starter": 0,
    "pro": 0,
    "pro_plus": 50,
    "pro plus": 50,
    "agency": 200,
    "enterprise": 999_999,
}

SEED_TARGET_PER_PROVIDER = 10
SEED_TARGET_TOTAL = 30
TEST_TIMEOUT = timedelta(minutes=15)

# Folder-name → bucket lookup. Anything else → "other".
_FOLDER_BUCKETS: dict[str, str] = {
    "inbox": "inbox",
    "[gmail]/spam": "spam",
    "spam": "spam",
    "junk": "spam",
    "junk e-mail": "spam",
    "bulk mail": "spam",
    "[gmail]/promotions": "promotions",
    "promotions": "promotions",
    "[gmail]/updates": "promotions",
    "[gmail]/social": "promotions",
    "[gmail]/forums": "promotions",
}


class PlacementQuotaExceeded(Exception):
    """Raised when the workspace has used its monthly placement-test quota."""

    def __init__(self, used: int, cap: int) -> None:
        super().__init__(
            f"Placement-test quota exceeded: used {used}/{cap} this month."
        )
        self.used = used
        self.cap = cap


class PlacementMailboxNotFound(Exception):
    """Raised when the mailbox isn't owned by this workspace."""


def folder_to_bucket(folder: str | None) -> str:
    """Map an IMAP folder name → public bucket (inbox/spam/promotions/other)."""
    if not folder:
        return "other"
    key = folder.strip().lower()
    return _FOLDER_BUCKETS.get(key, "other")


async def _monthly_cap_for(session: AsyncSession, user: User) -> int:
    if user.plan_id is None:
        return 0
    plan = await session.get(Plan, user.plan_id)
    if plan is None:
        return 0
    key = (plan.name or "").strip().lower()
    return MONTHLY_CAP.get(key, 0)


async def _count_tests_this_month(
    session: AsyncSession, workspace_id: uuid.UUID
) -> int:
    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    return int(
        (
            await session.execute(
                select(func.count())
                .select_from(PlacementTest)
                .where(
                    PlacementTest.workspace_id == workspace_id,
                    PlacementTest.created_at >= month_start,
                )
            )
        ).scalar_one()
        or 0
    )


async def _pick_seeds(session: AsyncSession) -> list[PeerInbox]:
    """Pick up to SEED_TARGET_TOTAL seed peers, balanced across providers.

    Strategy: pull every active+seed peer ordered by reputation_score DESC,
    then bucket into ≤ SEED_TARGET_PER_PROVIDER per provider, then top-up
    with leftovers until we hit SEED_TARGET_TOTAL or run out.
    """
    rows = (
        await session.execute(
            select(PeerInbox)
            .where(PeerInbox.is_seed.is_(True), PeerInbox.is_active.is_(True))
            .order_by(PeerInbox.reputation_score.desc())
        )
    ).scalars().all()

    by_provider: dict[Any, list[PeerInbox]] = defaultdict(list)
    for r in rows:
        by_provider[r.provider].append(r)

    picked: list[PeerInbox] = []
    leftovers: list[PeerInbox] = []
    for provider, peers in by_provider.items():
        picked.extend(peers[:SEED_TARGET_PER_PROVIDER])
        leftovers.extend(peers[SEED_TARGET_PER_PROVIDER:])

    if len(picked) < SEED_TARGET_TOTAL:
        slots = SEED_TARGET_TOTAL - len(picked)
        picked.extend(leftovers[:slots])

    return picked[:SEED_TARGET_TOTAL]


async def _write_audit(
    session: AsyncSession,
    *,
    actor_user_id: uuid.UUID | None,
    actor_role: str,
    action: str,
    target_id: uuid.UUID,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        target_type="placement_test",
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("placement audit write failed action=%s err=%s", action, exc)


async def start_test(
    workspace_id: uuid.UUID,
    mailbox_id: uuid.UUID,
    *,
    user: User,
    session: AsyncSession,
) -> PlacementTest:
    """Kick off a placement test. Caller already authenticated the user."""
    mailbox = await session.get(Mailbox, mailbox_id)
    if mailbox is None or mailbox.workspace_id != workspace_id:
        raise PlacementMailboxNotFound(
            f"mailbox {mailbox_id} not in workspace {workspace_id}"
        )

    cap = await _monthly_cap_for(session, user)
    used = await _count_tests_this_month(session, workspace_id)
    if used >= cap:
        raise PlacementQuotaExceeded(used=used, cap=cap)

    seeds = await _pick_seeds(session)
    if not seeds:
        # Empty seed pool — still create the test row so the user gets a
        # visible "no seeds available" result rather than silent 500.
        logger.warning(
            "placement.start_test.no_seeds workspace_id=%s mailbox_id=%s",
            workspace_id,
            mailbox_id,
        )

    test = PlacementTest(
        mailbox_id=mailbox_id,
        workspace_id=workspace_id,
        seed_set={
            "seed_count": len(seeds),
            "providers": dict(
                Counter(
                    (s.provider.value if hasattr(s.provider, "value") else str(s.provider))
                    for s in seeds
                )
            ),
        },
        status="running" if seeds else "completed",
        sent_at=datetime.now(UTC) if seeds else None,
    )
    session.add(test)
    await session.flush()

    seed_rows: list[PlacementTestSeed] = []
    for peer in seeds:
        row = PlacementTestSeed(
            test_id=test.id,
            seed_peer_id=peer.id,
            status="pending",
        )
        session.add(row)
        seed_rows.append(row)
    await session.flush()

    await _write_audit(
        session,
        actor_user_id=user.id,
        actor_role=user.role.value if hasattr(user.role, "value") else str(user.role),
        action="placement_test.started",
        target_id=test.id,
        payload={
            "mailbox_id": str(mailbox_id),
            "seed_count": len(seeds),
        },
    )
    await session.commit()

    # Enqueue per-seed send + the polling task. Imported locally so the
    # service module remains importable in tests that don't have Celery
    # configured.
    try:
        from app.tasks.placement_poll import poll as poll_task
        from app.tasks.placement_send import send_probe as send_task

        for row in seed_rows:
            send_task.apply_async(args=[str(test.id), str(row.seed_peer_id)])
        if seed_rows:
            poll_task.apply_async(args=[str(test.id)], countdown=60)
    except Exception as exc:  # noqa: BLE001
        logger.warning("placement.enqueue_failed test_id=%s err=%s", test.id, exc)

    if not seeds:
        # Immediately finalize empty-seed tests so the UI doesn't spin.
        await finalize_test(test.id)

    return test


def _aggregate(seed_rows: list[PlacementTestSeed]) -> dict[str, Any]:
    buckets = {"inbox": 0, "promotions": 0, "spam": 0, "other": 0, "timeout": 0}
    by_provider_counter: dict[str, Counter] = defaultdict(Counter)
    for row in seed_rows:
        status = row.status or "other"
        if status not in buckets:
            # 'pending'/'sent' that survived past timeout → 'timeout'.
            status = "other" if status not in ("pending", "sent") else "timeout"
        buckets[status] += 1
    return {
        **buckets,
        "total_seeds": len(seed_rows),
        "by_provider": {k: dict(v) for k, v in by_provider_counter.items()},
    }


async def finalize_test(test_id: uuid.UUID) -> dict[str, Any]:
    """Aggregate, persist results, fire the completion event."""
    async with SessionLocal() as session:
        test = await session.get(PlacementTest, test_id)
        if test is None:
            return {}
        seed_rows = (
            await session.execute(
                select(PlacementTestSeed).where(
                    PlacementTestSeed.test_id == test_id
                )
            )
        ).scalars().all()

        # Resolve peer providers in one batch so by_provider counts work.
        peer_ids = [r.seed_peer_id for r in seed_rows]
        provider_by_peer: dict[uuid.UUID, str] = {}
        if peer_ids:
            for peer in (
                await session.execute(
                    select(PeerInbox).where(PeerInbox.id.in_(peer_ids))
                )
            ).scalars().all():
                provider_by_peer[peer.id] = (
                    peer.provider.value
                    if hasattr(peer.provider, "value")
                    else str(peer.provider)
                )

        buckets = {"inbox": 0, "promotions": 0, "spam": 0, "other": 0, "timeout": 0}
        by_provider: dict[str, Counter] = defaultdict(Counter)
        for row in seed_rows:
            status = row.status or "other"
            if status in ("pending", "sent", "pending_check"):
                status = "timeout"
            if status not in buckets:
                status = "other"
            buckets[status] += 1
            prov = provider_by_peer.get(row.seed_peer_id, "unknown")
            by_provider[prov][status] += 1

        results = {
            **buckets,
            "total_seeds": len(seed_rows),
            "by_provider": {k: dict(v) for k, v in by_provider.items()},
        }
        test.results = results
        test.status = "completed"
        await session.commit()

        payload = {
            "workspace_id": str(test.workspace_id) if test.workspace_id else None,
            "test_id": str(test.id),
            "mailbox_id": str(test.mailbox_id),
            "results": results,
            "event": notifications_dispatch.PLACEMENT_TEST_COMPLETED,
        }
        try:
            await notifications_dispatch.fire(
                notifications_dispatch.PLACEMENT_TEST_COMPLETED, payload
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("placement.notify_failed test_id=%s err=%s", test_id, exc)

        return results


async def get_status(
    test_id: uuid.UUID, *, session: AsyncSession
) -> dict[str, Any] | None:
    test = await session.get(PlacementTest, test_id)
    if test is None:
        return None
    seed_rows = (
        await session.execute(
            select(PlacementTestSeed).where(
                PlacementTestSeed.test_id == test_id
            )
        )
    ).scalars().all()
    return {
        "id": str(test.id),
        "mailbox_id": str(test.mailbox_id),
        "workspace_id": str(test.workspace_id) if test.workspace_id else None,
        "status": test.status,
        "results": test.results,
        "created_at": test.created_at.isoformat() if test.created_at else None,
        "sent_at": test.sent_at.isoformat() if test.sent_at else None,
        "seeds": [
            {
                "id": str(s.id),
                "seed_peer_id": str(s.seed_peer_id),
                "status": s.status,
                "landed_folder": s.landed_folder,
                "landed_at": s.landed_at.isoformat() if s.landed_at else None,
                "message_id": s.message_id,
            }
            for s in seed_rows
        ],
    }
