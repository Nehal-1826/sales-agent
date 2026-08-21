"""Peer pool + pool-routing business logic (spec §7, §5.2).

Pools group peer inboxes. Each client workspace is assigned to exactly
one pool (DB unique constraint on ``client_pool_assignments.workspace_id``).
Exactly one pool is the default — new peers land there, and unassigning
a workspace reverts it to the default pool (never orphan-assigned).
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.client_pool_assignments import ClientPoolAssignment
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.peer_pools import PeerPool, PeerPoolMember
from app.db.models.plans import Plan
from app.db.models.users import User, UserRole
from app.db.models.warmup_logs import WarmupAction, WarmupLog


def _workspace_sends_30d_subquery():
    """Sends per workspace in the last 30 days (outbound warmup `sent` actions).

    Cutoff computed in Python so the comparison is a bound datetime parameter —
    portable across Postgres (prod) and SQLite (tests), unlike a SQL interval.
    """
    cutoff = datetime.now(UTC) - timedelta(days=30)
    return (
        select(
            Mailbox.workspace_id.label("workspace_id"),
            func.count(WarmupLog.id).label("sends_count"),
        )
        .join(WarmupLog, WarmupLog.mailbox_id == Mailbox.id)
        .where(
            WarmupLog.action == WarmupAction.sent,
            WarmupLog.created_at > cutoff,
        )
        .group_by(Mailbox.workspace_id)
        .subquery()
    )
from app.schemas.peer_pools import (
    AddMembersResponse,
    PoolAssignmentOut,
    PoolCreate,
    PoolOut,
    PoolUpdate,
    SankeyData,
    SankeyLink,
    SankeyNode,
    UnassignedClient,
)

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Audit                                                                        #
# --------------------------------------------------------------------------- #


async def _write_audit(
    session: AsyncSession,
    *,
    action: str,
    actor: User,
    target_type: str,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = AuditLog(
        actor_user_id=actor.id,
        actor_role=actor.role.value if hasattr(actor.role, "value") else str(actor.role),
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=payload,
    )
    try:
        async with session.begin_nested():
            session.add(entry)
    except Exception as exc:  # pragma: no cover
        logger.warning("audit write failed action=%s: %s", action, exc)


# --------------------------------------------------------------------------- #
# Projection                                                                   #
# --------------------------------------------------------------------------- #


async def _member_count(session: AsyncSession, pool_id: uuid.UUID) -> int:
    stmt = select(func.count(PeerPoolMember.peer_inbox_id)).where(
        PeerPoolMember.pool_id == pool_id
    )
    return int((await session.execute(stmt)).scalar_one())


async def _client_count(session: AsyncSession, pool_id: uuid.UUID) -> int:
    """Count workspaces routed through this pool.

    Joins on users so workspaces whose only user has been deleted (or which
    never had a user — e.g. a stale auto-assigned row) don't inflate the
    "Assigned clients" tile. Without this, signing up + then re-signing-up
    leaves an orphan ClientPoolAssignment row that gets counted forever.
    """
    from app.db.models.users import User
    stmt = (
        select(func.count(func.distinct(ClientPoolAssignment.workspace_id)))
        .select_from(ClientPoolAssignment)
        .join(User, User.workspace_id == ClientPoolAssignment.workspace_id)
        .where(ClientPoolAssignment.pool_id == pool_id)
    )
    return int((await session.execute(stmt)).scalar_one())


async def pool_to_out(session: AsyncSession, pool: PeerPool) -> PoolOut:
    return PoolOut(
        id=pool.id,
        name=pool.name,
        description=pool.description,
        is_default=pool.is_default,
        daily_send_limit=pool.daily_send_limit,
        member_count=await _member_count(session, pool.id),
        client_count=await _client_count(session, pool.id),
        created_at=pool.created_at,
    )


# --------------------------------------------------------------------------- #
# Queries                                                                      #
# --------------------------------------------------------------------------- #


async def get_pool_or_404(session: AsyncSession, pool_id: uuid.UUID) -> PeerPool:
    pool = await session.get(PeerPool, pool_id)
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pool not found"
        )
    return pool


async def list_pools(session: AsyncSession) -> list[PoolOut]:
    stmt = select(PeerPool).order_by(
        PeerPool.is_default.desc(), PeerPool.created_at.asc()
    )
    pools = list((await session.execute(stmt)).scalars().all())
    return [await pool_to_out(session, p) for p in pools]


async def list_pool_members(
    session: AsyncSession, *, pool_id: uuid.UUID, page: int, page_size: int
) -> tuple[list[PeerInbox], int]:
    total_stmt = select(func.count(PeerPoolMember.peer_inbox_id)).where(
        PeerPoolMember.pool_id == pool_id
    )
    total = int((await session.execute(total_stmt)).scalar_one())
    stmt = (
        select(PeerInbox)
        .join(PeerPoolMember, PeerPoolMember.peer_inbox_id == PeerInbox.id)
        .where(PeerPoolMember.pool_id == pool_id)
        .order_by(PeerInbox.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    return rows, total


# --------------------------------------------------------------------------- #
# Create / Update                                                              #
# --------------------------------------------------------------------------- #


async def _demote_existing_default(
    session: AsyncSession, *, keep_id: uuid.UUID | None = None
) -> None:
    stmt = select(PeerPool).where(PeerPool.is_default.is_(True))
    for p in (await session.execute(stmt)).scalars().all():
        if keep_id is not None and p.id == keep_id:
            continue
        p.is_default = False
    await session.flush()


async def create_pool(
    session: AsyncSession, *, actor: User, payload: PoolCreate
) -> PeerPool:
    if payload.is_default:
        await _demote_existing_default(session)
    pool = PeerPool(
        name=payload.name,
        description=payload.description,
        is_default=payload.is_default,
        daily_send_limit=payload.daily_send_limit,
    )
    session.add(pool)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Pool with name '{payload.name}' already exists",
        ) from exc
    await _write_audit(
        session,
        action="peer_pool.created",
        actor=actor,
        target_type="peer_pool",
        target_id=pool.id,
        payload={"name": pool.name, "is_default": pool.is_default},
    )
    await session.commit()
    await session.refresh(pool)
    return pool


async def update_pool(
    session: AsyncSession,
    *,
    actor: User,
    pool_id: uuid.UUID,
    payload: PoolUpdate,
) -> PeerPool:
    pool = await get_pool_or_404(session, pool_id)
    data = payload.model_dump(exclude_unset=True)
    changes: dict[str, Any] = {}
    if "name" in data and data["name"] is not None:
        pool.name = data["name"]
        changes["name"] = pool.name
    if "description" in data:
        pool.description = data["description"]
        changes["description"] = pool.description
    if "daily_send_limit" in data:
        pool.daily_send_limit = data["daily_send_limit"]
        changes["daily_send_limit"] = pool.daily_send_limit
    if "is_default" in data and data["is_default"] is not None:
        new_default = bool(data["is_default"])
        if new_default and not pool.is_default:
            await _demote_existing_default(session, keep_id=pool.id)
        if not new_default and pool.is_default:
            # Demoting the last remaining default would leave pairing with
            # no fallback pool — every unassigned workspace would hit
            # no_peer_available. Require promoting another pool first.
            defaults_count = int(
                (
                    await session.execute(
                        select(func.count(PeerPool.id)).where(
                            PeerPool.is_default.is_(True)
                        )
                    )
                ).scalar_one()
            )
            if defaults_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot demote the only default pool — promote another pool first",
                )
        pool.is_default = new_default
        changes["is_default"] = new_default
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pool name conflict",
        ) from exc
    await _write_audit(
        session,
        action="peer_pool.updated",
        actor=actor,
        target_type="peer_pool",
        target_id=pool.id,
        payload={"pool_id": str(pool.id), "fields": sorted(changes.keys())},
    )
    await session.commit()
    await session.refresh(pool)
    return pool


async def delete_pool(
    session: AsyncSession, *, actor: User, pool_id: uuid.UUID
) -> None:
    pool = await get_pool_or_404(session, pool_id)
    if pool.is_default:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete the default pool",
        )
    assignments_exist = (
        await session.execute(
            select(func.count(ClientPoolAssignment.id)).where(
                ClientPoolAssignment.pool_id == pool_id
            )
        )
    ).scalar_one()
    if int(assignments_exist) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pool still has client assignments — reassign them first",
        )

    # Clear membership rows explicitly (portable across sqlite/postgres).
    await session.execute(
        delete(PeerPoolMember).where(PeerPoolMember.pool_id == pool_id)
    )
    name_copy = pool.name
    id_copy = pool.id
    await session.delete(pool)
    await session.flush()
    await _write_audit(
        session,
        action="peer_pool.deleted",
        actor=actor,
        target_type="peer_pool",
        target_id=id_copy,
        payload={"pool_id": str(id_copy), "name": name_copy},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Membership mgmt                                                              #
# --------------------------------------------------------------------------- #


async def add_members(
    session: AsyncSession,
    *,
    actor: User,
    pool_id: uuid.UUID,
    peer_ids: list[uuid.UUID],
) -> AddMembersResponse:
    await get_pool_or_404(session, pool_id)
    # Verify peers exist.
    if peer_ids:
        existing_peer_ids = set(
            (
                await session.execute(
                    select(PeerInbox.id).where(PeerInbox.id.in_(peer_ids))
                )
            )
            .scalars()
            .all()
        )
    else:
        existing_peer_ids = set()

    # Existing memberships in this pool.
    existing_memberships = set(
        (
            await session.execute(
                select(PeerPoolMember.peer_inbox_id).where(
                    PeerPoolMember.pool_id == pool_id,
                    PeerPoolMember.peer_inbox_id.in_(peer_ids or [uuid.uuid4()]),
                )
            )
        )
        .scalars()
        .all()
    )

    added = 0
    already = 0
    for pid in peer_ids:
        if pid not in existing_peer_ids:
            # Silently skip unknowns — could argue for 400 but the route
            # contract says idempotent UPSERT.
            continue
        if pid in existing_memberships:
            already += 1
            continue
        session.add(PeerPoolMember(peer_inbox_id=pid, pool_id=pool_id))
        added += 1
    await session.flush()
    await _write_audit(
        session,
        action="peer_pool.members_added",
        actor=actor,
        target_type="peer_pool",
        target_id=pool_id,
        payload={"added": added, "already_member": already},
    )
    await session.commit()
    return AddMembersResponse(added=added, already_member=already)


async def remove_member(
    session: AsyncSession,
    *,
    actor: User,
    pool_id: uuid.UUID,
    peer_inbox_id: uuid.UUID,
) -> None:
    await get_pool_or_404(session, pool_id)
    stmt = select(PeerPoolMember).where(
        PeerPoolMember.pool_id == pool_id,
        PeerPoolMember.peer_inbox_id == peer_inbox_id,
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Peer is not a member of this pool"
        )
    await session.delete(row)
    await session.flush()
    await _write_audit(
        session,
        action="peer_pool.member_removed",
        actor=actor,
        target_type="peer_pool",
        target_id=pool_id,
        payload={"pool_id": str(pool_id), "peer_inbox_id": str(peer_inbox_id)},
    )
    await session.commit()


# --------------------------------------------------------------------------- #
# Pool routing — client -> pool assignment                                     #
# --------------------------------------------------------------------------- #


async def _default_pool(session: AsyncSession) -> PeerPool:
    stmt = select(PeerPool).where(PeerPool.is_default.is_(True)).limit(1)
    pool = (await session.execute(stmt)).scalar_one_or_none()
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No default pool configured",
        )
    return pool


async def list_assignments(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    pool_id: uuid.UUID | None = None,
    search: str | None = None,
) -> tuple[list[PoolAssignmentOut], int]:
    # Join assignments -> users (via workspace_id, distinct per workspace)
    # For MVP a workspace maps to exactly one user (the client owner); we
    # pick the first matching user's email.
    sends_sub = _workspace_sends_30d_subquery()
    base = (
        select(
            ClientPoolAssignment,
            User.id,
            User.email,
            Plan.name,
            PeerPool.name,
            func.coalesce(sends_sub.c.sends_count, 0),
        )
        .join(User, User.workspace_id == ClientPoolAssignment.workspace_id)
        .outerjoin(Plan, Plan.id == User.plan_id)
        .join(PeerPool, PeerPool.id == ClientPoolAssignment.pool_id)
        .outerjoin(sends_sub, sends_sub.c.workspace_id == ClientPoolAssignment.workspace_id)
    )
    count_stmt = (
        select(func.count(ClientPoolAssignment.id))
        .join(User, User.workspace_id == ClientPoolAssignment.workspace_id)
    )

    if pool_id is not None:
        base = base.where(ClientPoolAssignment.pool_id == pool_id)
        count_stmt = count_stmt.where(ClientPoolAssignment.pool_id == pool_id)
    if search:
        like = f"%{search.lower()}%"
        base = base.where(func.lower(User.email).like(like))
        count_stmt = count_stmt.where(func.lower(User.email).like(like))

    total = int((await session.execute(count_stmt)).scalar_one())
    stmt = (
        base.order_by(ClientPoolAssignment.assigned_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items: list[PoolAssignmentOut] = []
    for cpa, user_id, email, plan_name, pool_name, sends_30d in (await session.execute(stmt)).all():
        items.append(
            PoolAssignmentOut(
                workspace_id=cpa.workspace_id,
                user_id=user_id,
                client_email=email,
                client_plan=plan_name,
                pool_id=cpa.pool_id,
                pool_name=pool_name,
                assigned_at=cpa.assigned_at,
                sends_last_30d=int(sends_30d or 0),
            )
        )
    return items, total


async def list_unassigned_clients(session: AsyncSession) -> list[UnassignedClient]:
    assigned_sub = select(ClientPoolAssignment.workspace_id)
    sends_sub = _workspace_sends_30d_subquery()
    # "Active clients" = users with role=client and a workspace_id.
    stmt = (
        select(User, Plan.name, func.coalesce(sends_sub.c.sends_count, 0))
        .outerjoin(Plan, Plan.id == User.plan_id)
        .outerjoin(sends_sub, sends_sub.c.workspace_id == User.workspace_id)
        .where(
            User.role == UserRole.client,
            User.workspace_id.notin_(assigned_sub),
        )
        .order_by(User.created_at.asc())
    )
    out: list[UnassignedClient] = []
    for user, plan_name, sends_30d in (await session.execute(stmt)).all():
        out.append(
            UnassignedClient(
                workspace_id=user.workspace_id,
                user_id=user.id,
                email=user.email,
                plan=plan_name,
                sends_last_30d=int(sends_30d or 0),
            )
        )
    return out


async def activate_pending_mailboxes(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor: User,
    pool_id: uuid.UUID | None = None,
) -> int:
    """Activate every ``pending`` mailbox in ``workspace_id``.

    Called when an admin assigns the workspace to a peer pool. Each pending
    mailbox transitions to ``active`` on day 1 of the ramp ladder, unpaused,
    so the next warmup_send fan-out picks it up. Writes one audit row per
    activated mailbox. Returns the number activated (0 / no-op when none).
    """
    pending = list(
        (
            await session.execute(
                select(Mailbox).where(
                    Mailbox.workspace_id == workspace_id,
                    Mailbox.warmup_status == WarmupStatus.pending,
                )
            )
        )
        .scalars()
        .all()
    )
    for mbx in pending:
        mbx.warmup_status = WarmupStatus.active
        mbx.current_day = 1
        mbx.is_paused = False
        payload: dict[str, Any] = {"workspace_id": str(workspace_id)}
        if pool_id is not None:
            payload["pool_id"] = str(pool_id)
        await _write_audit(
            session,
            action="mailbox.activated_by_pool_assignment",
            actor=actor,
            target_type="mailbox",
            target_id=mbx.id,
            payload=payload,
        )
    if pending:
        await session.flush()
    return len(pending)


async def upsert_assignment(
    session: AsyncSession,
    *,
    actor: User,
    workspace_id: uuid.UUID,
    pool_id: uuid.UUID,
) -> ClientPoolAssignment:
    await get_pool_or_404(session, pool_id)
    stmt = select(ClientPoolAssignment).where(
        ClientPoolAssignment.workspace_id == workspace_id
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        existing.pool_id = pool_id
        await session.flush()
        target = existing
    else:
        target = ClientPoolAssignment(workspace_id=workspace_id, pool_id=pool_id)
        session.add(target)
        try:
            await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Assignment conflict",
            ) from exc
    await _write_audit(
        session,
        action="pool_routing.upserted",
        actor=actor,
        target_type="client_pool_assignment",
        target_id=target.id,
        payload={"workspace_id": str(workspace_id), "pool_id": str(pool_id)},
    )
    # Assigning a workspace to a pool activates any of its pending mailboxes
    # (whether the assignment was newly created or re-saved with the same
    # pool, so admins can clear stragglers by re-saving). One transaction.
    await activate_pending_mailboxes(
        session, workspace_id=workspace_id, actor=actor, pool_id=pool_id
    )
    await session.commit()
    await session.refresh(target)
    return target


async def ensure_default_assignment(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    actor: User,
) -> ClientPoolAssignment | None:
    """Idempotently route ``workspace_id`` to the default peer pool.

    Best-effort helper (used at signup and as the auto-route fallback): if the
    workspace already has a ``ClientPoolAssignment`` we return it unchanged
    (manual/admin routing wins); otherwise we resolve the default pool and
    upsert the assignment (which activates pending mailboxes). Returns None
    when no default pool exists.
    """
    existing = (
        await session.execute(
            select(ClientPoolAssignment).where(
                ClientPoolAssignment.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    default = (
        await session.execute(
            select(PeerPool).where(PeerPool.is_default.is_(True)).limit(1)
        )
    ).scalar_one_or_none()
    if default is None:
        return None
    return await upsert_assignment(
        session, actor=actor, workspace_id=workspace_id, pool_id=default.id
    )


async def auto_route_workspace_by_plan(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    plan_name: str,
    actor: User,
) -> uuid.UUID | None:
    """Route ``workspace_id`` to the peer pool whose name matches its plan.

    Called when a client creates their first mailbox so warmup can begin
    immediately instead of waiting for an admin assignment. Respects existing
    routing: if the workspace already has a ``ClientPoolAssignment`` we return
    ``None`` and change nothing (manual/admin assignment wins); ditto for a
    falsy ``plan_name``. Plan-named pools only exist when
    ``scripts/seed_plan_pools.py`` has run — when no pool's name
    case-insensitively matches ``plan_name`` we fall back to the default pool
    (via :func:`ensure_default_assignment`) so the workspace never sits
    "unassigned" on the admin Pool Routing page. Returns the assigned pool id,
    or None if no default pool exists either.
    """
    if not plan_name or not plan_name.strip():
        return None

    existing = (
        await session.execute(
            select(ClientPoolAssignment.id).where(
                ClientPoolAssignment.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return None

    target = plan_name.strip().lower()
    pool = (
        await session.execute(
            select(PeerPool).where(func.lower(PeerPool.name) == target).limit(1)
        )
    ).scalar_one_or_none()
    if pool is None:
        # No plan-named pool — default the workspace instead of leaving it
        # unassigned until an admin routes it by hand.
        logger.info(
            "no plan-named pool for plan=%s, defaulting workspace=%s to the default pool",
            plan_name,
            workspace_id,
        )
        assignment = await ensure_default_assignment(
            session, workspace_id=workspace_id, actor=actor
        )
        return assignment.pool_id if assignment is not None else None

    await upsert_assignment(
        session, actor=actor, workspace_id=workspace_id, pool_id=pool.id
    )
    return pool.id


async def revert_assignment_to_default(
    session: AsyncSession, *, actor: User, workspace_id: uuid.UUID
) -> ClientPoolAssignment:
    default = await _default_pool(session)
    stmt = select(ClientPoolAssignment).where(
        ClientPoolAssignment.workspace_id == workspace_id
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is None:
        target = ClientPoolAssignment(workspace_id=workspace_id, pool_id=default.id)
        session.add(target)
    else:
        existing.pool_id = default.id
        target = existing
    await session.flush()
    await _write_audit(
        session,
        action="pool_routing.reverted_to_default",
        actor=actor,
        target_type="client_pool_assignment",
        target_id=target.id,
        payload={"workspace_id": str(workspace_id), "pool_id": str(default.id)},
    )
    await session.commit()
    await session.refresh(target)
    return target


# --------------------------------------------------------------------------- #
# Per-mailbox pool pin                                                         #
# --------------------------------------------------------------------------- #


async def _get_mailbox_or_404(session: AsyncSession, mailbox_id: uuid.UUID) -> Mailbox:
    mailbox = await session.get(Mailbox, mailbox_id)
    if mailbox is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found"
        )
    return mailbox


async def assign_mailbox_to_pool(
    session: AsyncSession,
    *,
    actor: User,
    mailbox_id: uuid.UUID,
    pool_id: uuid.UUID | None,
) -> Mailbox:
    """Pin (or unpin, when ``pool_id`` is None) a mailbox to a peer pool.

    The pin overrides the workspace's ``ClientPoolAssignment`` during pairing.
    Raises 404 if the mailbox (or a non-None pool) doesn't exist.
    """
    mailbox = await _get_mailbox_or_404(session, mailbox_id)
    if pool_id is not None:
        await get_pool_or_404(session, pool_id)
    mailbox.pool_id = pool_id
    await session.flush()
    await _write_audit(
        session,
        action="mailbox_pool_pin.set",
        actor=actor,
        target_type="mailbox",
        target_id=mailbox.id,
        payload={
            "mailbox_id": str(mailbox.id),
            "pool_id": str(pool_id) if pool_id is not None else None,
        },
    )
    await session.commit()
    await session.refresh(mailbox)
    return mailbox


async def list_routing_mailboxes(session: AsyncSession) -> list[dict[str, Any]]:
    """Routing projection for every mailbox (admin pool-routing table).

    ``effective_pool_id`` = mailbox pin → workspace assignment → default pool.
    Batches the workspace→pool map and per-mailbox send counts to avoid N+1.
    """
    cutoff = datetime.now(UTC) - timedelta(days=30)

    # workspace → assigned pool_id
    ws_pool_map: dict[uuid.UUID, uuid.UUID] = {
        ws: pid
        for ws, pid in (
            await session.execute(
                select(
                    ClientPoolAssignment.workspace_id, ClientPoolAssignment.pool_id
                )
            )
        ).all()
    }

    default_pool_id = (
        await session.execute(
            select(PeerPool.id).where(PeerPool.is_default.is_(True)).limit(1)
        )
    ).scalar_one_or_none()

    # per-mailbox sends in the last 30d (outbound `sent`)
    sends_map: dict[uuid.UUID, int] = {
        mid: int(cnt)
        for mid, cnt in (
            await session.execute(
                select(WarmupLog.mailbox_id, func.count(WarmupLog.id))
                .where(
                    WarmupLog.action == WarmupAction.sent,
                    WarmupLog.created_at > cutoff,
                )
                .group_by(WarmupLog.mailbox_id)
            )
        ).all()
    }

    rows = (
        await session.execute(
            select(Mailbox, Plan.name)
            .outerjoin(User, User.id == Mailbox.user_id)
            .outerjoin(Plan, Plan.id == User.plan_id)
            .order_by(Mailbox.created_at.desc())
        )
    ).all()

    out: list[dict[str, Any]] = []
    for mbx, plan_name in rows:
        effective = mbx.pool_id or ws_pool_map.get(mbx.workspace_id) or default_pool_id
        provider = (
            mbx.provider.value
            if hasattr(mbx.provider, "value")
            else str(mbx.provider)
        )
        # Can send if there's an SMTP password, OR an OAuth refresh token on a
        # provider we can mint XOAUTH2 access tokens for. Gmail only for now —
        # Outlook XOAUTH2 needs a Microsoft token endpoint we don't have yet.
        can_send = bool(mbx.smtp_password_encrypted) or (
            bool(mbx.oauth_token_encrypted) and provider == "gmail"
        )
        out.append(
            {
                "id": mbx.id,
                "email": mbx.email_address,
                "provider": provider,
                "workspace_id": mbx.workspace_id,
                "plan_name": plan_name,
                "pool_id": mbx.pool_id,
                "effective_pool_id": effective,
                "sends_last_30d": sends_map.get(mbx.id, 0),
                "can_send": can_send,
                "is_oauth": (
                    mbx.oauth_token_encrypted is not None
                    and mbx.smtp_password_encrypted is None
                ),
            }
        )
    return out


# --------------------------------------------------------------------------- #
# Workspace-facing status                                                      #
# --------------------------------------------------------------------------- #


async def get_status_for_workspace(
    session: AsyncSession, workspace_id: uuid.UUID
) -> dict[str, Any]:
    """Return the workspace's dedicated-pool status.

    When the workspace has no ``ClientPoolAssignment`` (or it points at the
    default pool — i.e. shared) we report ``is_dedicated=False``. Otherwise
    we resolve the pool, count active members, and return a per-provider
    breakdown so the UI can render "30 peers across Gmail/Outlook/Yahoo".
    """
    assignment_row = (
        await session.execute(
            select(ClientPoolAssignment).where(
                ClientPoolAssignment.workspace_id == workspace_id
            )
        )
    ).scalar_one_or_none()

    empty_mix: dict[str, int] = {"gmail": 0, "outlook": 0, "yahoo": 0, "smtp": 0}

    if assignment_row is None:
        return {
            "is_dedicated": False,
            "pool_id": None,
            "pool_name": None,
            "member_count": 0,
            "provider_mix": empty_mix,
        }

    pool = await session.get(PeerPool, assignment_row.pool_id)
    if pool is None or pool.is_default:
        # Either the pool has gone or the workspace is pinned to the shared
        # default — neither counts as a "dedicated" pool for the client UX.
        return {
            "is_dedicated": False,
            "pool_id": None,
            "pool_name": None,
            "member_count": 0,
            "provider_mix": empty_mix,
        }

    # Count active members per provider in one query.
    rows = (
        await session.execute(
            select(PeerInbox.provider, func.count(PeerInbox.id))
            .join(PeerPoolMember, PeerPoolMember.peer_inbox_id == PeerInbox.id)
            .where(
                PeerPoolMember.pool_id == pool.id,
                PeerInbox.is_active.is_(True),
            )
            .group_by(PeerInbox.provider)
        )
    ).all()

    mix = dict(empty_mix)
    # PeerProvider values are google_ws / office365 / yahoo — map them to the
    # plan-tier-style slugs the frontend already speaks.
    provider_slug = {
        "google_ws": "gmail",
        "office365": "outlook",
        "yahoo": "yahoo",
    }
    total = 0
    for provider, count in rows:
        key = provider.value if hasattr(provider, "value") else str(provider)
        slug = provider_slug.get(key, key)
        mix[slug] = int(count)
        total += int(count)

    return {
        "is_dedicated": True,
        "pool_id": str(pool.id),
        "pool_name": pool.name,
        "member_count": total,
        "provider_mix": mix,
    }


# --------------------------------------------------------------------------- #
# Sankey                                                                       #
# --------------------------------------------------------------------------- #


async def sankey_data(session: AsyncSession) -> SankeyData:
    pool_rows = list((await session.execute(select(PeerPool))).scalars().all())
    stmt = (
        select(ClientPoolAssignment.workspace_id, ClientPoolAssignment.pool_id, User.email)
        .join(User, User.workspace_id == ClientPoolAssignment.workspace_id)
    )
    assignment_rows = (await session.execute(stmt)).all()

    nodes: list[SankeyNode] = []
    used_pool_ids: set[uuid.UUID] = {pid for _, pid, _ in assignment_rows}

    # Include all pools (even empty) so the viz shows them; callers can
    # filter client-side.
    for p in pool_rows:
        nodes.append(SankeyNode(id=f"pool:{p.id}", name=p.name, type="pool"))

    seen_clients: set[uuid.UUID] = set()
    links: list[SankeyLink] = []
    for workspace_id, pool_id, email in assignment_rows:
        if workspace_id not in seen_clients:
            nodes.append(
                SankeyNode(id=f"client:{workspace_id}", name=email, type="client")
            )
            seen_clients.add(workspace_id)
        links.append(
            SankeyLink(
                source=f"pool:{pool_id}",
                target=f"client:{workspace_id}",
                value=1,
            )
        )

    # Silence unused-var warning (used_pool_ids kept intentionally for future filtering).
    _ = used_pool_ids
    return SankeyData(nodes=nodes, links=links)
