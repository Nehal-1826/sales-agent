"""Celery task for automated CRM lead import.

Periodically scans workspaces with ``auto_crm_enabled=True`` and triggers
an IMAP Sent-folder scan for all active mailboxes in those workspaces.
"""
from __future__ import annotations

import logging
import uuid

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.workspace_settings import WorkspaceSetting
from app.db.session import SessionLocal
from app.services.crm_mailbox_import_service import import_leads_from_mailbox
from app.services.crm_service import crm_auto_enabled_for_plan

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.crm_auto_import.tick")
def tick() -> None:
    """Entry point for the hourly auto-import beat job."""
    import asyncio
    asyncio.run(_tick_async())


async def _tick_async() -> None:
    async with SessionLocal() as db:
        # Find all workspaces with auto CRM enabled
        stmt = select(WorkspaceSetting.workspace_id).where(
            WorkspaceSetting.auto_crm_enabled == True
        )
        workspace_ids = (await db.execute(stmt)).scalars().all()

        if not workspace_ids:
            return

        logger.info("crm_auto_import: scanning %s workspaces", len(workspace_ids))

        for ws_id in workspace_ids:
            # Safety gate: automated CRM is a Pro Plus / Agency capability.
            # The flag is kept in sync at plan-change time, but guard here too
            # so a stale flag on a downgraded workspace can't keep importing.
            owner_row = (
                await db.execute(
                    select(Plan.name)
                    .select_from(User)
                    .outerjoin(Plan, Plan.id == User.plan_id)
                    .where(User.workspace_id == ws_id)
                    .order_by(User.created_at.asc())
                    .limit(1)
                )
            ).first()
            plan_name = owner_row[0] if owner_row else None
            if not crm_auto_enabled_for_plan(plan_name):
                logger.info(
                    "crm_auto_import: skipping workspace %s — plan %r not auto-eligible",
                    ws_id, plan_name,
                )
                continue

            # Find all active mailboxes in this workspace
            mb_stmt = select(Mailbox.id).where(
                Mailbox.workspace_id == ws_id,
                Mailbox.warmup_status == WarmupStatus.active,
                Mailbox.is_paused == False,
                Mailbox.smtp_password_encrypted.is_not(None)
            )
            mailbox_ids = (await db.execute(mb_stmt)).scalars().all()

            for mb_id in mailbox_ids:
                # Trigger individual mailbox import
                logger.info("crm_auto_import: triggering import for mailbox %s", mb_id)
                # We do it sequentially here to avoid IMAP concurrency issues / rate limits
                # but we could also fan-out if needed.
                try:
                    res = await import_leads_from_mailbox(
                        db, mailbox_id=mb_id, auto_enroll=True
                    )
                    logger.info("crm_auto_import: mailbox %s result: %s", mb_id, res)
                except Exception as exc:
                    logger.exception("crm_auto_import: failed for mailbox %s", mb_id)
