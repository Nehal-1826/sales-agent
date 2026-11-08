"""DRF exception handler: a tenant query without a workspace is a 403."""

from rest_framework.response import Response
from rest_framework.views import exception_handler

from billing.entitlements import BillingError

from .tenancy import TenantContextMissing


def api_exception_handler(exc, context):
    if isinstance(exc, TenantContextMissing):
        # only a platform operator (superuser without a workspace) gets here
        # through an authenticated request; they manage tenants in /admin
        return Response({'detail': 'Platform operators use the admin console.'}, status=403)
    if isinstance(exc, BillingError):
        # plan quota / unpaid workspace: 402 with a machine-readable body
        return Response(exc.payload, status=402)
    return exception_handler(exc, context)
