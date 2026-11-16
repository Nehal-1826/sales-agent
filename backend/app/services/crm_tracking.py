"""CRM email open / reply tracking.

Two engagement signals feed the per-campaign analytics (``open_rate`` /
``reply_rate`` in :func:`crm_service.get_campaign_analytics`):

* **Opens** — every sequence step is sent as HTML with a 1x1 tracking pixel
  pointing at :pyfunc:`open_pixel_url`. When the recipient's mail client loads
  the image, the public ``GET /api/crm/track/open/{token}.gif`` route decodes
  the signed token and records a deduped ``email_opened`` activity.
* **Replies** — every sequence step carries a deterministic Message-Id
  (:pyfunc:`sequence_message_id`). A reply lands in the sending mailbox with
  that id in its ``In-Reply-To`` / ``References`` header; the reply-scan task
  matches it back to the enrollment and records a deduped ``email_replied``.

Tokens are HMAC-signed with ``settings.jwt_secret`` so a recipient can't forge
an open for an arbitrary lead. Dedup keeps opens ≤ sends and replies ≤ sends so
the rates can never exceed 100%.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_leads import CrmLead
from app.db.models.crm_sequence_enrollments import CrmSequenceEnrollment

logger = logging.getLogger(__name__)

# A 43-byte fully transparent GIF89a — the smallest valid image we can return
# from the open-pixel endpoint.
TRANSPARENT_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01"
    b"\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

# Separator between the token payload and its signature. Deliberately NOT a
# base64url character (which is ``[A-Za-z0-9_-]``) and not ``.`` so the token
# stays a single dot-free path segment — the route appends a literal ``.gif``.
_SEP = "~"


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload_b64: str) -> str:
    secret = get_settings().jwt_secret.encode()
    digest = hmac.new(secret, payload_b64.encode(), hashlib.sha256).digest()
    return _b64encode(digest)


# --------------------------------------------------------------------------- #
# Open-pixel tokens                                                            #
# --------------------------------------------------------------------------- #


def make_open_token(lead_id: uuid.UUID, enrollment_id: uuid.UUID, step: int) -> str:
    """Return a signed token encoding ``lead_id | enrollment_id | step``."""
    payload = f"{lead_id}|{enrollment_id}|{step}".encode()
    payload_b64 = _b64encode(payload)
    return f"{payload_b64}{_SEP}{_sign(payload_b64)}"


def parse_open_token(token: str) -> dict | None:
    """Verify the HMAC and return ``{lead_id, enrollment_id, step}`` or ``None``.

    ``None`` covers every tamper / malformed case so the caller can return the
    pixel without leaking which failure occurred.
    """
    if not token or _SEP not in token:
        return None
    payload_b64, _, sig = token.partition(_SEP)
    if not hmac.compare_digest(sig, _sign(payload_b64)):
        return None
    try:
        raw = _b64decode(payload_b64).decode()
        lead_s, enr_s, step_s = raw.split("|")
        return {
            "lead_id": uuid.UUID(lead_s),
            "enrollment_id": uuid.UUID(enr_s),
            "step": int(step_s),
        }
    except (ValueError, UnicodeDecodeError):
        return None


def open_pixel_url(token: str) -> str:
    """Absolute URL of the open-tracking pixel for ``token``."""
    base = get_settings().public_base_url
    return f"{base}/api/crm/track/open/{token}.gif"


def build_tracked_html(body_text: str, pixel_url: str) -> str:
    """Wrap a plain-text sequence body in minimal HTML with the open pixel.

    The body is HTML-escaped (newlines → ``<br>``) so prospect-facing copy can't
    inject markup; the pixel is appended hidden at the end.
    """
    import html as _html

    safe = _html.escape(body_text or "").replace("\n", "<br>")
    return (
        "<html><body>"
        f"{safe}"
        f'<img src="{pixel_url}" width="1" height="1" '
        'style="display:none;max-height:0;overflow:hidden" alt="" />'
        "</body></html>"
    )


def inject_open_pixel(html: str, pixel_url: str) -> str:
    """Append the hidden open-tracking pixel to an already-HTML body.

    Unlike :func:`build_tracked_html`, the body is NOT escaped — it is a
    designer/HTML template that should render as authored. The pixel is inserted
    just before ``</body>`` when present, else appended at the end.
    """
    pixel = (
        f'<img src="{pixel_url}" width="1" height="1" '
        'style="display:none;max-height:0;overflow:hidden" alt="" />'
    )
    body = html or ""
    idx = body.lower().rfind("</body>")
    if idx != -1:
        return body[:idx] + pixel + body[idx:]
    return body + pixel


# --------------------------------------------------------------------------- #
# Reply correlation (Message-Id <-> enrollment)                                #
# --------------------------------------------------------------------------- #


def sequence_message_id(enrollment_id: uuid.UUID, step: int) -> str:
    """Deterministic RFC822 Message-Id stamped on a sequence send.

    A reply quotes this in ``In-Reply-To`` / ``References``; the reply-scan
    parses it back to ``(enrollment_id, step)``.
    """
    return f"<crmseq.{enrollment_id}.{step}@warmpulse.app>"


_SEQ_MID_RE = re.compile(r"crmseq\.([0-9a-fA-F-]{36})\.(\d+)")


def parse_sequence_message_id(header_value: str | None) -> tuple[uuid.UUID, int] | None:
    """Extract ``(enrollment_id, step)`` from an In-Reply-To/References header."""
    if not header_value:
        return None
    m = _SEQ_MID_RE.search(header_value)
    if not m:
        return None
    try:
        return uuid.UUID(m.group(1)), int(m.group(2))
    except ValueError:
        return None


# --------------------------------------------------------------------------- #
# Activity recording (idempotent)                                             #
# --------------------------------------------------------------------------- #


def _open_marker(enrollment_id: uuid.UUID, step: int) -> str:
    return f"[seq-open:{enrollment_id}:{step}]"


def _reply_marker(enrollment_id: uuid.UUID) -> str:
    return f"[seq-reply:{enrollment_id}]"


async def record_open(
    session: AsyncSession,
    *,
    lead_id: uuid.UUID,
    enrollment_id: uuid.UUID,
    step: int,
) -> str:
    """Idempotently record an ``email_opened`` activity for one sequence send.

    Returns ``"recorded"`` / ``"duplicate"`` / ``"unknown_lead"``. Dedup is per
    (lead, enrollment, step) via a body marker, so a pixel that fires many times
    counts once and ``open_rate`` stays ≤ 100%.
    """
    lead = await session.get(CrmLead, lead_id)
    if lead is None:
        return "unknown_lead"
    marker = _open_marker(enrollment_id, step)
    existing = (
        await session.execute(
            select(CrmLeadActivity.id)
            .where(
                CrmLeadActivity.lead_id == lead_id,
                CrmLeadActivity.kind == CrmActivityKind.email_opened,
                CrmLeadActivity.body.like(f"%{marker}%"),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return "duplicate"
    session.add(
        CrmLeadActivity(
            workspace_id=lead.workspace_id,
            lead_id=lead_id,
            kind=CrmActivityKind.email_opened,
            body=f"Opened a sequence email {marker}",
            actor_email=None,
        )
    )
    lead.last_activity_at = datetime.now(UTC)
    await session.commit()
    return "recorded"


async def record_reply(
    session: AsyncSession,
    *,
    enrollment_id: uuid.UUID,
    step: int,
) -> str:
    """Idempotently record an ``email_replied`` activity for an enrollment.

    Returns ``"recorded"`` / ``"duplicate"`` / ``"unknown_enrollment"`` /
    ``"unknown_lead"``. Dedup is per (lead, enrollment) — a prospect replying
    once is the signal; replies to multiple steps in one thread don't inflate
    ``reply_rate``.
    """
    enr = await session.get(CrmSequenceEnrollment, enrollment_id)
    if enr is None:
        return "unknown_enrollment"
    lead = await session.get(CrmLead, enr.lead_id)
    if lead is None:
        return "unknown_lead"
    marker = _reply_marker(enrollment_id)
    existing = (
        await session.execute(
            select(CrmLeadActivity.id)
            .where(
                CrmLeadActivity.lead_id == lead.id,
                CrmLeadActivity.kind == CrmActivityKind.email_replied,
                CrmLeadActivity.body.like(f"%{marker}%"),
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return "duplicate"
    session.add(
        CrmLeadActivity(
            workspace_id=lead.workspace_id,
            lead_id=lead.id,
            kind=CrmActivityKind.email_replied,
            body=f"Prospect replied to a sequence email (step {step}) {marker}",
            actor_email=lead.email,
        )
    )
    lead.last_activity_at = datetime.now(UTC)
    await session.commit()
    return "recorded"
