from datetime import timedelta

from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from core import totp
from core.models import PlatformSession, User

SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'   # base32("12345678901234567890")

READ_ROUTES = ['overview/', 'marketing/', 'tenants/', 'tenants/1/', 'payments/', 'invoices/',
               'invoices/1/', 'plans/', 'audit/']
WRITE_ROUTES = ['2fa/setup/', '2fa/confirm/', '2fa/verify/', 'tenants/1/suspend/', 'tenants/1/unsuspend/',
                'tenants/1/extend/', 'tenants/1/change_plan/', 'payments/1/refund/']


def make_admin(username='root', verified=True, enrolled=True):
    u = User.objects.create_user(username=username, password='pass12345-x', email=f'{username}@shailog.test',
                                 is_staff=True)
    assert u.workspace_id is None
    if enrolled:
        u.totp_secret = SECRET
        u.save(update_fields=['totp_secret'])
    tok = Token.objects.create(user=u)
    if verified:
        PlatformSession.objects.create(token=tok, otp_verified_at=timezone.now())
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Token {tok.key}')
    return c, u, tok


def code_now(offset=0):
    return totp.hotp(SECRET, totp.current_step() + offset)
