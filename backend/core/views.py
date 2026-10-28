"""API views — JSON endpoints consumed by the frontend."""

from django.contrib.auth import authenticate
from django.db import connection
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .actions import pending_summary
from .chat import responder_reply
from .guide import guide_answer
from .health import status_of
from .mailer import NO_RECIPIENT_ERROR, claim_draft_for_send, send_draft, smtp_configured, valid_recipient
from .authentication import token_expired
from .permissions import IsWorkspaceAdmin, IsWorkspaceAdminOrReadOnly
from .models import AgentConfig, AppSettings, ChatMessage, EmailDraft, EmailTemplate, Lead, PipelineRun, Potential, Reply, SearchProfile, User
from .pipeline import PipelineBusy, pipeline_status, run_pipeline, start_pipeline_async
from .reports import _resolve_recipients, send_daily_report
from .runlock import running_since
from .serializers import (
    AgentConfigSerializer,
    AgentMetaSerializer,
    ChatMessageSerializer,
    EmailDraftSerializer,
    EmailTemplateSerializer,
    LeadSerializer,
    PipelineRunSerializer,
    PotentialSerializer,
    ReplySerializer,
    SearchProfileSerializer,
    SettingsSerializer,
    UserSerializer,
)

AGENT_META = {
    'search': ('Search (Scrape)', 'Search', 'Discovers and scrapes new companies and leads'),
    'profile': ('Profile', 'Profile', 'Profiles the discovered company / lead and enriches data'),
    'copywright': ('Copywright', 'Copywright', 'Generates the communication / pitch for each lead'),
    'responder': ('Responder (Chatbot)', 'Responder', 'Handles responses and conversations with leads'),
}


# ------------------------------------------------------------------
# Health (open) — used by the frontend status strip
# ------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    db_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception:
        db_ok = False

    # Heartbeats are stamped by the worker container's processes — the API
    # only reads them. Worker loop beats every ~30s, report thread ~60s;
    # 3x margin tolerates slow cycles.
    worker = status_of('worker', max_age_seconds=120)
    scheduler = status_of('report', max_age_seconds=240)

    return Response({
        'status': 'ok' if db_ok else 'degraded',
        'service': 'agentic-ai-backend',
        'database': 'connected' if db_ok else 'error',
        'api': True,
        'worker': worker,
        'scheduler': scheduler,
        'time': timezone.now().isoformat(),
    })


# ------------------------------------------------------------------
# Users / roles + token auth
# ------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    # First-boot only: the very first account becomes the owner.  After that
    # sign-up is closed — the app is reachable on a public URL and every
    # account sees the whole CRM, SMTP setup and send buttons.
    if User.objects.exists():
        return Response({'detail': 'Sign-up is closed — ask the workspace owner for an account.'},
                        status=403)
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    if not username or len(password) < 8:
        return Response({'detail': 'username and a password of 8+ characters are required'}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({'detail': 'username already taken'}, status=409)
    user = User.objects.create_user(username=username, password=password)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data}, status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    user = authenticate(
        request,
        username=request.data.get('username'),
        password=request.data.get('password'),
    )
    if user is None:
        return Response({'detail': 'invalid credentials'}, status=401)
    token, _ = Token.objects.get_or_create(user=user)
    if token_expired(token):   # an expired token is dead — issue a fresh one
        token.delete()
        token = Token.objects.create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data})


@api_view(['POST'])
def logout(request):
    """Revoke this user's token server-side — signing out must not leave a
    copied token valid."""
    Token.objects.filter(user=request.user).delete()
    return Response({'detail': 'signed out'})


@api_view(['GET'])
def me(request):
    return Response(UserSerializer(request.user).data)


@api_view(['POST'])
def change_password(request):
    user = request.user
    if not user.check_password(request.data.get('currentPassword') or ''):
        return Response({'detail': 'current password is incorrect'}, status=400)
    new = request.data.get('newPassword') or ''
    if len(new) < 8:
        return Response({'detail': 'new password must be 8+ characters'}, status=400)
    if new != request.data.get('confirmPassword'):
        return Response({'detail': 'passwords do not match'}, status=400)
    user.set_password(new)
    user.save(update_fields=['password'])
    # a password change must end every existing session, including any copied token
    Token.objects.filter(user=user).delete()
    return Response({'detail': 'password updated — sign in again'})


# ------------------------------------------------------------------
# CRM — LEADS · POTENTIAL · REPLY
# ------------------------------------------------------------------

class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [IsWorkspaceAdminOrReadOnly]
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer


class PotentialViewSet(viewsets.ModelViewSet):
    permission_classes = [IsWorkspaceAdminOrReadOnly]
    queryset = Potential.objects.all()
    serializer_class = PotentialSerializer


class ReplyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsWorkspaceAdminOrReadOnly]
    queryset = Reply.objects.all()
    serializer_class = ReplySerializer


# ------------------------------------------------------------------
# AGENTS — metas for the dashboard + config per agent
# ------------------------------------------------------------------

@api_view(['GET'])
def agents(request):
    """Agent pipeline cards with live stats from the last run."""
    last_run = PipelineRun.objects.first()
    counts = {'lead': Lead.objects.count(), 'potential': Potential.objects.count(), 'reply': Reply.objects.count()}
    drafts_waiting = EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count()
    drafts_sent = EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count()
    actions = {
        'search': f'{last_run.leads_created if last_run else 0} new leads · {counts["lead"]} total',
        'profile': f'{counts["lead"]} leads profiled',
        'copywright': f'{drafts_waiting} draft(s) awaiting approval',
        'responder': f'{drafts_sent} cold email(s) sent · {counts["reply"]} replies handled',
    }
    if not AppSettings.load().runs_enabled:
        agent_status = 'Paused'
    elif running_since() is not None:
        agent_status = 'Running'
    else:
        agent_status = 'Ready'
    metas = []
    for key, (name, short, role) in AGENT_META.items():
        metas.append({
            'key': key,
            'name': name,
            'shortName': short,
            'role': role,
            'status': agent_status,
            'lastAction': actions[key],
        })
    return Response(AgentMetaSerializer(metas, many=True).data)


@api_view(['GET', 'PUT'])
@permission_classes([IsWorkspaceAdmin])
def agent_config(request, agent_key):
    if agent_key not in AGENT_META:
        return Response({'detail': 'unknown agent'}, status=404)
    cfg = AgentConfig.objects.filter(agent=agent_key).first()
    if cfg is None:
        return Response({'detail': 'agent config missing — run seed_demo'}, status=404)
    if request.method == 'PUT':
        serializer = AgentConfigSerializer(cfg, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(AgentConfigSerializer(cfg).data)


# ------------------------------------------------------------------
# SETTINGS — Company Profile · AI Key · Frequent Runs
# ------------------------------------------------------------------

@api_view(['GET', 'PUT'])
@permission_classes([IsWorkspaceAdmin])
def settings_view(request):
    obj = AppSettings.load()
    if request.method == 'PUT':
        serializer = SettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(SettingsSerializer(obj).data)


# ------------------------------------------------------------------
# SEARCH PROFILES — saved lead-targeting presets, one-click switching
# ------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes([IsWorkspaceAdmin])
def profiles(request):
    """List saved targeting profiles, or save a new one.

    POST body: { name, description?, countries?, industries?, cities?, icpMode? }
    — creating does NOT activate it; use /api/profiles/<id>/activate/ for the
    one-click switch (that's the call which rewrites AppSettings)."""
    if request.method == 'POST':
        serializer = SearchProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        return Response(SearchProfileSerializer(profile).data, status=status.HTTP_201_CREATED)
    return Response(SearchProfileSerializer(SearchProfile.objects.all(), many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def profile_activate(request, profile_id):
    """The one-click switch: apply this profile's targeting to the live
    settings — takes effect on the next pipeline cycle, no restart needed."""
    profile = SearchProfile.objects.filter(pk=profile_id).first()
    if profile is None:
        return Response({'detail': 'profile not found'}, status=404)
    profile.apply()
    return Response({
        'profile': SearchProfileSerializer(profile).data,
        'settings': SettingsSerializer(AppSettings.load()).data,
    })


# ------------------------------------------------------------------
# ONE-CLICK SMTP CONNECT — credentials in, verified provider config out
# ------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def smtp_connect(request):
    """Connect an email mailbox in one click.

    Body: { provider: 'zoho'|'gmail'|'custom', user, password, host?, port? }.
    Probes the provider's servers with a real SMTP handshake + login (nothing
    is sent); Zoho tries all three datacenters, so the user never has to know
    which one their account lives on.  The first server that authenticates is
    saved as the live SMTP setup (host, port, user, password, from).

    Expected failures come back as 200 {ok: false, message} — they are answers,
    not HTTP errors; only malformed input is a 400."""
    from .mailer import connect_mailbox

    user = (request.data.get('user') or '').strip()
    password = (request.data.get('password') or '').strip()
    provider = (request.data.get('provider') or 'zoho').lower()
    if not user or not password:
        return Response({'ok': False,
                         'message': 'Enter the mailbox address and its password / app password.'},
                        status=400)
    try:
        port = int(request.data.get('port') or 587)
    except (TypeError, ValueError):
        port = 587
    result = connect_mailbox(provider, user, password,
                             host=(request.data.get('host') or '').strip(), port=port)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def report_test(request):
    """Send the daily report right now — verifies the admin email + SMTP setup.

    Delivery mirrors the 20:00 IST scheduler: real SMTP when configured,
    console delivery (printed to the Django server log) when not.
    """
    recipients = _resolve_recipients()
    report_status, subject = send_daily_report()
    return Response({
        'status': report_status,  # 'smtp' | 'console' | 'skipped'
        'subject': subject,
        'recipients': recipients,
    })


# ------------------------------------------------------------------
# LEADS & REPORTS — full lead list export + on-demand report generation
# ------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def leads_export(request):
    """All leads as a CSV download (Leads & Reports page)."""
    import csv
    from django.http import HttpResponse

    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="leads.csv"'
    writer = csv.writer(response)
    writer.writerow(['Company', 'Industry', 'Website', 'Country', 'State', 'Score',
                     'Contact email', 'Contact phone', 'Has website', 'Flaws',
                     'AI description', 'Source', 'Discovered'])
    for l in Lead.objects.order_by('-created_at'):
        writer.writerow([
            l.company, l.industry, l.website, l.country, l.state, l.score,
            l.contact_email, l.contact_phone, 'yes' if l.has_website else 'no',
            len(l.findings or []),
            (l.description or '').replace('\n', ' '), l.source,
            l.created_at.strftime('%Y-%m-%d %H:%M'),
        ])
    return response


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def lead_draft_email(request, lead_id):
    """Manually request an outreach draft for ANY lead — qualified or not.

    The automated Copywright only drafts on its own schedule; this puts the
    operator in charge: every lead in the CRM (low score, no Potential flag,
    even not yet profiled) can get a hand-triggered draft.  The draft lands
    in the normal approval queue — nothing sends without approval.

    201 {ok: true, draft} on success; 200 {ok: false, detail} when the lead
    already has an email waiting (draft/approved); 404 for an unknown lead."""
    lead = Lead.objects.filter(pk=lead_id).first()
    if lead is None:
        return Response({'detail': 'lead not found'}, status=404)
    # only a draft in flight blocks a new one — a sent/rejected/failed history
    # must not stop a deliberate manual re-draft
    active = lead.drafts.filter(status__in=[EmailDraft.Statuses.DRAFT,
                                            EmailDraft.Statuses.APPROVED])
    if active.exists():
        return Response({'ok': False,
                         'detail': f'{lead.company} already has an email waiting for '
                                   'approval — find it in Approvals.'})
    from .pipeline import _draft_email
    subject, body, used_llm = _draft_email(lead)
    draft = EmailDraft.objects.create(
        lead=lead,
        company=lead.company,
        to_email=lead.contact_email,
        subject=subject,
        body=body,
        findings=lead.findings[:3],
        status=EmailDraft.Statuses.DRAFT,
    )
    return Response({'ok': True,
                     'draft': EmailDraftSerializer(draft).data,
                     'used_llm': used_llm},
                    status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def report_generate(request):
    """Build the branded lead report on demand (Leads & Reports page).
    body: {scope: 'today' | 'all', email: bool} — returns subject/text/html;
    email=true also delivers it to the configured report recipient."""
    import datetime as dt

    from .mailer import branded_email_html, text_to_email_html
    from .reports import build_daily_report, now_ist, send_daily_report

    scope = (request.data.get('scope') or 'today').lower()
    day = now_ist().date() if scope != 'all' else None
    subject, text = build_daily_report(day)
    emailed = False
    if request.data.get('email'):
        status, _ = send_daily_report(day)
        emailed = status == 'smtp'
    return Response({
        'subject': subject,
        'text': text,
        'html': branded_email_html(text_to_email_html(text)),
        'emailed': emailed,
    })


# ------------------------------------------------------------------
# TEMPLATES — user cold-email templates (Settings → Email Templates)
# ------------------------------------------------------------------

def _get_template(template_id):
    try:
        return EmailTemplate.objects.get(id=template_id)
    except EmailTemplate.DoesNotExist:
        return None


def _ensure_single_default(tpl):
    """Keep exactly one default: when `tpl` is flagged (or no other default
    exists) clear the rest so the pipeline always has an unambiguous pick."""
    others = EmailTemplate.objects.exclude(pk=tpl.pk)
    if tpl.is_default or not others.filter(is_default=True).exists():
        others.update(is_default=False)
        if not tpl.is_default:
            tpl.is_default = True
            tpl.save(update_fields=['is_default', 'updated_at'])


@api_view(['GET', 'POST'])
@permission_classes([IsWorkspaceAdmin])
def templates(request):
    if request.method == 'POST':
        serializer = EmailTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tpl = serializer.save()
        _ensure_single_default(tpl)
        return Response(EmailTemplateSerializer(tpl).data, status=status.HTTP_201_CREATED)
    return Response(EmailTemplateSerializer(EmailTemplate.objects.all(), many=True).data)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsWorkspaceAdmin])
def template_detail(request, template_id):
    tpl = _get_template(template_id)
    if tpl is None:
        return Response({'detail': 'template not found'}, status=404)
    if request.method == 'DELETE':
        was_default = tpl.is_default
        tpl.delete()
        if was_default:  # promote the newest remaining template to default
            next_default = EmailTemplate.objects.first()
            if next_default:
                next_default.is_default = True
                next_default.save(update_fields=['is_default', 'updated_at'])
        return Response({'deleted': True})
    serializer = EmailTemplateSerializer(tpl, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    tpl = serializer.save()
    _ensure_single_default(tpl)
    return Response(EmailTemplateSerializer(tpl).data)


# ------------------------------------------------------------------
# GUIDE — in-product AI assistant ("how do I use this?")
# ------------------------------------------------------------------

@api_view(['POST'])
def guide(request):
    """Gemini-powered product guide: answers usage questions grounded in the
    product knowledge base + the workspace's live state — and executes
    commands ("run a cycle", "do it yourself") for real."""
    text = (request.data.get('text') or '').strip()
    if not text:
        return Response({'detail': 'text is required'}, status=400)
    history = [h for h in (request.data.get('history') or [])
               if isinstance(h, dict) and isinstance(h.get('text'), str)][:8]
    return Response({'answer': guide_answer(text, history, user=request.user)})


# ------------------------------------------------------------------
# CHAT — Responder (Chatbot)
# ------------------------------------------------------------------

@api_view(['GET', 'POST', 'DELETE'])
def chat(request):
    if request.method == 'DELETE':
        deleted, _ = ChatMessage.objects.filter(user=request.user).delete()
        if request.user.pending_action:
            request.user.pending_action = {}   # the confirmation is no longer visible
            request.user.save(update_fields=['pending_action'])
        return Response({'cleared': True, 'deleted': deleted})
    # first-login setup wizard rides on the chat while it is active — plain
    # Q&A that configures the whole system, then hands over to the Responder.
    # State is PER USER (User.onboarding): every new client login gets the
    # wizard; existing users were marked done in migration 0017.
    settings = AppSettings.load()
    from .onboarding import onboarding_reply, onboarding_status, redact_for_history
    if request.method == 'POST':
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'text is required'}, status=400)
        status = onboarding_status(request.user, settings)
        # always redact: a key pasted after setup is stored (and re-served) forever too
        stored = redact_for_history(text, status['stepKey'] or '')
        user_msg = ChatMessage.objects.create(user=request.user, role='user', text=stored)
        if not status['done']:
            if request.user.pending_action:
                request.user.pending_action = {}   # never let a "yes" fire it after the wizard
                request.user.save(update_fields=['pending_action'])
            reply_text = onboarding_reply(text, request.user, settings)
        else:
            reply_text = responder_reply(text, turn=user_msg.id, user=request.user)
        ai_msg = ChatMessage.objects.create(user=request.user, role='ai', text=reply_text)
        return Response({
            'userMessage': ChatMessageSerializer(user_msg).data,
            'reply': ChatMessageSerializer(ai_msg).data,
            'onboarding': onboarding_status(request.user, AppSettings.load()),
            'pendingAction': pending_summary(request.user),
        })
    messages = ChatMessage.objects.filter(user=request.user)
    return Response({
        'messages': ChatMessageSerializer(messages, many=True).data,
        'onboarding': onboarding_status(request.user, settings),
        # a refresh must not hide a confirmation the server still holds
        'pendingAction': pending_summary(request.user),
    })


@api_view(['GET'])
def onboarding(request):
    """Setup-wizard state for THIS user (banner, redirect, progress)."""
    from .onboarding import onboarding_status
    return Response(onboarding_status(request.user, AppSettings.load()))


# ------------------------------------------------------------------
# OUTREACH — cold-email drafts (Copywright output, human approval, send)
# ------------------------------------------------------------------

def _get_draft(draft_id):
    try:
        return EmailDraft.objects.get(id=draft_id)
    except EmailDraft.DoesNotExist:
        return None


@api_view(['GET'])
def drafts(request):
    objs = EmailDraft.objects.all()[:200]
    return Response(EmailDraftSerializer(objs, many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def drafts_bulk_approve(request):
    """Bulk approve → send. Body: { ids: [id, …] }.

    Each draft is approved and sent independently; one bad id or an
    already-processed draft is reported in the results and never blocks the
    rest.  Returns { results: [{id, ok, status?, error?}], sent, failed }."""
    raw_ids = request.data.get('ids')
    if not isinstance(raw_ids, list) or not raw_ids:
        return Response({'detail': 'ids must be a non-empty list'}, status=400)
    results, sent, failed = [], 0, 0
    for raw in raw_ids:
        try:
            draft_id = int(raw)
        except (TypeError, ValueError):
            results.append({'id': raw, 'ok': False, 'error': 'invalid id'})
            failed += 1
            continue
        draft = EmailDraft.objects.filter(pk=draft_id).first()
        if draft is None:
            results.append({'id': draft_id, 'ok': False, 'error': 'not found'})
            failed += 1
            continue
        if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
            results.append({'id': draft_id, 'ok': False,
                            'error': f'already {draft.get_status_display().lower()}'})
            failed += 1
            continue
        if not valid_recipient(draft.to_email):
            results.append({'id': draft_id, 'ok': False, 'error': NO_RECIPIENT_ERROR})
            failed += 1
            continue
        draft = claim_draft_for_send(draft.id)
        if draft is None:
            results.append({'id': draft_id, 'ok': False, 'error': 'already being sent'})
            failed += 1
            continue
        send_draft(draft)
        draft.refresh_from_db()
        if draft.status == EmailDraft.Statuses.SENT:
            results.append({'id': draft_id, 'ok': True, 'status': draft.status})
            sent += 1
        else:
            results.append({'id': draft_id, 'ok': False, 'status': draft.status,
                            'error': draft.error or 'send failed'})
            failed += 1
    return Response({'results': results, 'sent': sent, 'failed': failed})


@api_view(['GET', 'PUT'])
@permission_classes([IsWorkspaceAdmin])
def draft_detail(request, draft_id):
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if request.method == 'PUT':
        # editable only while unsent — a failed draft (e.g. no recipient) is
        # fixed in place and retried
        if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
            return Response({'detail': 'only unsent drafts can be edited'}, status=409)
        incoming = request.data
        changes = {}
        # the UI sends camelCase (toEmail); accept the snake_case spelling too
        if 'toEmail' in incoming or 'to_email' in incoming:
            to_email = incoming.get('toEmail', incoming.get('to_email'))
            if not isinstance(to_email, str):
                return Response({'detail': 'toEmail must be a string.'}, status=400)
            to_email = to_email.strip()
            if to_email and not valid_recipient(to_email):
                return Response({'detail': 'That recipient email is not valid.'}, status=400)
            changes['to_email'] = to_email
        for field in ('subject', 'body'):
            if field in incoming:
                if not isinstance(incoming[field], str):
                    return Response({'detail': f'{field} must be a string.'}, status=400)
                changes[field] = incoming[field].strip()
        # conditional UPDATE, not draft.save(): an approve that claims/sends this
        # draft between our read above and this write must not be overwritten
        # back to 'draft' (that would let it be sent twice)
        updated = (EmailDraft.objects
                   .filter(pk=draft.pk, status__in=[EmailDraft.Statuses.DRAFT,
                                                    EmailDraft.Statuses.FAILED])
                   .update(updated_at=timezone.now(), **changes))
        if not updated:
            return Response({'detail': 'only unsent drafts can be edited'}, status=409)
        draft.refresh_from_db()
    return Response(EmailDraftSerializer(draft).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def draft_approve(request, draft_id):
    """Approve → send immediately. Sent via SMTP, or console when unset."""
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
        return Response({'detail': f'draft is already {draft.status}'}, status=409)
    if not valid_recipient(draft.to_email):
        return Response({'detail': NO_RECIPIENT_ERROR}, status=400)
    draft = claim_draft_for_send(draft.id)
    if draft is None:
        return Response({'detail': 'this draft is already being sent'}, status=409)
    send_draft(draft)
    return Response(EmailDraftSerializer(draft).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def draft_reject(request, draft_id):
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status == EmailDraft.Statuses.SENT:
        return Response({'detail': 'draft already sent'}, status=409)
    # conditional UPDATE (like claim_draft_for_send): a plain save could land while
    # send_draft is mid-SMTP and be overwritten by its SENT, telling the user
    # "rejected" while the mail still goes out
    rejected = (EmailDraft.objects
                .filter(pk=draft.pk, status__in=[EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED])
                .update(status=EmailDraft.Statuses.REJECTED, updated_at=timezone.now()))
    if not rejected:
        draft.refresh_from_db()
        already = draft.status == EmailDraft.Statuses.REJECTED
        return Response({'detail': 'That email was already rejected.' if already
                         else 'That email is already being sent.'}, status=409)
    draft.refresh_from_db()
    return Response(EmailDraftSerializer(draft).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def draft_send(request, draft_id):
    """Retry delivery of a failed draft."""
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status != EmailDraft.Statuses.FAILED:
        return Response({'detail': 'only failed drafts can be retried'}, status=409)
    if not valid_recipient(draft.to_email):
        return Response({'detail': NO_RECIPIENT_ERROR}, status=400)
    draft = claim_draft_for_send(draft.id, from_statuses=(EmailDraft.Statuses.FAILED,))
    if draft is None:
        return Response({'detail': 'this draft is already being sent'}, status=409)
    send_draft(draft)
    return Response(EmailDraftSerializer(draft).data)


@api_view(['GET'])
def outreach_status(request):
    """One-line summary for the status strip."""
    return Response({
        'drafts': EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count(),
        'sent': EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count(),
        'failed': EmailDraft.objects.filter(status=EmailDraft.Statuses.FAILED).count(),
        'approved': EmailDraft.objects.filter(status=EmailDraft.Statuses.APPROVED).count(),
        'smtpConfigured': smtp_configured(),
    })


# ------------------------------------------------------------------
# PIPELINE — orchestrator loop
# ------------------------------------------------------------------

@api_view(['GET'])
def pipeline_status_view(request):
    return Response(pipeline_status())


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def pipeline_run(request):
    """Start one cycle.  Default: background thread → 202 and the UI polls
    /pipeline/status/.  ?wait=1 runs synchronously (scripts)."""
    triggered_by = request.data.get('triggeredBy', 'manual')
    busy = Response({'detail': 'A cycle is already running — results appear when it finishes.'},
                    status=409)
    if request.query_params.get('wait') == '1':
        try:
            run = run_pipeline(triggered_by=triggered_by)
        except PipelineBusy:
            return busy
        return Response(PipelineRunSerializer(run).data, status=201)
    if not start_pipeline_async(triggered_by=triggered_by):
        return busy
    return Response({'started': True, 'status': pipeline_status()}, status=202)


@api_view(['GET'])
def pipeline_runs(request):
    runs = PipelineRun.objects.all()[:20]
    return Response(PipelineRunSerializer(runs, many=True).data)
