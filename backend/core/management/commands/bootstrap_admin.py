"""First-boot account for production installs.

Creates the workspace owner from ADMIN_USERNAME / ADMIN_EMAIL / ADMIN_PASSWORD
(or generates a strong one-time password and prints it to the logs). No demo
data is seeded — use `manage.py seed_demo` for the demo experience instead.
Idempotent: skips when any user already exists.
"""

import os
import secrets
import string

from django.core.management.base import BaseCommand
from rest_framework.authtoken.models import Token

from core.models import User


class Command(BaseCommand):
    help = 'Create the workspace owner from ADMIN_* env vars (no-op when users exist).'

    def handle(self, *args, **options):
        if User.objects.exists():
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
