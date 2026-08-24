"""Tests for the peer-network contamination guards.

Root cause: client mailbox emails were added to ``peer_inboxes`` (admin
form/CSV), so the warmup engine treated client accounts as helper inboxes
and clients received warmup mail FROM each other. These tests pin every
layer of the fix:

* create/bulk-import reject client emails (409 / per-row failure),
* pairing's anti-join never selects contaminated peers (even legacy rows
  seeded directly into the table),
* the self-send guard filters the mailbox's own address,
* the reverse guard blocks connecting a peer email as a client mailbox,
* ``is_client_email`` matches login accounts without mailboxes too.

Harness mirrors ``test_peer_pools`` — in-memory SQLite + StaticPool +
``get_db`` override at the app level.
"""
from __future__ import annotations

import io
import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
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
    from app.db.models.warmup_logs import WarmupLog

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


async def _make_client_with_mailbox(
    maker: async_sessionmaker[AsyncSession], *, email: str
) -> uuid.UUID:
    """Seed a client login + one client mailbox sharing ``email``; returns
    the workspace id."""
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            totp_enabled=False,
        )
        session.add(u)
        await session.flush()
        mbx = Mailbox(
            user_id=u.id,
            workspace_id=u.workspace_id,
            email_address=email.lower(),
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.active,
            daily_target=50,
            current_day=5,
            warmth_score=0.0,
            content_mode=ContentMode.A,
        )
        session.add(mbx)
        await session.commit()
        return u.workspace_id


async def _seed_peer_row(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
    pool_id: uuid.UUID | None = None,
) -> uuid.UUID:
    """Seed a peer DIRECTLY (bypasses the create guards) — simulates a
    legacy contaminated row that predates the fix."""
    from app.db.models.peer_inboxes import PeerInbox, PeerProvider
    from app.db.models.peer_pools import PeerPoolMember

    async with maker() as session:
        peer = PeerInbox(
            email_address=email,
            provider=PeerProvider.google_ws,
            smtp_creds_encrypted=b"x",
            imap_creds_encrypted=b"x",
            reputation_score=0.5,
            daily_capacity=50,
            used_today=0,
            is_active=True,
        )
        session.add(peer)
        await session.flush()
        if pool_id is not None:
            session.add(PeerPoolMember(peer_inbox_id=peer.id, pool_id=pool_id))
        await session.commit()
        await session.refresh(peer)
        return peer.id


async def _seed_active_mailbox(
    maker: async_sessionmaker[AsyncSession],
    *,
    workspace_id: uuid.UUID,
    email: str,
) -> uuid.UUID:
    from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus

    async with maker() as session:
        mbx = Mailbox(
            user_id=uuid.uuid4(),
            workspace_id=workspace_id,
            email_address=email,
            provider=MailboxProvider.smtp,
            warmup_status=WarmupStatus.active,
            daily_target=50,
            current_day=5,
            warmth_score=0.0,
            content_mode=ContentMode.A,
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


def _create_body(email: str) -> dict:
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
        "daily_capacity": 50,
    }


_BULK_HEADER = (
    "email,provider,smtp_host,smtp_port,smtp_username,smtp_password,"
    "imap_host,imap_port,imap_username,imap_password,daily_capacity"
)


def _bulk_row(email: str) -> str:
    return (
        f"{email},google_ws,smtp.example.com,587,{email},pw,"
        f"imap.example.com,993,{email},ipw,50"
    )


# --------------------------------------------------------------------------- #
# 1. create_peer rejects client emails                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_peer_with_client_mailbox_email_rejected(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.peer_inboxes import PeerInbox

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    await _make_client_with_mailbox(maker, email="victim@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/peer-inboxes",
            json=_create_body("victim@example.com"),
            headers=_auth_for(admin),
        )
    assert resp.status_code == 409, resp.text
    assert "client mailbox" in resp.json()["detail"].lower()

    async with maker() as session:
        count = int(
            (await session.execute(select(func.count(PeerInbox.id)))).scalar_one()
        )
        assert count == 0


# --------------------------------------------------------------------------- #
# 2. bulk import: client rows land in the failed list                         #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_bulk_import_rejects_client_email_rows(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.peer_inboxes import PeerInbox

    app, maker, _ = app_and_maker
    await _seed_default_pool(maker)
    admin = await _make_admin(maker)
    await _make_client_with_mailbox(maker, email="victim@example.com")

    csv_text = "\n".join(
        [
            _BULK_HEADER,
            _bulk_row("clean-peer@example.com"),
            _bulk_row("victim@example.com"),
        ]
    )
    files = {"file": ("peers.csv", io.BytesIO(csv_text.encode("utf-8")), "text/csv")}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/admin/peer-inboxes/bulk", files=files, headers=_auth_for(admin)
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["succeeded"] == 1
    assert len(body["failed"]) == 1
    assert body["failed"][0]["row"] == 3
    assert "client mailbox" in body["failed"][0]["error"].lower()

    async with maker() as session:
        rows = {
            p.email_address: p
            for p in (
                (await session.execute(select(PeerInbox))).scalars().all()
            )
        }
        assert set(rows) == {"clean-peer@example.com"}


# --------------------------------------------------------------------------- #
# 3. pairing anti-join: contaminated peers never selected                     #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pairing_never_picks_contaminated_peer(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.services.warmup.pairing import _eligible_in_pool, pick_peer_inbox

    _, maker, _ = app_and_maker
    pool_id = await _seed_default_pool(maker)
    # Client mailbox whose email ALSO exists as a peer (legacy contamination,
    # seeded directly — the create guards would reject it today).
    workspace_id = await _make_client_with_mailbox(
        maker, email="contaminated@example.com"
    )
    contaminated_id = await _seed_peer_row(
        maker, email="contaminated@example.com", pool_id=pool_id
    )
    clean_id = await _seed_peer_row(
        maker, email="clean-helper@example.com", pool_id=pool_id
    )
    mbx_id = await _seed_active_mailbox(
        maker, workspace_id=workspace_id, email="contaminated@example.com"
    )

    async with maker() as session:
        eligible = await _eligible_in_pool(pool_id, session)
        eligible_ids = {p.id for p in eligible}
        assert contaminated_id not in eligible_ids
        assert clean_id in eligible_ids

        picks: set[uuid.UUID] = set()
        for _ in range(20):
            picked = await pick_peer_inbox(mbx_id, session)
            assert picked is not None
            picks.add(picked.id)
    assert picks == {clean_id}


# --------------------------------------------------------------------------- #
# 4. self-send guard: mailbox's own address never picked                      #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_self_send_guard_filters_own_address(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A peer sharing the warmup mailbox's own email must never receive that
    mailbox's warmup sends (anti-join + in-code self-send guard)."""
    from app.services.warmup.pairing import pick_peer_inbox

    _, maker, _ = app_and_maker
    pool_id = await _seed_default_pool(maker)
    workspace_id = uuid.uuid4()
    # Mailbox stored with mixed case; peer stored lowercase — the guard
    # compares case-insensitively.
    mbx_id = await _seed_active_mailbox(
        maker, workspace_id=workspace_id, email="Self@Example.com"
    )
    await _seed_peer_row(maker, email="self@example.com", pool_id=pool_id)
    clean_id = await _seed_peer_row(
        maker, email="other-helper@example.com", pool_id=pool_id
    )

    async with maker() as session:
        picks: set[uuid.UUID] = set()
        for _ in range(20):
            picked = await pick_peer_inbox(mbx_id, session)
            assert picked is not None
            picks.add(picked.id)
    assert picks == {clean_id}


# --------------------------------------------------------------------------- #
# 5. reverse guard: peer email can't become a client mailbox                  #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_mailbox_with_peer_email_rejected(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from fastapi import HTTPException
    from sqlalchemy import func as sa_func

    from app.db.models.mailboxes import Mailbox
    from app.db.models.users import OnboardingStatus, User, UserRole
    from app.schemas.mailboxes import MailboxCreateOauth, MailboxCreateSmtp
    from app.services.mailbox_service import create_mailbox

    _, maker, _ = app_and_maker
    await _seed_peer_row(maker, email="helper@example.com")

    async with maker() as session:
        user = User(
            email="client@example.com",
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.plan_selected,
            totp_enabled=False,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    smtp_payload = MailboxCreateSmtp(
        email_address="helper@example.com",
        provider="smtp",
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="helper@example.com",
        smtp_password="pw",
        daily_target=50,
    )
    oauth_payload = MailboxCreateOauth(
        email_address="Helper@Example.com",  # case-insensitive match too
        provider="gmail",
        oauth_refresh_token="1//0g-refresh-token",
        daily_target=30,
    )

    async with maker() as session:
        user_fresh = await session.get(User, user.id)
        for payload in (smtp_payload, oauth_payload):
            with pytest.raises(HTTPException) as exc:
                await create_mailbox(
                    session, user=user_fresh, payload=payload, skip_probe=True
                )
            assert exc.value.status_code == 409
            assert "peer inbox" in str(exc.value.detail).lower()

    async with maker() as session:
        count = int(
            (
                await session.execute(select(sa_func.count(Mailbox.id)))
            ).scalar_one()
        )
        assert count == 0


# --------------------------------------------------------------------------- #
# 6. is_client_email matches login accounts without mailboxes                 #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_is_client_email_matches_users_email(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.users import OnboardingStatus, User, UserRole
    from app.services.peer_inbox_service import is_client_email

    _, maker, _ = app_and_maker
    async with maker() as session:
        session.add(
            User(
                email="login-only@example.com",
                hashed_password=None,
                workspace_id=uuid.uuid4(),
                role=UserRole.client,
                onboarding_status=OnboardingStatus.signed_up,
                totp_enabled=False,
            )
        )
        await session.commit()

    async with maker() as session:
        # Login account with NO mailbox still counts — case-insensitive.
        assert await is_client_email(session, "login-only@example.com") is True
        assert await is_client_email(session, "  Login-Only@Example.COM ") is True
        # Unknown address is not a client.
        assert await is_client_email(session, "stranger@example.com") is False
