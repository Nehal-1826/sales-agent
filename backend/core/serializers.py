"""Serializers — JSON shapes match the frontend types exactly."""

from django.utils import timezone
from rest_framework import serializers

from .models import AgentConfig, AppSettings, ChatMessage, EmailDraft, EmailTemplate, Lead, PipelineRun, Potential, Reply, SearchProfile


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

    class Meta:
        model = EmailDraft
        fields = ['id', 'company', 'toEmail', 'subject', 'body', 'findings',
                  'status', 'sentVia', 'error', 'lastActivity', 'leadId', 'sentAt']
        read_only_fields = ['error']

    def get_status(self, obj):
        return obj.get_status_display()

    def get_lastActivity(self, obj):
        return rel_time(obj.updated_at)


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

    class Meta:
        model = Reply
        fields = ['id', 'company', 'contact', 'channel', 'status', 'summary', 'lastActivity']

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

    class Meta:
        model = AppSettings
        fields = ['company', 'aiKey', 'smtp', 'runs', 'report', 'targeting']

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
            },
            'aiKey': {
                'provider': instance.ai_provider,
                # never echo the full key back; empty means "unchanged" on write
                'apiKey': '••••' + instance.ai_key[-4:] if instance.ai_key else '',
                'apolloApiKey': '••••' + instance.apollo_api_key[-4:] if instance.apollo_api_key else '',
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
        }

    def update(self, instance, validated):
        company = validated.get('company') or {}
        ai_key = validated.get('aiKey') or {}
        smtp = validated.get('smtp') or {}
        runs = validated.get('runs') or {}
        instance.company_name = company.get('name', instance.company_name)
        instance.company_website = company.get('website', instance.company_website)
        instance.company_description = company.get('description', instance.company_description)
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
        # never write pipeline_running_since from this (stale) copy — a bare
        # save() would clobber a live run lock held by a cycle (core.runlock)
        instance.save(update_fields=[
            f.name for f in AppSettings._meta.concrete_fields
            if f.name not in ('id', 'pipeline_running_since')])
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
