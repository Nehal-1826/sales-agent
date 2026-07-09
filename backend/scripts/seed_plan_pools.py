"""Idempotent seed: one peer pool per plan, capped + populated + routed.

Run inside the api container after migrations are applied:

    docker compose exec api python -m scripts.seed_plan_pools

What it does (safe to re-run):
1. Ensure a peer pool named exactly after each plan exists, with
   ``daily_send_limit`` set to that plan's ``daily_email_cap``.
2. Add every active peer inbox (helper) as a member of each plan pool so warmup
   pairing has helpers to work with.
3. Route each existing workspace to its plan's pool (upsert by workspace_id).
4. Reactivate any mailbox still left ``pending`` from the earlier manual gate.

The pre-existing ``default`` and ``Shailog`` pools are left untouched.
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db.models.client_pool_assignments import ClientPoolAssignment
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.peer_pools import PeerPool, PeerPoolMember
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.session import SessionLocal

# Plan name -> daily send cap. Caps mirror plans.daily_email_cap.
PLAN_CAPS: dict[str, int] = {
    "Starter": 50,
    "Pro": 100,
    "Pro Plus": 75,
    "Agency": 200,
}


async def main() -> None:
    async with SessionLocal() as db:
        # 1) Pools + caps -------------------------------------------------
        pools: dict[str, PeerPool] = {}
        for name, cap in PLAN_CAPS.items():
            pool = (
                await db.execute(select(PeerPool).where(PeerPool.name == name))
            ).scalar_one_or_none()
            if pool is None:
                pool = PeerPool(
                    name=name,
                    description=f"{name} plan pool",
                    is_default=False,
                    daily_send_limit=cap,
                )
                db.add(pool)
                await db.flush()
                print(f"created pool {name!r} (cap {cap})")
            else:
                if pool.daily_send_limit != cap:
                    pool.daily_send_limit = cap
                    print(f"updated pool {name!r} cap -> {cap}")
            pools[name] = pool

        # 2) Helper membership (all active peers in every plan pool) ------
        peer_ids = (
            await db.execute(select(PeerInbox.id).where(PeerInbox.is_active.is_(True)))
        ).scalars().all()
        for name, pool in pools.items():
            existing = set(
                (
                    await db.execute(
                        select(PeerPoolMember.peer_inbox_id).where(
                            PeerPoolMember.pool_id == pool.id
                        )
                    )
                ).scalars().all()
            )
            added = 0
            for pid in peer_ids:
                if pid not in existing:
                    db.add(PeerPoolMember(peer_inbox_id=pid, pool_id=pool.id))
                    added += 1
            if added:
                print(f"pool {name!r}: added {added} helper(s)")

        # 3) Route workspaces to their plan pool -------------------------
        rows = (
            await db.execute(
                select(User.workspace_id, Plan.name).join(Plan, Plan.id == User.plan_id)
            )
        ).all()
        seen: set = set()
        for workspace_id, plan_name in rows:
            if workspace_id in seen or plan_name not in pools:
                continue
            seen.add(workspace_id)
            pool = pools[plan_name]
            assignment = (
                await db.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            ).scalar_one_or_none()
            if assignment is None:
                db.add(
                    ClientPoolAssignment(workspace_id=workspace_id, pool_id=pool.id)
                )
                print(f"routed workspace {workspace_id} -> {plan_name!r}")
            elif assignment.pool_id != pool.id:
                assignment.pool_id = pool.id
                print(f"re-routed workspace {workspace_id} -> {plan_name!r}")

        # 4) Clear any leftover pending mailbox --------------------------
        pending = (
            await db.execute(
                select(Mailbox).where(Mailbox.warmup_status == WarmupStatus.pending)
            )
        ).scalars().all()
        for mb in pending:
            mb.warmup_status = WarmupStatus.active
            if mb.current_day == 0:
                mb.current_day = 1
            print(f"activated pending mailbox {mb.email_address}")

        await db.commit()
    print("seed_plan_pools: done")


if __name__ == "__main__":
    asyncio.run(main())
