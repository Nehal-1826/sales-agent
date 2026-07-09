"""Microsoft (Outlook) OAuth — mailbox-connect popup flow.

Mirror of the Gmail mailbox-connect flow in ``google_oauth.py``: the front-end
opens ``GET /api/auth/microsoft/oauth-start`` in a popup, the user grants
SMTP/IMAP access, Microsoft redirects to ``/mailbox-callback`` with a code,
we exchange it for tokens, then postMessage the refresh token back to the
opener and close the popup.

Scopes (Microsoft identity platform v2):
* ``offline_access`` — required to receive a refresh_token
* ``SMTP.Send`` — outbound warmup mail
* ``IMAP.AccessAsUser.All`` — inbound polling for opens/replies/spam-rescue
* ``openid email profile`` — so we can read the user's address back
"""
from __future__ import annotations

import base64
import html
import json
import secrets
import urllib.parse
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import get_settings

router = APIRouter(prefix="/api/auth/microsoft", tags=["auth", "microsoft-oauth"])

_MS_AUTH_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
_MS_TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
_MS_USERINFO_ENDPOINT = "https://graph.microsoft.com/oidc/userinfo"
_MAILBOX_SCOPES = " ".join(
    [
        "openid",
        "email",
        "profile",
        "offline_access",
        "https://outlook.office.com/SMTP.Send",
        "https://outlook.office.com/IMAP.AccessAsUser.All",
    ]
)


_POPUP_PROVIDER = "microsoft"


def _popup_response(payload: dict, target_origin: str) -> HTMLResponse:
    """Mirror of google_oauth._popup_response — see that file for the
    full rationale. Tl;dr: forward the popup from the backend origin
    (localhost:8001) to a same-origin-as-opener frontend route
    (localhost:5173/oauth/popup-done) so postMessage + window.close
    work reliably even when Chrome's COOP has nuked window.opener.
    """
    payload = {**payload, "provider": _POPUP_PROVIDER}
    payload_json = json.dumps(payload, separators=(",", ":"))
    encoded = base64.urlsafe_b64encode(payload_json.encode("utf-8")).decode("ascii")
    safe_target = html.escape(target_origin, quote=True)
    redirect_url = f"{target_origin.rstrip('/')}/oauth/popup-done#{encoded}"
    safe_redirect = html.escape(redirect_url, quote=True)
    body = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>WarmPulse</title>
<meta http-equiv="refresh" content="0;url={safe_redirect}">
</head>
<body style="font-family: system-ui; padding: 40px; text-align: center; color: #888;">
<p>Connection complete — finishing…</p>
<script>
  (function() {{
    try {{
      var raw = atob({json.dumps(encoded)}.replace(/-/g, "+").replace(/_/g, "/"));
      var data = JSON.parse(raw);
      if (window.opener) {{
        try {{ window.opener.postMessage(data, {json.dumps(safe_target)}); }} catch (e) {{}}
        try {{ window.opener.postMessage(data, "*"); }} catch (e) {{}}
      }}
    }} catch (e) {{}}
    window.location.replace({json.dumps(redirect_url)});
  }})();
</script>
</body></html>"""
    return HTMLResponse(content=body)


@router.get("/oauth-start")
async def microsoft_oauth_start(
    intent: Annotated[str, Query(pattern="^(mailbox|login)$")] = "mailbox",
):
    settings = get_settings()
    if not settings.microsoft_client_id or not settings.microsoft_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft OAuth is not configured on this server",
        )

    state = f"{intent}:{secrets.token_urlsafe(16)}"
    params = {
        "client_id": settings.microsoft_client_id,
        "redirect_uri": settings.microsoft_mailbox_redirect_uri,
        "response_type": "code",
        "scope": _MAILBOX_SCOPES,
        "response_mode": "query",
        "prompt": "consent",
        "state": state,
    }
    return RedirectResponse(
        url=f"{_MS_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}",
        status_code=302,
    )


@router.get("/mailbox-callback")
async def microsoft_mailbox_callback(
    code: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
):
    settings = get_settings()
    target_origin = settings.frontend_base_url

    if error:
        return _popup_response(
            {"type": "warmpulse:oauth", "provider": "outlook", "error": error},
            target_origin,
        )
    if not code:
        return _popup_response(
            {
                "type": "warmpulse:oauth",
                "provider": "outlook",
                "error": "missing_code",
            },
            target_origin,
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            token_resp = await http.post(
                _MS_TOKEN_ENDPOINT,
                data={
                    "code": code,
                    "client_id": settings.microsoft_client_id,
                    "client_secret": settings.microsoft_client_secret,
                    "redirect_uri": settings.microsoft_mailbox_redirect_uri,
                    "grant_type": "authorization_code",
                    "scope": _MAILBOX_SCOPES,
                },
                headers={"Accept": "application/json"},
            )
            if token_resp.status_code >= 400:
                err = token_resp.json()
                return _popup_response(
                    {
                        "type": "warmpulse:oauth",
                        "provider": "outlook",
                        "error": "token_exchange_failed",
                        "ms_error": err,
                    },
                    target_origin,
                )
            tokens = token_resp.json()

            ui_resp = await http.get(
                _MS_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            ui_resp.raise_for_status()
            userinfo = ui_resp.json()
    except httpx.HTTPError as exc:
        return _popup_response(
            {
                "type": "warmpulse:oauth",
                "provider": "outlook",
                "error": "ms_unreachable",
                "message": str(exc),
            },
            target_origin,
        )

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return _popup_response(
            {
                "type": "warmpulse:oauth",
                "provider": "outlook",
                "error": "no_refresh_token",
                "hint": "Re-authorize from your Microsoft account permissions then try again",
            },
            target_origin,
        )

    return _popup_response(
        {
            "type": "warmpulse:oauth",
            "provider": "outlook",
            "token": refresh_token,
            "email": (
                userinfo.get("email")
                or userinfo.get("preferred_username")
                or userinfo.get("upn")
                or ""
            ).lower(),
            "scope": tokens.get("scope"),
            "expires_in": tokens.get("expires_in"),
        },
        target_origin,
    )
