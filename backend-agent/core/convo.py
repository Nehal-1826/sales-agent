"""The Assistant's memory, kept inside the model's head — and its honesty guard.

The local model is small and its memory window is 4,096 tokens. Two things go
wrong with a conversation that grows, and both were seen live:

  * it no longer fits  -> the runtime silently cuts the oldest part, which is
    the instructions, and the model forgets how to behave;
  * it starts making things up -> invented lead counts ("we have 661 leads"),
    invented companies, "I've sent the report" when nothing ran.

So every turn is built to a token budget. What no longer fits is compressed
into a short memory note (roll_up) instead of being dropped; and every answer
is checked (detect_problems). A flagged answer is never shown: the
conversation is compressed at once and the model answers again on the shorter
context (guarded); if that fails too, the caller's honest fallback is used.
"""

import logging
import os
import re
from collections import Counter

log = logging.getLogger(__name__)

# The window the self-hosted runtime loads (OLLAMA default num_ctx on the VPS)
# and how much of it a prompt may use — the rest is the answer and a margin.
# A bigger box can raise both through the environment.
CONTEXT_TOKENS = int(os.environ.get('AI_CONTEXT_TOKENS') or 4096)
PROMPT_BUDGET = int(os.environ.get('AI_PROMPT_BUDGET') or 2600)
SUMMARY_CHARS = 1100          # the memory note is never longer than this
_TURN_OVERHEAD = 6            # "Assistant: " + separators


# ------------------------------------------------------------------
# Size
# ------------------------------------------------------------------

_NON_ASCII = re.compile(r'[^\x00-\x7f]+')


def estimate_tokens(text):
    """Rough token count, deliberately a little high: the live model read
    2,930 characters as 689 tokens, so English is counted at 3.6 characters
    per token; every other letter (Tamil script…) counts as a whole token."""
    if not text:
        return 0
    wide = sum(len(found) for found in _NON_ASCII.findall(text))
    return int((len(text) - wide) / 3.6) + wide + 1


def fit_turns(turns, budget):
    """(kept, overflow): the newest turns that fit in `budget` tokens, and
    the older ones that do not. The newest turn is always kept — cut short
    when it alone is too big."""
    kept, used = [], 0
    for turn in reversed(turns):
        need = estimate_tokens(turn['text']) + _TURN_OVERHEAD
        if kept and used + need > budget:
            break
        kept.append(turn)
        used += need
    kept.reverse()
    if kept and used > budget:
        newest = dict(kept[-1])
        newest['text'] = newest['text'][:max(0, int((budget - _TURN_OVERHEAD - 1) * 3.4))]
        kept[-1] = newest
    return kept, list(turns[:len(turns) - len(kept)])


# ------------------------------------------------------------------
# Memory
# ------------------------------------------------------------------

def load_memory(user):
    """{'summary', 'through'} — the note about messages up to id `through`."""
    memory = (getattr(user, 'chat_memory', None) or {}) if user else {}
    try:
        through = int(memory.get('through') or 0)
    except (TypeError, ValueError):
        through = 0
    return {'summary': str(memory.get('summary') or ''), 'through': through}


def save_memory(user, memory):
    if user is None:
        return
    user.chat_memory = {'summary': memory.get('summary', ''), 'through': memory.get('through', 0)}
    user.save(update_fields=['chat_memory'])


def render(turns):
    return '\n'.join(f'{"User" if t["role"] == "user" else "Assistant"}: {t["text"]}' for t in turns)


_ROLLUP_PROMPT = (
    'You keep the memory of a conversation between a business owner and their sales assistant.\n'
    'EARLIER MEMORY:\n{previous}\n\n'
    'MESSAGES:\n{messages}\n\n'
    'Write the updated memory in at most 90 words: what the user told us about their business, '
    'what they asked for, what was decided or done, and anything still open. '
    'Use ONLY the messages above — invent nothing. Plain lines, no title, no markdown.'
)


def _plain_rollup(previous, turns):
    """No model: the earlier note plus the opening words of each message —
    lossy, but every word was really written by the user or the assistant."""
    parts = [previous.strip()] if previous and previous.strip() else []
    parts += [f'{"User" if t["role"] == "user" else "Assistant"}: '
              + ' '.join(t['text'].split())[:160] for t in turns[:8]]
    return ' | '.join(part for part in parts if part)


def _clamp(text):
    return ' '.join(text.split())[:SUMMARY_CHARS]


def roll_up(previous, turns, model=None):
    """Compress `turns` into the memory note. `model(prompt) -> note` does it
    properly; without one (or when it fails) the messages are shortened."""
    note = ''
    if model is not None:
        try:
            note = model(_ROLLUP_PROMPT.format(previous=(previous or '').strip() or '(nothing yet)',
                                               messages=render(turns)))
        except Exception as exc:
            log.warning('memory note failed: %s', exc)
            note = ''
    if not note or not str(note).strip():
        note = _plain_rollup(previous, turns)
    return _clamp(str(note))


# ------------------------------------------------------------------
# What is wrong with an answer
# ------------------------------------------------------------------

_THINK_TAG = re.compile(r'</?think>', re.I)
# the model's private reasoning, leaked into the answer
_LEAKED_REASONING = re.compile(
    r'^\s*(?:okay|alright|right|so)[,!]?\s+(?:so\s+)?the\s+user\s+(?:is|was|wants|asked|asks|has|needs|wrote|said)\b',
    re.I)
_OTHER_AI = re.compile(
    r'\b(?:as an ai|language model|chatgpt|openai|claude|anthropic|gemini|copilot|perplexity|grok)\b', re.I)
_PLACEHOLDER = re.compile(r'\[(?:your name|your company|company|sender name|website|recipient)\]', re.I)
# it always knows the workspace's own details — this reply is simply wrong
_FALSE_REFUSAL = re.compile(
    r"\b(?:don'?t|do not|can'?t|cannot) have access to (?:your|the|any) (?:personal|account|company|workspace)\b",
    re.I)
_TAMIL = re.compile(r'[\u0B80-\u0BFF]')
# An answer that stops on a comma, an opening bracket or a dangling little
# word ("…and the first one is") broke off. An answer that simply ends on a
# word is fine — "Settings → Mailboxes & speed" is a complete last line.
_UNFINISHED_END = re.compile(
    r'[,;(\[\-–—/+:]\s*$|[\s\-–—](?:and|or|but|so|with|to|of|the|a|an|for|in|is|are|was|were|'
    r'that|this|it|as|by|on|at|from|your|our|my)\s*$', re.I)

_DONE = ('sent|emailed|mailed|deleted|removed|approved|rejected|updated|changed|saved|set|paused|'
         'resumed|switched|queued|started|ran|cancelled|canceled|scheduled')
# "I've sent the report" — when nothing ran, that is a made-up success
_CLAIMS_DONE = re.compile(r"\b(?:i|i'?ve|i have)\s+(?:just\s+|already\s+)?(?:" + _DONE + r')\b', re.I)
_CLAIMS_QUEUED = re.compile(
    r"\b(?:i|i'?ve|i have)\s+(?:just\s+|already\s+)?(?:drafted|created|added)\b[^.\n]{0,60}"
    r'\b(?:waiting|queue|approvals?|for you|crm|sent)\b', re.I)

_COUNTABLE = (r'leads?|potentials?|drafts?|replies|emails?|e-?mails?|companies|opportunit(?:y|ies)|'
              r'messages?|tasks?|cycles?|runs?|prospects?|contacts?|clients?|customers?')
# a number presented as a workspace total ("you have 5 leads")
_TOTAL = re.compile(
    r'(?:you have|there (?:are|is)|we have|i (?:see|found|count)|total of|totals|shows?)\s+'
    r'(?:about\s+|around\s+|only\s+|exactly\s+|just\s+|another\s+)?'
    r'(\d{1,7}(?:,\d{3})*)\s*\+?\s*(?:new\s+|more\s+|awaiting\s+|pending\s+|waiting\s+)*'
    r'(?:' + _COUNTABLE + r')\b', re.I)
# a big count attached to a workspace thing ("661 leads", "150 companies")
_BIG_COUNT = re.compile(r'(\d{3,7}(?:,\d{3})*)\s*\+?\s*(?:new\s+|more\s+)?(?:' + _COUNTABLE + r')\b', re.I)

_PERSON_INTRO = re.compile(r'\b(?:hi|hello|hey|dear|thanks?,)\s+([A-Z][a-z]{2,})\b')
_DOING = (r'wants|said|replied|asked|needs|is interested|is looking|just booked|confirmed|replied|'
          r'has asked|is waiting')
_SUBJECT = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:' + _DOING + r')\b')
_ORG = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b')      # two or more capitalised words

# Capitalised words that are part of talking about this product, days, places
# and languages — not a made-up company or person.
_COMMON_CAPS = {
    'the', 'this', 'that', 'these', 'those', 'your', 'you', 'we', 'our', 'its', 'let', 'here', 'there',
    'when', 'where', 'what', 'which', 'who', 'why', 'how', 'now', 'today', 'tomorrow', 'yesterday',
    'and', 'but', 'for', 'with', 'from', 'into', 'not', 'can', 'could', 'would', 'should', 'will',
    'then', 'than', 'them', 'they', 'their', 'been', 'was', 'were', 'are', 'have', 'has', 'had',
    'one', 'two', 'three', 'any', 'all', 'some', 'every', 'each', 'first', 'next', 'last', 'latest',
    'new', 'best', 'top', 'right', 'step', 'steps', 'page', 'pages', 'way', 'open', 'run', 'find',
    'check', 'approve', 'send', 'delete', 'pause', 'resume', 'start', 'draft', 'write', 'switch',
    'reject', 'report', 'follow', 'fetch', 'add', 'yes', 'okay', 'sure', 'thanks', 'thank', 'hey',
    'hello', 'hi', 'good', 'morning', 'evening', 'night', 'happy', 'nice', 'great', 'welcome', 'sorry',
    'please', 'also', 'just', 'anything', 'something', 'nothing', 'everything', 'anyone', 'someone',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february',
    'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'english', 'tamil', 'tanglish', 'india', 'indian', 'chennai', 'delhi', 'mumbai', 'bengaluru',
    'bangalore', 'salem', 'coimbatore', 'madurai', 'trichy', 'hyderabad', 'kolkata', 'pune', 'ahmedabad',
    'kochi', 'nadu', 'kerala', 'karnataka', 'andhra', 'pradesh', 'telangana', 'maharashtra', 'united',
    'states', 'kingdom', 'uae', 'dubai', 'singapore', 'canada', 'australia', 'germany', 'europe',
    'asia', 'africa', 'america', 'warm', 'name', 'company', 'owner', 'team', 'boss', 'friend',
    'ai', 'crm', 'home', 'settings', 'assistant', 'pipeline', 'search', 'profile', 'profiles',
    'responder', 'outreach', 'replies', 'reply', 'mail', 'mailbox', 'mailboxes', 'whatsapp', 'linkedin',
    'gmail', 'zoho', 'google', 'warmpluse', 'cycle', 'daily', 'drafts', 'lead', 'leads', 'tasks',
    'task', 'templates', 'advanced', 'activity', 'results', 'summary', 'approvals', 'cycles',
}


def _repeats(text):
    sentences = [s.strip().lower() for s in re.split(r'[.!?\n]+', text) if s.strip()]
    counts = Counter(sentences)
    return any(n >= 3 or (n >= 2 and len(s) >= 20) for s, n in counts.items())


def _made_up_numbers(text, known):
    """Workspace counts in the answer that appear nowhere it could have
    come from. Small numbers are only counts when phrased as a total —
    "in 2 minutes" or "top 5 leads" is not a fact."""
    known_numbers = {n.replace(',', '') for n in re.findall(r'\d[\d,]*', known)}
    found = {n.replace(',', '') for n in _TOTAL.findall(text)}
    found |= {n.replace(',', '') for n in _BIG_COUNT.findall(text)}
    return sorted(n for n in found if n.lstrip('0') not in known_numbers and n not in known_numbers)


def _made_up_names(text, known):
    """A company or person the answer talks about that nobody mentioned."""
    known_words = set(re.findall(r'[a-z0-9]+', known.lower()))

    def unknown(name):
        words = [w for w in re.findall(r'[a-z]+', name.lower()) if len(w) >= 3]
        return bool(words) and not any(w in known_words for w in words) \
            and not all(w in _COMMON_CAPS for w in words)

    names = [m.group(1) for m in _PERSON_INTRO.finditer(text)]
    names += [m.group(1) for m in _SUBJECT.finditer(text)]
    names += [m.group(1) for m in _ORG.finditer(text)]
    return sorted({name.strip() for name in names if unknown(name)})


def detect_problems(reply, *, data='', turns='', action_ran=False, language='english'):
    """Why an answer must not be shown, as sorted codes — [] when it is fine.

    `data` is everything the model was given as fact (the workspace
    snapshot, the memory note), `turns` the earlier conversation; a number
    or a name that is in neither was made up. `action_ran` is True only
    when a command really ran just before."""
    text = (reply or '').strip()
    if not text:
        return ['empty']
    problems = set()
    if len(text) > 2500:
        problems.add('too_long')
    if _UNFINISHED_END.search(text):
        problems.add('cut_off')      # stopped before the sentence ended
    if _THINK_TAG.search(text) or _LEAKED_REASONING.search(text):
        problems.add('thinking_leak')
    if _OTHER_AI.search(text):
        problems.add('identity_leak')
    if _PLACEHOLDER.search(text):
        problems.add('placeholder')
    if _FALSE_REFUSAL.search(text):
        problems.add('false_refusal')
    if _repeats(text):
        problems.add('repeat')
    if not action_ran and (_CLAIMS_DONE.search(text) or _CLAIMS_QUEUED.search(text)):
        problems.add('claims_action')
    known = f'{data}\n{turns}'
    if _made_up_numbers(text, known):
        problems.add('ungrounded_numbers')
    if _made_up_names(text, known):
        problems.add('ungrounded_names')
    if language == 'tamil' and not _TAMIL.search(text):
        problems.add('language')
    return sorted(problems)


# ------------------------------------------------------------------
# Answer, check, compress, answer again
# ------------------------------------------------------------------

def guarded(generate, fallback, *, data, turns='', action_ran=False, language='english'):
    """(reply, problems, regenerated). `generate(mode)` answers on the
    'normal' context; when that answer is made up, the caller has compressed
    the conversation and `generate('tight')` answers again on the shorter
    one. Two bad answers never reach the user: `fallback()` does."""
    seen = []
    for mode in ('normal', 'tight'):
        reply = generate(mode)
        # the retry no longer shows the earlier messages, so it is judged without them
        problems = detect_problems(reply, data=data, turns=turns if mode == 'normal' else '',
                                   action_ran=action_ran, language=language)
        if not problems:
            return reply, seen, mode == 'tight'
        if not seen:
            seen = problems
        log.info('assistant answer flagged (%s): %r', ','.join(problems), (reply or '')[:160])
    return fallback(), seen, True
