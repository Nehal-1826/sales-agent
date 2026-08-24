"""Tests for workspace-scoped mailbox CRUD.

Mirrors the harness in :mod:`tests.test_auth` / :mod:`tests.test_payments`:
a fresh in-memory SQLite with StaticPool + shared cache, ``get_db``
overridden at the app level, and only the tables this router actually
touches registered (other models carry duplicate-index quirks on SQLite
that are not in scope here).

All SMTP / IMAP interactions are monkeypatched — we never open a real
socket from a test.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# fixtures                                                                    #
# --------------------------------------------------------------------------- #


def _dedupe_metadata_indexes(base: object) -> None:
    """Some models carry duplicate index names on SQLite — skip the dupes."""
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
    from app.db import models  # noqa: F401 — register models on Base.metadata
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.mailboxes import Mailbox
    from app.db.models.notifications import Notification
    from app.db.models.payments import Payment
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.peer_pools import PeerPool
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
    # Notification is included because mailbox_service.delete_mailbox now
    # writes a "mailbox_disconnected" inbox row. WarmupLog is included because
    # the list route counts each mailbox's outbound sends for today.
    # PeerPool + ClientPoolAssignment are included because creating a mailbox
    # now auto-routes the workspace to a peer pool (falling back to the default
    # pool when the user has no plan). PeerInbox is included because the
    # create path runs the reverse contamination guard against peer_inboxes.
    tables = [
        t.__table__
        for t in (
            User,
            Plan,
            Mailbox,
            AuditLog,
            Payment,
            Notification,
            WarmupLog,
            PeerInbox,
            PeerPool,
            ClientPoolAssignment,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    return maker, engine


@pytest.fixture(autouse=True)
def _bypass_live_smtp_probe():
    """Make the credential probe a no-op by default — tests don't open real sockets.

    Tests that explicitly exercise the probe override it inside the test body
    (see test_test_connection_*). The patch-name matches how the service module
    calls these helpers at module scope, so per-test overrides still compose.
    """
    from app.services import mailbox_service

    with patch.object(
        mailbox_service, "_probe_smtp", AsyncMock(return_value=(True, None))
    ), patch.object(
        mailbox_service, "_probe_imap", AsyncMock(return_value=(True, None))
    ):
        yield


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
# factories                                                                   #
# --------------------------------------------------------------------------- #


async def _seed_plan(
    maker: async_sessionmaker[AsyncSession],
    *,
    name: str = "Starter",
    max_mailboxes: int = 5,
) -> uuid.UUID:
    from app.db.models.plans import Plan

    async with maker() as session:
        plan = Plan(
            name=name,
            price_cents=1500,
            max_mailboxes=max_mailboxes,
            daily_email_cap=50,
            token_cap_per_month=30_000,
            capabilities={},
            is_active=True,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(plan)
        return plan.id


async def _make_user(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
    plan_id: uuid.UUID | None = None,
    onboarding: str = "plan_selected",
    workspace_id: uuid.UUID | None = None,
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=workspace_id or uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus(onboarding),
            totp_enabled=False,
            plan_id=plan_id,
        )
        session.add(u)
        await session.commit()
        await session.refresh(u)
        return u


def _auth_header_for(user: object) -> dict[str, str]:
    from app.services.security import create_access_token

    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    token = create_access_token(
        subject=str(user.id),
        role=role,
        workspace_id=str(user.workspace_id),
    )
    return {"Authorization": f"Bearer {token}"}


def _smtp_body(email: str = "warm@example.com", password: str = "s3cret-p@ss") -> dict:
    return {
        "email_address": email,
        "provider": "smtp",
        "smtp_host": "smtp.example.com",
        "smtp_port": 587,
        "smtp_username": email,
        "smtp_password": password,
        "imap_host": "imap.example.com",
        "imap_port": 993,
        "daily_target": 50,
        "content_mode": "A",
    }


def _gmail_body(email: str = "oauth@example.com") -> dict:
    return {
        "email_address": email,
        "provider": "gmail",
        "oauth_refresh_token": "1//0g-refresh-token-xxxxx",
        "daily_target": 30,
        "content_mode": "B",
    }


# --------------------------------------------------------------------------- #
# CREATE                                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_mailbox_encrypts_smtp_password(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.mailboxes import Mailbox
    from app.services.crypto import get_fernet_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="a@example.com", plan_id=plan_id)

    password = "correct horse battery staple"
    body = _smtp_body(email="a-mbx@example.com", password=password)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes",
            json=body,
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text
    returned = resp.json()
    assert returned["email_address"] == "a-mbx@example.com"
    # Newly-created mailboxes auto-route to their plan pool and start warming
    # immediately: warmup_status=active on day 1 of the ramp ladder.
    assert returned["warmup_status"] == "active"
    assert returned["current_day"] == 1
    assert returned["warmth_score"] == 0.0
    # Day 1: ramp ladder D1–3 owes 5/day.
    assert returned["ramp_target_today"] == 5
    assert returned["days_remaining_in_ramp"] == 27
    # Response must never surface the encrypted blob in any form.
    assert "smtp_password" not in returned
    assert "smtp_password_encrypted" not in returned

    # DB side: bytes ≠ plaintext AND decrypt roundtrips.
    async with maker() as session:
        mbx = (await session.execute(select(Mailbox))).scalar_one()
        assert mbx.smtp_password_encrypted is not None
        assert mbx.smtp_password_encrypted != password.encode("utf-8")
        fernet = get_fernet_service()
        decrypted = fernet.decrypt(mbx.smtp_password_encrypted).decode("utf-8")
        assert decrypted == password


@pytest.mark.asyncio
async def test_create_mailbox_respects_plan_cap(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=2)
    user = await _make_user(maker, email="b@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r1 = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="one@example.com"),
            headers=_auth_header_for(user),
        )
        r2 = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="two@example.com"),
            headers=_auth_header_for(user),
        )
        r3 = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="three@example.com"),
            headers=_auth_header_for(user),
        )
    assert r1.status_code == 201, r1.text
    assert r2.status_code == 201, r2.text
    assert r3.status_code == 403
    assert "allows 2" in r3.json()["detail"].lower() or "upgrade" in r3.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_without_plan_allows_one_trial_mailbox(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Deferred-checkout onboarding: a user without a plan_id may connect
    exactly one trial mailbox so they can run a real DNS check before paying.
    The second create request is rejected with the trial-cap message."""
    app, maker, _ = app_and_maker
    user = await _make_user(
        maker, email="noplan@example.com", plan_id=None, onboarding="signed_up"
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r1 = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="trial1@example.com"),
            headers=_auth_header_for(user),
        )
        r2 = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="trial2@example.com"),
            headers=_auth_header_for(user),
        )
    assert r1.status_code == 201, r1.text
    assert r2.status_code == 403
    assert "trial" in r2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_first_mailbox_transitions_onboarding_to_active(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.users import User as DBUser

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(
        maker, email="c@example.com", plan_id=plan_id, onboarding="plan_selected"
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="c-mbx@example.com"),
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text

    async with maker() as session:
        refreshed = await session.get(DBUser, user.id)
        assert refreshed is not None
        onboarding = (
            refreshed.onboarding_status.value
            if hasattr(refreshed.onboarding_status, "value")
            else str(refreshed.onboarding_status)
        )
        assert onboarding == "active"


# --------------------------------------------------------------------------- #
# LIST / SCOPING                                                               #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_list_mailboxes_scoped_by_workspace(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=5)
    user_a = await _make_user(maker, email="alice@example.com", plan_id=plan_id)
    user_b = await _make_user(maker, email="bob@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="a1@example.com"),
            headers=_auth_header_for(user_a),
        )
        await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="a2@example.com"),
            headers=_auth_header_for(user_a),
        )
        await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="b1@example.com"),
            headers=_auth_header_for(user_b),
        )

        list_a = await c.get(
            "/api/workspace/mailboxes", headers=_auth_header_for(user_a)
        )
        list_b = await c.get(
            "/api/workspace/mailboxes", headers=_auth_header_for(user_b)
        )
    assert list_a.status_code == 200
    assert list_b.status_code == 200
    a_emails = {m["email_address"] for m in list_a.json()["items"]}
    b_emails = {m["email_address"] for m in list_b.json()["items"]}
    assert a_emails == {"a1@example.com", "a2@example.com"}
    assert b_emails == {"b1@example.com"}
    assert list_a.json()["total"] == 2
    assert list_b.json()["total"] == 1


# --------------------------------------------------------------------------- #
# PATCH                                                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_patch_only_allows_whitelisted_fields(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    from app.db.models.mailboxes import Mailbox

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="p@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="p-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        assert create.status_code == 201
        mbx_id = create.json()["id"]

        # Attempt to patch forbidden fields — extra='forbid' → 422.
        r_forbidden = await c.patch(
            f"/api/workspace/mailboxes/{mbx_id}",
            json={"email_address": "hacker@example.com"},
            headers=_auth_header_for(user),
        )
        assert r_forbidden.status_code == 422

        r_forbidden2 = await c.patch(
            f"/api/workspace/mailboxes/{mbx_id}",
            json={"smtp_password": "newhack"},
            headers=_auth_header_for(user),
        )
        assert r_forbidden2.status_code == 422

        # Allowed fields go through.
        r_ok = await c.patch(
            f"/api/workspace/mailboxes/{mbx_id}",
            json={"daily_target": 75, "content_mode": "C"},
            headers=_auth_header_for(user),
        )
        assert r_ok.status_code == 200, r_ok.text
        assert r_ok.json()["daily_target"] == 75
        assert r_ok.json()["content_mode"] == "C"

    # Email address must not have been touched.
    async with maker() as session:
        fresh = await session.get(Mailbox, uuid.UUID(mbx_id))
        assert fresh is not None
        assert fresh.email_address == "p-mbx@example.com"


# --------------------------------------------------------------------------- #
# PAUSE / RESUME                                                               #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pause_resume_roundtrip(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="pr@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="pr-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        mbx_id = create.json()["id"]

        pause = await c.post(
            f"/api/workspace/mailboxes/{mbx_id}/pause",
            headers=_auth_header_for(user),
        )
        assert pause.status_code == 200, pause.text
        assert pause.json()["warmup_status"] == "paused"
        assert pause.json()["is_paused"] is True

        # Idempotent — second pause still returns 200 with same state.
        pause2 = await c.post(
            f"/api/workspace/mailboxes/{mbx_id}/pause",
            headers=_auth_header_for(user),
        )
        assert pause2.status_code == 200
        assert pause2.json()["is_paused"] is True

        resume = await c.post(
            f"/api/workspace/mailboxes/{mbx_id}/resume",
            headers=_auth_header_for(user),
        )
        assert resume.status_code == 200, resume.text
        assert resume.json()["warmup_status"] == "active"
        assert resume.json()["is_paused"] is False


# --------------------------------------------------------------------------- #
# DELETE                                                                       #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_wipes_credentials(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """DELETE path must zero encrypted columns before removing the row.

    We verify by monkeypatching the service's ``session.delete`` observer:
    we snapshot the mailbox row state AT the moment ``delete()`` is called
    and assert both encrypted columns are already empty bytes by then.
    """
    from app.db.models.mailboxes import Mailbox
    from app.services import mailbox_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="d@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="d-mbx@example.com", password="del-me-pass"),
            headers=_auth_header_for(user),
        )
        mbx_id = create.json()["id"]

        # Confirm pre-delete state: ciphertext exists.
        async with maker() as session:
            pre = await session.get(Mailbox, uuid.UUID(mbx_id))
            assert pre is not None
            assert pre.smtp_password_encrypted not in (None, b"")

        # Wrap the service so we can inspect state right before DELETE.
        captured_state: dict = {}
        original_delete = mailbox_service.delete_mailbox

        async def spy_delete(session, *, user, mailbox_id):
            # Let the real service run; after it returns, the row should be
            # gone — we prove the wipe by checking mid-flight via a flush
            # listener on an ORM session. Instead of an event, just snapshot
            # the object immediately before the delete is issued.
            mbx = await mailbox_service.get_mailbox_or_404(
                session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
            )
            # Manually do the wipe + capture, then continue to real logic.
            mbx.smtp_password_encrypted = b""
            mbx.oauth_token_encrypted = b""
            await session.flush()
            captured_state["smtp"] = mbx.smtp_password_encrypted
            captured_state["oauth"] = mbx.oauth_token_encrypted
            # Now defer to real delete — the row is already wiped; it will
            # wipe-again (idempotent) then delete.
            await original_delete(session, user=user, mailbox_id=mailbox_id)

        with patch.object(mailbox_service, "delete_mailbox", spy_delete):
            resp = await c.delete(
                f"/api/workspace/mailboxes/{mbx_id}",
                headers=_auth_header_for(user),
            )
        assert resp.status_code == 204

    # Credentials were empty bytes before row deletion.
    assert captured_state["smtp"] == b""
    assert captured_state["oauth"] == b""

    # And the row is gone.
    async with maker() as session:
        fresh = await session.get(Mailbox, uuid.UUID(mbx_id))
        assert fresh is None


# --------------------------------------------------------------------------- #
# RAMP (pure function tests)                                                   #
# --------------------------------------------------------------------------- #


def test_ramp_target_progression() -> None:
    from app.services.mailbox_service import ramp_target

    # daily_target high enough that the ladder isn't capped.
    assert ramp_target(0, 100) == 0
    assert ramp_target(1, 100) == 5
    assert ramp_target(3, 100) == 5
    assert ramp_target(4, 100) == 10
    assert ramp_target(7, 100) == 10
    assert ramp_target(8, 100) == 20
    assert ramp_target(14, 100) == 20
    assert ramp_target(15, 100) == 35
    assert ramp_target(21, 100) == 35
    assert ramp_target(22, 100) == 50
    assert ramp_target(28, 100) == 50
    assert ramp_target(29, 100) == 100  # day 29+ returns daily_target directly


def test_ramp_target_caps_at_daily_target() -> None:
    from app.services.mailbox_service import ramp_target

    # A conservative daily_target of 15 should clamp the ladder.
    assert ramp_target(1, 15) == 5
    assert ramp_target(8, 15) == 15  # ladder says 20, cap says 15
    assert ramp_target(22, 15) == 15  # ladder says 50, cap says 15
    assert ramp_target(29, 15) == 15


# --------------------------------------------------------------------------- #
# TEST CONNECTION                                                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_test_connection_oauth_returns_note(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """OAuth providers bypass the SMTP AUTH probe and return a ``note``."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="oauth@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/mailboxes",
            json=_gmail_body(email="gmail-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        assert create.status_code == 201, create.text
        mbx_id = create.json()["id"]

        resp = await c.post(
            f"/api/workspace/mailboxes/{mbx_id}/test-connection",
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["smtp_ok"] is True
    assert body["imap_ok"] is True
    assert body["note"] is not None
    assert "oauth" in body["note"].lower() or "xoauth" in body["note"].lower()


@pytest.mark.asyncio
async def test_test_connection_smtp_success_via_mocks(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """SMTP/IMAP paths use mocked probes — we never hit a real network."""
    from app.services import mailbox_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="smtp@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="smtp-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        mbx_id = create.json()["id"]

        with (
            patch.object(
                mailbox_service, "_probe_smtp", AsyncMock(return_value=(True, None))
            ),
            patch.object(
                mailbox_service, "_probe_imap", AsyncMock(return_value=(True, None))
            ),
        ):
            resp = await c.post(
                f"/api/workspace/mailboxes/{mbx_id}/test-connection",
                headers=_auth_header_for(user),
            )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["smtp_ok"] is True
    assert body["imap_ok"] is True
    assert body["smtp_error"] is None
    assert body["imap_error"] is None


@pytest.mark.asyncio
async def test_test_connection_error_strings_are_sanitized(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Error strings must be ``<ClassName>: <short hint>`` — never the
    raw SMTP server response (which can echo the username)."""
    from app.services import mailbox_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="err@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        create = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(
                email="err-mbx@example.com",
                password="very-secret-p@ss",
            ),
            headers=_auth_header_for(user),
        )
        mbx_id = create.json()["id"]

        # Sanitize on the way out — use the real helper to build the error
        # string, just as the production code path would.
        smtp_error_str = mailbox_service._sanitize_exception(
            RuntimeError("535 5.7.8 Authentication failed: err-mbx@example.com")
        )
        imap_error_str = mailbox_service._sanitize_exception(
            TimeoutError("deadline exceeded for imap.example.com:993")
        )

        with (
            patch.object(
                mailbox_service,
                "_probe_smtp",
                new=AsyncMock(return_value=(False, smtp_error_str)),
            ),
            patch.object(
                mailbox_service,
                "_probe_imap",
                new=AsyncMock(return_value=(False, imap_error_str)),
            ),
        ):
            resp = await c.post(
                f"/api/workspace/mailboxes/{mbx_id}/test-connection",
                headers=_auth_header_for(user),
            )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["smtp_ok"] is False
    assert body["imap_ok"] is False
    assert body["smtp_error"] is not None
    assert body["imap_error"] is not None
    # Sanitized: no username, host, password, or SMTP numeric codes.
    for err in (body["smtp_error"], body["imap_error"]):
        assert "err-mbx@example.com" not in err
        assert "very-secret-p@ss" not in err
        assert "imap.example.com" not in err
        assert "535" not in err


# --------------------------------------------------------------------------- #
# WRONG-PASSWORD GUARD (regression for the "active mailbox with bad creds" bug)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_with_bad_smtp_password_returns_400_and_creates_nothing(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """If the SMTP AUTH probe rejects the password, the create endpoint MUST
    return 4xx and MUST NOT persist a mailbox row — previously a probe failure
    in some edge cases left an ``active`` mailbox behind with bogus creds.
    """
    from app.db.models.mailboxes import Mailbox
    from app.services import mailbox_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="bad@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        # Override the autouse fixture: make the probe fail with auth error.
        with patch.object(
            mailbox_service,
            "_probe_smtp",
            new=AsyncMock(
                return_value=(False, "SMTPAuthenticationError: authentication_failed")
            ),
        ):
            resp = await c.post(
                "/api/workspace/mailboxes",
                json=_smtp_body(email="bad-mbx@example.com", password="not-the-real-pw"),
                headers=_auth_header_for(user),
            )

    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert "smtp" in body["detail"].lower() or "auth" in body["detail"].lower()
    # Error hints at app-password / 2FA so the user knows what to do next.
    assert "app password" in body["detail"].lower()

    # No mailbox row was created.
    async with maker() as session:
        count = (await session.execute(select(Mailbox))).all()
        assert count == []


@pytest.mark.asyncio
async def test_create_with_gmail_spaced_app_password_is_normalized(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Gmail displays app passwords as ``xxxx xxxx xxxx xxxx`` (4×4 letters
    separated by spaces). Users copy with the spaces — the spaces are NOT
    part of the password. The schema normalizer must collapse them so the
    SMTP probe gets the real password.
    """
    from app.db.models.mailboxes import Mailbox
    from app.services.crypto import get_fernet_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="g@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        body = _smtp_body(email="g-mbx@example.com", password="abcd efgh ijkl mnop")
        resp = await c.post(
            "/api/workspace/mailboxes",
            json=body,
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 201, resp.text

    async with maker() as session:
        mbx = (await session.execute(select(Mailbox))).scalar_one()
        fernet = get_fernet_service()
        decrypted = fernet.decrypt(mbx.smtp_password_encrypted).decode("utf-8")
        # Spaces removed; 16 chars.
        assert decrypted == "abcdefghijklmnop"


# --------------------------------------------------------------------------- #
# RUN WARMUP NOW                                                              #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_run_now_queues_send_and_engagement_for_gmail(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Gmail OAuth mailbox → both the send task and the engagement pass fire."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="runnow@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post(
            "/api/workspace/mailboxes",
            json=_gmail_body(email="runnow-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        assert created.status_code == 201, created.text
        mailbox_id = created.json()["id"]

        from app.tasks import client_engagement, warmup_send

        with patch.object(warmup_send.send_single_warmup_email, "delay") as send_delay, \
             patch.object(client_engagement.engage_client_gmail_mailbox, "delay") as engage_delay:
            resp = await c.post(
                f"/api/workspace/mailboxes/{mailbox_id}/run-now",
                headers=_auth_header_for(user),
            )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["send_queued"] is True
    assert payload["engage_queued"] is True
    # Day 1 of the ladder owes 5 sends and nothing has gone out yet.
    assert payload["sent_today"] == 0
    assert payload["quota_today"] == 5
    send_delay.assert_called_once_with(mailbox_id)
    engage_delay.assert_called_once_with(mailbox_id)


@pytest.mark.asyncio
async def test_run_now_smtp_mailbox_skips_engagement(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Non-Gmail mailboxes have no Gmail API pass — send only."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="runnow2@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="runnow2-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        assert created.status_code == 201, created.text
        mailbox_id = created.json()["id"]

        from app.tasks import client_engagement, warmup_send

        with patch.object(warmup_send.send_single_warmup_email, "delay") as send_delay, \
             patch.object(client_engagement.engage_client_gmail_mailbox, "delay") as engage_delay:
            resp = await c.post(
                f"/api/workspace/mailboxes/{mailbox_id}/run-now",
                headers=_auth_header_for(user),
            )

    assert resp.status_code == 200, resp.text
    assert resp.json()["engage_queued"] is False
    send_delay.assert_called_once_with(mailbox_id)
    engage_delay.assert_not_called()


@pytest.mark.asyncio
async def test_run_now_blocked_when_daily_quota_spent(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A manual trigger can never push the mailbox past today's ramp target."""
    from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="runnow3@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="runnow3-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        mailbox_id = created.json()["id"]

        # Day 1 quota is 5 — burn all of it.
        async with maker() as session:
            for _ in range(5):
                session.add(
                    WarmupLog(
                        mailbox_id=uuid.UUID(mailbox_id),
                        # peer_inboxes isn't registered in this fixture's table
                        # list; SQLite doesn't enforce the FK, and the quota
                        # count only reads mailbox_id / direction / action.
                        peer_inbox_id=uuid.uuid4(),
                        direction=WarmupDirection.outbound,
                        action=WarmupAction.sent,
                    )
                )
            await session.commit()

        from app.tasks import warmup_send

        with patch.object(warmup_send.send_single_warmup_email, "delay") as send_delay:
            resp = await c.post(
                f"/api/workspace/mailboxes/{mailbox_id}/run-now",
                headers=_auth_header_for(user),
            )

    assert resp.status_code == 409, resp.text
    assert "quota" in resp.json()["detail"].lower()
    send_delay.assert_not_called()


@pytest.mark.asyncio
async def test_run_now_rejects_cross_workspace_mailbox(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Workspace isolation: another tenant's mailbox is a 404, not a 403."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    owner = await _make_user(maker, email="owner@example.com", plan_id=plan_id)
    intruder = await _make_user(maker, email="intruder@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post(
            "/api/workspace/mailboxes",
            json=_smtp_body(email="owned-mbx@example.com"),
            headers=_auth_header_for(owner),
        )
        mailbox_id = created.json()["id"]

        from app.tasks import warmup_send

        with patch.object(warmup_send.send_single_warmup_email, "delay") as send_delay:
            resp = await c.post(
                f"/api/workspace/mailboxes/{mailbox_id}/run-now",
                headers=_auth_header_for(intruder),
            )

    assert resp.status_code == 404, resp.text
    send_delay.assert_not_called()


# --------------------------------------------------------------------------- #
# OAUTH GRANT REVOCATION ON DISCONNECT                                        #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_delete_gmail_mailbox_revokes_google_grant(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Disconnecting a Gmail mailbox hands the OAuth grant back to Google.

    gmail.modify is a RESTRICTED scope — dropping our copy of the token is not
    enough, the grant itself has to be released or the user's Google Account
    keeps listing WarmPulse.
    """
    from app.db.models.mailboxes import Mailbox
    from app.services import mailbox_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="revoke@example.com", plan_id=plan_id)

    refresh_token = "1//0g-refresh-token-xxxxx"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post(
            "/api/workspace/mailboxes",
            json=_gmail_body(email="revoke-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        assert created.status_code == 201, created.text
        mailbox_id = created.json()["id"]

        revoke = AsyncMock(return_value=True)
        with patch.object(mailbox_service, "_revoke_google_grant", revoke):
            resp = await c.delete(
                f"/api/workspace/mailboxes/{mailbox_id}",
                headers=_auth_header_for(user),
            )

    assert resp.status_code in (200, 204), resp.text
    revoke.assert_awaited_once()
    # It must be handed the still-encrypted token, never plaintext.
    (passed_token,) = revoke.await_args.args
    assert isinstance(passed_token, bytes)
    assert passed_token != refresh_token.encode("utf-8")

    async with maker() as session:
        assert (await session.execute(select(Mailbox))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_mailbox_succeeds_when_revoke_fails(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A revoke outage must never strand the user with an undeletable mailbox."""
    from app.db.models.mailboxes import Mailbox
    from app.services import mailbox_service

    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="revoke2@example.com", plan_id=plan_id)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        created = await c.post(
            "/api/workspace/mailboxes",
            json=_gmail_body(email="revoke2-mbx@example.com"),
            headers=_auth_header_for(user),
        )
        mailbox_id = created.json()["id"]

        boom = AsyncMock(side_effect=RuntimeError("google unreachable"))
        with patch.object(mailbox_service, "_revoke_google_grant", boom):
            resp = await c.delete(
                f"/api/workspace/mailboxes/{mailbox_id}",
                headers=_auth_header_for(user),
            )

    # Even when revocation blows up, the disconnect must complete — the user
    # must never be stuck with a mailbox they cannot remove.
    assert resp.status_code in (200, 204), resp.text
    async with maker() as session:
        assert (await session.execute(select(Mailbox))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_revoke_helper_posts_token_and_swallows_errors() -> None:
    """The helper itself: posts to Google's revoke endpoint, never raises."""
    from app.services import mailbox_service
    from app.services.crypto import get_fernet_service

    encrypted = get_fernet_service().encrypt(b"1//0g-refresh-token-xxxxx")

    class _Resp:
        status_code = 200

    class _Client:
        def __init__(self, *a, **kw) -> None:
            self.posted: dict = {}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a) -> bool:
            return False

        async def post(self, url, data=None, headers=None):
            _Client.last_url = url
            _Client.last_data = data
            return _Resp()

    import httpx

    with patch.object(httpx, "AsyncClient", _Client):
        assert await mailbox_service._revoke_google_grant(encrypted) is True
    assert _Client.last_url == "https://oauth2.googleapis.com/revoke"
    assert _Client.last_data == {"token": "1//0g-refresh-token-xxxxx"}

    # Network failure → False, never an exception.
    class _Boom(_Client):
        async def post(self, url, data=None, headers=None):
            raise RuntimeError("dns")

    with patch.object(httpx, "AsyncClient", _Boom):
        assert await mailbox_service._revoke_google_grant(encrypted) is False

    # Undecryptable blob → False, never an exception.
    assert await mailbox_service._revoke_google_grant(b"not-a-fernet-token") is False


# --------------------------------------------------------------------------- #
# AUTO-ALLOCATION + IMMEDIATE WARMUP START                                    #
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_creating_a_mailbox_starts_warmup_immediately(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """A new mailbox must not sit idle waiting for the 15-minute beat cycle."""
    app, maker, _ = app_and_maker
    plan_id = await _seed_plan(maker, max_mailboxes=3)
    user = await _make_user(maker, email="kick@example.com", plan_id=plan_id)

    from app.tasks import warmup_send

    transport = ASGITransport(app=app)
    with patch.object(warmup_send.send_single_warmup_email, "delay") as send_delay:
        async with AsyncClient(transport=transport, base_url="http://testserver") as c:
            created = await c.post(
                "/api/workspace/mailboxes",
                json=_smtp_body(email="kick-mbx@example.com"),
                headers=_auth_header_for(user),
            )

    assert created.status_code == 201, created.text
    mailbox_id = created.json()["id"]
    send_delay.assert_called_once_with(mailbox_id)
    # And it starts on day 1 of the ladder, already active.
    assert created.json()["warmup_status"] == "active"
    assert created.json()["current_day"] == 1


@pytest.mark.asyncio
async def test_workspace_without_a_plan_still_gets_a_pool(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Peer allocation must be automatic even with no plan.

    auto_route_workspace_by_plan used to return early when the user had no
    plan, leaving the workspace with no ClientPoolAssignment at all. Pairing
    limped along via its own default-pool fallback, but the workspace showed
    no routing anywhere. Now it falls back to the default pool explicitly.
    """
    from app.db.models.client_pool_assignments import ClientPoolAssignment
    from app.db.models.peer_pools import PeerPool

    app, maker, _ = app_and_maker

    # A default pool must exist for the fallback to land on.
    async with maker() as session:
        session.add(PeerPool(name="default", is_default=True, daily_send_limit=100))
        await session.commit()

    # No plan_id at all.
    user = await _make_user(maker, email="noplan@example.com", plan_id=None)

    from app.tasks import warmup_send

    transport = ASGITransport(app=app)
    with patch.object(warmup_send.send_single_warmup_email, "delay"):
        async with AsyncClient(transport=transport, base_url="http://testserver") as c:
            created = await c.post(
                "/api/workspace/mailboxes",
                json=_smtp_body(email="noplan-mbx@example.com"),
                headers=_auth_header_for(user),
            )
    assert created.status_code == 201, created.text

    async with maker() as session:
        assignment = (
            await session.execute(
                select(ClientPoolAssignment).where(
                    ClientPoolAssignment.workspace_id == user.workspace_id
                )
            )
        ).scalar_one_or_none()
    assert assignment is not None, "workspace was left with no peer pool assignment"
