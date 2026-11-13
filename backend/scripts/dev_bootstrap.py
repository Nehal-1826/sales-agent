"""Dev-only bootstrap: sqlite create_all + demo warmup data.

Run from backend/ (local Docker-less stack — alembic migrations are
Postgres-only, so the sqlite DB has no tables and authed warmup endpoints
500 with "no such table"):

    WARMUP_DEV_BOOTSTRAP=1 python -m scripts.dev_bootstrap

Guards:
- refuses unless WARMUP_DEV_BOOTSTRAP=1;
- refuses outright when APP_ENV is anything outside DEV_ENVIRONMENTS
  (production can never run create_all against live tables);
- refuses non-sqlite DATABASE_URL — create_all is a sqlite-only dev
  shortcut; on any other database alembic owns the schema and a create_all
  would fight it.

Idempotent: deterministic UUIDs (uuid5) for every seeded row + get-or-create
semantics, so re-running never duplicates. Safe to run before OR after the
first bridge login — see _ensure_bridge_user.

Workspace design (trace in .superpowers/sdd/stream-b-task-1-report.md):
dashboard routes scope by user.workspace_id (Mailbox.workspace_id ==
workspace_id, then warmup_logs/daily_metrics via mailbox_id; alerts by
Notification.user_id). The Django bridge JWT carries the operator's email
(iss=agent-bridge) and app.api.deps._provision_bridge_user resolves users
by email — creating one with a RANDOM workspace_id on first login. The
bootstrap therefore pre-provisions that same user with a deterministic
workspace when absent, or adopts the existing user's workspace when the
bridge login already happened. Both orders converge on one workspace.
"""
from __future__ import annotations

import asyncio
import math
import sys
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config import DEV_ENVIRONMENTS, Settings, get_settings
from app.db import models  # noqa: F401 — register every table on Base.metadata
from app.db.base import Base
from app.db.models.daily_metrics import DailyMetric
from app.db.models.mailboxes import (
    ContentMode,
    Mailbox,
    MailboxProvider,
    WarmupStatus,
)
from app.db.models.notifications import Notification
from app.db.models.peer_inboxes import PeerInbox, PeerProvider
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog

DEFAULT_BRIDGE_EMAIL = "operator@agentic.local"
_NAMESPACE = uuid.UUID("9e6d0bb1-2d24-4d1a-8f6e-4b8d9a3c0001")

HISTORY_DAYS = 30

# (email, provider, start warmth, current warmth, status)
# provider must stay inside the DB MailboxProvider enum; the MailboxOut
# response enum now mirrors it fully (self_hosted included — see
# tests/test_mailbox_provider_enum.py).
_MAILBOX_PLAN = [
    ("devesh@shailog.tech", MailboxProvider.gmail, 28.0, 86.0, WarmupStatus.active),
    ("sales@shailog.tech", MailboxProvider.smtp, 24.0, 71.0, WarmupStatus.active),
    ("hello@shailog.tech", MailboxProvider.outlook, 20.0, 42.0, WarmupStatus.pending),
]

_PEERS = [
    ("peer-anna@warmpulse.dev", PeerProvider.google_ws),
    ("peer-ben@warmpulse.dev", PeerProvider.office365),
    ("peer-chen@warmpulse.dev", PeerProvider.yahoo),
]


class BootstrapRefused(RuntimeError):
    """Raised when the bootstrap runs outside its allowed envelope."""


def ensure_bootstrap_allowed(settings: Settings) -> None:
    """Hard guards: dev environments only, only when explicitly enabled, and
    only against sqlite (create_all must never fight alembic off-sqlite)."""
    if settings.app_env.lower() not in DEV_ENVIRONMENTS:
        raise BootstrapRefused(
            f"WARMUP_DEV_BOOTSTRAP refused: APP_ENV={settings.app_env!r} is not a "
            "development environment (create_all must never touch production)."
        )
    if not settings.warmup_dev_bootstrap:
        raise BootstrapRefused(
            "WARMUP_DEV_BOOTSTRAP=1 is required to run the dev bootstrap."
        )
    if not settings.database_url.startswith("sqlite"):
        scheme = settings.database_url.split("://")[0]
        raise BootstrapRefused(
            f"WARMUP_DEV_BOOTSTRAP refused: DATABASE_URL is {scheme}://, not "
            "sqlite — create_all is a sqlite-only dev shortcut and would fight "
            "alembic (which owns the schema on every other database). Run "
            "alembic migrations against this database instead."
        )


def _dev_id(tag: str) -> uuid.UUID:
    return uuid.uuid5(_NAMESPACE, tag)


async def run_bootstrap(engine: AsyncEngine, *, settings: Settings) -> dict[str, Any]:
    """Create the schema via Base.metadata.create_all and seed demo data.

    Returns a small summary dict (row counts) for logging.
    """
    ensure_bootstrap_allowed(settings)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        user = await _ensure_bridge_user(session, settings.warmup_dev_bridge_email)
        await _ensure_workspace_setting(session, user.workspace_id)
        peers = await _ensure_peers(session)
        mailboxes = await _ensure_mailboxes(session, user)
        metrics_added = await _ensure_daily_metrics(session, mailboxes)
        logs_added = await _ensure_warmup_logs(session, mailboxes, peers)
        alerts_added = await _ensure_alerts(session, user)
        await session.commit()

    return {
        "bridge_email": user.email,
        "workspace_id": str(user.workspace_id),
        "mailboxes": len(mailboxes),
        "daily_metrics": metrics_added,
        "warmup_logs": logs_added,
        "alerts": alerts_added,
    }


# --------------------------------------------------------------------------- #
# Seed steps (each idempotent)                                                #
# --------------------------------------------------------------------------- #


async def _ensure_bridge_user(session: AsyncSession, email: str) -> User:
    """Find or create the bridge user the Django JWT resolves to.

    Provisioning (app.api.deps) keys on email and never modifies an existing
    user, so seeding this row ahead of the first bridge login makes both
    paths share one workspace.
    """
    email = email.lower()
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is not None:
        return user
    user = User(
        id=_dev_id(f"user:{email}"),
        email=email,
        hashed_password=None,
        workspace_id=_dev_id(f"workspace:{email}"),
        role=UserRole.client,
        onboarding_status=OnboardingStatus.active,
        email_verified=True,
        display_name="Dev Operator (bridge)",
    )
    session.add(user)
    await session.flush()
    return user


async def _ensure_workspace_setting(session: AsyncSession, workspace_id: uuid.UUID) -> None:
    from app.db.models.workspace_settings import WorkspaceSetting

    existing = await session.get(WorkspaceSetting, workspace_id)
    if existing is not None:
        return
    session.add(
        WorkspaceSetting(workspace_id=workspace_id, name="Shailog (dev)", slug="shailog-dev")
    )
    await session.flush()


async def _ensure_peers(session: AsyncSession) -> list[PeerInbox]:
    peers: list[PeerInbox] = []
    for email, provider in _PEERS:
        peer = (
            await session.execute(select(PeerInbox).where(PeerInbox.email_address == email))
        ).scalar_one_or_none()
        if peer is None:
            peer = PeerInbox(
                id=_dev_id(f"peer:{email}"),
                email_address=email,
                provider=provider,
                reputation_score=88.0,
                daily_capacity=50,
                is_active=True,
                is_seed=True,
            )
            session.add(peer)
            await session.flush()
        peers.append(peer)
    return peers


async def _ensure_mailboxes(session: AsyncSession, user: User) -> list[Mailbox]:
    mailboxes: list[Mailbox] = []
    for email, provider, _start, warmth, status in _MAILBOX_PLAN:
        mb = (
            await session.execute(
                select(Mailbox).where(Mailbox.email_address == email)
            )
        ).scalar_one_or_none()
        if mb is None:
            mb = Mailbox(
                id=_dev_id(f"mailbox:{email}"),
                user_id=user.id,
                workspace_id=user.workspace_id,
                email_address=email,
                provider=provider,
                warmup_status=status,
                daily_target=20,
                current_day=HISTORY_DAYS,
                warmth_score=warmth,
                content_mode=ContentMode.A,
                is_paused=False,
                spf_valid=True,
                dkim_valid=True,
                dmarc_valid=True,
            )
            session.add(mb)
            await session.flush()
        mailboxes.append(mb)
    return mailboxes


async def _ensure_daily_metrics(session: AsyncSession, mailboxes: list[Mailbox]) -> int:
    """30 days of warmth history per mailbox; skip (mailbox, date) rows that
    already exist (get-or-create via the unique constraint)."""
    today = datetime.now(UTC).date()
    added = 0
    for mb, (_email, _provider, start_warmth, current_warmth, _status) in zip(
        mailboxes, _MAILBOX_PLAN, strict=True
    ):
        have = {
            row[0]
            for row in (
                await session.execute(
                    select(DailyMetric.date).where(DailyMetric.mailbox_id == mb.id)
                )
            ).all()
        }
        for offset in range(HISTORY_DAYS):
            day = today - timedelta(days=HISTORY_DAYS - 1 - offset)
            if day in have:
                continue
            # Smooth ramp start → current with a small sinusoidal wiggle.
            t = offset / (HISTORY_DAYS - 1)
            warmth = start_warmth + (current_warmth - start_warmth) * t
            warmth += 2.5 * math.sin(offset * 0.9)
            warmth = max(5.0, min(99.0, warmth))
            sent = max(2, int(4 + 16 * t))
            opens = max(1, int(sent * (0.55 + 0.3 * t)))
            replies = max(0, int(sent * (0.08 + 0.14 * t)))
            session.add(
                DailyMetric(
                    mailbox_id=mb.id,
                    date=day,
                    emails_sent=sent,
                    emails_received=sent - 1 if sent > 1 else 1,
                    opens=opens,
                    replies=replies,
                    spam_rescues=1 if offset % 7 == 3 else 0,
                    bounce_count=0,
                    inbox_placement_pct=max(40.0, min(98.0, warmth + 6.0)),
                    warmth_score=round(warmth, 1),
                )
            )
            added += 1
    await session.flush()
    return added


async def _ensure_warmup_logs(
    session: AsyncSession, mailboxes: list[Mailbox], peers: list[PeerInbox]
) -> int:
    """Today's activity (all six action kinds so today-stats is non-zero) +
    a few older rows for feed depth. Seeded once per mailbox: skipped when
    the mailbox already has any logs (re-runs never duplicate)."""
    now = datetime.now(UTC)
    added = 0
    for idx, mb in enumerate(mailboxes):
        existing = (
            await session.execute(
                select(WarmupLog.id).where(WarmupLog.mailbox_id == mb.id).limit(1)
            )
        ).scalar_one_or_none()
        if existing is not None:
            continue
        peer = peers[idx % len(peers)]
        # (action, direction, minutes ago) — all six kinds today.
        plan = [
            (WarmupAction.sent, WarmupDirection.outbound, 3),
            (WarmupAction.sent, WarmupDirection.outbound, 11),
            (WarmupAction.sent, WarmupDirection.outbound, 27),
            (WarmupAction.opened, WarmupDirection.inbound, 9),
            (WarmupAction.opened, WarmupDirection.inbound, 21),
            (WarmupAction.replied, WarmupDirection.inbound, 15),
            (WarmupAction.starred, WarmupDirection.inbound, 33),
            (WarmupAction.spam_rescued, WarmupDirection.inbound, 41),
            (WarmupAction.marked_important, WarmupDirection.inbound, 55),
            # Yesterday — feed depth.
            (WarmupAction.sent, WarmupDirection.outbound, 60 * 26),
            (WarmupAction.opened, WarmupDirection.inbound, 60 * 25),
            (WarmupAction.replied, WarmupDirection.inbound, 60 * 24),
        ]
        for n, (action, direction, minutes_ago) in enumerate(plan):
            session.add(
                WarmupLog(
                    mailbox_id=mb.id,
                    peer_inbox_id=peer.id,
                    direction=direction,
                    action=action,
                    message_id=f"<dev-{mb.id.hex[:8]}-{n}@warmpulse.dev>",
                    subject_snippet="Warmup check-in (dev seed)",
                    created_at=now - timedelta(minutes=minutes_ago),
                )
            )
            added += 1
    await session.flush()
    return added


async def _ensure_alerts(session: AsyncSession, user: User) -> int:
    """2 unread alerts for the bridge user (kinds match the notification
    prefs defaults: warmth_drop / bounce_spike)."""
    alerts = [
        (
            "warmth_drop",
            "Warmth dip detected",
            "hello@shailog.tech dropped 6 points in 24h — still early in ramp.",
        ),
        (
            "bounce_spike",
            "Bounce rate elevated",
            "sales@shailog.tech bounced 2 of yesterday's 18 warmup sends.",
        ),
    ]
    added = 0
    for kind, title, body in alerts:
        nid = _dev_id(f"alert:{kind}:{user.id}")
        if await session.get(Notification, nid) is not None:
            continue
        session.add(Notification(id=nid, user_id=user.id, kind=kind, title=title, body=body))
        added += 1
    await session.flush()
    return added


# --------------------------------------------------------------------------- #
# Script entry                                                                #
# --------------------------------------------------------------------------- #


async def main() -> int:
    settings = get_settings()
    from app.db.session import engine as app_engine

    summary = await run_bootstrap(app_engine, settings=settings)
    print("[dev-bootstrap] done:")
    for key, value in summary.items():
        print(f"  {key}: {value}")
    return 0


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    raise SystemExit(asyncio.run(main()))
