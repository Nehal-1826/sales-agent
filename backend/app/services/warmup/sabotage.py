"""The revenge ``sabotaged`` gate — single source of truth for the engine.

When a user is sabotaged (revenge feature: cancel-within-2h or admin action),
the warmup engine must stop working *for* them. Two engine behaviours actively
undo a revenge re-spam unless they consult this gate:

  1. The outbound scheduler keeps sending fresh warmup mail, which lands in the
     peer **inbox** — the opposite of revenge.
  2. The spam-rescue cycle finds revenge-moved mail sitting in Spam and pulls it
     back to the inbox, because rescue is normally the highest-signal positive
     engagement action.

Both must short-circuit for a sabotaged owner. The flag lives on the ``User``
row (``notification_prefs["sabotaged"] = True``, set by ``revenge_service``);
mailboxes are sabotaged transitively via their workspace, matching how
``revenge.respam_user_emails`` selects targets (by workspace).
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.mailboxes import Mailbox
from app.db.models.users import User


def _prefs_sabotaged(prefs: dict[str, Any] | None) -> bool:
    return bool(prefs) and bool(prefs.get("sabotaged"))


async def sabotaged_workspace_ids(db: AsyncSession) -> set[uuid.UUID]:
    """Return the set of workspace_ids that contain at least one sabotaged user.

    Computed in Python (not a JSONB SQL predicate) so the check is portable
    across Postgres (prod) and SQLite (unit tests). The user table is small.
    """
    rows = (await db.execute(select(User.workspace_id, User.notification_prefs))).all()
    return {ws for ws, prefs in rows if _prefs_sabotaged(prefs)}


async def is_workspace_sabotaged(workspace_id: uuid.UUID, db: AsyncSession) -> bool:
    users = (
        await db.scalars(select(User).where(User.workspace_id == workspace_id))
    ).all()
    return any(_prefs_sabotaged(u.notification_prefs) for u in users)


async def is_mailbox_sabotaged(mailbox_id: uuid.UUID, db: AsyncSession) -> bool:
    mb = await db.get(Mailbox, mailbox_id)
    if mb is None:
        return False
    return await is_workspace_sabotaged(mb.workspace_id, db)
