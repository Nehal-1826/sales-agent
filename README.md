# WarmPulse

Email warmup SaaS. FastAPI + React, peer-inbox network, AI-generated warmup content.

## Architecture

See [docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md](docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md) for the full architecture contract. All implementation must honour it.

## Layout

```
backend/    FastAPI + SQLAlchemy + Celery
frontend/   React + Vite + TypeScript + Tailwind
ops/        docker-compose, nginx, systemd
docs/       specs, plans
```

## Getting started (local dev)

```bash
# 1. Copy env template
cp .env.example .env
# Generate a Fernet key and paste into .env: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. Start Postgres + Redis
docker compose up -d

# 3. Backend
cd backend
python -m venv .venv && source .venv/Scripts/activate  # Windows Git Bash
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload --port 8001

# 4. Frontend (new terminal)
cd frontend
pnpm install
pnpm dev
```

Frontend: http://localhost:5173 — Backend: http://localhost:8001 — API docs: http://localhost:8001/docs

## Build status

Scaffolding in progress. See `docs/superpowers/plans/` for phase plans.
