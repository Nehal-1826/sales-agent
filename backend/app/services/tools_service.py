"""Business logic for the four Client Tools sub-pages (spec §5.1 item 6).

This module is kept thin: route handlers in ``app.api.routes.tools`` dispatch
to helpers here. All DB scoping is by ``workspace_id`` (never by user_id
directly so multi-user workspaces continue to share templates / history).

Peer-inbox sending in the Placement Tester is mocked for MVP — the dev
environment has no real SMTP connectivity. The mock still records a real
``placement_tests`` row so history + drill-in works end-to-end.
"""
from __future__ import annotations

import hashlib
import logging
import random
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit_logs import AuditLog
from app.db.models.email_templates import EmailTemplate
from app.db.models.mailboxes import Mailbox
from app.db.models.peer_inboxes import PeerInbox, PeerProvider
from app.db.models.placement_tests import PlacementTest
from app.db.models.spam_scans import SpamScan
from app.db.models.users import User
from app.services.llm.provider import LLMError, LLMRequest
from app.services.llm.usage_tracker import record_usage
from app.services.llm.claude_provider import ClaudeProvider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.groq_provider import GroqProvider
from app.services.warmup.content_factory import get_content_generator

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Spam-trigger word list (major / minor buckets)                              #
# --------------------------------------------------------------------------- #

# ~80 common spam trigger phrases. Weights per spec: major=+10, minor=+5.
SPAM_WORDS_MAJOR: tuple[str, ...] = (
    "free",
    "winner",
    "congratulations",
    "urgent",
    "act now",
    "limited time",
    "click here",
    "buy now",
    "cash bonus",
    "risk-free",
    "no obligation",
    "100% free",
    "make money",
    "earn $$$",
    "viagra",
    "prize",
    "guaranteed",
    "miracle",
    "credit card",
    "order now",
    "wire transfer",
    "weight loss",
    "lose weight",
    "satisfaction guaranteed",
    "save big",
    "while supplies last",
    "work from home",
    "pre-approved",
    "double your income",
    "refinance",
    "debt free",
    "eliminate debt",
    "lowest price",
    "no investment",
    "meet singles",
    "nigerian prince",
    "apply now",
    "call now",
    "cheap",
    "enlarge",
)

SPAM_WORDS_MINOR: tuple[str, ...] = (
    "discount",
    "amazing",
    "certified",
    "deal",
    "exclusive deal",
    "giveaway",
    "instant",
    "special promotion",
    "bonus",
    "offer",
    "opportunity",
    "limited",
    "hurry",
    "today only",
    "sale",
    "save",
    "promotion",
    "incredible",
    "performance",
    "trial",
    "subscribe",
    "unsubscribe",
    "request",
    "reminder",
    "sign up",
    "join now",
    "preview",
    "info",
    "extra",
    "fantastic",
    "perfect",
    "bargain",
    "low price",
    "best price",
    "obligation",
    "purchase",
    "earnings",
    "income",
    "profit",
    "cash",
)


# --------------------------------------------------------------------------- #
# Helpers — audit                                                             #
# --------------------------------------------------------------------------- #


async def _best_effort_audit(
    session: AsyncSession,
    *,
    user: User,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Write an audit log row inside a SAVEPOINT so failures never poison
    the outer transaction. Audit is explicitly documented as best-effort."""
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    try:
        async with session.begin_nested():
            session.add(
                AuditLog(
                    actor_user_id=user.id,
                    actor_role=role,
                    action=action,
                    target_type=target_type,
                    target_id=target_id,
                    payload=payload,
                    ip=None,
                )
            )
            # flush happens on savepoint exit
    except Exception as exc:  # noqa: BLE001 — audit must never break the request
        logger.warning("audit_log best-effort failure action=%s: %s", action, exc)


async def _assert_mailbox_in_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID, mailbox_id: uuid.UUID
) -> Mailbox:
    mbx = (
        await session.execute(
            select(Mailbox).where(
                Mailbox.id == mailbox_id,
                Mailbox.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if mbx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found"
        )
    return mbx


# --------------------------------------------------------------------------- #
# Placement Tester                                                            #
# --------------------------------------------------------------------------- #


async def _pick_seed_peers(session: AsyncSession, *, limit: int = 20) -> list[PeerInbox]:
    """Sample up to ``limit`` active peers, balancing across providers.

    Targets a roughly equal split across gmail / outlook / yahoo. If a
    provider has fewer active peers than the quota we take whatever we can
    and top the rest up from any provider.
    """
    per_provider = max(1, limit // 3)
    picked: list[PeerInbox] = []
    for prov in (PeerProvider.google_ws, PeerProvider.office365, PeerProvider.yahoo):
        rows = (
            await session.execute(
                select(PeerInbox)
                .where(PeerInbox.is_active.is_(True), PeerInbox.provider == prov)
                .limit(per_provider)
            )
        ).scalars().all()
        picked.extend(rows)
    if len(picked) < limit:
        # Top up with any remaining active peers we haven't already grabbed.
        taken_ids = {p.id for p in picked}
        remaining = (
            await session.execute(
                select(PeerInbox)
                .where(PeerInbox.is_active.is_(True))
                .limit(limit * 2)
            )
        ).scalars().all()
        for p in remaining:
            if p.id not in taken_ids:
                picked.append(p)
                if len(picked) >= limit:
                    break
    return picked[:limit]


def _mock_placement_results(seed_emails: list[str]) -> dict[str, Any]:
    """Deterministic-ish mock: spread the seed count across inbox/promo/spam/blocked.

    Per provider we give a plausible distribution (gmail harshest on promos,
    outlook more spam-happy, yahoo middle-of-the-road).
    """
    n = len(seed_emails) or 20
    # Rough global split: 70% inbox, 15% promo, 10% spam, 5% blocked.
    inbox = int(round(n * 0.70))
    promotions = int(round(n * 0.15))
    spam = int(round(n * 0.10))
    blocked = max(0, n - inbox - promotions - spam)

    def _slice(fracs: tuple[float, float, float, float]) -> dict[str, int]:
        third = max(1, n // 3)
        i = int(round(third * fracs[0]))
        p = int(round(third * fracs[1]))
        s = int(round(third * fracs[2]))
        b = max(0, third - i - p - s)
        return {"inbox": i, "promotions": p, "spam": s, "blocked": b}

    return {
        "inbox": inbox,
        "promotions": promotions,
        "spam": spam,
        "blocked": blocked,
        "per_provider": {
            "gmail": _slice((0.70, 0.20, 0.08, 0.02)),
            "outlook": _slice((0.65, 0.15, 0.15, 0.05)),
            "yahoo": _slice((0.75, 0.10, 0.10, 0.05)),
        },
    }


async def run_placement_test(
    session: AsyncSession,
    *,
    user: User,
    mailbox_id: uuid.UUID,
    subject: str,
    body: str,
    is_html: bool,
) -> PlacementTest:
    """Run a placement test.

    MVP: no real SMTP send (dev has no outbound). We pick up to 20 active
    peers balanced across providers, record a row with ``seed_set`` as the
    peer email list, and stamp mocked per-provider results immediately.
    """
    _ = body, is_html, subject  # reserved for real send path
    mbx = await _assert_mailbox_in_workspace(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    peers = await _pick_seed_peers(session, limit=20)
    seed_emails = [p.email_address for p in peers]
    results = _mock_placement_results(seed_emails)
    now = datetime.now(UTC)
    row = PlacementTest(
        mailbox_id=mbx.id,
        seed_set={"peers": seed_emails},
        sent_at=now,
        results=results,
    )
    session.add(row)
    await session.flush()
    await _best_effort_audit(
        session,
        user=user,
        action="placement_test.run",
        target_type="placement_test",
        target_id=row.id,
        payload={"mailbox_id": str(mbx.id), "seed_count": len(seed_emails)},
    )
    await session.commit()
    await session.refresh(row)
    return row


async def list_placement_tests(
    session: AsyncSession,
    *,
    workspace_id: uuid.UUID,
    page: int,
    page_size: int,
) -> tuple[list[PlacementTest], int]:
    mbx_ids_stmt = select(Mailbox.id).where(Mailbox.workspace_id == workspace_id)
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(PlacementTest).where(
                    PlacementTest.mailbox_id.in_(mbx_ids_stmt)
                )
            )
        ).scalar_one()
        or 0
    )
    rows = (
        await session.execute(
            select(PlacementTest)
            .where(PlacementTest.mailbox_id.in_(mbx_ids_stmt))
            .order_by(PlacementTest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return list(rows), total


async def get_placement_test(
    session: AsyncSession, *, workspace_id: uuid.UUID, test_id: uuid.UUID
) -> PlacementTest:
    row = (
        await session.execute(
            select(PlacementTest)
            .join(Mailbox, Mailbox.id == PlacementTest.mailbox_id)
            .where(
                PlacementTest.id == test_id,
                Mailbox.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Placement test not found"
        )
    return row


def placement_to_dict(row: PlacementTest) -> dict[str, Any]:
    seed = row.seed_set or {}
    seed_list = seed.get("peers") if isinstance(seed, dict) else []
    return {
        "test_id": row.id,
        "mailbox_id": row.mailbox_id,
        "seed_count": len(seed_list or []),
        "results": row.results or {},
        "sent_at": row.sent_at or row.created_at,
    }


# --------------------------------------------------------------------------- #
# Spam Scanner                                                                #
# --------------------------------------------------------------------------- #


_SHORTENER_HOSTS = (
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "is.gd",
    "buff.ly",
    "rebrand.ly",
    "cutt.ly",
    "shorturl.at",
)

_SUSPICIOUS_TLDS = (
    ".zip",
    ".mov",
    ".click",
    ".country",
    ".gq",
    ".work",
    ".men",
    ".loan",
    ".top",
)


def _word_match(haystack: str, needle: str) -> bool:
    pattern = r"\b" + re.escape(needle) + r"\b"
    return re.search(pattern, haystack, flags=re.IGNORECASE) is not None


def _extract_lines(text: str) -> list[str]:
    return [ln for ln in text.splitlines() if ln.strip()]


def _count_caps_lines(text: str) -> list[str]:
    """Lines with >3 words that are all uppercase."""
    hits = []
    for ln in _extract_lines(text):
        words = [w for w in re.split(r"\s+", ln.strip()) if w]
        if len(words) > 3 and all(w == w.upper() and any(c.isalpha() for c in w) for w in words):
            hits.append(ln.strip())
    return hits


def _count_punct_runs(text: str) -> list[str]:
    """Returns matched runs of !!! / ??? / !!?? etc."""
    return re.findall(r"[!?]{3,}", text)


def _html_is_broken(html: str) -> bool:
    """Very small heuristic: count opening vs closing tag names.

    Self-closing + void elements (br, img, hr, meta, link, input) don't need
    a pair. If the open-count for a non-void tag exceeds the close-count by
    more than 1 we call it broken.
    """
    void = {"br", "img", "hr", "meta", "link", "input", "area", "base", "col", "source"}
    opens = re.findall(r"<\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(?<!/)>", html)
    closes = re.findall(r"<\s*/\s*([a-zA-Z][a-zA-Z0-9]*)\s*>", html)
    counts: dict[str, int] = {}
    for t in opens:
        t = t.lower()
        if t in void:
            continue
        counts[t] = counts.get(t, 0) + 1
    for t in closes:
        t = t.lower()
        counts[t] = counts.get(t, 0) - 1
    return any(abs(v) > 1 for v in counts.values())


def _has_shortener(text: str) -> str | None:
    for host in _SHORTENER_HOSTS:
        if re.search(r"https?://(?:www\.)?" + re.escape(host) + r"/", text, re.IGNORECASE):
            return host
    return None


def _has_unsubscribe(html: str) -> bool:
    return re.search(r"unsubscribe", html, re.IGNORECASE) is not None


def compute_spam_score(subject: str, body: str, is_html: bool) -> tuple[float, list[dict]]:
    """Pure scoring: returns (score 0-100, trigger list).

    Scoring formula (per spec):
      - Each major word: +10
      - Each minor word: +5
      - Each ALL CAPS line > 3 words: +5
      - Each !!! / ??? run: +3 (capped at 15 total)
      - Broken HTML: +10
      - URL shortener: +15
      - Missing <unsubscribe> when is_html: +10
      - Capped at 100.
    """
    triggers: list[dict] = []
    score = 0.0
    combined = f"{subject}\n{body}"

    for w in SPAM_WORDS_MAJOR:
        if _word_match(combined, w):
            triggers.append({"type": "word", "word": w, "severity": "major"})
            score += 10

    for w in SPAM_WORDS_MINOR:
        if _word_match(combined, w):
            triggers.append({"type": "word", "word": w, "severity": "minor"})
            score += 5

    for line in _count_caps_lines(combined):
        triggers.append({"type": "caps", "line": line[:200], "severity": "minor"})
        score += 5

    punct_hits = _count_punct_runs(combined)
    punct_score = min(15, 3 * len(punct_hits))
    for run in punct_hits:
        triggers.append({"type": "punct", "line": run, "severity": "minor"})
    score += punct_score

    if is_html and _html_is_broken(body):
        triggers.append({"type": "html", "line": "Broken or mismatched HTML tags", "severity": "major"})
        score += 10

    shortener = _has_shortener(combined)
    if shortener:
        triggers.append({"type": "shortener", "word": shortener, "severity": "major"})
        score += 15

    if is_html and not _has_unsubscribe(body):
        triggers.append({
            "type": "unsubscribe",
            "line": "No <unsubscribe> link found in HTML body",
            "severity": "major",
        })
        score += 10

    # Suspicious TLD (bonus signal, counted as a minor word-type trigger).
    for tld in _SUSPICIOUS_TLDS:
        if re.search(r"https?://[^\s<>\"']*" + re.escape(tld) + r"\b", combined, re.IGNORECASE):
            triggers.append({"type": "word", "word": f"link:{tld}", "severity": "minor"})
            score += 5
            break  # only count once — per-TLD stacking gets noisy

    score = max(0.0, min(100.0, score))
    return score, triggers


async def run_spam_scan(
    session: AsyncSession,
    *,
    user: User,
    subject: str,
    body: str,
    is_html: bool,
) -> SpamScan:
    score, triggers = compute_spam_score(subject, body, is_html)
    snippet = (subject + "\n" + body)[:4000]
    row = SpamScan(
        user_id=user.id,
        content_snippet=snippet,
        score=score,
        triggers={"items": triggers},
    )
    session.add(row)
    await session.flush()
    await _best_effort_audit(
        session,
        user=user,
        action="spam_scan.run",
        target_type="spam_scan",
        target_id=row.id,
        payload={"score": score, "trigger_count": len(triggers)},
    )
    await session.commit()
    await session.refresh(row)
    return row


async def list_spam_scans(
    session: AsyncSession, *, user: User, page: int, page_size: int
) -> tuple[list[SpamScan], int]:
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(SpamScan).where(
                    SpamScan.user_id == user.id
                )
            )
        ).scalar_one()
        or 0
    )
    rows = (
        await session.execute(
            select(SpamScan)
            .where(SpamScan.user_id == user.id)
            .order_by(SpamScan.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return list(rows), total


def spam_scan_to_dict(row: SpamScan) -> dict[str, Any]:
    triggers_raw = row.triggers or {}
    items = triggers_raw.get("items") if isinstance(triggers_raw, dict) else []
    return {
        "id": row.id,
        "score": float(row.score or 0.0),
        "passed": float(row.score or 0.0) < 30.0,
        "triggers": items or [],
        "created_at": row.created_at,
    }


# --------------------------------------------------------------------------- #
# Template Designer                                                           #
# --------------------------------------------------------------------------- #


async def list_templates(
    session: AsyncSession, *, workspace_id: uuid.UUID
) -> list[EmailTemplate]:
    rows = (
        await session.execute(
            select(EmailTemplate)
            .where(EmailTemplate.workspace_id == workspace_id)
            .order_by(EmailTemplate.id.desc())
        )
    ).scalars().all()
    return list(rows)


async def create_template(
    session: AsyncSession,
    *,
    user: User,
    name: str,
    html: str,
    thumbnail: str | None,
    created_with_llm: bool,
) -> EmailTemplate:
    row = EmailTemplate(
        workspace_id=user.workspace_id,
        name=name,
        html=html,
        thumbnail=thumbnail,
        created_with_llm=created_with_llm,
    )
    session.add(row)
    await session.flush()
    await _best_effort_audit(
        session,
        user=user,
        action="template.create",
        target_type="email_template",
        target_id=row.id,
    )
    await session.commit()
    await session.refresh(row)
    return row


async def _get_template_in_workspace(
    session: AsyncSession, *, workspace_id: uuid.UUID, template_id: uuid.UUID
) -> EmailTemplate:
    row = (
        await session.execute(
            select(EmailTemplate).where(
                EmailTemplate.id == template_id,
                EmailTemplate.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    return row


async def update_template(
    session: AsyncSession,
    *,
    user: User,
    template_id: uuid.UUID,
    name: str | None,
    html: str | None,
    thumbnail: str | None,
) -> EmailTemplate:
    row = await _get_template_in_workspace(
        session, workspace_id=user.workspace_id, template_id=template_id
    )
    if name is not None:
        row.name = name
    if html is not None:
        row.html = html
    if thumbnail is not None:
        row.thumbnail = thumbnail
    await session.flush()
    await _best_effort_audit(
        session,
        user=user,
        action="template.update",
        target_type="email_template",
        target_id=row.id,
    )
    await session.commit()
    await session.refresh(row)
    return row


async def delete_template(
    session: AsyncSession, *, user: User, template_id: uuid.UUID
) -> None:
    row = await _get_template_in_workspace(
        session, workspace_id=user.workspace_id, template_id=template_id
    )
    await session.delete(row)
    await _best_effort_audit(
        session,
        user=user,
        action="template.delete",
        target_type="email_template",
        target_id=template_id,
    )
    await session.commit()


def template_to_dict(row: EmailTemplate) -> dict[str, Any]:
    # EmailTemplate has no created_at column; synthesize a stable timestamp
    # from the id so the frontend always has something to sort by.
    digest = int(hashlib.md5(str(row.id).encode()).hexdigest()[:8], 16)
    stable = datetime.fromtimestamp(1_700_000_000 + (digest % 10_000_000), tz=UTC)
    return {
        "id": row.id,
        "name": row.name,
        "html": row.html,
        "thumbnail": row.thumbnail,
        "created_with_llm": bool(row.created_with_llm),
        "created_at": stable,
    }


# --------------------------------------------------------------------------- #
# LLM template generation                                                     #
# --------------------------------------------------------------------------- #


_LLM_TEMPLATE_SYSTEM = (
    "You are an HTML email template designer. Return a SINGLE self-contained HTML "
    "document body (no <html>/<head> wrappers) with inline CSS, a colored header "
    "band, a short body paragraph, and a plain-text signature. No scripts, no "
    "external images, no tracking pixels. Keep total output under 3000 characters."
)


async def generate_template_with_llm(
    session: AsyncSession,
    *,
    user: User,
    template_id: uuid.UUID,
    prompt: str,
    settings,
) -> str:
    """Call the configured LLM provider in mode 'B' (styled HTML) and return HTML.

    Records an ``LlmUsage`` row via ``record_usage``. Falls back to a static
    HTML shell when no key is configured or the call fails non-retryably.
    Provider selection mirrors ``content_factory``: Gemini -> Claude.
    """
    # Scope check — only owners can generate for their templates.
    await _get_template_in_workspace(
        session, workspace_id=user.workspace_id, template_id=template_id
    )

    # Short static fallback — used when no API key is configured OR on
    # non-retryable failure. Keeps the frontend usable in dev.
    def _static_fallback() -> str:
        return (
            '<div style="font-family: Inter, Arial, sans-serif;">'
            '<div style="background:#2563eb;color:#fff;padding:16px;font-size:18px;">'
            f'{prompt[:80]}'
            "</div>"
            '<div style="padding:20px;color:#111;line-height:1.6;">'
            "<p>This is a generated template preview. Connect an LLM provider to produce unique HTML.</p>"
            "<p>— Your Team</p>"
            "</div>"
            "</div>"
        )

    from app.services.llm.llm_config import resolve_llm_keys

    resolved = await resolve_llm_keys(session, settings)

    # Provider priority: Gemini -> Groq (free fallback) -> Claude. Each is
    # tried in turn; on an LLMError we fall through to the next, and only when
    # every configured provider fails do we return the static shell.
    candidates: list[tuple[Any, str]] = []
    if resolved.gemini_api_key:
        candidates.append((
            GeminiProvider(
                api_key=resolved.gemini_api_key,
                default_model=resolved.gemini_model,
                base_url=resolved.gemini_base_url,
            ),
            resolved.gemini_model,
        ))
    if resolved.groq_api_key:
        candidates.append((
            GroqProvider(
                api_key=resolved.groq_api_key,
                default_model=resolved.groq_model,
                base_url=resolved.groq_base_url,
            ),
            resolved.groq_model,
        ))
    if resolved.anthropic_api_key:
        candidates.append((
            ClaudeProvider(
                api_key=resolved.anthropic_api_key,
                default_model=resolved.anthropic_model,
            ),
            resolved.anthropic_model,
        ))

    if not candidates:
        return _static_fallback()

    resp = None
    for prov, model in candidates:
        req = LLMRequest(
            messages=[
                {"role": "system", "content": _LLM_TEMPLATE_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            model=model,
            temperature=0.8,
            max_tokens=900,
        )
        try:
            resp = await prov.complete(req)
            break
        except LLMError as exc:
            logger.warning("llm template generation via %s failed: %s", prov.name, exc)
            continue

    if resp is None:
        return _static_fallback()

    await record_usage(
        session,
        user_id=user.id,
        mailbox_id=None,
        mode="B",
        usage=resp.usage,
        settings=settings,
    )
    await _best_effort_audit(
        session,
        user=user,
        action="template.generate_llm",
        target_type="email_template",
        target_id=template_id,
        payload={
            "prompt_tokens": resp.usage.prompt_tokens,
            "completion_tokens": resp.usage.completion_tokens,
        },
    )
    await session.commit()
    return resp.content


# --------------------------------------------------------------------------- #
# HTML sanitization (preview)                                                 #
# --------------------------------------------------------------------------- #


_SCRIPT_RE = re.compile(r"<\s*script\b[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
_STYLE_LEAK_RE = re.compile(r"</?\s*(?:iframe|object|embed|form)\b[^>]*>", re.IGNORECASE)
_ON_ATTR_RE = re.compile(r"\s+on[a-zA-Z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.IGNORECASE)
# External img src — allow data: URIs and leave them in place.
_EXT_IMG_SRC_RE = re.compile(
    r"(<\s*img\b[^>]*?\s+src\s*=\s*)(\"https?://[^\"]+\"|'https?://[^']+'|https?://[^\s>]+)",
    re.IGNORECASE,
)
_JS_URL_RE = re.compile(
    r"(\s+(?:href|src)\s*=\s*)(\"javascript:[^\"]*\"|'javascript:[^']*'|javascript:[^\s>]+)",
    re.IGNORECASE,
)


def sanitize_html(html: str) -> str:
    """Server-side sanitizer used by the preview endpoint.

    Rules (per spec):
      - strip ``<script>...</script>`` entirely
      - remove inline event handlers (``onclick=`` etc.)
      - remove external image ``src`` attributes (keep the ``<img>`` shell)
      - neutralize ``javascript:`` URLs on href/src
      - remove ``<iframe>`` / ``<object>`` / ``<embed>`` / ``<form>`` tags
    """
    cleaned = _SCRIPT_RE.sub("", html or "")
    cleaned = _STYLE_LEAK_RE.sub("", cleaned)
    cleaned = _ON_ATTR_RE.sub("", cleaned)
    cleaned = _JS_URL_RE.sub(r'\1"#"', cleaned)
    cleaned = _EXT_IMG_SRC_RE.sub(r'\1""', cleaned)
    return cleaned


# --------------------------------------------------------------------------- #
# Warmup Preview                                                              #
# --------------------------------------------------------------------------- #


def _mock_peer_email(idx: int) -> str:
    # Stable-looking mock peer address — matches the spec's example format.
    return f"peer-{100 + idx}@acme-peers.com"


async def warmup_preview(
    session: AsyncSession,
    *,
    user: User,
    mailbox_id: uuid.UUID,
    count: int,
    mode: str,
    settings,
) -> list[dict[str, Any]]:
    """Generate ``count`` sample warmup messages via the content generator.

    No SMTP is used — this is strictly a dry-run for the UI. When no LLM key
    is configured the factory returns the StaticTemplateGenerator automatically.
    """
    mbx = await _assert_mailbox_in_workspace(
        session, workspace_id=user.workspace_id, mailbox_id=mailbox_id
    )
    from app.services.llm.llm_config import resolve_llm_keys

    resolved = await resolve_llm_keys(session, settings)
    generator = get_content_generator(
        settings,
        gemini_api_key=resolved.gemini_api_key,
        anthropic_api_key=resolved.anthropic_api_key,
        groq_api_key=resolved.groq_api_key,
    )
    samples: list[dict[str, Any]] = []
    sender = (mbx.email_address or "").split("@", 1)[0] or "Alex"
    for i in range(count):
        recipient = _mock_peer_email(i).split("@", 1)[0]
        try:
            msg = await generator.generate_thread_message(
                mode=mode,
                prior_messages=[],
                sender_name=sender,
                recipient_name=recipient,
            )
        except Exception as exc:  # noqa: BLE001 — fall back to a simple stub
            logger.warning("warmup preview generator error idx=%d: %s", i, exc)
            msg = {
                "subject": f"Quick hello {i + 1}",
                "body_text": "Just wanted to check in. Cheers.",
                "is_html": mode == "B",
            }
        samples.append(
            {
                "subject": msg.get("subject", ""),
                "body": msg.get("body_text", ""),
                "is_html": bool(msg.get("is_html", mode == "B")),
                "peer_email_mock": _mock_peer_email(i),
            }
        )
    # Gently shuffle so mode=C's A/B split feels non-deterministic.
    random.shuffle(samples)
    return samples
