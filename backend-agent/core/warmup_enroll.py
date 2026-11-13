"""Manual "enroll a sending mailbox into WarmPulse" — server-to-service.

The warmup create route (FastAPI ``POST /api/workspace/mailboxes``) needs the
mailbox's real SMTP credentials. Those live in this database and are masked
on every read (``MailboxSerializer``), so the browser can never forward
them: this module reads them server-side and posts them straight to
backend-warmup over the bridge JWT (``warmup_bridge.mint_warmup_token``).
Credentials cross no browser and appear in no response — the same contract
the probe endpoint keeps.

Idempotent by email: if the address is already warming on the FastAPI side
we short-circuit with ``status='already_enrolled'`` instead of creating a
second row (the warmup create route itself has no unique-email guard).
"""

import logging
import os

import requests

from .warmup_bridge import mint_warmup_token

log = logging.getLogger(__name__)

# Local dev: both dev servers share 127.0.0.1 (backend-warmup on :8001).
# Docker: the compose file points the django service at http://fastapi:8001.
DEFAULT_BASE = 'http://127.0.0.1:8001'
TIMEOUT = 20          # the create route runs a live SMTP AUTH probe first
LIST_TIMEOUT = 8
MAX_LIST_PAGES = 10   # page_size=100 → idempotency check up to 1000 rows


class WarmupEnrollError(Exception):
    """Enrollment failed — `status_code` + `detail` map onto the API response."""

    def __init__(self, detail, status_code=502):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def warmup_api_base():
    return (os.environ.get('WARMUP_API_URL') or DEFAULT_BASE).strip().rstrip('/')


def _bridge_headers(token):
    return {'Authorization': f'Bearer {token}', 'Accept': 'application/json'}


def _find_enrolled(token, email):
    """Return the warmup mailbox row for `email` (lower-cased match), or None."""
    target = email.strip().lower()
    base = warmup_api_base()
    for page in range(1, MAX_LIST_PAGES + 1):
        try:
            resp = requests.get(
                f'{base}/api/workspace/mailboxes',
                params={'page': page, 'page_size': 100},
                headers=_bridge_headers(token),
                timeout=LIST_TIMEOUT,
            )
            resp.raise_for_status()
            items = resp.json().get('items', [])
        except requests.RequestException as exc:
            raise WarmupEnrollError(f'Could not reach the warmup service: {exc}') from exc
        for item in items:
            if str(item.get('email_address', '')).strip().lower() == target:
                return item
        if len(items) < 100:
            return None
    return None


def enroll_mailbox(user, workspace_slug, mailbox):
    """Enroll one configured sending mailbox into WarmPulse.

    Returns ``{'status': 'enrolled' | 'already_enrolled', 'mailbox': {...}}``
    (the created/EXISTING MailboxOut verbatim) or raises WarmupEnrollError.
    """
    if not mailbox.configured():
        raise WarmupEnrollError(
            'Mailbox is not fully configured — add the SMTP host, username and '
            'password first (Settings → Mailboxes).', 400)

    try:
        token = mint_warmup_token(user=user, workspace_slug=workspace_slug)
    except RuntimeError as exc:
        raise WarmupEnrollError(f'Warmup bridge is not configured: {exc}', 503) from exc

    existing = _find_enrolled(token, mailbox.from_email)
    if existing is not None:
        return {'status': 'already_enrolled', 'mailbox': existing}

    payload = {
        'email_address': mailbox.from_email,
        'provider': 'smtp',   # agent mailboxes are generic IMAP+SMTP senders
        'smtp_host': mailbox.smtp_host,
        'smtp_port': mailbox.smtp_port or 587,
        'smtp_username': mailbox.smtp_user,
        'smtp_password': mailbox.smtp_password,
        # IMAP fields are deliberately omitted: the warmup create probes IMAP
        # with the SMTP login, but the agent side may keep a separate IMAP
        # account — outbound-only warmup is the safe mapping.
        'daily_target': min(max(mailbox.daily_cap or 50, 1), 200),
    }
    try:
        resp = requests.post(
            f'{warmup_api_base()}/api/workspace/mailboxes',
            json=payload,
            headers={**_bridge_headers(token),
                     'Content-Type': 'application/json'},
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        log.warning('warmup enroll: request failed for %s: %s', mailbox.from_email, exc)
        raise WarmupEnrollError(
            'Could not reach the warmup service. Is backend-warmup running?') from exc

    if resp.status_code == 201:
        return {'status': 'enrolled', 'mailbox': resp.json()}
    # Surface the warmup service's own complaint (e.g. the live SMTP probe
    # rejecting the stored credentials) instead of a generic failure.
    detail = 'The warmup service rejected the mailbox.'
    try:
        body = resp.json()
        raw = body.get('detail')
        if isinstance(raw, str):
            detail = raw
        elif isinstance(raw, list):   # FastAPI 422 validation errors
            msgs = [str(e.get('msg', '')) for e in raw if isinstance(e, dict)]
            detail = '; '.join(m for m in msgs if m) or detail
    except ValueError:
        pass
    log.info('warmup enroll: HTTP %s for %s', resp.status_code, mailbox.from_email)
    # a 4xx is the warmup service refusing THIS mailbox (bad credentials,
    # plan cap) — pass the status through; anything else is our side's
    # problem (401 bridge config included) and reports as a gateway error.
    upstream = resp.status_code if 400 <= resp.status_code < 500 and resp.status_code != 401 else 502
    raise WarmupEnrollError(detail, upstream)
