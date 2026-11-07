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
import os

from django.db import models

from .tenancy import TenantOwned, current_workspace


class Workspace(models.Model):
    """One company (tenant). Every tenant-owned row belongs to exactly one."""

    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=60, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = models.Manager()
    # same name as the tenant models' unscoped manager, so callers can grep
    # one idiom for "deliberately not tenant-scoped"
    all_tenants = models.Manager()

    def __str__(self):
        return self.name


class User(AbstractUser):
    """Application user with a pipeline role."""

    class Roles(models.TextChoices):
        OWNER = 'owner', 'Owner'
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    role = models.CharField(max_length=10, choices=Roles.choices, default=Roles.MEMBER)
    # per-user chat onboarding state (core.onboarding): {started, done, step,
    # answers{...}} — every NEW login gets the setup wizard; empty = fresh user
    onboarding = models.JSONField(default=dict, blank=True)
    # chat action awaiting an explicit "yes" (core.actions): {spec, summary, expires}
    pending_action = models.JSONField(default=dict, blank=True)
    # null only for platform operators (superusers: Django admin / manage.py)
    workspace = models.ForeignKey(Workspace, null=True, blank=True,
                                  on_delete=models.CASCADE, related_name='users')

    def save(self, *args, **kwargs):
        # A new tenant user inherits the active workspace (tests, create_workspace).
        if self.workspace_id is None and not self.is_superuser:
            ws = current_workspace()
            if ws is not None:
                self.workspace = ws
        # First user IN THAT WORKSPACE owns it.
        if (not self.pk and self.workspace_id is not None
                and not User.objects.filter(workspace_id=self.workspace_id).exists()):
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


class Lead(TenantOwned, Timestamped):
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
    contact_phone = models.CharField(max_length=40, blank=True)   # found on their site
    findings = models.JSONField(default=list, blank=True)  # [{area, issue, recommendation, severity}]
    analysis = models.JSONField(default=dict, blank=True)  # raw scrape metrics
    # AI (Gemini) summary of what the company does, written from its own site text
    description = models.TextField(blank=True)
    # "Do not contact" — stops every follow-up sequence for this lead (core.sequences)
    do_not_contact = models.BooleanField(default=False)

    class Meta(TenantOwned.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return self.company


class EmailDraft(TenantOwned, Timestamped):
    """Outreach — cold email drafted by Copywright, sent after approval."""

    class Statuses(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        APPROVED = 'approved', 'Approved'  # claimed: being sent right now
        QUEUED = 'queued', 'Queued'  # approved, waiting in the outbox (core.outbox)
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
    # Outbox (core.outbox): which mailbox sends it and when it is due.
    mailbox = models.ForeignKey('core.Mailbox', null=True, blank=True,
                                on_delete=models.SET_NULL, related_name='drafts')
    scheduled_for = models.DateTimeField(null=True, blank=True, db_index=True)
    # Message-ID header we generated (make_msgid on the mailbox domain) —
    # reply threading matches on it.
    message_id = models.CharField(max_length=300, blank=True)
    # set by bounce processing; feeds Mailbox.bounce_rate() / auto-pause
    bounced_at = models.DateTimeField(null=True, blank=True)
    # threading for answers to a prospect's reply (core.inbox): their
    # Message-ID, and the References chain; send_draft adds both headers.
    in_reply_to = models.CharField(max_length=300, blank=True)
    references = models.TextField(blank=True)
    # follow-up sequences (core.sequences): the enrollment this email belongs
    # to and its step number (0 = the cold email, 1.. = follow-ups)
    enrollment = models.ForeignKey('core.Enrollment', null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='drafts')
    sequence_step = models.PositiveSmallIntegerField(default=0)

    class Meta(TenantOwned.Meta):
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.company} — {self.get_status_display()}'


class Mailbox(TenantOwned, Timestamped):
    """Outreach — one sending mailbox.  Cold email rotates across the active
    ones (core.outbox), each with its own daily cap, warmup ramp, DNS health
    and auto-pause.  When any Mailbox exists it is the source of truth; the
    legacy AppSettings.smtp_* fields are only the fallback for none."""

    label = models.CharField(max_length=100, blank=True)
    from_email = models.CharField(max_length=200)
    from_name = models.CharField(max_length=200, blank=True)
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_port = models.PositiveIntegerField(default=587)
    smtp_user = models.CharField(max_length=200, blank=True)
    smtp_password = models.CharField(max_length=500, blank=True)
    imap_host = models.CharField(max_length=200, blank=True)
    imap_port = models.PositiveIntegerField(null=True, blank=True)
    # optional separate IMAP login (blank = same as SMTP)
    imap_user = models.CharField(max_length=200, blank=True)
    imap_password = models.CharField(max_length=500, blank=True)
    # core.inbox polling state: UID high-water mark, last poll, last error
    imap_last_uid = models.PositiveBigIntegerField(default=0)
    imap_uidvalidity = models.CharField(max_length=40, blank=True)
    imap_checked_at = models.DateTimeField(null=True, blank=True)
    imap_error = models.CharField(max_length=300, blank=True)
    daily_cap = models.PositiveIntegerField(default=30)
    # warmup ramp: the effective cap climbs from 5 to daily_cap over 14 days
    ramp_start = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    paused_until = models.DateTimeField(null=True, blank=True)
    paused_reason = models.CharField(max_length=300, blank=True)
    # a manual resume restarts the bounce-rate window (core.outbox)
    resumed_at = models.DateTimeField(null=True, blank=True)
    # core.dns_check results: {domain, spf, dmarc, dkim, mx} (each {ok, ...})
    dns = models.JSONField(default=dict, blank=True)
    dns_checked_at = models.DateTimeField(null=True, blank=True)
    # WarmPulse (core.warmpulse) — optional warmup service status
    warmup_status = models.CharField(max_length=30, blank=True)
    health_score = models.FloatField(null=True, blank=True)
    warmpulse_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta(TenantOwned.Meta):
        ordering = ['id']
        unique_together = [('workspace', 'from_email')]

    def __str__(self):
        return self.label or self.from_email

    @property
    def domain(self):
        return (self.from_email or '').rsplit('@', 1)[-1].strip().lower()

    def configured(self):
        return bool(self.smtp_host and self.smtp_user and self.smtp_password)


class EmailTemplate(TenantOwned, Timestamped):
    """Outreach — reusable cold-email base created by the user (written
    manually or uploaded). Copywright personalizes it per lead with Gemini;
    {{placeholders}} are substituted when no AI key is set.

    At most one template is the default; the pipeline falls back to the
    newest template when no default is flagged.
    """

    name = models.CharField(max_length=200)
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)

    class Meta(TenantOwned.Meta):
        ordering = ['-is_default', '-updated_at']

    def __str__(self):
        return f'{self.name}{" (default)" if self.is_default else ""}'


class Potential(TenantOwned, Timestamped):
    """CRM — POTENTIAL: opportunities identified by the system."""

    class Stages(models.TextChoices):
        DISCOVERY = 'discovery', 'Discovery'
        QUALIFIED = 'qualified', 'Qualified'
        PROPOSAL = 'proposal', 'Proposal'
        NEGOTIATION = 'negotiation', 'Negotiation'
        WON = 'won', 'Won'
        LOST = 'lost', 'Lost'

    company = models.CharField(max_length=200)
    opportunity = models.CharField(max_length=300)
    value = models.CharField(max_length=50, blank=True)
    stage = models.CharField(max_length=20, choices=Stages.choices, default=Stages.DISCOVERY)
    owner_agent = models.CharField(max_length=50, default='Profile agent')
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name='potentials')

    class Meta(TenantOwned.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.company} — {self.opportunity}'


class Reply(TenantOwned, Timestamped):
    """CRM — REPLY: a prospect's answer to our cold email, read from the
    mailbox by core.inbox.  The Responder classifies it and may suggest an
    answer; nothing is sent until a human approves (approve → outbox)."""

    class Statuses(models.TextChoices):
        REPLIED = 'replied', 'Replied'
        AWAITING = 'awaiting', 'Awaiting'
        MEETING = 'meeting', 'Meeting booked'

    class Channels(models.TextChoices):
        EMAIL = 'email', 'Email'
        LINKEDIN = 'linkedin', 'LinkedIn'
        WEBCHAT = 'webchat', 'Webchat'

    class Classes(models.TextChoices):
        INTERESTED = 'interested', 'Interested'
        NOT_NOW = 'not_now', 'Not right now'
        NOT_INTERESTED = 'not_interested', 'Not interested'
        UNSUBSCRIBE = 'unsubscribe', 'Asked to stop'
        OUT_OF_OFFICE = 'out_of_office', 'Out of office'
        QUESTION = 'question', 'Has a question'
        OTHER = 'other', 'Other'

    company = models.CharField(max_length=200)
    contact = models.CharField(max_length=200, blank=True)
    channel = models.CharField(max_length=10, choices=Channels.choices, default=Channels.EMAIL)
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.AWAITING)
    summary = models.TextField(blank=True)
    # inbound email (core.inbox)
    draft = models.ForeignKey(EmailDraft, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='replies')
    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name='replies')
    mailbox = models.ForeignKey(Mailbox, null=True, blank=True, on_delete=models.SET_NULL,
                                related_name='replies')
    from_email = models.CharField(max_length=200, blank=True)
    subject = models.CharField(max_length=300, blank=True)
    body_text = models.TextField(blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    message_id = models.CharField(max_length=300, blank=True, db_index=True)
    references = models.TextField(blank=True)
    classification = models.CharField(max_length=20, choices=Classes.choices, blank=True)
    confidence = models.FloatField(null=True, blank=True)
    suggested_reply = models.TextField(blank=True)
    # the answer EmailDraft created when the human approved the suggestion
    answer_draft = models.ForeignKey(EmailDraft, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='answered_replies')
    handled = models.BooleanField(default=False)

    class Meta(TenantOwned.Meta):
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.company} — {self.get_status_display()}'

    @property
    def needs_attention(self):
        return (not self.handled and self.classification not in
                ('', self.Classes.OUT_OF_OFFICE, self.Classes.UNSUBSCRIBE))


class Suppression(TenantOwned, Timestamped):
    """Outreach — an address that must never be emailed again by this workspace.

    Written by the public unsubscribe endpoint (link + RFC 8058 one-click) or
    by an operator.  mailer.send_draft refuses any draft whose recipient is
    here.  Emails are stored lowercased; lookups go through is_suppressed()."""

    class Reasons(models.TextChoices):
        UNSUBSCRIBE = 'unsubscribe', 'Unsubscribed'
        BOUNCE = 'bounce', 'Bounced'
        COMPLAINT = 'complaint', 'Spam complaint'
        MANUAL = 'manual', 'Added manually'

    # one of email / phone is set: an email row blocks email, a phone row
    # (E.164, WhatsApp opt-out) blocks WhatsApp messages
    email = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    reason = models.CharField(max_length=20, choices=Reasons.choices, default=Reasons.UNSUBSCRIBE)
    source = models.CharField(max_length=200, blank=True)  # e.g. 'link', 'one-click', admin user

    class Meta(TenantOwned.Meta):
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['workspace', 'email'], condition=~models.Q(email=''),
                                    name='uniq_suppression_email'),
            models.UniqueConstraint(fields=['workspace', 'phone'], condition=~models.Q(phone=''),
                                    name='uniq_suppression_phone'),
        ]

    def __str__(self):
        return f'{self.email or self.phone} — {self.get_reason_display()}'

    @classmethod
    def is_phone_suppressed(cls, phone):
        phone = (phone or '').strip()
        return bool(phone) and cls.objects.filter(phone=phone).exists()

    @classmethod
    def add_phone(cls, phone, reason=Reasons.MANUAL, source=''):
        obj, _ = cls.objects.get_or_create(
            phone=phone.strip(), email='', defaults={'reason': reason, 'source': source[:200]})
        return obj

    @staticmethod
    def normalize(email):
        return (email or '').strip().lower()

    @classmethod
    def is_suppressed(cls, email):
        email = cls.normalize(email)
        return bool(email) and cls.objects.filter(email=email).exists()

    @classmethod
    def add(cls, email, reason=Reasons.UNSUBSCRIBE, source=''):
        """Idempotent: an existing row keeps its first reason."""
        obj, _ = cls.objects.get_or_create(
            email=cls.normalize(email), defaults={'reason': reason, 'source': source[:200]})
        return obj


class AgentConfig(TenantOwned, Timestamped):
    """AGENTS page — per-agent configuration (DB / API / prompts / model)."""

    class Agents(models.TextChoices):
        SEARCH = 'search', 'Search (Scrape)'
        PROFILE = 'profile', 'Profile'
        COPYWRIGHT = 'copywright', 'Copywright'
        RESPONDER = 'responder', 'Responder (Chatbot)'

    agent = models.CharField(max_length=20, choices=Agents.choices)
    # DB — MongoDB only (not editable from the UI)
    db_provider = models.CharField(max_length=20, default='mongodb')
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

    class Meta(TenantOwned.Meta):
        ordering = ['id']
        unique_together = [('workspace', 'agent')]

    def __str__(self):
        return self.get_agent_display()


class AppSettings(TenantOwned, Timestamped):
    """SETTINGS page — Company Profile · AI Key · Frequent Runs (one row per workspace)."""

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
    # Physical postal address printed in every cold-email footer (CAN-SPAM).
    company_address = models.CharField(max_length=300, blank=True)

    # AI Key (never returned in full by the API)
    ai_provider = models.CharField(max_length=50, default='OpenAI')
    ai_key = models.CharField(max_length=500, blank=True)

    # Apollo.io — B2B data-enrichment API: real phone numbers for leads whose
    # sites hide contact details behind bot protection / robots.txt
    apollo_api_key = models.CharField(max_length=200, blank=True)
    # Scalelist / Apify - per-tenant phone-enrichment keys (env is a fallback
    # for the default tenant only, see core.scalelist / core.apify_maps)
    scalelist_api_key = models.CharField(max_length=200, blank=True)
    apify_api_key = models.CharField(max_length=200, blank=True)

    # SMTP — outbound cold email (password never returned in full by the API)
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_port = models.PositiveIntegerField(null=True, blank=True)
    smtp_user = models.CharField(max_length=200, blank=True)
    smtp_password = models.CharField(max_length=500, blank=True)
    from_email = models.CharField(max_length=200, blank=True)

    # Outbox sending window (Asia/Kolkata hours, end exclusive) — cold email
    # only leaves inside it; weekdays_only skips Saturday + Sunday.
    send_window_start = models.PositiveSmallIntegerField(default=9)
    send_window_end = models.PositiveSmallIntegerField(default=18)
    send_weekdays_only = models.BooleanField(default=True)

    # Follow-up sequences (core.sequences): enroll a lead after its cold email
    # is sent; follow-ups wait for approval unless auto-approve is on
    followups_enabled = models.BooleanField(default=True)
    followups_auto_approve = models.BooleanField(default=False)

    # WhatsApp via the opt-in open-wa sidecar (core.whatsapp) — off by default;
    # every WhatsApp message needs a human approval, always
    whatsapp_enabled = models.BooleanField(default=False)
    whatsapp_sidecar_url = models.CharField(max_length=300, blank=True,
                                            default='http://whatsapp-sidecar:8002')
    whatsapp_secret = models.CharField(max_length=300, blank=True)
    whatsapp_daily_cap = models.PositiveSmallIntegerField(default=20)

    # WarmPulse (core.warmpulse) — optional warmup-status sync; blank key = off
    warmpulse_api_url = models.CharField(max_length=300, default='https://warmpulse.tech', blank=True)
    warmpulse_api_key = models.CharField(max_length=300, blank=True)
    warmpulse_synced_at = models.DateTimeField(null=True, blank=True)

    # Lead targeting — comma-separated country names; empty = worldwide sweep
    target_countries = models.TextField(blank=True)

    # Lead targeting — comma-separated BUYER industries; empty = the ICP engine
    # (core.icp) auto-picks businesses that buy what we sell.  Peer/agency
    # terms are always dropped so competitors can't be re-introduced here.
    target_industries = models.TextField(blank=True)

    # Lead targeting — comma-separated cities/towns/districts (e.g.
    # 'Salem, Omalur, Mettur'); empty = country-level sweep.  City targeting
    # wins over countries: discovery + Google Maps sweep each town listed.
    target_cities = models.TextField(blank=True)

    # ICP mode — who counts as a good lead.  'buyer' (default): businesses
    # that BUY our services; peer agencies are competitors and filtered out.
    # 'agency': boutique agencies / software shops ARE the target (partnership
    # outreach — agencies that might hand us project work), so the ICP engine
    # lets agency terms be searched and stops rejecting peer-shaped leads.
    icp_mode = models.CharField(
        max_length=10,
        choices=[('buyer', 'Buyers of our services'), ('agency', 'Agency partners')],
        default='buyer',
    )

    # Daily report — recipient of the 8 PM IST lead report (comma-separated allowed;
    # falls back to superuser/staff emails when blank)
    report_email = models.CharField(max_length=300, blank=True)

    # Frequent Runs
    runs_enabled = models.BooleanField(default=True)
    run_frequency = models.CharField(max_length=10, choices=Frequencies.choices, default=Frequencies.EVERY_1H)
    # Single-cycle run lock (core.runlock) — set while a cycle runs anywhere
    # (API, chat or worker); a value older than runlock.STALE_AFTER is a crash
    pipeline_running_since = models.DateTimeField(null=True, blank=True)

    # Strict fake-data gate memory — domains the AI review has rejected are
    # never re-admitted on a later cycle (AI verdicts can flip; memory can't)
    rejected_domains = models.JSONField(default=list, blank=True)

    # Ideal Client Profile — freeform notes typed or uploaded during the chat
    # onboarding ("SaaS startups in healthcare, 10-50 people, US only...").
    # Injected into the AI vetting + drafting prompts so discovery and copy
    # follow the client's actual ICP.
    icp_notes = models.TextField(blank=True)

    # Chat onboarding — first-login setup wizard state (core.onboarding):
    # {started, done, step, answers{...}, skipped[...]}; empty dict = fresh
    # install that has never run the wizard.
    onboarding = models.JSONField(default=dict, blank=True)

    # Exactly one row per workspace (OneToOne replaces the old pk=1 singleton)
    workspace = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name='+')

    @classmethod
    def load(cls):
        ws = current_workspace()
        obj, _ = cls.objects.get_or_create(workspace=ws)
        obj._absorb_env_secrets()
        return obj

    def _absorb_env_secrets(self):
        """On a VPS, secrets live in environment variables — fill only the
        empty DB fields once so the admin UI stays the source of truth."""
        # Env secrets belong to the default tenant ONLY - any other company
        # must bring its own keys, never inherit the operator's.
        ws = current_workspace()
        if ws is None or ws.slug != os.environ.get('DEFAULT_TENANT_SLUG', 'shailog'):
            return
        env_map = {
            'smtp_host': 'SMTP_HOST',
            'smtp_user': 'SMTP_USER',
            'smtp_password': 'SMTP_PASSWORD',
            'from_email': 'FROM_EMAIL',
            'report_email': 'REPORT_EMAIL',
            'ai_provider': 'AI_PROVIDER',
            'ai_key': 'AI_KEY',
            'apollo_api_key': 'APOLLO_API_KEY',
            'scalelist_api_key': 'SCALELIST_API_KEY',
            'apify_api_key': 'APIFY_API_KEY',
        }
        dirty = False
        key_absorbed = False
        for field, env_name in env_map.items():
            value = os.environ.get(env_name, '')
            if value and not getattr(self, field):
                setattr(self, field, value)
                dirty = True
                key_absorbed = key_absorbed or field == 'ai_key'
        # The key and its provider travel together: the default 'OpenAI' must
        # not mask the env's provider, or the key would be posted to the wrong host.
        if key_absorbed and os.environ.get('AI_PROVIDER'):
            self.ai_provider = os.environ['AI_PROVIDER']
        if dirty:
            self.save(update_fields=[f for f, e in env_map.items() if os.environ.get(e)])

    def __str__(self):
        return 'App settings'


class SearchProfile(TenantOwned, Timestamped):
    """SETTINGS page — saved lead-targeting presets with one-click switching.

    A profile snapshots the Lead Targeting knobs (countries, cities,
    industries) plus the ICP mode.  Activating one copies its values into the
    AppSettings singleton — the pipeline keeps reading AppSettings exactly as
    before, so a switch takes effect on the very next cycle with no restart.
    """

    name = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True)
    # same comma-separated storage convention as AppSettings
    target_countries = models.TextField(blank=True)
    target_industries = models.TextField(blank=True)
    target_cities = models.TextField(blank=True)
    icp_mode = models.CharField(
        max_length=10,
        choices=[('buyer', 'Buyers of our services'), ('agency', 'Agency partners')],
        default='buyer',
    )
    is_active = models.BooleanField(default=False)

    class Meta(TenantOwned.Meta):
        ordering = ['-is_active', 'name']
        unique_together = [('workspace', 'name')]

    def __str__(self):
        return f'{self.name}{" (active)" if self.is_active else ""}'

    def apply(self):
        """One-click switch: write this profile's targeting into AppSettings
        and mark it the only active profile."""
        settings = AppSettings.load()
        settings.target_countries = self.target_countries
        settings.target_industries = self.target_industries
        settings.target_cities = self.target_cities
        settings.icp_mode = self.icp_mode
        settings.save(update_fields=['target_countries', 'target_industries',
                                     'target_cities', 'icp_mode', 'updated_at'])
        SearchProfile.objects.exclude(pk=self.pk).update(is_active=False)
        self.is_active = True
        self.save(update_fields=['is_active', 'updated_at'])

    @classmethod
    def snapshot(cls, name, description=''):
        """Capture the AppSettings targeting as it stands right now — used to
        keep the previous job around as a switchable backup profile."""
        settings = AppSettings.load()
        profile = cls.objects.filter(name=name).first()
        if profile is None:
            profile = cls(name=name)
        profile.description = description
        profile.target_countries = settings.target_countries
        profile.target_industries = settings.target_industries
        profile.target_cities = settings.target_cities
        profile.icp_mode = settings.icp_mode or 'buyer'
        profile.save()
        return profile


class ChatMessage(TenantOwned, Timestamped):
    """CHAT — conversation with the Responder (Chatbot)."""

    class Roles(models.TextChoices):
        USER = 'user', 'User'
        AI = 'ai', 'Responder'

    user = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='chat_messages')
    role = models.CharField(max_length=10, choices=Roles.choices)
    text = models.TextField()

    class Meta(TenantOwned.Meta):
        ordering = ['created_at']

    def __str__(self):
        return f'{self.get_role_display()}: {self.text[:40]}'


class PipelineRun(TenantOwned, Timestamped):
    """LOOP — one orchestrator cycle through the agent pipeline."""

    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(auto_now=True)
    triggered_by = models.CharField(max_length=50, default='manual')
    summary = models.JSONField(default=dict)
    leads_created = models.PositiveSmallIntegerField(default=0)
    potentials_created = models.PositiveSmallIntegerField(default=0)
    replies_created = models.PositiveSmallIntegerField(default=0)

    class Meta(TenantOwned.Meta):
        ordering = ['-started_at']

    def __str__(self):
        return f'Run #{self.pk} ({self.started_at:%Y-%m-%d %H:%M})'


class Sequence(TenantOwned, Timestamped):
    """Outreach — a follow-up sequence (core.sequences).  Step 0 is always
    the cold email itself; SequenceStep rows are the follow-ups after it."""

    name = models.CharField(max_length=200)
    is_default = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    class Meta(TenantOwned.Meta):
        ordering = ['-is_default', 'id']

    def __str__(self):
        return self.name


class SequenceStep(TenantOwned, Timestamped):
    class Channels(models.TextChoices):
        EMAIL = 'email', 'Email'
        WHATSAPP = 'whatsapp', 'WhatsApp'
        LINKEDIN_TASK = 'linkedin_task', 'LinkedIn task'
        CALL_TASK = 'call_task', 'Call task'

    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name='steps')
    order = models.PositiveSmallIntegerField()  # 1, 2, … (0 is the cold email)
    channel = models.CharField(max_length=20, choices=Channels.choices, default=Channels.EMAIL)
    delay_days = models.PositiveSmallIntegerField(default=3)  # after the previous step
    business_days = models.BooleanField(default=True)
    subject = models.CharField(max_length=300, blank=True)  # blank = "Re: <cold subject>"
    body = models.TextField(blank=True)  # {{placeholder}} template (pipeline.TEMPLATE_VARS)
    personalize = models.BooleanField(default=False)  # LLM rewrite when a key is set
    enabled = models.BooleanField(default=True)

    class Meta(TenantOwned.Meta):
        ordering = ['sequence', 'order']

    def __str__(self):
        return f'{self.sequence} #{self.order} {self.channel}'


class Enrollment(TenantOwned, Timestamped):
    class Statuses(models.TextChoices):
        ACTIVE = 'active', 'Active'
        PAUSED = 'paused', 'Paused'
        COMPLETED = 'completed', 'Completed'
        STOPPED = 'stopped', 'Stopped'

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name='enrollments')
    sequence = models.ForeignKey(Sequence, on_delete=models.CASCADE, related_name='enrollments')
    current_step = models.PositiveSmallIntegerField(default=0)  # last finished step
    pending_step = models.PositiveSmallIntegerField(null=True, blank=True)  # materialized, not done
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.ACTIVE)
    stop_reason = models.CharField(max_length=200, blank=True)
    next_due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    first_draft = models.ForeignKey(EmailDraft, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='+')
    last_message_id = models.CharField(max_length=300, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    class Meta(TenantOwned.Meta):
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.lead} in {self.sequence} ({self.status})'


class OutreachTask(TenantOwned, Timestamped):
    """Assisted outreach — a person does it (LinkedIn note, call, wa.me link).
    LinkedIn is never automated."""

    class Channels(models.TextChoices):
        LINKEDIN = 'linkedin', 'LinkedIn'
        CALL = 'call', 'Call'
        WHATSAPP = 'whatsapp', 'WhatsApp link'

    class Statuses(models.TextChoices):
        OPEN = 'open', 'Open'
        DONE = 'done', 'Done'
        SKIPPED = 'skipped', 'Skipped'

    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')
    enrollment = models.ForeignKey(Enrollment, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='tasks')
    channel = models.CharField(max_length=20, choices=Channels.choices)
    message = models.TextField(blank=True)
    url = models.CharField(max_length=1000, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.OPEN)

    class Meta(TenantOwned.Meta):
        ordering = ['status', 'due_at', 'id']


class WhatsAppMessage(TenantOwned, Timestamped):
    """A WhatsApp message sent through the opt-in open-wa sidecar
    (core.whatsapp).  Always needs a human approval — never auto-approved."""

    class Statuses(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        QUEUED = 'queued', 'Queued'
        SENDING = 'sending', 'Sending'
        SENT = 'sent', 'Sent'
        REJECTED = 'rejected', 'Rejected'
        FAILED = 'failed', 'Failed'

    lead = models.ForeignKey(Lead, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name='whatsapp_messages')
    enrollment = models.ForeignKey(Enrollment, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='whatsapp_messages')
    company = models.CharField(max_length=200, blank=True)
    to_phone = models.CharField(max_length=20)  # E.164
    text = models.TextField()
    status = models.CharField(max_length=20, choices=Statuses.choices, default=Statuses.DRAFT)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    error = models.CharField(max_length=500, blank=True)

    class Meta(TenantOwned.Meta):
        ordering = ['-updated_at']
