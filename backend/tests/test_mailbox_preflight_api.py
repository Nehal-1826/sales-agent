"""Tests for POST /api/workspace/mailboxes/preflight and the ladder-backed
re-implementation of test_connection.

Follows the harness in :mod:`tests.test_mailboxes`: a fresh in-memory
SQLite with StaticPool + shared cache, ``get_db`` overridden at the app
level, and a JWT built directly via ``create_access_token`` (there is no
shared ``auth_client``/``client`` fixture in this codebase's conftest —
each mailbox test builds its own ASGI client + auth header locally).
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


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
    from app.db.models.mailboxes import Mailbox
    from app.db.models.notifications import Notification
    from app.db.models.payments import Payment
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
        for t in (User, Plan, Mailbox, AuditLog, Payment, Notification, WarmupLog)
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


async def _make_user(
    maker: async_sessionmaker[AsyncSession],
    *,
    email: str,
) -> object:
    from app.db.models.users import OnboardingStatus, User, UserRole

    async with maker() as session:
        u = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus("plan_selected"),
            totp_enabled=False,
            plan_id=None,
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


@pytest.mark.asyncio
async def test_preflight_endpoint_rejects_docker_host(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user = await _make_user(maker, email="a@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes/preflight",
            json={"smtp_host": "mail", "smtp_port": 587, "username": "u@x.com"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["blocking"]["id"] == "host_docker_internal"


@pytest.mark.asyncio
async def test_preflight_requires_auth(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, _maker, _ = app_and_maker
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes/preflight",
            json={"smtp_host": "mail.x.com", "smtp_port": 587, "username": "u@x.com"},
        )
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_preflight_never_echoes_the_password(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user = await _make_user(maker, email="b@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes/preflight",
            json={
                "smtp_host": "mail",
                "smtp_port": 587,
                "username": "u@x.com",
                "password": "hunter2",
            },
            headers=_auth_header_for(user),
        )
    assert "hunter2" not in resp.text


@pytest.mark.asyncio
async def test_preflight_route_does_not_get_shadowed_by_mailbox_id(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    """Regression: /preflight must route to the preflight handler, not be
    swallowed by /{mailbox_id}/... — a 422 UUID-validation error means the
    route ordering regressed."""
    app, maker, _ = app_and_maker
    user = await _make_user(maker, email="c@example.com")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.post(
            "/api/workspace/mailboxes/preflight",
            json={"smtp_host": "mail.edgyy.in", "smtp_port": 587, "username": "u@x.com"},
            headers=_auth_header_for(user),
        )
    assert resp.status_code != 422


# --------------------------------------------------------------------------- #
# Rate limiting (10/min/workspace, fixed-window over Redis — fails open)      #
# --------------------------------------------------------------------------- #


class _FakePipeline:
    """Minimal stand-in for ``redis.Redis().pipeline()`` covering the two
    commands ``check_rate_limit`` issues: ``INCR`` then ``TTL``."""

    def __init__(self, store: "_FakeRedis") -> None:
        self._store = store
        self._ops: list[tuple[str, str]] = []

    def incr(self, key: str) -> "_FakePipeline":
        self._ops.append(("incr", key))
        return self

    def ttl(self, key: str) -> "_FakePipeline":
        self._ops.append(("ttl", key))
        return self

    def execute(self) -> list[int]:
        results = []
        for op, key in self._ops:
            if op == "incr":
                self._store.counts[key] = self._store.counts.get(key, 0) + 1
                results.append(self._store.counts[key])
            elif op == "ttl":
                results.append(self._store.ttls.get(key, -2))
        self._ops = []
        return results


class _FakeRedis:
    """In-memory fake of the sync ``redis.Redis`` surface used by
    ``app.services.rate_limit`` — no live Redis required."""

    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.ttls: dict[str, int] = {}
        self.expire_calls: list[tuple[str, int]] = []

    def pipeline(self) -> _FakePipeline:
        return _FakePipeline(self)

    def expire(self, key: str, seconds: int) -> None:
        self.expire_calls.append((key, seconds))
        self.ttls[key] = seconds


@pytest.mark.asyncio
async def test_preflight_11th_call_in_window_is_rate_limited(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user = await _make_user(maker, email="d@example.com")
    fake_redis = _FakeRedis()

    transport = ASGITransport(app=app)
    with patch(
        "app.services.rate_limit._redis_client_or_none", return_value=fake_redis
    ):
        async with AsyncClient(transport=transport, base_url="http://testserver") as c:
            statuses = []
            for _ in range(11):
                resp = await c.post(
                    "/api/workspace/mailboxes/preflight",
                    json={
                        "smtp_host": "mail.edgyy.in",
                        "smtp_port": 587,
                        "username": "u@x.com",
                    },
                    headers=_auth_header_for(user),
                )
                statuses.append(resp.status_code)

    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


@pytest.mark.asyncio
async def test_preflight_succeeds_when_redis_is_unavailable(
    app_and_maker: tuple[object, async_sessionmaker[AsyncSession], object],
) -> None:
    app, maker, _ = app_and_maker
    user = await _make_user(maker, email="e@example.com")

    transport = ASGITransport(app=app)
    with patch("app.services.rate_limit._redis_client_or_none", return_value=None):
        async with AsyncClient(transport=transport, base_url="http://testserver") as c:
            resp = await c.post(
                "/api/workspace/mailboxes/preflight",
                json={
                    "smtp_host": "mail.edgyy.in",
                    "smtp_port": 587,
                    "username": "u@x.com",
                },
                headers=_auth_header_for(user),
            )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_rate_limit_sets_ttl_on_first_increment() -> None:
    """Guard against the permanent-lockout failure mode: the very first
    increment of a window must leave the key with a TTL, not immortal."""
    from app.services.rate_limit import check_rate_limit

    fake_redis = _FakeRedis()
    with patch("app.services.rate_limit._redis_client_or_none", return_value=fake_redis):
        allowed = await check_rate_limit("unit:test:ttl", limit=10, window_seconds=60)

    assert allowed is True
    assert len(fake_redis.expire_calls) == 1
    key, seconds = fake_redis.expire_calls[0]
    assert key.endswith("ratelimit:unit:test:ttl")
    assert seconds == 60

    # Second increment within the window must NOT re-issue EXPIRE (the TTL
    # from the first hit still governs the whole window).
    with patch("app.services.rate_limit._redis_client_or_none", return_value=fake_redis):
        allowed_again = await check_rate_limit("unit:test:ttl", limit=10, window_seconds=60)
    assert allowed_again is True
    assert len(fake_redis.expire_calls) == 1
