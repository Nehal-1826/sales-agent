"""The warmup service's copies of an account, reached by e-mail — server to server.

An account on this side has a copy on the warmup side, keyed on the e-mail.
Deleting an account here must stop that copy's mailboxes at once, bringing
the account back must let them run again, and removing an account for good
must take the copy with it. The service is asked with a bridge token minted
for the admin who acts (core.warmup_bridge), the way the browser would.

"Could not look" is never read as "nothing there": an account whose copy
cannot be checked is not deleted (core.accounts) — a deleted account must
never keep warming. Pausing the mailboxes is what stops the engine;
"suspending" a copy only blocks its sign-in on that side.
"""

import logging

import requests

from .warmup_bridge import mint_warmup_token
from .warmup_enroll import warmup_api_base

log = logging.getLogger(__name__)

TIMEOUT = 8          # seconds per call: a deletion waits for it
PAGE_SIZE = 200      # the service's largest page


class WarmupAccountsError(Exception):
    """The warmup service could not do it — `detail` for the admin, `status_code` for the API."""

    def __init__(self, detail, status_code=502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _call(admin, method, path, **kwargs):
    """One request to the warmup service, signed for `admin`: the raw answer."""
    try:
        token = mint_warmup_token(user=admin, workspace_slug='default')
    except RuntimeError as exc:
        raise WarmupAccountsError('Warmup bridge is not configured.', 503) from exc
    try:
        return requests.request(
            method, f'{warmup_api_base()}{path}',
            headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'},
            timeout=TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        raise WarmupAccountsError('Could not reach the warmup service.') from exc


def copies_for(email, admin):
    """Every copy the warmup service keeps of this e-mail address — an exact
    match, case and spaces forgiven. Raises when it cannot be looked at."""
    email = (email or '').strip()
    if not email:
        return []
    resp = _call(admin, 'GET', '/api/admin/users', params={'search': email, 'page_size': PAGE_SIZE})
    if resp.status_code == 401:
        # our bridge secret or the admin's token, not the account: never "no copy"
        raise WarmupAccountsError('The warmup service did not accept our sign-in.', 503)
    if resp.status_code != 200:
        raise WarmupAccountsError('The warmup service did not answer properly.')
    try:
        body = resp.json()
    except ValueError:
        body = None
    items = body.get('items') if isinstance(body, dict) else None
    if not isinstance(items, list):
        raise WarmupAccountsError('The warmup service did not answer properly.')
    wanted = email.lower()
    return [u for u in items if isinstance(u, dict)
            and str(u.get('email', '')).strip().lower() == wanted]


def set_paused(email, admin, paused):
    """Pause (or let run again) every mailbox of every copy of this e-mail
    address. Returns how many mailboxes changed; no copy → 0 and nothing more is asked."""
    copies = copies_for(email, admin)
    if not copies:
        return 0
    resp = _call(admin, 'POST', '/api/admin/users/bulk-pause-mailboxes',
                 json={'user_ids': [c.get('id') for c in copies],
                       'action': 'pause' if paused else 'resume'})
    if resp.status_code != 200:
        raise WarmupAccountsError('The warmup service did not pause the mailboxes.' if paused
                                  else 'The warmup service did not let the mailboxes run again.')
    try:
        return int(resp.json().get('mailboxes_updated', 0))
    except (ValueError, AttributeError, TypeError):
        return 0


def remove(email, admin):
    """Delete every copy of this e-mail address, with its mailboxes. Returns how many went."""
    copies = copies_for(email, admin)
    for copy in copies:
        resp = _call(admin, 'DELETE', f"/api/admin/users/{copy.get('id')}")
        if resp.status_code not in (204, 404):       # 404: gone already
            raise WarmupAccountsError('The warmup service did not delete the account.')
    return len(copies)
