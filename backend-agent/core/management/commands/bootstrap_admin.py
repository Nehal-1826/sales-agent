"""First-boot account for production installs.

Ensures the default workspace exists (DEFAULT_TENANT_SLUG / DEFAULT_TENANT_NAME)
and creates its owner from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD
(or generates a strong one-time password and prints it to the logs). No demo
data is seeded — use `manage.py seed_demo` for the demo experience instead.
Idempotent: skips when the default workspace already has a user.
"""

import os
import secrets
import string

from django.core.management.base import BaseCommand
from rest_framework.authtoken.models import Token

from core.models import User, Workspace
from core.tenancy import workspace_context
from core.workspaces import provision_workspace


class Command(BaseCommand):
    help = 'Create the default workspace owner from ADMIN_* env vars (no-op when it has users).'

    def handle(self, *args, **options):
        slug = os.environ.get('DEFAULT_TENANT_SLUG', '').strip() or 'shailog'
        name = os.environ.get('DEFAULT_TENANT_NAME', '').strip() or 'Shailog Technologies'
        ws, _ = Workspace.all_tenants.get_or_create(slug=slug, defaults={'name': name})
        provision_workspace(ws)
        from billing.services import ensure_manual_subscription
        ensure_manual_subscription(ws)  # operator-created: manual Enterprise, never paywalled

        with workspace_context(ws):
            # scoped to the default workspace: other tenants' users must not
            # stop the operator's own owner from being created
            if User.objects.filter(workspace=ws).exists():
                self.stdout.write('[bootstrap_admin] users already exist — nothing to do.')
                return

            username = os.environ.get('ADMIN_USERNAME', '').strip() or 'admin'
            email = os.environ.get('ADMIN_EMAIL', '').strip()
            password = os.environ.get('ADMIN_PASSWORD', '').strip()
            generated = False
            if not password:
                alphabet = string.ascii_letters + string.digits
                password = ''.join(secrets.choice(alphabet) for _ in range(16))
                generated = True

            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
                role=User.Roles.OWNER,
            )
            token = Token.objects.create(user=user)

        self.stdout.write(self.style.SUCCESS(
            f'[bootstrap_admin] workspace owner created: {username}'
            + (f' <{email}>' if email else '')))
        if generated:
            # printed once in the container log — change it after first login
            self.stdout.write(self.style.WARNING(
                f'[bootstrap_admin] generated password: {password}'))
        self.stdout.write(f'[bootstrap_admin] API token: {token.key}')
