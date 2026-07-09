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
