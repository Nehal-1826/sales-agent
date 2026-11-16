"""Token auth with an expiry.

DRF's stock TokenAuthentication never expires a token, so a copied or leaked
token stays valid forever and sign-out only forgot it in the browser.  Tokens
older than TOKEN_TTL are rejected (401) and deleted; login issues a fresh one.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import SessionAuthentication, TokenAuthentication

from .tenancy import set_workspace


def token_ttl():
    # read per call so the TTL follows settings (and override_settings in tests)
    return timedelta(days=getattr(settings, 'TOKEN_TTL_DAYS', 14))


def token_expired(token):
    return timezone.now() - token.created > token_ttl()


def activate_user_workspace(user):
    """Bind the request to the authenticated user's own workspace.

    The tenant is derived ONLY from the user row — never from a header, query
    param or body — so a client cannot choose whose data it sees.  A platform
    operator (no workspace) gets no context; tenant queries then raise and the
    API answers 403 (see core.exceptions)."""
    ws = getattr(user, 'workspace', None)
    if ws is None:
        return
    if not ws.is_active:
        raise exceptions.PermissionDenied('This workspace is suspended.')
    # reset by TenantContextMiddleware at the end of the request
    set_workspace(ws)


class ExpiringTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token_expired(token):
            token.delete()
            raise exceptions.AuthenticationFailed('Session expired — sign in again.')
        activate_user_workspace(user)
        return user, token


class TenantSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            activate_user_workspace(result[0])
        return result
