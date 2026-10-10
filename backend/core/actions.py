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

ACTION_NAMES = ('run_pipeline', 'approve_draft', 'reject_draft', 'delete_lead',
                'set_frequency', 'send_report', 'none')


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
    m = re.search(r'\b(run|start|trigger)\b.*\b(cycle|pipeline)\b|find\s+(me\s+)?(new\s+)?leads|get\s+(me\s+)?leads', q)
    if m:
        return {'action': 'run_pipeline'}
    if re.search(r'send\s+(the\s+)?(test\s+)?report|report\s+now', q):
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
    convo = ''
    if history:
        lines = [f'{"USER" if h.get("from") == "user" else "ASSISTANT"}: {h.get("text", "")}'
                 for h in history[-8:]]
        convo = 'RECENT CONVERSATION:\n' + '\n'.join(lines) + '\n\n'
    system = (
        'You classify commands for a sales-agent app. Respond with ONLY minified '
        'JSON, no markdown, no explanation. Schema: '
        '{"action":"run_pipeline|approve_draft|reject_draft|delete_lead|set_frequency|send_report|none",'
        '"company":"","frequency":"15m|1h|6h|daily|pause|resume"} '
        'Rules: company must be EXACTLY one of the listed company names (or ""). '
        'approve_draft/reject_draft pick from DRAFT COMPANIES; delete_lead from LEAD COMPANIES. '
        'Only pick an action when the user clearly asks for it; otherwise "none". '
        'set_frequency needs a frequency. run_pipeline = start a discovery/draft cycle. '
        'send_report = email the daily report now. '
        'If the user asks the assistant to perform a previously suggested action '
        '("do it", "you do it", "do it yourself", "go ahead"), resolve WHICH action '
        'from the conversation history and output it.'
    )
    prompt = (
        f'LEAD COMPANIES: {json.dumps(leads)}\n'
        f'DRAFT COMPANIES (awaiting approval): {json.dumps(drafts)}\n\n'
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

    if action == 'send_report':
        status, subject = send_daily_report()
        if status == 'smtp':
            return f'Emailed the daily report ({subject}).'
        if status == 'console':
            return 'SMTP is not configured — the report printed to the server console.'
        return 'No report recipient set — add one in Settings → Daily Report.'

    return ''
