"""API routes — /api/… consumed by the frontend."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import unsubscribe, views, views_sequences as vs

router = DefaultRouter()
router.register('leads', views.LeadViewSet, basename='lead')
router.register('potential', views.PotentialViewSet, basename='potential')
router.register('replies', views.ReplyViewSet, basename='reply')

urlpatterns = [
    path('', include('billing.urls')),   # /api/billing/*, /api/webhooks/*
    # health & meta
    path('health/', views.health, name='health'),
    # public, token-signed opt-out (email footer link + RFC 8058 one-click)
    path('unsubscribe/<str:token>/', unsubscribe.unsubscribe_view, name='unsubscribe'),
    # users / roles
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login, name='login'),
    path('auth/me/', views.me, name='me'),
    path('auth/logout/', views.logout, name='logout'),
    path('auth/password/', views.change_password, name='change-password'),
    # CRM — custom lead routes BEFORE the router (else 'export' is treated as a pk)
    path('leads/export/', views.leads_export, name='leads-export'),
    path('leads/<int:lead_id>/draft_email/', views.lead_draft_email, name='lead-draft-email'),
    path('report/generate/', views.report_generate, name='report-generate'),
    path('', include(router.urls)),
    # agents
    path('agents/', views.agents, name='agents'),
    path('agents/<str:agent_key>/config/', views.agent_config, name='agent-config'),
    # settings
    path('settings/', views.settings_view, name='settings'),
    # one-click mailbox connect (Zoho/Gmail/custom) — verifies + saves SMTP
    path('settings/smtp_connect/', views.smtp_connect, name='smtp-connect'),
    # search profiles — saved lead-targeting presets w/ one-click switching
    path('profiles/', views.profiles, name='profiles'),
    path('profiles/<int:profile_id>/activate/', views.profile_activate, name='profile-activate'),
    # outreach templates (Settings → Email Templates)
    path('templates/', views.templates, name='templates'),
    path('templates/<int:template_id>/', views.template_detail, name='template-detail'),
    # daily report — send now (same delivery as the 20:00 IST scheduler)
    path('report/test/', views.report_test, name='report-test'),
    # outreach — cold-email drafts (approve → send)
    path('drafts/', views.drafts, name='drafts'),
    path('drafts/bulk_approve/', views.drafts_bulk_approve, name='drafts-bulk-approve'),
    path('drafts/<int:draft_id>/', views.draft_detail, name='draft-detail'),
    path('drafts/<int:draft_id>/approve/', views.draft_approve, name='draft-approve'),
    path('drafts/<int:draft_id>/reject/', views.draft_reject, name='draft-reject'),
    path('drafts/<int:draft_id>/send/', views.draft_send, name='draft-send'),
    path('outreach/status/', views.outreach_status, name='outreach-status'),
    # outbox — sending mailboxes, DNS health, pause/resume, WarmPulse
    path('outbox/drain/', views.outbox_drain, name='outbox-drain'),
    # inbox — read replies + bounces from the mailboxes now (core.inbox)
    path('inbox/poll/', views.inbox_poll, name='inbox-poll'),
    path('mailboxes/', views.mailboxes, name='mailboxes'),
    path('mailboxes/<int:mailbox_id>/', views.mailbox_detail, name='mailbox-detail'),
    path('mailboxes/<int:mailbox_id>/dns_check/', views.mailbox_dns_check, name='mailbox-dns-check'),
    path('mailboxes/<int:mailbox_id>/resume/', views.mailbox_resume, name='mailbox-resume'),
    path('warmpulse/sync/', views.warmpulse_sync, name='warmpulse-sync'),
    # follow-up sequences, assisted tasks, WhatsApp (core.sequences / core.whatsapp)
    path('sequences/', vs.sequences_list, name='sequences'),
    path('sequences/<int:seq_id>/', vs.sequence_detail, name='sequence-detail'),
    path('enrollments/', vs.enrollments_list, name='enrollments'),
    path('enrollments/<int:enrollment_id>/stop/', vs.enrollment_stop, name='enrollment-stop'),
    path('tasks/', vs.tasks_list, name='tasks'),
    path('tasks/<int:task_id>/<str:action>/', vs.task_update, name='task-update'),
    path('whatsapp/messages/', vs.whatsapp_messages, name='whatsapp-messages'),
    path('whatsapp/messages/<int:msg_id>/<str:action>/', vs.whatsapp_message_action,
         name='whatsapp-message-action'),
    path('whatsapp/status/', vs.whatsapp_status, name='whatsapp-status'),
    path('whatsapp/qr/', vs.whatsapp_qr, name='whatsapp-qr'),
    path('whatsapp/test/', vs.whatsapp_test, name='whatsapp-test'),
    path('whatsapp/opt_out/', vs.whatsapp_opt_out, name='whatsapp-opt-out'),
    # chat
    path('chat/', views.chat, name='chat'),
    # first-login setup wizard state (drives the chat onboarding UI)
    path('onboarding/', views.onboarding, name='onboarding'),
    # in-product AI guide
    path('guide/', views.guide, name='guide'),
    # pipeline loop
    path('pipeline/status/', views.pipeline_status_view, name='pipeline-status'),
    path('pipeline/run/', views.pipeline_run, name='pipeline-run'),
    path('pipeline/runs/', views.pipeline_runs, name='pipeline-runs'),
]
