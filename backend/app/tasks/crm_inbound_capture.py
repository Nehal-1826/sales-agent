"""Celery task for inbound CRM lead capture.

Periodically scans workspaces with ``auto_crm_enabled=True`` and, for each active
mailbox, walks the INBOX for genuine inbound enquiries (see
:mod:`app.services.crm_inbound_capture_service`). Captured leads are auto-enrolled
into the workspace's default Auto Outreach sequence, mirroring the Sent-folder
auto-import. Gated to Pro Plus / Agency plans.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.celery_app import celery_app
from app.db.models.mailboxes import Mailbox, WarmupStatus
from app.db.models.plans import Plan
from app.db.models.users import User
from app.db.models.workspace_settings import WorkspaceSetting
from app.db.session import SessionLocal
from app.services.crm_inbound_capture_service import import_inbound_leads_from_mailbox
from app.services.crm_service import crm_auto_enabled_for_plan

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.crm_inbound_capture.tick", queue="smtp")
def tick() -> None:
    """Entry point for the inbound-capture beat job."""
    asyncio.run(_tick_async())


async def _tick_async() -> None:
    async with SessionLocal() as db:
        workspace_ids = (
            await db.execute(
                select(WorkspaceSetting.workspace_id).where(
                    WorkspaceSetting.auto_crm_enabled == True  # noqa: E712
                )
            )
        ).scalars().all()

        if not workspace_ids:
            return

        logger.info("crm_inbound_capture: scanning %s workspaces", len(workspace_ids))

        for ws_id in workspace_ids:
            # Safety gate: inbound capture is a Pro Plus / Agency capability. The
            # flag is kept in sync at plan-change time, but re-check here so a
            # stale flag on a downgraded workspace can't keep importing.
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
                continue

            mailbox_ids = (
                await db.execute(
                    select(Mailbox.id).where(
                        Mailbox.workspace_id == ws_id,
                        Mailbox.warmup_status == WarmupStatus.active,
                        Mailbox.is_paused == False,  # noqa: E712
                        Mailbox.smtp_password_encrypted.is_not(None),
                        Mailbox.imap_host.is_not(None),
                    )
                )
            ).scalars().all()

            for mb_id in mailbox_ids:
                # Sequential per IMAP politeness / rate limits, like auto-import.
                try:
                    res = await import_inbound_leads_from_mailbox(
                        db, mailbox_id=mb_id, auto_enroll=True
                    )
                    logger.info(
                        "crm_inbound_capture: mailbox %s result %s", mb_id, res
                    )
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "crm_inbound_capture: failed for mailbox %s", mb_id
                    )
