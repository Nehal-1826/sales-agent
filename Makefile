# =============================================================================
# WarmPulse — developer convenience Makefile
# -----------------------------------------------------------------------------
# Works on macOS / Linux / WSL natively. On native Windows install `make` via
# `choco install make` or use WSL. This Makefile does NOT orchestrate the
# multi-process dev stack — each service runs in its own terminal (see `dev`).
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install dev backend frontend worker beat \
        db-up db-down stack-down migrate migrate-create test lint format clean

help: ## Show this help
	@echo "WarmPulse — make targets"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "  \033[1m%-18s\033[0m %s\n", "target", "description"} \
	      /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# -------- Install ------------------------------------------------------------

install: ## Install backend (pip -e .[dev]) and frontend (pnpm install)
	cd backend && pip install -e ".[dev]"
	cd frontend-warmpulse && pnpm install

# -------- Local infra (Postgres + Redis via docker compose) ------------------

db-up: ## Start local Postgres + Redis via docker compose
	docker compose up -d db redis

# Scoped on purpose: only the two dev-infra containers. A bare
# `docker compose down` here would also kill the full prod-style stack
# (django/fastapi/frontend/gateway) — that is what `stack-down` is for.
db-down: ## Stop local Postgres + Redis ONLY (keeps the rest of the stack)
	docker compose stop db redis

stack-down: ## Tear down the FULL compose stack (all services + network)
	docker compose down

# -------- Migrations ---------------------------------------------------------

migrate: ## Apply Alembic migrations to head
	cd backend && alembic upgrade head

migrate-create: ## Create a new Alembic revision.  Usage: make migrate-create MSG="add foo table"
	@if [ -z "$(MSG)" ]; then echo "usage: make migrate-create MSG=\"description\""; exit 2; fi
	cd backend && alembic revision --autogenerate -m "$(MSG)"

# -------- Run individual services (each in its own terminal) -----------------

backend: ## Run FastAPI dev server on :8001 with reload
	cd backend && uvicorn app.main:app --reload --port 8001

frontend: ## Run WarmPulse Vite dev server (frontend-warmpulse/)
	cd frontend-warmpulse && pnpm dev

worker: ## Run Celery worker for default + smtp queues
	cd backend && celery -A app.celery_app worker -Q default,smtp -l info

beat: ## Run Celery Beat scheduler
	cd backend && celery -A app.celery_app beat -l info

dev: ## Print instructions for the multi-terminal dev workflow
	@echo "WarmPulse dev needs 6 terminals. Run, in order:"
	@echo "  1.  make db-up         # Postgres + Redis in Docker"
	@echo "  2.  make migrate       # once, or after pulling new migrations"
	@echo "  3.  make backend       # FastAPI :8001"
	@echo "  4.  make frontend      # Vite :5173"
	@echo "  5.  make worker        # Celery default,smtp"
	@echo "  6.  make beat          # Celery Beat"
	@echo ""
	@echo "(No real orchestration here on purpose — matching the systemd"
	@echo " topology keeps dev vs prod semantics identical.)"

# -------- Quality ------------------------------------------------------------

test: ## Run backend pytest suite
	cd backend && pytest

lint: ## Lint backend (ruff) and frontend (eslint via pnpm)
	cd backend && ruff check .
	cd frontend-warmpulse && pnpm lint

format: ## Format backend (ruff) and frontend (prettier)
	cd backend && ruff format .
	cd frontend-warmpulse && pnpm exec prettier -w .

# -------- Clean --------------------------------------------------------------

clean: ## Remove caches + build artefacts (Unix).  Windows: use `git clean -fdx`.
	@echo "Cleaning Python + Node caches (Unix find)..."
	find . -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -prune -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -prune -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "node_modules" -prune -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "dist" -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "Done.  Windows users: run  git clean -fdx  (outside the Makefile)."
