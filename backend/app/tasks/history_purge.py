"""Daily warmup-log retention purge — Pro Honesty Pass D3.

For each workspace, deletes ``warmup_logs`` rows older than the workspace's
plan-defined retention window (``plan.capabilities.retention_days``).

The ``warmup_logs`` table is keyed by ``mailbox_id`` rather than
``workspace_id``, so we resolve the workspace via ``mailboxes.workspace_id``
and delete by mailbox. We compute one cutoff per workspace (driven by the
plan held by any user in that workspace — workspace users share a plan in
the current model) and write a single audit row per workspace summarising
the row count purged.

Runs at 00:30 UTC daily (5 minutes after the daily rollup writes its row,
so we never delete logs the rollup is still consuming).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from app.celery_app import celery_app
from app.db.models.app_settings import AppSetting
from app.db.models.audit_logs import AuditLog
from app.db.models.mailboxes import Mailbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.warmup_logs import WarmupLog
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# Sane default if a workspace's plan lacks the retention_days capability
# (covers pre-migration installs and any locally-created plan rows).
DEFAULT_RETENTION_DAYS = 90


async def _global_retention_override(db) -> int | None:
    """Admin Settings → defaults.warmup_log_retention_days. When set (>0) it is
    authoritative for every workspace, overriding per-plan retention windows so
    one knob controls the whole platform. Returns None when unset."""
    row = (
        await db.execute(select(AppSetting.value).where(AppSetting.key == "defaults"))
    ).scalar_one_or_none()
    if isinstance(row, dict):
        val = row.get("warmup_log_retention_days")
        if isinstance(val, int) and val > 0:
            return val
    return None


async def _impl() -> dict:
    now = datetime.now(UTC)
    summary: list[dict] = []

    async with SessionLocal() as db:
        global_override = await _global_retention_override(db)

        # Distinct workspace_ids — every workspace has at least one user row.
        workspace_ids = (await db.scalars(select(User.workspace_id).distinct())).all()

        for workspace_id in workspace_ids:
            # Resolve the workspace's plan via any user in that workspace.
            # If multiple users in a workspace held differing plans (edge
            # case in the current model), prefer the longest retention to
            # avoid surprising data loss.
            plan_rows = (await db.execute(
                select(Plan.capabilities)
                .join(User, User.plan_id == Plan.id)
                .where(User.workspace_id == workspace_id)
            )).all()
            candidates = [
                c["retention_days"]
                for (c,) in plan_rows
                if isinstance(c, dict)
                and isinstance(c.get("retention_days"), int)
                and c["retention_days"] > 0
            ]
            # A configured global retention overrides per-plan windows so the
            # admin can enforce one platform-wide policy (default 7 days).
            if global_override is not None:
                retention_days = global_override
            else:
                retention_days = max(candidates) if candidates else DEFAULT_RETENTION_DAYS

            cutoff = now - timedelta(days=retention_days)

            # warmup_logs has no workspace_id; scope by this workspace's mailboxes.
            mailbox_ids = (await db.scalars(
                select(Mailbox.id).where(Mailbox.workspace_id == workspace_id)
            )).all()
            if not mailbox_ids:
                continue

            stmt = (
                delete(WarmupLog)
                .where(WarmupLog.mailbox_id.in_(mailbox_ids))
                .where(WarmupLog.created_at < cutoff)
            )
            result = await db.execute(stmt)
            purged = result.rowcount or 0

            if purged > 0:
                db.add(
                    AuditLog(
                        actor_user_id=None,
                        actor_role="system",
                        action="warmup_logs_purged",
                        target_type="workspace",
                        target_id=workspace_id,
                        payload={
                            "purged_count": int(purged),
                            "cutoff": cutoff.isoformat(),
                            "retention_days": retention_days,
                            "message": (
                                f"purged {int(purged)} warmup_log rows older "
                                f"than {cutoff.isoformat()}"
                            ),
                        },
                    )
                )
            summary.append(
                {
                    "workspace_id": str(workspace_id),
                    "purged": int(purged),
                    "retention_days": retention_days,
                    "cutoff": cutoff.isoformat(),
                }
            )

        await db.commit()

    logger.info(
        "history_purge: workspaces=%d total_purged=%d",
        len(summary),
        sum(s["purged"] for s in summary),
    )
    return {"workspaces": summary}


@celery_app.task(name="app.tasks.history_purge.tick", queue="default")
def tick() -> dict:
    """Daily 00:30 UTC: enforce per-plan warmup_log retention windows."""
    return asyncio.run(_impl())
