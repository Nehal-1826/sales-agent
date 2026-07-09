"""Sentry init — gated on the ``SENTRY_DSN`` env var.

Both `app.main:create_app` and the celery worker entry call ``init_sentry``
on startup. Without ``SENTRY_DSN`` set, the call is a true no-op (we never
import ``sentry_sdk`` so the package can be uninstalled in lean local
images and the import-cost stays out of the cold-start path).

The integration list is intentionally minimal:
* ``FastApiIntegration`` for inbound HTTP request context.
* ``StarletteIntegration`` because FastAPI inherits from Starlette and the
  Sentry SDK ships them as a pair.
* ``SqlalchemyIntegration`` for query-level breadcrumbs.
* ``LoggingIntegration`` is left at its default (warnings → breadcrumbs,
  errors → events).

We don't enable performance tracing by default — sample-rate 0.0 unless
``SENTRY_TRACES_SAMPLE_RATE`` overrides it.
"""
from __future__ import annotations

import logging

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_initialized = False


def init_sentry(settings: Settings | None = None) -> bool:
    """Initialize the Sentry SDK if a DSN is configured.

    Idempotent — repeat calls return the same result rather than re-binding
    the SDK. Returns True if Sentry was actually wired up, False otherwise.
    """
    global _initialized
    if _initialized:
        return True

    s = settings or get_settings()
    if not s.sentry_dsn:
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "sentry_sdk is not importable (%s) — skipping init even though "
            "SENTRY_DSN is set. Install with: pip install 'sentry-sdk[fastapi]'",
            exc,
        )
        return False

    sentry_sdk.init(
        dsn=s.sentry_dsn,
        environment=s.sentry_environment or s.app_env,
        traces_sample_rate=float(s.sentry_traces_sample_rate),
        integrations=[
            FastApiIntegration(),
            StarletteIntegration(),
            SqlalchemyIntegration(),
        ],
        # Strip request body PII at the SDK level — we never want refresh
        # tokens, OAuth codes, or SMTP credentials sneaking into events.
        send_default_pii=False,
    )

    _initialized = True
    logger.info("Sentry initialized env=%s", s.sentry_environment or s.app_env)
    return True


def capture_exception(exc: BaseException) -> None:
    """Forward an exception to Sentry if it's wired; no-op otherwise.

    Useful in places where the FastAPI integration's automatic capture
    doesn't reach — e.g. inside a celery task wrapper or a fire-and-forget
    background coroutine.
    """
    if not _initialized:
        return
    try:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
        # Never let observability machinery itself raise.
        pass


def reset_for_tests() -> None:
    """Reset the module-local guard so tests can re-init with different DSNs."""
    global _initialized
    _initialized = False
