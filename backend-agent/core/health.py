"""Heartbeat helpers — background processes stamp; the API reads staleness."""

from .models import HealthBeat


def beat(name):
    """Record a liveness stamp (upsert, cheap). Never raises."""
    try:
        HealthBeat.objects.update_or_create(name=name, defaults={})
        # update_or_create with no extra fields still bumps updated_at via auto_now
    except Exception:
        pass


def status_of(name, max_age_seconds):
    """{'running': bool, 'lastSeen': iso} for one heartbeat name."""
    from django.utils import timezone
    from datetime import timedelta

    try:
        b = HealthBeat.objects.filter(name=name).first()
    except Exception:
        b = None
    if not b:
        return {'running': False, 'lastSeen': None}
    age = (timezone.now() - b.updated_at).total_seconds()
    return {'running': age <= max_age_seconds, 'lastSeen': b.updated_at.isoformat()}
