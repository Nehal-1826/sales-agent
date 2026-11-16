"""Diagnose (and optionally purge) peer-network contamination.

Contamination = a row in ``peer_inboxes`` whose email_address also belongs
to a client mailbox (``mailboxes.email_address``) or a login account
(``users.email``). Contaminated peers make the warmup engine treat client
accounts as helper inboxes, so clients receive warmup mail FROM each other.

Modes:
    python -m scripts.peer_contamination            # report only (default)
    python -m scripts.peer_contamination --purge    # deactivate + un-pool

Purge is deliberately reversible: the peer row is NEVER deleted — it is
deactivated (``is_active=False``) and its ``peer_pool_members`` rows are
removed, so re-admitting a peer later is a one-line manual op. The commit
happens once at the end (single transaction).

Run inside the api container (same as seed_plan_pools):
    docker compose exec api python -m scripts.peer_contamination
"""
from __future__ import annotations

import argparse
import asyncio
import uuid

from sqlalchemy import delete, func, select

from app.db.models.crm_leads import CrmLead
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.peer_pools import PeerPool, PeerPoolMember
from app.db.models.users import User
from app.db.session import SessionLocal


async def _contamination_rows(db: object) -> list[tuple[PeerInbox, str | None]]:
    """[(peer, owner_email)] for every peer overlapping the client network.

    ``owner_email`` is the matched client's identity: the login account's own
    email for users.email matches, or the first user email of the matching
    client mailbox's workspace. Deduped by peer id (a peer may match both).
    """
    first_user_by_ws: dict[uuid.UUID, str] = {}
    for ws_id, email in (
        await db.execute(  # type: ignore[attr-defined]
            select(User.workspace_id, User.email).order_by(User.created_at)
        )
    ).all():
        first_user_by_ws.setdefault(ws_id, email)

    seen: dict[uuid.UUID, tuple[PeerInbox, str | None]] = {}

    mb_rows = (
        await db.execute(  # type: ignore[attr-defined]
            select(PeerInbox, Mailbox.workspace_id).join(
                Mailbox,
                func.lower(Mailbox.email_address)
                == func.lower(PeerInbox.email_address),
            )
        )
    ).all()
    for peer, ws_id in mb_rows:
        seen.setdefault(peer.id, (peer, first_user_by_ws.get(ws_id)))

    user_rows = (
        await db.execute(  # type: ignore[attr-defined]
            select(PeerInbox, User.email).join(
                User, func.lower(User.email) == func.lower(PeerInbox.email_address)
            )
        )
    ).all()
    for peer, email in user_rows:
        if peer.id not in seen:
            seen[peer.id] = (peer, email)

    return list(seen.values())


async def _report(db: object) -> list[tuple[PeerInbox, str | None]]:
    rows = await _contamination_rows(db)

    if not rows:
        print("peer_contamination: no contaminated peers found")
    else:
        memberships: dict[uuid.UUID, list[str]] = {}
        member_rows = (
            await db.execute(  # type: ignore[attr-defined]
                select(PeerPoolMember.peer_inbox_id, PeerPool.name)
                .join(PeerPool, PeerPool.id == PeerPoolMember.pool_id)
                .where(PeerPoolMember.peer_inbox_id.in_([p.id for p, _ in rows]))
            )
        ).all()
        for peer_id, pool_name in member_rows:
            memberships.setdefault(peer_id, []).append(pool_name)

        header = (
            f"{'peer email':34} {'active':6} {'seed':5} "
            f"{'pools':26} {'client owner':32} created_at"
        )
        print(f"contaminated peers ({len(rows)}):")
        print(header)
        print("-" * len(header))
        for peer, owner in sorted(rows, key=lambda r: r[0].email_address):
            pools = ",".join(memberships.get(peer.id, [])) or "-"
            print(
                f"{peer.email_address:34} {str(peer.is_active):6} "
                f"{str(peer.is_seed):5} {pools:26} "
                f"{(owner or '?'):32} {peer.created_at}"
            )

    # Cross-tenant CRM leak (report only): leads whose email is a DIFFERENT
    # workspace's mailbox — the auto-import exclusion prevents new ones.
    cross_ws_leads = int(
        (
            await db.execute(  # type: ignore[attr-defined]
                select(func.count(CrmLead.id))
                .join(
                    Mailbox,
                    func.lower(Mailbox.email_address) == func.lower(CrmLead.email),
                )
                .where(CrmLead.workspace_id != Mailbox.workspace_id)
            )
        ).scalar_one()
    )
    print(
        f"CRM leads whose email matches a different workspace's mailbox: "
        f"{cross_ws_leads} (report only)"
    )
    return rows


async def _purge(db: object) -> None:
    rows = await _contamination_rows(db)
    deactivated = 0
    removed = 0
    for peer, _owner in rows:
        peer.is_active = False
        deactivated += 1
        result = await db.execute(  # type: ignore[attr-defined]
            delete(PeerPoolMember).where(PeerPoolMember.peer_inbox_id == peer.id)
        )
        n = int(result.rowcount or 0)
        removed += n
        print(
            f"deactivated peer {peer.email_address} "
            f"(removed {n} pool membership(s))"
        )
    await db.commit()  # type: ignore[attr-defined]
    print(f"deactivated {deactivated} peers, removed {removed} pool memberships")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Diagnose + purge client-email contamination in the peer network."
    )
    parser.add_argument(
        "--purge",
        action="store_true",
        help=(
            "Deactivate contaminated peers and remove their pool memberships. "
            "Reversible — the peer row itself is kept."
        ),
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()
    async with SessionLocal() as db:
        await _report(db)
        if args.purge:
            await _purge(db)


if __name__ == "__main__":
    asyncio.run(main())
