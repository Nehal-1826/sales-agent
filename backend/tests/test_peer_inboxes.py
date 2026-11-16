"""Tests for admin peer-inbox routes (spec §5.2 #3, §7).

Uses the same harness style as ``test_mailboxes`` / ``test_plans`` — an
in-memory SQLite with ``StaticPool``, ``get_db`` overridden at the app
level, and only the tables this feature touches registered (the full
metadata has duplicate-index definitions that trip SQLite).
"""
from __future__ import annotations

import io
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
    from app.db import models  # noqa: F401 — register all models
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.mailboxes import Mailbox
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.peer_pools import PeerPool, PeerPoolMember
    from app.db.models.plans import Plan
    from app.db.models.users import User

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
            email="admin@example.com",
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
    maker: async_sessionmaker[AsyncSession], *, email: str = "client@example.com"
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
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


def _auth_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


def _create_body(email: str = "peer1@example.com", daily: int = 50) -> dict:
    return {
        "email_address": email,
        "provider": "google_ws",
        "smtp_host": "smtp.google.com",
        "smtp_port": 587,
        "smtp_username": email,
        "smtp_password": "smtp-secret-123",
        "imap_host": "imap.google.com",
        "imap_port": 993,
        "imap_username": email,
        "imap_password": "imap-secret-456",
        "daily_capacity": daily,
    }


# --------------------------------------------------------------------------- #
# Auth gating                                                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_peer_inbox_requires_super_admin(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    client_user = await _make_client(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get(
            "/api/admin/peer-inboxes", headers=_auth_for(client_user)
        )
    assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# Create                                                                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_peer_inbox_create_auto_adds_to_default_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.peer_pools import PeerPoolMember

    app, maker, _ = app_and_maker
    default_pool_id = await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/peer-inboxes",
            json=_create_body(),
            headers=_auth_for(admin),
        )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["email"] == "peer1@example.com"
    # Response includes default-pool membership ref.
    pool_ids = [m["pool_id"] for m in body["pool_memberships"]]
    assert str(default_pool_id) in pool_ids
    # And the trimmed pool_ids list is the same set.
    assert str(default_pool_id) in body["pool_ids"]
    # last_used_at starts null on a fresh peer.
    assert body["last_used_at"] is None
    # sends_today is the wire alias for used_today; new peers start at 0.
    assert body["sends_today"] == 0

    # DB side — membership row exists.
    async with maker() as session:
        rows = list(
            (
                await session.execute(
                    select(PeerPoolMember).where(
                        PeerPoolMember.pool_id == default_pool_id
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_peer_inbox_credentials_encrypted_at_rest(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    import json as _json

    from app.db.models.peer_inboxes import PeerInbox
    from app.services.crypto import get_fernet_service

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/peer-inboxes",
            json=_create_body(),
            headers=_auth_for(admin),
        )
    assert resp.status_code == 201

    # Response carries no encrypted or plaintext secret.
    body = resp.json()
    assert "smtp_password" not in body
    assert "imap_password" not in body
    assert "smtp_creds_encrypted" not in body
    assert "imap_creds_encrypted" not in body

    async with maker() as session:
        peer = (await session.execute(select(PeerInbox))).scalar_one()
        assert peer.smtp_creds_encrypted is not None
        assert peer.imap_creds_encrypted is not None
        assert b"smtp-secret-123" not in peer.smtp_creds_encrypted
        assert b"imap-secret-456" not in peer.imap_creds_encrypted

        fernet = get_fernet_service()
        smtp_plain = _json.loads(fernet.decrypt(peer.smtp_creds_encrypted).decode("utf-8"))
        imap_plain = _json.loads(fernet.decrypt(peer.imap_creds_encrypted).decode("utf-8"))
        assert smtp_plain["password"] == "smtp-secret-123"
        assert imap_plain["password"] == "imap-secret-456"


# --------------------------------------------------------------------------- #
# Bulk import                                                                 #
# --------------------------------------------------------------------------- #


_BULK_HEADER = (
    "email,provider,smtp_host,smtp_port,smtp_username,smtp_password,"
    "imap_host,imap_port,imap_username,imap_password,daily_capacity"
)


def _bulk_row(email: str, provider: str = "google_ws", cap: int = 50) -> str:
    return (
        f"{email},{provider},smtp.example.com,587,{email},pw-{email},"
        f"imap.example.com,993,{email},ipw-{email},{cap}"
    )


@pytest.mark.asyncio
async def test_peer_inbox_bulk_import_valid_csv_creates_all(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    rows = "\n".join(
        [_BULK_HEADER] + [_bulk_row(f"peer{i}@example.com") for i in range(5)]
    )
    files = {"file": ("peers.csv", io.BytesIO(rows.encode("utf-8")), "text/csv")}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/peer-inboxes/bulk",
            files=files,
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["succeeded"] == 5
    assert body["failed"] == []


@pytest.mark.asyncio
async def test_peer_inbox_bulk_import_reports_row_level_errors(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    rows = [
        _BULK_HEADER,
        _bulk_row("ok1@example.com"),
        _bulk_row("ok2@example.com"),
        # bad provider
        "bad1@example.com,NOT_A_PROVIDER,smtp.example.com,587,u,p,imap.example.com,993,u,p,50",
        _bulk_row("ok3@example.com"),
        # bad int
        "bad2@example.com,google_ws,smtp.example.com,NOT_A_PORT,u,p,imap.example.com,993,u,p,50",
    ]
    csv_text = "\n".join(rows)
    files = {"file": ("peers.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/peer-inboxes/bulk",
            files=files,
            headers=_auth_for(admin),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["succeeded"] == 3
    assert len(body["failed"]) == 2
    fail_rows = sorted(f["row"] for f in body["failed"])
    # header is row 1; bad rows are rows 4 and 6.
    assert fail_rows == [4, 6]


# --------------------------------------------------------------------------- #
# Delete cascades memberships                                                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_peer_inbox_delete_cascades_pool_memberships(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from sqlalchemy import func

    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.peer_pools import PeerPoolMember

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/admin/peer-inboxes",
            json=_create_body(),
            headers=_auth_for(admin),
        )
        assert create.status_code == 201
        peer_id = create.json()["id"]

        del_resp = await c.delete(
            f"/api/admin/peer-inboxes/{peer_id}", headers=_auth_for(admin)
        )
    assert del_resp.status_code == 204

    async with maker() as session:
        count_peers = int(
            (await session.execute(select(func.count(PeerInbox.id)))).scalar_one()
        )
        count_members = int(
            (
                await session.execute(select(func.count(PeerPoolMember.peer_inbox_id)))
            ).scalar_one()
        )
        assert count_peers == 0
        assert count_members == 0


# --------------------------------------------------------------------------- #
# Stats                                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_peer_inbox_stats_returns_aggregates(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # 2x google_ws, 1x office365 — one marked inactive.
        await c.post(
            "/api/admin/peer-inboxes",
            json=_create_body(email="g1@example.com", daily=50),
            headers=_auth_for(admin),
        )
        await c.post(
            "/api/admin/peer-inboxes",
            json=_create_body(email="g2@example.com", daily=100),
            headers=_auth_for(admin),
        )
        office_body = _create_body(email="o1@example.com", daily=75)
        office_body["provider"] = "office365"
        r3 = await c.post(
            "/api/admin/peer-inboxes",
            json=office_body,
            headers=_auth_for(admin),
        )
        # Patch third peer to inactive.
        peer_id = r3.json()["id"]
        await c.patch(
            f"/api/admin/peer-inboxes/{peer_id}",
            json={"is_active": False},
            headers=_auth_for(admin),
        )

        resp = await c.get(
            "/api/admin/peer-inboxes/stats", headers=_auth_for(admin)
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert body["active"] == 2
    assert body["inactive"] == 1
    by_provider = {row["provider"]: row for row in body["by_provider"]}
    assert by_provider["google_ws"]["count"] == 2
    assert by_provider["office365"]["count"] == 1
    assert by_provider["yahoo"]["count"] == 0
    # Both google_ws peers stay active; the lone office365 peer was patched to
    # is_active=False above, so its active count is 0.
    assert by_provider["google_ws"]["active"] == 2
    assert by_provider["office365"]["active"] == 0
    assert body["total_capacity"] == 50 + 100 + 75
    assert body["used_capacity_today"] == 0
    assert body["capacity_used_pct"] == 0.0
