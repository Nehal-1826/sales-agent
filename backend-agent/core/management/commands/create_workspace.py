"""Operator command: create a tenant (company) and its owner login.

Sign-up is closed, so this is the only way a new company is onboarded. The
owner password is never echoed back."""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core import identity
from core.models import User, Workspace
from core.tenancy import workspace_context
from core.workspaces import provision_workspace


class Command(BaseCommand):
    help = 'Create a workspace and its owner user (+ default agents and an empty AppSettings row).'

    def add_arguments(self, parser):
        parser.add_argument('--name', required=True)
        parser.add_argument('--slug', required=True)
        parser.add_argument('--owner-username', required=True)
        parser.add_argument('--owner-password', required=True)
        parser.add_argument('--owner-email', default='')

    def handle(self, *args, **opts):
        slug = opts['slug'].strip().lower()
        name = opts['name'].strip()
        owner = opts['owner_username'].strip()
        email = identity.normalize_email(opts['owner_email'])
        if Workspace.all_tenants.filter(slug=slug).exists():
            raise CommandError(f'Workspace with slug "{slug}" already exists.')
        # one company, one name; one person, one address (core.identity)
        if identity.company_name_is_taken(name):
            raise CommandError(f'a company named "{name}" already exists. {identity.TAKEN_COMPANY}')
        if identity.username_is_taken(owner):
            raise CommandError(f'User "{owner}" already exists.')
        if email and identity.email_is_taken(email):
            raise CommandError(f'that email address already belongs to an account. {identity.TAKEN_EMAIL}')
        with transaction.atomic():
            ws = Workspace.all_tenants.create(name=name, slug=slug)
            with workspace_context(ws):
                User.objects.create_user(
                    username=owner,
                    email=email,
                    password=opts['owner_password'],
                    role=User.Roles.OWNER,
                )
            # fresh tenants start with empty keys; env secrets only seed the default tenant
            provision_workspace(ws)
            from billing.services import ensure_manual_subscription
            ensure_manual_subscription(ws)  # operator-created: manual Enterprise, never paywalled
        self.stdout.write(self.style.SUCCESS(
            f'Created workspace "{ws.name}" ({ws.slug}) with owner "{owner}".'))
