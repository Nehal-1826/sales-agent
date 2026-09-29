"""Serializers — JSON shapes match the frontend types exactly."""

from django.utils import timezone
from rest_framework import serializers

from .models import AgentConfig, AppSettings, ChatMessage, EmailDraft, Lead, PipelineRun, Potential, Reply


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
    hasWebsite = serializers.BooleanField(source='has_website')
    contactEmail = serializers.CharField(source='contact_email', required=False, allow_blank=True)

    class Meta:
        model = Lead
        fields = ['id', 'company', 'industry', 'website', 'score', 'source', 'profiled',
                  'state', 'country', 'hasWebsite', 'contactEmail', 'findings', 'discovered']

    def get_discovered(self, obj):
        return rel_time(obj.created_at)


class EmailDraftSerializer(serializers.ModelSerializer):
    toEmail = serializers.CharField(source='to_email', required=False, allow_blank=True)
    sentVia = serializers.CharField(source='sent_via', read_only=True)
    lastActivity = serializers.SerializerMethodField()

    class Meta:
        model = EmailDraft
        fields = ['id', 'company', 'toEmail', 'subject', 'body', 'findings',
                  'status', 'sentVia', 'error', 'lastActivity']
        read_only_fields = ['status', 'error']

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
            'db': {'provider': instance.db_provider, 'name': instance.db_name, 'connection': instance.db_connection},
            'api': {'url': instance.api_url, 'auth': instance.api_auth},
            'systemPrompt': instance.system_prompt,
            'negativePrompt': instance.negative_prompt,
            'model': instance.model,
        }

    def update(self, instance, validated):
        db = validated.get('db') or {}
        api = validated.get('api') or {}
        instance.db_provider = db.get('provider', instance.db_provider)
        instance.db_name = db.get('name', instance.db_name)
        instance.db_connection = db.get('connection', instance.db_connection)
        instance.api_url = api.get('url', instance.api_url)
        instance.api_auth = api.get('auth', instance.api_auth)
        instance.system_prompt = validated.get('systemPrompt', instance.system_prompt)
        instance.negative_prompt = validated.get('negativePrompt', instance.negative_prompt)
        instance.model = validated.get('model', instance.model)
        instance.save()
        return instance


class SettingsSerializer(serializers.ModelSerializer):
    """{ company: {...}, aiKey: {provider, apiKey}, smtp: {...}, runs: {...} } — secrets masked on read."""

    company = serializers.DictField(required=False)
    aiKey = serializers.DictField(required=False)
    smtp = serializers.DictField(required=False)
    runs = serializers.DictField(required=False)
    report = serializers.DictField(required=False)

    class Meta:
        model = AppSettings
        fields = ['company', 'aiKey', 'smtp', 'runs', 'report']

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
        instance.save()
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
