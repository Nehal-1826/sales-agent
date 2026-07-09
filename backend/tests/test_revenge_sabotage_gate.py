"""The revenge ``sabotaged`` gate must make the warmup engine stop working
*for* a sabotaged owner — otherwise the engine undoes the re-spam.

Covers ``services/warmup/sabotage.py``, which is consulted by:
  - the outbound scheduler (no fresh sends for sabotaged owners)
  - the spam-rescue dispatch + impl (don't pull revenge mail back to inbox)
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.models.mailboxes import Mailbox, MailboxProvider, WarmupStatus
from app.db.models.users import User
from app.services.warmup.sabotage import (
    is_mailbox_sabotaged,
    is_workspace_sabotaged,
    sabotaged_workspace_ids,
)


@pytest.fixture
async def maker() -> async_sessionmaker[AsyncSession]:
    from app.db.base import Base

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    tables = [User.__table__, Mailbox.__table__]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all, tables=tables)
    return async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def _seed(db: AsyncSession, *, sabotaged: bool) -> tuple[uuid.UUID, uuid.UUID]:
    ws = uuid.uuid4()
    user = User(
        email=f"{uuid.uuid4().hex}@example.com",
        workspace_id=ws,
        notification_prefs={"sabotaged": True} if sabotaged else {},
    )
    db.add(user)
    await db.flush()
    mb = Mailbox(
        user_id=user.id,
        workspace_id=ws,
        email_address="noreply@ijrnexus.com",
        provider=MailboxProvider.smtp,
        warmup_status=WarmupStatus.active,
    )
    db.add(mb)
    await db.commit()
    return ws, mb.id


async def test_sabotaged_owner_is_gated(maker):
    async with maker() as db:
        ws, mb_id = await _seed(db, sabotaged=True)
        assert await is_workspace_sabotaged(ws, db) is True
        assert await is_mailbox_sabotaged(mb_id, db) is True
        assert ws in await sabotaged_workspace_ids(db)


async def test_normal_owner_is_not_gated(maker):
    async with maker() as db:
        ws, mb_id = await _seed(db, sabotaged=False)
        assert await is_workspace_sabotaged(ws, db) is False
        assert await is_mailbox_sabotaged(mb_id, db) is False
        assert ws not in await sabotaged_workspace_ids(db)


async def test_unknown_mailbox_is_not_sabotaged(maker):
    async with maker() as db:
        await _seed(db, sabotaged=True)
        assert await is_mailbox_sabotaged(uuid.uuid4(), db) is False
