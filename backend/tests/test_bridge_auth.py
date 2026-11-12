"""Agent-bridge JWT: FastAPI provisions passwordless users from Django-minted tokens."""
from __future__ import annotations

import time
from collections.abc import AsyncIterator

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.users import OnboardingStatus, User, UserRole


@pytest.fixture
def settings():
    """App settings (conftest sets JWT_SECRET etc. before any app import)."""
    from app.config import get_settings

    return get_settings()


@pytest_asyncio.fixture
async def app_and_client() -> AsyncIterator[
    tuple[AsyncClient, async_sessionmaker[AsyncSession]]
]:
    """Fresh app + client with get_db overridden to a shared in-memory SQLite.

    Mirrors tests/test_auth.py: the conftest ``client`` fixture does not
    override ``get_db``, so rows written inside request handlers would land in
    the app engine's own database and be invisible to the test session. Bridge
    provisioning writes must be inspectable, so use the same shared-engine
    (StaticPool) setup as the auth suite.
    """
    # Lazy imports so the env vars set by conftest take effect first.
    from app.db import models  # noqa: F401 — register tables on Base.metadata
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.mailboxes import Mailbox
    from app.db.models.notifications import Notification
    from app.db.models.peer_inboxes import PeerInbox
    from app.db.models.plans import Plan
    from app.db.models.warmup_logs import WarmupLog
    from app.db.models.warmup_threads import WarmupThread
    from app.db.models.workspace_settings import WorkspaceSetting
    from app.db.session import get_db
    from app.main import create_app

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Same table set as test_auth.py (— /me reads plans + workspace_settings),
    # plus the activity tables for the get_current_user_or_api_key route tests.
    tables = [
        t.__table__
        for t in (
            User, Plan, AuditLog, Notification, WorkspaceSetting,
            Mailbox, PeerInbox, WarmupLog, WarmupThread,
        )
    ]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)

    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            try:
                yield session
            finally:
                await session.close()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac, maker

    await engine.dispose()


@pytest_asyncio.fixture
async def client(app_and_client) -> AsyncIterator[AsyncClient]:
    """AsyncClient bound to the app, sharing the test's DB engine."""
    ac, _ = app_and_client
    return ac


@pytest_asyncio.fixture
async def db_session(app_and_client) -> AsyncIterator[AsyncSession]:
    """Session on the SAME shared engine the app writes to (shadows conftest's)."""
    _, maker = app_and_client
    async with maker() as session:
        yield session


def _bridge_token(settings, *, sub="17", email="bridge@shailog.com", role="client"):
    now = int(time.time())
    claims = {
        "iss": "agent-bridge", "type": "access", "sub": sub,
        "role": role, "email": email, "workspace": "demo",
        "iat": now, "exp": now + 3600,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


async def _fetch_user(db_session: AsyncSession, email: str) -> User:
    return (
        await db_session.execute(select(User).where(User.email == email))
    ).scalar_one()


class TestBridgeAuth:
    @pytest.mark.asyncio
    async def test_bridge_jwt_creates_user_and_authenticates(
        self, client, settings, db_session
    ):
        token = _bridge_token(settings)
        res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, res.text
        user = await _fetch_user(db_session, "bridge@shailog.com")
        assert user.hashed_password is None
        assert user.email_verified is True
        assert user.onboarding_status == OnboardingStatus.mailbox_pending
        assert user.role == UserRole.client

    @pytest.mark.asyncio
    async def test_bridge_is_idempotent(self, client, settings, db_session):
        for _ in range(2):
            res = await client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {_bridge_token(settings)}"},
            )
            assert res.status_code == 200, res.text
        count = (
            await db_session.execute(
                select(func.count()).select_from(User).where(User.email == "bridge@shailog.com")
            )
        ).scalar_one()
        assert count == 1

    @pytest.mark.asyncio
    async def test_existing_user_role_not_flipped(self, client, settings, db_session):
        """Idempotent re-login must not modify an EXISTING user's role/email."""
        from app.db.models.users import OnboardingStatus as OS

        db_session.add(
            User(
                email="bridge@shailog.com",
                hashed_password="x",
                role=UserRole.client,
                onboarding_status=OS.active,
                email_verified=True,
            )
        )
        await db_session.commit()
        # Token claims super_admin, but the row already exists as client.
        res = await client.get(
            "/api/auth/me",
            headers={
                "Authorization": f"Bearer {_bridge_token(settings, role='super_admin')}"
            },
        )
        assert res.status_code == 200, res.text
        user = await _fetch_user(db_session, "bridge@shailog.com")
        assert user.role == UserRole.client
        assert user.hashed_password == "x"

    @pytest.mark.asyncio
    async def test_platform_admin_maps_to_super_admin(
        self, client, settings, db_session
    ):
        res = await client.get(
            "/api/auth/me",
            headers={
                "Authorization": f"Bearer {_bridge_token(settings, role='super_admin')}"
            },
        )
        assert res.status_code == 200, res.text
        user = await _fetch_user(db_session, "bridge@shailog.com")
        assert user.role == UserRole.super_admin

    @pytest.mark.asyncio
    async def test_rejects_bad_issuer(self, client, settings):
        now = int(time.time())
        bad = jwt.encode(
            {"iss": "other", "type": "access", "sub": "1", "role": "client",
             "exp": now + 60},
            settings.jwt_secret,
            algorithm="HS256",
        )
        res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_rejects_bad_issuer_even_with_matching_sub(
        self, client, settings, db_session
    ):
        """Wrong iss must 401 even when the sub matches a real WarmPulse user —
        a foreign-issuer token must never fall through to normal auth."""
        from app.services.security import create_access_token

        existing = User(
            email="real-user@warmpulse-example.com",
            hashed_password="x",
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            email_verified=True,
        )
        db_session.add(existing)
        await db_session.commit()
        now = int(time.time())
        bad = jwt.encode(
            {"iss": "other", "type": "access", "sub": str(existing.id),
             "role": "client", "exp": now + 60},
            settings.jwt_secret,
            algorithm="HS256",
        )
        res = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert res.status_code == 401, res.text
        # Sanity: the same user's own (iss-less) token still works — normal
        # path unchanged.
        good = create_access_token(subject=str(existing.id), role="client")
        ok = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {good}"})
        assert ok.status_code == 200, ok.text


class TestBridgeAuthViaUserOrApiKeyDependency:
    """Endpoints behind get_current_user_or_api_key (activity, analytics,
    workspace_billing, workspace_reputation, selected mailbox/inbox routes).

    Bridge JWTs must resolve through provisioning there too — their ``sub`` is
    a Django user id and must never be fed to load_user_by_id — and foreign
    issuers must be rejected. The wp_live_ API-key path is covered by
    tests/test_api_key_auth.py and stays untouched.
    """

    ROUTE = "/api/workspace/warmup-activity/today-stats"

    @pytest.mark.asyncio
    async def test_bridge_jwt_provisions_and_authenticates(
        self, client, settings, db_session
    ):
        token = _bridge_token(settings, sub="17")
        res = await client.get(self.ROUTE, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200, res.text
        assert res.json() == {
            "sent": 0, "opens": 0, "replies": 0,
            "spam_rescues": 0, "stars": 0, "marked_important": 0,
        }
        # Resolved via email-provisioned bridge user, not a sub lookup.
        user = await _fetch_user(db_session, "bridge@shailog.com")
        assert user.hashed_password is None
        assert user.role == UserRole.client

    @pytest.mark.asyncio
    async def test_wrong_iss_rejected(self, client, settings):
        now = int(time.time())
        bad = jwt.encode(
            {"iss": "other", "type": "access", "sub": "1", "role": "client",
             "exp": now + 60},
            settings.jwt_secret,
            algorithm="HS256",
        )
        res = await client.get(self.ROUTE, headers={"Authorization": f"Bearer {bad}"})
        assert res.status_code == 401, res.text

    @pytest.mark.asyncio
    async def test_wrong_iss_rejected_even_with_matching_sub(
        self, client, settings, db_session
    ):
        """Foreign-iss token whose sub matches a real WarmPulse user must not
        fall through to load_user_by_id on this dependency either."""
        existing = User(
            email="apikey-route-user@warmpulse-example.com",
            hashed_password="x",
            role=UserRole.client,
            onboarding_status=OnboardingStatus.active,
            email_verified=True,
        )
        db_session.add(existing)
        await db_session.commit()
        now = int(time.time())
        bad = jwt.encode(
            {"iss": "other", "type": "access", "sub": str(existing.id),
             "role": "client", "exp": now + 60},
            settings.jwt_secret,
            algorithm="HS256",
        )
        res = await client.get(self.ROUTE, headers={"Authorization": f"Bearer {bad}"})
        assert res.status_code == 401, res.text
