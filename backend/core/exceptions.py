"""DRF exception handler: a tenant query without a workspace is a 403."""

from rest_framework.response import Response
from rest_framework.views import exception_handler

from .tenancy import TenantContextMissing


def api_exception_handler(exc, context):
    if isinstance(exc, TenantContextMissing):
        # only a platform operator (superuser without a workspace) gets here
        # through an authenticated request; they manage tenants in /admin
        return Response({'detail': 'Platform operators use the admin console.'}, status=403)
    return exception_handler(exc, context)
