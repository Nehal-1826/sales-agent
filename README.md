# WarmPulse

Email warmup SaaS + autonomous outbound agent, merged in one monorepo.
FastAPI + React + Django: WarmPulse warms every sender mailbox, the agent
finds businesses, audits websites and drafts the outreach.

## Architecture

- WarmPulse platform: [docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md](docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md) — the architecture contract. All implementation must honour it.
- Agent deploy (VPS): [docs/DEPLOY-agent.md](docs/DEPLOY-agent.md) — paths moved in the monorepo, note at the top
- Gateway routing (`/` → frontend, `/api/` → Django, `/wp-api/` → FastAPI): [ops/gateway/nginx.conf](ops/gateway/nginx.conf)

## Monorepo layout

```
backend-agent/       Django + DRF — agent API (:8000), auth, pipeline, CRM
backend/             FastAPI + SQLAlchemy + Celery — warmup API (:8001)
frontend/            React + Vite + TypeScript — the product (WarmPulse-branded agent shell + warmup section)
frontend-warmpulse/  original WarmPulse client — source for the upcoming client-page port, not deployed
ops/                 gateway nginx, docker-compose support files, db init, systemd
docs/                specs, plans, deploy guides
scripts/             e2e gate (scripts/e2e/), docs gen, smoke
```

## Getting started (local dev — three processes)

```bash
# 1. Copy env template
cp .env.example .env
# Generate a Fernet key and paste into .env: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. Django agent API — http://127.0.0.1:8000  (Terminal 1)
cd backend-agent
python -m venv .venv && source .venv/Scripts/activate  # Windows Git Bash
pip install -r requirements.txt
export DATABASE_URL=sqlite:///db-agent.sqlite3          # Postgres only under docker
python manage.py migrate && python manage.py seed_demo  # operator / operator-demo-2026
python manage.py runserver 127.0.0.1:8000

# 3. FastAPI warmup API — http://127.0.0.1:8001  (Terminal 2)
cd backend
python -m venv .venv && source .venv/Scripts/activate
pip install -e ".[dev]"
export DATABASE_URL=sqlite+aiosqlite:///db-warmup.sqlite3   # Postgres+Redis via `docker compose up -d db redis`
alembic upgrade head
uvicorn app.main:app --reload --port 8001

# 4. Frontend — http://localhost:5173  (Terminal 3; dev-proxies /api and /wp-api)
cd frontend
npm install
npm run dev
```

API docs: http://localhost:8001/docs · E2E gate: [scripts/e2e/README.md](scripts/e2e/README.md)
(run it before every push — 3 servers + `python scripts/e2e/flow.py`).

Docker (VPS, all services + one gateway): `docker compose up -d --build` —
see [docs/DEPLOY-agent.md](docs/DEPLOY-agent.md).

## Build status

Foundation merge complete (branch `merge/agent-foundation`): monorepo,
gateway + JWT bridge, Warmup section stub, E2E gate. WarmPulse client
pages port next from `frontend-warmpulse/`. See `docs/superpowers/plans/`
for phase plans.
