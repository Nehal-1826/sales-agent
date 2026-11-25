"""Request-scoped tenant context hygiene, and the door "enter as user" never opens."""

from django.http import JsonResponse

from . import impersonation
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


class ImpersonationRefusalMiddleware:
    """"Enter as user": a request signed with a ticket never reaches the paths
    core.impersonation refuses — whatever sits behind them.

    core.authentication.ImpersonationAuthentication refuses them too, but it
    only runs once an address has resolved to a view that asks it. This runs
    for every request, before the router: an address with nothing behind it is
    refused all the same (a 404 would tell what is there)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        scheme = request.META.get('HTTP_AUTHORIZATION', '').partition(' ')[0].lower()
        if scheme == 'impersonation' and impersonation.is_refused(request.path_info):
            return JsonResponse({'detail': impersonation.REFUSED_DETAIL}, status=403)
        return self.get_response(request)
