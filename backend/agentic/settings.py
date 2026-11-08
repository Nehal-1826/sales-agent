"""
Django settings for the Marketing & Sales Agentic AI backend.

Architecture (from the design notes):
  PYTHON → DJANGO → DATA SCHEMA → JSON → DB (POSTGRESQL) → API ENDPOINTS
         → CORS → USERS / ROLES

Database: PostgreSQL via DATABASE_URL (dj-database-url).
For quick local smoke tests without Postgres you can run with
DATABASE_URL=sqlite:///db.sqlite3 — everything else is identical.
"""

import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'

# API tokens expire; login issues a fresh one (core.authentication)
TOKEN_TTL_DAYS = int(os.environ.get('TOKEN_TTL_DAYS', '14'))

if not DEBUG:
    # fail fast in production instead of silently running insecure defaults
    if not os.environ.get('DJANGO_SECRET_KEY'):
        raise ImproperlyConfigured('DJANGO_SECRET_KEY is required when DJANGO_DEBUG=0')
    if not os.environ.get('ALLOWED_HOSTS'):
        raise ImproperlyConfigured('ALLOWED_HOSTS is required when DJANGO_DEBUG=0')

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'dev-only-insecure-key-change-me',
)

# Comma-separated list via env on a VPS: ALLOWED_HOSTS=example.com,www.example.com
ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', '*').split(',') if h.strip()]

# Where collectstatic puts production assets (served by WhiteNoise).
STATIC_ROOT = BASE_DIR / 'staticfiles'

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # third-party
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    # local
    'core',
    'billing',
]

MIDDLEWARE = [
    'core.middleware.TenantContextMiddleware',  # first: clears the tenant context around every request
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # serves /static/ in production
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'agentic.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'agentic.wsgi.application'

# ------------------------------------------------------------------
# Database — PostgreSQL by default
# ------------------------------------------------------------------

DATABASES = {
    'default': dj_database_url.config(
        default='sqlite:///db.sqlite3',
        conn_max_age=60,
    )
}

# ------------------------------------------------------------------
# Users / roles
# ------------------------------------------------------------------

AUTH_USER_MODEL = 'core.User'

# ------------------------------------------------------------------
# REST API
# ------------------------------------------------------------------

# Reverse proxies in front of Django (Cloudflare tunnel = 1).  0 = trust only
# REMOTE_ADDR; N>0 = the client is the Nth-from-right X-Forwarded-For entry.
TRUSTED_PROXY_COUNT = int(os.environ.get('TRUSTED_PROXY_COUNT', '0') or 0)

# Self-serve passwords (signup + change_password; create_user() skips these)
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 10}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Under `manage.py test` the generic throttles would make suites order-dependent;
# throttle tests patch the rates they exercise.
import sys as _sys0  # noqa: E402
_TEST_RATES = ({'anon': '100000/min', 'user': '100000/min', 'login': '100000/min',
                'signup': '100000/hour', 'resend': '100000/hour',
                'billing': '100000/min', 'webhook': '100000/min'}
               if len(_sys0.argv) > 1 and _sys0.argv[1] == 'test' else {})

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'core.authentication.ExpiringTokenAuthentication',
        'core.authentication.TenantSessionAuthentication',
    ],
    'EXCEPTION_HANDLER': 'core.exceptions.api_exception_handler',
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
        'billing.permissions.HasPaidAccess',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/min', 'user': '600/min',
        'login': '10/min', 'signup': '5/hour', 'resend': '3/hour',
        'billing': '30/min', 'webhook': '600/min',
        **_TEST_RATES,
    },
    # DRF trusts the whole X-Forwarded-For header unless NUM_PROXIES is set
    'NUM_PROXIES': TRUSTED_PROXY_COUNT,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
}

# CORS — the Vite dev frontend by default; add your VPS domain(s) via env:
# CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
] + [o.strip() for o in os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True

# Django admin login behind HTTPS needs explicit trusted origins:
# CSRF_TRUSTED_ORIGINS=https://yourdomain.com
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.environ.get('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()]

# Public origin used for absolute links in outgoing email (unsubscribe).
# PUBLIC_BASE_URL=https://yourdomain.com — falls back to the first trusted origin.
PUBLIC_BASE_URL = (os.environ.get('PUBLIC_BASE_URL', '').strip()
                   or (CSRF_TRUSTED_ORIGINS[0] if CSRF_TRUSTED_ORIGINS else 'http://127.0.0.1:8000'))

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ------------------------------------------------------------------
# Production hardening (DEBUG=0) — TLS terminates at Caddy/nginx, so
# SSL redirect is opt-in for installs served over HTTPS.
# ------------------------------------------------------------------

if not DEBUG:
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    if os.environ.get('SECURE_SSL_REDIRECT', '') == '1':
        SECURE_SSL_REDIRECT = True
        SECURE_HSTS_SECONDS = 31536000
        SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Outbox (core.outbox): after an API approve, drain due email in a background
# thread instead of waiting for run_worker's next tick.  Off under `manage.py
# test` (threads can't see a test transaction) and with OUTBOX_API_DRAIN=0.
import sys as _sys  # noqa: E402
OUTBOX_API_DRAIN = (os.environ.get('OUTBOX_API_DRAIN', '1') == '1'
                    and not (len(_sys.argv) > 1 and _sys.argv[1] == 'test'))
