"""Scoped throttles for the open auth endpoints (rates live in
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'])."""

from rest_framework.throttling import SimpleRateThrottle, BaseThrottle


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


class OtpThrottle(SimpleRateThrottle):
    """2fa confirm/verify: per signed-in user (scope 'otp')."""
    scope = 'otp'

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class CompanyScrapeThrottle(_IpScope):
    """POST /api/company/scrape — the limit is per-IP.  The rate lives on the
    class on purpose: the endpoint owns its own limit and
    DEFAULT_THROTTLE_RATES stays as is."""
    scope = 'company_scrape'
    THROTTLE_RATES = {**SimpleRateThrottle.THROTTLE_RATES, 'company_scrape': '10/min'}


class CompanyInferThrottle(SimpleRateThrottle):
    """POST /api/company/infer — one call is a minute of the shared local
    model, so the limit is tight and per signed-in user."""
    scope = 'company_infer'
    THROTTLE_RATES = {**SimpleRateThrottle.THROTTLE_RATES, 'company_infer': '5/min'}

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {'scope': self.scope, 'ident': ident}


class AdminSlugThrottle(SimpleRateThrottle):
    """admin slug check: 5/min per IP (prevents probing + email bombing)."""
    scope = 'admin-slug'
    rate = '5/min'

    def get_cache_key(self, request, view):
        ident = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or \
                request.META.get('REMOTE_ADDR', 'unknown')
        return self.cache_format % {'scope': self.scope, 'ident': ident}
