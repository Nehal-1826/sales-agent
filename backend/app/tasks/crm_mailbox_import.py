"""CRM lead auto-import — triggered once per mailbox connect.

Pro Plus and Agency workspaces only. Scans the Sent folder of the newly
connected SMTP mailbox and bulk-creates CRM leads from unique recipients.
"""
from __future__ import annotations

import asyncio
import logging
import uuid

from app.celery_app import celery_app
from app.db.session import SessionLocal
from app.services.crm_mailbox_import_service import import_leads_from_mailbox

logger = logging.getLogger(__name__)


async def _import_impl(mailbox_id: str) -> dict:
    async with SessionLocal() as db:
        return await import_leads_from_mailbox(db, mailbox_id=uuid.UUID(mailbox_id))


@celery_app.task(
    name="app.tasks.crm_mailbox_import.import_leads",
    queue="default",
    max_retries=0,  # one-shot; don't retry on IMAP timeout
)
def import_leads(mailbox_id: str) -> dict:
    """Scan newly connected mailbox Sent folder and import CRM leads."""
    result = asyncio.run(_import_impl(mailbox_id))
    logger.info("crm_mailbox_import mailbox=%s result=%s", mailbox_id, result)
    return result
