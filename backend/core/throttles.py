"""Scoped throttles for the open auth endpoints (rates live in
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])."""

from rest_framework.throttling import SimpleRateThrottle


class _IpScope(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class LoginThrottle(_IpScope):
    scope = 'login'


class SignupThrottle(_IpScope):
    scope = 'signup'


class ResendThrottle(SimpleRateThrottle):
    """Per signed-in user (resend_verification is authenticated)."""
    scope = 'resend'

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}
