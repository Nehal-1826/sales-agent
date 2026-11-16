"""CRM email templates — built-in library, custom CRUD, and personalization.

Two kinds of template feed the sequence-step editor's picker:

* **Built-in** — a read-only library defined in :data:`BUILTIN_TEMPLATES`
  (ids like ``builtin:intro``). Never stored in the DB; merged into the list
  response so every workspace sees them.
* **Custom** — per-workspace rows in ``crm_email_templates`` the user creates
  or uploads (a ``.html`` / ``.txt`` file's contents become the body, done
  client-side; the API just takes a body string).

Picking a template copies its subject/body into a step — the step then owns the
text, so editing/deleting a template never rewrites a live sequence.

``render_personalization`` fills ``{{first_name}}`` style variables per-lead at
send time. Known variables are substituted; any unrecognised ``{{token}}`` is
stripped so prospects never see raw braces.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.crm_email_templates import CrmEmailTemplate

# --------------------------------------------------------------------------- #
# Built-in library                                                            #
# --------------------------------------------------------------------------- #

BUILTIN_PREFIX = "builtin:"

# Ordered: the first three are what the auto-outreach default sequence seeds
# (Intro → Follow-up → Break-up), so keep them first and stable.
BUILTIN_TEMPLATES: list[dict[str, str]] = [
    {
        "id": f"{BUILTIN_PREFIX}intro",
        "name": "Cold intro",
        "category": "Outreach",
        "subject": "Quick question, {{first_name}}",
        "body": (
            "Hi {{first_name}},\n\n"
            "I came across {{company}} and wanted to reach out. We help teams "
            "land more replies from their cold email by warming up their "
            "mailboxes and keeping them out of spam.\n\n"
            "Worth a quick chat to see if it's a fit?\n\n"
            "Best,\n{{sender_name}}"
        ),
    },
    {
        "id": f"{BUILTIN_PREFIX}followup",
        "name": "Follow-up",
        "category": "Outreach",
        "subject": "Re: Quick question, {{first_name}}",
        "body": (
            "Hi {{first_name}},\n\n"
            "Floating this back to the top of your inbox in case it slipped by. "
            "Happy to share a couple of concrete numbers on what better "
            "deliverability did for teams like {{company}}.\n\n"
            "Open to a 10-minute call this week?\n\n"
            "Best,\n{{sender_name}}"
        ),
    },
    {
        "id": f"{BUILTIN_PREFIX}breakup",
        "name": "Break-up",
        "category": "Outreach",
        "subject": "Should I close the loop?",
        "body": (
            "Hi {{first_name}},\n\n"
            "I haven't heard back, so I'll assume the timing isn't right for "
            "{{company}} right now — no worries at all.\n\n"
            "If things change and inbox placement ever becomes a priority, "
            "just reply here and I'll pick it right back up.\n\n"
            "All the best,\n{{sender_name}}"
        ),
    },
    {
        "id": f"{BUILTIN_PREFIX}value_add",
        "name": "Value add",
        "category": "Outreach",
        "subject": "A deliverability idea for {{company}}",
        "body": (
            "Hi {{first_name}},\n\n"
            "One thing most teams miss: sending from a brand-new domain with no "
            "warmup tanks your open rate for weeks. We fix that automatically in "
            "the background.\n\n"
            "Want me to send over a short before/after example?\n\n"
            "Best,\n{{sender_name}}"
        ),
    },
    {
        "id": f"{BUILTIN_PREFIX}meeting",
        "name": "Meeting request",
        "category": "Outreach",
        "subject": "15 minutes, {{first_name}}?",
        "body": (
            "Hi {{first_name}},\n\n"
            "Would you be open to a quick 15-minute call to walk through how we "
            "could lift {{company}}'s inbox placement? I can work around your "
            "schedule.\n\n"
            "Just reply with a time that suits and I'll send an invite.\n\n"
            "Best,\n{{sender_name}}"
        ),
    },
    {
        "id": f"{BUILTIN_PREFIX}reengage",
        "name": "Re-engage",
        "category": "Outreach",
        "subject": "Still worth a look, {{first_name}}?",
        "body": (
            "Hi {{first_name}},\n\n"
            "It's been a while since we last spoke. A lot has changed on our "
            "side and I think it's even more relevant for {{company}} now.\n\n"
            "Worth picking the conversation back up?\n\n"
            "Best,\n{{sender_name}}"
        ),
    },
]

# Slugs of the built-ins the auto-outreach default sequence is seeded from,
# with the delay (days) before each fires. Order matters.
DEFAULT_SEQUENCE_STEPS: list[tuple[str, int]] = [
    (f"{BUILTIN_PREFIX}intro", 0),
    (f"{BUILTIN_PREFIX}followup", 3),
    (f"{BUILTIN_PREFIX}breakup", 5),
]

_BUILTIN_BY_ID: dict[str, dict[str, str]] = {t["id"]: t for t in BUILTIN_TEMPLATES}


def builtin_by_id(template_id: str) -> dict[str, str] | None:
    return _BUILTIN_BY_ID.get(template_id)


# --------------------------------------------------------------------------- #
# Serialisation                                                               #
# --------------------------------------------------------------------------- #


def _builtin_to_dict(t: dict[str, str]) -> dict[str, Any]:
    # Built-ins are read-only and never carry a logo.
    return {
        "id": t["id"],
        "name": t["name"],
        "subject": t["subject"],
        "body": t["body"],
        "category": t.get("category"),
        "is_builtin": True,
        "created_at": None,
    }


def _custom_to_dict(t: CrmEmailTemplate) -> dict[str, Any]:
    return {
        "id": str(t.id),
        "name": t.name,
        "subject": t.subject,
        "body": t.body,
        "category": t.category,
        "is_builtin": False,
        "created_at": t.created_at,
        "has_logo": bool(t.logo_image),
        "logo_url": (
            _logo_url_for(t.id) if t.logo_image else None
        ),
    }


def _logo_url_for(template_id: uuid.UUID) -> str:
    from app.config import get_settings

    return logo_public_url(template_id, base_url=get_settings().public_base_url)


# --------------------------------------------------------------------------- #
# CRUD (custom templates only; built-ins are read-only)                        #
# --------------------------------------------------------------------------- #


async def list_templates(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Built-in library first, then the workspace's custom templates (newest)."""
    rows = (
        await session.execute(
            select(CrmEmailTemplate)
            .where(CrmEmailTemplate.workspace_id == workspace_id)
            .order_by(CrmEmailTemplate.created_at.desc())
        )
    ).scalars().all()
    return [_builtin_to_dict(t) for t in BUILTIN_TEMPLATES] + [
        _custom_to_dict(t) for t in rows
    ]


async def create_template(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    name: str,
    subject: str,
    body: str,
    category: str | None = None,
) -> dict[str, Any]:
    tpl = CrmEmailTemplate(
        workspace_id=workspace_id,
        name=name,
        subject=subject,
        body=body,
        category=category,
    )
    session.add(tpl)
    await session.commit()
    await session.refresh(tpl)
    return _custom_to_dict(tpl)


async def _get_custom_or_none(
    session: AsyncSession, *, workspace_id: uuid.UUID, template_id: uuid.UUID
) -> CrmEmailTemplate | None:
    return (
        await session.execute(
            select(CrmEmailTemplate).where(
                CrmEmailTemplate.id == template_id,
                CrmEmailTemplate.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()


async def update_template(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    fields: dict[str, Any],
) -> dict[str, Any] | None:
    tpl = await _get_custom_or_none(
        session, workspace_id=workspace_id, template_id=template_id
    )
    if tpl is None:
        return None
    for key in ("name", "subject", "body", "category"):
        if key in fields and fields[key] is not None:
            setattr(tpl, key, fields[key])
    await session.commit()
    await session.refresh(tpl)
    return _custom_to_dict(tpl)


async def delete_template(
    session: AsyncSession, *, workspace_id: uuid.UUID, template_id: uuid.UUID
) -> bool:
    tpl = await _get_custom_or_none(
        session, workspace_id=workspace_id, template_id=template_id
    )
    if tpl is None:
        return False
    await session.delete(tpl)
    await session.commit()
    return True


# --------------------------------------------------------------------------- #
# Personalization                                                             #
# --------------------------------------------------------------------------- #

_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def _first_name(name: str | None, email: str | None) -> str:
    if name and name.strip():
        return name.strip().split()[0]
    if email and "@" in email:
        local = email.split("@", 1)[0]
        # split on common separators so "jane.doe" → "Jane"
        token = re.split(r"[._\-+]", local)[0]
        return token.capitalize() if token else "there"
    return "there"


def _sender_name(mailbox: Any | None) -> str:
    """Best display name for the sender from the connected mailbox."""
    if mailbox is None:
        return "the team"
    addr = getattr(mailbox, "email_address", "") or ""
    if "@" in addr:
        local = addr.split("@", 1)[0]
        token = re.split(r"[._\-+]", local)[0]
        return token.capitalize() if token else "the team"
    return "the team"


def build_variables(
    *, lead: Any, mailbox: Any | None = None, template: Any | None = None
) -> dict[str, str]:
    """The substitution map for one lead/mailbox pair.

    ``template`` is optional and only supplies ``{{logo}}`` — an <img> tag
    pointing at the template's public logo URL, or an empty string when the
    template has no logo. Absent template ⇒ ``{{logo}}`` resolves to "" and is
    stripped, exactly like any other unset variable.
    """
    name = getattr(lead, "name", None)
    email = getattr(lead, "email", None)
    company = getattr(lead, "company", None)
    title = getattr(lead, "title", None)
    first = _first_name(name, email)
    return {
        "first_name": first,
        "name": (name.strip() if name and name.strip() else first),
        "company": (company.strip() if company and company.strip() else "your company"),
        "title": (title.strip() if title and title.strip() else ""),
        "sender_name": _sender_name(mailbox),
        "email": email or "",
        "logo": _logo_img_tag(template),
    }


def _logo_img_tag(template: Any | None) -> str:
    """Render the ``{{logo}}`` substitution for ``template``.

    Width is capped inline because many mail clients ignore <style> blocks, and
    an unconstrained logo can render at full pixel size in Outlook.
    """
    if template is None or not getattr(template, "logo_image", None):
        return ""
    template_id = getattr(template, "id", None)
    if template_id is None:
        return ""
    from app.config import get_settings

    url = logo_public_url(template_id, base_url=get_settings().public_base_url)
    return (
        f'<img src="{url}" alt="" '
        'style="max-width:180px;height:auto;border:0;outline:none;text-decoration:none;" />'
    )


def render_personalization(
    text: str, *, lead: Any, mailbox: Any | None = None, template: Any | None = None
) -> str:
    """Replace known ``{{var}}`` tokens; strip any unrecognised ones.

    Pure string→string; safe to call on both subject and body. Never raises on
    an unknown variable — it's removed so the recipient never sees raw braces.
    """
    variables = build_variables(lead=lead, mailbox=mailbox, template=template)

    def _sub(match: re.Match[str]) -> str:
        key = match.group(1).lower()
        return variables.get(key, "")

    return _VAR_RE.sub(_sub, text)


# --------------------------------------------------------------------------- #
# Template logo                                                                #
# --------------------------------------------------------------------------- #

ALLOWED_LOGO_MIME = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_LOGO_BYTES = 512 * 1024


def validate_logo(*, content_type: str | None, data: bytes) -> str:
    """Validate an uploaded template logo. Returns the normalised MIME type.

    Mirrors :func:`app.services.avatar_service.validate_avatar`, with GIF also
    allowed because logos in marketing mail are commonly animated.
    """
    from fastapi import HTTPException, status

    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_LOGO_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Logo must be a PNG, JPEG, WebP, or GIF image",
        )
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Logo exceeds the 512KB size limit",
        )
    return mime


async def set_template_logo(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    template_id: uuid.UUID,
    data: bytes,
    mime: str,
) -> CrmEmailTemplate:
    """Attach logo bytes to a custom template (caller commits)."""
    tpl = await _get_custom_or_none(session, workspace_id=workspace_id, template_id=template_id)
    if tpl is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    tpl.logo_image = data
    tpl.logo_mime = mime
    return tpl


async def clear_template_logo(
    session: AsyncSession, *, workspace_id: uuid.UUID, template_id: uuid.UUID
) -> CrmEmailTemplate:
    """Remove the logo from a custom template (caller commits)."""
    tpl = await _get_custom_or_none(session, workspace_id=workspace_id, template_id=template_id)
    if tpl is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    tpl.logo_image = None
    tpl.logo_mime = None
    return tpl


def logo_public_url(template_id: uuid.UUID | str, *, base_url: str) -> str:
    """Absolute URL a recipient's mail client can fetch the logo from.

    Must be absolute and unauthenticated: the image is loaded by Gmail /
    Outlook on the recipient's behalf, with no session and no relative base.
    """
    return f"{base_url.rstrip('/')}/api/crm/public/templates/{template_id}/logo"


# --------------------------------------------------------------------------- #
# .eml import                                                                  #
# --------------------------------------------------------------------------- #

MAX_EML_BYTES = 2 * 1024 * 1024


def parse_eml(data: bytes) -> dict[str, str]:
    """Extract ``{"subject", "body"}` from a raw .eml file.

    Why this exists: designers build campaign emails in a mail client or an
    email builder and export .eml. Re-typing that into the template form loses
    the markup, so we read it directly.

    Prefers the text/html part and falls back to text/plain, matching how the
    mail would actually render. Attachments are ignored — a template is markup,
    not a payload. Decoding never raises: a mislabelled charset falls back to
    utf-8 with replacement so a slightly malformed export still imports.
    """
    from email import message_from_bytes, policy

    from fastapi import HTTPException, status

    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_EML_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="File exceeds the 2MB limit",
        )

    try:
        msg = message_from_bytes(data, policy=policy.default)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400, detail="Could not parse this file as an email (.eml)"
        ) from exc

    subject = (msg.get("Subject") or "").strip()

    def _decode(part) -> str:
        payload = part.get_payload(decode=True)
        if payload is None:
            return ""
        charset = part.get_content_charset() or "utf-8"
        try:
            return payload.decode(charset, errors="replace")
        except (LookupError, UnicodeDecodeError):
            return payload.decode("utf-8", errors="replace")

    html_part = ""
    text_part = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_maintype() == "multipart":
                continue
            # Skip anything the sender marked as an attachment.
            if (part.get_content_disposition() or "") == "attachment":
                continue
            ctype = part.get_content_type()
            if ctype == "text/html" and not html_part:
                html_part = _decode(part)
            elif ctype == "text/plain" and not text_part:
                text_part = _decode(part)
    else:
        if msg.get_content_type() == "text/html":
            html_part = _decode(msg)
        else:
            text_part = _decode(msg)

    body = (html_part or text_part).strip()
    if not body:
        raise HTTPException(
            status_code=400,
            detail="No readable text or HTML body found in this .eml file",
        )
    return {"subject": subject, "body": body}
