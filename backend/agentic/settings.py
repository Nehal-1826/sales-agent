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

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'dev-only-insecure-key-change-me',
)

DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'

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
]

MIDDLEWARE = [
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

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
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

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
