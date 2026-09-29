from django.contrib import admin, messages

from .mailer import send_draft
from .models import (
    AgentConfig,
    AppSettings,
    ChatMessage,
    EmailDraft,
    Lead,
    PipelineRun,
    Potential,
    Reply,
    User,
)


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'is_active')
    list_filter = ('role',)


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    """Sortable lead list — click any column header to sort, filter by state/country."""

    list_display = ('company', 'industry', 'state', 'country', 'score',
                    'has_website', 'profiled', 'created_at')
    list_filter = ('country', 'state', 'industry', 'has_website', 'profiled')
    search_fields = ('company', 'industry', 'website', 'state', 'country')
    ordering = ('-score',)
    list_per_page = 50

    @admin.display(boolean=True, description='Website')
    def has_website(self, obj):
        return obj.has_website


@admin.register(Potential)
class PotentialAdmin(admin.ModelAdmin):
    list_display = ('company', 'opportunity', 'value', 'stage', 'owner_agent')
    list_filter = ('stage',)


@admin.register(EmailDraft)
class EmailDraftAdmin(admin.ModelAdmin):
    """Outreach drafts — the human approve step also works here, in bulk."""

    list_display = ('company', 'to_email', 'subject', 'status', 'sent_via', 'sent_at')
    list_filter = ('status', 'sent_via')
    search_fields = ('company', 'to_email', 'subject')
    ordering = ('-updated_at',)
    actions = ('approve_and_send', 'reject_drafts')

    @admin.action(description='✅ Approve & send selected drafts')
    def approve_and_send(self, request, queryset):
        sent = failed = skipped = 0
        for draft in queryset:
            if draft.status in (EmailDraft.Statuses.SENT, EmailDraft.Statuses.REJECTED):
                skipped += 1
                continue
            send_draft(draft)  # updates status/sent_via/error itself
            draft.refresh_from_db()
            if draft.status == EmailDraft.Statuses.SENT:
                sent += 1
            else:
                failed += 1
        msg = f'{sent} sent, {failed} failed' + (f', {skipped} skipped (already sent/rejected)' if skipped else '')
        level = messages.SUCCESS if failed == 0 else messages.WARNING
        self.message_user(request, f'Approve & send: {msg}.', level=level)

    @admin.action(description='❌ Reject selected drafts')
    def reject_drafts(self, request, queryset):
        updated = queryset.exclude(status=EmailDraft.Statuses.SENT).update(
            status=EmailDraft.Statuses.REJECTED)
        self.message_user(request, f'{updated} draft(s) rejected.')


@admin.register(Reply)
class ReplyAdmin(admin.ModelAdmin):
    list_display = ('company', 'contact', 'channel', 'status', 'updated_at')
    list_filter = ('status', 'channel')


@admin.register(AgentConfig)
class AgentConfigAdmin(admin.ModelAdmin):
    list_display = ('agent', 'db_provider', 'model', 'updated_at')


@admin.register(AppSettings)
class AppSettingsAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'ai_provider', 'runs_enabled', 'run_frequency', 'report_email')
    fieldsets = (
        ('Company Profile', {'fields': ('company_name', 'company_website', 'company_description', 'services')}),
        ('AI Key', {'fields': ('ai_provider', 'ai_key')}),
        ('SMTP — outbound email', {'fields': ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'from_email')}),
        ('Daily report — 8 PM IST', {'fields': ('report_email',),
         'description': 'Recipient of the daily lead report (comma-separated allowed). '
                        'Blank → superuser/staff emails. Delivered via SMTP when configured, '
                        'otherwise printed to the server console.'}),
        ('Frequent Runs', {'fields': ('runs_enabled', 'run_frequency')}),
    )

    # Singleton — exactly one settings row exists (created by seed/migrations).
    # Adding or deleting rows breaks AppSettings.load(); the 500 you saw earlier
    # came from "Add App settings". Both are disabled here.
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('role', 'user', 'text', 'created_at')


@admin.register(PipelineRun)
class PipelineRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'started_at', 'triggered_by', 'leads_created', 'potentials_created', 'replies_created')
