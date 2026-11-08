"""Global paywall.  Tenant users may always READ (they must still see their data
and the billing page); every write needs paid access.  Platform operators
(workspace None) are unaffected; exempt prefixes carry auth, billing, webhooks,
health and the public unsubscribe."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from .entitlements import has_paid_access, PaymentRequired

EXEMPT_PREFIXES = (
    '/api/auth/', '/api/billing/', '/api/health/', '/api/unsubscribe/',
    '/api/webhooks/', '/api/platform/',
)


def enforce_paywall(request):
    """Raise PaymentRequired for an unpaid tenant write; otherwise return."""
    if request.method in SAFE_METHODS:
        return
    path = getattr(request, 'path', '') or ''
    if path.startswith(EXEMPT_PREFIXES):
        return
    user = getattr(request, 'user', None)
    if not (user and user.is_authenticated):
        return   # IsAuthenticated / the view's own permission decides
    ws = getattr(user, 'workspace', None)
    if ws is None:
        return   # platform operator
    if not has_paid_access(ws):
        raise PaymentRequired()


class HasPaidAccess(BasePermission):
    def has_permission(self, request, view):
        enforce_paywall(request)
        return True
