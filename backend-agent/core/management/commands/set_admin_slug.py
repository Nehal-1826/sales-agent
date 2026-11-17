"""Set or regenerate the 6-digit admin console secret slug."""
import random

from django.core.management.base import BaseCommand

from core.models import AppSettings


class Command(BaseCommand):
    help = 'Set the 6-digit admin slug (random if no argument).'

    def add_arguments(self, parser):
        parser.add_argument('slug', nargs='?', type=str, help='6-digit slug (random if omitted)')

    def handle(self, *args, **options):
        # AppSettings is tenant-scoped; use the base manager to reach it
        s = AppSettings.all_tenants.first()
        if s is None:
            self.stderr.write('No AppSettings row found. Run seed_demo first.')
            return
        slug = options.get('slug') or f'{random.randint(100000, 999999)}'
        if not slug.isdigit() or len(slug) != 6:
            self.stderr.write(f'Slug must be exactly 6 digits (got "{slug}").')
            return
        s.admin_slug = slug
        s.save(update_fields=['admin_slug'])
        self.stdout.write(self.style.SUCCESS(
            f'Admin slug set: {slug}\nAdmin console URL: /{slug}  (auto-navigates to #/platform)'
        ))
