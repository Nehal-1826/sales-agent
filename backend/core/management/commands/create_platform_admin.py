"""Create a platform operator (is_staff, no workspace).  Password comes from a
getpass prompt or an env var named by --password-env; it is never printed."""

import getpass
import os

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError

from core.models import User


class Command(BaseCommand):
    help = 'Create a platform admin (staff, no workspace). Enrol TOTP at first console login.'

    def add_arguments(self, parser):
        parser.add_argument('--username')
        parser.add_argument('--email')
        parser.add_argument('--password-env', metavar='VAR', help='read the password from this env var')

    def handle(self, *a, **o):
        username = (o['username'] or input('Username: ')).strip()
        email = (o['email'] or input('Email: ')).strip().lower()
        if not username or not email:
            raise CommandError('username and email are required')
        if User.objects.filter(username__iexact=username).exists():
            raise CommandError('that username already exists')
        if o['password_env']:
            pw = os.environ.get(o['password_env'], '')
            if not pw:
                raise CommandError(f'env var {o["password_env"]} is empty or unset')
        else:
            pw = getpass.getpass('Password: ')
            if pw != getpass.getpass('Password (again): '):
                raise CommandError('passwords do not match')
        user = User(username=username, email=email, is_staff=True, is_active=True, workspace=None)
        try:
            validate_password(pw, user)
        except ValidationError as e:
            raise CommandError('; '.join(e.messages))
        user.set_password(pw)
        user.save()
        self.stdout.write(f'Created platform admin {username}. Set up 2FA at first console login.')
