"""Google sign-in via FIREBASE Authentication (owner choice — popup flow).

The frontend signs in with the Firebase SDK (signInWithPopup) and posts the
resulting Firebase ID token here.  We verify it SERVER-SIDE with PyJWT
against Google's public x509 certificates — no firebase-admin dependency:

  * signature  — the cert named by the JWT `kid` header
  * issuer     — https://securetoken.google.com/<FIREBASE_PROJECT_ID>
  * audience   — FIREBASE_PROJECT_ID
  * claims     — email + firebase.email_verified

Then the same rules as a password login on this door:
  * unknown email   → 400 not_found   (accounts are created by the owner)
  * platform admin  → 403 admin_only  (admins sign in via /<slug>/login)
  * workspace user  → a fresh DRF token (PlatformSession purged)

Dormant until FIREBASE_PROJECT_ID is set in the env.
"""

import logging
from datetime import timedelta

import jwt
import requests
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token

from .authz import auth_extras, note_sign_in
from .models import PlatformSession, User
from .serializers import UserSerializer

log = logging.getLogger(__name__)

CERT_URL = ('https://www.googleapis.com/robot/v1/metadata/x509/'
            'securetoken@system.gserviceaccount.com')
CERT_TTL = 3600  # Google rotates the signing certs; refresh hourly

NOT_FOUND_DETAIL = ('No account exists for that Google email — ask the '
                    'workspace owner to create one, then try again.')
ADMIN_ONLY_DETAIL = ('That account is a platform admin — sign in from the '
                     'admin login page instead.')


def _project_id():
    import os
    return (os.environ.get('FIREBASE_PROJECT_ID') or '').strip()


def _certs():
    """Google's Firebase signing certs (kid → PEM), cached an hour."""
    cached = cache.get('firebase-oauth:certs')
    if cached is not None:
        return cached
    resp = requests.get(CERT_URL, timeout=15)
    resp.raise_for_status()
    certs = resp.json()
    cache.set('firebase-oauth:certs', certs, CERT_TTL)
    return certs


def _verify_id_token(token, project_id):
    """Firebase ID token → claims dict, or None when it fails any check."""
    try:
        header = jwt.get_unverified_header(token)
        cert = _certs().get(header.get('kid', ''))
        if not cert:
            return None
        return jwt.decode(
            token, cert, algorithms=['RS256'],
            audience=project_id,
            issuer=f'https://securetoken.google.com/{project_id}',
        )
    except Exception as exc:  # bad signature, expiry, wrong aud/iss, junk
        log.info('Firebase ID token rejected: %s', type(exc).__name__)
        return None


@api_view(['POST'])
@permission_classes([AllowAny])
def google_verify(request):
    """{idToken} (Firebase) → {token, user} for an EXISTING workspace user."""
    project_id = _project_id()
    if not project_id:
        return Response({'detail': 'Google sign-in is not configured on this server.'},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    token = request.data.get('idToken') if hasattr(request.data, 'get') else ''
    claims = _verify_id_token(token if isinstance(token, str) else '', project_id)
    if claims is None:
        return Response({'detail': 'Google sign-in failed — please try again.'},
                        status=status.HTTP_400_BAD_REQUEST)

    email = (claims.get('email') or '').strip().lower()
    verified = claims.get('email_verified', False)
    if not email or not verified:
        return Response({'detail': 'That Google email is not verified.'},
                        status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        return Response({'detail': NOT_FOUND_DETAIL}, status=status.HTTP_400_BAD_REQUEST)
    if user.is_staff and user.workspace_id is None:
        # two-door rule: platform admins never get a token on this door
        return Response({'detail': ADMIN_ONLY_DETAIL}, status=status.HTTP_403_FORBIDDEN)

    drf_token, _ = Token.objects.get_or_create(user=user)
    PlatformSession.objects.filter(token=drf_token).delete()  # fresh OTP gate
    note_sign_in(user)
    return Response({'token': drf_token.key,
                     'user': {**UserSerializer(user).data, **auth_extras(user, request)}})
