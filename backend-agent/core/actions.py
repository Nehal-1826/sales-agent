"""Agentic chat actions — the Responder can DO things, not just talk.

Flow: classify the user's message into one action (regex fast-path, then
Gemini JSON classification for natural/Tanglish phrasing) → execute it
safely → return a short human summary the Responder phrases in the user's
language.

Actions: run_pipeline (background thread), approve_draft, reject_draft,
delete_lead, set_frequency, send_report. Company names are resolved ONLY
against real Lead / EmailDraft rows — no hallucinated targets.
"""

import json
import logging
import re
from datetime import timedelta

from django.utils import timezone

from .ai import llm_available, llm_chat
from .lead_gate import LeadFetchNotReady, lead_fetch_reason, missing_lead_data
from .mailer import valid_recipient
from .outbox import enqueue_draft, kick_drain, queued_phrase
from .models import AppSettings, EmailDraft, Lead, SearchProfile
from .permissions import is_privileged
from .reports import send_daily_report

log = logging.getLogger(__name__)

ACTION_NAMES = ('run_pipeline', 'approve_draft', 'approve_all', 'reject_draft',
                'delete_lead', 'set_frequency', 'set_report_email', 'send_report',
                'switch_profile', 'draft_email', 'suggest_targeting', 'none')

# Actions that change or send things for real — they wait for an explicit "yes"
CONFIRM_ACTIONS = {'approve_draft', 'approve_all', 'reject_draft', 'delete_lead',
                   'switch_profile', 'set_report_email', 'suggest_targeting'}
PENDING_TTL_MINUTES = 10
_YES_POLITE = r'(?:[\s,]+(?:please|thanks|pls|do it))?'
_NO_POLITE = r'(?:[\s,]+(?:please|thanks|pls|wait))?'   # "yes, wait" must never confirm
_YES = re.compile(r'^\s*(yes|y|yeah|yep|sure|ok|okay|confirm|go ahead|do it|haan|ha|aama|seri|sari)\b'
                  + _YES_POLITE + r'[\s.!]*$', re.I)
_NO = re.compile(r'^\s*(no|n|nope|nah|cancel|stop|don\'?t|venda|vendam|illa)\b'
                 + _NO_POLITE + r'[\s.!]*$', re.I)
_NEGATION = re.compile(r"\b(don'?t|do not|not yet|never|shouldn'?t|wouldn'?t|without)\b", re.I)
_QUESTION_START = re.compile(r'^\s*(should|would|could|can|will|when|what|why|how|is|are|do|does|did|which|who)\b', re.I)

EMAIL_IN_TEXT = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

# "send a mail to Acme" / "draft an email for Acme" — company extracted from
# the tail after to/for; resolved against real Lead rows at execution time.
DRAFT_EMAIL_RE = re.compile(
    r'\b(?:draft|write|prepare|create|compose|send)\s+(?:me\s+)?(?:an?\s+)?'
    r'(?:cold\s+)?(?:outreach\s+)?(?:e-?mail|mail)\s+(?:to|for)\s+(.+?)\s*[.!]?\s*$', re.I)

# "who should I find?" / "who is likely to buy from us?" — the Assistant can
# work that out itself (core.business_profile); everything before the
# question is what the owner says the company does. Only real requests
# count: "where do I set who to find?" is a question about the product.
_WHO_TO_FIND_RE = re.compile(
    r'\bwho\s+(?:should|do|shall|can|would|will)\s+(?:i|we|you\s+)?\s*(?:find|look for|target|go after)|'
    r'\b(?:what|which) (?:businesses|companies|kinds? of (?:businesses|companies))\s+'
    r'(?:should|do|shall|can|would|will)\s+(?:i|we|you\s+)?\s*(?:find|look for|target|go after)|'
    r'\b(?:work out|suggest|tell me|choose|pick|decide|figure out)(?: me)? who to find|'
    r'^\s*who to find\??\s*$|'
    r'\bwho (?:is|are|\'re) (?:likely )?to buy\b|\bwho buys from (?:us|me)\b|'
    r'\bwork out (?:who|what|my|our)\b.{0,30}\b(?:find|target|buy)|\bsuggest (?:me )?(?:who|some leads|targeting)\b',
    re.I)
# "we publish journals and run conferences" — a plain statement of what the
# company does (never a question: those are handled above)
_WE_SELL_RE = re.compile(
    r'^\s*(?:we|i|our company|our business)\s+(?:sell|sells|offer|offers|provide|provides|do|does|'
    r'build|builds|make|makes|publish|publishes|run|runs|speciali[sz]e in|are a|\'re a|am a)\b[^?]*$', re.I)
# without one of these words a message cannot be a command — small talk
# never costs a model call
_COMMAND_HINT = re.compile(
    r'\b(run|running|start|trigger|cycle|pipeline|approve|approval|send|sending|mail|email|'
    r'delete|remove|pause|stop|resume|enable|report|switch|activate|profile|draft|write|'
    r'compose|reject|cadence|frequency|hourly|daily|leads?|do it|go ahead|yourself)\b', re.I)


def _targeting_request(text, settings=None):
    """'about' text when the message asks who to find — or says what the
    company sells while Who to find is still empty. '' otherwise."""
    text = (text or '').strip()
    m = _WHO_TO_FIND_RE.search(text)
    if m:
        return text[:m.start()].strip(' .,;-') or text
    if _WE_SELL_RE.match(text):
        settings = settings or AppSettings.load()
        if not (settings.target_industries or '').strip():
            return text
    return ''


# ------------------------------------------------------------------
# Detection
# ------------------------------------------------------------------

_FREQ_PATTERNS = [
    (r'15\s*(min|minute)', '15m'),
    (r'\bhourly\b|every\s*hour|1\s*hour', '1h'),
    (r'6\s*hour', '6h'),
    (r'\bdaily\b|every\s*day|once\s*a\s*day', 'daily'),
]


def is_question_or_negation(text):
    """Questions and negations are conversation, never commands — 'should I
    send all the drafts?' must not send them."""
    t = (text or '').strip()
    return t.endswith('?') or bool(_NEGATION.search(t)) or bool(_QUESTION_START.match(t))


def detect_action_regex(text):
    """Fast keyword path — returns an action spec or None (let the LLM try)."""
    q = text.lower()
    if re.search(r'\b(pause|stop|disable)\b.*\brun|stop\s*the\s*loop', q):
        return {'action': 'set_frequency', 'frequency': 'pause'}
    if re.search(r'\b(resume|enable)\b.*\brun|start\s*the\s*loop', q):
        return {'action': 'set_frequency', 'frequency': 'resume'}
    if re.search(r'approve\s+(all|every|everything)\b|send\s+all\s+(the\s+)?(drafts|emails)', q):
        return {'action': 'approve_all'}
    if re.search(r'\b(delete|remove)\b.*\blead\b', q):
        # name = whatever follows the word "lead"; empty → asks which one
        name = re.split(r'\blead\b', text, maxsplit=1, flags=re.I)[1].strip(' .!"\'')
        return {'action': 'delete_lead', 'company': name}
    # "the daily report recipient is x@y.com" / "send reports to x@y.com" —
    # an email address plus the word 'report' means the recipient is being set
    if 'report' in q and EMAIL_IN_TEXT.search(text):
        return {'action': 'set_report_email', 'email': EMAIL_IN_TEXT.search(text).group(0)}
    m = DRAFT_EMAIL_RE.search(text)
    if m:
        return {'action': 'draft_email', 'company': m.group(1).strip()}
    profile_switch = (re.search(r'\b(switch|activate|change|use|go (back|to))\b.*\bprofile|\bprofile\b.*\b(switch|activate)\b', q)
                      or re.search(r'\b(switch|activate)\b', q))
    if profile_switch:
        from .models import SearchProfile
        try:
            profiles = list(SearchProfile.objects.values_list('name', flat=True))
        except Exception:
            profiles = []
        # "switch back to shailog" (no word 'profile') qualifies only when a
        # distinctive profile token (shailog/backup/buyer/agency…) appears
        token_hit = any(re.search(rf'\b{re.escape(tok)}\b', q)
                        for p in profiles for tok in _profile_tokens(p))
        explicit = re.search(r'\bprofile\b', q)
        if profiles and (explicit or token_hit):
            target = next((p for p in profiles if p.lower() in q), None)
            # raw phrase falls through — execute()'s token matcher resolves
            # "the backup one" / "shailog" style language
            return {'action': 'switch_profile', 'profile': target or text}
    m = re.search(r'\b(run|start|trigger)\b.*\b(cycle|pipeline)\b|find\s+(me\s+)?(new\s+)?leads|get\s+(me\s+)?leads', q)
    if m:
        return {'action': 'run_pipeline'}
    if re.search(r'send\s+(the\s+)?(test\s+)?(daily\s+)?(test\s+)?report|report\s+now|daily\s+report\s+now', q):
        return {'action': 'send_report'}
    freq = next((v for pat, v in _FREQ_PATTERNS if re.search(pat, q)), '')
    if freq and re.search(r'\b(run|frequency|schedule|cadence|set)\b', q):
        return {'action': 'set_frequency', 'frequency': freq}
    return None


def _companies_context():
    """Real rows only — the classifier may only pick names from these lists."""
    leads = list(Lead.objects.values_list('company', flat=True)[:30])
    drafts = list(EmailDraft.objects.filter(status='draft').values_list('company', flat=True)[:30])
    return leads, drafts


_SPEC_SCHEMA = {'type': 'object', 'properties': {
    'action': {'type': 'string', 'enum': list(ACTION_NAMES)},
    'company': {'type': 'string'}, 'frequency': {'type': 'string'}, 'profile': {'type': 'string'},
    'email': {'type': 'string'}, 'about': {'type': 'string'}},
    'required': ['action']}
# only these fields mean anything for each action — anything else the model
# fills in ("run_pipeline" with a company attached) is dropped
_SPEC_FIELDS = {'approve_draft': ('company',), 'reject_draft': ('company',),
                'delete_lead': ('company',), 'draft_email': ('company',),
                'set_frequency': ('frequency',), 'set_report_email': ('email',),
                'switch_profile': ('profile',), 'suggest_targeting': ('about',)}


def detect_action_llm(text, history=None):
    """The model classifies the message → strict JSON; {'action': 'none'} on
    any doubt. `history` (recent chat/guide turns) lets "do it yourself"
    resolve to the action that was just suggested. On the self-hosted
    runtime the answer's shape is locked by a schema (core.ai.llm_chat)."""
    if not llm_available():
        return {'action': 'none'}
    leads, drafts = _companies_context()
    from .models import SearchProfile
    profiles = list(SearchProfile.objects.values_list('name', flat=True))
    convo = ''
    if history:
        lines = [f'{"USER" if h.get("from") == "user" else "ASSISTANT"}: {h.get("text", "")}'
                 for h in history[-8:]]
        convo = 'RECENT CONVERSATION:\n' + '\n'.join(lines) + '\n\n'
    system = (
        'You classify commands for a sales-agent app. Respond with ONLY minified '
        'JSON, no markdown, no explanation. Schema: '
        '{"action":"' + '|'.join(ACTION_NAMES) + '",'
        '"company":"","frequency":"15m|1h|6h|daily|pause|resume","profile":"","email":"","about":""} '
        'Rules: company must be EXACTLY one of the listed company names (or ""). '
        'approve_draft/reject_draft pick from DRAFT COMPANIES; delete_lead from LEAD COMPANIES. '
        'draft_email = the user wants a NEW outreach email drafted for one of the LEAD '
        'COMPANIES ("send a mail to X", "draft an email for X") — company from LEAD COMPANIES. '
        'set_report_email = the user is TELLING you the report recipient (e.g. "the daily '
        'report recipient is x@y.com", "send reports to x@y.com") — put the address in email. '
        'send_report = email the daily report NOW (no address given). '
        'set_frequency also covers "every hour", "hourly", "run daily" (frequency 1h, 1h, daily) '
        'and "stop running" / "pause" (frequency pause). '
        'suggest_targeting = the user asks who they should find or target, or who is likely to '
        'buy from them ("who should I find?", "work out who to find"); when they also say what '
        'they sell ("we sell online courses - who should I find?"), put that in about. '
        'profile: the EXACT profile name when the user says it; when they use their own '
        'words ("the backup one", "shailog"), echo those words in profile — the '
        'executor fuzzy-matches them against the saved profiles. '
        'approve_all = approve and send EVERY awaiting draft at once. '
        'switch_profile = activate one of the saved lead-targeting profiles. '
        'Only pick an action when the user clearly asks for it; otherwise "none". '
        'A question that only asks whether or should ("should I send all drafts?", "did you '
        'send it?") is "none", and so is talking about something that already happened. '
        'set_frequency needs a frequency. run_pipeline = start a discovery/draft cycle. '
        'If the user asks the assistant to perform a previously suggested action '
        '("do it", "you do it", "do it yourself", "go ahead"), resolve WHICH action '
        'from the conversation history and output it.'
    )
    prompt = (
        f'LEAD COMPANIES: {json.dumps(leads)}\n'
        f'DRAFT COMPANIES (awaiting approval): {json.dumps(drafts)}\n'
        f'PROFILE NAMES: {json.dumps(profiles)}\n\n'
        f'{convo}'
        f'USER MESSAGE: {text}\n\nJSON:'
    )
    try:
        out = llm_chat(system, prompt, max_tokens=140, timeout=120, temperature=0,
                       schema=_SPEC_SCHEMA)
        raw = (out['text'] if out else '') or ''
        m = re.search(r'\{.*\}', raw.strip().replace('```', ''), re.S)
        spec = json.loads(m.group(0)) if m else {}
        action = spec.get('action')
        if action not in ACTION_NAMES or action == 'none':
            return {'action': 'none'}
        clean = {'action': action}
        for field in _SPEC_FIELDS.get(action, ()):
            if str(spec.get(field) or '').strip():
                clean[field] = str(spec[field]).strip()[:300]
        return clean
    except Exception as exc:
        log.warning('action classification failed: %s', exc)
        return {'action': 'none'}


def detect_action(text, history=None):
    spec = detect_action_regex(text)
    if spec:
        return spec
    if not _COMMAND_HINT.search(text or ''):
        return {'action': 'none'}    # small talk: not worth a model call
    return detect_action_llm(text, history)


# ------------------------------------------------------------------
# Execution
# ------------------------------------------------------------------

_PROFILE_STOPWORDS = {'the', 'and', 'for', 'with', 'to', 'a', 'an', 'profile',
                      'targeting', 'partners', 'partner', 'mode', 'search', 'tech'}


def _profile_tokens(name):
    return {t for t in re.split(r'[^a-z0-9]+', name.lower())
            if len(t) > 3 and t not in _PROFILE_STOPWORDS}


def match_profile(query, profiles):
    """Resolve a chat phrase ("the backup one", "shailog") to a profile.
    Exact name → containment → distinctive-token overlap (backup/buyer/
    shailog/agency…), preferring the most overlap."""
    q = (query or '').strip().lower()
    if not q or not profiles:
        return None
    exact = next((p for p in profiles if p.name.lower() == q), None)
    if exact:
        return exact
    contained = next((p for p in profiles if q in p.name.lower() or p.name.lower() in q), None)
    if contained:
        return contained
    q_tokens = _profile_tokens(q)
    best, best_overlap = None, 0
    for p in profiles:
        overlap = len(q_tokens & _profile_tokens(p.name))
        if overlap > best_overlap:
            best, best_overlap = p, overlap
    return best if best_overlap else None


def _match_company(name, candidates):
    """All candidates the name could mean: an exact match wins, else every
    containment match.  Empty name matches nothing."""
    n = (name or '').strip().lower()
    if not n:
        return []
    exact = next((c for c in candidates if c.lower() == n), None)
    if exact:
        return [exact]
    return list(dict.fromkeys(c for c in candidates if n in c.lower() or (len(c) >= 3 and c.lower() in n)))


def _no_single_match(kind, matches, waiting):
    if len(matches) > 1:
        return f'Which one? {", ".join(matches[:5])}'
    waiting = list(waiting)
    return (f'No matching {kind}.' +
            (f' Waiting: {", ".join(waiting[:5])}.' if waiting else ''))


def execute(spec, username='chat'):
    """Run one action spec. Returns a short human-readable result string."""
    action = spec.get('action')

    if action == 'run_pipeline':
        from .pipeline import start_pipeline_async  # late import — heavy module
        from billing.entitlements import BillingError
        try:
            started = start_pipeline_async(f'chat:{username}')
        except LeadFetchNotReady as exc:   # no proper data: lead finding stays off
            return str(exc)
        except BillingError as exc:   # unpaid / runs per day / lead quota: say so, run nothing
            return ("I can't start a cycle: " + (
                'your subscription is inactive.' if exc.payload['error'] == 'payment_required'
                else f"your plan's {exc.payload['meter']} limit is reached ({exc.payload['used']}/{exc.payload['limit']})."))
        if not started:
            return 'A cycle is already running — I\'ll have results in a few minutes.'
        return ('Started a full pipeline cycle in the background — Search, Profile and '
                'Copywright are working; results land in the CRM in a couple of minutes.')

    if action == 'approve_draft':
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        if spec.get('draft_ids') is not None:
            # targets were resolved when the user was asked to confirm
            drafts = drafts.filter(id__in=spec['draft_ids'])
            company = spec.get('company') or ''
        else:
            matches = _match_company(spec.get('company'), list(drafts.values_list('company', flat=True)))
            if len(matches) != 1:
                return _no_single_match('draft to approve', matches, drafts.values_list('company', flat=True))
            company = matches[0]
        draft = drafts.filter(company=company).first() if company else drafts.first()  # one email per company per approval
        if draft is None:
            return 'No matching draft to approve — it may already have been handled.'
        company = draft.company
        if not valid_recipient(draft.to_email):
            return (f'The draft for {company} has no valid recipient email — add one in '
                    'Approvals, then approve it.')
        draft = enqueue_draft(draft.id)  # claim + queue — the outbox paces sending
        if draft is None:
            return f'The email to {company} is already being sent.'
        kick_drain()
        remaining = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT, company=company).count()
        extra = f' {remaining} more draft(s) waiting for this company.' if remaining else ''
        return f'Approved the email to {company} ({draft.to_email}) — {queued_phrase(draft)}.{extra}'

    if action == 'approve_all':
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        if spec.get('draft_ids') is not None:
            drafts = drafts.filter(id__in=spec['draft_ids'])  # only what was confirmed
        drafts = list(drafts)
        if not drafts:
            return ('Nothing is waiting — no drafts need approval right now. '
                    'Run a cycle and I\'ll queue the next batch.')
        sent, failed, skipped = 0, [], []
        for draft in drafts:
            if not valid_recipient(draft.to_email):
                skipped.append(draft.company)  # never guess an address
                continue
            claimed = enqueue_draft(draft.id)
            if claimed is None:
                continue  # another request already took it
            sent += 1
        if sent:
            kick_drain()
        summary = (f'Approved {sent} of {len(drafts)} draft(s) — they are queued and go out '
                   'gradually during sending hours to protect your mailbox')
        if skipped:
            summary += (f'. Skipped {len(skipped)} with no recipient email: '
                        + ', '.join(skipped[:3]) + (' …' if len(skipped) > 3 else ''))
        if failed:
            summary += (f'. {len(failed)} failed: ' + '; '.join(failed[:3])
                        + (' …' if len(failed) > 3 else ''))
        elif not skipped:
            summary += ' ✅'
        return summary

    if action == 'reject_draft':
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        if spec.get('draft_ids') is not None:
            company = spec.get('company') or 'that company'
            drafts = drafts.filter(id__in=spec['draft_ids'])
        else:
            matches = _match_company(spec.get('company'), list(drafts.values_list('company', flat=True)))
            if len(matches) != 1:
                return _no_single_match('draft to reject', matches, [])
            company = matches[0]
            drafts = drafts.filter(company=company)
        count = drafts.update(status=EmailDraft.Statuses.REJECTED)
        return f'Rejected {count} draft(s) for {company}.'

    if action == 'delete_lead':
        matches = _match_company(spec.get('company'), list(Lead.objects.values_list('company', flat=True)))
        if len(matches) != 1:
            return _no_single_match('lead to delete', matches, [])
        from .pipeline import _norm_domain  # late import — heavy module
        for lead in Lead.objects.filter(company=matches[0]):
            # unsent mail must not go out, and the domain must not be rediscovered
            lead.drafts.filter(status__in=[EmailDraft.Statuses.DRAFT,
                                           EmailDraft.Statuses.FAILED,
                                           EmailDraft.Statuses.QUEUED]).update(status=EmailDraft.Statuses.REJECTED)
            domain = _norm_domain(lead.website)
            if domain:
                settings = AppSettings.load()
                if domain not in (settings.rejected_domains or []):
                    settings.rejected_domains = list(settings.rejected_domains or []) + [domain]
                    settings.save(update_fields=['rejected_domains'])
            lead.delete()
        return f'Deleted the lead {matches[0]} (and its potentials), rejected its unsent emails and blacklisted its domain.'

    if action == 'set_frequency':
        s = AppSettings.load()
        freq = (spec.get('frequency') or '').lower()
        if freq == 'pause':
            s.runs_enabled = False
            s.save(update_fields=['runs_enabled', 'updated_at'])
            return 'Paused the autonomous runs — trigger cycles manually anytime.'
        if freq in ('resume', '15m', '1h', '6h', 'daily'):
            # autopilot is a way of fetching leads: it needs the same proper
            # data as the "Find leads now" button (core.lead_gate)
            missing = missing_lead_data(s)
            if missing:
                return "I can't switch autopilot on yet — " + lead_fetch_reason(missing)
        if freq == 'resume':
            s.runs_enabled = True
            s.save(update_fields=['runs_enabled', 'updated_at'])
            return 'Resumed the autonomous runs.'
        if freq in ('15m', '1h', '6h', 'daily'):
            s.run_frequency = freq
            s.runs_enabled = True
            s.save(update_fields=['run_frequency', 'runs_enabled', 'updated_at'])
            label = {'15m': '15 minutes', '1h': 'hour', '6h': '6 hours', 'daily': 'day'}[freq]
            return f'Pipeline now runs automatically every {label}.'
        return 'Which cadence? Say 15 minutes, hourly, 6 hours or daily.'

    if action == 'set_report_email':
        email = (spec.get('email') or '').strip().lower()
        if not EMAIL_IN_TEXT.match(email):
            return 'That doesn\'t look like an email address — try "report recipient is you@company.com".'
        settings = AppSettings.load()
        settings.report_email = email
        settings.save(update_fields=['report_email', 'updated_at'])
        return (f'Done — the daily report (8 PM IST) now goes to {email}. '
                'Say "send the report" if you want one right now.')

    if action == 'send_report':
        status, subject = send_daily_report()
        if status == 'smtp':
            return f'Emailed the daily report ({subject}).'
        if status == 'console':
            return 'SMTP is not configured — the report printed to the server console.'
        return 'No report recipient set — add one in Settings → Daily Report.'

    if action == 'draft_email':
        from .pipeline import _draft_email  # late import — heavy module
        companies = list(Lead.objects.values_list('company', flat=True))
        matches = _match_company(spec.get('company'), companies)
        if len(matches) > 1:
            return f'Which one? {", ".join(matches[:5])}'
        company = matches[0] if matches else None
        if not company:
            recent = ', '.join(companies[:5]) if companies else 'none yet — run a cycle first'
            return f'No lead matching "{spec.get("company")}". Leads in the CRM: {recent}.'
        lead = Lead.objects.filter(company=company).first()
        active = lead.drafts.filter(status__in=[EmailDraft.Statuses.DRAFT,
                                                EmailDraft.Statuses.APPROVED,
                                                EmailDraft.Statuses.QUEUED])
        if active.exists():
            return (f'{lead.company} already has an email waiting for approval — find it in '
                    f'Approvals, or say "approve the draft for {lead.company}".')
        subject, _body, _used_llm = _draft_email(lead)
        EmailDraft.objects.create(
            lead=lead, company=lead.company, to_email=lead.contact_email,
            subject=subject, body=_body, findings=lead.findings[:3],
            status=EmailDraft.Statuses.DRAFT,
        )
        to = lead.contact_email or '(no address found — fix the recipient in Outreach)'
        return (f'Drafted an email to {lead.company} ({to}) — it\'s waiting in the approval '
                f'queue. Say "approve the draft for {lead.company}" to send it, or review it '
                'in Outreach first.')

    if action == 'switch_profile':
        from .models import SearchProfile
        profiles = list(SearchProfile.objects.all())
        if not profiles:
            return 'There are no saved targeting profiles yet — create one in Settings → Search Profiles.'
        # the spec carries either a profile name or the raw phrase — token
        # overlap resolves "the backup one" / "shailog" style chat language
        profile = match_profile(spec.get('profile'), profiles)
        if profile is None:
            names = ', '.join(p.name for p in profiles)
            return f'Which profile? Saved ones: {names}.'
        if profile.is_active:
            return f'"{profile.name}" is already the active profile.'
        profile.apply()
        mode = 'agency partners' if profile.icp_mode == 'agency' else 'buyers'
        return (f'Switched to "{profile.name}" ({mode}, '
                f'{profile.target_countries or "worldwide"}) — the next cycle already uses it.')

    if action == 'set_targeting':
        kinds = [k for k in (spec.get('industries') or []) if str(k).strip()][:8]
        if not kinds:
            return 'There was nothing to set — tell me what you sell and I\'ll work out who to find.'
        s = AppSettings.load()
        s.icp_mode = 'buyer'
        s.target_industries = ', '.join(kinds)
        if spec.get('countries'):
            s.target_countries = ', '.join(spec['countries'])
        s.icp_notes = str(spec.get('notes') or '')[:6000]
        s.save(update_fields=['icp_mode', 'target_industries', 'target_countries', 'icp_notes', 'updated_at'])
        where = ', '.join(x for x in (s.target_cities, s.target_countries) if x.strip()) or 'worldwide'
        return (f'Done — Who to find is now: {", ".join(kinds)} (in {where}). The next search uses it; '
                'change it any time in Settings, Who to find.')

    return ''


# ------------------------------------------------------------------
# Confirmation flow — one entry point for chat + guide
# ------------------------------------------------------------------

def _describe(spec):
    """Prepare a confirmable action: resolve its exact targets now and say
    precisely what will happen.  Returns (summary, resolved_spec) or
    (message, None) when there is nothing to confirm."""
    action = spec['action']
    if action == 'approve_all':
        drafts = list(EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT))
        if not drafts:
            return 'Nothing is waiting — no drafts need approval right now.', None
        names = ', '.join(d.company for d in drafts[:5]) + (' …' if len(drafts) > 5 else '')
        return (f'I\'ll approve and send {len(drafts)} email(s): {names}.',
                {**spec, 'draft_ids': [d.id for d in drafts]})
    if action in ('approve_draft', 'reject_draft'):
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        matches = _match_company(spec.get('company'), list(drafts.values_list('company', flat=True)))
        if len(matches) != 1:
            return _no_single_match('draft', matches, drafts.values_list('company', flat=True)), None
        ids = list(drafts.filter(company=matches[0]).values_list('id', flat=True))
        verb = 'approve and send' if action == 'approve_draft' else 'reject'
        return f'I\'ll {verb} the email to {matches[0]}.', {**spec, 'company': matches[0], 'draft_ids': ids}
    if action == 'delete_lead':
        matches = _match_company(spec.get('company'), list(Lead.objects.values_list('company', flat=True)))
        if len(matches) != 1:
            return _no_single_match('lead', matches, []), None
        return (f'I\'ll delete the lead {matches[0]}, reject its unsent emails and never rediscover it.',
                {**spec, 'company': matches[0]})
    if action == 'switch_profile':
        profile = match_profile(spec.get('profile'), list(SearchProfile.objects.all()))
        if profile is None:
            return 'Which profile? ' + ', '.join(SearchProfile.objects.values_list('name', flat=True)), None
        if profile.is_active:
            return f'"{profile.name}" is already the active profile.', None
        return f'I\'ll switch lead targeting to "{profile.name}".', {**spec, 'profile': profile.name}
    if action == 'set_report_email':
        return f'I\'ll send the daily report to {spec.get("email")} from now on.', spec
    if action == 'suggest_targeting':
        return _describe_targeting(spec)
    return '', spec


TARGETING_UNKNOWN = (
    'I couldn\'t work out who buys from you yet. Tell me what you sell in one line — for example '
    '"we publish journals and run conferences" — and I\'ll work it out. (You can also set it '
    'yourself in Settings, Who to find.)'
)


def _describe_targeting(spec):
    """Work out who to find from what the company does, and prepare setting
    it. Returns (summary, resolved_spec) or (message, None) when there is
    nothing to offer."""
    from .business_profile import plan_targeting
    plan = plan_targeting(spec.get('about') or '')
    if plan is None:
        return TARGETING_UNKNOWN, None
    if not plan['buyers']:
        if plan['individuals']:
            return ('It looks like your customers are individual people, not businesses - so there '
                    'is no kind of company to find for you, and Who to find stays as it is.'), None
        return ('I worked out what you do, but could not name kinds of businesses that buy it - '
                'tell me a little more about your customers and I\'ll try again.'), None
    s = AppSettings.load()
    if plan['countries']:
        where = ', '.join(plan['countries'])
    else:
        where = ', '.join(x.strip() for x in (s.target_cities, s.target_countries)
                          if x and x.strip()) or 'worldwide'
    said = ' '.join((spec.get('about') or '').split())
    basis = ('From what you just told me' if said and not _WHO_TO_FIND_RE.search(said)
             else 'From what your company does')
    summary = (f'{basis}, the businesses most likely to buy from you are: '
               f'{", ".join(plan["buyers"])}.')
    if plan['ideal']:
        summary += f' {plan["ideal"].rstrip(".")}.'
    summary += f' I\'ll set them as Who to find (in {where})'
    if s.icp_mode == 'agency':
        summary += ' - this switches you from partner agencies to customers'
    return summary + '.', {'action': 'set_targeting', 'industries': plan['buyers'],
                           'countries': plan['countries'], 'notes': plan['ideal']}


def _set_pending(user, value):
    user.pending_action = value
    user.save(update_fields=['pending_action'])


NOT_ALLOWED = ('That needs the workspace owner or an admin. I can still answer questions '
               'about your leads and emails.')


def handle_command(text, user, history=None):
    """One entry point for chat + guide.  '' = not a command (let the
    conversational reply answer)."""
    pending = (getattr(user, 'pending_action', None) or {}) if user else {}
    if pending:
        expired = pending.get('expires', '') < timezone.now().isoformat()
        if not expired and _YES.match(text):
            _set_pending(user, {})
            if not is_privileged(user):   # role may have changed since it was stored
                return NOT_ALLOWED
            return execute(pending['spec'], username=user.username)
        if expired and _YES.match(text):
            _set_pending(user, {})
            return 'That confirmation expired, so nothing was done. Ask again if you still want it.'
        if _NO.match(text):
            _set_pending(user, {})
            return 'Okay — cancelled, nothing was changed.'
        _set_pending(user, {})   # any other message drops the stale confirmation
    # "who should I find?" is a question AND a request: the Assistant can work
    # the answer out itself from what the company does
    about = _targeting_request(text)
    if about:
        spec = {'action': 'suggest_targeting', 'about': about}
    else:
        if is_question_or_negation(text):
            return ''
        spec = detect_action(text, history)
    if not spec or spec.get('action') == 'none':
        return ''
    # chat is a second door to the same operations as the API: every action
    # (send mail, switch targeting, run cycles, change cadence/report address,
    # delete leads) is owner/admin only — a member only gets answers
    if user is not None and not is_privileged(user):
        return NOT_ALLOWED
    if spec['action'] not in CONFIRM_ACTIONS:
        return execute(spec, username=getattr(user, 'username', 'chat'))
    summary, resolved = _describe(spec)
    if resolved is None:
        return summary
    if user is None:
        return summary + ' Open the Assistant to confirm.'
    _set_pending(user, {'spec': resolved, 'summary': summary,
                        'expires': (timezone.now() + timedelta(minutes=PENDING_TTL_MINUTES)).isoformat()})
    return f'{summary} Reply "yes" to confirm or "no" to cancel.'


def pending_summary(user):
    """Summary of the action awaiting a yes/no (the API's pendingAction)."""
    p = getattr(user, 'pending_action', None) or {}
    return p.get('summary') if p and p.get('expires', '') >= timezone.now().isoformat() else None
