"""Agency-tier custom domain service.

Workflow:
    start()   → mints a verification_code, stores a pending row
    verify()  → resolves DNS, flips status to verified | failed
    remove()  → deletes the row

TLS is provisioned out-of-band by the reverse proxy once verified.
"""
from __future__ import annotations

import logging
import re
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.workspace_custom_domains import WorkspaceCustomDomain

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Constants                                                                    #
# --------------------------------------------------------------------------- #

CNAME_TARGET = "app.warmpulse.io."
TXT_PREFIX = "_warmpulse-verify."
TXT_VALUE_PREFIX = "warmpulse-verify-"

_AGENCY_PLAN_SLUGS = {"agency", "enterprise"}

# Per spec §"Domain validation rules"
_DOMAIN_RE = re.compile(
    r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$"
)
_IPV4_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")

_RESERVED_EXACT = {"warmpulse.io", "localhost"}


# --------------------------------------------------------------------------- #
# Exceptions                                                                   #
# --------------------------------------------------------------------------- #


class CustomDomainNotAllowedError(Exception):
    """Workspace plan does not include custom domains."""


class InvalidDomainError(Exception):
    """Domain string failed validation."""


class DomainAlreadyTakenError(Exception):
    """Another workspace already registered this domain."""


class CustomDomainNotFoundError(Exception):
    """No custom domain row for this workspace."""


# --------------------------------------------------------------------------- #
# Plan-tier gate                                                               #
# --------------------------------------------------------------------------- #


async def _require_agency_or_enterprise(
    session: AsyncSession, workspace_id: uuid.UUID
) -> None:
    from app.db.models.plans import Plan
    from app.db.models.users import User

    stmt = (
        select(Plan.name)
        .join(User, User.plan_id == Plan.id)
        .where(User.workspace_id == workspace_id)
    )
    names = [
        (n or "").strip().lower()
        for n in (await session.execute(stmt)).scalars().all()
    ]
    if not any(n in _AGENCY_PLAN_SLUGS for n in names):
        raise CustomDomainNotAllowedError(
            "Custom domains require the Agency plan."
        )


# --------------------------------------------------------------------------- #
# Domain validation                                                            #
# --------------------------------------------------------------------------- #


def _validate_domain(raw: str) -> str:
    if not raw or not isinstance(raw, str):
        raise InvalidDomainError("Domain is required")
    domain = raw.strip().lower()
    if not domain:
        raise InvalidDomainError("Domain is required")
    if len(domain) > 253:
        raise InvalidDomainError("Domain exceeds 253 characters")
    if "*" in domain:
        raise InvalidDomainError("Wildcard domains are not supported")
    if _IPV4_RE.match(domain):
        raise InvalidDomainError("IP addresses are not allowed")
    if not _DOMAIN_RE.match(domain):
        raise InvalidDomainError(
            "Domain must be a valid DNS hostname (lowercase, labels separated by dots)"
        )
    dot_count = domain.count(".")
    if dot_count < 1:
        raise InvalidDomainError("Domain must have at least one dot (no bare TLDs)")
    if dot_count > 5:
        raise InvalidDomainError("Domain has too many labels")
    if domain in _RESERVED_EXACT:
        raise InvalidDomainError(f"'{domain}' is a reserved domain")
    if domain.endswith(".warmpulse.io") or domain.endswith(".local"):
        raise InvalidDomainError(f"'{domain}' is a reserved domain")
    if domain.endswith(".test") or domain.endswith(".example"):
        raise InvalidDomainError(f"'{domain}' is a reserved TLD")
    return domain


# --------------------------------------------------------------------------- #
# Public API                                                                   #
# --------------------------------------------------------------------------- #


async def _get_row(
    session: AsyncSession, workspace_id: uuid.UUID
) -> WorkspaceCustomDomain | None:
    stmt = select(WorkspaceCustomDomain).where(
        WorkspaceCustomDomain.workspace_id == workspace_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_status(
    session: AsyncSession, workspace_id: uuid.UUID
) -> WorkspaceCustomDomain | None:
    return await _get_row(session, workspace_id)


async def start(
    session: AsyncSession, workspace_id: uuid.UUID, domain: str
) -> WorkspaceCustomDomain:
    await _require_agency_or_enterprise(session, workspace_id)
    canonical = _validate_domain(domain)

    # Make sure no _other_ workspace owns this domain.
    other_stmt = select(WorkspaceCustomDomain).where(
        WorkspaceCustomDomain.domain == canonical,
        WorkspaceCustomDomain.workspace_id != workspace_id,
    )
    if (await session.execute(other_stmt)).scalar_one_or_none() is not None:
        raise DomainAlreadyTakenError(
            "Domain is already registered to another workspace"
        )

    code = secrets.token_urlsafe(12)[:16]

    row = await _get_row(session, workspace_id)
    try:
        if row is None:
            row = WorkspaceCustomDomain(
                workspace_id=workspace_id,
                domain=canonical,
                verification_code=code,
                status="pending",
            )
            session.add(row)
        else:
            row.domain = canonical
            row.verification_code = code
            row.status = "pending"
            row.verification_method = None
            row.verified_at = None
            row.last_check_at = None
            row.last_check_error = None
        await session.commit()
        await session.refresh(row)
    except IntegrityError as exc:
        await session.rollback()
        raise DomainAlreadyTakenError(
            "Domain is already registered to another workspace"
        ) from exc
    return row


async def remove(session: AsyncSession, workspace_id: uuid.UUID) -> None:
    row = await _get_row(session, workspace_id)
    if row is None:
        return
    await session.delete(row)
    await session.commit()


# --------------------------------------------------------------------------- #
# DNS verification                                                             #
# --------------------------------------------------------------------------- #


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _try_txt(domain: str, code: str) -> bool:
    """Return True if the TXT record at `_warmpulse-verify.{domain}` contains
    the expected token. Re-raises DNS exceptions so the caller can record a
    reason."""
    import dns.asyncresolver

    name = f"{TXT_PREFIX}{domain}"
    expected = f"{TXT_VALUE_PREFIX}{code}"
    answer = await dns.asyncresolver.resolve(name, "TXT", lifetime=5.0)
    for rdata in answer:
        # rdata.strings is tuple[bytes]; join to single string
        parts = []
        for s in getattr(rdata, "strings", []) or []:
            if isinstance(s, bytes):
                parts.append(s.decode("utf-8", errors="replace"))
            else:
                parts.append(str(s))
        joined = "".join(parts) if parts else str(rdata).strip('"')
        if joined == expected:
            return True
    return False


async def _try_cname(domain: str) -> bool:
    import dns.asyncresolver

    answer = await dns.asyncresolver.resolve(domain, "CNAME", lifetime=5.0)
    for rdata in answer:
        target = str(getattr(rdata, "target", rdata)).lower()
        if not target.endswith("."):
            target = target + "."
        if target == CNAME_TARGET:
            return True
    return False


async def verify(session: AsyncSession, workspace_id: uuid.UUID) -> dict:
    row = await _get_row(session, workspace_id)
    if row is None:
        raise CustomDomainNotFoundError("No custom domain registered")

    row.last_check_at = _now()
    domain = row.domain
    code = row.verification_code

    txt_error: str | None = None
    cname_error: str | None = None

    # TXT first.
    try:
        if await _try_txt(domain, code):
            row.verification_method = "txt"
            row.status = "verified"
            row.verified_at = _now()
            row.last_check_error = None
            await session.commit()
            return {
                "verified": True,
                "method": "txt",
                "status": "verified",
                "domain": domain,
            }
    except Exception as exc:  # dns.resolver.* / timeouts / unknowns
        txt_error = f"{type(exc).__name__}: {exc}".strip()

    # CNAME fallback.
    try:
        if await _try_cname(domain):
            row.verification_method = "cname"
            row.status = "verified"
            row.verified_at = _now()
            row.last_check_error = None
            await session.commit()
            return {
                "verified": True,
                "method": "cname",
                "status": "verified",
                "domain": domain,
            }
    except Exception as exc:
        cname_error = f"{type(exc).__name__}: {exc}".strip()

    # Neither path resolved successfully.
    if txt_error or cname_error:
        reason = (
            f"TXT lookup at {TXT_PREFIX}{domain}: {txt_error or 'no match'}. "
            f"CNAME lookup at {domain}: {cname_error or 'no match'}."
        )
    else:
        reason = f"No matching TXT or CNAME record found at {domain}"
    row.status = "failed"
    row.last_check_error = reason[:500]
    await session.commit()
    return {
        "verified": False,
        "status": "failed",
        "reason": reason,
        "domain": domain,
    }
