"""Google OAuth sign-in for EXISTING users (match by verified email).

Flow (no extra dependencies — plain OAuth2 code exchange):
  browser → GET /api/auth/google/start/     → 302 to Google's consent screen
  Google  → GET /api/auth/google/callback/  → one-time code cached 60 s
  browser → POST /api/auth/google/exchange/ {code} → {token, user} (DRF token)

Rules (the two-door split holds):
  * unknown email      → error=not_found   (accounts are created by the owner)
  * platform admin     → error=admin_only  (admins sign in via /<slug>/login)
  * workspace user     → a normal DRF token, same as a password login

Dormant until GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are set in the env.
"""

import json
import logging
import secrets
import urllib.parse

import requests
from django.core.cache import cache
from django.http import HttpResponsePermanentRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token

from .authz import auth_extras
from .models import User
from .serializers import UserSerializer

log = logging.getLogger(__name__)

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
STATE_TTL = 600          # seconds the CSRF state stays valid
CODE_TTL = 60            # seconds a one-time exchange code stays valid

ERR_REDIRECTS = {
    'not_found': 'No account exists for that Google email — ask the workspace '
                 'owner to create one, then sign in with Google again.',
    'admin_only': 'That account is a platform admin — sign in from the admin '
                  'login page instead.',
    'misconfigured': 'Google sign-in is not configured on this server.',
    'failed': 'Google sign-in failed — please try again.',
}


def _client_id():
    return (os_get('GOOGLE_CLIENT_ID') or '').strip()


def _client_secret():
    return (os_get('GOOGLE_CLIENT_SECRET') or '').strip()


def os_get(name):
    import os
    return os.environ.get(name, '')


def _redirect_uri(request):
    """The callback Google sees — explicit env wins (behind proxies the
    request host can be wrong)."""
    configured = os_get('GOOGLE_REDIRECT_URI').strip()
    if configured:
        return configured
    scheme = 'https' if request.headers.get('X-Forwarded-Proto') == 'https' else request.scheme
    return f'{scheme}://{request.get_host()}/api/auth/google/callback/'


def _front_redirect(request, **params):
    """Back to the sign-in screen with error=… / gcode=… in the query."""
    base = os_get('PUBLIC_BASE_URL').strip().rstrip('/') or f"{request.scheme}://{request.get_host()}"
    sep = '&' if '?' in base else '?'
    return HttpResponsePermanentRedirect(base + sep + urllib.parse.urlencode(params))


@api_view(['GET'])
@permission_classes([AllowAny])
def google_start(request):
    cid = _client_id()
    if not cid or not _client_secret():
        return Response({'detail': ERR_REDIRECTS['misconfigured']}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    state = secrets.token_urlsafe(24)
    cache.set(f'google-oauth:state:{state}', True, STATE_TTL)
    params = {
        'client_id': cid,
        'redirect_uri': _redirect_uri(request),
        'response_type': 'code',
        'scope': 'openid email profile',
        'state': state,
        'prompt': 'select_account',
    }
    return HttpResponsePermanentRedirect(GOOGLE_AUTH_URL + '?' + urllib.parse.urlencode(params))


@api_view(['GET'])
@permission_classes([AllowAny])
def google_callback(request):
    """Google lands here with ?code&state — resolve the user and hand the
    browser a one-time code it exchanges for the session token."""
    cid = _client_id()
    if not cid or not _client_secret():
        return _front_redirect(request, signin=1, google='misconfigured')
    error = request.query_params.get('error') or ''
    code = request.query_params.get('code') or ''
    state_param = request.query_params.get('state') or ''
    if error or not code:
        log.info('Google OAuth error param: %r', error)
        return _front_redirect(request, signin=1, google='failed')
    if not cache.get(f'google-oauth:state:{state_param}'):
        return _front_redirect(request, signin=1, google='failed')
    cache.delete(f'google-oauth:state:{state_param}')

    try:
        token_resp = requests.post(GOOGLE_TOKEN_URL, data={
            'code': code,
            'client_id': cid,
            'client_secret': _client_secret(),
            'redirect_uri': _redirect_uri(request),
            'grant_type': 'authorization_code',
        }, timeout=15)
        token_resp.raise_for_status()
        access_token = token_resp.json().get('access_token', '')
        profile_resp = requests.get(
            GOOGLE_USERINFO_URL, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
        profile_resp.raise_for_status()
        profile = profile_resp.json()
    except Exception as exc:
        log.warning('Google OAuth exchange failed: %s', exc)
        return _front_redirect(request, signin=1, google='failed')

    email = (profile.get('email') or '').strip().lower()
    if not email or not profile.get('email_verified', False):
        return _front_redirect(request, signin=1, google='failed')

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        return _front_redirect(request, signin=1, google='not_found')
    if user.is_staff and user.workspace_id is None:
        # two-door rule: platform admins never get a token on this door
        return _front_redirect(request, signin=1, google='admin_only')

    # one-time code → the browser exchanges it for the DRF token (the token
    # itself never appears in a URL / history)
    one_time = secrets.token_urlsafe(24)
    cache.set(f'google-oauth:code:{one_time}', user.pk, CODE_TTL)
    return _front_redirect(request, signin=1, gcode=one_time)


@api_view(['POST'])
@permission_classes([AllowAny])
def google_exchange(request):
    """{code} → {token, user} — exactly once, within 60 s of the callback."""
    one_time = (request.data.get('code') or '').strip() if hasattr(request.data, 'get') else ''
    key = f'google-oauth:code:{one_time}'
    user_pk = cache.get(key)
    if not one_time or user_pk is None:
        return Response({'detail': 'That Google sign-in code expired — try again.'},
                        status=status.HTTP_400_BAD_REQUEST)
    cache.delete(key)
    user = User.objects.filter(pk=user_pk, is_active=True).first()
    if user is None:
        return Response({'detail': 'Account no longer active.'}, status=status.HTTP_403_FORBIDDEN)
    token, _ = Token.objects.get_or_create(user=user)
    from .models import PlatformSession
    PlatformSession.objects.filter(token=token).delete()  # fresh login = fresh OTP gate
    return Response({'token': token.key,
                     'user': {**UserSerializer(user).data, **auth_extras(user, request)}})
