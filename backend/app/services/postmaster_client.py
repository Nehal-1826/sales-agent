"""Google Postmaster Tools API client.

Thin async httpx wrapper around the three endpoints we need:

* OAuth code-for-token exchange (one-shot at connect time)
* OAuth refresh-token → access-token swap (on every daily pull)
* ``trafficStats`` fetch for a domain + date

The OAuth flow uses the same Google client credentials registered for the
mailbox-connect flow.

Scope: we request exactly ``postmaster.traffic.readonly`` — "get email
traffic metrics for the domains you have registered with Postmaster Tools",
which is precisely the one call this module makes
(``/v1/domains/{domain}/trafficStats/{date}``). We deliberately do NOT
request the broader ``postmaster`` or ``postmaster.domain`` scopes, which
would also allow managing domains and domain users.

This previously requested ``postmaster.readonly``, which is not a scope
Google publishes — the documented Postmaster Tools scopes are ``postmaster``,
``postmaster.domain`` and ``postmaster.traffic.readonly``.

NOTE: the redirect URI below must be registered on the OAuth client under
Cloud Console → Clients → Authorised redirect URIs. If it isn't, Google
rejects the consent request with ``Error 400: redirect_uri_mismatch``
before the user ever sees a consent screen.

Secrets handling: never logs access_token or refresh_token verbatim. Where
they appear in dict payloads we redact via :func:`_redact` before logging.
"""
from __future__ import annotations

import datetime as dt
import logging
import urllib.parse
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

POSTMASTER_SCOPE = "https://www.googleapis.com/auth/postmaster.traffic.readonly"
GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
POSTMASTER_API_BASE = "https://gmailpostmastertools.googleapis.com/v1"

# Match the existing mailbox-connect callback shape — the route owns the
# actual redirect URI; the client just needs to know how to format the URL.
DEFAULT_REDIRECT_PATH = "/api/workspace/postmaster/oauth-callback"


_REDACT = "REDACTED"
_SENSITIVE_KEYS = {"access_token", "refresh_token", "id_token", "client_secret"}


def _redact(payload: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of ``payload`` with sensitive token values replaced."""
    return {k: (_REDACT if k in _SENSITIVE_KEYS and v else v) for k, v in payload.items()}


def _redirect_uri() -> str:
    s = get_settings()
    base = s.public_base_url
    return f"{base}{DEFAULT_REDIRECT_PATH}"


async def get_oauth_url(state: str) -> str:
    """Return the Google consent URL the popup should open.

    ``state`` is opaque to Google; the route packs ``workspace_id:domain:nonce``
    into it so the callback can recover both without a server-side state
    table.
    """
    s = get_settings()
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": POSTMASTER_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str) -> dict[str, Any]:
    """Trade a one-shot ``code`` for ``{access_token, refresh_token, expires_in}``.

    Raises ``httpx.HTTPStatusError`` on a non-2xx response.
    """
    s = get_settings()
    data = {
        "code": code,
        "client_id": s.google_client_id,
        "client_secret": s.google_client_secret,
        "redirect_uri": _redirect_uri(),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=15.0) as http:
        resp = await http.post(GOOGLE_OAUTH_TOKEN_URL, data=data)
        resp.raise_for_status()
        body = resp.json()
    logger.info("postmaster.oauth.exchange_ok keys=%s", list(_redact(body).keys()))
    return body


async def refresh_access_token(refresh_token: str) -> str:
    """Swap a long-lived refresh token for a fresh short-lived access token."""
    s = get_settings()
    # Bind to a local; never let the plaintext refresh_token reach a log line.
    rt = refresh_token
    data = {
        "client_id": s.google_client_id,
        "client_secret": s.google_client_secret,
        "refresh_token": rt,
        "grant_type": "refresh_token",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.post(GOOGLE_OAUTH_TOKEN_URL, data=data)
            resp.raise_for_status()
            body = resp.json()
    finally:
        # Defensive: overwrite + drop the local so the refresh token can't
        # be recovered from a frame dump in the caller's stack trace.
        rt = _REDACT  # noqa: F841
        del rt

    access = body.get("access_token")
    if not access:
        logger.warning("postmaster.refresh.no_access_token keys=%s", list(body.keys()))
        raise RuntimeError("postmaster refresh returned no access_token")
    return access


async def fetch_traffic_stats(
    access_token: str, domain: str, date: dt.date
) -> dict[str, Any]:
    """Fetch the trafficStats payload for ``domain`` on ``date``.

    Raises ``httpx.HTTPStatusError`` on 4xx/5xx. A 404 means Postmaster
    hasn't produced stats for that day yet — caller should treat as "no
    data" rather than an error.
    """
    yyyymmdd = date.strftime("%Y%m%d")
    safe_domain = urllib.parse.quote(domain)
    url = f"{POSTMASTER_API_BASE}/domains/{safe_domain}/trafficStats/{yyyymmdd}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20.0) as http:
        resp = await http.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()


def map_traffic_stats_to_snapshot(stats: dict[str, Any]) -> dict[str, Any]:
    """Convert Postmaster trafficStats response to the snapshot column map.

    Returns ``{spam_rate, domain_reputation, auth_pass_pct, ip_reputation,
    raw}`` ready to splat into a ``DomainReputationSnapshot``.
    """
    spam_rate = stats.get("spammyFeedbackLoops")
    domain_reputation = stats.get("domainReputation")

    spf = stats.get("spfSuccessRatio")
    dkim = stats.get("dkimSuccessRatio")
    dmarc = stats.get("dmarcSuccessRatio")
    auth_components = [v for v in (spf, dkim, dmarc) if isinstance(v, (int, float))]
    auth_pass_pct: float | None
    if auth_components:
        auth_pass_pct = round(
            sum(auth_components) / len(auth_components) * 100.0, 2
        )
    else:
        auth_pass_pct = None

    # ip_reputation as a single string isn't a perfect fit — Postmaster
    # returns a list of buckets. Surface the highest-reputation bucket name
    # so the card has something to render; raw keeps the full list.
    ip_reps = stats.get("ipReputations") or []
    ip_reputation: str | None = None
    if isinstance(ip_reps, list) and ip_reps:
        priority = ("HIGH", "MEDIUM", "LOW", "BAD")
        for level in priority:
            if any(
                isinstance(b, dict) and b.get("reputation") == level for b in ip_reps
            ):
                ip_reputation = level
                break

    return {
        "spam_rate": float(spam_rate) if isinstance(spam_rate, (int, float)) else None,
        "complaint_rate": None,
        "ip_reputation": ip_reputation,
        "domain_reputation": domain_reputation,
        "auth_pass_pct": auth_pass_pct,
        "raw": stats,
    }


__all__ = [
    "POSTMASTER_SCOPE",
    "get_oauth_url",
    "exchange_code",
    "refresh_access_token",
    "fetch_traffic_stats",
    "map_traffic_stats_to_snapshot",
]
