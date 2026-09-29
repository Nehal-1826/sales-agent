"""
Data schema for the Marketing & Sales Agentic AI system.

Maps 1:1 to the handwritten architecture:
  CRM        → Lead (LEADS) · Potential (POTENTIAL) · Reply (REPLY)
  AGENTS     → AgentConfig (DB / API / SYSTEM PROMPTS / NEGATIVE / MODEL)
  SETTINGS   → AppSettings (Company Profile · AI Key · Frequent Runs)
  CHAT       → ChatMessage (Responder / Chatbot conversation)
  LOOP       → PipelineRun (orchestrator run history)
  USERS      → User with roles (Owner / Admin / Member)
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Application user with a pipeline role."""

    class Roles(models.TextChoices):
        OWNER = 'owner', 'Owner'
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    role = models.CharField(max_length=10, choices=Roles.choices, default=Roles.MEMBER)

    def save(self, *args, **kwargs):
        # First user to sign up owns the workspace.
        if not self.pk and not User.objects.exists():
            self.role = self.Roles.OWNER
        super().save(*args, **kwargs)


class Timestamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class HealthBeat(models.Model):
    """Liveness heartbeats from background processes (worker, report scheduler).

    The API process writes nothing here — it only reads staleness, so
    GET /api/health/ can report whether the agent worker is actually running
    even though they are separate processes.
    """

    name = models.CharField(max_length=50, unique=True)  # 'worker' | 'report'
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.name} @ {self.updated_at:%H:%M:%S}'


class Lead(Timestamped):
    """CRM — LEADS: companies discovered by the Search (Scrape) agent."""

    company = models.CharField(max_length=200)
    industry = models.CharField(max_length=200, blank=True)
    website = models.CharField(max_length=300, blank=True)
    score = models.PositiveSmallIntegerField(default=0)  # 0–100, set by Profile
    source = models.CharField(max_length=300, blank=True)  # how Search found it
    profiled = models.BooleanField(default=False)
    # Region — derived from the discovery query / site TLD (state + country wise sorting)
    state = models.CharField(max_length=100, blank=True)    # e.g. 'Tamil Nadu'
    country = models.CharField(max_length=100, blank=True)  # e.g. 'India'
    # Real scraped data (Profile agent)
    has_website = models.BooleanField(default=False)  # website / no-website categorization
    contact_email = models.CharField(max_length=200, blank=True)  # found on their site
    findings = models.JSONField(default=list, blank=True)  # [{area, issue, recommendation, severity}]
    analysis = models.JSONField(default=dict, blank=True)  # raw scrape metrics

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.company


class EmailDraft(Timestamped):
    """Outreach — cold email drafted by Copywright, sent after approval."""

    class Statuses(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        APPROVED = 'approved', 'Approved'
        SENT = 'sent', 'Sent'
        REJECTED = 'rejected', 'Rejected'
        FAILED = 'failed', 'Failed'

    class Via(models.TextChoices):
        SMTP = 'smtp', 'SMTP'
        CONSOLE = 'console', 'Console'

    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name='drafts')
    company = models.CharField(max_length=200)
    to_email = models.CharField(max_length=200, blank=True)
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    findings = models.JSONField(default=list, blank=True)  # snapshot of the lead's flaws used
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.DRAFT)
    sent_via = models.CharField(max_length=20, choices=Via.choices, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.company} — {self.get_status_display()}'


class Potential(Timestamped):
    """CRM — POTENTIAL: opportunities identified by the system."""

    class Stages(models.TextChoices):
        DISCOVERY = 'discovery', 'Discovery'
        QUALIFIED = 'qualified', 'Qualified'
        PROPOSAL = 'proposal', 'Proposal'
        NEGOTIATION = 'negotiation', 'Negotiation'

    company = models.CharField(max_length=200)
    opportunity = models.CharField(max_length=300)
    value = models.CharField(max_length=50, blank=True)
    stage = models.CharField(max_length=20, choices=Stages.choices, default=Stages.DISCOVERY)
    owner_agent = models.CharField(max_length=50, default='Profile agent')
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name='potentials')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.company} — {self.opportunity}'


class Reply(Timestamped):
    """CRM — REPLY: responses handled by the Responder (Chatbot)."""

    class Statuses(models.TextChoices):
        REPLIED = 'replied', 'Replied'
        AWAITING = 'awaiting', 'Awaiting'
        MEETING = 'meeting', 'Meeting booked'

    class Channels(models.TextChoices):
        EMAIL = 'email', 'Email'
        LINKEDIN = 'linkedin', 'LinkedIn'
        WEBCHAT = 'webchat', 'Webchat'

    company = models.CharField(max_length=200)
    contact = models.CharField(max_length=200, blank=True)
    channel = models.CharField(max_length=10, choices=Channels.choices, default=Channels.EMAIL)
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.AWAITING)
    summary = models.TextField(blank=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.company} — {self.get_status_display()}'


class AgentConfig(Timestamped):
    """AGENTS page — per-agent configuration (DB / API / prompts / model)."""

    class Agents(models.TextChoices):
        SEARCH = 'search', 'Search (Scrape)'
        PROFILE = 'profile', 'Profile'
        COPYWRIGHT = 'copywright', 'Copywright'
        RESPONDER = 'responder', 'Responder (Chatbot)'

    agent = models.CharField(max_length=20, choices=Agents.choices, unique=True)
    # DB
    db_provider = models.CharField(max_length=20, default='postgresql')
    db_name = models.CharField(max_length=200, blank=True)
    db_connection = models.CharField(max_length=500, blank=True)
    # API
    api_url = models.CharField(max_length=500, blank=True)
    api_auth = models.CharField(max_length=500, blank=True)
    # Prompts
    system_prompt = models.TextField(blank=True)
    negative_prompt = models.TextField(blank=True)
    # Model
    model = models.CharField(max_length=100, default='GLM-4.6')

    class Meta:
        ordering = ['id']

    def __str__(self):
        return self.get_agent_display()


class AppSettings(Timestamped):
    """SETTINGS page — Company Profile · AI Key · Frequent Runs (singleton)."""

    class Frequencies(models.TextChoices):
        EVERY_15M = '15m', 'Every 15 minutes'
        EVERY_1H = '1h', 'Every hour'
        EVERY_6H = '6h', 'Every 6 hours'
        DAILY = 'daily', 'Daily'

    # Company Profile
    company_name = models.CharField(max_length=200, blank=True)
    company_website = models.CharField(max_length=300, blank=True)
    company_description = models.TextField(blank=True)
    services = models.JSONField(default=list, blank=True)

    # AI Key (never returned in full by the API)
    ai_provider = models.CharField(max_length=50, default='OpenAI')
    ai_key = models.CharField(max_length=500, blank=True)

    # SMTP — outbound cold email (password never returned in full by the API)
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_port = models.PositiveIntegerField(null=True, blank=True)
    smtp_user = models.CharField(max_length=200, blank=True)
    smtp_password = models.CharField(max_length=500, blank=True)
    from_email = models.CharField(max_length=200, blank=True)

    # Daily report — recipient of the 8 PM IST lead report (comma-separated allowed;
    # falls back to superuser/staff emails when blank)
    report_email = models.CharField(max_length=300, blank=True)

    # Frequent Runs
    runs_enabled = models.BooleanField(default=True)
    run_frequency = models.CharField(max_length=10, choices=Frequencies.choices, default=Frequencies.EVERY_1H)

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        obj._absorb_env_secrets()
        return obj

    def _absorb_env_secrets(self):
        """On a VPS, secrets live in environment variables — fill only the
        empty DB fields once so the admin UI stays the source of truth."""
        import os
        env_map = {
            'smtp_host': 'SMTP_HOST',
            'smtp_user': 'SMTP_USER',
            'smtp_password': 'SMTP_PASSWORD',
            'from_email': 'FROM_EMAIL',
            'report_email': 'REPORT_EMAIL',
            'ai_provider': 'AI_PROVIDER',
            'ai_key': 'AI_KEY',
        }
        dirty = False
        for field, env_name in env_map.items():
            value = os.environ.get(env_name, '')
            if value and not getattr(self, field):
                setattr(self, field, value)
                dirty = True
        if dirty:
            self.save(update_fields=[f for f, e in env_map.items() if os.environ.get(e)])

    def __str__(self):
        return 'App settings'


class ChatMessage(Timestamped):
    """CHAT — conversation with the Responder (Chatbot)."""

    class Roles(models.TextChoices):
        USER = 'user', 'User'
        AI = 'ai', 'Responder'

    user = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='chat_messages')
    role = models.CharField(max_length=10, choices=Roles.choices)
    text = models.TextField()

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.get_role_display()}: {self.text[:40]}'


class PipelineRun(Timestamped):
    """LOOP — one orchestrator cycle through the agent pipeline."""

    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(auto_now=True)
    triggered_by = models.CharField(max_length=50, default='manual')
    summary = models.JSONField(default=dict)
    leads_created = models.PositiveSmallIntegerField(default=0)
    potentials_created = models.PositiveSmallIntegerField(default=0)
    replies_created = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'Run #{self.pk} ({self.started_at:%Y-%m-%d %H:%M})'
