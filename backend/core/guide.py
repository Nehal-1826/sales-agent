"""In-product AI guide — Gemini answers "how do I use this product?" questions.

Grounded in a product knowledge base plus the workspace's live state (what is
configured, what is pending), so the guide can onboard a brand-new user with
concrete next steps ("you haven't set SMTP yet — Settings → Email Delivery").
Language matches the user (Tanglish / Tamil / English), same as the Responder.
"""

import logging

from .ai import llm_available, llm_complete
from .chat import _humanize, detect_language_style
from .mailer import smtp_configured
from .models import AppSettings, EmailDraft, EmailTemplate, Lead, PipelineRun, Potential

log = logging.getLogger(__name__)

FALLBACK_ANSWER = (
    'Quick tour: Pipeline → Run cycle discovers new leads. CRM → OUTREACH shows the drafted '
    'cold emails — review, edit, then Approve & send. Settings configures your AI key, SMTP, '
    'email templates, report email and run frequency. (Set an AI key in Settings for full AI answers.)'
)

PRODUCT_KB = """PRODUCT: Shailog Technologies — Marketing & Sales AI (autonomous lead machine).

THE PIPELINE (runs automatically on a schedule or via Pipeline → "Run cycle"):
Search discovers companies worldwide via DuckDuckGo → Profile visits each site, audits it
(flaws, contact email, 0-100 potential score) and Gemini writes a real company description
from the site text → Copywright drafts a personalized cold email using the user's default
template + description + audit findings → drafts wait for human approval → Responder/chat
handles conversations. Nothing is ever emailed without the user clicking Approve.

PAGES:
- Dashboard: everything at a glance — lead map/table with filters (industry, country,
  web presence, contact, min score), CRM overview, chat preview.
- Pipeline: the agent chain with live stats, "Run cycle" button for a manual run, last
  cycle summary, run history. Run cadence is set in Settings → Frequent Runs
  (15 min / hourly / 6 h / daily).
- Agents: per-agent config (Search / Profile / Copywright / Responder): API endpoint,
  system prompt, negative prompt, and the AI model (e.g. gemini-flash-lite-latest).
- CRM: four columns — LEADS (discovered, with AI description + score), POTENTIAL
  (score 65+, opportunities), OUTREACH (drafts: Edit / Approve & send / Reject /
  Retry send on failure; recipient email can be fixed in Edit), REPLY (conversations).
- Chat: talk to the Responder in English, Tamil or Tanglish — it knows the live CRM
  and can TAKE ACTIONS: "run a cycle", "find me leads", "approve the draft for <company>",
  "reject the draft for <company>", "delete the lead <company>", "run daily / hourly /
  every 15 minutes / every 6 hours", "pause the runs", "resume the runs",
  "send the report now". Confirm what it did in its reply.
- Settings: Company profile; AI Key (provider + key, stored server-side, masked);
  Email Delivery SMTP (host/port/user/password/from — approved emails send from here,
  without it they print to the server console); Email Templates (write manually or
  upload .txt/.md/.html — first line "Subject: ..." becomes the subject; one default
  template; placeholders {{company}} {{industry}} {{website}} {{description}}
  {{findings}} {{sender_name}} {{sender_website}} {{services}}); Daily Report
  (emailed daily 8 PM IST); Password change; Frequent Runs (cadence toggle).
- Login/logout: branded login page; Sign out is at the bottom of the left sidebar.

FIRST-RUN CHECKLIST (suggest these in order when things are missing):
1. Settings → AI Key (provider + key) — no AI key means template-only drafts and
   keyword chat replies.
2. Settings → Email Delivery (SMTP) — needed to actually send approved emails.
3. Settings → Email Templates — make one good default template (or keep the starter).
4. Settings → Daily Report email — where the daily summary goes.
5. Pipeline → Run cycle — fills the CRM with the first leads and drafts.
6. CRM → OUTREACH — review drafts, fix recipient emails, Approve & send.

TROUBLESHOOTING:
- "no email found" on a draft: the lead's site had no address — click Edit and type the
  real recipient, or Reject.
- Failed send with a red error: usually a bad recipient domain or SMTP credentials —
  fix and click Retry send.
- No new leads from a cycle: DuckDuckGo sometimes rate-limits an IP; run again later.
- Backend: not running chip / mock data: the Django backend is down; the UI falls back
  to demo data. On a VPS the worker container runs cycles 24/7 (health at /api/health/).
- Approved emails go out with the branded dark logo header, designer layout and
  an orange "See our work" button linking to the company website.
"""


def workspace_state():
    """Live snapshot so the guide can point at what's missing for THIS user."""
    s = AppSettings.load()
    return (
        'WORKSPACE STATE (live right now):\n'
        f'- Leads in CRM: {Lead.objects.count()} '
        f'(profiled: {Lead.objects.filter(profiled=True).count()})\n'
        f'- Potentials: {Potential.objects.count()}\n'
        f'- Email drafts awaiting approval: '
        f'{EmailDraft.objects.filter(status="draft").count()}\n'
        f'- AI key configured: {"yes" if s.ai_key else "NO — tell the user to set Settings → AI Key"}\n'
        f'- SMTP configured: {"yes" if smtp_configured(s) else "NO — tell the user to set Settings → Email Delivery"}\n'
        f'- Email templates: {EmailTemplate.objects.count()} '
        f'(default exists: {EmailTemplate.objects.filter(is_default=True).exists()})\n'
        f'- Daily report email: {s.report_email or "not set"}\n'
        f'- Autonomous runs: {"enabled" if s.runs_enabled else "paused"}, '
        f'every {s.get_run_frequency_display().lower()}\n'
        f'- Pipeline runs so far: {PipelineRun.objects.count()}\n'
    )


def guide_answer(question, history=None):
    """One guide answer via Gemini — and the guide can ACT: commands
    ("run a cycle", "approve the draft for X", "do it yourself" after a
    suggestion) are executed for real, then confirmed in the reply.
    Friendly static pointer without an AI key."""
    from .actions import detect_action, execute  # late import — pipeline is heavy

    spec = detect_action(question, history)
    if spec and spec.get('action') != 'none':
        try:
            result = execute(spec, username='guide')
        except Exception as exc:
            log.warning('guide action failed (%s): %s', spec, exc)
            result = 'That action failed on the server — check the logs.'
        if result:
            return _phrase_action(question, result)

    if not llm_available():
        return FALLBACK_ANSWER
    style = detect_language_style(question)
    convo = ''
    if history:
        lines = [f'{"USER" if h.get("from") == "user" else "GUIDE"}: {h.get("text", "")}'
                 for h in history[-8:]]
        convo = 'RECENT CONVERSATION:\n' + '\n'.join(lines) + '\n\n'
    system = (
        'You are the friendly in-product guide for Shailog Marketing & Sales AI. '
        'You help users learn to use the product: explain features, give exact click-paths '
        '(page → section → button), and suggest the best next step from the workspace state. '
        'You can also PERFORM actions for the user when asked (run cycles, approve/reject '
        'drafts, delete leads, change cadence, send reports) — if one was just executed, '
        'the conversation will show its result. Answer ONLY from the product knowledge base '
        'and workspace state — never invent features that are not listed. Keep answers short '
        '(under 120 words), step-by-step, plain text, no markdown bold/headings. If the user '
        'asks something unrelated to the product, steer gently back to it. '
        'If the conversation shows an action was already performed and the user asks you to '
        'do it, confirm it is already done — do NOT send them clicking. ' +
        ('The user writes in Tanglish — reply in natural Tanglish.'
         if style == 'tanglish' else
         'The user writes in Tamil script — reply in Tamil script.'
         if style == 'tamil' else
         'Reply in friendly, natural English.')
    )
    prompt = (
        f'{PRODUCT_KB}\n\n{workspace_state()}\n\n'
        f'{convo}'
        f'USER QUESTION: {question}\n\n'
        'Answer with the exact click-path and, when the workspace state shows something '
        'missing, the logical next step. When an action was already performed for the '
        'user, do not tell them to click it themselves — report what happened instead.'
    )
    try:
        result = llm_complete(prompt, system=system, timeout=60)
        return _humanize(result) if result else FALLBACK_ANSWER
    except Exception as exc:
        log.warning('Guide LLM call failed: %s', exc)
        return FALLBACK_ANSWER


def _phrase_action(question, action_result):
    """Confirm an executed action briefly, in the user's language."""
    if not llm_available():
        return action_result
    try:
        phrased = llm_complete(
            f'USER ASKED: {question}\n\nACTION PERFORMED: {action_result}\n\n'
            f'Confirm to the user what you just did, in 1-2 short friendly sentences.',
            system=('You executed an action in the product for the user. Confirm exactly what '
                    'happened, plain text, no markdown, no new claims. ' +
                    {'tanglish': 'Reply in natural Tanglish.',
                     'tamil': 'Reply in Tamil script.'}.get(detect_language_style(question),
                                                            'Reply in friendly English.')),
            timeout=45)
        return _humanize(phrased) or action_result
    except Exception:
        return action_result
