"""Remove for good what was deleted 30 days ago or earlier.

    python manage.py purge_deleted [--days 30] [--dry-run]

A deleted account can be brought back for `--days` days; after that it goes,
and with it the workspace it stopped (once nobody in it can be brought
back). The agent worker runs this once a day. Nothing here calls a payment
gateway. The rules live in core.accounts."""

from django.core.management.base import BaseCommand

from core import accounts


class Command(BaseCommand):
    help = 'Remove for good the accounts deleted 30 days ago or earlier, and the workspaces they stopped.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=accounts.KEEP_DAYS,
                            help='How long a deleted account can be brought back (default: 30).')
        parser.add_argument('--dry-run', action='store_true',
                            help='Say what would go without touching anything.')

    def handle(self, *args, **options):
        dry = options['dry_run']
        out = accounts.purge_deleted(days=options['days'], dry_run=dry)
        verb = 'Would remove' if dry else 'Removed'
        for ws in out['workspaces']:
            self.stdout.write(f"{verb} for good: the workspace {ws['slug']} with {len(ws['users'])} account(s)")
        for email in out['users']:
            self.stdout.write(f'{verb} for good: the account {email}')
        n = len(out['workspaces']) + len(out['users'])
        if dry:
            summary = f'Would remove {n} item(s) for good.'
        elif n == 0 and not out['kept']:
            summary = 'Nothing to remove.'
        else:
            summary = f'{n} item(s) removed for good.'
        if out['kept']:
            summary += f" {len(out['kept'])} kept for the next day (the warmup service could not be reached)."
        self.stdout.write(self.style.SUCCESS(summary))
        # nothing is returned on purpose: Django prints whatever handle() returns
