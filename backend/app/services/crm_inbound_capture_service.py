"""Capture inbound business enquiries from a mailbox INBOX as CRM leads.

The inverse of :mod:`crm_mailbox_import_service`: where that harvests *people the
user has emailed* from the Sent folder, this scans the **INBOX** for cold inbound
enquiries — someone who emailed the user first — and turns the genuine ones into
CRM leads.

The INBOX is noisy: it carries the warmup peer-network mail (the moat),
newsletters, receipts, and automated notifications. A two-stage filter keeps the
signal:

1. **Rule exclusions** (cheap, deterministic) — drop peer-network senders, the
   workspace's own mailboxes, no-reply / mailer-daemon style addresses, mail
   carrying ``List-Unsubscribe`` / ``Auto-Submitted`` / ``Precedence: bulk``, and
   addresses already in the workspace CRM.
2. **LLM classification** — survivors go to the shared provider chain
   (Gemini -> Claude via :mod:`crm_ai_service`) which judges "is this a genuine
   business enquiry?". When no key is configured or the call fails the classifier
   returns ``None`` and the message is **skipped** (fail-closed: we never invent a
   noisy lead the engine can't justify).

Gated to Pro Plus / Agency plans, identical to the Sent-folder importer. Never
raises — callers (the Celery task) log the returned summary dict.
"""
from __future__ import annotations

import asyncio
import contextlib
import email.utils
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import aioimaplib
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.crm_campaigns import CrmCampaign, CrmCampaignStatus
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_leads import CrmLead, CrmLeadStage
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox
from app.db.models.plans import Plan
from app.db.models.users import User
from app.services.crm_mailbox_import_service import _plan_is_eligible
from app.services.crm_service import crm_lead_cap
from app.services.crypto import get_fernet_service

logger = logging.getLogger(__name__)

_SCAN_LIMIT = 300  # max INBOX messages to inspect per run
_SCAN_DAYS = 14    # look back this many days
_IMAP_TIMEOUT = 20

_FETCH_FIELDS = "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT LIST-UNSUBSCRIBE AUTO-SUBMITTED PRECEDENCE)])"  # noqa: E501

# Local-parts that are never a person worth chasing.
_AUTOMATED_LOCALPART = re.compile(
    r"^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce|"
    r"notifications?|alerts?|updates?|newsletter|news|info-noreply)$",
    re.IGNORECASE,
)


_UIDVALIDITY_RE = re.compile(rb"UIDVALIDITY\s+(\d+)", re.IGNORECASE)


def _parse_uidvalidity(lines: list) -> int | None:
    for raw in lines:
        data = raw if isinstance(raw, (bytes, bytearray)) else str(raw).encode()
        m = _UIDVALIDITY_RE.search(data)
        if m:
            return int(m.group(1))
    return None


async def _connect_inbox(
    host: str, port: int, username: str, password: str
) -> tuple[aioimaplib.IMAP4_SSL, str, int | None] | None:
    """Connect + login + SELECT INBOX.

    Returns ``(client, "INBOX", uidvalidity)`` or ``None``. ``uidvalidity`` is
    parsed from the SELECT response so the caller can detect a folder reset.
    """
    try:
        client = aioimaplib.IMAP4_SSL(host=host, port=port, timeout=_IMAP_TIMEOUT)
        await asyncio.wait_for(
            client.wait_hello_from_server(), timeout=_IMAP_TIMEOUT
        )
        login_resp = await client.login(username, password)
        if str(getattr(login_resp, "result", "")).upper() != "OK":
            with contextlib.suppress(Exception):
                await client.logout()
            return None
        sel = await client.select("INBOX")
        if sel.result == "OK":
            return client, "INBOX", _parse_uidvalidity(sel.lines)
        with contextlib.suppress(Exception):
            await client.logout()
    except Exception:  # noqa: BLE001
        return None
    return None


def _parse_headers(lines: list) -> dict[str, str]:
    """Flatten FETCH header lines into a {lowercased-name: value} dict."""
    headers: dict[str, str] = {}
    current: str | None = None
    for raw in lines:
        text = (
            raw.decode(errors="replace")
            if isinstance(raw, (bytes, bytearray))
            else str(raw)
        )
        if not text.strip() or text.strip() == ")":
            continue
        if text[:1] in (" ", "\t") and current:  # header continuation/folding
            headers[current] += " " + text.strip()
            continue
        if ":" in text:
            name, _, value = text.partition(":")
            name = name.strip().lower()
            if name in (
                "from",
                "subject",
                "list-unsubscribe",
                "auto-submitted",
                "precedence",
            ):
                headers[name] = value.strip()
                current = name
            else:
                current = None
    return headers


_CLASSIFY_SYSTEM = (
    "You triage a B2B inbox. Decide whether an inbound email is a genuine "
    "business enquiry or sales lead (someone wanting to buy, hire, partner, or "
    "requesting a quote/demo). Newsletters, receipts, notifications, spam, and "
    "automated mail are NOT leads. Answer with exactly one word: YES or NO."
)


async def classify_inbound_lead(
    *, subject: str, name: str, email: str, settings: Any | None = None
) -> bool | None:
    """LLM verdict: is this inbound message a genuine business enquiry?

    Returns ``True`` (lead), ``False`` (not a lead), or ``None`` when no provider
    is configured or the call fails — callers treat ``None`` as skip.
    """
    from app.services.crm_ai_service import get_provider
    from app.services.llm.provider import LLMRequest

    settings = settings or get_settings()
    provider, models = get_provider(settings)
    if provider is None or not models:
        return None

    user_msg = (
        f"From: {name} <{email}>\n"
        f"Subject: {subject}\n\n"
        "Is this a genuine business enquiry or sales lead? Answer YES or NO."
    )
    for model in models:
        req = LLMRequest(
            messages=[
                {"role": "system", "content": _CLASSIFY_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            model=model,
            temperature=0.0,
            max_tokens=4,
        )
        try:
            resp = await provider.complete(req)
        except Exception:  # noqa: BLE001 — never let triage break the scan
            continue
        verdict = (resp.content or "").strip().lower()
        if verdict.startswith("yes"):
            return True
        if verdict.startswith("no"):
            return False
    return None


async def import_inbound_leads_from_mailbox(
    session: AsyncSession,
    *,
    mailbox_id: uuid.UUID,
    auto_enroll: bool = False,
) -> dict[str, Any]:
    """Scan a mailbox INBOX and create CRM leads from genuine inbound enquiries.

    When ``auto_enroll`` is set, newly captured leads are enrolled into the
    workspace's default "Auto Outreach" sequence (mirrors the Sent importer).
    Returns a summary dict; never raises.
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
        logger.warning(
            "crm_inbound: decrypt failed mailbox=%s: %s", mailbox_id, exc
        )
        return {"skipped": "decrypt_failed"}

    connection = await _connect_inbox(
        mailbox.imap_host, mailbox.imap_port, mailbox.smtp_username, password
    )
    password = "REDACTED"
    del password

    if connection is None:
        return {"skipped": "no_inbox_or_auth_failed"}

    client, _folder, uidvalidity = connection
    own_email = mailbox.email_address.lower()
    since_str = (datetime.now(UTC) - timedelta(days=_SCAN_DAYS)).strftime("%d-%b-%Y")

    # Incremental scan: if our stored watermark is still valid for this folder
    # (same UIDVALIDITY), only look at UIDs past the last one we processed —
    # each message is fetched and classified exactly once. A folder reset
    # (UIDVALIDITY changed) or first run falls back to the date-bounded window.
    last_uid = mailbox.last_inbound_capture_uid or 0
    incremental = bool(
        last_uid
        and uidvalidity is not None
        and mailbox.last_inbound_uidvalidity == uidvalidity
    )

    # Exclusion sets: warmup peer network (the moat) + this workspace's mailboxes.
    peer_emails: set[str] = {
        row[0].lower()
        for row in (await session.execute(select(PeerInbox.email_address))).all()
    }
    own_mailboxes: set[str] = {
        row[0].lower()
        for row in (
            await session.execute(
                select(Mailbox.email_address).where(
                    Mailbox.workspace_id == mailbox.workspace_id
                )
            )
        ).all()
    }

    # Candidate enquiries: email -> (display_name, subject).
    candidates: dict[str, tuple[str, str]] = {}
    max_uid = last_uid
    try:
        if incremental:
            resp = await client.uid_search("UID", f"{last_uid + 1}:*")
        else:
            resp = await client.uid_search("SINCE", since_str)
        if resp.result != "OK":
            return {"skipped": "imap_search_failed"}

        raw_uids: list[int] = []
        for line in resp.lines:
            for tok in line.decode(errors="replace").split():
                if tok.isdigit():
                    raw_uids.append(int(tok))
        # `UID n:*` always returns at least the last message even when its UID
        # is < n — filter to genuinely new UIDs so we don't re-scan the tail.
        if incremental:
            raw_uids = [u for u in raw_uids if u > last_uid]
        raw_uids = sorted(set(raw_uids))[-_SCAN_LIMIT:]

        for uid in raw_uids:
            max_uid = max(max_uid, uid)
            fetch = await client.uid("fetch", str(uid), _FETCH_FIELDS)
            if fetch.result != "OK":
                continue
            headers = _parse_headers(fetch.lines)

            # Rule stage: drop automated / bulk mail outright.
            if headers.get("list-unsubscribe"):
                continue
            # RFC 3834: any Auto-Submitted other than "no" means machine-generated.
            auto_submitted = headers.get("auto-submitted", "no").lower()
            if auto_submitted and auto_submitted != "no":
                continue
            if headers.get("precedence", "").lower() in ("bulk", "list", "junk"):
                continue

            name, addr = email.utils.parseaddr(headers.get("from", ""))
            addr = addr.lower().strip()
            if not addr or "@" not in addr:
                continue
            if addr == own_email or addr in own_mailboxes:
                continue
            if addr in peer_emails:
                continue
            local = addr.split("@", 1)[0]
            if _AUTOMATED_LOCALPART.match(local):
                continue
            if addr not in candidates:
                candidates[addr] = (
                    name.strip() or addr.split("@")[0],
                    headers.get("subject", ""),
                )
    finally:
        with contextlib.suppress(Exception):
            await client.logout()

    # Advance the watermark so the next run starts past everything we just saw,
    # even if none of it became a lead. Persisted up front so a later failure
    # can't make us re-classify the same messages.
    if uidvalidity is not None and max_uid > last_uid:
        mailbox.last_inbound_capture_uid = max_uid
        mailbox.last_inbound_uidvalidity = uidvalidity
        await session.commit()

    if not candidates:
        return {"imported": 0, "found": 0}

    # Dedup against existing CRM leads in this workspace.
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
    existing_count = int(
        (
            await session.execute(
                select(func.count(CrmLead.id)).where(
                    CrmLead.workspace_id == mailbox.workspace_id
                )
            )
        ).scalar_one()
    )

    # Find or create the inbound-capture campaign for this mailbox.
    campaign_name = f"Inbox Capture — {own_email}"
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
            description=f"Inbound enquiries auto-captured from {own_email} INBOX.",
            status=CrmCampaignStatus.active,
        )
        session.add(campaign)
        await session.flush()

    settings = get_settings()
    cap = crm_lead_cap(plan_name)
    now = datetime.now(UTC)
    imported = 0
    classified = 0
    new_lead_ids: list[uuid.UUID] = []
    for addr, (name, subject) in candidates.items():
        if cap is not None and (existing_count + imported) >= cap:
            break
        if addr in existing_emails:
            continue

        verdict = await classify_inbound_lead(
            subject=subject, name=name, email=addr, settings=settings
        )
        classified += 1
        if verdict is not True:  # None (no provider/error) or False -> skip
            continue

        lead = CrmLead(
            workspace_id=mailbox.workspace_id,
            campaign_id=campaign.id,
            name=name,
            email=addr,
            stage=CrmLeadStage.new,
            source="inbox_capture",
            tags=["inbound", "auto-captured"],
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
                body=f'Inbound enquiry captured from {own_email} INBOX — "{subject}"',
                actor_email=own_email,
            )
        )
        imported += 1

    if imported:
        await session.commit()

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
        except Exception:  # noqa: BLE001 — import already committed; never raise
            logger.exception(
                "crm_inbound auto-enroll failed mailbox=%s workspace=%s",
                mailbox_id,
                mailbox.workspace_id,
            )

    logger.info(
        "crm_inbound mailbox=%s workspace=%s plan=%s found=%s classified=%s "
        "imported=%s enrolled=%s",
        mailbox_id,
        mailbox.workspace_id,
        plan_name,
        len(candidates),
        classified,
        imported,
        enrolled,
    )
    return {
        "imported": imported,
        "found": len(candidates),
        "campaign": campaign_name,
        "enrolled": enrolled,
    }
