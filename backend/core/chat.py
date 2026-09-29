"""
Responder (Chatbot) reply generation.

When the AI provider is configured (Settings → AI Key), the Responder
makes a real LLM call using the Responder AgentConfig prompts + model
and injects live CRM context so the answers are grounded.

Falls back to keyword-based replies when no key is set, so the system
always works without an external API.
"""

import json
import logging

from .ai import llm_available, llm_complete
from .models import AgentConfig, AppSettings, EmailDraft, Lead, Potential, Reply

log = logging.getLogger(__name__)

FALLBACK_REPLIES = [
    'Logged. The orchestrator will fold this into the next pipeline run — Search will re-scan for matching companies and Profile will score anything new.',
    'Understood. I attached this to the current loop cycle; Copywright will regenerate the affected first-touch drafts before the next run.',
    'Noted. Nothing in the pipeline needs to change for this — I will surface it again if the next loop finds a matching lead.',
]


def _crm_snapshot():
    """Build a compact CRM context string for the LLM."""
    leads = Lead.objects.order_by('-created_at')[:5]
    potentials = Potential.objects.order_by('-created_at')[:5]
    replies = Reply.objects.order_by('-updated_at')[:5]
    drafts_pending = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count()
    drafts_sent = EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count()

    lead_lines = [f'  - {l.company} ({l.industry}, score {l.score}, {"website" if l.has_website else "NO website"})' for l in leads]
    pot_lines = [f'  - {p.company}: {p.opportunity} ({p.value}, {p.get_stage_display()})' for p in potentials]
    reply_lines = [f'  - {r.company}: {r.get_status_display()} — {r.summary[:80]}' for r in replies]

    return (
        f'CRM SNAPSHOT:\n'
        f'Total: {Lead.objects.count()} leads, {Potential.objects.count()} potentials, '
        f'{Reply.objects.count()} replies, {drafts_pending} draft(s) pending, {drafts_sent} sent.\n'
        f'Recent leads:\n' + '\n'.join(lead_lines or ['  (none)']) + '\n'
        f'Recent potentials:\n' + '\n'.join(pot_lines or ['  (none)']) + '\n'
        f'Recent replies:\n' + '\n'.join(reply_lines or ['  (none)']) + '\n'
        f'Outreach: {drafts_pending} cold email(s) awaiting approval, {drafts_sent} sent.'
    )


def _responder_config():
    """Load the Responder agent's config (prompts + model)."""
    return AgentConfig.objects.filter(agent='responder').first()


def _llm_reply(text, turn=0):
    """Generate a Responder answer via the configured LLM provider."""
    cfg = _responder_config()
    settings = AppSettings.load()

    system = (cfg.system_prompt if cfg and cfg.system_prompt else
              'You are the Responder (Chatbot) in an autonomous marketing & sales pipeline. '
              'You have access to live CRM data. Answer concisely and helpfully. '
              'Reference specific leads, potentials, or pipeline data when relevant.')
    negative = cfg.negative_prompt if cfg else ''

    crm_context = _crm_snapshot()

    prompt = (
        f'{crm_context}\n\n'
        f'Company: {settings.company_name or "the team"}\n'
        f'Services: {", ".join(settings.services or []) or "web design, SEO and growth"}\n\n'
        f'{("RULES TO AVOID: " + negative + chr(10)) if negative else ""}'
        f'USER MESSAGE: {text}\n\n'
        f'Respond helpfully and concisely. Reference specific CRM data when relevant.'
    )

    model = cfg.model if cfg else ''
    result = llm_complete(prompt, system=system, model=model)
    if result:
        return result

    # LLM call failed — fall through to keyword logic
    return None


def _keyword_reply(text, turn=0):
    """Keyword-based fallback when the LLM is unavailable."""
    q = text.lower()
    settings = AppSettings.load()

    def n(items):
        return len(items)

    if any(w in q for w in ('hi', 'hello', 'hey')):
        leads, potentials, replies = n(Lead.objects.all()), n(Potential.objects.all()), n(Reply.objects.all())
        return (
            f'Hello. The autonomous loop is running — {leads} leads in CRM, '
            f'{potentials} potential opportunities, {replies} replies logged. '
            'What would you like to do?'
        )

    if any(w in q for w in ('lead', 'company', 'search', 'scrape', 'discover')):
        recent = list(Lead.objects.order_by('-created_at')[:3])
        if recent:
            names = ', '.join(f'{l.company} ({l.score})' for l in recent)
            return (
                f'Search (Scrape) recently discovered {len(recent)} leads: {names}. '
                'All enriched by Profile and queued for Copywright.'
            )
        return 'No leads yet. Trigger a pipeline run and Search (Scrape) will discover the first companies.'

    if any(w in q for w in ('email', 'copy', 'pitch', 'draft', 'message')):
        latest = Lead.objects.filter(profiled=True).order_by('-created_at').first()
        if latest:
            return (
                f'Copywright drafts personalized first-touch emails for every profiled lead. '
                f'Latest target: {latest.company} ({latest.industry}). One value proposition, one CTA, under 120 words.'
            )
        return 'Copywright has no profiled leads yet — run the pipeline first.'

    if 'reply' in q or 'repl' in q or 'respond' in q or 'answer' in q:
        awaiting = Reply.objects.filter(status='awaiting')
        if awaiting.exists():
            names = ', '.join(r.company for r in awaiting[:3])
            return f'{awaiting.count()} repl{"ies" if awaiting.count() != 1 else "y"} awaiting handling: {names}. I can draft responses for review.'
        return 'No replies are awaiting — the Responder is all caught up.'

    if any(w in q for w in ('run', 'schedule', 'frequent', 'next')):
        freq = settings.get_run_frequency_display()
        state = 'enabled' if settings.runs_enabled else 'paused'
        return f'The orchestrator runs the full pipeline {freq.lower()} ({state}). Trigger a manual cycle with POST /api/pipeline/run/ or from the dashboard.'

    if any(w in q for w in ('potential', 'opportunit', 'deal', 'value', 'pipeline')):
        potentials = Potential.objects.all()
        total = 0
        for p in potentials:
            digits = ''.join(ch for ch in p.value if ch.isdigit())
            total += int(digits) if digits else 0
        if potentials.exists():
            biggest = potentials.order_by('-created_at').first()
            return (
                f'POTENTIAL currently holds {potentials.count()} opportunities worth '
                f'${total:,} combined. Latest: {biggest.company} — {biggest.opportunity} ({biggest.value}).'
            )
        return 'No potential opportunities yet — Profile flags them once leads score above 78.'

    return FALLBACK_REPLIES[turn % len(FALLBACK_REPLIES)]


def responder_reply(text, turn=0):
    """Return the Responder's answer for a user message.

    Uses the LLM when available, falls back to keyword matching otherwise.
    """
    if llm_available():
        try:
            result = _llm_reply(text, turn)
            if result:
                return result
        except Exception as exc:
            log.warning('LLM Responder failed, falling back to keywords: %s', exc)

    return _keyword_reply(text, turn)
