"""
Responder (Chatbot) reply generation.

When the AI provider is configured (Settings → AI Key), the Responder
makes a real LLM call using the Responder AgentConfig prompts + model
and injects live CRM context so the answers are grounded.

Replies are humanized (chat-style, no markdown) and match the user's
language — Tanglish (Tamil in English letters) gets Tanglish back,
Tamil script gets Tamil, English gets English.

Falls back to keyword-based replies when no key is set, so the system
always works without an external API.
"""

import json
import logging
import re

from .ai import llm_available, llm_complete
from .icp import our_services_text
from .models import AgentConfig, AppSettings, EmailDraft, Lead, Potential, Reply

log = logging.getLogger(__name__)

FALLBACK_REPLIES = [
    'Got it — noted for the next pipeline run 👍',
    'Okay, I\'ll keep that in mind for the next cycle.',
    'Sure thing. Anything else you want me to look at?',
]

# ------------------------------------------------------------------
# Language detection — Tanglish / Tamil / English
# ------------------------------------------------------------------

TAMIL_SCRIPT = re.compile(r'[\u0B80-\u0BFF]')

# one distinctive hit is enough to switch to Tanglish
_TANGLISH_STRONG = {
    'machan', 'machi', 'machu', 'anna', 'akka', 'thambi', 'thala', 'mama',
    'vanakkam', 'vanakam', 'epdi', 'eppadi', 'eppdi', 'irukka', 'iruke',
    'iruku', 'irukken', 'irunthu', 'illana', 'illai', 'panra', 'pannra',
    'panren', 'panni', 'pannitu', 'pannutu', 'pannalama', 'pannanum',
    'semma', 'romba', 'konjam', 'innum', 'ippo', 'ipo', 'sollu', 'sollunga',
    'nanri', 'nandri', 'apdi', 'appadi', 'ipdi', 'indha', 'intha',
    'kandippa', 'vandha', 'yeppo', 'eppo', 'enna', 'yen', 'yenna',
    'poganum', 'venum', 'vendam', 'irukum', 'varala', 'pothum', 'kashtam',
    'seriya', 'vapla', 'yeppothu', 'innum',
}

# chat-style particles — need two different ones so plain English doesn't trip it
_TANGLISH_WEAK = {'da', 'di', 'pa', 'ba', 'va', 'vaa', 'po', 'ya', 'u', 'dhan', 'than', 'la'}


def detect_language_style(text):
    """'tamil' | 'tanglish' | 'english' — drives the reply language."""
    if TAMIL_SCRIPT.search(text):
        return 'tamil'
    tokens = set(re.findall(r"[a-z']+", text.lower()))
    if tokens & _TANGLISH_STRONG:
        return 'tanglish'
    if len(tokens & _TANGLISH_WEAK) >= 2:
        return 'tanglish'
    return 'english'


LANGUAGE_RULES = {
    'tanglish': (
        'The user writes in Tanglish — Tamil typed in English letters mixed with English '
        '(like "machan, epdi irukka" or "ena da panrom"). Reply in the SAME natural Tanglish: '
        'warm, casual, WhatsApp-style. Keep business words (leads, pipeline, email, draft, score) '
        'in English inside the Tamil flow, exactly how Chennai folks actually type.'
    ),
    'tamil': (
        'The user writes in Tamil script. Reply in Tamil script, friendly and conversational. '
        'Keep business words (leads, pipeline, email, draft, score) in English.'
    ),
    'english': (
        'Reply in friendly, natural English — casual like a colleague on chat, not a manual.'
    ),
}


def _humanize(text):
    """Strip the bot tells: 'REPLY:' prefixes, markdown bold/headings."""
    if not text:
        return text
    t = text.strip()
    t = re.sub(r'^\s*(reply|answer|response|responder)\s*[:\-–]\s*', '', t, flags=re.I)
    t = t.replace('**', '').replace('__', '').replace('###', '')
    t = re.sub(r'^\s*#\s+', '', t, flags=re.M)
    return t.strip()


def _crm_snapshot():
    """Build a compact CRM context string for the LLM."""
    leads = Lead.objects.order_by('-created_at')[:5]
    potentials = Potential.objects.order_by('-created_at')[:5]
    drafts_pending_qs = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
    drafts_pending = drafts_pending_qs.count()
    drafts_sent = EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count()
    pending_names = list(drafts_pending_qs.values_list('company', 'to_email')[:10])

    lead_lines = [f'  - {l.company} ({l.industry}, score {l.score}, {"website" if l.has_website else "NO website"})' for l in leads]
    pot_lines = [f'  - {p.company}: {p.opportunity} ({p.value}, {p.get_stage_display()})' for p in potentials]
    from .inbox import replies_digest

    return (
        f'CRM SNAPSHOT:\n'
        f'Total: {Lead.objects.count()} leads, {Potential.objects.count()} potentials, '
        f'{Reply.objects.count()} replies, {drafts_pending} draft(s) pending, {drafts_sent} sent.\n'
        f'Recent leads:\n' + '\n'.join(lead_lines or ['  (none)']) + '\n'
        f'Recent potentials:\n' + '\n'.join(pot_lines or ['  (none)']) + '\n'
        f'Prospect replies (read from the mailboxes; an answer goes out only after the user '
        f'approves it on the Replies page):\n{replies_digest()}\n'
        f'Outreach: {drafts_pending} cold email(s) awaiting approval, {drafts_sent} sent.\n'
        f'Drafts awaiting approval (company <email>): '
        + (', '.join(f'{c} <{e}>' for c, e in pending_names) if pending_names else '(none)')
    )


def _responder_config():
    """Load the Responder agent's config (prompts + model)."""
    return AgentConfig.objects.filter(agent='responder').first()


def _llm_reply(text, turn=0, user=None, history=None):
    """The Assistant's answer from the model - with the conversation in
    memory and never a made-up one (core.assistant)."""
    from .assistant import assistant_answer   # late import: assistant needs this module
    return assistant_answer(text, user=user, history=history, turn=turn)


def _keyword_reply(text, turn=0):
    """Keyword-based fallback when the LLM is unavailable."""
    q = text.lower()
    settings = AppSettings.load()
    style = detect_language_style(text)

    def n(items):
        return len(items)

    # identity / meta questions FIRST — they are never pipeline instructions,
    # so they must never fall through to the "noted for next run" acks
    if re.search(r"\b(who are you|what are you|who r u|what r u|who is this|"
                 r"what is this( app| product| tool|)?|what can you do|what do you do|"
                 r"your name|about yourself|introduce yourself|help me understand you)\b", q):
        who = settings.company_name or 'this workspace'
        return (
            f"I'm the AI sales assistant for {who} — I live in the Assistant tab. "
            "I find new leads, read their websites, write the outreach emails (you approve "
            "every one before it sends), chase replies, and keep the CRM tidy. "
            "Ask me things like 'find leads in Chennai', 'show pending approvals' or "
            "'run a cycle' — or just chat with me."
        )

    if re.search(r'\b(hi|hello|hey|vanakkam)\b', q):
        leads, potentials, replies = n(Lead.objects.all()), n(Potential.objects.all()), n(Reply.objects.all())
        if style == 'tanglish':
            return (
                f'Vanakkam! 😄 Pipeline nalla run aguthu — CRM la {leads} leads, '
                f'{potentials} potentials iruku. Enna venum, sollu!'
            )
        if style == 'tamil':
            return (
                f'வணக்கம்! பைப்லைன் நன்றாக இயங்குகிறது — CRM-ல் {leads} leads, '
                f'{potentials} potentials உள்ளன. என்ன வேண்டும்?'
            )
        return (
            f'Hey! Pipeline\'s running nicely — {leads} leads and {potentials} potentials '
            f'in the CRM right now. What\'s up?'
    )

    if any(w in q for w in ('lead', 'company', 'search', 'scrape', 'discover')):
        recent = list(Lead.objects.order_by('-created_at')[:3])
        if recent:
            names = ', '.join(f'{l.company} ({l.score})' for l in recent)
            return (
                f'Latest {len(recent)} leads: {names}. They\'re scored and queued for email drafting.'
            )
        return 'No leads yet — trigger a pipeline run and I\'ll go find some companies.'

    if any(w in q for w in ('approval', 'approvals', 'pending', 'waiting', 'approve', 'queue')):
        pending = list(EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
                       .values_list('company', 'to_email')[:8])
        if pending:
            names = ', '.join(f'{c} <{e}>' for c, e in pending)
            more = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count() - len(pending)
            extra = f' (+{more} more)' if more > 0 else ''
            return (f'{len(pending)} draft(s) waiting for your approval{extra}: {names}. '
                    'Say "approve all drafts" to send everything, or name one company.')
        return 'Nothing is waiting — the approval queue is empty. Run a cycle and I\'ll draft the next batch.'

    if any(w in q for w in ('email', 'copy', 'pitch', 'draft', 'message')):
        latest = Lead.objects.filter(profiled=True).order_by('-created_at').first()
        if latest:
            return (
                f'Copywright drafts personalized first-touch emails for every profiled lead. '
                f'Latest target: {latest.company} ({latest.industry}). One value proposition, one CTA, under 120 words.'
            )
        return 'Copywright has no profiled leads yet — run the pipeline first.'

    if 'reply' in q or 'repl' in q or 'respond' in q or 'answer' in q:
        from .inbox import replies_digest
        return (replies_digest() + '\nOpen the Replies page to read them and approve the '
                'suggested answers — nothing is sent to a prospect until you approve it.')

    if any(w in q for w in ('run', 'schedule', 'frequent', 'next')):
        freq = settings.get_run_frequency_display()
        state = 'running' if settings.runs_enabled else 'paused'
        return f'The pipeline runs {freq.lower()} and it\'s currently {state}. You can also fire a cycle right now from the dashboard\'s Run button.'

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


def responder_reply(text, turn=0, user=None):
    """Return the Responder's answer for a user message.

    Agentic: first tries to detect + execute an action (run cycle, approve/
    reject draft, delete lead, set cadence, send report, work out who to
    find), then says what happened in the user's language. Risky actions
    wait for an explicit "yes". Otherwise the model answers with the whole
    conversation in memory (core.assistant); keywords are the last resort.
    """
    from .actions import handle_command  # late import — pipeline is heavy
    from .assistant import earlier_turns

    history = earlier_turns(user, turn)
    shown = [{'from': 'user' if t['role'] == 'user' else 'ai', 'text': t['text']}
             for t in history[-8:]]
    try:
        result = handle_command(text, user, shown)
    except Exception as exc:
        log.warning('chat action failed (%s): %s', text, exc)
        result = 'That action failed on the server — check the logs.'
    if result:
        if 'Reply "yes"' in result:
            return result  # confirmation prompts go out verbatim
        return _phrase_reply(text, result)

    if llm_available():
        try:
            result = _llm_reply(text, turn, user=user, history=history)
            if result:
                return result
        except Exception as exc:
            log.warning('LLM Responder failed, falling back to keywords: %s', exc)

    return _keyword_reply(text, turn)


def _phrase_reply(text, action_result):
    """Say what a command did, in the user's language and exactly as it
    happened (core.assistant); the plain result when there is no model."""
    if not llm_available():
        return action_result
    from .assistant import phrase_result   # late import: assistant needs this module
    try:
        return phrase_result(text, action_result)
    except Exception:
        return action_result
