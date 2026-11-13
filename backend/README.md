# WarmPulse Backend

FastAPI + Celery backend for the WarmPulse email-warmup SaaS. Runs on port `8001`
(SashaLMS keeps `8000`). Nginx proxies `/warmpulse/*` to this service in prod.

## Quick start

```bash
# from backend/
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

cp .env.example .env
# Generate a Fernet key and paste into FERNET_KEY:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Migrations

```bash
alembic upgrade head                    # apply all migrations
alembic revision --autogenerate -m "…"  # create a new migration from model changes
alembic downgrade -1                    # roll back one
```

## Run the API (dev)

```bash
uvicorn app.main:app --reload --port 8001
# -> http://localhost:8001/health
# -> http://localhost:8001/docs   (OpenAPI UI)
```

## Dev bootstrap (sqlite, no Docker)

Alembic migrations are Postgres-only. For the local sqlite stack the authed
warmup endpoints need this one-off instead — it creates the schema via
`Base.metadata.create_all` and seeds demo warmup data (3 mailboxes, 30 days
of warmth history, today's activity, 2 alerts) into the workspace of the
bridge user the Django JWT resolves to (`operator@agentic.local` by default,
override with `WARMUP_DEV_BRIDGE_EMAIL`). Idempotent — safe to re-run;
refused unless `WARMUP_DEV_BOOTSTRAP=1` and never outside dev environments:

```bash
# from backend/
WARMUP_DEV_BOOTSTRAP=1 \
DATABASE_URL=sqlite+aiosqlite:///db.sqlite3 \
JWT_SECRET=<same value as Django's WARMUP_JWT_SECRET> \
python -m scripts.dev_bootstrap
```

## Celery

```bash
# default + smtp queues
celery -A app.celery_app worker -Q default,smtp -l info

# isolated Z.ai queue (separate worker, separate systemd unit in prod)
celery -A app.celery_app worker -Q zai -l info

# scheduler
celery -A app.celery_app beat -l info
```

## Tests

```bash
pytest                  # uses in-memory SQLite, no Postgres required
ruff check .
mypy app
```
