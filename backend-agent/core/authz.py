"""Platform-admin helpers shared by auth/me and the platform API."""

from datetime import timedelta

from django.utils import timezone

OTP_TTL = timedelta(hours=12)


def is_platform_admin(user):
    """Platform operator: authenticated, no workspace, staff, active (superusers count)."""
    return bool(user and user.is_authenticated and user.workspace_id is None
                and user.is_staff and user.is_active)


def otp_satisfied(request, now=None):
    """Platform admin whose token session passed TOTP within the last 12 h."""
    user = getattr(request, 'user', None)
    token = getattr(request, 'auth', None)
    if request is None or not is_platform_admin(user) or getattr(token, 'pk', None) is None:
        return False
    from .models import PlatformSession
    ps = PlatformSession.objects.filter(token=token).first()
    return bool(ps and ps.otp_verified_at and (now or timezone.now()) - ps.otp_verified_at <= OTP_TTL)


def auth_extras(user, request=None):
    admin = is_platform_admin(user)
    return {'email_verified': user.email_verified_at is not None,
            'platform_admin': admin,
            'otp_required': admin and not otp_satisfied(request)}
