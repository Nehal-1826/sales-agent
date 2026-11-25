"""Token auth with an expiry.

DRF's stock TokenAuthentication never expires a token, so a copied or leaked
token stays valid forever and sign-out only forgot it in the browser.  Tokens
older than TOKEN_TTL are rejected (401) and deleted; login issues a fresh one.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import (
    BaseAuthentication, SessionAuthentication, TokenAuthentication, get_authorization_header,
)

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


class ImpersonationAuthentication(BaseAuthentication):
    """"Enter as user": `Authorization: Impersonation <ticket>` runs the request
    as the ticket's target user, inside the target's workspace.

    Only its own keyword is looked at, so a ticket can never pass as a normal
    token nor the other way round. An unusable ticket is a 401 at once — it
    never falls through to another authenticator. The request is marked
    (`request.impersonation`) and the paths an impersonated tab may never
    reach are refused HERE, where every request passes: hiding buttons in the
    app is not a control."""

    keyword = 'Impersonation'

    def authenticate_header(self, request):
        # DRF answers 401 or 403 to a request nobody authenticated from the
        # FIRST authenticator's header. This class is first, so it keeps the
        # value every client saw before it existed (the app treats a 401 as
        # "sign in again"; a 403 it would show as a permission problem).
        return 'Token realm="api"'

    def authenticate(self, request):
        parts = get_authorization_header(request).decode('utf-8').split()
        if len(parts) != 2 or parts[0].lower() != self.keyword.lower():
            return None
        from . import impersonation
        ticket = impersonation.lookup(parts[1])
        if ticket is None or not ticket.target.is_active:
            raise exceptions.AuthenticationFailed(impersonation.ENDED_DETAIL)
        if impersonation.is_refused(request.path):
            raise exceptions.PermissionDenied(impersonation.REFUSED_DETAIL)
        request.impersonation = ticket
        activate_user_workspace(ticket.target)   # raises if the workspace is stopped
        impersonation.touch(ticket)
        return ticket.target, ticket


class TenantSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            activate_user_workspace(result[0])
        return result
