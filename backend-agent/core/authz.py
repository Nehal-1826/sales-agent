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


def note_sign_in(user):
    """Remember that this account just signed in — the console's Users page
    shows when each account was last in. Called wherever a session starts
    (both login doors, sign-up, Google); never for "Enter as user", where the
    person did not sign in. A plain UPDATE: save() would write back fields
    that need no writing."""
    from .models import User
    User.objects.filter(pk=user.pk).update(last_login=timezone.now())


def user_2fa_active(user):
    """2FA is on when the account's one authenticator is set up.

    One authenticator per account (owner's order, 2026-11-25): the extra
    devices of migration 0038 are gone."""
    return bool(user.totp_secret)


def token_otp_satisfied(request, now=None):
    """Authenticated user whose session passed the second check within the
    last 12 h. Inside "Enter as user" the platform admin's own authority
    stands in for the person's code: the admin is recorded, the person's
    two-factor is not asked (and cannot be changed inside the tab)."""
    if getattr(request, 'impersonation', None) is not None:
        return True
    user = getattr(request, 'user', None)
    token = getattr(request, 'auth', None)
    if (request is None or not (user and user.is_authenticated and user.is_active)
            or getattr(token, 'pk', None) is None):
        return False
    from .models import PlatformSession
    ps = PlatformSession.objects.filter(token=token).first()
    return bool(ps and ps.otp_verified_at and (now or timezone.now()) - ps.otp_verified_at <= OTP_TTL)


def otp_satisfied(request, now=None):
    """Platform admin who has passed the second check.

    The second check is a code from the account's authenticator when it has
    two-factor, and the password itself when it does not: two-factor is the
    admin's own choice (owner's order, 2026-11-25 — it used to be forced). An
    account without it is protected by its password alone, and this is the one
    place that says so: every platform gate and the warmup bridge token read
    it from here."""
    user = getattr(request, 'user', None)
    if not is_platform_admin(user):
        return False
    if not user_2fa_active(user):
        return True
    return token_otp_satisfied(request, now=now)


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
    """/api/auth/me/ fields (and the sign-in answer) for THIS user. The
    second check is only asked of an account that has two-factor — for anyone
    else it was passed with the password."""
    admin = is_platform_admin(user)
    enrolled = user_2fa_active(user)
    return {'email_verified': user.email_verified_at is not None,
            'platform_admin': admin,
            'totp_enabled': enrolled,
            # at sign-in request.user is still anonymous, so this is decided
            # for `user`: a new session of an enrolled account always needs the code
            'otp_required': enrolled and not token_otp_satisfied(request)}


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


def check_own_code(request):
    """Validate a code from the signed-in user's one authenticator, with the
    per-user lockout and the replay guard (a step already used by any of this
    user's sessions never matches again), and stamp where it was used from.
    Returns (step, None) or (None, error Response)."""
    from . import lockout, totp
    from .models import PlatformSession, User

    user = request.user
    lock_key = f'otp:{user.pk}'
    if lockout.is_locked(lock_key, ''):
        return None, Response({'error': 'too_many_attempts'}, status=429)
    code = request.data.get('code') if hasattr(request.data, 'get') else ''
    if not user.totp_secret:
        return None, Response({'error': 'invalid_code', 'detail': 'Invalid or expired code.'}, status=400)
    last = max([ps.last_otp_step for ps in PlatformSession.objects.filter(token__user=user)] or [0])
    step = totp.match_step(user.totp_secret, code if isinstance(code, str) else '', last_step=last)
    if step is None:
        lockout.record_failure(lock_key, '')
        return None, Response({'error': 'invalid_code', 'detail': 'Invalid or expired code.'}, status=400)
    lockout.clear(lock_key, '')
    ip = _client_ip(request)
    if ip and ip != user.totp_last_used_ip:
        user.totp_last_used_ip = ip
        User.objects.filter(pk=user.pk).update(totp_last_used_ip=ip)
    return step, None


def _client_ip(request):
    """Client IP behind the Cloudflare/nginx proxies (XFF first hop)."""
    from . import lockout
    try:
        return (lockout.client_ip(request) or '')[:45]
    except Exception:
        return ''


def _ua_device(ua):
    """User-Agent → short 'browser · os' device string for the security trail."""
    ua = (ua or '')[:300]
    if not ua:
        return ''
    os_ = ('Android' if 'Android' in ua else
           'iOS' if 'iPhone' in ua or 'iPad' in ua else
           'Windows' if 'Windows' in ua else
           'macOS' if 'Mac OS X' in ua or 'Macintosh' in ua else
           'Linux' if 'Linux' in ua or 'X11' in ua else '')
    browser = ('Edge' if 'Edg/' in ua or 'Edge/' in ua else
               'Opera' if 'OPR/' in ua or 'Opera' in ua else
               'Chrome' if 'Chrome/' in ua else
               'Firefox' if 'Firefox/' in ua else
               'Safari' if 'Safari' in ua else '')
    return ' · '.join(p for p in (browser, os_) if p) or 'Unknown device'


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


def _stamp_primary_enrollment(request, u):
    """Record WHERE the primary authenticator was (re-)enrolled from."""
    u.totp_added_at = timezone.now()
    u.totp_added_ip = _client_ip(request)
    u.totp_added_user_agent = (request.META.get('HTTP_USER_AGENT', '') or '')[:300]


def handle_2fa_status(request):
    """Whether 2FA is on, and the trail of the account's one authenticator:
    where and from what it was set up, and where its code was last used.
    `enrolled_at` is None when there is no trail (2FA off, or set up before
    the trail existed)."""
    u = request.user
    trail = bool(u.totp_secret and u.totp_added_at)
    return Response({
        'enabled': bool(u.totp_secret),
        'enrolled_at': u.totp_added_at.isoformat() if trail else None,
        'enrolled_ip': (u.totp_added_ip or '') if trail else '',
        'enrolled_device': _ua_device(u.totp_added_user_agent) if trail else '',
        'last_used_ip': (u.totp_last_used_ip or '') if trail else '',
    })


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
    _stamp_primary_enrollment(request, u)
    u.save(update_fields=['totp_secret', 'totp_pending',
                          'totp_added_at', 'totp_added_ip', 'totp_added_user_agent'])
    mark_otp_verified(request, step)
    if on_done:
        on_done()
    return Response({'enabled': True, 'enrolled': True, 'verified': True})


def handle_2fa_verify(request, not_enrolled_detail='Two-factor is not enabled.'):
    u = request.user
    if not user_2fa_active(u):
        return _err('not_enrolled', not_enrolled_detail, 409)
    step, err = check_own_code(request)
    if err:
        return err
    mark_otp_verified(request, step)
    return Response({'verified': True})


def handle_2fa_disable(request, on_done=None):
    u = request.user
    if not user_2fa_active(u):
        return _err('not_enrolled', 'Two-factor is not enabled.')
    step, err = check_own_code(request)   # the account's own code authorises this
    if err:
        return err
    u.totp_secret, u.totp_pending = '', ''
    u.totp_added_at, u.totp_added_ip = None, ''
    u.totp_added_user_agent, u.totp_last_used_ip = '', ''
    u.save(update_fields=['totp_secret', 'totp_pending', 'totp_added_at',
                          'totp_added_ip', 'totp_added_user_agent', 'totp_last_used_ip'])
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
    _stamp_primary_enrollment(request, u)   # re-enroll → fresh enrollment trail
    u.save(update_fields=['totp_secret', 'totp_pending',
                          'totp_added_at', 'totp_added_ip', 'totp_added_user_agent'])
    mark_otp_verified(request, step)
    if on_done:
        on_done()
    return Response({'enabled': True, 'verified': True})
