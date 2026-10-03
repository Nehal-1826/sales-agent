"""API routes — /api/… consumed by the frontend."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework.authtoken.views import obtain_auth_token

from . import views

router = DefaultRouter()
router.register('leads', views.LeadViewSet, basename='lead')
router.register('potential', views.PotentialViewSet, basename='potential')
router.register('replies', views.ReplyViewSet, basename='reply')

urlpatterns = [
    # health & meta
    path('health/', views.health, name='health'),
    # users / roles
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login, name='login'),
    path('auth/token/', obtain_auth_token, name='token'),  # DRF default username/password token
    path('auth/me/', views.me, name='me'),
    path('auth/password/', views.change_password, name='change-password'),
    # CRM
    path('', include(router.urls)),
    # agents
    path('agents/', views.agents, name='agents'),
    path('agents/<str:agent_key>/config/', views.agent_config, name='agent-config'),
    # settings
    path('settings/', views.settings_view, name='settings'),
    # daily report — send now (same delivery as the 20:00 IST scheduler)
    path('report/test/', views.report_test, name='report-test'),
    # outreach — cold-email drafts (approve → send)
    path('drafts/', views.drafts, name='drafts'),
    path('drafts/<int:draft_id>/', views.draft_detail, name='draft-detail'),
    path('drafts/<int:draft_id>/approve/', views.draft_approve, name='draft-approve'),
    path('drafts/<int:draft_id>/reject/', views.draft_reject, name='draft-reject'),
    path('drafts/<int:draft_id>/send/', views.draft_send, name='draft-send'),
    path('outreach/status/', views.outreach_status, name='outreach-status'),
    # chat
    path('chat/', views.chat, name='chat'),
    # pipeline loop
    path('pipeline/status/', views.pipeline_status_view, name='pipeline-status'),
    path('pipeline/run/', views.pipeline_run, name='pipeline-run'),
    path('pipeline/runs/', views.pipeline_runs, name='pipeline-runs'),
]
