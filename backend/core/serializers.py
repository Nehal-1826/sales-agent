"""Serializers — JSON shapes match the frontend types exactly."""

from django.utils import timezone
from rest_framework import serializers

from .models import (Enrollment, OutreachTask, Sequence, SequenceStep, WhatsAppMessage,
                     AgentConfig, AppSettings, ChatMessage, EmailDraft, EmailTemplate, Lead, Mailbox,
                     PipelineRun, Potential, Reply, SearchProfile)


def rel_time(dt):
    """Small relative-time helper ('2 hours ago')."""
    if not dt:
        return ''
    seconds = int((timezone.now() - dt).total_seconds())
    if seconds < 60:
        return 'just now'
    minutes = seconds // 60
    if minutes < 60:
        return f'{minutes} min ago'
    hours = minutes // 60
    if hours < 24:
        return f'{hours} hour{"s" if hours != 1 else ""} ago'
    days = hours // 24
    return f'{days} day{"s" if days != 1 else ""} ago'


class LeadSerializer(serializers.ModelSerializer):
    discovered = serializers.SerializerMethodField()
    discoveredAt = serializers.DateTimeField(source='created_at', read_only=True)
    hasWebsite = serializers.BooleanField(source='has_website')
    contactEmail = serializers.CharField(source='contact_email', required=False, allow_blank=True)
    contactPhone = serializers.CharField(source='contact_phone', required=False, allow_blank=True)

    class Meta:
        model = Lead
        fields = ['id', 'company', 'industry', 'website', 'score', 'source', 'profiled',
                  'state', 'country', 'hasWebsite', 'contactEmail', 'contactPhone', 'findings',
                  'description', 'discovered', 'discoveredAt']

    def get_discovered(self, obj):
        return rel_time(obj.created_at)


class EmailTemplateSerializer(serializers.ModelSerializer):
    """{ id, name, subject, body, isDefault } — cold-email templates (Settings)."""
    isDefault = serializers.BooleanField(source='is_default', required=False)

    class Meta:
        model = EmailTemplate
        fields = ['id', 'name', 'subject', 'body', 'isDefault']


class EmailDraftSerializer(serializers.ModelSerializer):
    toEmail = serializers.CharField(source='to_email', required=False, allow_blank=True)
    sentVia = serializers.CharField(source='sent_via', read_only=True)
    status = serializers.SerializerMethodField()  # display form ('Draft') — matches the frontend type
    lastActivity = serializers.SerializerMethodField()
    leadId = serializers.IntegerField(source='lead_id', read_only=True)
    sentAt = serializers.DateTimeField(source='sent_at', read_only=True)
    # outbox: when a Queued draft is due, and the mailbox it goes out from
    scheduledFor = serializers.DateTimeField(source='scheduled_for', read_only=True)
    mailbox = serializers.SerializerMethodField()
    # 'cold' | 'followup' | 'answer' — Approvals shows follow-ups with their step
    kind = serializers.SerializerMethodField()
    sequenceStep = serializers.IntegerField(source='sequence_step', read_only=True)

    class Meta:
        model = EmailDraft
        fields = ['id', 'company', 'toEmail', 'subject', 'body', 'findings',
                  'status', 'sentVia', 'error', 'lastActivity', 'leadId', 'sentAt',
                  'scheduledFor', 'mailbox', 'kind', 'sequenceStep']
        read_only_fields = ['error']

    def get_status(self, obj):
        return obj.get_status_display()

    def get_lastActivity(self, obj):
        return rel_time(obj.updated_at)

    def get_mailbox(self, obj):
        return obj.mailbox.from_email if obj.mailbox_id and obj.mailbox else ''

    def get_kind(self, obj):
        if obj.sequence_step:
            return 'followup'
        return 'answer' if (obj.in_reply_to or '').strip() else 'cold'


class PotentialSerializer(serializers.ModelSerializer):
    stage = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()

    class Meta:
        model = Potential
        fields = ['id', 'company', 'opportunity', 'value', 'stage', 'owner']

    def get_stage(self, obj):
        return obj.get_stage_display()

    def get_owner(self, obj):
        return obj.owner_agent


class ReplySerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    channel = serializers.SerializerMethodField()
    lastActivity = serializers.SerializerMethodField()

    fromEmail = serializers.CharField(source='from_email', read_only=True)
    bodyText = serializers.CharField(source='body_text', read_only=True)
    receivedAt = serializers.DateTimeField(source='received_at', read_only=True)
    classification = serializers.CharField(read_only=True)
    classificationLabel = serializers.SerializerMethodField()
    confidence = serializers.FloatField(read_only=True)
    suggestedReply = serializers.CharField(source='suggested_reply', read_only=True)
    handled = serializers.BooleanField(read_only=True)
    needsAttention = serializers.SerializerMethodField()
    draftId = serializers.IntegerField(source='draft_id', read_only=True)
    leadId = serializers.IntegerField(source='lead_id', read_only=True)
    originalSubject = serializers.SerializerMethodField()
    answer = serializers.SerializerMethodField()

    class Meta:
        model = Reply
        fields = ['id', 'company', 'contact', 'channel', 'status', 'summary', 'lastActivity',
                  'fromEmail', 'subject', 'bodyText', 'receivedAt', 'classification',
                  'classificationLabel', 'confidence', 'suggestedReply', 'handled',
                  'needsAttention', 'draftId', 'leadId', 'originalSubject', 'answer']
        read_only_fields = ['subject']

    def get_classificationLabel(self, obj):
        return obj.get_classification_display() if obj.classification else ''

    def get_needsAttention(self, obj):
        return obj.needs_attention

    def get_originalSubject(self, obj):
        return obj.draft.subject if obj.draft_id and obj.draft else ''

    def get_answer(self, obj):
        """The approved answer's outbox state (None until approved)."""
        d = obj.answer_draft if obj.answer_draft_id else None
        if d is None:
            return None
        return {'id': d.id, 'status': d.get_status_display(), 'scheduledFor': d.scheduled_for,
                'sentAt': d.sent_at, 'sentVia': d.sent_via, 'error': d.error}

    def get_status(self, obj):
        return obj.get_status_display()

    def get_channel(self, obj):
        return {'email': 'Email', 'linkedin': 'LinkedIn', 'webchat': 'Webchat'}.get(obj.channel, obj.channel)

    def get_lastActivity(self, obj):
        return rel_time(obj.updated_at)


class AgentMetaSerializer(serializers.Serializer):
    """Dashboard pipeline card — name/role from AgentConfig choices + live stats."""

    key = serializers.CharField()
    name = serializers.CharField()
    shortName = serializers.CharField()
    role = serializers.CharField()
    status = serializers.CharField()
    lastAction = serializers.CharField()


MASK = '••••'


def _mask(secret):
    return MASK + secret[-4:] if secret else ''


class AgentConfigSerializer(serializers.ModelSerializer):
    """{ db: {provider, name, connection}, api: {url, auth}, systemPrompt, negativePrompt, model }"""

    db = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)
    api = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False)
    systemPrompt = serializers.CharField(required=False, allow_blank=True)
    negativePrompt = serializers.CharField(required=False, allow_blank=True)
    model = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = AgentConfig
        fields = ['agent', 'db', 'api', 'systemPrompt', 'negativePrompt', 'model']
        read_only_fields = ['agent']

    def to_representation(self, instance):
        return {
            'agent': instance.agent,
            'db': {'provider': instance.db_provider, 'name': instance.db_name,
                   'connection': _mask(instance.db_connection)},
            'api': {'url': instance.api_url, 'auth': _mask(instance.api_auth)},
            'systemPrompt': instance.system_prompt,
            'negativePrompt': instance.negative_prompt,
            'model': instance.model,
        }

    def update(self, instance, validated):
        db = validated.get('db') or {}
        api = validated.get('api') or {}
        instance.db_provider = 'mongodb'  # the only provider — not configurable
        instance.db_name = db.get('name', instance.db_name)
        connection = db.get('connection', instance.db_connection)
        if not connection.startswith(MASK):  # a masked echo must not overwrite the real secret
            instance.db_connection = connection
        instance.api_url = api.get('url', instance.api_url)
        auth = api.get('auth', instance.api_auth)
        if not auth.startswith(MASK):
            instance.api_auth = auth
        instance.system_prompt = validated.get('systemPrompt', instance.system_prompt)
        instance.negative_prompt = validated.get('negativePrompt', instance.negative_prompt)
        instance.model = validated.get('model', instance.model)
        instance.save()
        return instance


class SearchProfileSerializer(serializers.ModelSerializer):
    """{ id, name, description, countries[], industries[], cities[], icpMode,
    isActive, updatedAt } — saved lead-targeting presets (Settings page).

    Lists go in as JSON arrays and are stored comma-joined (the AppSettings
    convention).  Activating happens through the dedicated endpoint
    (profile.apply() also rewrites AppSettings), not through PUT/PATCH here."""

    countries = serializers.ListField(child=serializers.CharField(allow_blank=True),
                                      required=False, source='target_countries', write_only=True)
    industries = serializers.ListField(child=serializers.CharField(allow_blank=True),
                                       required=False, source='target_industries', write_only=True)
    cities = serializers.ListField(child=serializers.CharField(allow_blank=True),
                                   required=False, source='target_cities', write_only=True)
    icpMode = serializers.CharField(source='icp_mode', required=False)
    isActive = serializers.BooleanField(source='is_active', read_only=True)

    class Meta:
        model = SearchProfile
        fields = ['id', 'name', 'description', 'countries', 'industries',
                  'cities', 'icpMode', 'isActive']

    def validate_icpMode(self, value):
        if value not in ('buyer', 'agency'):
            raise serializers.ValidationError('icpMode must be "buyer" or "agency"')
        return value

    def to_representation(self, instance):
        split = lambda raw: [v.strip() for v in (raw or '').split(',') if v.strip()]
        return {
            'id': instance.id,
            'name': instance.name,
            'description': instance.description,
            'countries': split(instance.target_countries),
            'industries': split(instance.target_industries),
            'cities': split(instance.target_cities),
            'icpMode': instance.icp_mode,
            'isActive': instance.is_active,
        }

    def create(self, validated):
        # ListFields hand us lists (source='target_*'); store comma-joined
        join = lambda v: ', '.join(v) if isinstance(v, (list, tuple)) else (v or '')
        validated['target_countries'] = join(validated.get('target_countries'))
        validated['target_industries'] = join(validated.get('target_industries'))
        validated['target_cities'] = join(validated.get('target_cities'))
        validated['icp_mode'] = validated.get('icp_mode') or 'buyer'
        return SearchProfile.objects.create(**validated)


class SettingsSerializer(serializers.ModelSerializer):
    """{ company: {...}, aiKey: {provider, apiKey}, smtp: {...}, runs: {...} } — secrets masked on read."""

    company = serializers.DictField(required=False)
    aiKey = serializers.DictField(required=False)
    smtp = serializers.DictField(required=False)
    runs = serializers.DictField(required=False)
    report = serializers.DictField(required=False)
    targeting = serializers.DictField(required=False)
    outbox = serializers.DictField(required=False)
    warmpulse = serializers.DictField(required=False)
    followups = serializers.DictField(required=False)
    whatsapp = serializers.DictField(required=False)

    class Meta:
        model = AppSettings
        fields = ['company', 'aiKey', 'smtp', 'runs', 'report', 'targeting', 'outbox', 'warmpulse',
                  'followups', 'whatsapp']

    def validate_outbox(self, value):
        value = value or {}
        start = value.get('windowStart')
        end = value.get('windowEnd')
        try:
            start = None if start in (None, '') else int(start)
            end = None if end in (None, '') else int(end)
        except (TypeError, ValueError):
            raise serializers.ValidationError('Sending hours must be whole hours (0–24).')
        if (start is not None and not 0 <= start <= 23) or (end is not None and not 1 <= end <= 24):
            raise serializers.ValidationError('Sending hours must be between 0 and 24.')
        if start is not None and end is not None and end <= start:
            raise serializers.ValidationError('The sending window must end after it starts.')
        return value

    def validate_aiKey(self, value):
        # An unknown provider makes llm_available() false, which silently puts the
        # pipeline's AI relevance gate into keyless mode — reject it loudly instead.
        from .ai import PROVIDER_BASE_URLS, resolve_provider
        provider = (value or {}).get('provider')
        if provider and str(provider).strip() and resolve_provider(str(provider)) is None:
            supported = ', '.join(sorted(PROVIDER_BASE_URLS))
            raise serializers.ValidationError(
                f'Unsupported AI provider "{provider}". Supported providers: {supported}.')
        return value

    def to_representation(self, instance):
        return {
            'company': {
                'name': instance.company_name,
                'website': instance.company_website,
                'description': instance.company_description,
                'services': instance.services or [],
                'address': instance.company_address,
            },
            'aiKey': {
                'provider': instance.ai_provider,
                # never echo the full key back; empty means "unchanged" on write
                'apiKey': '••••' + instance.ai_key[-4:] if instance.ai_key else '',
                'apolloApiKey': '••••' + instance.apollo_api_key[-4:] if instance.apollo_api_key else '',
                'scalelistApiKey': '••••' + instance.scalelist_api_key[-4:] if instance.scalelist_api_key else '',
                'apifyApiKey': '••••' + instance.apify_api_key[-4:] if instance.apify_api_key else '',
            },
            'smtp': {
                'host': instance.smtp_host,
                'port': instance.smtp_port or '',
                'user': instance.smtp_user,
                # never echo the full password back; empty means "unchanged" on write
                'password': '••••' + instance.smtp_password[-4:] if instance.smtp_password else '',
                'from': instance.from_email,
            },
            'runs': {'enabled': instance.runs_enabled, 'frequency': instance.run_frequency},
            'report': {'email': instance.report_email},
            'targeting': {
                'countries': [c.strip() for c in instance.target_countries.split(',') if c.strip()],
                'industries': [i.strip() for i in instance.target_industries.split(',') if i.strip()],
                'cities': [c.strip() for c in instance.target_cities.split(',') if c.strip()],
                'icpMode': instance.icp_mode or 'buyer',
            },
            'outbox': {
                'windowStart': instance.send_window_start,
                'windowEnd': instance.send_window_end,
                'weekdaysOnly': instance.send_weekdays_only,
            },
            'warmpulse': {
                'apiUrl': instance.warmpulse_api_url,
                'apiKey': _mask(instance.warmpulse_api_key),
                'syncedAt': instance.warmpulse_synced_at,
            },
            'followups': {
                'enabled': instance.followups_enabled,
                'autoApprove': instance.followups_auto_approve,
            },
            'whatsapp': {
                'enabled': instance.whatsapp_enabled,
                'sidecarUrl': instance.whatsapp_sidecar_url,
                'secret': _mask(instance.whatsapp_secret),
                'dailyCap': instance.whatsapp_daily_cap,
            },
        }

    def update(self, instance, validated):
        company = validated.get('company') or {}
        ai_key = validated.get('aiKey') or {}
        smtp = validated.get('smtp') or {}
        runs = validated.get('runs') or {}
        instance.company_name = company.get('name', instance.company_name)
        instance.company_website = company.get('website', instance.company_website)
        instance.company_description = company.get('description', instance.company_description)
        instance.company_address = str(company.get('address', instance.company_address) or '')[:300]
        if 'services' in company:
            instance.services = company.get('services') or []
        instance.ai_provider = ai_key.get('provider', instance.ai_provider)
        incoming_key = ai_key.get('apiKey')
        # ignore masked / empty values so we never overwrite the stored key
        if incoming_key and not incoming_key.startswith('••••'):
            instance.ai_key = incoming_key
        incoming_apollo = ai_key.get('apolloApiKey')
        if incoming_apollo and not incoming_apollo.startswith('••••'):
            instance.apollo_api_key = incoming_apollo
        for field, key in (('scalelist_api_key', 'scalelistApiKey'), ('apify_api_key', 'apifyApiKey')):
            incoming = ai_key.get(key)
            if incoming and not incoming.startswith('••••'):
                setattr(instance, field, incoming)
        instance.smtp_host = smtp.get('host', instance.smtp_host)
        if smtp.get('port') not in (None, ''):
            instance.smtp_port = int(smtp['port'] or 0) or None
        instance.smtp_user = smtp.get('user', instance.smtp_user)
        incoming_password = smtp.get('password')
        if incoming_password and not incoming_password.startswith('••••'):
            instance.smtp_password = incoming_password
        instance.from_email = smtp.get('from', instance.from_email)
        instance.runs_enabled = bool(runs.get('enabled', instance.runs_enabled))
        instance.run_frequency = runs.get('frequency', instance.run_frequency)
        report = validated.get('report') or {}
        instance.report_email = report.get('email', instance.report_email)
        targeting = validated.get('targeting') or {}
        if 'countries' in targeting:
            # store as comma-separated; unknown countries are dropped by the scraper
            instance.target_countries = ', '.join(
                str(c).strip() for c in (targeting.get('countries') or []) if str(c).strip())
        if 'industries' in targeting:
            # buyer industries to search; empty = ICP auto-targeting (core.icp).
            # Peer/agency terms are dropped at read time by the ICP engine.
            instance.target_industries = ', '.join(
                str(i).strip() for i in (targeting.get('industries') or []) if str(i).strip())
        if 'cities' in targeting:
            # cities/towns/districts to sweep (e.g. Salem, Omalur); empty =
            # country-level sweep.  Cities win over countries in discovery.
            instance.target_cities = ', '.join(
                str(c).strip() for c in (targeting.get('cities') or []) if str(c).strip())
        icp_mode = targeting.get('icpMode')
        if icp_mode in ('buyer', 'agency'):
            # 'agency' = agencies/software shops are the leads (partnership
            # outreach); 'buyer' = businesses that buy our services
            instance.icp_mode = icp_mode
        outbox = validated.get('outbox') or {}
        if outbox.get('windowStart') not in (None, ''):
            instance.send_window_start = int(outbox['windowStart'])
        if outbox.get('windowEnd') not in (None, ''):
            instance.send_window_end = int(outbox['windowEnd'])
        if 'weekdaysOnly' in outbox:
            instance.send_weekdays_only = bool(outbox['weekdaysOnly'])
        if instance.send_window_end <= instance.send_window_start:
            raise serializers.ValidationError({'outbox': 'The sending window must end after it starts.'})
        wp = validated.get('warmpulse') or {}
        if 'apiUrl' in wp:
            instance.warmpulse_api_url = str(wp.get('apiUrl') or '').strip()[:300] or 'https://warmpulse.tech'
        incoming_wp = wp.get('apiKey')
        if incoming_wp is not None and not str(incoming_wp).startswith(MASK):
            # unlike the other keys, an explicit empty string turns WarmPulse off
            instance.warmpulse_api_key = str(incoming_wp).strip()[:300]
        fu = validated.get('followups') or {}
        if 'enabled' in fu:
            instance.followups_enabled = bool(fu['enabled'])
        if 'autoApprove' in fu:  # email follow-ups only — WhatsApp always needs approval
            instance.followups_auto_approve = bool(fu['autoApprove'])
        wa = validated.get('whatsapp') or {}
        if 'enabled' in wa:
            instance.whatsapp_enabled = bool(wa['enabled'])
        if 'sidecarUrl' in wa:
            instance.whatsapp_sidecar_url = str(wa.get('sidecarUrl') or '').strip()[:300]
        incoming_wa = wa.get('secret')
        if incoming_wa and not str(incoming_wa).startswith(MASK):
            instance.whatsapp_secret = str(incoming_wa).strip()[:300]
        if wa.get('dailyCap') not in (None, ''):
            try:
                instance.whatsapp_daily_cap = max(0, min(int(wa['dailyCap']), 200))
            except (TypeError, ValueError):
                raise serializers.ValidationError({'whatsapp': 'Daily limit must be a whole number.'})
        # never write pipeline_running_since from this (stale) copy — a bare
        # save() would clobber a live run lock held by a cycle (core.runlock)
        instance.save(update_fields=[
            f.name for f in AppSettings._meta.concrete_fields
            if f.name not in ('id', 'pipeline_running_since', 'warmpulse_synced_at')])
        return instance


class ChatMessageSerializer(serializers.ModelSerializer):
    from_ = serializers.CharField(source='role')

    class Meta:
        model = ChatMessage
        fields = ['id', 'from_', 'text']
        extra_kwargs = {'from_': {'source': 'role'}}

    def to_representation(self, instance):
        return {
            'id': instance.id,
            'from': instance.role,
            'text': instance.text,
            'time': rel_time(instance.created_at),
        }


class PipelineRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineRun
        fields = ['id', 'started_at', 'finished_at', 'triggered_by', 'summary',
                  'leads_created', 'potentials_created', 'replies_created']


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    # operators (superusers) have no workspace; name/slug only — never the id
    workspace = serializers.SerializerMethodField()

    def get_workspace(self, user):
        ws = user.workspace
        return {'name': ws.name, 'slug': ws.slug} if ws else None


class MailboxSerializer(serializers.ModelSerializer):
    """Sending mailbox (Settings → Mailboxes). The SMTP password is masked
    on read exactly like AppSettings.smtp_password; a masked or empty value
    sent back never overwrites the stored one."""

    fromEmail = serializers.EmailField(source='from_email')
    fromName = serializers.CharField(source='from_name', required=False, allow_blank=True)
    smtpHost = serializers.CharField(source='smtp_host', required=False, allow_blank=True)
    smtpPort = serializers.IntegerField(source='smtp_port', required=False, min_value=1, max_value=65535)
    smtpUser = serializers.CharField(source='smtp_user', required=False, allow_blank=True)
    smtpPassword = serializers.CharField(source='smtp_password', required=False, allow_blank=True,
                                         write_only=True)
    imapHost = serializers.CharField(source='imap_host', required=False, allow_blank=True)
    imapPort = serializers.IntegerField(source='imap_port', required=False, allow_null=True,
                                        min_value=1, max_value=65535)
    imapUser = serializers.CharField(source='imap_user', required=False, allow_blank=True)
    imapPassword = serializers.CharField(source='imap_password', required=False, allow_blank=True,
                                         write_only=True)
    dailyCap = serializers.IntegerField(source='daily_cap', required=False, min_value=1, max_value=500)
    rampStart = serializers.DateField(source='ramp_start', required=False, allow_null=True)
    isActive = serializers.BooleanField(source='is_active', required=False)

    class Meta:
        model = Mailbox
        fields = ['id', 'label', 'fromEmail', 'fromName', 'smtpHost', 'smtpPort', 'smtpUser',
                  'smtpPassword', 'imapHost', 'imapPort', 'imapUser', 'imapPassword', 'dailyCap', 'rampStart', 'isActive']

    def validate_fromEmail(self, value):
        value = value.strip().lower()
        qs = Mailbox.objects.filter(from_email__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('That mailbox is already added.')
        return value

    def to_representation(self, instance):
        from . import outbox
        from .warmpulse import still_warming
        now = timezone.now()
        today = outbox.local(now).date()
        return {
            'id': instance.id,
            'label': instance.label,
            'fromEmail': instance.from_email,
            'fromName': instance.from_name,
            'smtpHost': instance.smtp_host,
            'smtpPort': instance.smtp_port,
            'smtpUser': instance.smtp_user,
            'smtpPassword': _mask(instance.smtp_password),
            'imapHost': instance.imap_host,
            'imapPort': instance.imap_port,
            'imapUser': instance.imap_user,
            'imapPassword': _mask(instance.imap_password),
            'imapCheckedAt': instance.imap_checked_at,
            'imapError': instance.imap_error,
            'dailyCap': instance.daily_cap,
            'rampStart': instance.ramp_start.isoformat() if instance.ramp_start else None,
            'isActive': instance.is_active,
            'configured': instance.configured(),
            'paused': outbox.is_paused(instance, now),
            'pausedUntil': instance.paused_until,
            'pausedReason': instance.paused_reason if outbox.is_paused(instance, now) else '',
            'effectiveCap': outbox.effective_cap(instance, today),
            'sentToday': outbox.sent_on(instance, today),
            'queued': EmailDraft.objects.filter(mailbox=instance,
                                                status=EmailDraft.Statuses.QUEUED).count(),
            'dns': instance.dns or {},
            'dnsCheckedAt': instance.dns_checked_at,
            'warmupStatus': instance.warmup_status,
            'healthScore': instance.health_score,
            'warmpulseSyncedAt': instance.warmpulse_synced_at,
            'stillWarming': still_warming(instance),
        }

    def _apply_password(self, validated, instance=None):
        password = validated.pop('smtp_password', None)
        if password and not password.startswith(MASK):
            validated['smtp_password'] = password
        imap_password = validated.pop('imap_password', None)
        if imap_password and not imap_password.startswith(MASK):
            validated['imap_password'] = imap_password
        return validated

    def create(self, validated):
        validated = self._apply_password(validated)
        if not validated.get('label'):
            validated['label'] = validated['from_email']
        if 'ramp_start' not in validated:  # a new mailbox warms up by default
            validated['ramp_start'] = timezone.localdate()
        return Mailbox.objects.create(**validated)

    def update(self, instance, validated):
        validated = self._apply_password(validated, instance)
        for field, value in validated.items():
            setattr(instance, field, value)
        instance.save()
        return instance


# ------------------------------------------------------------------
# Follow-up sequences, assisted tasks, WhatsApp (core.sequences / core.whatsapp)
# ------------------------------------------------------------------

class SequenceStepSerializer(serializers.ModelSerializer):
    delayDays = serializers.IntegerField(source='delay_days', min_value=0, max_value=60)
    businessDays = serializers.BooleanField(source='business_days', required=False)

    class Meta:
        model = SequenceStep
        fields = ['id', 'order', 'channel', 'delayDays', 'businessDays', 'subject', 'body',
                  'personalize', 'enabled']


class SequenceSerializer(serializers.ModelSerializer):
    isDefault = serializers.BooleanField(source='is_default', read_only=True)
    steps = SequenceStepSerializer(many=True, required=False)

    class Meta:
        model = Sequence
        fields = ['id', 'name', 'isDefault', 'active', 'steps']

    def update(self, instance, validated):
        steps = validated.pop('steps', None)
        instance.name = validated.get('name', instance.name)
        instance.active = validated.get('active', instance.active)
        instance.save(update_fields=['name', 'active', 'updated_at'])
        if steps is not None:  # replace the step list (order 1..n as sent)
            instance.steps.all().delete()
            for i, st in enumerate(steps, start=1):
                st['order'] = i
                if st.get('channel') == 'linkedin_task':
                    st['body'] = (st.get('body') or '')[:300]
                instance.steps.create(**st)
        return instance


class EnrollmentSerializer(serializers.ModelSerializer):
    leadId = serializers.IntegerField(source='lead_id', read_only=True)
    company = serializers.CharField(source='lead.company', read_only=True)
    sequence = serializers.CharField(source='sequence.name', read_only=True)
    currentStep = serializers.IntegerField(source='current_step', read_only=True)
    pendingStep = serializers.IntegerField(source='pending_step', read_only=True)
    totalSteps = serializers.SerializerMethodField()
    stopReason = serializers.CharField(source='stop_reason', read_only=True)
    nextDueAt = serializers.DateTimeField(source='next_due_at', read_only=True)
    startedAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Enrollment
        fields = ['id', 'leadId', 'company', 'sequence', 'status', 'currentStep', 'pendingStep',
                  'totalSteps', 'stopReason', 'nextDueAt', 'startedAt']

    def get_totalSteps(self, obj):
        return obj.sequence.steps.filter(enabled=True).count()


class OutreachTaskSerializer(serializers.ModelSerializer):
    leadId = serializers.IntegerField(source='lead_id', read_only=True)
    company = serializers.SerializerMethodField()
    dueAt = serializers.DateTimeField(source='due_at', read_only=True)

    class Meta:
        model = OutreachTask
        fields = ['id', 'leadId', 'company', 'channel', 'message', 'url', 'phone', 'dueAt', 'status']

    def get_company(self, obj):
        return obj.lead.company if obj.lead_id and obj.lead else ''


class WhatsAppMessageSerializer(serializers.ModelSerializer):
    leadId = serializers.IntegerField(source='lead_id', read_only=True)
    toPhone = serializers.CharField(source='to_phone', read_only=True)
    scheduledFor = serializers.DateTimeField(source='scheduled_for', read_only=True)
    sentAt = serializers.DateTimeField(source='sent_at', read_only=True)
    waMeLink = serializers.SerializerMethodField()

    class Meta:
        model = WhatsAppMessage
        fields = ['id', 'leadId', 'company', 'toPhone', 'text', 'status', 'scheduledFor', 'sentAt',
                  'error', 'waMeLink']

    def get_waMeLink(self, obj):
        from .whatsapp import wa_me_link
        return wa_me_link(obj.to_phone, obj.text)
