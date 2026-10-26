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
import threading

from .ai import llm_available, llm_complete
from .mailer import send_draft
from .models import AppSettings, EmailDraft, Lead
from .reports import send_daily_report

log = logging.getLogger(__name__)

ACTION_NAMES = ('run_pipeline', 'approve_draft', 'approve_all', 'reject_draft',
                'delete_lead', 'set_frequency', 'set_report_email', 'send_report',
                'switch_profile', 'draft_email', 'none')

EMAIL_IN_TEXT = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')

# "send a mail to Acme" / "draft an email for Acme" — company extracted from
# the tail after to/for; resolved against real Lead rows at execution time.
DRAFT_EMAIL_RE = re.compile(
    r'\b(?:draft|write|prepare|create|compose|send)\s+(?:me\s+)?(?:an?\s+)?'
    r'(?:cold\s+)?(?:outreach\s+)?(?:e-?mail|mail)\s+(?:to|for)\s+(.+?)\s*[.!]?\s*$', re.I)


# ------------------------------------------------------------------
# Detection
# ------------------------------------------------------------------

_FREQ_PATTERNS = [
    (r'15\s*(min|minute)', '15m'),
    (r'\bhourly\b|every\s*hour|1\s*hour', '1h'),
    (r'6\s*hour', '6h'),
    (r'\bdaily\b|every\s*day|once\s*a\s*day', 'daily'),
]


def detect_action_regex(text):
    """Fast keyword path — returns an action spec or None (let the LLM try)."""
    q = text.lower()
    if re.search(r'\b(pause|stop|disable)\b.*\brun|stop\s*the\s*loop', q):
        return {'action': 'set_frequency', 'frequency': 'pause'}
    if re.search(r'\b(resume|enable)\b.*\brun|start\s*the\s*loop', q):
        return {'action': 'set_frequency', 'frequency': 'resume'}
    if re.search(r'approve\s+(all|every|everything)|approve\s+\S+\s+drafts|send\s+all\s+(the\s+)?(drafts|emails)', q):
        return {'action': 'approve_all'}
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


def detect_action_llm(text, history=None):
    """Gemini classification → strict JSON; {'action': 'none'} on any doubt.
    `history` (recent chat/guide turns) lets "do it yourself" resolve to the
    action that was just suggested."""
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
        '{"action":"run_pipeline|approve_draft|approve_all|reject_draft|delete_lead|set_frequency|set_report_email|send_report|switch_profile|draft_email|none",'
        '"company":"","frequency":"15m|1h|6h|daily|pause|resume","profile":"","email":""} '
        'Rules: company must be EXACTLY one of the listed company names (or ""). '
        'approve_draft/reject_draft pick from DRAFT COMPANIES; delete_lead from LEAD COMPANIES. '
        'draft_email = the user wants a NEW outreach email drafted for one of the LEAD '
        'COMPANIES ("send a mail to X", "draft an email for X") — company from LEAD COMPANIES. '
        'set_report_email = the user is TELLING you the report recipient (e.g. "the daily '
        'report recipient is x@y.com", "send reports to x@y.com") — put the address in email. '
        'send_report = email the daily report NOW (no address given). '
        'profile: the EXACT profile name when the user says it; when they use their own '
        'words ("the backup one", "shailog"), echo those words in profile — the '
        'executor fuzzy-matches them against the saved profiles. '
        'approve_all = approve and send EVERY awaiting draft at once. '
        'switch_profile = activate one of the saved lead-targeting profiles. '
        'Only pick an action when the user clearly asks for it; otherwise "none". '
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
        raw = llm_complete(prompt, system=system, timeout=45) or ''
        raw = raw.strip().replace('```', '').strip()
        m = re.search(r'\{.*\}', raw, re.S)
        spec = json.loads(m.group(0)) if m else {}
        if spec.get('action') not in ACTION_NAMES:
            return {'action': 'none'}
        return {
            'action': spec['action'],
            'company': (spec.get('company') or '').strip(),
            'frequency': (spec.get('frequency') or '').strip(),
            'profile': (spec.get('profile') or '').strip(),
            'email': (spec.get('email') or '').strip(),
        }
    except Exception as exc:
        log.warning('action classification failed: %s', exc)
        return {'action': 'none'}


def detect_action(text, history=None):
    spec = detect_action_regex(text)
    if spec:
        return spec
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
    n = (name or '').strip().lower()
    if not n:
        return None
    exact = next((c for c in candidates if c.lower() == n), None)
    if exact:
        return exact
    return next((c for c in candidates if n in c.lower() or c.lower() in n), None)


def execute(spec, username='chat'):
    """Run one action spec. Returns a short human-readable result string."""
    action = spec.get('action')

    if action == 'run_pipeline':
        from .pipeline import run_pipeline  # late import — heavy module
        threading.Thread(
            target=run_pipeline, kwargs={'triggered_by': f'chat:{username}'}, daemon=True,
        ).start()
        return ('Started a full pipeline cycle in the background — Search, Profile and '
                'Copywright are working; results land in the CRM in a couple of minutes.')

    if action == 'approve_draft':
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        company = _match_company(spec.get('company'), list(drafts.values_list('company', flat=True)))
        if not company:
            pending = list(drafts.values_list('company', flat=True))
            return ('No matching draft to approve.' +
                    (f' Drafts waiting: {", ".join(pending)}.' if pending else ' There are no drafts awaiting approval.'))
        draft = drafts.filter(company=company).first()  # one email per company per approval
        draft.status = EmailDraft.Statuses.APPROVED
        draft.save(update_fields=['status', 'updated_at'])
        draft = send_draft(draft)
        remaining = drafts.filter(company=company).count()
        extra = f' {remaining} more draft(s) waiting for this company.' if remaining else ''
        if draft.status == EmailDraft.Statuses.SENT:
            via = 'console (SMTP not configured)' if draft.sent_via == EmailDraft.Via.CONSOLE else 'via SMTP'
            return f'Approved and sent the email to {company} ({draft.to_email}) {via}.{extra}'
        return f'Tried to send the email to {company} but it failed: {draft.error}'

    if action == 'approve_all':
        drafts = list(EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT))
        if not drafts:
            return ('Nothing is waiting — no drafts need approval right now. '
                    'Run a cycle and I\'ll queue the next batch.')
        sent, failed = 0, []
        for draft in drafts:
            draft.status = EmailDraft.Statuses.APPROVED
            draft.save(update_fields=['status', 'updated_at'])
            draft = send_draft(draft)
            if draft.status == EmailDraft.Statuses.SENT:
                sent += 1
            else:
                failed.append(f'{draft.company} ({(draft.error or "")[:60]})')
        summary = f'Approved and sent {sent} of {len(drafts)} draft(s)'
        if failed:
            summary += (f'. {len(failed)} failed: ' + '; '.join(failed[:3])
                        + (' …' if len(failed) > 3 else ''))
        else:
            summary += ' ✅'
        return summary

    if action == 'reject_draft':
        drafts = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT)
        company = _match_company(spec.get('company'), list(drafts.values_list('company', flat=True)))
        if not company:
            return 'No matching draft to reject.'
        count = drafts.filter(company=company).update(status=EmailDraft.Statuses.REJECTED)
        return f'Rejected {count} draft(s) for {company}.'

    if action == 'delete_lead':
        leads = Lead.objects.all()
        matches = [c for c in leads.values_list('company', flat=True)
                   if spec.get('company', '').lower() in c.lower() or c.lower() in spec.get('company', '').lower()]
        if not matches:
            return 'No matching lead to delete.'
        if len(matches) > 1:
            return (f'{len(matches)} leads match that name ({", ".join(matches[:4])}) — '
                    'tell me the exact one to delete.')
        Lead.objects.filter(company=matches[0]).delete()
        return f'Deleted the lead {matches[0]} (and its drafts/potentials).'

    if action == 'set_frequency':
        s = AppSettings.load()
        freq = (spec.get('frequency') or '').lower()
        if freq == 'pause':
            s.runs_enabled = False
            s.save(update_fields=['runs_enabled', 'updated_at'])
            return 'Paused the autonomous runs — trigger cycles manually anytime.'
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
        company = _match_company(spec.get('company'), companies)
        if not company:
            recent = ', '.join(companies[:5]) if companies else 'none yet — run a cycle first'
            return f'No lead matching "{spec.get("company")}". Leads in the CRM: {recent}.'
        lead = Lead.objects.filter(company=company).first()
        active = lead.drafts.exclude(status__in=[EmailDraft.Statuses.REJECTED,
                                                 EmailDraft.Statuses.FAILED])
        if active.exists():
            return (f'{lead.company} already has an active draft '
                    f'({active.first().get_status_display().lower()}) — approve it in the '
                    f'Outreach queue, or say "approve the draft for {lead.company}".')
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

    return ''
