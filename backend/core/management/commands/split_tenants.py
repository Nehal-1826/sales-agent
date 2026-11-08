"""Operator command: split one shared database into per-company workspaces.

    python manage.py split_tenants --map tenant_map.json            # dry run
    python manage.py split_tenants --map tenant_map.json --apply    # one transaction

The map (written by the operator from a snapshot) assigns lead / draft /
potential / chat / run ids and users to tenant slugs. Rows missing from the
map (created after the snapshot) fall back: draft/potential follow their
lead, lead/run/chat compare their timestamp to `flip`, chat prefers its
user's workspace. Re-running is a no-op because only rows whose workspace
differs from the target are touched."""

import json
import os
from datetime import datetime, timezone as dt_timezone

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import F

from core.models import (
    AppSettings, ChatMessage, EmailDraft, Lead, PipelineRun, Potential, User, Workspace,
)
from core.workspaces import provision_workspace

LATE_SLUG = 'supporticon'  # rows on/after `flip` belong to the second company
TABLES = (
    ('leads', Lead), ('emaildrafts', EmailDraft), ('potentials', Potential),
    ('chatmessages', ChatMessage), ('pipelineruns', PipelineRun),
)
# Company-profile fields only. Secrets (ai_key, smtp_*, apollo/scalelist/apify
# keys, report_email) are deliberately absent: each tenant brings its own.
PROFILE_FIELDS = (
    'company_name', 'company_website', 'company_description', 'services', 'icp_notes',
    'target_countries', 'target_industries', 'target_cities', 'icp_mode',
)


def _parse_flip(text):
    flip = datetime.fromisoformat(str(text).strip().replace('Z', '+00:00'))
    if flip.tzinfo is None:
        flip = flip.replace(tzinfo=dt_timezone.utc)
    return flip


def build_plan(tmap, default_slug):
    """{table: {pk: target_slug}} + {user_pk: slug} + conflicts, read-only."""
    flip = _parse_flip(tmap['flip'])
    slug_of = dict(Workspace.all_tenants.values_list('id', 'slug'))
    by_time = lambda ts: default_slug if ts < flip else LATE_SLUG  # noqa: E731
    conflicts = []

    users = {}
    for uid, slug in tmap.get('user_workspace', {}).items():
        users[int(uid)] = slug
    user_slug = {u.pk: users.get(u.pk, slug_of.get(u.workspace_id))
                 for u in User.objects.all()}

    leads = {}
    for lead in Lead.all_tenants.all():
        leads[lead.pk] = tmap.get('leads', {}).get(str(lead.pk)) or by_time(lead.created_at)

    plan = {'leads': leads}
    for table, model in TABLES[1:3]:  # drafts, potentials: parent lead wins
        out = {}
        for row in model.all_tenants.all():
            mapped = tmap.get(table, {}).get(str(row.pk))
            if row.lead_id is not None and row.lead_id in leads:
                target = leads[row.lead_id]
                if mapped and mapped != target:
                    conflicts.append(f'{table} #{row.pk} mapped to {mapped} but its lead '
                                     f'#{row.lead_id} goes to {target}')
            else:
                target = mapped or by_time(row.created_at)
            out[row.pk] = target
        plan[table] = out

    chats = {}
    for msg in ChatMessage.all_tenants.all():
        target = (tmap.get('chatmessages', {}).get(str(msg.pk))
                  or user_slug.get(msg.user_id) or by_time(msg.created_at))
        chats[msg.pk] = target
    plan['chatmessages'] = chats

    runs = {}
    for run in PipelineRun.all_tenants.all():
        runs[run.pk] = tmap.get('pipelineruns', {}).get(str(run.pk)) or by_time(run.started_at)
    plan['pipelineruns'] = runs
    return plan, users, conflicts, slug_of


class Command(BaseCommand):
    help = 'Split a shared database into workspaces from a tenant map (dry run unless --apply).'

    def add_arguments(self, parser):
        parser.add_argument('--map', required=True, help='tenant_map.json path')
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--names', nargs='*', default=[], metavar='slug=Display Name',
                            help='display-name overrides for created workspaces')
        parser.add_argument('--restore-default-profile', action='store_true')
        parser.add_argument('--default-name', default='')
        parser.add_argument('--default-website', default='')
        parser.add_argument('--blank-default-secrets', action='store_true',
                            help='clear API keys/SMTP/report_email on the default tenant (the shared row '
                                 'may hold another company\'s credentials)')

    def handle(self, *args, **opts):
        try:
            with open(opts['map'], encoding='utf-8') as fh:
                tmap = json.load(fh)
            _parse_flip(tmap['flip'])
        except (OSError, ValueError, KeyError) as exc:
            raise CommandError(f'Bad tenant map: {exc}')
        if opts['restore_default_profile'] and not (opts['default_name'] and opts['default_website']):
            raise CommandError('--restore-default-profile needs --default-name and --default-website.')
        self.names = dict(n.split('=', 1) for n in opts['names'] if '=' in n)
        self.default_slug = os.environ.get('DEFAULT_TENANT_SLUG', '').strip() or 'shailog'
        plan, users, conflicts, slug_of = build_plan(tmap, self.default_slug)
        if conflicts:
            for line in conflicts:
                self.stderr.write(f'CONFLICT: {line}')
            raise CommandError('Inconsistent map: children disagree with their lead. Nothing changed.')
        slugs = {self.default_slug} | set(users.values())
        for table_plan in plan.values():
            slugs |= set(table_plan.values())
        unmapped = [u.username for u in User.objects.filter(is_superuser=False)
                    if u.pk not in users]
        if unmapped and opts['apply']:
            raise CommandError('Users missing from user_workspace (they would stay in the default '
                               f'tenant and see its data): {", ".join(unmapped)}. Nothing changed.')
        for name in unmapped:
            self.stdout.write(self.style.WARNING(f'user {name} is not in user_workspace'))
        self.stdout.write(self.style.WARNING(
            'NOT moved (no tenant evidence): Reply, EmailTemplate, SearchProfile, AgentConfig stay '
            'with the default tenant - review them by hand.'))
        moves = self._moves(plan, slug_of)
        user_moves = self._user_moves(users, slug_of)
        self._report(moves, user_moves, slugs, slug_of, applied=False)
        if not opts['apply']:
            self.stdout.write(self.style.WARNING('DRY RUN - nothing changed. Re-run with --apply.'))
            return
        with transaction.atomic():
            self._apply(plan, users, slugs, opts)
            self._verify()
        self.stdout.write(self.style.SUCCESS('Applied.'))

    def _moves(self, plan, slug_of):
        """{table: {target_slug: [pk, ...]}} only for rows whose workspace differs."""
        out = {}
        for table, model in TABLES:
            current = dict(model.all_tenants.values_list('pk', 'workspace_id'))
            per = {}
            for pk, target in plan[table].items():
                if slug_of.get(current[pk]) != target:
                    per.setdefault(target, []).append(pk)
            out[table] = per
        return out

    def _user_moves(self, users, slug_of):
        moved = []
        for user in User.objects.filter(pk__in=users):
            if slug_of.get(user.workspace_id) != users[user.pk]:
                moved.append((user, users[user.pk]))
        return moved

    def _report(self, moves, user_moves, slugs, slug_of, applied):
        missing = sorted(s for s in slugs if s not in slug_of.values())
        for s in missing:
            self.stdout.write(f'would create workspace "{s}" ({self.names.get(s, s.title())})')
        for table, per in moves.items():
            for slug, pks in sorted(per.items()):
                self.stdout.write(f'{table:14} -> {slug:15} {len(pks)} row(s) to move')
        for user, slug in user_moves:
            self.stdout.write(f'user #{user.pk} {user.username} -> {slug}')

    def _apply(self, plan, users, slugs, opts):
        ws_by_slug = {}
        for slug in sorted(slugs):
            ws, created = Workspace.all_tenants.get_or_create(
                slug=slug, defaults={'name': self.names.get(slug, slug.title())})
            if created:
                self.stdout.write(f'created workspace "{slug}"')
            provision_workspace(ws)  # idempotent: agents + neutral settings
            from billing.services import ensure_manual_subscription
            ensure_manual_subscription(ws)  # operator-created: manual Enterprise, never paywalled
            ws_by_slug[slug] = ws
        slug_of = {w.pk: s for s, w in ws_by_slug.items()}
        slug_of.update(dict(Workspace.all_tenants.values_list('id', 'slug')))
        for table, model in TABLES:
            current = dict(model.all_tenants.values_list('pk', 'workspace_id'))
            by_target = {}
            for pk, target in plan[table].items():
                if slug_of.get(current[pk]) != target:
                    by_target.setdefault(target, []).append(pk)
            for target, pks in by_target.items():
                for i in range(0, len(pks), 500):
                    # queryset.update bypasses TenantOwned.save, which would
                    # refuse a cross-workspace write
                    model.all_tenants.filter(pk__in=pks[i:i + 500]).update(
                        workspace=ws_by_slug[target])
        # pending_action and the rest of the user row stay untouched
        for uid, slug in users.items():
            # tenant users never keep admin-site access
            User.objects.filter(pk=uid).update(workspace=ws_by_slug[slug], is_staff=False,
                                               is_superuser=False)
        self._fill_profiles(plan, users, ws_by_slug, opts)

    def _fill_profiles(self, plan, users, ws_by_slug, opts):
        default_ws = ws_by_slug[self.default_slug]
        source = AppSettings.all_tenants.filter(workspace=default_ws).first()
        has_data = set(users.values())
        for table_plan in plan.values():
            has_data |= set(table_plan.values())
        has_data.discard(self.default_slug)
        for slug in sorted(has_data):
            row = AppSettings.all_tenants.filter(workspace=ws_by_slug[slug]).first()
            if source is None or row is None or row.company_name:
                continue  # never overwrite a profile the tenant already has
            # queryset.update touches only the profile columns and works with
            # or without an ambient workspace
            AppSettings.all_tenants.filter(pk=row.pk).update(
                **{f: getattr(source, f) for f in PROFILE_FIELDS})
            row.refresh_from_db()
            self.stdout.write(f'profile copied to "{slug}" (company profile only, no secrets) '
                              f'- review it: {row.company_name!r}')
        if source is not None:
            secrets = ('ai_key', 'smtp_host', 'smtp_user', 'smtp_password', 'apollo_api_key',
                       'scalelist_api_key', 'apify_api_key', 'report_email')
            held = [f for f in secrets if getattr(source, f)]
            if held and opts['blank_default_secrets']:
                AppSettings.all_tenants.filter(pk=source.pk).update(
                    **{f: ('' if f != 'smtp_host' else '') for f in held}, smtp_port=None)
                self.stdout.write(f'default tenant secrets cleared: {", ".join(held)}')
            elif held:
                self.stdout.write(self.style.WARNING(
                    f'default tenant holds secrets ({", ".join(held)}) that may belong to another '
                    'company; re-run with --blank-default-secrets if so.'))
        if opts['restore_default_profile'] and source is not None:
            # the row currently holds the OTHER company's profile; reset all
            # profile fields so none of it stays on the default tenant
            blanks = {f: ('' if f != 'services' else []) for f in PROFILE_FIELDS}
            blanks['icp_mode'] = 'buyer'
            blanks['company_name'] = opts['default_name']
            blanks['company_website'] = opts['default_website']
            AppSettings.all_tenants.filter(pk=source.pk).update(**blanks)
            self.stdout.write('default profile restored (name + website only); fill the rest in Settings.')
        elif source is not None:
            self.stdout.write(self.style.WARNING(
                f'default tenant profile is "{source.company_name}" - needs review.'))

    def _verify(self):
        self.stdout.write('--- verification ---')
        for ws in Workspace.all_tenants.order_by('id'):
            parts = [f'{t}={m.all_tenants.filter(workspace=ws).count()}' for t, m in TABLES]
            parts.append(f'users={User.objects.filter(workspace=ws).count()}')
            self.stdout.write(f'{ws.slug:15} ' + ' '.join(parts))
        bad = 0
        for model in (EmailDraft, Potential):
            bad += (model.all_tenants.filter(lead__isnull=False)
                    .exclude(lead__workspace_id=F('workspace_id')).count())
        if bad:
            raise CommandError(f'{bad} draft/potential row(s) point at a lead in another '
                               'workspace. Rolled back.')
        self.stdout.write('FK check: no draft/potential points at another workspace\'s lead.')
