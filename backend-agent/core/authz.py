"""Platform-admin + 2FA helpers shared by auth/me, tenant views, and the platform API."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import exceptions
from rest_framework.response import Response

OTP_TTL = timedelta(hours=12)

OTP_EXEMPT_PATHS = (
    '/api/auth/me/',
    '/api/auth/logout/',
    '/api/auth/2fa/verify/',
    '/api/platform/2fa/setup/',
    '/api/platform/2fa/confirm/',
    '/api/platform/2fa/verify/',
)


def is_platform_admin(user):
    """Platform operator: authenticated, no workspace, staff, active (superusers count)."""
    return bool(user and user.is_authenticated and user.workspace_id is None
                and user.is_staff and user.is_active)


def token_otp_satisfied(request, now=None):
    """Authenticated user whose DRF token session passed TOTP within the last 12 h."""
    user = getattr(request, 'user', None)
    token = getattr(request, 'auth', None)
    if (request is None or not (user and user.is_authenticated and user.is_active)
            or getattr(token, 'pk', None) is None):
        return False
    from .models import PlatformSession
    ps = PlatformSession.objects.filter(token=token).first()
    return bool(ps and ps.otp_verified_at and (now or timezone.now()) - ps.otp_verified_at <= OTP_TTL)


def otp_satisfied(request, now=None):
    """Platform admin whose token session passed TOTP within the last 12 h."""
    user = getattr(request, 'user', None)
    return is_platform_admin(user) and token_otp_satisfied(request, now=now)


def enforce_otp(request):
    """Block an OTP-enrolled user's token until 2FA verification completes."""
    user = getattr(request, 'user', None)
    if not (user and user.is_authenticated):
        return
    if getattr(request, 'path', '') in OTP_EXEMPT_PATHS:
        return
    if bool(getattr(user, 'totp_secret', '')) and not token_otp_satisfied(request):
        raise exceptions.PermissionDenied('OTP required')


def auth_extras(user, request=None):
    admin = is_platform_admin(user)
    enrolled = bool(user.totp_secret)
    otp_required = (not otp_satisfied(request)) if admin else (enrolled and not token_otp_satisfied(request))
    return {'email_verified': user.email_verified_at is not None,
            'platform_admin': admin,
            'totp_enabled': enrolled,
            'otp_required': otp_required}


def check_totp_code(request, secret):
    """Validate 6-digit TOTP code with per-user lockout and replay guard.
    Returns (step, None) or (None, error Response)."""
    from . import lockout, totp
    from .models import PlatformSession

    user = request.user
    lock_key = f'otp:{user.pk}'
    if lockout.is_locked(lock_key, ''):
        return None, Response({'error': 'too_many_attempts'}, status=429)
    code = request.data.get('code') if hasattr(request.data, 'get') else ''
    last = 0
    if secret == user.totp_secret:   # replay guard across all of this user's sessions
        last = max([ps.last_otp_step for ps in PlatformSession.objects.filter(token__user=user)] or [0])
    step = totp.match_step(secret, code if isinstance(code, str) else '', last_step=last)
    if step is None:
        lockout.record_failure(lock_key, '')
        return None, Response({'error': 'invalid_code', 'detail': 'Invalid or expired code.'}, status=400)
    lockout.clear(lock_key, '')
    return step, None


def mark_otp_verified(request, step, keep_verified_at=False):
    """Persist OTP verification timestamp / anti-replay step on the token session."""
    token = getattr(request, 'auth', None)
    if getattr(token, 'pk', None) is None:
        return
    from .models import PlatformSession
    if keep_verified_at:
        ps = PlatformSession.objects.filter(token=token).first()
        if ps:
            ps.last_otp_step = step
            ps.save(update_fields=['last_otp_step'])
        return
    PlatformSession.objects.update_or_create(
        token=token, defaults={'otp_verified_at': timezone.now(), 'last_otp_step': step})


# ── shared 2FA action handlers (used by both /api/auth/2fa/* and /api/platform/2fa/*) ──

def _err(code, detail, status=400):
    return Response({'error': code, 'detail': detail}, status=status)


def handle_2fa_status(request):
    return Response({'enabled': bool(request.user.totp_secret)})


def handle_2fa_setup(request, already_detail='Two-factor is already enabled.'):
    from . import totp
    u = request.user
    if u.totp_secret:
        return _err('already_enrolled', already_detail, 409)
    u.totp_pending = totp.new_secret()
    u.save(update_fields=['totp_pending'])
    return Response({'secret': u.totp_pending,
                     'otpauth_uri': totp.otpauth_uri(u.totp_pending, u.email or u.username)})


def handle_2fa_confirm(request, already_detail='Two-factor is already enabled.', on_done=None):
    u = request.user
    if u.totp_secret:
        return _err('already_enrolled', already_detail, 409)
    if not u.totp_pending:
        return _err('not_started', 'Start setup first.')
    step, err = check_totp_code(request, u.totp_pending)
    if err:
        return err
    u.totp_secret, u.totp_pending = u.totp_pending, ''
    u.save(update_fields=['totp_secret', 'totp_pending'])
    mark_otp_verified(request, step)
    if on_done:
        on_done()
    return Response({'enabled': True, 'enrolled': True, 'verified': True})


def handle_2fa_verify(request, not_enrolled_detail='Two-factor is not enabled.'):
    u = request.user
    if not u.totp_secret:
        return _err('not_enrolled', not_enrolled_detail, 409)
    step, err = check_totp_code(request, u.totp_secret)
    if err:
        return err
    mark_otp_verified(request, step)
    return Response({'verified': True})


def handle_2fa_disable(request, on_done=None):
    u = request.user
    if not u.totp_secret:
        return _err('not_enrolled', 'Two-factor is not enabled.')
    step, err = check_totp_code(request, u.totp_secret)
    if err:
        return err
    u.totp_secret, u.totp_pending = '', ''
    u.save(update_fields=['totp_secret', 'totp_pending'])
    mark_otp_verified(request, step, keep_verified_at=True)
    if on_done:
        on_done()
    return Response({'enabled': False})


def handle_2fa_rotate_start(request):
    from . import totp
    u = request.user
    if not u.totp_secret:
        return _err('not_enrolled', 'Two-factor is not enabled.')
    step, err = check_totp_code(request, u.totp_secret)
    if err:
        return err
    mark_otp_verified(request, step, keep_verified_at=True)
    u.totp_pending = totp.new_secret()
    u.save(update_fields=['totp_pending'])
    return Response({'secret': u.totp_pending,
                     'otpauth_uri': totp.otpauth_uri(u.totp_pending, u.email or u.username)})


def handle_2fa_rotate_confirm(request, on_done=None):
    u = request.user
    if not u.totp_secret:
        return _err('not_enrolled', 'Two-factor is not enabled.')
    if not u.totp_pending:
        return _err('not_started', 'Verify your current code first.')
    step, err = check_totp_code(request, u.totp_pending)
    if err:
        return err
    u.totp_secret, u.totp_pending = u.totp_pending, ''
    u.save(update_fields=['totp_secret', 'totp_pending'])
    mark_otp_verified(request, step)
    if on_done:
        on_done()
    return Response({'enabled': True, 'verified': True})
