"""Platform-admin helpers shared by auth/me and the platform API."""


def is_platform_admin(user):
    """Platform operator: authenticated, no workspace, staff, active (superusers count)."""
    return bool(user and user.is_authenticated and user.workspace_id is None
                and user.is_staff and user.is_active)


def otp_satisfied(request):
    """Has this request's token session passed TOTP?  HOOK: build-order step 4
    replaces this with the PlatformSession lookup (12h).  Until then platform
    admins are never satisfied, so otp_required stays True for them."""
    return False


def auth_extras(user, request=None):
    admin = is_platform_admin(user)
    return {'email_verified': user.email_verified_at is not None,
            'platform_admin': admin,
            'otp_required': admin and not otp_satisfied(request)}
