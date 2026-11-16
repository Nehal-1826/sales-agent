"""Re-export every model so Alembic autogenerate and external code see them all."""
from __future__ import annotations

from app.db.models.addons import Addon, WorkspaceAddon
from app.db.models.api_keys import ApiKey
from app.db.models.app_settings import AppSetting
from app.db.models.audit_logs import AuditLog
from app.db.models.client_pool_assignments import ClientPoolAssignment
from app.db.models.crm_campaigns import CrmCampaign, CrmCampaignStatus
from app.db.models.crm_lead_activities import CrmActivityKind, CrmLeadActivity
from app.db.models.crm_email_templates import CrmEmailTemplate
from app.db.models.crm_leads import CrmLead, CrmLeadStage
from app.db.models.crm_sequence_enrollments import (
    CrmEnrollmentStatus,
    CrmSequenceEnrollment,
)
from app.db.models.crm_sequence_steps import CrmSequenceStep
from app.db.models.crm_sequences import CrmSequence, CrmSequenceStatus
from app.db.models.daily_metrics import DailyMetric
from app.db.models.device_tokens import DeviceToken
from app.db.models.domain_credentials import DomainCredential
from app.db.models.domain_reputation_snapshots import DomainReputationSnapshot
from app.db.models.email_templates import EmailTemplate
from app.db.models.generated_reports import GeneratedReport
from app.db.models.mailboxes import ContentMode, Mailbox, MailboxProvider, WarmupStatus
from app.db.models.notification_settings import NotificationChannel, NotificationSetting
from app.db.models.notifications import Notification
from app.db.models.payments import Payment, PaymentStatus
from app.db.models.peer_inboxes import PeerInbox, PeerProvider
from app.db.models.peer_pools import PeerPool, PeerPoolMember
from app.db.models.placement_test_seeds import PlacementTestSeed
from app.db.models.placement_tests import PlacementTest
from app.db.models.plans import Plan
from app.db.models.cashfree_events import CashfreeEvent
from app.db.models.revenge_events import RevengeEvent, RevengeStatus, RevengeTrigger
from app.db.models.schedule_windows import ScheduleWindow
from app.db.models.scheduled_reports import ScheduledReport
from app.db.models.spam_scans import SpamScan
from app.db.models.stripe_events import StripeEvent
from app.db.models.sub_clients import SubClient
from app.db.models.team_members import TeamMember
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.models.warmup_logs import WarmupAction, WarmupDirection, WarmupLog
from app.db.models.warmup_threads import WarmupThread
from app.db.models.llm_usage import LlmUsage
from app.db.models.webhooks import Webhook, WebhookDelivery
from app.db.models.workspace_branding import WorkspaceBranding
from app.db.models.workspace_custom_domains import WorkspaceCustomDomain
from app.db.models.workspace_settings import WorkspaceSetting
from app.db.models.admin_report_schedules import AdminReportSchedule

__all__ = [
    "AdminReportSchedule",
    "Addon",
    "WorkspaceAddon",
    "ApiKey",
    "AppSetting",
    "AuditLog",
    "ClientPoolAssignment",
    "CrmCampaign",
    "CrmCampaignStatus",
    "CrmEmailTemplate",
    "CrmActivityKind",
    "CrmLeadActivity",
    "CrmLead",
    "CrmLeadStage",
    "CrmSequence",
    "CrmSequenceStatus",
    "CrmSequenceStep",
    "CrmSequenceEnrollment",
    "CrmEnrollmentStatus",
    "DailyMetric",
    "DeviceToken",
    "DomainCredential",
    "DomainReputationSnapshot",
    "EmailTemplate",
    "GeneratedReport",
    "Mailbox",
    "MailboxProvider",
    "WarmupStatus",
    "ContentMode",
    "Notification",
    "NotificationChannel",
    "NotificationSetting",
    "Payment",
    "PaymentStatus",
    "PeerInbox",
    "PeerProvider",
    "PeerPool",
    "PeerPoolMember",
    "PlacementTest",
    "PlacementTestSeed",
    "Plan",
    "RevengeEvent",
    "RevengeStatus",
    "RevengeTrigger",
    "CashfreeEvent",
    "ScheduleWindow",
    "ScheduledReport",
    "SpamScan",
    "StripeEvent",
    "SubClient",
    "TeamMember",
    "OnboardingStatus",
    "User",
    "UserRole",
    "WarmupAction",
    "WarmupDirection",
    "WarmupLog",
    "WarmupThread",
    "LlmUsage",
    "Webhook",
    "WebhookDelivery",
    "WorkspaceBranding",
    "WorkspaceCustomDomain",
    "WorkspaceSetting",
]
