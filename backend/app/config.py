"""Runtime configuration (Pydantic Settings)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """All runtime settings sourced from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_env: str = Field(default="development", alias="APP_ENV")
    app_base_url: str = Field(default="http://localhost:8001", alias="APP_BASE_URL")
    frontend_base_url: str = Field(default="http://localhost:5173", alias="FRONTEND_BASE_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Live SMTP/IMAP/DNS probes are now ON by default — we want production
    # behaviour: real credential verification, real DNS resolution. Flip
    # MAILBOX_PROBES_DUMMY=true in .env only when iterating on UI against
    # test mailboxes that can't be probed live.
    # Payments stay on the dummy gateway (services/payments_service.py) —
    # that's deliberate and not gated by this flag.
    mailbox_probes_dummy: bool = Field(default=False, alias="MAILBOX_PROBES_DUMMY")

    # Database
    database_url: str = Field(
        default="postgresql+psycopg://warmpulse:warmpulse@localhost:5432/warmpulse_db",
        alias="DATABASE_URL",
    )

    # Redis (shared; key-prefixed on prod)
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    redis_key_prefix: str = Field(default="warmpulse:", alias="REDIS_KEY_PREFIX")

    # Celery
    celery_broker_url: str = Field(default="redis://localhost:6379/0", alias="CELERY_BROKER_URL")
    celery_result_backend: str = Field(
        default="redis://localhost:6379/1", alias="CELERY_RESULT_BACKEND"
    )

    # Crypto — MultiFernet-compatible. Comma-separated list; first key is primary.
    fernet_key: str = Field(default="", alias="FERNET_KEY")

    # JWT
    jwt_secret: str = Field(default="", alias="JWT_SECRET")
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_minutes: int = Field(default=15, alias="JWT_ACCESS_TTL_MINUTES")
    jwt_refresh_ttl_days: int = Field(default=7, alias="JWT_REFRESH_TTL_DAYS")

    # Google OAuth (mailbox-connect)
    google_client_id: str = Field(default="", alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(
        default="http://localhost:8001/api/auth/google/callback",
        alias="GOOGLE_REDIRECT_URI",
    )
    google_mailbox_redirect_uri: str = Field(
        default="http://localhost:8001/api/auth/google/mailbox-callback",
        alias="GOOGLE_MAILBOX_REDIRECT_URI",
    )

    # Sentry — error reporting (gated on SENTRY_DSN; no-op without it).
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")
    sentry_environment: str = Field(default="", alias="SENTRY_ENVIRONMENT")
    sentry_traces_sample_rate: float = Field(
        default=0.0, alias="SENTRY_TRACES_SAMPLE_RATE"
    )

    # Stripe — checkout sessions + webhook (test-mode by default).
    stripe_secret_key: str = Field(default="", alias="STRIPE_SECRET_KEY")
    stripe_webhook_secret: str = Field(default="", alias="STRIPE_WEBHOOK_SECRET")
    # Comma-separated ``plan_slug=price_id`` pairs, e.g.
    # ``solo=price_123,growth=price_456,agency=price_789``.
    stripe_price_ids: str = Field(default="", alias="STRIPE_PRICE_IDS")
    stripe_success_url: str = Field(
        default="http://localhost:5173/app/billing?stripe=success",
        alias="STRIPE_SUCCESS_URL",
    )
    stripe_cancel_url: str = Field(
        default="http://localhost:5173/app/billing?stripe=cancel",
        alias="STRIPE_CANCEL_URL",
    )

    # Cashfree — Orders (one-time) + Subscriptions (auto-pay) + webhook.
    # India-first PSP; lives alongside Stripe. Both default to off — the dummy
    # gateway (services/payments_service.py) is the fallback when neither is set.
    cashfree_key_id: str = Field(default="", alias="CASHFREE_APP_ID")
    cashfree_key_secret: str = Field(default="", alias="CASHFREE_SECRET_KEY")
    cashfree_webhook_secret: str = Field(default="", alias="CASHFREE_WEBHOOK_SECRET")

    # Microsoft (Outlook) OAuth — mailbox connect only, mirror of Gmail flow.
    microsoft_client_id: str = Field(default="", alias="MICROSOFT_CLIENT_ID")
    microsoft_client_secret: str = Field(default="", alias="MICROSOFT_CLIENT_SECRET")
    microsoft_mailbox_redirect_uri: str = Field(
        default="http://localhost:8001/api/auth/microsoft/mailbox-callback",
        alias="MICROSOFT_MAILBOX_REDIRECT_URI",
    )

    # LLM pricing — placeholder average tokens-to-USD figure used by the
    # usage ledger to estimate cost per call. Tune per provider as needed.
    llm_price_per_1k_tokens_usd: float = Field(
        default=0.0005, alias="LLM_PRICE_PER_1K_TOKENS_USD"
    )

    # Anthropic (optional swap target for LLMProvider — only used when key present)
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-sonnet-4-5", alias="ANTHROPIC_MODEL")

    # Firebase Auth (frontend signs in with Google via Firebase, backend verifies token)
    firebase_project_id: str = Field(default="", alias="FIREBASE_PROJECT_ID")

    # Gemini (Google Generative Language API). When set, takes precedence over Claude.
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        alias="GEMINI_BASE_URL",
    )
    gemini_price_per_1k_tokens_usd: float = Field(
        default=0.00015, alias="GEMINI_PRICE_PER_1K_TOKENS_USD"
    )

    # Groq (OpenAI-compatible, free tier). Used as the fallback when Gemini is
    # rate-limited / unconfigured.
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.3-70b-versatile", alias="GROQ_MODEL")
    groq_base_url: str = Field(
        default="https://api.groq.com/openai/v1", alias="GROQ_BASE_URL"
    )

    # Outbound transactional mail (welcome / digest / mailbox-disconnect alert).
    # When TRANSACTIONAL_SMTP_HOST is empty the mail service runs in dry-run
    # mode: every send is logged at INFO and dropped, so signup / alert flows
    # never block on SMTP misconfiguration. Wire real creds to enable delivery.
    transactional_smtp_host: str = Field(default="", alias="TRANSACTIONAL_SMTP_HOST")
    transactional_smtp_port: int = Field(default=587, alias="TRANSACTIONAL_SMTP_PORT")
    transactional_smtp_username: str = Field(default="", alias="TRANSACTIONAL_SMTP_USERNAME")
    transactional_smtp_password: str = Field(default="", alias="TRANSACTIONAL_SMTP_PASSWORD")
    transactional_smtp_from: str = Field(
        default="WarmPulse <hello@warmpulse.tech>", alias="TRANSACTIONAL_SMTP_FROM"
    )
    transactional_smtp_starttls: bool = Field(
        default=True, alias="TRANSACTIONAL_SMTP_STARTTLS"
    )
    # IMAP for the platform inbox (admin Mail Viewer). Empty host = derive
    # from the SMTP host (smtp.* → imap.*, else same host), port 993.
    transactional_imap_host: str = Field(default="", alias="TRANSACTIONAL_IMAP_HOST")
    transactional_imap_port: int = Field(default=993, alias="TRANSACTIONAL_IMAP_PORT")
    transactional_test_mode: bool = Field(
        default=False, alias="TRANSACTIONAL_TEST_MODE"
    )

    # Julex (julex.shop store-builder) integration. Merchants paste their
    # Julex public API key into WarmPulse; we verify it against Julex's
    # public settings endpoint. ``julex_origin`` is the browser origin the
    # Julex frontend polls our status endpoint from (CORS-allowed).
    julex_base_url: str = Field(default="https://julex.shop", alias="JULEX_BASE_URL")
    julex_origin: str = Field(default="https://julex.shop", alias="JULEX_ORIGIN")

    # Nginx-level maintenance flag file (see ops/nginx/warmpulse.conf +
    # ops/maintenance.sh). Empty = file sync disabled (local dev); in prod the
    # compose file mounts the repo root at /host-app and points this at the
    # flag file so the admin toggle drives BOTH the API middleware and nginx.
    maintenance_flag_path: str = Field(default="", alias="MAINTENANCE_FLAG_PATH")

    @property
    def stripe_enabled(self) -> bool:
        """Stripe is "wired" when both the API key and webhook secret are set."""
        return bool(self.stripe_secret_key) and bool(self.stripe_webhook_secret)

    @property
    def stripe_price_map(self) -> dict[str, str]:
        """Parse ``STRIPE_PRICE_IDS`` (``solo=price_X,growth=price_Y``) into a dict."""
        out: dict[str, str] = {}
        for chunk in self.stripe_price_ids.split(","):
            chunk = chunk.strip()
            if "=" in chunk:
                k, v = chunk.split("=", 1)
                k = k.strip().lower()
                v = v.strip()
                if k and v:
                    out[k] = v
        return out

    @model_validator(mode="after")
    def _require_strong_jwt_secret(self) -> "Settings":
        """Fail closed outside development if JWT_SECRET is missing or the
        well-known placeholder — otherwise tokens would be forgeable by anyone.
        Mirrors FernetService, which already raises when FERNET_KEY is absent."""
        weak = (not self.jwt_secret) or self.jwt_secret == "change-me-in-production"
        if weak and self.app_env.lower() not in ("development", "dev", "test", "testing"):
            raise ValueError(
                "JWT_SECRET must be set to a strong random value in "
                f"{self.app_env!r} (refusing the empty/placeholder default)."
            )
        return self

    @property
    def cashfree_enabled(self) -> bool:
        """Cashfree is "wired" when both the key id and key secret are set."""
        return bool(self.cashfree_key_id) and bool(self.cashfree_key_secret)

    @property
    def fernet_keys(self) -> list[str]:
        """FERNET_KEY may hold a comma-separated list for MultiFernet rotation."""
        return [k.strip() for k in self.fernet_key.split(",") if k.strip()]

    @property
    def cors_origins(self) -> list[str]:
        # Include both loopback spellings — browsers treat them as distinct origins,
        # so a 307 redirect from one to the other would otherwise fail CORS.
        # Julex's storefront-builder frontend polls the public status endpoint
        # cross-origin, so its origin(s) must be allowed too.
        origins = {
            self.frontend_base_url,
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            self.julex_base_url,
            self.julex_origin,
        }
        return [o for o in origins if o]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
