"""In-product AI guide — Gemini answers "how do I use this product?" questions.

Grounded in a product knowledge base plus the workspace's live state (what is
configured, what is pending), so the guide can onboard a brand-new user with
concrete next steps ("you haven't set SMTP yet — Settings → Email Delivery").
Language matches the user (Tanglish / Tamil / English), same as the Responder.
"""

import itertools
import logging

from .ai import llm_available, llm_complete
from .chat import _humanize, detect_language_style
from .mailer import smtp_configured
from .permissions import is_privileged
from .models import Enrollment, OutreachTask, WhatsAppMessage, AppSettings, EmailDraft, EmailTemplate, Lead, Mailbox, PipelineRun, Potential

log = logging.getLogger(__name__)

# Rotated into the LLM prompt so consecutive answers don't all open the same
# way. Handed to the model as a directive (translated naturally when the
# reply is Tamil/Tanglish), never pasted blindly.
GUIDE_OPENERS = (
    'Hey — ',
    'Happy you asked — ',
    "Let's get you moving — ",
    'Good timing — ',
)
_OPENER_CYCLE = itertools.cycle(GUIDE_OPENERS)


def _next_opener():
    """Next opener in the rotation — variety without an LLM."""
    return next(_OPENER_CYCLE)

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
template + description + audit findings → drafts wait for human approval → Responder reads
prospect replies from the mailboxes and suggests answers for approval. Nothing is ever
emailed without the user clicking Approve.

REPLIES (left menu → Replies; the badge counts replies waiting on the user):
Every ~3 minutes the mailboxes are read (read-only — mail is never deleted, moved or
marked read; "Check for replies now" does it at once). Each reply to one of our emails
is sorted: Interested, Has a question, Not right now, Not interested, Asked to stop,
Out of office, Other. Interested / question replies get a suggested answer the user can
edit; "Approve & queue" sends it from the same mailbox in the same email thread, through
the normal sending queue. Nothing is ever answered automatically. "Mark handled" clears
a reply. People who ask to stop (unsubscribe / remove me / stop) are removed for good and
any email still waiting to go to them is cancelled. Bounced emails (address does not
exist) are stopped for good too; too many bounces pause that mailbox for 24 h.
Out-of-office auto-replies are noted but never counted as a real answer.

FOLLOW-UPS (Settings → Follow-ups):
After a cold email is sent, the company gets up to two short follow-ups: a bump after
3 working days and a "closing the loop" email 4 working days later. Each follow-up goes
in the same email thread ("Re: …"), from the same mailbox. Follow-ups wait in Approvals
like any email unless "Send follow-ups without asking" is on (off by default); either way
the sending queue paces them. Follow-ups stop at once when the company replies (an
out-of-office reply only pushes them back 3 days), the email bounces, they unsubscribe,
the deal is marked Won/Lost, the company is marked "do not contact", or the user presses
"Stop follow-ups" on the company. Optional extra steps (off by default): a LinkedIn task
(opens a LinkedIn search and gives a short note to paste — LinkedIn is never automated),
a call task, and a WhatsApp step.

TASKS (left menu → Tasks): things a person does — LinkedIn notes, calls, and "Open in
WhatsApp" links with the message already typed. Copy the text, open the link, then mark
Done or Skip.

WHATSAPP (Settings → WhatsApp, off by default): unofficial WhatsApp automation can get the
number banned by WhatsApp — use a separate number, keep volumes low (daily limit, default
20) and only message businesses that published the number. It needs the WhatsApp helper
running; log in by scanning the QR code shown in Settings. Every WhatsApp message needs
an approval in Approvals, always — even when email follow-ups are sent without asking.
Messages go out only in the sending hours. "Stop WhatsApp to this number" blocks a number
for good. With the helper off, WhatsApp steps become "Open in WhatsApp" tasks instead.

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
- Settings: Company profile; Search Profiles (saved lead-targeting presets with
  ONE-CLICK switching — Activate rewrites countries/industries/cities and the
  buyer-vs-agency mode instantly; e.g. "Shailog Tech — Agency Partners" hunts
  boutique agencies in the US/UK/Germany as project partners, "Backup" restores
  the previous buyer-targeting job); AI Key (provider + key, stored server-side,
  masked); Lead Targeting (cities, countries, industries + who counts as a lead:
  buyers of our services, or agency partners where agencies ARE the leads);
  Email Delivery SMTP (provider picker: Zoho Mail India/US/EU datacenter or
  Gmail; Zoho: username = full mailbox address, App Password when 2FA is on,
  IMAP/SMTP access enabled in Zoho Mail settings; approved emails are queued and
  sent gradually from your mailboxes (Settings → Mailboxes & speed: daily limit,
  sending hours, domain check), without one they print to the server console); Email Templates (write manually or
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


def workspace_state(user=None):
    """Live snapshot so the guide can point at what's missing for THIS user.
    Configuration (keys, mailbox, report address, schedule) is owner/admin
    information — a member gets only the CRM counts."""
    from .inbox import replies_digest
    s = AppSettings.load()
    if user is not None and not is_privileged(user):
        return (
            'WORKSPACE STATE (live right now):\n'
            f'- Leads in CRM: {Lead.objects.count()}\n'
            f'- Email drafts awaiting approval: '
            f'{EmailDraft.objects.filter(status="draft").count()}\n'
            f'- Prospect replies:\n{replies_digest(3)}\n'
            '- Workspace configuration is managed by the owner; do not describe it.\n'
        )
    # mailbox numbers are owner configuration — privileged branch only
    mailboxes = list(Mailbox.objects.all())
    m_configured = sum(1 for m in mailboxes if m.configured())
    m_warmup = sum(1 for m in mailboxes if m.configured() and m.is_active)
    return (
        'WORKSPACE STATE (live right now):\n'
        f'- Leads in CRM: {Lead.objects.count()} '
        f'(profiled: {Lead.objects.filter(profiled=True).count()})\n'
        f'- Potentials: {Potential.objects.count()}\n'
        f'- Email drafts awaiting approval: '
        f'{EmailDraft.objects.filter(status="draft").count()}\n'
        f'- AI key configured: {"yes" if s.ai_key else "NO — tell the user to set Settings → AI Key"}\n'
        f'- SMTP configured: {"yes" if smtp_configured(s) else "NO — tell the user to set Settings → Email Delivery"}\n'
        f'- Sending mailboxes: {len(mailboxes)} total, {m_configured} fully configured, '
        f'{m_warmup} warmup-capable (fully configured + active)'
        f'{"" if mailboxes else " — none yet: Settings → Mailboxes"}\n'
        f'- Email templates: {EmailTemplate.objects.count()} '
        f'(default exists: {EmailTemplate.objects.filter(is_default=True).exists()})\n'
        f'- Daily report email: {s.report_email or "not set"}\n'
        f'- Autonomous runs: {"enabled" if s.runs_enabled else "paused"}, '
        f'every {s.get_run_frequency_display().lower()}\n'
        f'- Pipeline runs so far: {PipelineRun.objects.count()}\n'
        f'- Follow-ups: {"on" if s.followups_enabled else "off"} '
        f'({"sent without asking" if s.followups_auto_approve else "wait for approval"}), '
        f'{Enrollment.objects.filter(status="active").count()} companies in a follow-up sequence\n'
        f'- Open tasks (LinkedIn / call / WhatsApp link): '
        f'{OutreachTask.objects.filter(status="open").count()}\n'
        f'- WhatsApp: {"on" if s.whatsapp_enabled else "off"}, '
        f'{WhatsAppMessage.objects.filter(status="draft").count()} messages awaiting approval\n'
        f'- Prospect replies:\n{replies_digest(3)}\n'
    )


def _fallback_answer():
    """No-AI-key tour — still anchored in this workspace's live numbers and
    ending in one concrete next step."""
    base = FALLBACK_ANSWER
    try:
        drafts = EmailDraft.objects.filter(status='draft').count()
        leads = Lead.objects.count()
        if drafts:
            base += (f' Right now: {leads} lead{"s" if leads != 1 else ""} in the CRM and '
                     f'{drafts} draft{"s" if drafts != 1 else ""} waiting — '
                     'CRM → OUTREACH is your next stop.')
        elif leads:
            base += (f' You already have {leads} lead{"s" if leads != 1 else ""} in the CRM — '
                     'start at CRM → LEADS.')
        else:
            base += ' CRM is empty — Pipeline → Run cycle fills it with your first leads.'
    except Exception:
        pass
    return base


def guide_answer(question, history=None, user=None):
    """One guide answer via Gemini — and the guide can ACT: commands
    ("run a cycle", "approve the draft for X", "do it yourself" after a
    suggestion) are executed for real, then confirmed in the reply.
    Friendly static pointer without an AI key."""
    from .actions import handle_command  # late import — pipeline is heavy

    try:
        result = handle_command(question, user, history)
    except Exception as exc:
        log.warning('guide action failed (%s): %s', question, exc)
        result = 'That action failed on the server — check the logs.'
    if result:
        if 'Reply "yes"' in result:
            return result  # confirmation prompts go out verbatim
        return _phrase_action(question, result)

    if not llm_available():
        return _fallback_answer()
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
        'do it, confirm it is already done — do NOT send them clicking. '
        'VOICE — warm, direct, human: open with the OPENER line given in the prompt '
        '(translate it naturally when you reply in Tamil or Tanglish), then answer '
        'immediately. Anchor every claim about the workspace in the WORKSPACE STATE live '
        'numbers and quote them exactly — "you have 4 drafts waiting", never "you may have '
        'drafts". Short sentences, one idea each. No filler ("certainly", "great question", '
        '"sure", "of course", "I would be happy to"). End with exactly ONE concrete next '
        'step as a click-path (page → section → button); when the first-run checklist has '
        'missing items, the first missing item IS that next step — offer it as the single '
        'best action, not a menu. ' +
        ('The user writes in Tanglish — reply in natural Tanglish.'
         if style == 'tanglish' else
         'The user writes in Tamil script — reply in Tamil script.'
         if style == 'tamil' else
         'Reply in friendly, natural English.')
    )
    prompt = (
        f'{PRODUCT_KB}\n\n{workspace_state(user)}\n\n'
        f'{convo}'
        f'OPENER: {_next_opener()}\n\n'
        f'USER QUESTION: {question}\n\n'
        'Answer with the exact click-path. Anchor every workspace claim in the live '
        'numbers above — quote them, never hedge ("you have 4 drafts waiting", not "you '
        'may have drafts"). Finish with the single best next step and its page path; if '
        'the first-run checklist has a missing item, name that item and its page. When an '
        'action was already performed for the user, do not tell them to click it '
        'themselves — report what happened instead.'
    )
    try:
        result = llm_complete(prompt, system=system, timeout=60)
        return _humanize(result) if result else _fallback_answer()
    except Exception as exc:
        log.warning('Guide LLM call failed: %s', exc)
        return _fallback_answer()


def _phrase_action(question, action_result):
    """Confirm an executed action briefly, in the user's language."""
    if not llm_available():
        return action_result
    try:
        phrased = llm_complete(
            f'USER ASKED: {question}\n\nACTION PERFORMED: {action_result}\n\n'
            f'Confirm to the user what you just did, in 1-2 short friendly sentences.',
            system=('You executed an action in the product for the user. Confirm exactly what '
                    'happened, plain text, no markdown, no new claims. Open directly with the '
                    'confirmation — no filler ("certainly", "great question", "sure"). Use the '
                    'live numbers from the action result when it has them. If one obvious next '
                    'step helps (e.g. "next: CRM → OUTREACH to send the rest"), end with that '
                    'single step and its page — otherwise stop after the confirmation. ' +
                    {'tanglish': 'Reply in natural Tanglish.',
                     'tamil': 'Reply in Tamil script.'}.get(detect_language_style(question),
                                                            'Reply in friendly English.')),
            timeout=45)
        return _humanize(phrased) or action_result
    except Exception:
        return action_result
