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

from .chat import responder_reply
from .guide import guide_answer
from .health import status_of
from .mailer import send_draft, smtp_configured
from .models import AgentConfig, AppSettings, ChatMessage, EmailDraft, EmailTemplate, Lead, PipelineRun, Potential, Reply, User
from .pipeline import pipeline_status, run_pipeline
from .reports import _resolve_recipients, send_daily_report
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
    return Response({'token': token.key, 'user': UserSerializer(user).data})


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
    return Response({'detail': 'password updated'})


# ------------------------------------------------------------------
# CRM — LEADS · POTENTIAL · REPLY
# ------------------------------------------------------------------

class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer


class PotentialViewSet(viewsets.ModelViewSet):
    queryset = Potential.objects.all()
    serializer_class = PotentialSerializer


class ReplyViewSet(viewsets.ModelViewSet):
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
    metas = []
    for key, (name, short, role) in AGENT_META.items():
        metas.append({
            'key': key,
            'name': name,
            'shortName': short,
            'role': role,
            'status': 'Active',
            'lastAction': actions[key],
        })
    return Response(AgentMetaSerializer(metas, many=True).data)


@api_view(['GET', 'PUT'])
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
def settings_view(request):
    obj = AppSettings.load()
    if request.method == 'PUT':
        serializer = SettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(SettingsSerializer(obj).data)


@api_view(['POST'])
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
# AI AUTOPILOT — consent, status and revoke
# ------------------------------------------------------------------

@api_view(['GET', 'POST'])
def autopilot(request):
    """GET → {enabled, sentToday, dailyLimit, activity[]}. POST {enabled, dailyLimit?}
    → toggle after the user's explicit accept/revoke."""
    from .autopilot import autopilot_status, set_autopilot

    if request.method == 'POST':
        if 'enabled' not in request.data:
            return Response({'detail': 'enabled is required'}, status=400)
        return Response(set_autopilot(bool(request.data.get('enabled')),
                                      request.data.get('dailyLimit')))
    return Response(autopilot_status())


# ------------------------------------------------------------------
# LEADS & REPORTS — full lead list export + on-demand report generation
# ------------------------------------------------------------------

@api_view(['GET'])
def leads_export(request):
    """All leads as a CSV download (Leads & Reports page)."""
    import csv
    from django.http import HttpResponse

    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="leads.csv"'
    writer = csv.writer(response)
    writer.writerow(['Company', 'Industry', 'Website', 'Country', 'State', 'Score',
                     'Contact email', 'Has website', 'Flaws', 'AI description', 'Source', 'Discovered'])
    for l in Lead.objects.order_by('-created_at'):
        writer.writerow([
            l.company, l.industry, l.website, l.country, l.state, l.score,
            l.contact_email, 'yes' if l.has_website else 'no', len(l.findings or []),
            (l.description or '').replace('\n', ' '), l.source,
            l.created_at.strftime('%Y-%m-%d %H:%M'),
        ])
    return response


@api_view(['POST'])
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
def templates(request):
    if request.method == 'POST':
        serializer = EmailTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tpl = serializer.save()
        _ensure_single_default(tpl)
        return Response(EmailTemplateSerializer(tpl).data, status=status.HTTP_201_CREATED)
    return Response(EmailTemplateSerializer(EmailTemplate.objects.all(), many=True).data)


@api_view(['PUT', 'DELETE'])
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
    return Response({'answer': guide_answer(text, history)})


# ------------------------------------------------------------------
# CHAT — Responder (Chatbot)
# ------------------------------------------------------------------

@api_view(['GET', 'POST', 'DELETE'])
def chat(request):
    if request.method == 'DELETE':
        deleted, _ = ChatMessage.objects.filter(user=request.user).delete()
        return Response({'cleared': True, 'deleted': deleted})
    if request.method == 'POST':
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'text is required'}, status=400)
        user_msg = ChatMessage.objects.create(user=request.user, role='user', text=text)
        reply_text = responder_reply(text, turn=user_msg.id, username=request.user.username)
        ai_msg = ChatMessage.objects.create(user=request.user, role='ai', text=reply_text)
        return Response({
            'userMessage': ChatMessageSerializer(user_msg).data,
            'reply': ChatMessageSerializer(ai_msg).data,
        })
    messages = ChatMessage.objects.filter(user=request.user)
    return Response(ChatMessageSerializer(messages, many=True).data)


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
    objs = EmailDraft.objects.all()[:50]
    return Response(EmailDraftSerializer(objs, many=True).data)


@api_view(['GET', 'PUT'])
def draft_detail(request, draft_id):
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if request.method == 'PUT':
        # editable only while it is still a draft
        if draft.status != EmailDraft.Statuses.DRAFT:
            return Response({'detail': 'only drafts can be edited'}, status=409)
        for field in ('subject', 'body', 'to_email'):
            if field in request.data:
                setattr(draft, field, (request.data[field] or '').strip())
        draft.save()
    return Response(EmailDraftSerializer(draft).data)


@api_view(['POST'])
def draft_approve(request, draft_id):
    """Approve → send immediately. Sent via SMTP, or console when unset."""
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
        return Response({'detail': f'draft is already {draft.status}'}, status=409)
    draft.status = EmailDraft.Statuses.APPROVED
    draft.save(update_fields=['status', 'updated_at'])
    send_draft(draft)
    return Response(EmailDraftSerializer(draft).data)


@api_view(['POST'])
def draft_reject(request, draft_id):
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status == EmailDraft.Statuses.SENT:
        return Response({'detail': 'draft already sent'}, status=409)
    draft.status = EmailDraft.Statuses.REJECTED
    draft.save(update_fields=['status', 'updated_at'])
    return Response(EmailDraftSerializer(draft).data)


@api_view(['POST'])
def draft_send(request, draft_id):
    """Retry delivery of an approved/failed draft."""
    draft = _get_draft(draft_id)
    if draft is None:
        return Response({'detail': 'draft not found'}, status=404)
    if draft.status not in (EmailDraft.Statuses.APPROVED, EmailDraft.Statuses.FAILED):
        return Response({'detail': 'only approved/failed drafts can be sent'}, status=409)
    send_draft(draft)
    return Response(EmailDraftSerializer(draft).data)


@api_view(['GET'])
def outreach_status(request):
    """One-line summary for the status strip."""
    return Response({
        'drafts': EmailDraft.objects.filter(status=EmailDraft.Statuses.DRAFT).count(),
        'sent': EmailDraft.objects.filter(status=EmailDraft.Statuses.SENT).count(),
        'failed': EmailDraft.objects.filter(status=EmailDraft.Statuses.FAILED).count(),
        'smtpConfigured': smtp_configured(),
    })


# ------------------------------------------------------------------
# PIPELINE — orchestrator loop
# ------------------------------------------------------------------

@api_view(['GET'])
def pipeline_status_view(request):
    return Response(pipeline_status())


@api_view(['POST'])
def pipeline_run(request):
    run = run_pipeline(triggered_by=request.data.get('triggeredBy', 'manual'))
    return Response(PipelineRunSerializer(run).data, status=201)


@api_view(['GET'])
def pipeline_runs(request):
    runs = PipelineRun.objects.all()[:20]
    return Response(PipelineRunSerializer(runs, many=True).data)
