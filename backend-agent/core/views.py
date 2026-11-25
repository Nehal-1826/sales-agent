"""API views — JSON endpoints consumed by the frontend."""

import logging
from datetime import timedelta

from django.contrib.auth import authenticate
from django.db import connection
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from . import lockout
from .authz import (
    auth_extras,
    handle_2fa_confirm,
    handle_2fa_disable,
    handle_2fa_rotate_confirm,
    handle_2fa_rotate_start,
    handle_2fa_setup,
    handle_2fa_status,
    handle_2fa_verify,
    is_platform_admin,
    otp_satisfied,
    token_otp_satisfied,
    user_2fa_active,
)
from .throttles import LoginThrottle, OtpThrottle
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .actions import pending_summary
from .chat import responder_reply
from .guide import guide_answer
from .health import status_of
from billing.entitlements import BillingError, check as quota_check
from .mailer import NO_RECIPIENT_ERROR, check_send_quota, smtp_configured, valid_recipient
from .outbox import enqueue_draft, kick_drain
from .tenancy import current_workspace
from .authentication import token_expired
from .throttles import AdminSlugThrottle
from .permissions import IsOtpSatisfied, IsWorkspaceAdmin, IsWorkspaceAdminOrReadOnly
from .models import AgentConfig, AppSettings, ChatMessage, EmailDraft, EmailTemplate, Lead, Mailbox, PipelineRun, PlatformSession, Potential, Reply, SearchProfile, SlugAttempt, User
from .pipeline import PipelineBusy, pipeline_status, run_pipeline, start_pipeline_async
from .lead_gate import (
    LeadFetchNotReady,
    autopilot_went_off_message,
    lead_fetch_status,
    missing_lead_data,
)
from .reports import _resolve_recipients, send_daily_report
from .runlock import running_since
from .warmup_bridge import mint_warmup_token
from .serializers import (
    AgentConfigSerializer,
    AgentMetaSerializer,
    ChatMessageSerializer,
    EmailDraftSerializer,
    EmailTemplateSerializer,
    LeadSerializer,
    MailboxSerializer,
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
    # Multi-tenant: a company's workspace and its owner are created by the
    # platform operator (manage.py create_workspace), never by anonymous
    # sign-up — an account with no workspace could not use the app anyway, and
    # open sign-up would let anyone spend scraping, AI and email credits.
    return Response({'detail': 'Sign-up is closed — accounts are created by the platform operator.'},
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


def _issue_login_token(user, request):
    """Mint a fresh DRF token + force a new TOTP session (shared by both login doors)."""
    token, _ = Token.objects.get_or_create(user=user)
    if token_expired(token):   # an expired token is dead — issue a fresh one
        token.delete()
        token = Token.objects.create(user=user)
    PlatformSession.objects.filter(token=token).delete()  # a fresh login must pass TOTP again
    return Response({'token': token.key, 'user': {**UserSerializer(user).data, **auth_extras(user, request)}})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle, LoginThrottle])
def login(request):
    uname = request.data.get('username')
    uname = uname if isinstance(uname, str) else ''
    ip = lockout.client_ip(request)
    if lockout.is_locked(uname, ip):
        return Response({'error': 'too_many_attempts'}, status=429)
    user = authenticate(
        request,
        username=uname,
        password=request.data.get('password'),
    )
    if user is None and '@' in uname:
        matches = list(
            User.objects.filter(email__iexact=uname.strip()).values_list('username', flat=True)[:2]
        )
        if len(matches) == 1:
            user = authenticate(
                request,
                username=matches[0],
                password=request.data.get('password'),
            )
    if user is None:
        lockout.record_failure(uname, ip)
        return Response({'detail': 'invalid credentials'}, status=401)
    lockout.clear(uname, ip)
    if user.workspace is not None and not user.workspace.is_active:
        return Response({'detail': 'This workspace is suspended.'}, status=403)
    if is_platform_admin(user):
        return Response({'detail': 'Platform admins sign in from the admin login page.',
                         'admin_only': True}, status=403)
    return _issue_login_token(user, request)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle, LoginThrottle])
def admin_login(request):
    """Platform-admin door: staff users with no workspace sign in from the
    slug-prefixed console login page ONLY — workspace users are refused here
    exactly as platform admins are refused on /auth/login/."""
    uname = request.data.get('username')
    uname = uname if isinstance(uname, str) else ''
    ip = lockout.client_ip(request)
    if lockout.is_locked(uname, ip):
        return Response({'error': 'too_many_attempts'}, status=429)
    user = authenticate(request, username=uname, password=request.data.get('password'))
    if user is None and '@' in uname:
        matches = list(
            User.objects.filter(email__iexact=uname.strip()).values_list('username', flat=True)[:2]
        )
        if len(matches) == 1:
            user = authenticate(request, username=matches[0],
                                password=request.data.get('password'))
    if user is None:
        lockout.record_failure(uname, ip)
        return Response({'detail': 'invalid credentials'}, status=401)
    lockout.clear(uname, ip)
    if not is_platform_admin(user):
        return Response({'detail': 'This page is for platform administrators only.'},
                        status=403)
    return _issue_login_token(user, request)


@api_view(['POST'])
def logout(request):
    """Revoke this user's token server-side — signing out must not leave a
    copied token valid."""
    Token.objects.filter(user=request.user).delete()
    return Response({'detail': 'signed out'})


@api_view(['GET'])
def me(request):
    return Response({**UserSerializer(request.user).data, **auth_extras(request.user, request)})


USERNAME_RULE = 'Username must be 3-30 characters — letters, numbers and underscores only.'


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
def change_username(request):
    """Settings → Account: change the signed-in user's username.
    3-30 ASCII letters/digits/underscore, unique (checked case-insensitively
    so 'Admin' cannot shadow 'admin').  The auth token stays valid — it is
    keyed by pk, not username."""
    new = (request.data.get('username') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_]{3,30}', new):
        return Response({'detail': USERNAME_RULE}, status=400)
    if (new.lower() != request.user.username.lower()
            and User.objects.filter(username__iexact=new).exists()):
        return Response({'detail': 'That username is already taken.'}, status=409)
    request.user.username = new
    request.user.save(update_fields=['username'])
    return Response({'username': new, 'detail': 'username updated'})


@api_view(['POST'])
def change_password(request):
    user = request.user
    if not user.check_password(request.data.get('currentPassword') or ''):
        return Response({'detail': 'current password is incorrect'}, status=400)
    new = request.data.get('newPassword') or ''
    if new != request.data.get('confirmPassword'):
        return Response({'detail': 'passwords do not match'}, status=400)
    try:
        validate_password(new, user)
    except DjangoValidationError as e:
        return Response({'detail': ' '.join(e.messages)}, status=400)
    user.set_password(new)
    user.save(update_fields=['password'])
    # a password change must end every existing session, including any copied token
    Token.objects.filter(user=user).delete()
    return Response({'detail': 'password updated — sign in again'})


# ── workspace-level 2FA (Settings → Two-factor + sign-in OTP) ──────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
def user_2fa_status(request):
    return handle_2fa_status(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
def user_2fa_setup(request):
    return handle_2fa_setup(request, already_detail='Two-factor is already enabled.')


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
@throttle_classes([AnonRateThrottle, UserRateThrottle, OtpThrottle])
def user_2fa_confirm(request):
    return handle_2fa_confirm(request, already_detail='Two-factor is already enabled.')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([AnonRateThrottle, UserRateThrottle, OtpThrottle])
def user_2fa_verify(request):
    return handle_2fa_verify(request, not_enrolled_detail='Two-factor is not enabled.')


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
@throttle_classes([AnonRateThrottle, UserRateThrottle, OtpThrottle])
def user_2fa_disable(request):
    return handle_2fa_disable(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
@throttle_classes([AnonRateThrottle, UserRateThrottle, OtpThrottle])
def user_2fa_rotate(request):
    return handle_2fa_rotate_start(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOtpSatisfied])
@throttle_classes([AnonRateThrottle, UserRateThrottle, OtpThrottle])
def user_2fa_rotate_confirm(request):
    return handle_2fa_rotate_confirm(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def warmup_token(request):
    """Mint the HS256 bridge JWT that backend-warmup (FastAPI) accepts."""
    # A platform admin's DRF token alone must not buy a 12 h super_admin
    # FastAPI session — the mint demands the same satisfied TOTP session
    # (12 h) as every other privileged platform surface (billing.views_platform).
    # Workspace users with 2FA enabled must likewise have satisfied OTP.
    if is_platform_admin(request.user) and not otp_satisfied(request):
        return Response({'detail': 'OTP required'}, status=403)
    if user_2fa_active(request.user) and not token_otp_satisfied(request):
        return Response({'detail': 'OTP required'}, status=403)
    ws = getattr(request.user, 'workspace', None)
    slug = getattr(ws, 'slug', None) or 'default'
    return Response({'token': mint_warmup_token(user=request.user, workspace_slug=slug)})


# ------------------------------------------------------------------
# CRM — LEADS · POTENTIAL · REPLY
# ------------------------------------------------------------------

class LeadViewSet(viewsets.ModelViewSet):
    permission_classes = [IsWorkspaceAdminOrReadOnly]
    # import-time placeholder (router basename only); rows are scoped per request
    queryset = Lead.all_tenants.none()
    serializer_class = LeadSerializer

    def get_queryset(self):
        return Lead.objects.all()

    def perform_create(self, serializer):
        quota_check(current_workspace(), 'leads')   # billing: manual create counts against the leads quota (402)
        serializer.save()


class PotentialViewSet(viewsets.ModelViewSet):
    permission_classes = [IsWorkspaceAdminOrReadOnly]
    # import-time placeholder (router basename only); rows are scoped per request
    queryset = Potential.all_tenants.none()
    serializer_class = PotentialSerializer

    def get_queryset(self):
        return Potential.objects.all()


class ReplyViewSet(viewsets.ModelViewSet):
    permission_classes = [IsWorkspaceAdminOrReadOnly]
    # import-time placeholder (router basename only); rows are scoped per request
    queryset = Reply.all_tenants.none()
    serializer_class = ReplySerializer

    def get_queryset(self):
        qs = Reply.objects.select_related('draft', 'answer_draft').order_by(
            'handled', '-received_at', '-updated_at')
        if self.request.query_params.get('attention') in ('1', 'true'):
            from .inbox import needs_attention_qs
            qs = qs.filter(pk__in=needs_attention_qs().values('pk'))
        return qs

    @action(detail=True, methods=['post'], permission_classes=[IsWorkspaceAdmin])
    def approve_suggestion(self, request, pk=None):
        """Human-approved answer → threaded draft → outbox queue (never inline)."""
        from .inbox import ApproveError, approve_suggestion
        reply = self.get_object()
        text = request.data.get('text') if isinstance(request.data, dict) else None
        if text is not None and not isinstance(text, str):
            return Response({'detail': 'text must be a string'}, status=400)
        try:
            draft = approve_suggestion(reply, text)
        except ApproveError as exc:
            return Response({'detail': str(exc)}, status=400)
        if draft.status == EmailDraft.Statuses.QUEUED:
            kick_drain()
        reply.refresh_from_db()
        return Response(ReplySerializer(reply).data)

    @action(detail=True, methods=['post'], permission_classes=[IsWorkspaceAdmin])
    def mark_handled(self, request, pk=None):
        reply = self.get_object()
        reply.handled = request.data.get('handled', True) is not False
        reply.save(update_fields=['handled', 'updated_at'])
        return Response(ReplySerializer(reply).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def inbox_poll(request):
    """Read the mailboxes now (same as the worker's ~3 min poll)."""
    from .inbox import poll_inbox
    return Response({'mailboxes': poll_inbox()})


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
        data = serializer.data
        # the save took the proper data away while autopilot was on: it went
        # off with the save, and the person is told (core.lead_gate)
        went_off = getattr(serializer, 'autopilot_went_off', None)
        if went_off:
            data['notice'] = autopilot_went_off_message(went_off)
        return Response(data)
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
    settings = AppSettings.load()
    # the switch rewrote who to find: the same rule as a Settings save — if it
    # took the proper data away while autopilot was on, autopilot goes off
    # with it and the person is told (core.lead_gate)
    went_off = None
    if settings.runs_enabled:
        went_off = missing_lead_data(settings) or None
        if went_off:
            settings.runs_enabled = False
            settings.save(update_fields=['runs_enabled', 'updated_at'])
    data = {
        'profile': SearchProfileSerializer(profile).data,
        'settings': SettingsSerializer(settings).data,
    }
    if went_off:
        data['notice'] = autopilot_went_off_message(went_off)
    return Response(data)


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
    if not Mailbox.objects.filter(from_email__iexact=user).exists():
        quota_check(current_workspace(), 'mailboxes')   # billing: connecting a NEW mailbox is a create
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
        # a cleared conversation leaves nothing behind: not the confirmation,
        # not the Assistant's memory note of it
        if request.user.pending_action or request.user.chat_memory:
            request.user.pending_action = {}   # the confirmation is no longer visible
            request.user.chat_memory = {}
            request.user.save(update_fields=['pending_action', 'chat_memory'])
        return Response({'cleared': True, 'deleted': deleted})
    # first-login setup wizard rides on the chat while it is active — plain
    # Q&A that configures the whole system, then hands over to the Responder.
    # State is PER USER (User.onboarding): every new client login gets the
    # wizard; existing users were marked done in migration 0017.
    # load() scopes to the caller's workspace (403 for workspace-less
    # operators via TenantContextMissing) — all_tenants.first() would read
    # and WRITE another tenant's settings here.
    settings = AppSettings.load()
    from .onboarding import onboarding_reply, onboarding_status, redact_for_history
    if request.method == 'POST':
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'text is required'}, status=400)
        quota_check(current_workspace(), 'ai_msgs')   # billing: 402 before anything is stored or sent to the LLM
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


@api_view(['GET', 'PATCH'])
def onboarding(request):
    """Setup-wizard state for THIS user (banner, redirect, progress).

    PATCH {'tourDone': bool} marks the first-login UI product tour done
    (finished or skipped) so it never re-opens for this user. It rides in
    User.onboarding['tour_done'] — a separate key the chat wizard never
    touches (its writes load the whole dict and only update their own keys).
    """
    if request.method == 'PATCH' and 'tourDone' in request.data:
        state = dict(getattr(request.user, 'onboarding', None) or {})
        state['tour_done'] = bool(request.data.get('tourDone'))
        request.user.onboarding = state
        request.user.save(update_fields=['onboarding'])
    from .onboarding import onboarding_status
    data = onboarding_status(request.user, AppSettings.load())
    data['tourDone'] = bool((getattr(request.user, 'onboarding', None) or {}).get('tour_done'))
    return Response(data)


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
    objs = EmailDraft.objects.select_related('mailbox')[:200]
    return Response(EmailDraftSerializer(objs, many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def drafts_bulk_approve(request):
    """Bulk approve → queue. Body: { ids: [id, …] }.

    Each draft is approved and queued independently (the outbox spaces them
    out per mailbox, within the sending window and daily caps); one bad id or an
    already-processed draft is reported in the results and never blocks the
    rest.  Returns { results: [{id, ok, status?, scheduledFor?, error?}], queued, sent: 0, failed }."""
    raw_ids = request.data.get('ids')
    if not isinstance(raw_ids, list) or not raw_ids:
        return Response({'detail': 'ids must be a non-empty list'}, status=400)
    results, queued, failed = [], 0, 0
    blocked = None
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
        try:
            check_send_quota()   # billing: stop queueing once the plan is full
        except BillingError as exc:
            blocked = exc
            results.append({'id': draft_id, 'ok': False, 'error': 'plan email limit reached'})
            failed += 1
            continue
        # claim + queue: the outbox paces it out (core.outbox), never a burst
        draft = enqueue_draft(draft.id)
        if draft is None:
            results.append({'id': draft_id, 'ok': False, 'error': 'already being sent'})
            failed += 1
            continue
        results.append({'id': draft_id, 'ok': True, 'status': draft.status,
                        'scheduledFor': draft.scheduled_for})
        queued += 1
    if queued:
        kick_drain()
    if blocked is not None and not queued:
        raise blocked   # nothing went out: surface the 402 (quota / payment)
    return Response({'results': results, 'queued': queued, 'sent': 0, 'failed': failed})


@api_view(['GET', 'PUT'])
@permission_classes([IsWorkspaceAdminOrReadOnly])
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
    """Approve → queue (core.outbox): claimed atomically, then sent by the
    outbox drain at its scheduled slot. Returns the QUEUED draft."""
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
        return Response({'detail': f'draft is already {draft.status}'}, status=409)
    if not valid_recipient(draft.to_email):
        return Response({'detail': NO_RECIPIENT_ERROR}, status=400)
    check_send_quota()   # billing: 402 before the claim
    draft = enqueue_draft(draft.id)
    if draft is None:
        return Response({'detail': 'this draft is already being sent'}, status=409)
    kick_drain()
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
                .filter(pk=draft.pk, status__in=[EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED,
                                                 EmailDraft.Statuses.QUEUED])
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
    """Retry delivery of a failed draft — requeued like an approve."""
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status != EmailDraft.Statuses.FAILED:
        return Response({'detail': 'only failed drafts can be retried'}, status=409)
    if not valid_recipient(draft.to_email):
        return Response({'detail': NO_RECIPIENT_ERROR}, status=400)
    check_send_quota()   # billing: 402 before the claim
    draft = enqueue_draft(draft.id, from_statuses=(EmailDraft.Statuses.FAILED,))
    if draft is None:
        return Response({'detail': 'this draft is already being sent'}, status=409)
    kick_drain()
    return Response(EmailDraftSerializer(draft).data)


@api_view(['GET'])
def outreach_status(request):
    """One-line summary for the status strip, plus the outbox: queue size,
    next send, and per-mailbox sent-today / cap."""
    from . import outbox
    from .inbox import needs_attention_qs
    now = timezone.now()
    today = outbox.local(now).date()
    queued = EmailDraft.objects.filter(status=EmailDraft.Statuses.QUEUED)
    next_due = queued.order_by('scheduled_for').values_list('scheduled_for', flat=True).first()
    s = AppSettings.load()  # caller's workspace — never another tenant's row
    mailboxes = [{
        'id': mb.id, 'fromEmail': mb.from_email, 'label': mb.label,
        'sentToday': outbox.sent_on(mb, today), 'cap': outbox.effective_cap(mb, today),
        'dailyCap': mb.daily_cap, 'paused': outbox.is_paused(mb, now), 'isActive': mb.is_active,
    } for mb in Mailbox.objects.all()]
    return Response({
        'drafts': EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count(),
        'sent': EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count(),
        'failed': EmailDraft.objects.filter(status=EmailDraft.Statuses.FAILED).count(),
        'approved': EmailDraft.objects.filter(status=EmailDraft.Statuses.APPROVED).count(),
        'queued': queued.count(),
        'nextSendAt': next_due,
        'inSendingWindow': outbox.in_window(now, s),
        'mailboxes': mailboxes,
        'smtpConfigured': smtp_configured() or any(m['isActive'] for m in mailboxes),
        'repliesNeedingAttention': needs_attention_qs().count(),
        'repliesTotal': Reply.objects.exclude(classification='').count(),
    })


# ------------------------------------------------------------------
# MAILBOXES — sending accounts for the outbox (core.outbox)
# ------------------------------------------------------------------

def _get_mailbox(request, mailbox_id):
    """Workspace-scoped mailbox lookup.  A platform admin (staff user with no
    workspace of their own) only reaches PLATFORM mailboxes (is_platform=True
    — WarmPulse's own @warmpulse.tech mail shown in the superadmin console);
    workspace users only reach their own workspace's mailboxes — tenant mail
    never leaks into the console and platform mail never leaks into a tenant."""
    if is_platform_admin(getattr(request, 'user', None)):
        return Mailbox.all_tenants.filter(is_platform=True, pk=mailbox_id).first()
    return Mailbox.objects.filter(is_platform=False, pk=mailbox_id).first()


WARMUP_NOT_CONFIGURED = ('Mailbox is not fully configured — add the SMTP host, username and '
                         'password first (Settings → Mailboxes).')


def _warmup_slug(request):
    ws = getattr(request.user, 'workspace', None)
    return getattr(ws, 'slug', None) or 'default'


def _auto_enroll_warmup(request, mb):
    """Enroll a just-verified mailbox into warmup; never blocks the save.

    Fires only when the wizard sends ``loginVerified`` (Test Connection
    passed, then save) — a plain field edit never re-enrolls. The per-mailbox
    ``warmup_enrolled`` toggle opts out. Any failure is stored on
    ``warmup_enroll_error`` (the Settings retry state) and swallowed: warmup
    is an add-on, the mailbox save has already succeeded.
    """
    if not request.data.get('loginVerified') or not mb.warmup_enrolled:
        return
    from .warmup_enroll import HOOK_TIMEOUT, WarmupEnrollError, enroll_mailbox
    try:
        # inline in the save request → per-call 5 s cap, unlike the
        # interactive enroll endpoint which can afford the full probe
        enroll_mailbox(user=request.user, workspace_slug=_warmup_slug(request), mailbox=mb,
                       timeout=HOOK_TIMEOUT)
        error = ''
    except WarmupEnrollError as exc:
        error = str(exc.detail)
    except Exception as exc:  # noqa: BLE001 — enrollment must never fail a save
        logging.getLogger(__name__).exception('warmup auto-enroll crashed for mailbox %s', mb.pk)
        error = f'Warmup enrollment failed unexpectedly: {exc}'
    if error != mb.warmup_enroll_error:
        mb.warmup_enroll_error = error
        mb.save(update_fields=['warmup_enroll_error'])


@api_view(['GET', 'POST'])
@permission_classes([IsWorkspaceAdminOrReadOnly])
def mailboxes(request):
    if request.method == 'POST':
        serializer = MailboxSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quota_check(current_workspace(), 'mailboxes')   # billing: 402 when the plan is full
        mb = serializer.save()
        _auto_enroll_warmup(request, mb)
        return Response(MailboxSerializer(mb).data, status=status.HTTP_201_CREATED)
    # platform mailboxes (is_platform=True) never appear in a workspace's
    # Settings → Mailboxes list — they live in the superadmin console only
    return Response(MailboxSerializer(Mailbox.objects.filter(is_platform=False), many=True).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def mailbox_test(request):
    """Wizard Test Connection: real IMAP + SMTP login probe (core.mailbox_probe).
    Body {imapHost, imapPort, smtpHost, smtpPort, username, password} →
    {imap: {ok, detail}, smtp: {ok, detail}}.  The password is used for the
    probe only — never echoed in the response or logged."""
    from .mailbox_probe import PROBE_TIMEOUT, probe_mailbox
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''
    if not username or not password:
        return Response({'detail': 'Enter the mailbox address and its password / app password.'},
                        status=400)
    try:
        result = probe_mailbox(
            imap_host=request.data.get('imapHost') or '',
            imap_port=request.data.get('imapPort') or 993,
            smtp_host=request.data.get('smtpHost') or '',
            smtp_port=request.data.get('smtpPort') or 587,
            username=username, password=password, timeout=PROBE_TIMEOUT,
        )
    except Exception:  # probe is never-raises by contract; belt and braces
        result = {'imap': {'ok': False, 'detail': 'Probe failed unexpectedly.'},
                  'smtp': {'ok': False, 'detail': 'Probe failed unexpectedly.'}}
    return Response(result)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsWorkspaceAdminOrReadOnly])
def mailbox_detail(request, mailbox_id):
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    if request.method == 'DELETE':
        # its queued drafts lose their mailbox; the next drain reassigns them
        mb.delete()
        return Response(status=204)
    if request.method in ('PUT', 'PATCH'):
        serializer = MailboxSerializer(mb, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        mb = serializer.save()
        _auto_enroll_warmup(request, mb)
    return Response(MailboxSerializer(mb).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def mailbox_dns_check(request, mailbox_id):
    from .dns_check import refresh_mailbox_dns
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    refresh_mailbox_dns(mb)
    return Response(MailboxSerializer(mb).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def mailbox_resume(request, mailbox_id):
    from .outbox import resume_mailbox
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    resume_mailbox(mb)
    kick_drain()
    return Response(MailboxSerializer(mb).data)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def mailbox_enroll_warmup(request, mailbox_id):
    """Enroll one sending mailbox into the WarmPulse warmup network.

    SMTP credentials never reach the browser (masked on read): this view
    reads them server-side and posts to the warmup create route over the
    bridge JWT — see core.warmup_enroll. Idempotent by email address.
    """
    from .warmup_enroll import WarmupEnrollError, enroll_mailbox
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    if not mb.configured():   # nothing to forward — refuse before any bridge call
        return Response({'detail': WARMUP_NOT_CONFIGURED}, status=400)
    try:
        result = enroll_mailbox(user=request.user, workspace_slug=_warmup_slug(request), mailbox=mb)
    except WarmupEnrollError as exc:
        mb.warmup_enroll_error = str(exc.detail)
        mb.save(update_fields=['warmup_enroll_error'])
        return Response({'detail': exc.detail}, status=exc.status_code)
    # an explicit enroll/retry is also the opt-in: flag on, stale error cleared
    mb.warmup_enrolled = True
    mb.warmup_enroll_error = ''
    mb.save(update_fields=['warmup_enrolled', 'warmup_enroll_error'])
    return Response(result, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def outbox_drain(request):
    """Best-effort 'send what is due now' (the worker does this every 30 s)."""
    from .outbox import drain_outbox
    return Response(drain_outbox())


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def warmpulse_sync(request):
    from . import warmpulse
    matched = warmpulse.sync(force=True)
    if matched is None:
        return Response({'ok': False, 'message': 'Could not reach WarmPulse with that key.'
                         if warmpulse.enabled() else 'Add a WarmPulse API key first.'})
    return Response({'ok': True, 'matched': matched})


# ------------------------------------------------------------------
# WEBMAIL — read/send the connected mailboxes (core.webmail)
# ------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def webmail_accounts(request):
    """One row per configured() Mailbox with its INBOX unread count.
    An unreachable account degrades to unread=null — the list never 500s.
    A platform admin (no workspace) gets the PLATFORM mailboxes only
    (is_platform=True — the console Mail page); workspace users get their
    own workspace's mailboxes only — the two never mix."""
    from . import webmail
    if is_platform_admin(request.user):
        scoped = Mailbox.all_tenants.filter(is_platform=True)
    else:
        scoped = Mailbox.objects.filter(is_platform=False)
    return Response(webmail.list_accounts(scoped))


@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def webmail_folders(request, mailbox_id):
    from . import webmail
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    try:
        return Response(webmail.folder_overview(mb))
    except webmail.WebmailError as exc:
        return Response({'detail': str(exc)}, status=502)


@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def webmail_messages(request, mailbox_id):
    """Envelope page (?folder=INBOX&page=1&query=) — BODY.PEEK, read-only."""
    from . import webmail
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    try:
        result = webmail.list_messages(mb, folder=request.query_params.get('folder') or 'INBOX',
                                       page=request.query_params.get('page') or 1,
                                       query=request.query_params.get('query') or '')
    except webmail.WebmailError as exc:
        return Response({'detail': str(exc)}, status=502)
    return Response(result)


@api_view(['GET'])
@permission_classes([IsWorkspaceAdmin])
def webmail_message(request, mailbox_id):
    """Full message (?folder=&uid=) — the BODY[] fetch sets \\Seen."""
    from . import webmail
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    uid = request.query_params.get('uid')
    # isdigit() alone accepts unicode digits ("²") that int() then rejects
    if not uid or not (str(uid).isascii() and str(uid).isdigit()):
        return Response({'detail': 'A numeric ?uid= is required.'}, status=400)
    try:
        return Response(webmail.get_message(
            mb, folder=request.query_params.get('folder') or 'INBOX', uid=int(uid)))
    except webmail.WebmailError as exc:
        return Response({'detail': str(exc)}, status=502)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def webmail_send(request, mailbox_id):
    """Send from one connected mailbox ({to, subject, body_html, in_reply_to?})
    over the mailer SMTP helpers; the Sent-folder APPEND is best-effort."""
    from . import webmail
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    to = (request.data.get('to') or '').strip()
    if not valid_recipient(to):
        return Response({'detail': NO_RECIPIENT_ERROR}, status=400)
    try:
        result = webmail.send_message(mb, to=to, subject=request.data.get('subject') or '',
                                      body_html=request.data.get('body_html') or '',
                                      in_reply_to=request.data.get('in_reply_to') or '')
    except webmail.WebmailError as exc:
        return Response({'detail': str(exc)}, status=502)
    except Exception as exc:  # SMTP-level failure — typed detail, never a 500
        return Response({'detail': f'Send failed ({exc.__class__.__name__}).'}, status=502)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsWorkspaceAdmin])
def webmail_mark(request, mailbox_id):
    """{folder, uids[], action: seen|unread|flagged|trash} → {ok: count}."""
    from . import webmail
    mb = _get_mailbox(request, mailbox_id)
    if mb is None:
        return Response({'detail': 'mailbox not found'}, status=404)
    action = request.data.get('action')
    uids = request.data.get('uids')
    if action not in ('seen', 'unread', 'flagged', 'trash'):
        return Response({'detail': 'action must be one of seen, unread, flagged, trash.'},
                        status=400)
    if not isinstance(uids, list) or not uids:
        return Response({'detail': 'uids must be a non-empty list.'}, status=400)
    try:
        result = webmail.mark_messages(mb, folder=request.data.get('folder') or 'INBOX',
                                       uids=uids, action=action)
    except webmail.WebmailError as exc:
        return Response({'detail': str(exc)}, status=502)
    except ValueError as exc:
        return Response({'detail': str(exc)}, status=400)
    return Response(result)


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
    /pipeline/status/.  ?wait=1 runs synchronously (scripts).

    422 when the workspace has no proper data (company name, what it sells,
    who to find): lead finding stays off until the setup is complete — the
    reply says what is missing."""
    gate = lead_fetch_status()
    if not gate['ready']:
        return Response({'detail': gate['message'], 'missing': gate['missing']}, status=422)
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


# ── admin secret slug ─────────────────────────────────────────────────────

import re


def _log_wrong_slug_attempt(tried_slug, ip):
    """Record a wrong 6-digit admin slug hit — summarized in the weekly digest
    (management command send_slug_report, run by the VPS cron on Mondays)."""
    from .models import SlugAttempt
    SlugAttempt.objects.create(slug=tried_slug[:10], ip=(ip or '')[:45])


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AdminSlugThrottle])
def admin_slug_check(request):
    """Check a 6-digit slug. Valid → {valid:true}; wrong → log attempt + {valid:false}.
    Attempts are emailed as a weekly digest (cron → send_slug_report)."""
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or \
         request.META.get('REMOTE_ADDR', 'unknown')
    # wrong-slug lockout: 10+ hits from one IP in 15 min → 429 for the rest of the window
    since = timezone.now() - timedelta(minutes=15)
    if SlugAttempt.objects.filter(ip=ip, created_at__gte=since).count() >= 10:
        return Response({'error': 'too_many_attempts'}, status=429)
    slug = str(request.data.get('slug', '')).strip()
    if not re.fullmatch(r'\d{6}', slug):
        return Response({'valid': False, 'detail': 'Not a 6-digit slug.'}, status=400)
    s = AppSettings.all_tenants.first()
    if s and s.admin_slug and slug == s.admin_slug:
        return Response({'valid': True})
    # wrong slug → log for the weekly digest + 404 response
    try:
        _log_wrong_slug_attempt(slug, ip)
    except Exception:
        pass  # logging failure must never block the response
    return Response({'valid': False}, status=404)
