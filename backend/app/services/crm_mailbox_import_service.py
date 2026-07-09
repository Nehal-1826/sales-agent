"""Auto-import CRM leads from a user's mailbox Sent folder.

Gated to Pro Plus and Agency plans only. Scans the Sent folder via IMAP,
extracts unique To/CC recipients, and bulk-creates CRM leads in a
dedicated auto-import campaign for the workspace.
"""
from __future__ import annotations

import asyncio
import contextlib
import email.utils
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import aioimaplib
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.crm_campaigns import CrmCampaign, CrmCampaignStatus
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_leads import CrmLead, CrmLeadStage
from app.db.models.mailboxes import Mailbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.services.crm_service import crm_lead_cap
from app.services.crypto import get_fernet_service

logger = logging.getLogger(__name__)

_SENT_FOLDER_CANDIDATES = (
    "[Gmail]/Sent Mail",
    "Sent",
    "Sent Items",
    "Sent Messages",
    "INBOX.Sent",
)

_SCAN_LIMIT = 500   # max messages to inspect per run
_SCAN_DAYS = 90     # look back this many days in Sent
_IMAP_TIMEOUT = 20  # seconds


def _plan_is_eligible(plan_name: str | None) -> bool:
    if not plan_name:
        return False
    lower = plan_name.lower().strip()
    return (
        "agency" in lower
        or "enterprise" in lower
        or "pro_plus" in lower
        or "pro-plus" in lower
        or "proplus" in lower
        or "pro plus" in lower
    )


def _parse_addresses(header_value: str) -> list[tuple[str, str]]:
    """Parse a To/CC header string → [(display_name, email_addr), ...]."""
    out: list[tuple[str, str]] = []
    for part in header_value.split(","):
        name, addr = email.utils.parseaddr(part.strip())
        addr = addr.lower().strip()
        if addr and "@" in addr:
            out.append((name.strip(), addr))
    return out


async def _connect_sent(
    host: str,
    port: int,
    username: str,
    password: str,
) -> tuple[aioimaplib.IMAP4_SSL, str] | None:
    """Try each Sent-folder candidate; return (client, folder) on first hit."""
    for folder in _SENT_FOLDER_CANDIDATES:
        try:
            client = aioimaplib.IMAP4_SSL(
                host=host, port=port, timeout=_IMAP_TIMEOUT
            )
            await asyncio.wait_for(
                client.wait_hello_from_server(), timeout=_IMAP_TIMEOUT
            )
            login_resp = await client.login(username, password)
            if str(getattr(login_resp, "result", "")).upper() != "OK":
                with contextlib.suppress(Exception):
                    await client.logout()
                return None  # bad creds — no point trying other folders
            sel = await client.select(folder)
            if sel.result == "OK":
                return client, folder
            with contextlib.suppress(Exception):
                await client.logout()
        except Exception:  # noqa: BLE001
            continue
    return None


async def import_leads_from_mailbox(
    session: AsyncSession,
    *,
    mailbox_id: uuid.UUID,
    auto_enroll: bool = False,
) -> dict[str, Any]:
    """Scan Sent folder and bulk-create CRM leads.

    When ``auto_enroll`` is set (the hands-free auto-CRM path), newly imported
    leads are also enrolled into the workspace's default "Auto Outreach"
    sequence so the existing scheduler emails them automatically. Manual / other
    callers leave it ``False`` — import only, no sends.

    Returns a summary dict; never raises — callers (Celery task) log the result.
    """
    mailbox: Mailbox | None = await session.get(Mailbox, mailbox_id)
    if mailbox is None:
        return {"skipped": "mailbox_not_found"}

    user: User | None = await session.get(User, mailbox.user_id)
    if user is None:
        return {"skipped": "user_not_found"}

    plan_name: str | None = None
    if user.plan_id:
        plan: Plan | None = await session.get(Plan, user.plan_id)
        plan_name = plan.name if plan else None

    if not _plan_is_eligible(plan_name):
        return {"skipped": f"plan_not_eligible:{plan_name}"}

    if not (
        mailbox.imap_host
        and mailbox.imap_port
        and mailbox.smtp_username
        and mailbox.smtp_password_encrypted
    ):
        return {"skipped": "no_imap_config"}

    fernet = get_fernet_service()
    try:
        password = fernet.decrypt(mailbox.smtp_password_encrypted).decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("crm_import: decrypt failed mailbox=%s: %s", mailbox_id, exc)
        return {"skipped": "decrypt_failed"}

    connection = await _connect_sent(
        mailbox.imap_host,
        mailbox.imap_port,
        mailbox.smtp_username,
        password,
    )
    password = "REDACTED"
    del password

    if connection is None:
        return {"skipped": "no_sent_folder_or_auth_failed"}

    client, _folder = connection
    own_email = mailbox.email_address.lower()
    since_str = (datetime.now(UTC) - timedelta(days=_SCAN_DAYS)).strftime("%d-%b-%Y")

    # email → best display name found
    contacts: dict[str, str] = {}
    try:
        resp = await client.uid_search("SINCE", since_str)
        if resp.result != "OK":
            return {"skipped": "imap_search_failed"}

        uids: list[str] = []
        for line in resp.lines:
            uids.extend(line.decode(errors="replace").split())
        uids = uids[-_SCAN_LIMIT:]  # newest first

        for uid in uids:
            fetch = await client.uid(
                "fetch", uid, "(BODY.PEEK[HEADER.FIELDS (TO CC)])"
            )
            if fetch.result != "OK":
                continue
            for line in fetch.lines:
                text = (
                    line.decode(errors="replace")
                    if isinstance(line, (bytes, bytearray))
                    else str(line)
                )
                lower_text = text.lower()
                for prefix in ("to:", "cc:"):
                    if lower_text.startswith(prefix):
                        value = text[len(prefix):].strip()
                        for name, addr in _parse_addresses(value):
                            if addr and addr != own_email and addr not in contacts:
                                contacts[addr] = name or addr.split("@")[0]
    finally:
        with contextlib.suppress(Exception):
            await client.logout()

    if not contacts:
        return {"imported": 0, "found": 0}

    # Find or create the auto-import campaign for this mailbox
    campaign_name = f"Mailbox Import — {own_email}"
    campaign: CrmCampaign | None = (
        await session.execute(
            select(CrmCampaign).where(
                CrmCampaign.workspace_id == mailbox.workspace_id,
                CrmCampaign.name == campaign_name,
                CrmCampaign.status != CrmCampaignStatus.archived,
            )
        )
    ).scalar_one_or_none()

    if campaign is None:
        campaign = CrmCampaign(
            workspace_id=mailbox.workspace_id,
            name=campaign_name,
            description=f"Contacts auto-imported from {own_email} Sent folder.",
            status=CrmCampaignStatus.active,
        )
        session.add(campaign)
        await session.flush()

    cap = crm_lead_cap(plan_name)

    # Current lead count + set of existing emails (for dedup)
    existing_count = int(
        (
            await session.execute(
                select(func.count(CrmLead.id)).where(
                    CrmLead.workspace_id == mailbox.workspace_id
                )
            )
        ).scalar_one()
    )
    existing_emails: set[str] = {
        row[0].lower()
        for row in (
            await session.execute(
                select(CrmLead.email).where(
                    CrmLead.workspace_id == mailbox.workspace_id
                )
            )
        ).all()
    }

    now = datetime.now(UTC)
    imported = 0
    new_lead_ids: list[uuid.UUID] = []
    for addr, name in contacts.items():
        if cap is not None and (existing_count + imported) >= cap:
            break
        if addr in existing_emails:
            continue

        lead = CrmLead(
            workspace_id=mailbox.workspace_id,
            campaign_id=campaign.id,
            name=name,
            email=addr,
            stage=CrmLeadStage.new,
            source="mailbox_import",
            tags=["auto-imported"],
            last_activity_at=now,
        )
        session.add(lead)
        await session.flush()
        new_lead_ids.append(lead.id)

        session.add(
            CrmLeadActivity(
                workspace_id=mailbox.workspace_id,
                lead_id=lead.id,
                kind=CrmActivityKind.created,
                body=f"Auto-imported from {own_email} Sent folder",
                actor_email=own_email,
            )
        )
        imported += 1

    if imported:
        await session.commit()

    # Hands-free path: enroll the freshly imported leads into the workspace's
    # default "Auto Outreach" sequence so the existing scheduler emails them.
    enrolled = 0
    if auto_enroll and new_lead_ids:
        from app.services import crm_sequence_service

        try:
            seq_id = await crm_sequence_service.ensure_default_sequence(
                session,
                workspace_id=mailbox.workspace_id,
                campaign_id=campaign.id,
            )
            enrolled = await crm_sequence_service.system_enroll_leads(
                session,
                workspace_id=mailbox.workspace_id,
                sequence_id=seq_id,
                lead_ids=new_lead_ids,
            )
        except Exception:  # noqa: BLE001 — import already succeeded; never raise
            logger.exception(
                "crm_import auto-enroll failed mailbox=%s workspace=%s",
                mailbox_id,
                mailbox.workspace_id,
            )

    logger.info(
        "crm_import mailbox=%s workspace=%s plan=%s found=%s imported=%s enrolled=%s",
        mailbox_id,
        mailbox.workspace_id,
        plan_name,
        len(contacts),
        imported,
        enrolled,
    )
    return {
        "imported": imported,
        "found": len(contacts),
        "campaign": campaign_name,
        "enrolled": enrolled,
    }
