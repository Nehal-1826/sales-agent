"""Self-serve signup + email verification (spec 2026-11-08-saas-billing-design.md).

A signup creates Workspace + owner User + a PENDING Subscription (paywalled,
read-only until payment) in one transaction and returns a token right away.
"""

import logging
import os
import re
import secrets

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.mail import EmailMessage, get_connection
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from billing.models import Plan, Subscription

from .authz import auth_extras
from .models import User, Workspace
from .serializers import UserSerializer
from .tenancy import workspace_context
from .throttles import ResendThrottle, SignupThrottle

log = logging.getLogger(__name__)

VERIFY_SALT = 'shailog.verify-email'
VERIFY_MAX_AGE = 48 * 3600
EMAIL_TAKEN = 'Could not use this email.'
BAD_LINK = 'This verification link is invalid or has expired.'
_CTRL = re.compile('[\x00-\x1f\x7f-\x9f  ]')


def clean_attr(value, limit=200):
    """Attribution strings are shown in the admin console: strip control chars, cap length."""
    if not isinstance(value, str):
        return ''
    return _CTRL.sub('', value).strip()[:limit]


def clean_country(value):
    v = value.strip().upper() if isinstance(value, str) else ''
    return v if re.fullmatch('[A-Z]{2}', v) else ''


def _unique_slug(company):
    base = slugify(company)[:48].strip('-') or 'workspace'
    slug = base
    while Workspace.all_tenants.filter(slug=slug).exists():
        slug = f'{base}-{secrets.token_hex(3)}'
    return slug


def make_token(user):
    return signing.TimestampSigner(salt=VERIFY_SALT).sign_object({'u': user.pk, 'e': user.email})


def read_token(token):
    """User for a valid, unexpired, unused token, else None."""
    try:
        data = signing.TimestampSigner(salt=VERIFY_SALT).unsign_object(token, max_age=VERIFY_MAX_AGE)
        user = User.objects.filter(pk=int(data['u'])).first()
    except (signing.BadSignature, KeyError, TypeError, ValueError):
        return None
    if user is None or user.email_verified_at is not None or user.email != data.get('e'):
        return None
    return user


def send_verification(user):
    """Mail the link through the PLATFORM SMTP (PLATFORM_SMTP_HOST/PORT/USER/PASSWORD/FROM).
    Unconfigured: log the link only in DEBUG, otherwise warn.  Never raises."""
    link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/?verify={make_token(user)}"
    host = os.environ.get('PLATFORM_SMTP_HOST', '').strip()
    if not host:
        if settings.DEBUG:
            log.info('Verification link for %s (PLATFORM_SMTP_HOST not set): %s', user.email, link)
        else:
            log.warning('PLATFORM_SMTP_HOST is not set: verification email for user %s not sent', user.pk)
        return False
    try:
        port = int(os.environ.get('PLATFORM_SMTP_PORT', '587') or 587)
        conn = get_connection(
            backend='django.core.mail.backends.smtp.EmailBackend', host=host, port=port,
            username=os.environ.get('PLATFORM_SMTP_USER', ''),
            password=os.environ.get('PLATFORM_SMTP_PASSWORD', ''),
            use_ssl=port == 465, use_tls=port != 465, timeout=10, fail_silently=False)
        sender = os.environ.get('PLATFORM_SMTP_FROM', '') or os.environ.get('PLATFORM_SMTP_USER', '')
        EmailMessage(
            'Confirm your email for Shailog',
            f'Welcome to Shailog.\n\nConfirm your email address (link valid for 48 hours):\n{link}\n\n'
            'If you did not sign up, ignore this message.',
            sender, [user.email], connection=conn).send()
        return True
    except Exception as exc:  # SMTP down must not fail the signup; log the type only
        log.warning('Verification email failed for user %s: %s', user.pk, type(exc).__name__)
        return False


def _fail(field, *messages):
    return Response({field: list(messages)}, status=400)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AnonRateThrottle, SignupThrottle])
def signup(request):
    d = request.data if hasattr(request.data, 'get') else {}

    def text(k, n=200):
        v = d.get(k)
        return v.strip()[:n] if isinstance(v, str) else ''

    company, name = text('company'), text('name', 150)
    email = text('email', 254).lower()
    password = d.get('password') if isinstance(d.get('password'), str) else ''
    if not company:
        return _fail('company', 'This field is required.')
    if not name:
        return _fail('name', 'This field is required.')
    try:
        validate_email(email)
    except ValidationError:
        return _fail('email', 'Enter a valid email address.')
    # usernames are global: check across ALL workspaces, case-insensitive
    if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
        return _fail('email', EMAIL_TAKEN)
    try:
        validate_password(password, User(username=email, email=email, first_name=name))
    except ValidationError as e:
        return _fail('password', *e.messages)

    plan = Plan.objects.filter(code=text('plan_code', 30), is_active=True).first()
    if plan is None:
        return _fail('plan_code', 'Choose a valid plan.')
    interval = text('interval', 10) or 'month'
    if interval not in Subscription.Intervals.values:
        return _fail('interval', 'Choose month or year.')
    country = clean_country(d.get('country'))
    currency = text('currency', 3).upper()
    if currency not in Subscription.Currencies.values:
        currency = 'INR' if country == 'IN' else 'USD'

    try:
        with transaction.atomic():
            ws = Workspace.all_tenants.create(
                name=company, slug=_unique_slug(company), country=country, billing_email=email,
                signup_source=clean_attr(d.get('utm_source')),
                signup_campaign=clean_attr(d.get('utm_campaign')),
                signup_referrer=clean_attr(d.get('referrer')))
            user = User.objects.create_user(username=email, email=email, password=password,
                                            first_name=name, role=User.Roles.OWNER, workspace=ws)
            with workspace_context(ws):
                # NOT ensure_manual_subscription: self-serve starts pending, awaiting payment
                Subscription.objects.create(
                    workspace=ws, plan=plan, interval=interval, currency=currency,
                    gateway=Subscription.Gateways.MANUAL, status=Subscription.Statuses.PENDING,
                    billing_email=email)
            token = Token.objects.create(user=user)
    except IntegrityError:  # lost a race on the global username
        return _fail('email', EMAIL_TAKEN)

    send_verification(user)
    return Response({'token': token.key, 'user': {**UserSerializer(user).data, **auth_extras(user, request)}},
                    status=201)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email(request):
    token = request.data.get('token') if hasattr(request.data, 'get') else None
    user = read_token(token) if isinstance(token, str) else None
    if user is None:
        return Response({'detail': BAD_LINK}, status=400)
    # single-use under a row lock: two clicks cannot both pass
    with transaction.atomic():
        locked = User.objects.select_for_update().get(pk=user.pk)
        if locked.email_verified_at is not None:
            return Response({'detail': BAD_LINK}, status=400)
        locked.email_verified_at = timezone.now()
        locked.save(update_fields=['email_verified_at'])
    return Response({'detail': 'email verified'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])   # not paywalled: unpaid users must be able to verify
@throttle_classes([ResendThrottle])
def resend_verification(request):
    if request.user.email_verified_at is not None:
        return Response({'detail': 'already verified'})
    if not request.user.email:
        return Response({'detail': 'no email on this account'}, status=400)
    send_verification(request.user)
    return Response({'detail': 'sent'})
