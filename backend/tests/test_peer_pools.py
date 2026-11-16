"""Tests for admin peer-pool CRUD + pool routing (spec §5.2 #4, §7).

Shares the fixture style with ``test_peer_inboxes`` — an in-memory
SQLite with ``StaticPool`` and only the tables this feature touches.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# Harness                                                                     #
# --------------------------------------------------------------------------- #


def _dedupe_metadata_indexes(base: object) -> None:
    seen: set[str] = set()
    for table in base.metadata.tables.values():
        to_remove = []
        for idx in list(table.indexes):
            if idx.name in seen:
                to_remove.append(idx)
            else:
                seen.add(idx.name)
        for idx in to_remove:
            table.indexes.discard(idx)


async def _setup_db() -> tuple[async_sessionmaker[AsyncSession], object]:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.peer_pools import PeerPool, PeerPoolMember
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.warmup_logs import WarmupLog
    from app.db.models.workspace_settings import WorkspaceSetting

    _dedupe_metadata_indexes(Base)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [
        t.__table__
        for t in (
            User,
            Plan,
            Mailbox,
            PeerInbox,
            PeerPool,
            PeerPoolMember,
            ClientPoolAssignment,
            AuditLog,
            WarmupLog,
            # Signup (tested here for default-pool routing) reads the
            # workspace's settings row when building the user response.
            WorkspaceSetting,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest_asyncio.fixture
async def app_and_maker() -> (
    AsyncIterator[tuple[object, async_sessionmaker[AsyncSession], object]]
):
    maker, engine = await _setup_db()
    from app.db.session import get_db
    from app.main import create_app

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    try:
        yield app, maker, engine
    finally:
        await engine.dispose()


# --------------------------------------------------------------------------- #
# Factories                                                                   #
# --------------------------------------------------------------------------- #


async def _seed_default_pool(maker: async_sessionmaker[AsyncSession]) -> uuid.UUID:
    from app.db.models.peer_pools import PeerPool

    async with maker() as session:
        pool = PeerPool(name="default", description="seed", is_default=True)
        session.add(pool)
        await session.commit()
        await session.refresh(pool)
        return pool.id


async def _make_admin(maker: async_sessionmaker[AsyncSession]) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.super_admin,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _make_client(
    maker: async_sessionmaker[AsyncSession], *, email: str | None = None
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email or f"c-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


async def _seed_peer(
    maker: async_sessionmaker[AsyncSession], *, email: str
) -> uuid.UUID:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider

    async with maker() as session:
        peer = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=b"x",
            imap_creds_encrypted=b"x",
            reputation_score=0.0,
            daily_capacity=50,
            used_today=0,
            is_active=True,
        )
        session.add(peer)
        await session.commit()
        await session.refresh(peer)
        return peer.id


async def _seed_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    workspace_id: uuid.UUID,
    status: object,
    current_day: int = 0,
    is_paused: bool = False,
) -> uuid.UUID:
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider

    async with maker() as session:
        mbx = Mailbox(
            user_id=uuid.uuid4(),
            workspace_id=workspace_id,
            email_address=f"mbx-{uuid.uuid4().hex[:8]}@example.com",
            provider=MailboxProvider.smtp,
            warmup_status=status,
            daily_target=50,
            current_day=current_day,
            warmth_score=0.0,
            content_mode=ContentMode.A,
            is_paused=is_paused,
        )
        session.add(mbx)
        await session.commit()
        await session.refresh(mbx)
        return mbx.id


def _auth_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Pool create / default invariant                                             #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_peer_pool_enforces_single_default(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.peer_pools import PeerPool

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # Create a second "default" pool -> demotes the first.
        resp = await c.post(
            "/api/admin/peer-pools",
            json={"name": "new-default", "is_default": True},
            headers=_auth_for(admin),
        )
    assert resp.status_code == 201, resp.text

    async with maker() as session:
        defaults = list(
            (
                await session.execute(
                    select(PeerPool).where(PeerPool.is_default.is_(True))
                )
            )
            .scalars()
            .all()
        )
        assert len(defaults) == 1
        assert defaults[0].name == "new-default"


# --------------------------------------------------------------------------- #
# Delete guards                                                               #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pool_delete_blocked_if_default(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.delete(
            f"/api/admin/peer-pools/{default_id}", headers=_auth_for(admin)
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_pool_delete_blocked_if_assignments_exist(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.peer_pools import PeerPool

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    # Create a secondary pool + assign a workspace to it.
    async with maker() as session:
        pool = PeerPool(name="secondary", is_default=False)
        session.add(pool)
        await session.commit()
        await session.refresh(pool)
        workspace_id = uuid.uuid4()
        session.add(ClientPoolAssignment(workspace_id=workspace_id, pool_id=pool.id))
        await session.commit()
        secondary_id = pool.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.delete(
            f"/api/admin/peer-pools/{secondary_id}", headers=_auth_for(admin)
        )
    assert resp.status_code == 409


# --------------------------------------------------------------------------- #
# Membership idempotency                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pool_add_members_idempotent(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.peer_pools import PeerPool

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    # Create a secondary pool.
    async with maker() as session:
        pool = PeerPool(name="secondary")
        session.add(pool)
        await session.commit()
        await session.refresh(pool)
        secondary_id = pool.id

    peer_id = await _seed_peer(maker, email="p1@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        first = await c.post(
            f"/api/admin/peer-pools/{secondary_id}/members",
            json={"peer_inbox_ids": [str(peer_id)]},
            headers=_auth_for(admin),
        )
        assert first.status_code == 200, first.text
        assert first.json() == {"added": 1, "already_member": 0}

        second = await c.post(
            f"/api/admin/peer-pools/{secondary_id}/members",
            json={"peer_inbox_ids": [str(peer_id)]},
            headers=_auth_for(admin),
        )
    assert second.status_code == 200, second.text
    assert second.json() == {"added": 0, "already_member": 1}


# --------------------------------------------------------------------------- #
# Pool routing upsert                                                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pool_routing_upsert_replaces_existing(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from sqlalchemy import func

    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.peer_pools import PeerPool

    app, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    client = await _make_client(maker)
    workspace_id = client.workspace_id

    # Create a secondary pool.
    async with maker() as session:
        pool = PeerPool(name="pool-b")
        session.add(pool)
        await session.commit()
        await session.refresh(pool)
        secondary_id = pool.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # First assignment → default pool.
        r1 = await c.post(
            "/api/admin/pool-routing",
            json={"workspace_id": str(workspace_id), "pool_id": str(default_id)},
            headers=_auth_for(admin),
        )
        assert r1.status_code == 200, r1.text
        # Reassign same workspace → secondary pool.
        r2 = await c.post(
            "/api/admin/pool-routing",
            json={"workspace_id": str(workspace_id), "pool_id": str(secondary_id)},
            headers=_auth_for(admin),
        )
    assert r2.status_code == 200, r2.text

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == secondary_id
        # Total count sanity-check.
        total = int(
            (
                await session.execute(select(func.count(ClientPoolAssignment.id)))
            ).scalar_one()
        )
        assert total == 1


# --------------------------------------------------------------------------- #
# Sankey                                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_sankey_data_shape(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    import re

    app, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    client = await _make_client(maker, email="sankey-client@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        await c.post(
            "/api/admin/pool-routing",
            json={
                "workspace_id": str(client.workspace_id),
                "pool_id": str(default_id),
            },
            headers=_auth_for(admin),
        )
        resp = await c.get(
            "/api/admin/pool-routing/sankey-data", headers=_auth_for(admin)
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "nodes" in data and "links" in data

    uuid_re = re.compile(r"^[0-9a-f\-]{36}$")

    pool_nodes = [n for n in data["nodes"] if n["type"] == "pool"]
    client_nodes = [n for n in data["nodes"] if n["type"] == "client"]
    assert any(n["id"] == f"pool:{default_id}" for n in pool_nodes)
    assert any(n["id"] == f"client:{client.workspace_id}" for n in client_nodes)

    for n in data["nodes"]:
        prefix, _, tail = n["id"].partition(":")
        assert prefix in {"pool", "client"}
        assert uuid_re.match(tail)

    assert len(data["links"]) == 1
    link = data["links"][0]
    assert link["source"] == f"pool:{default_id}"
    assert link["target"] == f"client:{client.workspace_id}"
    assert link["value"] == 1


# --------------------------------------------------------------------------- #
# Pending-mailbox activation on pool assignment                                #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_upsert_assignment_activates_pending_mailboxes(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.mailboxes import Mailbox, WarmupStatus
    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    client = await _make_client(maker)
    workspace_id = client.workspace_id

    pending_id = await _seed_mailbox(
        maker, workspace_id=workspace_id, status=WarmupStatus.pending, current_day=0
    )
    paused_id = await _seed_mailbox(
        maker,
        workspace_id=workspace_id,
        status=WarmupStatus.paused,
        current_day=10,
        is_paused=True,
    )
    completed_id = await _seed_mailbox(
        maker, workspace_id=workspace_id, status=WarmupStatus.completed, current_day=30
    )
    active_id = await _seed_mailbox(
        maker, workspace_id=workspace_id, status=WarmupStatus.active, current_day=5
    )

    async with maker() as session:
        await peer_pool_service.upsert_assignment(
            session, actor=admin, workspace_id=workspace_id, pool_id=default_id
        )

    async with maker() as session:
        rows = {
            m.id: m
            for m in (
                await session.execute(
                    select(Mailbox).where(Mailbox.workspace_id == workspace_id)
                )
            )
            .scalars()
            .all()
        }
    # Pending → active, current_day bumped to 1, unpaused.
    assert rows[pending_id].warmup_status == WarmupStatus.active
    assert rows[pending_id].current_day == 1
    assert rows[pending_id].is_paused is False
    # Non-pending mailboxes untouched.
    assert rows[paused_id].warmup_status == WarmupStatus.paused
    assert rows[paused_id].current_day == 10
    assert rows[paused_id].is_paused is True
    assert rows[completed_id].warmup_status == WarmupStatus.completed
    assert rows[completed_id].current_day == 30
    assert rows[active_id].warmup_status == WarmupStatus.active
    assert rows[active_id].current_day == 5


# --------------------------------------------------------------------------- #
# Per-pool daily send limit                                                    #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_pool_with_daily_send_limit(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.schemas.peer_pools import PoolCreate, PoolUpdate
    from app.services import peer_pool_service

    _, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    async with maker() as session:
        pool = await peer_pool_service.create_pool(
            session,
            actor=admin,
            payload=PoolCreate(name="limited", daily_send_limit=100),
        )
        out = await peer_pool_service.pool_to_out(session, pool)
        assert out.daily_send_limit == 100
        pool_id = pool.id

    # update_pool can change the limit.
    async with maker() as session:
        updated = await peer_pool_service.update_pool(
            session,
            actor=admin,
            pool_id=pool_id,
            payload=PoolUpdate(daily_send_limit=250),
        )
        out2 = await peer_pool_service.pool_to_out(session, updated)
        assert out2.daily_send_limit == 250


# --------------------------------------------------------------------------- #
# Auto-route workspace by plan                                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_auto_route_workspace_by_plan(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.peer_pools import PeerPool
    from app.services import peer_pool_service

    _, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    workspace_id = uuid.uuid4()

    # Seed two pools, one named like a plan.
    async with maker() as session:
        pro = PeerPool(name="Pro")
        starter = PeerPool(name="Starter")
        session.add_all([pro, starter])
        await session.commit()
        await session.refresh(pro)
        pro_id = pro.id

    # Auto-route to the "Pro" pool (case-insensitive).
    async with maker() as session:
        result = await peer_pool_service.auto_route_workspace_by_plan(
            session, workspace_id=workspace_id, plan_name="pro", actor=admin
        )
        assert result == pro_id

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == pro_id

    # Already assigned to a NON-default pool → returns None, doesn't change
    # (manual/admin routing wins over plan routing).
    async with maker() as session:
        again = await peer_pool_service.auto_route_workspace_by_plan(
            session, workspace_id=workspace_id, plan_name="Starter", actor=admin
        )
        assert again is None

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == pro_id

    # Unknown plan for a fresh workspace → falls back to the DEFAULT pool
    # (plan-named pools only exist if seed_plan_pools ran; without the
    # fallback the workspace would sit "unassigned" forever).
    fresh_ws = uuid.uuid4()
    async with maker() as session:
        unknown = await peer_pool_service.auto_route_workspace_by_plan(
            session, workspace_id=fresh_ws, plan_name="Nonexistent", actor=admin
        )
        assert unknown == default_id

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == fresh_ws
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == default_id

    # Falsy plan name → None.
    async with maker() as session:
        falsy = await peer_pool_service.auto_route_workspace_by_plan(
            session, workspace_id=uuid.uuid4(), plan_name="", actor=admin
        )
        assert falsy is None


async def test_auto_route_repoints_default_assignment_to_plan_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """The automated signup default assignment must not pre-empt plan routing.

    Signup creates a ClientPoolAssignment at the default pool
    (``ensure_default_assignment``). When the workspace's plan later maps to
    a plan-named pool (first mailbox creation), that default assignment is
    re-pointed to the plan pool.
    """
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.peer_pools import PeerPool
    from app.services import peer_pool_service

    _, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    workspace_id = uuid.uuid4()

    # A plan-named pool exists.
    async with maker() as session:
        pro = PeerPool(name="Pro")
        session.add(pro)
        await session.commit()
        await session.refresh(pro)
        pro_id = pro.id

    # Signup-time default assignment already in place.
    async with maker() as session:
        session.add(
            ClientPoolAssignment(workspace_id=workspace_id, pool_id=default_id)
        )
        await session.commit()

    async with maker() as session:
        result = await peer_pool_service.auto_route_workspace_by_plan(
            session, workspace_id=workspace_id, plan_name="pro", actor=admin
        )
    assert result == pro_id

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == pro_id


async def test_auto_route_keeps_default_assignment_when_no_plan_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Default assignment + no plan-named pool → stays default, no error."""
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.services import peer_pool_service

    _, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    workspace_id = uuid.uuid4()

    async with maker() as session:
        session.add(
            ClientPoolAssignment(workspace_id=workspace_id, pool_id=default_id)
        )
        await session.commit()

    async with maker() as session:
        result = await peer_pool_service.auto_route_workspace_by_plan(
            session, workspace_id=workspace_id, plan_name="Nonexistent", actor=admin
        )
    assert result is None

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == default_id


@pytest.mark.asyncio
async def test_activate_pending_mailboxes_no_op_when_none(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    workspace_id = uuid.uuid4()

    async with maker() as session:
        count = await peer_pool_service.activate_pending_mailboxes(
            session, workspace_id=workspace_id, actor=admin
        )
        await session.commit()
    assert count == 0


# --------------------------------------------------------------------------- #
# Per-mailbox pool pin                                                         #
# --------------------------------------------------------------------------- #


async def _seed_pool_named(
    maker: async_sessionmaker[AsyncSession], *, name: str, is_default: bool = False
) -> uuid.UUID:
    from app.db.models.peer_pools import PeerPool

    async with maker() as session:
        pool = PeerPool(name=name, is_default=is_default)
        session.add(pool)
        await session.commit()
        await session.refresh(pool)
        return pool.id


async def _seed_peer_in_pool(
    maker: async_sessionmaker[AsyncSession], *, pool_id: uuid.UUID, email: str
) -> uuid.UUID:
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.peer_pools import PeerPoolMember

    async with maker() as session:
        peer = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=b"x",
            imap_creds_encrypted=b"x",
            reputation_score=0.8,
            daily_capacity=50,
            used_today=0,
            is_active=True,
        )
        session.add(peer)
        await session.flush()
        session.add(PeerPoolMember(peer_inbox_id=peer.id, pool_id=pool_id))
        await session.commit()
        await session.refresh(peer)
        return peer.id


@pytest.mark.asyncio
async def test_pick_peer_inbox_mailbox_pin_overrides_workspace_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A mailbox pinned to PoolA picks from PoolA even when its workspace is
    assigned to PoolB. With no pin it falls back to the workspace pool."""
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.mailboxes import Mailbox, WarmupStatus
    from app.services.warmup.pairing import pick_peer_inbox

    app, maker, _ = app_and_maker
    pool_a = await _seed_pool_named(maker, name="pool-a")
    pool_b = await _seed_pool_named(maker, name="pool-b")
    await _seed_pool_named(maker, name="default", is_default=True)

    peer_a = await _seed_peer_in_pool(maker, pool_id=pool_a, email="a@warmpulse.io")
    peer_b = await _seed_peer_in_pool(maker, pool_id=pool_b, email="b@warmpulse.io")

    workspace_id = uuid.uuid4()
    mbx_id = await _seed_mailbox(
        maker, workspace_id=workspace_id, status=WarmupStatus.active, current_day=5
    )
    # Workspace assigned to PoolB.
    async with maker() as session:
        session.add(ClientPoolAssignment(workspace_id=workspace_id, pool_id=pool_b))
        await session.commit()

    # With no mailbox pin → workspace pool (B).
    async with maker() as session:
        picks: set[uuid.UUID] = set()
        for _ in range(20):
            picked = await pick_peer_inbox(mbx_id, session)
            assert picked is not None
            picks.add(picked.id)
        assert picks == {peer_b}

    # Pin the mailbox to PoolA.
    async with maker() as session:
        mbx = await session.get(Mailbox, mbx_id)
        mbx.pool_id = pool_a
        await session.commit()

    async with maker() as session:
        picks = set()
        for _ in range(20):
            picked = await pick_peer_inbox(mbx_id, session)
            assert picked is not None
            picks.add(picked.id)
        assert picks == {peer_a}, f"pin must win: {picks}"
        assert peer_b not in picks


@pytest.mark.asyncio
async def test_assign_mailbox_to_pool_sets_clears_and_audits(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import WarmupStatus
    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    pool_id = await _seed_pool_named(maker, name="pinned")
    workspace_id = uuid.uuid4()
    mbx_id = await _seed_mailbox(
        maker, workspace_id=workspace_id, status=WarmupStatus.active
    )

    # Set the pin.
    async with maker() as session:
        mbx = await peer_pool_service.assign_mailbox_to_pool(
            session, actor=admin, mailbox_id=mbx_id, pool_id=pool_id
        )
        assert mbx.pool_id == pool_id

    # Clear the pin.
    async with maker() as session:
        mbx = await peer_pool_service.assign_mailbox_to_pool(
            session, actor=admin, mailbox_id=mbx_id, pool_id=None
        )
        assert mbx.pool_id is None

    # Two audit rows written.
    async with maker() as session:
        rows = (
            await session.execute(
                select(AuditLog).where(AuditLog.action == "mailbox_pool_pin.set")
            )
        ).scalars().all()
        assert len(rows) == 2


@pytest.mark.asyncio
async def test_assign_mailbox_to_pool_nonexistent_pool_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from fastapi import HTTPException

    from app.db.models.mailboxes import WarmupStatus
    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    mbx_id = await _seed_mailbox(
        maker, workspace_id=uuid.uuid4(), status=WarmupStatus.active
    )

    async with maker() as session:
        with pytest.raises(HTTPException) as exc:
            await peer_pool_service.assign_mailbox_to_pool(
                session, actor=admin, mailbox_id=mbx_id, pool_id=uuid.uuid4()
            )
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_assign_mailbox_to_pool_nonexistent_mailbox_404(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from fastapi import HTTPException

    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    async with maker() as session:
        with pytest.raises(HTTPException) as exc:
            await peer_pool_service.assign_mailbox_to_pool(
                session, actor=admin, mailbox_id=uuid.uuid4(), pool_id=None
            )
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_list_routing_mailboxes_effective_pool_and_flags(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    default_id = await _seed_pool_named(maker, name="default", is_default=True)
    ws_pool = await _seed_pool_named(maker, name="ws-pool")
    pin_pool = await _seed_pool_named(maker, name="pin-pool")

    ws_pinned = uuid.uuid4()    # workspace assigned to ws_pool, mailbox pinned to pin_pool
    ws_assigned = uuid.uuid4()  # workspace assigned, no mailbox pin
    ws_bare = uuid.uuid4()      # no assignment, no pin → default

    async with maker() as session:
        session.add_all(
            [
                ClientPoolAssignment(workspace_id=ws_pinned, pool_id=ws_pool),
                ClientPoolAssignment(workspace_id=ws_assigned, pool_id=ws_pool),
            ]
        )
        # SMTP mailbox (can_send) pinned to pin_pool.
        m_smtp = Mailbox(
            user_id=uuid.uuid4(),
            workspace_id=ws_pinned,
            email_address="smtp@example.com",
            provider=MailboxProvider.smtp,
            smtp_password_encrypted=b"secret",
            warmup_status=WarmupStatus.active,
            daily_target=50,
            content_mode=ContentMode.A,
            pool_id=pin_pool,
        )
        # OAuth-only gmail mailbox: can_send via XOAUTH2, workspace assignment only.
        m_oauth = Mailbox(
            user_id=uuid.uuid4(),
            workspace_id=ws_assigned,
            email_address="oauth@example.com",
            provider=MailboxProvider.gmail,
            oauth_token_encrypted=b"token",
            warmup_status=WarmupStatus.active,
            daily_target=50,
            content_mode=ContentMode.A,
        )
        # Bare mailbox, no assignment, no pin → default pool.
        m_bare = Mailbox(
            user_id=uuid.uuid4(),
            workspace_id=ws_bare,
            email_address="bare@example.com",
            provider=MailboxProvider.smtp,
            smtp_password_encrypted=b"secret",
            warmup_status=WarmupStatus.active,
            daily_target=50,
            content_mode=ContentMode.A,
        )
        session.add_all([m_smtp, m_oauth, m_bare])
        await session.commit()

    async with maker() as session:
        rows = await peer_pool_service.list_routing_mailboxes(session)

    by_email = {r["email"]: r for r in rows}
    assert by_email["smtp@example.com"]["effective_pool_id"] == pin_pool
    assert by_email["smtp@example.com"]["pool_id"] == pin_pool
    assert by_email["smtp@example.com"]["can_send"] is True
    assert by_email["smtp@example.com"]["is_oauth"] is False

    assert by_email["oauth@example.com"]["effective_pool_id"] == ws_pool
    assert by_email["oauth@example.com"]["pool_id"] is None
    assert by_email["oauth@example.com"]["can_send"] is True
    assert by_email["oauth@example.com"]["is_oauth"] is True

    assert by_email["bare@example.com"]["effective_pool_id"] == default_id


@pytest.mark.asyncio
async def test_routing_mailboxes_api_list_and_pin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.mailboxes import WarmupStatus
    from app.services import peer_pool_service

    app, maker, _ = app_and_maker
    admin = await _make_admin(maker)
    pin_pool = await _seed_pool_named(maker, name="pin-pool")
    workspace_id = uuid.uuid4()
    mbx_id = await _seed_mailbox(
        maker, workspace_id=workspace_id, status=WarmupStatus.active
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t") as c:
        r = await c.get("/api/admin/pool-routing/mailboxes", headers=_auth_for(admin))
        assert r.status_code == 200, r.text
        body = r.json()
        assert any(m["id"] == str(mbx_id) for m in body["items"])

        # Pin the mailbox.
        r = await c.post(
            f"/api/admin/pool-routing/mailboxes/{mbx_id}",
            headers=_auth_for(admin),
            json={"pool_id": str(pin_pool)},
        )
        assert r.status_code == 200, r.text
        assert r.json()["pool_id"] == str(pin_pool)

    async with maker() as session:
        rows = await peer_pool_service.list_routing_mailboxes(session)
    assert next(m for m in rows if m["id"] == mbx_id)["pool_id"] == pin_pool


# --------------------------------------------------------------------------- #
# Default-pool demotion guard                                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_update_pool_cannot_demote_only_default(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from fastapi import HTTPException

    from app.db.models.peer_pools import PeerPool
    from app.schemas.peer_pools import PoolUpdate
    from app.services import peer_pool_service

    _, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    async with maker() as session:
        with pytest.raises(HTTPException) as exc:
            await peer_pool_service.update_pool(
                session,
                actor=admin,
                pool_id=default_id,
                payload=PoolUpdate(is_default=False),
            )
        assert exc.value.status_code == 409
        assert "default pool" in exc.value.detail.lower()

    # Still the default — nothing was applied.
    async with maker() as session:
        pool = await session.get(PeerPool, default_id)
        assert pool is not None and pool.is_default is True


@pytest.mark.asyncio
async def test_update_pool_demote_allowed_when_second_default_exists(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.peer_pools import PeerPool
    from app.schemas.peer_pools import PoolUpdate
    from app.services import peer_pool_service

    _, maker, _ = app_and_maker
    admin = await _make_admin(maker)

    # Seed two defaults directly (the service normally keeps a single
    # default; the guard just has to allow demotion when >1 exist).
    async with maker() as session:
        pool_a = PeerPool(name="def-a", is_default=True)
        pool_b = PeerPool(name="def-b", is_default=True)
        session.add_all([pool_a, pool_b])
        await session.commit()
        await session.refresh(pool_a)
        id_a = pool_a.id

    async with maker() as session:
        updated = await peer_pool_service.update_pool(
            session,
            actor=admin,
            pool_id=id_a,
            payload=PoolUpdate(is_default=False),
        )
        assert updated.is_default is False

    async with maker() as session:
        remaining = list(
            (
                await session.execute(
                    select(PeerPool).where(PeerPool.is_default.is_(True))
                )
            )
            .scalars()
            .all()
        )
        assert len(remaining) == 1
        assert remaining[0].name == "def-b"


# --------------------------------------------------------------------------- #
# Signup routes workspace to the default pool                                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_signup_assigns_workspace_to_default_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.services import auth_service

    _, maker, _ = app_and_maker
    default_id = await _seed_default_pool(maker)

    async with maker() as session:
        resp = await auth_service.signup_user(
            session, email="fresh-client@example.com", password="warm-Pulse-123!"
        )
        assert resp.user.email == "fresh-client@example.com"
        workspace_id = resp.user.workspace_id

    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(ClientPoolAssignment).where(
                        ClientPoolAssignment.workspace_id == workspace_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].pool_id == default_id


@pytest.mark.asyncio
async def test_signup_survives_missing_default_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """No default pool (and no pools at all) — signup must still succeed."""
    from app.services import auth_service

    _, maker, _ = app_and_maker

    async with maker() as session:
        resp = await auth_service.signup_user(
            session, email="no-pool-client@example.com", password="warm-Pulse-123!"
        )
        assert resp.user.email == "no-pool-client@example.com"
