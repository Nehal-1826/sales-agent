"""DNS (SPF / DKIM / DMARC) validation routes.

Two endpoints on the same router, both under ``/api/workspace``:

* ``POST /api/workspace/dns/check`` - free-form: check any domain or email.
* ``POST /api/workspace/mailboxes/{mailbox_id}/dns-check`` - workspace-scoped;
  persists results on the mailbox row. This lives here (not in mailboxes.py)
  to avoid touching the parallel-owned mailbox CRUD file.
"""
from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models.mailboxes import Mailbox
from app.db.models.users import User
from app.db.session import get_db
from app.schemas.dns import (
    DkimResult,
    DmarcResult,
    DnsCheckRequest,
    DnsCheckResponse,
    DnsFixes,
    DnsSummary,
    SpfResult,
)
from app.services import dns_validator, notification_inbox_service
from app.services.dns_validator import (
    DKIM_FIX,
    DMARC_FIX,
    SPF_FIX,
    FullDnsResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace", tags=["dns"])


def _to_response(result: FullDnsResult) -> DnsCheckResponse:
    spf = SpfResult(
        valid=result.spf.valid,
        record=result.spf.record,
        errors=list(result.spf.errors),
        warnings=list(result.spf.warnings),
    )
    dkim = DkimResult(
        valid=result.dkim.valid,
        selector=result.dkim.selector,
        record=result.dkim.record,
        errors=list(result.dkim.errors),
    )
    dmarc = DmarcResult(
        valid=result.dmarc.valid,
        record=result.dmarc.record,
        policy=result.dmarc.policy,  # type: ignore[arg-type]
        errors=list(result.dmarc.errors),
        warnings=list(result.dmarc.warnings),
    )
    passing = sum(1 for r in (spf, dkim, dmarc) if r.valid)
    summary = DnsSummary(passing=passing, total=3, overall_pass=passing == 3)
    fixes = DnsFixes(
        spf=[] if spf.valid else [SPF_FIX],
        dkim=[] if dkim.valid else [DKIM_FIX],
        dmarc=[] if dmarc.valid else [DMARC_FIX],
    )
    return DnsCheckResponse(
        domain=result.domain,
        spf=spf,
        dkim=dkim,
        dmarc=dmarc,
        summary=summary,
        checked_at=result.checked_at,
        fixes=fixes,
    )


@router.post("/dns/check", response_model=DnsCheckResponse)
async def dns_check(
    payload: DnsCheckRequest,
    _user: Annotated[User, Depends(get_current_user)],
) -> DnsCheckResponse:
    """Free-form DNS check.

    Provide either ``domain`` or ``email`` (email wins if both given - we
    extract its domain). ``dkim_selector`` is a best-effort hint; when it
    fails we fall back through a list of common selectors.
    """
    raw = payload.email if payload.email else payload.domain
    assert raw is not None  # validator enforces presence
    domain = dns_validator.extract_domain(raw)
    logger.info("dns_check request domain=%s", domain)
    result = await dns_validator.check_domain(domain, payload.dkim_selector)
    return _to_response(result)


@router.post(
    "/mailboxes/{mailbox_id}/dns-check",
    response_model=DnsCheckResponse,
)
async def mailbox_dns_check(
    mailbox_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> DnsCheckResponse:
    """Run a DNS check for a mailbox and persist results to its row.

    Note: DKIM selector guessing is best-effort; we try the common selectors
    used by Google Workspace, Outlook/M365, Mailchimp, etc. If your provider
    uses a custom selector, use the generic /dns/check endpoint instead.
    """
    stmt = select(Mailbox).where(
        Mailbox.id == mailbox_id, Mailbox.workspace_id == user.workspace_id
    )
    mailbox = (await session.execute(stmt)).scalar_one_or_none()
    if mailbox is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found"
        )

    domain = dns_validator.extract_domain(mailbox.email_address)
    logger.info(
        "mailbox_dns_check mailbox_id=%s domain=%s", mailbox_id, domain
    )
    result = await dns_validator.check_domain(domain)

    mailbox.spf_valid = result.spf.valid
    mailbox.dkim_valid = result.dkim.valid
    mailbox.dmarc_valid = result.dmarc.valid
    await session.commit()

    # Notify user if DNS is properly configured
    all_valid = result.spf.valid and result.dkim.valid and result.dmarc.valid
    if all_valid:
        try:
            await notification_inbox_service.notify_user(
                session,
                user_id=user.id,
                kind="mailbox_verified",
                title="Mailbox verified",
                body=f"Great news! SPF, DKIM, and DMARC are all properly configured for {mailbox.email_address}.",
                payload={"mailbox_id": str(mailbox.id)},
                commit=False,
            )
        except Exception:
            logger.warning("Failed to send mailbox_verified notification", exc_info=True)

    return _to_response(result)
