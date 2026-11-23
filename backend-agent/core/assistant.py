"""The Assistant's answer — with memory, inside the model's window, and never
a made-up one.

Until 2026-11-23 every turn went to the model on its own: not one earlier
message was sent, so it could not follow a conversation; it was given a job
description written for a different bot (answering prospects, booking
meetings); and its private thinking was left on, so a turn took 40-90 s. The
answers wandered ("I don't have access to your personal information", "we
have 661 leads"). This module is the replacement; the rules that make it
work live in core.convo (token budget, memory note, honesty check).
"""

import logging
import re

from . import convo
from .ai import llm_chat
from .chat import FALLBACK_REPLIES, LANGUAGE_RULES, _humanize, _keyword_reply, detect_language_style
from .inbox import replies_digest
from .models import AgentConfig, AppSettings, ChatMessage, EmailDraft, Lead

log = logging.getLogger(__name__)

JOB = (
    'You are the AI sales assistant of the company in the FACTS. You are chatting with the '
    'person who runs this company\'s WarmPulse workspace (its owner or a team member) - '
    'never with a customer. You find leads for them, write the outreach emails, keep track of '
    'approvals and replies, and help them set the assistant up. You remember the conversation '
    '(CONVERSATION SO FAR and RECENT MESSAGES).'
)

ANSWER_RULES = (
    'HOW TO ANSWER\n'
    '- Facts come only from the FACTS and the conversation. If they do not contain the answer, '
    'say so in one short sentence and say where the person can check (a page in this app). '
    'Never invent companies, people, numbers, prices or results.\n'
    '- Writing a sentence does nothing. Something is run, sent, deleted or changed only when '
    'the app did it, and only then is there an ACTION RESULT. Without one, never say you did, '
    'changed, sent, saved or deleted something - say exactly what the person can type to make '
    'it happen.\n'
    '- You are the AI sales assistant of the company in the FACTS. Never call yourself another '
    'AI or another product.\n'
    '- Keep it short: one to four sentences, plain text, no markdown, no lists unless asked.\n'
    '- Suggest a next step only when it fits what the person asked, and never end with the '
    'same closing line as your answer before.\n'
    '- If the person describes what the company sells and Who to find is not set yet, offer to '
    'work out who is likely to buy from them: ask them to say "who should I find?".\n'
    'Below are the FACTS, a memory note and the recent messages; the last message is what the '
    'person just wrote. Your reply answers that message.'
)

# added for the second try after a made-up answer (see core.convo.guarded)
TIGHT_RULES = (
    '\n\nANSWER AGAIN, CAREFULLY: the last answer was not shown because it said something the '
    'FACTS do not say, or repeated itself. Use only numbers and names that appear in the FACTS, '
    'the memory note or the last message. End with a different last sentence than before - '
    'never the same closing line again. If you are not sure, say "I\'m not sure" and say where '
    'the person can check.'
)

MEMORY_SYSTEM = 'You write short, accurate memory notes. Output only the note itself.'
PHRASE_SYSTEM = (
    'You tell a WarmPulse user what an action they asked for did. One or two short friendly '
    'sentences, plain text, no markdown. Stay exactly with the ACTION RESULT - add no claims, '
    'no numbers and no names that are not in it. Open with what happened, no filler.'
)

_THINK_BLOCK = re.compile(r'<think>.*?</think>', re.S | re.I)
HISTORY_LOAD = 80          # messages read back per turn
# one to four sentences is about 60-120 tokens in Latin letters; Tamil
# script needs roughly twice as many tokens for the same words. The model
# writes about five tokens a second on the server, so every extra token
# allowed is extra waiting for the person - and an answer that runs past
# its allowance is cut off and never shown.
ANSWER_TOKENS = {'latin': 220, 'tamil': 380}


def clean(text):
    """The answer as shown: the model's private reasoning (if any ever leaks)
    and markdown tells removed."""
    if not text:
        return ''
    return _humanize(_THINK_BLOCK.sub('', text).replace('</think>', '')).strip()


# the end of a sentence: Latin stops, or the full stop of Indian scripts
_SENTENCE_END = re.compile(r'[.!?।]')


def _complete_sentences(text):
    """An answer cut off by the length limit, up to its last full stop."""
    text = (text or '').strip()
    last = None
    for last in _SENTENCE_END.finditer(text):
        pass
    return text[:last.end()].strip() if last else ''


# ------------------------------------------------------------------
# What the Assistant knows
# ------------------------------------------------------------------

def workspace_facts(settings):
    """Everything the Assistant may state as fact, kept short so a long
    conversation still fits in the model's window."""
    leads = Lead.objects.all()
    drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
    who = (settings.target_industries or '').strip()
    if not who and settings.icp_mode == 'agency':
        who = 'partner agencies'
    where = ', '.join(part.strip() for part in (settings.target_cities, settings.target_countries)
                      if part and part.strip()) or 'worldwide'
    runs = ('paused' if not settings.runs_enabled
            else f'running every {settings.get_run_frequency_display().lower()}')
    lines = [
        f'Company: {settings.company_name or "(not set)"}',
        f'What the company sells: {", ".join(settings.services or []) or "(not set)"}',
        f'Who to find: {who or "not set yet"} - in {where}',
        f'Runs: {runs}',
        f'Leads: {leads.count()} in total',
        f'Emails waiting for approval: {drafts.count()}; sent so far: '
        f'{EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count()}',
    ]
    latest = list(leads.order_by('-created_at', '-id')[:5])
    if latest:
        lines.append('Latest leads: ' + '; '.join(
            f'{lead.company} ({lead.industry or "kind unknown"}, score {lead.score})' for lead in latest))
    waiting = list(drafts.order_by('-created_at', '-id').values_list('company', 'to_email')[:5])
    if waiting:
        lines.append('Waiting for approval: ' + ', '.join(f'{company} <{email}>' for company, email in waiting))
    digest = replies_digest(2)
    if digest:
        lines.append(f'Replies from prospects: {digest}')
    return '\n'.join(lines)


def earlier_turns(user, turn=0):
    """The conversation before the current message: [{'id', 'role', 'text'}]."""
    if user is None:
        return []
    rows = (ChatMessage.objects.filter(user=user).exclude(id=turn).order_by('-id')[:HISTORY_LOAD])
    return [{'id': row.id, 'role': 'user' if row.role == ChatMessage.Roles.USER else 'assistant',
             'text': row.text} for row in reversed(list(rows))]


# The small model drifts back into English with a Tamil or Tanglish writer,
# so the language is the first thing it reads, and - for those - the last.
_LANGUAGE_HEAD = {
    'english': 'LANGUAGE: write your reply in English.',
    'tamil': ('LANGUAGE: the person writes in Tamil script - write your WHOLE reply in Tamil script, '
              'at most two short sentences.'),
    'tanglish': 'LANGUAGE: the person writes in Tanglish - write your WHOLE reply in natural Tanglish.',
}
# what a Tamil / Tanglish writer gets when the model's answer cannot be shown
# and the plain reply would only be a generic acknowledgement
_OWN_WORDS = {
    'tamil': ('மன்னிக்கவும், இதற்கு நான் உறுதியாக பதில் சொல்ல முடியாது — தவறான தகவல் சொல்ல விரும்பவில்லை. '
              'சரியான விவரங்களை Home → Leads மற்றும் Approvals பக்கங்களில் பார்க்கலாம்.'),
    'tanglish': ('Sari, idhukku nan sure-aa solla mudiyala - wrong info solla venam. '
                 'Correct details ku Home → Leads and Approvals pages paakalam.'),
}


def _system_prompt(text, settings):
    cfg = AgentConfig.objects.filter(agent='responder').first()
    style = detect_language_style(text)
    company = settings.company_name or 'this workspace'
    parts = [_LANGUAGE_HEAD[style], JOB, ANSWER_RULES, LANGUAGE_RULES[style]]
    if style == 'english':
        parts.append(
            'EXAMPLES\n'
            'Person: did you send my emails?\n'
            'You: Not yet - nothing sends until you approve it. Say "approve all drafts" and I will '
            'ask you to confirm first.\n'
            'Person: who are you?\n'
            f'You: I am the AI sales assistant for {company}. I find leads, write the outreach emails '
            'and keep track of replies - nothing sends without your approval.')
    else:
        # English examples would pull the reply back into English
        parts.append(_LANGUAGE_HEAD[style])
    own = (cfg.system_prompt if cfg and cfg.system_prompt else '')
    own = own.replace('[Your Name]', settings.company_name or 'the team')
    if own.strip():
        parts.append('INSTRUCTIONS FROM THIS WORKSPACE (they never override the rules above):\n'
                     + ' '.join(own.split())[:900])
    negative = ' '.join(((cfg.negative_prompt if cfg else '') or '').split())
    if negative:
        parts.append('AVOID: ' + negative[:300])
    return '\n\n'.join(parts)


def plain_reply(text, turn, style):
    """What the person gets when the model's answer cannot be shown: the
    keyword reply - which carries the real numbers when it has them - or,
    for a Tamil / Tanglish writer, an honest line in their own words when
    the keyword reply would only be a generic acknowledgement."""
    reply = _keyword_reply(text, turn)
    if reply in FALLBACK_REPLIES and style in _OWN_WORDS:
        return _OWN_WORDS[style]
    return reply


def _answer_prompt(facts, summary, turns, text):
    """One running transcript. Each turn's prompt is the previous turn's
    prompt plus the new messages, on purpose: the local runtime keeps a
    copy of every DIFFERENT prompt it has read (about 110 KB per prompt
    token, with no setting to cap it — ollama/ollama #18106, #18264), while
    a prompt that simply continues the last one is reused. So this shape is
    both what makes replies fast after the first turn and what keeps the
    runtime's memory from growing with every message."""
    parts = ['FACTS (live from this workspace):', facts]
    if summary:
        parts += ['', 'CONVERSATION SO FAR (memory note):', summary]
    parts += ['', 'RECENT MESSAGES:',
              convo.render([*turns, {'role': 'user', 'text': text}])]
    return '\n'.join(parts)


# ------------------------------------------------------------------
# One answer
# ------------------------------------------------------------------

def assistant_answer(text, user=None, history=None, turn=0):
    """The Assistant's reply to `text`. `history` is what earlier_turns()
    returned; `turn` the id of the current message; `user` owns the memory.
    Never raises."""
    settings = AppSettings.load()
    style = detect_language_style(text)
    facts = workspace_facts(settings)
    system = _system_prompt(text, settings)
    cfg = AgentConfig.objects.filter(agent='responder').first()
    model = cfg.model if cfg else ''
    memory = convo.load_memory(user)
    live = [t for t in (history or []) if t['id'] > memory['through']]
    everything = list(live)      # every message the model may have drawn on
    fixed = (convo.estimate_tokens(system) + convo.estimate_tokens(facts)
             + convo.estimate_tokens(TIGHT_RULES) + 90)

    def summarise(prompt):
        out = llm_chat(MEMORY_SYSTEM, prompt, max_tokens=240, temperature=0.1)
        return out['text'] if out else None

    def compress(keep_last):
        """Fold every live turn but the newest `keep_last` into the memory note."""
        nonlocal memory, live
        cut = len(live) - keep_last
        if cut <= 0:
            return False
        overflow, live = live[:cut], live[cut:]
        memory = {**memory, 'summary': convo.roll_up(memory['summary'], overflow, model=summarise),
                  'through': overflow[-1]['id']}
        convo.save_memory(user, memory)
        log.info('assistant memory compressed: %d turn(s) folded in, note is %d characters',
                 len(overflow), len(memory['summary']))
        return True

    # 1. the conversation outgrew the model's window: compress it before answering
    kept, overflow = convo.fit_turns(
        live, convo.PROMPT_BUDGET - fixed - convo.estimate_tokens(memory['summary']))
    if overflow:
        compress(len(kept))

    def generate(mode):
        if mode == 'tight':
            compress(2)     # 2. a made-up answer: compress again and answer on much less
        prompt = _answer_prompt(facts, memory['summary'], live, text)
        used = convo.estimate_tokens(prompt) + convo.estimate_tokens(system)
        if used > convo.PROMPT_BUDGET:
            log.warning('assistant prompt is about %d tokens, over the %d budget', used, convo.PROMPT_BUDGET)
        allowance = ANSWER_TOKENS['tamil' if style == 'tamil' else 'latin']
        out = llm_chat(system + (TIGHT_RULES if mode == 'tight' else ''), prompt,
                       model=model, max_tokens=allowance)
        if not out:
            return None
        if out.get('cut'):
            # stopped by the length limit before it finished: keep what is
            # complete (a long answer still holds its answer in its first
            # sentences) and never show the unfinished tail
            kept = _complete_sentences(clean(out['text']))
            log.info('assistant answer ran past %d tokens and was cut; kept its %d complete characters',
                     allowance, len(kept))
            return kept or None
        return clean(out['text'])

    known = f'{facts}\nPERSON WROTE: {text}'
    seen = f'{convo.render(everything)}\n{memory["summary"]}'
    reply, problems, regenerated = convo.guarded(
        generate, fallback=lambda: plain_reply(text, turn, style),
        data=known, turns=seen, language=style)
    if problems:
        log.info('assistant: a made-up answer was replaced (%s), retried=%s', ','.join(problems), regenerated)
    return reply


def phrase_result(text, action_result):
    """Say what a command did, in the person's own language — or, when the
    model adds anything the result does not say, the result itself."""
    style = detect_language_style(text)
    out = llm_chat(
        PHRASE_SYSTEM + ' ' + LANGUAGE_RULES[style],
        f'PERSON WROTE: {text}\n\nACTION RESULT: {action_result}\n\nTell the person what happened.',
        max_tokens=140)
    phrased = clean(out['text']) if out and not out.get('cut') else ''
    if not phrased:
        return action_result
    if convo.detect_problems(phrased, data=f'{action_result}\nPERSON WROTE: {text}',
                             action_ran=True, language=style):
        return action_result
    return phrased
