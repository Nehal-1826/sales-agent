from django import forms
from django.contrib import admin, messages

from .mailer import NO_RECIPIENT_ERROR, claim_draft_for_send, send_draft, valid_recipient
from .tenancy import TenantOwned, workspace_context
from .models import (
    AgentConfig,
    AppSettings,
    ChatMessage,
    EmailDraft,
    EmailTemplate,
    Lead,
    PipelineRun,
    Potential,
    Reply,
    SearchProfile,
    User,
    Workspace,
)


# Cross-tenant views and plaintext secrets: platform operators only. A
# tenant user (even is_staff) must never reach /admin/.
admin.site.has_permission = lambda request: bool(
    request.user.is_active and request.user.is_superuser and request.user.workspace_id is None)


class TenantAdmin(admin.ModelAdmin):
    """Admin is the platform operator's view: it must see every tenant, so it
    uses the explicit unscoped manager (the default one raises without a
    workspace context)."""

    def get_queryset(self, request):
        qs = self.model.all_tenants.all()
        ordering = self.get_ordering(request)
        return qs.order_by(*ordering) if ordering else qs

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        # FK pickers would use the scoped default manager, which raises with no
        # workspace context; the operator picks from the explicit unscoped one.
        target = db_field.related_model
        if issubclass(target, TenantOwned):
            # ForeignKey.formfield() evaluates _default_manager eagerly even when
            # a queryset is passed, so the field is built here instead.
            return forms.ModelChoiceField(
                queryset=target.all_tenants.all(), required=not db_field.blank,
                label=db_field.verbose_name.capitalize(), help_text=db_field.help_text)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'slug')


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'workspace', 'role', 'is_active')
    list_filter = ('workspace', 'role')


@admin.register(Lead)
class LeadAdmin(TenantAdmin):
    """Sortable lead list — click any column header to sort, filter by state/country."""

    list_display = ('workspace', 'company', 'industry', 'state', 'country', 'score',
                    'has_website', 'profiled', 'created_at')
    list_filter = ('workspace', 'country', 'state', 'industry', 'has_website', 'profiled')
    search_fields = ('company', 'industry', 'website', 'state', 'country')
    ordering = ('-score',)
    list_per_page = 50

    @admin.display(boolean=True, description='Website')
    def has_website(self, obj):
        return obj.has_website


@admin.register(Potential)
class PotentialAdmin(TenantAdmin):
    list_display = ('workspace', 'company', 'opportunity', 'value', 'stage', 'owner_agent')
    list_filter = ('workspace', 'stage')


@admin.register(EmailDraft)
class EmailDraftAdmin(TenantAdmin):
    """Outreach drafts — the human approve step also works here, in bulk."""

    list_display = ('workspace', 'company', 'to_email', 'subject', 'status', 'sent_via', 'sent_at')
    list_filter = ('workspace', 'status', 'sent_via')
    search_fields = ('company', 'to_email', 'subject')
    ordering = ('-updated_at',)
    actions = ('approve_and_send', 'reject_drafts')

    @admin.action(description='✅ Approve & send selected drafts')
    def approve_and_send(self, request, queryset):
        # same guards as the API: only DRAFT/FAILED, a real recipient, and the
        # atomic claim — so an admin click can never double-send or guess an address
        sent = failed = skipped = 0
        for draft in queryset:
            if draft.status not in (EmailDraft.Statuses.DRAFT, EmailDraft.Statuses.FAILED):
                skipped += 1
                continue
            if not valid_recipient(draft.to_email):
                self.message_user(request, f'{draft.company}: {NO_RECIPIENT_ERROR}',
                                  level=messages.WARNING)
                failed += 1
                continue
            # the claim, the sender and AppSettings.load() are all tenant-scoped:
            # run each draft inside its own company's context
            with workspace_context(draft.workspace):
                claimed = claim_draft_for_send(draft.id)
                if claimed is None:  # another request already took it
                    skipped += 1
                    continue
                send_draft(claimed)  # updates status/sent_via/error itself
                claimed.refresh_from_db()
            if claimed.status == EmailDraft.Statuses.SENT:
                sent += 1
            else:
                failed += 1
        msg = f'{sent} sent, {failed} failed' + (
            f', {skipped} skipped (not sendable: already sent, approved or rejected)' if skipped else '')
        level = messages.SUCCESS if failed == 0 else messages.WARNING
        self.message_user(request, f'Approve & send: {msg}.', level=level)

    @admin.action(description='❌ Reject selected drafts')
    def reject_drafts(self, request, queryset):
        updated = queryset.exclude(status=EmailDraft.Statuses.SENT).update(
            status=EmailDraft.Statuses.REJECTED)
        self.message_user(request, f'{updated} draft(s) rejected.')


@admin.register(Reply)
class ReplyAdmin(TenantAdmin):
    list_display = ('workspace', 'company', 'contact', 'channel', 'status', 'updated_at')
    list_filter = ('workspace', 'status', 'channel')


@admin.register(AgentConfig)
class AgentConfigAdmin(TenantAdmin):
    list_display = ('workspace', 'agent', 'db_provider', 'model', 'updated_at')
    list_filter = ('workspace',)


@admin.register(AppSettings)
class AppSettingsAdmin(TenantAdmin):
    list_display = ('workspace', 'company_name', 'ai_provider', 'runs_enabled', 'run_frequency', 'report_email')
    list_filter = ('workspace',)
    fieldsets = (
        ('Workspace', {'fields': ('workspace',)}),
        ('Company Profile', {'fields': ('company_name', 'company_website', 'company_description', 'services')}),
        ('AI Key', {'fields': ('ai_provider', 'ai_key')}),
        ('Data-enrichment keys', {'fields': ('apollo_api_key', 'scalelist_api_key', 'apify_api_key')}),
        ('SMTP — outbound email', {'fields': ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'from_email')}),
        ('Daily report — 8 PM IST', {'fields': ('report_email',),
         'description': 'Recipient of the daily lead report (comma-separated allowed). '
                        'Blank → superuser/staff emails. Delivered via SMTP when configured, '
                        'otherwise printed to the server console.'}),
        ('Frequent Runs', {'fields': ('runs_enabled', 'run_frequency')}),
    )

    # One row per workspace (created by create_workspace / AppSettings.load()).
    # Adding or deleting rows breaks AppSettings.load(); the 500 you saw earlier
    # came from "Add App settings". Both are disabled here.
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(ChatMessage)
class ChatMessageAdmin(TenantAdmin):
    list_display = ('workspace', 'role', 'user', 'text', 'created_at')
    list_filter = ('workspace', 'role')


@admin.register(PipelineRun)
class PipelineRunAdmin(TenantAdmin):
    list_display = ('workspace', 'id', 'started_at', 'triggered_by', 'leads_created', 'potentials_created', 'replies_created')
    list_filter = ('workspace',)


@admin.register(EmailTemplate)
class EmailTemplateAdmin(TenantAdmin):
    list_display = ('workspace', 'name', 'subject', 'is_default', 'updated_at')
    list_filter = ('workspace', 'is_default')


@admin.register(SearchProfile)
class SearchProfileAdmin(TenantAdmin):
    list_display = ('workspace', 'name', 'icp_mode', 'is_active', 'updated_at')
    list_filter = ('workspace', 'is_active', 'icp_mode')
