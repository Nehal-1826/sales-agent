"""
Apollo.io organization enrichment — the fallback contact-data source.

Site scraping is honest but blind where it is unwelcome: bot challenges,
robots.txt, and contact-form-only sites yield no phone number.  Apollo's
company database fills that gap with verified firmographics (phone,
employee count) keyed by domain.

    apollo_available()     → is an API key configured?
    apollo_enrich_domain() → one domain → {phone, apollo_name, employees}

Everything degrades to {} when the key is missing, the quota is gone, or
Apollo doesn't know the company — the pipeline just keeps what it scraped.
"""

import logging

import requests

from .models import AppSettings

log = logging.getLogger(__name__)

APOLLO_ENRICH_URL = 'https://api.apollo.io/api/v1/organizations/enrich'


def apollo_available():
    return bool(AppSettings.load().apollo_api_key)


def apollo_enrich_domain(domain):
    """Enrich one company domain.  Returns {} when unavailable/unknown."""
    key = AppSettings.load().apollo_api_key
    if not key or not domain:
        return {}
    try:
        resp = requests.post(
            APOLLO_ENRICH_URL,
            headers={'X-Api-Key': key, 'Content-Type': 'application/json'},
            json={'domain': domain},
            timeout=15,
        )
        if resp.status_code != 200:
            log.warning('Apollo enrich failed for %s: HTTP %s', domain, resp.status_code)
            return {}
        org = resp.json().get('organization') or {}
        return {
            'phone': (org.get('phone') or '').strip(),
            'apollo_name': (org.get('name') or '').strip(),
            'employees': org.get('estimated_num_employees'),
        }
    except Exception as exc:  # network hiccup — enrichment must never kill a cycle
        log.warning('Apollo enrich failed for %s: %s', domain, exc)
        return {}
