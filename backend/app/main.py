"""FastAPI app factory.

Run in dev with:  uvicorn app.main:app --reload --port 8001

No URL prefix is mounted here — Nginx prefixes ``/warmpulse/`` in prod.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

# Windows: psycopg async requires the selector event loop (Python 3.8+ default is Proactor).
# Must run before uvicorn constructs its loop.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.api.routes import (
    activity,
    admin,
    admin_addons,
    admin_system_health,
    analytics,
    auth,
    crm,
    dns,
    google_oauth,
    integrations_julex,
    mailboxes,
    microsoft_oauth,
    payments,
    plans,
    public_addons,
    tools,
    workspace_billing,
    workspace_branding,
    workspace_custom_domain,
    workspace_dedicated_pool,
    workspace_inbox,
    workspace_integrations,
    workspace_notifications,
    workspace_placement,
    workspace_postmaster,
    workspace_reports,
    workspace_reputation,
    workspace_settings,
    workspace_snds,
    workspace_team,
    workspace_webhooks,
)
from app.api.routes import (
    firebase_auth as firebase_auth_routes,
)
from app.config import get_settings
from app.db.session import engine
from app.observability import capture_exception, init_sentry
from app.observability_buffers import ERRORS, LATENCY

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """DB engine startup/shutdown hook."""
    settings = get_settings()
    logger.info("WarmPulse API starting (env=%s)", settings.app_env)

    # Pre-warm Google's Firebase signing-cert bundle so the first user to
    # POST /auth/firebase doesn't pay the 300–500 ms fetch + 5–15 ms
    # cert-parse cost on the hot path. The cache TTL is 1 hour so this
    # one round-trip at boot covers the bulk of login traffic. Done as a
    # fire-and-forget task so a transient network blip during boot never
    # blocks the server from accepting other requests.
    if settings.firebase_project_id:
        async def _prewarm() -> None:
            try:
                from app.services.firebase_auth import _fetch_certs

                await _fetch_certs()
                logger.info("firebase_auth.cert_cache prewarmed")
            except Exception as exc:  # noqa: BLE001
                logger.warning("firebase_auth.cert_cache prewarm failed: %s", exc)

        asyncio.create_task(_prewarm())

    try:
        yield
    finally:
        await engine.dispose()
        logger.info("WarmPulse API stopped (engine disposed)")


def create_app() -> FastAPI:
    settings = get_settings()
    # Init Sentry first — the FastAPI integration needs to wrap the app
    # before middleware is added. No-op when SENTRY_DSN is unset.
    init_sentry(settings)

    app = FastAPI(
        title="WarmPulse API",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class TimingMiddleware(BaseHTTPMiddleware):
        """Record request duration into the in-process LATENCY ring buffer.

        Skips /health and /openapi.json so the rapid-fire smoke probes
        don't dominate the percentile distribution.
        """

        async def dispatch(self, request: Request, call_next):  # type: ignore[override]
            path = request.url.path
            if path in ("/health", "/openapi.json"):
                return await call_next(request)
            t0 = time.perf_counter()
            try:
                response: Response = await call_next(request)
            except Exception as exc:
                # Capture the exception class for the error-types panel +
                # forward to Sentry. Re-raise so the framework still emits
                # a 500.
                ERRORS.record(exc)
                capture_exception(exc)
                raise
            duration_ms = (time.perf_counter() - t0) * 1000.0
            LATENCY.record(duration_ms)
            # Track 5xx responses as soft errors (no exception bubbled up,
            # but the user still saw a failure).
            if response.status_code >= 500:
                class _Soft(Exception):
                    pass
                _Soft.__name__ = f"HTTP{response.status_code}"
                ERRORS.record(_Soft())
            return response

    app.add_middleware(TimingMiddleware)

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(activity.router)
    app.include_router(analytics.router)
    app.include_router(auth.router)
    app.include_router(google_oauth.router)
    app.include_router(microsoft_oauth.router)
    app.include_router(firebase_auth_routes.router)
    app.include_router(integrations_julex.router)
    app.include_router(mailboxes.router)
    app.include_router(crm.router)
    app.include_router(dns.router)
    app.include_router(admin.router)
    app.include_router(admin_system_health.router)
    app.include_router(plans.router)
    app.include_router(admin_addons.router)
    app.include_router(public_addons.router)
    app.include_router(payments.router)
    app.include_router(tools.router)
    app.include_router(workspace_team.router)
    app.include_router(workspace_reports.router)
    app.include_router(workspace_reputation.router)
    app.include_router(workspace_billing.router)
    app.include_router(workspace_branding.router)
    app.include_router(workspace_custom_domain.router)
    app.include_router(workspace_dedicated_pool.router)
    app.include_router(workspace_settings.router)
    app.include_router(workspace_notifications.router)
    app.include_router(workspace_inbox.router)
    app.include_router(workspace_integrations.router)
    app.include_router(workspace_webhooks.router)
    # ─── Pro Plus: external reputation signals ───────────────────────
    app.include_router(workspace_postmaster.router)
    app.include_router(workspace_snds.router)
    app.include_router(workspace_placement.router)

    return app


app = create_app()
