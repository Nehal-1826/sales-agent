"""Content generator interface + static-template fallback.

Wave 4 will add ``LlmContentGenerator`` (real Claude/Gemini prompts) alongside
this file. The Protocol is the contract; keep it stable.

Modes (mirroring ``ContentMode`` enum on Mailbox):
    A — plain conversational text
    B — HTML-wrapped (single-color header + card shell, neutral signature)
    C — random A/B mix (50/50) per message
    D — plain only; designer-template path (Wave 4 will render a user's
        custom template, for now falls back to A)
"""
from __future__ import annotations

import random
from typing import Protocol

from app.services.warmup.templates import (
    FAKE_COMPANIES,
    FAKE_FIRST_NAMES,
    HTML_SHELL,
    SUBJECT_PREFIXES,
    TEMPLATES,
)


class ContentGenerator(Protocol):
    """Contract for any warmup-thread content source."""

    async def generate_thread_message(
        self,
        mode: str,
        prior_messages: list[str],
        sender_name: str,
        recipient_name: str,
    ) -> dict:
        """Return ``{subject, body_text, is_html}``.

        ``prior_messages`` is the existing thread tail (oldest -> newest);
        generator should decide whether this is a new thread (empty list) or
        a continuation (non-empty) and set the subject prefix accordingly.
        """
        ...


def _pick_company() -> str:
    return random.choice(FAKE_COMPANIES)


def _first_name(full: str | None) -> str:
    """Extract a first-name-ish token. Falls back to a fake name if empty."""
    if not full or not full.strip():
        return random.choice(FAKE_FIRST_NAMES)
    return full.strip().split()[0]


def _render_plain(sender: str, recipient: str) -> dict:
    tpl = random.choice(TEMPLATES)
    subject_body = tpl["subject"].format(
        sender_first_name=sender, recipient_first_name=recipient, company=_pick_company()
    )
    body = tpl["body"].format(
        sender_first_name=sender, recipient_first_name=recipient, company=_pick_company()
    )
    return {"subject": subject_body, "body_text": body}


def _as_html(body_text: str, sender: str) -> str:
    body_html = body_text.replace("\n", "<br>")
    return HTML_SHELL.format(body_html=body_html, sender_first_name=sender)


class StaticTemplateGenerator:
    """Deterministic, no-cost fallback. Picks from the bundled template list."""

    async def generate_thread_message(
        self,
        mode: str,
        prior_messages: list[str],
        sender_name: str,
        recipient_name: str,
        # Accept the same kwargs LlmContentGenerator does so warmup_send can
        # call either generator with one signature. We don't track usage for
        # the static path — it's free.
        **_: object,
    ) -> dict:
        sender = _first_name(sender_name)
        recipient = _first_name(recipient_name)

        rendered = _render_plain(sender, recipient)
        subject = rendered["subject"]
        body_text = rendered["body_text"]

        # Thread-continuation feel: if there's prior history, prepend Re:/Fwd:
        # (empty prefix is also an option — we keep some threads without one).
        if prior_messages:
            prefix = random.choice(SUBJECT_PREFIXES)
            if prefix and not subject.lower().startswith(prefix.lower()):
                subject = f"{prefix} {subject}".strip()

        # Decide HTML vs plain by mode.
        normalized = (mode or "A").upper()
        if normalized == "C":
            normalized = random.choice(["A", "B"])

        if normalized == "B":
            return {
                "subject": subject,
                "body_text": _as_html(body_text, sender),
                "is_html": True,
            }

        # 'A' and 'D' both fall through to plain text here. Wave 4 will route
        # 'D' to the user's saved designer template.
        return {
            "subject": subject,
            "body_text": body_text,
            "is_html": False,
        }
