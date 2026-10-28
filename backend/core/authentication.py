"""Token auth with an expiry.

DRF's stock TokenAuthentication never expires a token, so a copied or leaked
token stays valid forever and sign-out only forgot it in the browser.  Tokens
older than TOKEN_TTL are rejected (401) and deleted; login issues a fresh one.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import TokenAuthentication


def token_ttl():
    # read per call so the TTL follows settings (and override_settings in tests)
    return timedelta(days=getattr(settings, 'TOKEN_TTL_DAYS', 14))


def token_expired(token):
    return timezone.now() - token.created > token_ttl()


class ExpiringTokenAuthentication(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token_expired(token):
            token.delete()
            raise exceptions.AuthenticationFailed('Session expired — sign in again.')
        return user, token
