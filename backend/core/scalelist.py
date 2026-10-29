"""
Scalelist Phone Enrichment API — the primary phone-number source.

After the Profile agent scrapes a lead's site, this API is queried with the
strongest identifying information the lead already carries (work email first,
else company name + domain) and the returned phone is attached to THAT SAME
lead row.  Behaviour contract:

  • reads SCALELIST_API_KEY from the environment — never hardcoded, never
    logged, never sent to the frontend
  • called only when the lead's phone field is empty (existing numbers are
    never overwritten)
  • not_found / errors / rate limits → '' (field stays empty, the pipeline
    continues; a lead is never deleted or altered beyond the phone field)
"""

import logging

import requests

log = logging.getLogger(__name__)

SCALELIST_PHONE_URL = 'https://api.scalelist.com/api/v1/phone/find'


def _api_key():
    """The workspace's own key; env is a fallback for the default tenant only
    (AppSettings.load() absorbs it there, so the DB field is the single source)."""
    from .models import AppSettings
    return AppSettings.load().scalelist_api_key


def scalelist_available():
    return bool(_api_key())


def scalelist_phone_find(email='', full_name='', company='', domain=''):
    """One phone lookup.  Returns the E.164-ish phone string, or '' when
    Scalelist has nothing (or the key is missing / the call failed)."""
    key = _api_key()
    if not key:
        return ''
    body = {}
    if email:
        body['email'] = email
    elif full_name or company:
        # person-level API: company name stands in when we hold no person name
        body['full_name'] = full_name or company
        if domain:
            body['domain'] = domain.removeprefix('https://').removeprefix('http://').removeprefix('www.')
        if company:
            body['company_name'] = company
    else:
        return ''
    try:
        resp = requests.post(
            SCALELIST_PHONE_URL,
            headers={'X-Api-Key': key, 'Content-Type': 'application/json'},
            json=body,
            timeout=20,
        )
        if resp.status_code != 200:
            log.warning('Scalelist phone/find failed: HTTP %s', resp.status_code)
            return ''
        data = resp.json() or {}
        if data.get('status') == 'found' and data.get('phone'):
            return str(data['phone']).strip()
        return ''
    except Exception as exc:  # timeout / network / rate limit — never crash a cycle
        log.warning('Scalelist phone/find error: %s', exc)
        return ''
