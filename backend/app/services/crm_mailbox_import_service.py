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
from app.db.models.mailboxes import Mailbox, MailboxProvider
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
    """Try each Sent-folder candidate; return (client, folder) on first hit.

    Password/IMAP only. Gmail OAuth mailboxes do NOT come through here — Gmail
    IMAP requires the full https://mail.google.com/ scope, which we
    deliberately never request; they use the Gmail REST API instead (see
    :func:`_collect_contacts_via_gmail_api`).
    """
    for folder in _SENT_FOLDER_CANDIDATES:
        try:
            client = aioimaplib.IMAP4_SSL(
                host=host, port=port, timeout=_IMAP_TIMEOUT
            )
            await asyncio.wait_for(
                client.wait_hello_from_server(), timeout=_IMAP_TIMEOUT
            )
            auth_resp = await client.login(username, password)
            if str(getattr(auth_resp, "result", "")).upper() != "OK":
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


_GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"


async def _collect_contacts_via_gmail_api(
    access_token: str, *, own_email: str
) -> dict[str, str]:
    """Collect Sent-folder correspondents for an OAuth Gmail mailbox.

    Uses the Gmail REST API rather than IMAP. Gmail's IMAP endpoint only
    accepts XOAUTH2 when the grant includes the full ``https://mail.google.com/``
    scope, which WarmPulse deliberately never requests — so IMAP simply hangs
    for these mailboxes. The REST API needs only read access, which the
    ``gmail.modify`` scope we already hold provides.

    Reads message METADATA only (To / Cc headers) — never message bodies.
    """
    import httpx

    headers = {"Authorization": f"Bearer {access_token}"}
    contacts: dict[str, str] = {}

    async with httpx.AsyncClient(timeout=_IMAP_TIMEOUT) as client:
        message_ids: list[str] = []
        page_token: str | None = None
        while len(message_ids) < _SCAN_LIMIT:
            params: dict[str, Any] = {
                "q": f"in:sent newer_than:{_SCAN_DAYS}d",
                "maxResults": min(100, _SCAN_LIMIT - len(message_ids)),
            }
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(
                f"{_GMAIL_API_BASE}/messages", params=params, headers=headers
            )
            resp.raise_for_status()
            body = resp.json()
            message_ids.extend(m["id"] for m in body.get("messages", []))
            page_token = body.get("nextPageToken")
            if not page_token:
                break

        for msg_id in message_ids[:_SCAN_LIMIT]:
            try:
                detail = await client.get(
                    f"{_GMAIL_API_BASE}/messages/{msg_id}",
                    params={
                        "format": "metadata",
                        "metadataHeaders": ["To", "Cc"],
                    },
                    headers=headers,
                )
                detail.raise_for_status()
            except Exception:  # noqa: BLE001 — one bad message must not abort
                continue
            for header in detail.json().get("payload", {}).get("headers", []):
                if header.get("name", "").lower() not in ("to", "cc"):
                    continue
                for name, addr in _parse_addresses(header.get("value", "")):
                    if addr and addr != own_email and addr not in contacts:
                        contacts[addr] = name or addr.split("@")[0]

    return contacts


async def _scan_sent_over_imap(
    connection: tuple[aioimaplib.IMAP4_SSL, str], *, own_email: str
) -> dict[str, str]:
    """Collect Sent-folder correspondents over IMAP (password mailboxes)."""
    client, _folder = connection
    since_str = (datetime.now(UTC) - timedelta(days=_SCAN_DAYS)).strftime("%d-%b-%Y")
    contacts: dict[str, str] = {}
    try:
        resp = await client.uid_search("SINCE", since_str)
        if resp.result != "OK":
            return contacts

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
    return contacts


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

    fernet = get_fernet_service()

    # Gmail mailboxes connect over OAuth and carry no imap_host and no
    # password — only a refresh token. They used to fall straight through the
    # password-only config check below and skip as "no_imap_config", so auto
    # CRM import never ran for any Gmail customer. Mint a short-lived access
    # token and authenticate with SASL XOAUTH2 instead.
    is_google_oauth = (
        mailbox.provider == MailboxProvider.gmail and mailbox.oauth_token_encrypted
    )

    if is_google_oauth:
        from app.config import get_settings
        from app.services.warmup.oauth_token import google_access_token

        try:
            refresh_token = fernet.decrypt(mailbox.oauth_token_encrypted).decode("utf-8")
        except Exception as exc:  # noqa: BLE001
            logger.warning("crm_import: decrypt failed mailbox=%s: %s", mailbox_id, exc)
            return {"skipped": "decrypt_failed"}
        try:
            access_token = await google_access_token(
                refresh_token, settings=get_settings()
            )
        except Exception as exc:  # noqa: BLE001 — never leaks the refresh token
            logger.warning(
                "crm_import: google token refresh failed mailbox=%s: %s",
                mailbox_id, exc,
            )
            return {"skipped": "oauth_token_refresh_failed"}
        finally:
            refresh_token = "REDACTED"
            del refresh_token

        try:
            gmail_contacts = await _collect_contacts_via_gmail_api(
                access_token, own_email=mailbox.email_address.lower()
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "crm_import: gmail api scan failed mailbox=%s: %s", mailbox_id, exc
            )
            return {"skipped": "gmail_api_failed"}
        finally:
            access_token = "REDACTED"
            del access_token

        connection = None  # Gmail never uses IMAP
    else:
        if not (
            mailbox.imap_host
            and mailbox.imap_port
            and mailbox.smtp_username
            and mailbox.smtp_password_encrypted
        ):
            return {"skipped": "no_imap_config"}

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

    own_email = mailbox.email_address.lower()

    # email → best display name found
    contacts: dict[str, str] = {}

    if is_google_oauth:
        contacts = gmail_contacts
    else:
        if connection is None:
            return {"skipped": "no_sent_folder_or_auth_failed"}
        contacts = await _scan_sent_over_imap(connection, own_email=own_email)


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
