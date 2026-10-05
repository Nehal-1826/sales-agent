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
              'You are the Responder — the friendly chat assistant of the '
              f'{settings.company_name or "Shailog Technologies"} marketing & sales team.')
    negative = cfg.negative_prompt if cfg else ''

    style = (
        'Sound like a real friendly human chatting on WhatsApp, not a corporate bot: '
        'short replies (1-4 sentences unless they ask for detail), contractions, zero '
        'stiff marketing tone. NEVER use markdown — no **bold**, no headings, no lists '
        'with * or -; plain text only (a simple "•" line is fine when listing a few items). '
        'Never start the reply with "REPLY:" or similar labels. '
        f'{LANGUAGE_RULES[detect_language_style(text)]} '
        'You have live CRM data below — mention specific leads/drafts when it genuinely '
        'helps, but don\'t dump stats in every answer.'
    )
    system = f'{system}\n\nSTYLE RULES: {style}'

    crm_context = _crm_snapshot()

    prompt = (
        f'{crm_context}\n\n'
        f'Company: {settings.company_name or "the team"}\n'
        f'Services: {", ".join(settings.services or []) or "web design, SEO and growth"}\n\n'
        f'{("RULES TO AVOID: " + negative + chr(10)) if negative else ""}'
        f'USER MESSAGE: {text}\n\n'
        f'Respond in the user\'s own language and style (see STYLE RULES).'
    )

    model = cfg.model if cfg else ''
    result = llm_complete(prompt, system=system, model=model)
    if result:
        return _humanize(result)

    # LLM call failed — fall through to keyword logic
    return None


def _keyword_reply(text, turn=0):
    """Keyword-based fallback when the LLM is unavailable."""
    q = text.lower()
    settings = AppSettings.load()
    style = detect_language_style(text)

    def n(items):
        return len(items)

    if any(w in q for w in ('hi', 'hello', 'hey', 'vanakkam', 'hey')):
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


def responder_reply(text, turn=0, username='chat'):
    """Return the Responder's answer for a user message.

    Agentic: first tries to detect + execute an action (run cycle, approve/
    reject draft, delete lead, set cadence, send report), then phrases the
    result in the user's language. Falls back to conversation, then keywords.
    """
    from .actions import detect_action, execute  # late import — pipeline is heavy

    spec = detect_action(text)
    if spec and spec.get('action') != 'none':
        try:
            result = execute(spec, username=username)
        except Exception as exc:
            log.warning('chat action failed (%s): %s', spec, exc)
            result = 'That action failed on the server — check the logs.'
        if result:
            return _phrase_reply(text, result)

    if llm_available():
        try:
            result = _llm_reply(text, turn)
            if result:
                return result
        except Exception as exc:
            log.warning('LLM Responder failed, falling back to keywords: %s', exc)

    return _keyword_reply(text, turn)


def _phrase_reply(text, action_result):
    """Have Gemini phrase the action result in the user's language/style;
    plain result text when no AI key is set."""
    if not llm_available():
        return action_result
    system = (
        'You executed an action in a sales-agent app on the user\'s request. '
        'Tell them what happened, in ONE or TWO short friendly sentences, plain text, '
        'no markdown. Stay exactly faithful to the result — add no new claims. '
        f'{LANGUAGE_RULES[detect_language_style(text)]}'
    )
    try:
        phrased = llm_complete(
            f'USER ASKED: {text}\n\nACTION RESULT: {action_result}\n\n'
            f'Tell the user the outcome briefly.',
            system=system, timeout=45)
        return _humanize(phrased) or action_result
    except Exception:
        return action_result
