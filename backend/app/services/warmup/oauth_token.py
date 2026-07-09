"""Google OAuth access-token minting for SMTP XOAUTH2 warmup sending.

OAuth-connected mailboxes store a Fernet-encrypted Google *refresh* token
(``mailbox.oauth_token_encrypted``) — never a password. To send via SMTP we
exchange that refresh token for a short-lived access token, then authenticate
to Gmail/Outlook SMTP with SASL XOAUTH2.

Security: the refresh token is a long-lived secret. It is passed as form data
to Google's token endpoint and **never** logged or embedded in exception
strings. Only Google's own ``error``/``error_description`` surface in raised
``RuntimeError``s.
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_GMAIL_SEND_ENDPOINT = (
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
)


async def google_access_token(refresh_token: str, *, settings) -> str:
    """Exchange a Google ``refresh_token`` for a short-lived access token.

    ``settings`` must expose ``google_client_id`` / ``google_client_secret``.
    Raises ``RuntimeError`` (carrying Google's error code, NOT the refresh
    token) on any non-2xx response or a missing ``access_token``.
    """
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            _GOOGLE_TOKEN_ENDPOINT,
            data={
                "grant_type": "refresh_token",
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
            },
            headers={"Accept": "application/json"},
        )

    if resp.status_code < 200 or resp.status_code >= 300:
        try:
            err = resp.json()
        except Exception:
            err = {}
        code = err.get("error", "unknown_error")
        desc = err.get("error_description", "")
        # Never include the refresh token in the message.
        raise RuntimeError(
            f"Google token exchange failed (HTTP {resp.status_code}): "
            f"{code}{f' — {desc}' if desc else ''}"
        )

    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError(
            "Google token exchange returned no access_token "
            f"(HTTP {resp.status_code})"
        )
    return token


async def gmail_api_send(access_token: str, raw_message: bytes) -> str:
    """Send an RFC822 message via the Gmail REST API and return the Gmail id.

    Gmail *SMTP* XOAUTH2 needs the full ``https://mail.google.com/`` scope; our
    mailbox-connect flow only grants ``gmail.send``, which authorizes this REST
    endpoint instead. ``raw_message`` is the serialized ``EmailMessage`` bytes;
    we base64url-encode it as the API requires.

    Raises ``RuntimeError`` (never carrying the access token) on failure. A
    disabled-API 403 carries a clear hint so the operator knows to enable the
    Gmail API in the Google Cloud project.
    """
    import base64

    raw_b64 = base64.urlsafe_b64encode(raw_message).decode()
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(
            _GMAIL_SEND_ENDPOINT,
            headers={"Authorization": f"Bearer {access_token}"},
            json={"raw": raw_b64},
        )

    if resp.status_code < 200 or resp.status_code >= 300:
        try:
            err = resp.json().get("error", {})
        except Exception:
            err = {}
        message = err.get("message", "")
        reason = ""
        for detail in err.get("errors", []) or []:
            if detail.get("reason"):
                reason = detail["reason"]
                break
        hint = ""
        if resp.status_code == 403 and (
            "has not been used" in message or reason in {"accessNotConfigured", "SERVICE_DISABLED"}
        ):
            hint = " — enable the Gmail API in your Google Cloud project"
        raise RuntimeError(
            f"Gmail API send failed (HTTP {resp.status_code}): "
            f"{message or reason or 'unknown error'}{hint}"
        )

    return resp.json().get("id", "")
