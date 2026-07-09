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
    }


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


def build_variables(*, lead: Any, mailbox: Any | None = None) -> dict[str, str]:
    """The substitution map for one lead/mailbox pair."""
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
    }


def render_personalization(
    text: str, *, lead: Any, mailbox: Any | None = None
) -> str:
    """Replace known ``{{var}}`` tokens; strip any unrecognised ones.

    Pure string→string; safe to call on both subject and body. Never raises on
    an unknown variable — it's removed so the recipient never sees raw braces.
    """
    variables = build_variables(lead=lead, mailbox=mailbox)

    def _sub(match: re.Match[str]) -> str:
        key = match.group(1).lower()
        return variables.get(key, "")

    return _VAR_RE.sub(_sub, text)
