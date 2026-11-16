"""Request-scoped tenant context hygiene."""

from .tenancy import reset_workspace, set_workspace


class TenantContextMiddleware:
    """Guarantee no workspace leaks between requests or pooled threads.

    The workspace is bound later, by the DRF authenticators, from the signed-in
    user.  Here it is forced to None on entry (so a context left behind by
    anything earlier on this thread can never serve this request) and restored
    in a finally so it is cleared even when the view raises."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = set_workspace(None)
        try:
            return self.get_response(request)
        finally:
            reset_workspace(token)
