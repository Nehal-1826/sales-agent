"""Google OAuth — sign-in / sign-up via Google.

Two endpoints:
* ``GET /api/auth/google/login`` — redirect the user to Google's consent page
* ``GET /api/auth/google/callback`` — Google redirects here with ?code=...
  We exchange code → tokens server-side, fetch user info, create-or-find
  the user in our DB, issue our own JWT pair, and bounce the browser back
  to the frontend with the tokens in the URL fragment.
"""
from __future__ import annotations

import base64
import html
import json
import secrets
import urllib.parse
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models.users import OnboardingStatus, User, UserRole
from app.db.session import get_db
from app.services.auth_service import _issue_token_pair

router = APIRouter(prefix="/api/auth/google", tags=["auth", "google-oauth"])

_GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"
_LOGIN_SCOPES = "openid email profile"
# Warmup engine scopes — each is actively used, per Google's least-privilege
# requirement (no "future-proofing" grants):
#   * gmail.send — send warmup mail from the mailbox via the Gmail REST
#                    ``messages/send`` endpoint (services/warmup/oauth_token).
# gmail.modify + gmail.labels were REMOVED 2026-09-06: Google's verification
# rejected the engagement use case (spam-rescue / mark-read / star / label)
# under the "Appropriate access to and use of Google Gmail APIs" policy.
# Inbound engagement now runs exclusively on the peer side over IMAP.
# Keep this list in exact string-match with the OAuth consent screen's
# configured scopes.
_MAILBOX_SCOPES = " ".join([
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
])


@router.get("/login")
async def google_login(
    intent: Annotated[str, Query(pattern="^(login|signup)$")] = "login",
    plan: Annotated[str | None, Query(max_length=50)] = None,
):
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server",
        )

    state_payload = f"{intent}:{plan or ''}:{secrets.token_urlsafe(16)}"
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": _LOGIN_SCOPES,
        "access_type": "online",
        "prompt": "select_account",
        "state": state_payload,
    }
    return RedirectResponse(
        url=f"{_GOOGLE_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}",
        status_code=302,
    )


@router.get("/callback")
async def google_callback(
    code: Annotated[str, Query(..., min_length=1)],
    state: Annotated[str | None, Query()] = None,
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server",
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            token_resp = await http.post(
                _GOOGLE_TOKEN_ENDPOINT,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            if token_resp.status_code >= 400:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"google_error": token_resp.json()},
                )
            tokens = token_resp.json()

            ui_resp = await http.get(
                _GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            ui_resp.raise_for_status()
            userinfo = ui_resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Google contact failed: {exc}",
        ) from exc

    email = (userinfo.get("email") or "").lower()
    if not email or not userinfo.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google did not return a verified email",
        )

    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()

    # Provider binding: refuse to let Google adopt an existing PASSWORD-origin
    # account that hasn't verified its email (pre-account-takeover vector).
    if user is not None and user.hashed_password is not None and not user.email_verified:
        return RedirectResponse(
            url=f"{settings.frontend_base_url}/login#error=account_exists",
            status_code=302,
        )

    if user is None:
        user = User(
            email=email,
            hashed_password=None,
            workspace_id=uuid.uuid4(),
            role=UserRole.client,
            onboarding_status=OnboardingStatus.signed_up,
            totp_enabled=False,
            email_verified=True,  # Google asserted email_verified above
        )
        db.add(user)
        await db.flush()

    # 2FA: this legacy redirect flow cannot perform a TOTP step-up, so refuse to
    # mint a session for 2FA-protected accounts (they must use the standard
    # email+password+TOTP login). Closes the OAuth-bypasses-2FA hole.
    if user.totp_enabled:
        return RedirectResponse(
            url=f"{settings.frontend_base_url}/login#error=totp_required",
            status_code=302,
        )

    pair = _issue_token_pair(user, plan_name=None)
    await db.commit()

    fragment = urllib.parse.urlencode(
        {
            "access_token": pair.access_token,
            "refresh_token": pair.refresh_token,
            "expires_in": pair.expires_in,
        }
    )
    return RedirectResponse(
        url=f"{settings.frontend_base_url}/auth/google/callback#{fragment}",
        status_code=302,
    )


# --------------------------------------------------------------------------- #
# Mailbox-connect OAuth (popup flow). Asks for the warmup scopes (send + modify
# + labels — see _MAILBOX_SCOPES) with offline access, then returns an HTML page
# that postMessages the refresh token back to window.opener and closes itself.
# --------------------------------------------------------------------------- #


@router.get("/oauth-start")
async def google_oauth_start(
    intent: Annotated[str, Query(pattern="^(mailbox|login)$")] = "mailbox",
):
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server",
        )

    state = f"{intent}:{secrets.token_urlsafe(16)}"
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_mailbox_redirect_uri,
        "response_type": "code",
        "scope": _MAILBOX_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return RedirectResponse(
        url=f"{_GOOGLE_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}",
        status_code=302,
    )


_POPUP_PROVIDER = "google"


def _popup_response(payload: dict, target_origin: str) -> HTMLResponse:
    """Render an HTML page that delivers the OAuth result to the opener.

    Cross-origin hop strategy: the popup currently lives on the BACKEND
    origin (localhost:8001) after Google's redirect. We can't reliably
    `postMessage` from here because Chrome's Cross-Origin-Opener-Policy
    nullifies `window.opener` after the popup navigated through Google,
    and same-origin `window.close()` also gets blocked.

    Fix: forward the popup to a tiny route on the FRONTEND origin
    (`{frontend_base_url}/oauth/popup-done#<base64-json>`), where:
      - `window.opener` is restored (popup is now same-origin as opener)
      - `localStorage` writes land in the opener's bucket
      - `window.close()` succeeds

    The payload travels in the URL fragment (everything after `#`) so it
    NEVER hits the network as a query string — refresh tokens stay out
    of server logs and Referer headers.

    We still emit a small HTML shell with the immediate
    `window.location.replace` (rather than a 302) so that even users
    who land here via a bookmark / refresh see the "closing window…"
    text instead of a blank page. The replace happens within ~1 ms.
    """
    # Tag the payload with the provider so the same-origin popup-done
    # route on the frontend knows which localStorage key to write to
    # (one of `warmpulse.oauthResult.google` / `…microsoft`).
    payload = {**payload, "provider": _POPUP_PROVIDER}
    payload_json = json.dumps(payload, separators=(",", ":"))
    # base64-url so the fragment is opaque to humans skim-reading URLs
    # and survives any over-eager Referer scrubbing intermediate proxies.
    encoded = base64.urlsafe_b64encode(payload_json.encode("utf-8")).decode("ascii")
    safe_target = html.escape(target_origin, quote=True)
    # The popup redirects to a frontend route which owns the delivery.
    redirect_url = f"{target_origin.rstrip('/')}/oauth/popup-done#{encoded}"
    safe_redirect = html.escape(redirect_url, quote=True)
    body = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>WarmPulse</title>
<meta http-equiv="refresh" content="0;url={safe_redirect}">
</head>
<body style="font-family: system-ui; padding: 40px; text-align: center; color: #888;">
<p>Connection complete — finishing…</p>
<script>
  // Belt-and-braces: try postMessage immediately (works when opener is
  // still reachable AND target_origin matches), then hop to the
  // same-origin frontend route which owns the actual delivery.
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


@router.get("/mailbox-callback")
async def google_mailbox_callback(
    code: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
):
    settings = get_settings()
    target_origin = settings.frontend_base_url

    if error:
        return _popup_response(
            {"type": "warmpulse:oauth", "error": error}, target_origin
        )
    if not code:
        return _popup_response(
            {"type": "warmpulse:oauth", "error": "missing_code"}, target_origin
        )

    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            token_resp = await http.post(
                _GOOGLE_TOKEN_ENDPOINT,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": settings.google_mailbox_redirect_uri,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            if token_resp.status_code >= 400:
                err = token_resp.json()
                return _popup_response(
                    {"type": "warmpulse:oauth", "error": "token_exchange_failed",
                     "google_error": err},
                    target_origin,
                )
            tokens = token_resp.json()

            ui_resp = await http.get(
                _GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            ui_resp.raise_for_status()
            userinfo = ui_resp.json()
    except httpx.HTTPError as exc:
        return _popup_response(
            {"type": "warmpulse:oauth", "error": "google_unreachable",
             "message": str(exc)},
            target_origin,
        )

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        return _popup_response(
            {"type": "warmpulse:oauth", "error": "no_refresh_token",
             "hint": "Re-authorize from Google Account permissions then try again"},
            target_origin,
        )

    return _popup_response(
        {
            "type": "warmpulse:oauth",
            "token": refresh_token,
            "email": (userinfo.get("email") or "").lower(),
            "scope": tokens.get("scope"),
            "expires_in": tokens.get("expires_in"),
        },
        target_origin,
    )
