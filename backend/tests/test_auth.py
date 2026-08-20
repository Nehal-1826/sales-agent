"""Tests for auth endpoints.

These use a shared in-memory SQLite engine (StaticPool + shared cache) so the
FastAPI request cycle and the test fixture see the same database state.
"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def app_and_client() -> AsyncIterator[tuple[object, AsyncClient, async_sessionmaker[AsyncSession]]]:
    """Fresh app + client with get_db overridden to a shared in-memory SQLite."""
    # Lazy imports so the env vars set by conftest take effect first.
    from app.db import models  # noqa: F401 — register tables on Base.metadata
    from app.db.base import Base
    from app.db.models.audit_logs import AuditLog
    from app.db.models.notifications import Notification
    from app.db.models.plans import Plan
    from app.db.models.users import User
    from app.db.models.workspace_settings import WorkspaceSetting
    from app.db.session import get_db
    from app.main import create_app

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Only create tables the auth subsystem actually touches. Other models in
    # Base.metadata may have duplicate-index definitions that conflict on SQLite
    # — not our problem to fix in an auth-scoped change.
    # Notification is included because signup_user now drops a welcome row.
    tables = [t.__table__ for t in (User, Plan, AuditLog, Notification, WorkspaceSetting)]
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
        yield app, ac, maker

    await engine.dispose()


@pytest_asyncio.fixture
async def async_client(app_and_client) -> AsyncClient:
    _, ac, _ = app_and_client
    return ac


@pytest_asyncio.fixture
async def verify_email(app_and_client):
    """Complete email verification for a freshly signed-up user.

    Login 403s with ``email_not_verified`` until the signup verification link
    is followed; this fetches the token from the DB and hits the real
    /verify-email route so tests exercise the production flow.
    """
    from sqlalchemy import select

    from app.db.models.users import User

    _, ac, maker = app_and_client

    async def _verify(email: str) -> None:
        async with maker() as session:
            user = (
                await session.execute(select(User).where(User.email == email.lower()))
            ).scalar_one()
            token = user.email_verification_token
        assert token, f"no verification token issued for {email}"
        resp = await ac.get(f"/api/auth/verify-email?token={token}")
        assert resp.status_code == 200, resp.text

    return _verify


# ---------- signup ----------

@pytest.mark.asyncio
async def test_signup_creates_user_and_returns_tokens(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/auth/signup",
        json={"email": "alice@example.com", "password": "correcthorse"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]
    assert body["tokens"]["token_type"] == "bearer"
    assert body["tokens"]["expires_in"] > 0
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["role"] == "client"
    assert body["user"]["onboarding_status"] == "signed_up"
    assert body["user"]["totp_enabled"] is False
    assert body["user"]["plan"] is None
    assert body["user"]["workspace_id"]


@pytest.mark.asyncio
async def test_signup_rejects_duplicate_email(async_client: AsyncClient) -> None:
    body = {"email": "dup@example.com", "password": "correcthorse"}
    first = await async_client.post("/api/auth/signup", json=body)
    assert first.status_code == 201
    second = await async_client.post("/api/auth/signup", json=body)
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_signup_rejects_weak_password(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/auth/signup",
        json={"email": "weak@example.com", "password": "short"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_signup_rejects_bad_email(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/auth/signup",
        json={"email": "not-an-email", "password": "correcthorse"},
    )
    assert resp.status_code == 422


# ---------- login ----------

@pytest.mark.asyncio
async def test_login_valid_credentials(async_client: AsyncClient, verify_email) -> None:
    creds = {"email": "bob@example.com", "password": "correcthorse"}
    r1 = await async_client.post("/api/auth/signup", json=creds)
    assert r1.status_code == 201
    await verify_email(creds["email"])
    r2 = await async_client.post("/api/auth/login", json=creds)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["tokens"]["access_token"]
    assert body["user"]["email"] == "bob@example.com"


@pytest.mark.asyncio
async def test_login_invalid_password(async_client: AsyncClient) -> None:
    await async_client.post(
        "/api/auth/signup",
        json={"email": "carol@example.com", "password": "correcthorse"},
    )
    resp = await async_client.post(
        "/api/auth/login",
        json={"email": "carol@example.com", "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "whatever1"},
    )
    assert resp.status_code == 401


# ---------- refresh ----------

@pytest.mark.asyncio
async def test_refresh_rotates_tokens(async_client: AsyncClient) -> None:
    signup = await async_client.post(
        "/api/auth/signup",
        json={"email": "dave@example.com", "password": "correcthorse"},
    )
    refresh_tok = signup.json()["tokens"]["refresh_token"]
    resp = await async_client.post(
        "/api/auth/refresh", json={"refresh_token": refresh_tok}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tokens"]["access_token"]
    assert body["tokens"]["refresh_token"]


@pytest.mark.asyncio
async def test_refresh_rejects_invalid_token(async_client: AsyncClient) -> None:
    resp = await async_client.post(
        "/api/auth/refresh", json={"refresh_token": "not-a-jwt"}
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_rejects_access_token(async_client: AsyncClient) -> None:
    signup = await async_client.post(
        "/api/auth/signup",
        json={"email": "eve@example.com", "password": "correcthorse"},
    )
    access = signup.json()["tokens"]["access_token"]
    resp = await async_client.post("/api/auth/refresh", json={"refresh_token": access})
    assert resp.status_code == 401


# ---------- /me ----------

@pytest.mark.asyncio
async def test_me_requires_auth(async_client: AsyncClient) -> None:
    resp = await async_client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user_info(async_client: AsyncClient) -> None:
    signup = await async_client.post(
        "/api/auth/signup",
        json={"email": "frank@example.com", "password": "correcthorse"},
    )
    tok = signup.json()["tokens"]["access_token"]
    resp = await async_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {tok}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "frank@example.com"
    assert body["role"] == "client"
    assert body["onboarding_status"] == "signed_up"
    assert body["totp_enabled"] is False


@pytest.mark.asyncio
async def test_me_rejects_bad_token(async_client: AsyncClient) -> None:
    resp = await async_client.get(
        "/api/auth/me", headers={"Authorization": "Bearer garbage"}
    )
    assert resp.status_code == 401


# ---------- logout ----------

@pytest.mark.asyncio
async def test_logout_returns_204(async_client: AsyncClient) -> None:
    resp = await async_client.post("/api/auth/logout")
    assert resp.status_code == 204


# ---------- 2FA ----------

@pytest.mark.asyncio
async def test_2fa_enable_then_verify_then_login_requires_code(
    async_client: AsyncClient,
    verify_email,
) -> None:
    # 1. Signup (+ email verification, which gates login).
    signup = await async_client.post(
        "/api/auth/signup",
        json={"email": "gail@example.com", "password": "correcthorse"},
    )
    assert signup.status_code == 201
    await verify_email("gail@example.com")
    access = signup.json()["tokens"]["access_token"]
    auth_hdr = {"Authorization": f"Bearer {access}"}

    # 2. Enable TOTP — returns secret + otpauth URI. totp_enabled still false.
    enable = await async_client.post("/api/auth/2fa/enable", headers=auth_hdr)
    assert enable.status_code == 200, enable.text
    data = enable.json()
    secret = data["secret"]
    assert secret
    assert data["qr_provisioning_uri"].startswith("otpauth://totp/")
    assert "WarmPulse" in data["qr_provisioning_uri"]

    me1 = await async_client.get("/api/auth/me", headers=auth_hdr)
    assert me1.json()["totp_enabled"] is False

    # 3. Verify with a valid code — now totp_enabled flips to true.
    code = pyotp.TOTP(secret).now()
    verify = await async_client.post(
        "/api/auth/2fa/verify", headers=auth_hdr, json={"code": code}
    )
    assert verify.status_code == 204, verify.text
    me2 = await async_client.get("/api/auth/me", headers=auth_hdr)
    assert me2.json()["totp_enabled"] is True

    # 4. Login without a code -> 403.
    login_no = await async_client.post(
        "/api/auth/login",
        json={"email": "gail@example.com", "password": "correcthorse"},
    )
    assert login_no.status_code == 403

    # 5. Login with bad code -> 403.
    login_bad = await async_client.post(
        "/api/auth/login",
        json={
            "email": "gail@example.com",
            "password": "correcthorse",
            "totp_code": "000000",
        },
    )
    assert login_bad.status_code == 403

    # 6. Login with correct code -> 200.
    good_code = pyotp.TOTP(secret).now()
    login_ok = await async_client.post(
        "/api/auth/login",
        json={
            "email": "gail@example.com",
            "password": "correcthorse",
            "totp_code": good_code,
        },
    )
    assert login_ok.status_code == 200, login_ok.text


# ---------- firebase (Google) login + 2FA ----------

@pytest.mark.asyncio
async def test_firebase_login_2fa_gate(
    async_client: AsyncClient,
    monkeypatch,
) -> None:
    email = "g@example.com"

    async def _fake_verify(*args, **kwargs):
        return {"email": email, "email_verified": True}

    # Patch the symbol imported into the route module (and its source).
    monkeypatch.setattr(
        "app.api.routes.firebase_auth.verify_firebase_id_token", _fake_verify
    )
    monkeypatch.setattr(
        "app.services.firebase_auth.verify_firebase_id_token", _fake_verify
    )

    fake_token = "x" * 40

    # 1. First login with a brand-new email -> 200, auto-created, no 2FA.
    r1 = await async_client.post(
        "/api/auth/firebase", json={"id_token": fake_token}
    )
    assert r1.status_code == 200, r1.text
    access = r1.json()["tokens"]["access_token"]
    auth_hdr = {"Authorization": f"Bearer {access}"}

    # 2. Enable + verify TOTP for that user.
    enable = await async_client.post("/api/auth/2fa/enable", headers=auth_hdr)
    assert enable.status_code == 200, enable.text
    secret = enable.json()["secret"]
    verify = await async_client.post(
        "/api/auth/2fa/verify", headers=auth_hdr, json={"code": pyotp.TOTP(secret).now()}
    )
    assert verify.status_code == 204, verify.text

    # 3. Firebase login without a code -> 403.
    no_code = await async_client.post(
        "/api/auth/firebase", json={"id_token": fake_token}
    )
    assert no_code.status_code == 403, no_code.text

    # 4. Firebase login with a wrong code -> 403.
    bad = await async_client.post(
        "/api/auth/firebase", json={"id_token": fake_token, "totp_code": "000000"}
    )
    assert bad.status_code == 403, bad.text

    # 5. Firebase login with the correct code -> 200 with tokens.
    good = await async_client.post(
        "/api/auth/firebase",
        json={"id_token": fake_token, "totp_code": pyotp.TOTP(secret).now()},
    )
    assert good.status_code == 200, good.text
    assert good.json()["tokens"]["access_token"]


@pytest.mark.asyncio
async def test_firebase_login_recovers_from_concurrent_duplicate(
    app_and_client,
    monkeypatch,
) -> None:
    """A racing second request for a brand-new email must log in, not 500.

    The frontend fires /api/auth/firebase more than once per Google
    sign-in. Two concurrent requests for an unseen email both pass the
    initial lookup (None) and both INSERT; the loser hits the
    users_email_key unique constraint. The handler must recover by
    re-fetching the winner's row rather than bubbling a 500.

    We reproduce that deterministically: a user row already exists in the
    DB, but the handler's *first* lookup is forced to miss so it enters
    the insert path — exactly the race window. The real unique constraint
    then raises IntegrityError, and recovery must refetch + return 200.
    """
    import app.api.routes.firebase_auth as fb_route
    from app.db.models.users import OnboardingStatus, User, UserRole

    app, ac, maker = app_and_client
    email = "racer@example.com"

    async def _fake_verify(*args, **kwargs):
        return {"email": email, "email_verified": True}

    monkeypatch.setattr(fb_route, "verify_firebase_id_token", _fake_verify)

    # The "winner" already committed this user (simulates the concurrent
    # request that got there first).
    async with maker() as seed:
        seed.add(
            User(
                email=email,
                hashed_password=None,
                workspace_id=uuid.uuid4(),
                role=UserRole.client,
                onboarding_status=OnboardingStatus.signed_up,
                totp_enabled=False,
            )
        )
        await seed.commit()

    # Force ONLY the handler's first lookup to miss, so it takes the insert
    # path and trips the real unique constraint; the recovery refetch then
    # uses the genuine lookup and finds the seeded row.
    real_lookup = fb_route._get_user_by_email
    calls = {"n": 0}

    async def _lookup_miss_once(db, addr):
        calls["n"] += 1
        if calls["n"] == 1:
            return None
        return await real_lookup(db, addr)

    monkeypatch.setattr(fb_route, "_get_user_by_email", _lookup_miss_once)

    resp = await ac.post("/api/auth/firebase", json={"id_token": "x" * 40})
    assert resp.status_code == 200, resp.text
    assert resp.json()["user"]["email"] == email
    # Both lookups ran: the forced miss, then the recovery refetch.
    assert calls["n"] == 2

    # No duplicate row was created.
    async with maker() as check:
        from sqlalchemy import func, select as _select

        count = (
            await check.execute(
                _select(func.count()).select_from(User).where(User.email == email)
            )
        ).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_firebase_login_existing_user_logs_in(
    app_and_client,
    monkeypatch,
) -> None:
    """A returning Google user (row already present) logs in, no duplicate."""
    import app.api.routes.firebase_auth as fb_route

    app, ac, maker = app_and_client
    email = "returning@example.com"

    async def _fake_verify(*args, **kwargs):
        return {"email": email, "email_verified": True}

    monkeypatch.setattr(fb_route, "verify_firebase_id_token", _fake_verify)

    first = await ac.post("/api/auth/firebase", json={"id_token": "x" * 40})
    assert first.status_code == 200, first.text
    second = await ac.post("/api/auth/firebase", json={"id_token": "x" * 40})
    assert second.status_code == 200, second.text

    from app.db.models.users import User

    async with maker() as check:
        from sqlalchemy import func, select as _select

        count = (
            await check.execute(
                _select(func.count()).select_from(User).where(User.email == email)
            )
        ).scalar_one()
    assert count == 1


@pytest.mark.asyncio
async def test_2fa_verify_rejects_bad_code(async_client: AsyncClient) -> None:
    signup = await async_client.post(
        "/api/auth/signup",
        json={"email": "hank@example.com", "password": "correcthorse"},
    )
    access = signup.json()["tokens"]["access_token"]
    auth_hdr = {"Authorization": f"Bearer {access}"}
    await async_client.post("/api/auth/2fa/enable", headers=auth_hdr)
    resp = await async_client.post(
        "/api/auth/2fa/verify", headers=auth_hdr, json={"code": "000000"}
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_2fa_disable_requires_code(async_client: AsyncClient) -> None:
    signup = await async_client.post(
        "/api/auth/signup",
        json={"email": "iris@example.com", "password": "correcthorse"},
    )
    access = signup.json()["tokens"]["access_token"]
    auth_hdr = {"Authorization": f"Bearer {access}"}
    enable = await async_client.post("/api/auth/2fa/enable", headers=auth_hdr)
    secret = enable.json()["secret"]
    code = pyotp.TOTP(secret).now()
    await async_client.post(
        "/api/auth/2fa/verify", headers=auth_hdr, json={"code": code}
    )
    # Wrong code rejected.
    bad = await async_client.post(
        "/api/auth/2fa/disable", headers=auth_hdr, json={"code": "000000"}
    )
    assert bad.status_code == 400
    # Correct code disables.
    good = pyotp.TOTP(secret).now()
    ok = await async_client.post(
        "/api/auth/2fa/disable", headers=auth_hdr, json={"code": good}
    )
    assert ok.status_code == 204
    me = await async_client.get("/api/auth/me", headers=auth_hdr)
    assert me.json()["totp_enabled"] is False


# ---------- email verification idempotency ----------


@pytest.mark.asyncio
async def test_verify_email_is_idempotent(
    async_client: AsyncClient, app_and_client
) -> None:
    """Following the verification link twice must succeed both times.

    The link is hit more than once routinely: the client effect can fire
    twice, users double-click, and corporate mail scanners (Outlook Safe
    Links, antivirus gateways) prefetch links in email before the human ever
    clicks. The handler used to clear the token on the first hit, so every
    later request 400'd with "Invalid or expired verification link" — leaving
    the account verified in the database while the user was told it failed.
    """
    from sqlalchemy import select

    from app.db.models.users import User

    _, ac, maker = app_and_client

    email = "idempotent@example.com"
    signup = await ac.post(
        "/api/auth/signup",
        json={"email": email, "password": "Sup3rSecret!pass"},
    )
    assert signup.status_code in (200, 201), signup.text

    async with maker() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one()
        token = user.email_verification_token
    assert token

    first = await ac.get(f"/api/auth/verify-email?token={token}")
    assert first.status_code == 200, first.text

    # The prefetch / double-fire case: same token, immediately again.
    second = await ac.get(f"/api/auth/verify-email?token={token}")
    assert second.status_code == 200, (
        "second verification must not error — this is what showed users "
        f"'not verified' after a successful verify: {second.text}"
    )

    async with maker() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one()
        assert user.email_verified is True


@pytest.mark.asyncio
async def test_verify_email_rejects_unknown_token(async_client: AsyncClient) -> None:
    """A genuinely bogus token must still be refused."""
    resp = await async_client.get("/api/auth/verify-email?token=not-a-real-token")
    assert resp.status_code == 400
