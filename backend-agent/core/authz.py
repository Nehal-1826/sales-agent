"""Platform-admin + 2FA helpers shared by auth/me, tenant views, and the platform API."""

from datetime import timedelta

from django.utils import timezone
from rest_framework import exceptions
from rest_framework.response import Response

OTP_TTL = timedelta(hours=12)

MAX_TOTP_DEVICES = 3

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


def user_totp_secrets(user):
    """Active TOTP secrets: the primary (if set) + every confirmed device's.
    A pending device's secret is NEVER included — it must be confirmed first."""
    secrets = [user.totp_secret] if user.totp_secret else []
    secrets += [d.secret for d in user.totp_devices.filter(confirmed=True)]
    return secrets


def user_2fa_active(user):
    """2FA is on when the primary secret is set OR any device is confirmed."""
    return bool(user.totp_secret) or user.totp_devices.filter(confirmed=True).exists()


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
    if user_2fa_active(user) and not token_otp_satisfied(request):
        raise exceptions.PermissionDenied('OTP required')


def auth_extras(user, request=None):
    admin = is_platform_admin(user)
    enrolled = user_2fa_active(user)
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


def check_totp_any(request):
    """check_totp_code across EVERY active secret (primary + confirmed devices):
    same lockout gate, one failure per attempt (never per secret), and the
    replay guard applied to all secrets.  Returns (step, None) or (None, error)."""
    from . import lockout, totp
    from .models import PlatformSession

    user = request.user
    lock_key = f'otp:{user.pk}'
    if lockout.is_locked(lock_key, ''):
        return None, Response({'error': 'too_many_attempts'}, status=429)
    code = request.data.get('code') if hasattr(request.data, 'get') else ''
    last = max([ps.last_otp_step for ps in PlatformSession.objects.filter(token__user=user)] or [0])
    for secret in user_totp_secrets(user):
        step = totp.match_step(secret, code if isinstance(code, str) else '', last_step=last)
        if step is not None:
            lockout.clear(lock_key, '')
            if secret != user.totp_secret:   # a confirmed device matched → stamp it
                device = user.totp_devices.filter(confirmed=True, secret=secret).first()
                if device:
                    device.last_used_at = timezone.now()
                    device.save(update_fields=['last_used_at'])
            return step, None
    lockout.record_failure(lock_key, '')
    return None, Response({'error': 'invalid_code', 'detail': 'Invalid or expired code.'}, status=400)


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
    if not user_2fa_active(u):
        return _err('not_enrolled', not_enrolled_detail, 409)
    step, err = check_totp_any(request)
    if err:
        return err
    mark_otp_verified(request, step)
    return Response({'verified': True})


def handle_2fa_disable(request, on_done=None):
    u = request.user
    if not user_2fa_active(u):
        return _err('not_enrolled', 'Two-factor is not enabled.')
    step, err = check_totp_any(request)   # any device's code can authorize disable
    if err:
        return err
    u.totp_secret, u.totp_pending = '', ''
    u.save(update_fields=['totp_secret', 'totp_pending'])
    u.totp_devices.all().delete()
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


def _devices_remaining(u):
    return MAX_TOTP_DEVICES - u.totp_devices.count() - (1 if u.totp_secret else 0)


def handle_2fa_devices(request):
    u = request.user
    devices = list(u.totp_devices.all())
    return Response({'primary': bool(u.totp_secret),
                     'remaining': _devices_remaining(u),
                     'devices': [{'id': d.id, 'name': d.name, 'confirmed': d.confirmed,
                                  'created_at': d.created_at, 'last_used_at': d.last_used_at}
                                 for d in devices]})


def handle_2fa_device_add(request):
    from . import totp
    u = request.user
    name = request.data.get('name') if hasattr(request.data, 'get') else ''
    name = name.strip() if isinstance(name, str) else ''
    if not (1 <= len(name) <= 60):
        return _err('invalid_name', 'Give the device a name.')
    if u.totp_devices.filter(confirmed=False).exists():
        return _err('pending_exists', 'Confirm or remove the pending device first.')
    if _devices_remaining(u) <= 0:
        return _err('limit_reached', 'Device limit reached — remove one first (max 3).')
    device = u.totp_devices.create(name=name, secret=totp.new_secret(), confirmed=False)
    # QR only: the raw secret is never sent to the client
    return Response({'id': device.id, 'name': device.name,
                     'otpauth_uri': totp.otpauth_uri(device.secret, u.email or u.username)},
                    status=201)


def handle_2fa_device_confirm(request, device_id):
    u = request.user
    device = u.totp_devices.filter(id=device_id, confirmed=False).first()
    if not device:
        return Response(status=404)
    step, err = check_totp_code(request, device.secret)
    if err:
        return err
    device.confirmed = True
    device.save(update_fields=['confirmed'])
    mark_otp_verified(request, step)
    return Response({'ok': True})


def handle_2fa_device_remove(request, device_id):
    u = request.user
    device = u.totp_devices.filter(id=device_id).first()
    if not device:
        return Response(status=404)
    # pending devices are not a method — only a CONFIRMED one can be "the last"
    if device.confirmed and not (u.totp_secret
                                 or u.totp_devices.exclude(pk=device.pk).filter(confirmed=True).exists()):
        return _err('last_method', 'Add another device before removing the last one.')
    device.delete()
    return Response(status=204)
