# WarmPulse — Project Context & Instructions

WarmPulse is a B2B Email Warmup SaaS designed for growth marketers and sales-ops teams. It helps maintain sender reputation by automating email activity (sending, opening, replying, and rescuing from spam) through a peer-inbox network.

## Project Overview

-   **Backend:** FastAPI (Python 3.11+), SQLAlchemy 2.0 (Async), Alembic (Migrations), Celery (Tasks), Redis (Queue), Postgres (DB).
-   **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Radix UI, Lucide Icons.
-   **Architecture:** Multi-tenant SaaS with per-workspace isolation. Uses a peer-inbox network for warmup activity.
-   **Visual Direction:** "Linear × Resend × Stripe Dashboard" aesthetic. Supports polished Dark (default) and Light themes.

## Building and Running

The project uses a `Makefile` for developer convenience. Local infrastructure (Postgres + Redis) is managed via `docker-compose`.

### Prerequisites
-   Python 3.11+
-   Node.js (pnpm preferred)
-   Docker & Docker Compose

### Initial Setup
```bash
# 1. Install dependencies
make install

# 2. Start local infrastructure
make db-up

# 3. Apply database migrations
make migrate

# 4. Seed development users (Starter, Pro, Pro Plus, Agency, Admin)
cd backend && python _seed_users.py
```

### Local Development Workflow
Run each command in a separate terminal:
1.  `make backend` — FastAPI server on [http://localhost:8001](http://localhost:8001)
2.  `make frontend` — Vite dev server on [http://localhost:5173](http://localhost:5173)
3.  `make worker` — Celery worker (queues: `default`, `smtp`)
4.  `make beat` — Celery Beat scheduler
5.  `cd frontend && pnpm preview:design` — Design variant picker on [http://localhost:35001](http://localhost:35001)

## Development Conventions

### The "Lock Pattern"
When implementing new UI variants (e.g., for different plans like Agency):
1.  **Design File:** Create a prop-less component that accepts an optional `data` prop for live mode.
2.  **Adapter Hook:** Create a hook in `features/` that maps TanStack Query data to the design's expected shape.
3.  **Live Wrapper:** Create a page component that fetches data using the hook and passes it to the design component.
4.  **Plan-Branch:** Route to the appropriate wrapper based on the user's plan in the main page router.

### Technical Standards
-   **Backend Isolation:** Every query must filter by `workspace_id` from the JWT claims.
-   **Database:** Use `services/` for DB access; keep route handlers thin (≤ 40 lines).
-   **Frontend State:** Use TanStack Query for server state. Avoid `useState + useEffect` for fetching.
-   **Encryption:** Use `services/crypto.FernetService` for encrypting mailbox credentials at rest.
-   **Styles:** Use semantic Tailwind tokens (`bg-bg`, `text-text`, etc.) instead of hardcoded hex values to support theme switching.

## Key Files
-   `GEMINI.md`: (This file) Canonical project guide.
-   `README.md`: High-level overview and setup instructions.
-   `DESIGN.md`: Detailed visual specifications and design tokens.
-   `HANDOFF.md`: Recent project progress and pending tasks.
-   `backend/app/main.py`: FastAPI entry point and middleware configuration.
-   `docs/superpowers/specs/`: Architectural specifications.
