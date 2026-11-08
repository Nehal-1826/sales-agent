"""Operator command: create a tenant (company) and its owner login.

Sign-up is closed, so this is the only way a new company is onboarded. The
owner password is never echoed back."""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

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
        if Workspace.all_tenants.filter(slug=slug).exists():
            raise CommandError(f'Workspace with slug "{slug}" already exists.')
        if User.objects.filter(username=opts['owner_username']).exists():
            raise CommandError(f'User "{opts["owner_username"]}" already exists.')
        with transaction.atomic():
            ws = Workspace.all_tenants.create(name=opts['name'].strip(), slug=slug)
            with workspace_context(ws):
                User.objects.create_user(
                    username=opts['owner_username'],
                    email=opts['owner_email'],
                    password=opts['owner_password'],
                    role=User.Roles.OWNER,
                )
            # fresh tenants start with empty keys; env secrets only seed the default tenant
            provision_workspace(ws)
            from billing.services import ensure_manual_subscription
            ensure_manual_subscription(ws)  # operator-created: manual Enterprise, never paywalled
        self.stdout.write(self.style.SUCCESS(
            f'Created workspace "{ws.name}" ({ws.slug}) with owner "{opts["owner_username"]}".'))
