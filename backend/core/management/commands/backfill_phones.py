"""Backfill missing lead phone numbers from Google Maps (free scraper).

Every profiled lead whose phone is still empty gets one Maps lookup,
highest potential score first.  Safe to re-run — already-filled phones are
never touched, and the module cache makes repeat runs cheap.

    python manage.py backfill_phones                # top 100 by score
    python manage.py backfill_phones --limit 500    # more
    python manage.py backfill_phones --delay 3.0    # extra politeness
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from core.gmaps import enrich_leads_via_gmaps, gmaps_available
from core.models import Lead


class Command(BaseCommand):
    help = 'Backfill missing lead phone numbers from Google Maps listings'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=100,
                            help='max leads to try (highest score first)')
        parser.add_argument('--delay', type=float, default=2.0,
                            help='politeness delay between Maps queries (s)')

    def handle(self, *args, **options):
        if not gmaps_available():
            self.stderr.write('Google Maps scraper disabled (GMAPS_SCRAPER=0)')
            return
        missing = (Lead.objects.filter(profiled=True, contact_phone='')
                   .order_by('-score'))
        total_missing = missing.count()
        batch = list(missing[:options['limit']])
        self.stdout.write(
            f'[backfill] {total_missing} lead(s) missing a phone — '
            f'trying the top {len(batch)} by score')
        filled = enrich_leads_via_gmaps(batch, delay=options['delay'])
        for lead in filled:
            self.stdout.write(f'  + {lead.company[:50]:50} {lead.contact_phone}')
        self.stdout.write(
            f'[backfill] filled {len(filled)}/{len(batch)}; '
            f'{total_missing - len(filled)} still missing overall '
            f'({timezone.now():%H:%M} UTC)')
