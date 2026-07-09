"""CRM reply-scan tick — beat-scheduled.

IMAP-scans every SMTP-capable sending mailbox for replies to CRM sequence sends
and records deduped ``email_replied`` activities (see
:func:`app.services.crm_reply_scan.scan_all_replies`). Runs on the ``smtp`` queue
because it does real IMAP I/O. System-wide: spans all workspaces.
"""
from __future__ import annotations

import asyncio
import logging

from app.celery_app import celery_app
from app.services import crm_reply_scan

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.crm_reply_scan.tick", queue="smtp")
def tick() -> dict:
    """Scan sending mailboxes for replies to CRM sequence sends."""
    result = asyncio.run(crm_reply_scan.scan_all_replies())
    logger.info(
        "crm_reply_scan scanned=%s recorded=%s",
        result.get("scanned_mailboxes"),
        result.get("replies_recorded"),
    )
    return result
