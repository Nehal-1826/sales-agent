"""
Apify Google Maps phone enrichment — the location-aware fallback source.

Scalelist and Apollo are person/company databases; Google Maps knows the
business on the ground, which makes it the strongest source for local
businesses — especially in India, where Maps coverage of small agencies is
excellent.  This module drives the `compass/google-maps-extractor` actor:

    search «company name in region»  →  places with {title, phone, website, …}
    match a place to a lead by WEBSITE DOMAIN (never by result order)
    attach the phone to THAT lead row only

Behaviour contract (mirrors scalelist.py):
  • reads APIFY_API_KEY from the environment — never hardcoded, never logged
  • only ever fills an EMPTY phone (scraped numbers are never overwritten)
  • actor failure / timeout / empty results → no changes, pipeline continues
"""

import logging
import os
import re
import time
from urllib.parse import urlparse

import requests

log = logging.getLogger(__name__)

ACTOR_RUNS_URL = 'https://api.apify.com/v2/acts/compass~google-maps-extractor/runs'
RUN_STATUS_URL = 'https://api.apify.com/v2/actor-runs/{run_id}?token={token}'
DATASET_URL = 'https://api.apify.com/v2/datasets/{dataset_id}/items?token={token}&clean=true'
RUN_WAIT_S = 480       # actor runs for 6+ searches can take several minutes
RUN_POLL_EVERY_S = 6


def apify_available():
    return bool(os.environ.get('APIFY_API_KEY'))


def _norm_domain(url):
    """'https://www.acme.com/contact' → 'acme.com' for reliable matching."""
    raw = (url or '').strip()
    if not raw:
        return ''
    if '://' not in raw:
        raw = 'https://' + raw
    host = urlparse(raw).netloc.lower()
    return host.removeprefix('www.')


def _search_string_for(lead):
    """'«company» in «state, country»' — Maps needs the place words spelled out
    to beat proxy geo-localization (a bare 'in Chennai' once returned NY shops)."""
    region = ', '.join(p for p in (lead.state, lead.country) if p) or lead.country or 'India'
    return f"{lead.company} in {region}"


def maps_places(searches, max_per_search=4):
    """One batched actor run for many search strings (async start → poll →
    fetch dataset).  Returns [{title, phone, website, city, state, address,
    countryCode}] — [] when the key is missing, the run fails, or nothing
    comes back."""
    key = os.environ.get('APIFY_API_KEY', '')
    if not key or not searches:
        return []
    try:
        started = requests.post(
            ACTOR_RUNS_URL,
            params={'token': key},
            json={
                'searchStringsArray': list(searches),
                'maxCrawls': max_per_search,
                'language': 'en',
                'maxReviews': 0,
                'deeperScrape': True,   # phones live on the place details pane
                'scrapeMobile': False,
                'scrapeDirectories': False,
            },
            timeout=60,
        )
        if started.status_code not in (200, 201):
            log.warning('Apify Maps run start failed: HTTP %s', started.status_code)
            return []
        run = started.json().get('data') or started.json()
        run_id = run.get('id')
        dataset_id = (run.get('defaultDatasetId') or '')
        if not run_id or not dataset_id:
            log.warning('Apify Maps run start returned no ids')
            return []
        # poll until the run finishes (SUCCEEDED/FAILED/ABORTED/TIMED-OUT)
        waited = 0
        status = 'READY'
        while waited < RUN_WAIT_S:
            time.sleep(RUN_POLL_EVERY_S)
            waited += RUN_POLL_EVERY_S
            state = requests.get(
                RUN_STATUS_URL.format(run_id=run_id, token=key), timeout=30)
            if state.status_code != 200:
                log.warning('Apify run status failed: HTTP %s', state.status_code)
                return []
            status = (state.json().get('data') or {}).get('status', '')
            if status not in ('READY', 'RUNNING'):
                break
        if status != 'SUCCEEDED':
            log.warning('Apify Maps run ended as %s after %ss', status or 'UNKNOWN', waited)
            return []
        items_resp = requests.get(
            DATASET_URL.format(dataset_id=dataset_id, token=key), timeout=60)
        if items_resp.status_code != 200:
            log.warning('Apify dataset fetch failed: HTTP %s', items_resp.status_code)
            return []
        items = items_resp.json()
        if not isinstance(items, list):
            return []
        places = []
        for it in items:
            phone = (it.get('phone') or it.get('phoneUnformatted') or '').strip()
            if not phone:
                continue
            places.append({
                'title': (it.get('title') or '').strip(),
                'phone': phone,
                'website': _norm_domain(it.get('website')),
                'city': (it.get('city') or '').strip(),
                'state': (it.get('state') or '').strip(),
                'address': (it.get('address') or '').strip(),
                'countryCode': (it.get('countryCode') or '').strip(),
            })
        return places
    except Exception as exc:  # timeout / network / quota — never crash a cycle
        log.warning('Apify Maps run error: %s', exc)
        return []


def enrich_leads_via_apify(leads, max_per_search=4):
    """Batch-enrich leads missing a phone via one Google Maps actor run.

    Matching is by the lead's WEBSITE DOMAIN against each place's website
    (fallback: exact company-title match) — never by result position, so a
    phone can only ever land on the lead it belongs to.  India leads are
    searched first (strongest Maps coverage, per product focus).

    Returns the list of leads that received a phone."""
    targets = [l for l in leads if not (l.contact_phone or '').strip() and l.website]
    if not targets or not apify_available():
        return []
    # India first, then the rest — Maps coverage is deepest there
    targets.sort(key=lambda l: 0 if (l.country or '').lower() in ('india',) else 1)
    searches = [_search_string_for(l) for l in targets]
    places = maps_places(searches, max_per_search=max_per_search)
    if not places:
        return []

    by_domain = {}
    by_title = {}
    for p in places:
        if p['website']:
            by_domain.setdefault(p['website'], p)
        by_title.setdefault(re.sub(r'\W+', '', p['title'].lower()), p)

    enriched = []
    for lead in targets:
        domain = _norm_domain(lead.website)
        place = by_domain.get(domain) or by_title.get(re.sub(r'\W+', '', lead.company.lower()))
        if not place:
            continue
        lead.contact_phone = place['phone']
        lead.analysis = {**(lead.analysis or {}),
                         'phone_source': 'google-maps (apify)',
                         'maps_address': place['address'] or place['city']}
        lead.save(update_fields=['contact_phone', 'analysis'])
        enriched.append(lead)
    return enriched
