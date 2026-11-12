# Deploying Agentic AI to a VPS — beginner guide

> **Monorepo note (2026-11-12):** paths in this guide predate the WarmPulse
> merge. The agent backend now lives at `backend-agent/` (was `backend/`
> from the standalone sales-agent repo), and the root `docker-compose.yml`
> is the merged stack — Django + FastAPI + frontend + celery behind one
> gateway (`ops/gateway/nginx.conf`: `/api/` → django, `/wp-api/` → fastapi,
> `/` → frontend). Pre-move paths below still read as `backend/` for the
> agent service; substitute `backend-agent/` there. FastAPI/warmup deploy
> specifics stay in the root README.

This makes the whole system run 24/7 on a small Linux server. Your laptop
becomes just a window into it: close it, sleep it, lose internet — the agent
keeps discovering, profiling, drafting and reporting on the VPS.

```
your laptop / phone (browser)
        │  http://VPS_IP  (or https://yourdomain.com)
        ▼
   nginx (frontend container)  ← serves the React dashboard
        │  /api/, /admin/, /static/ (proxied, same origin — no CORS)
        ▼
   Django API (gunicorn container)
        ▼
   agent worker container  ← pipeline cycles + daily 8 PM IST report
        ▼
   PostgreSQL container  ← all data, persisted in a docker volume
```

**What was NOT changed:** the React frontend, routes, components, styling and
all existing functionality are untouched. Only deployment plumbing was added.

---

## 1. VPS requirements

| Thing | Minimum | Comfortable |
|---|---|---|
| OS | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| CPU / RAM | 1 vCPU / 2 GB | 2 vCPU / 4 GB |
| Disk | 20 GB | 40 GB |
| Network | outbound internet (scraping + SMTP) | same |

## 2. Exact commands to deploy (from a fresh Ubuntu VPS)

SSH in as root (your provider shows you the IP + password/key):

```bash
ssh root@YOUR_VPS_IP
```

**Step 1 — install Docker (the only software you need):**

```bash
curl -fsSL https://get.docker.com | sh
```

**Step 2 — get the code onto the server.** Either git (recommended):

```bash
git clone <YOUR_REPO_URL> /opt/agentic && cd /opt/agentic
```

…or upload the folder from your PC (from a **Git Bash** terminal on Windows,
run this *locally*):

```bash
scp -r "C:/Users/kanna/OneDrive/Desktop/intern/Agentic AI" root@YOUR_VPS_IP:/opt/agentic
```

**Step 3 — create your secrets files (BOTH are required — a fresh clone
fails `docker compose up` without them):**

```bash
cd /opt/agentic
cp .env.example .env                                # root: compose-level secrets
cp backend/.env.docker.example backend/.env.docker  # FastAPI + celery services
nano .env        # set the values, see section 3 below — save with Ctrl+O, Enter, Ctrl+X
nano backend/.env.docker
```

In `backend/.env.docker`, set `APP_BASE_URL` and the OAuth redirect URIs to
the new external prefix: `https://YOUR_DOMAIN/wp-api/api` (the gateway maps
`/wp-api/x` → FastAPI `/x`, so API-style absolute URLs must carry
`/wp-api`). Its `DATABASE_URL`/`REDIS_URL` lines can stay as written — the
compose `environment:` block overrides them on the docker bridge network.

**Step 4 — build and start everything:**

```bash
docker compose up -d --build
```

First build takes ~3–5 minutes. Done. The dashboard is at `http://YOUR_VPS_IP`.

**Step 5 — open the firewall** (only if your provider doesn't manage it):

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

## 3. Environment variables (in `/opt/agentic/.env`)

| Variable | What to put |
|---|---|
| `DJANGO_SECRET_KEY` | long random string — generate: `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_DEBUG` | `0` (production) |
| `ALLOWED_HOSTS` | your VPS IP and/or domain, comma separated — e.g. `11.22.33.44,myagent.com` |
| `POSTGRES_PASSWORD` | a strong password (only used inside docker, but set it anyway) |
| `CSRF_TRUSTED_ORIGINS` | only needed with HTTPS: `https://myagent.com` |
| `WARMUP_JWT_SECRET` | **shared bridge secret — must equal FastAPI's `JWT_SECRET`.** Compose interpolates this ONE value into both sides (FastAPI api/worker/beat `JWT_SECRET` + Django `WARMUP_JWT_SECRET`), so there is no double entry to drift. 32+ chars — both backends refuse shorter in production. Generate: `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `AGENT_BRIDGE_ENABLED` | optional (goes in `backend/.env.docker`, FastAPI side). Bridge kill-switch, default `true`; set `false` to hard-disable bridge logins without touching Django. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `FROM_EMAIL` / `REPORT_EMAIL` | optional — Gmail details; if omitted, set them in Django Admin instead (they're already configured in your DB backup if you migrate them) |

API keys and credentials live **only** in `.env` / Django admin on the server —
never in the frontend code. Keep `.env` private; it is git-ignored.

## 4. Docker commands you'll actually use

```bash
cd /opt/agentic
docker compose ps                 # what is running? (should show db/api/worker/frontend: Up)
docker compose logs -f worker     # watch the agent work live (Ctrl+C to stop watching)
docker compose logs -f api        # watch API requests/errors
docker compose restart worker     # restart just the agent
docker compose down               # stop everything (data is safe in the pgdata volume)
docker compose up -d              # start everything again
```

## 5. Start / stop / restart the agent

The "agent" is the `worker` container (pipeline cycles + daily 8 PM report).

```bash
docker compose restart worker     # restart it
docker compose stop worker        # pause it (API + dashboard keep running)
docker compose start worker       # resume it
```

You can also toggle it from the dashboard: **Settings → Frequent Runs →
disable** (the worker stays up but skips cycles), and the daily report email
always goes out at 8 PM IST regardless.

## 6. How to verify the agent is running

**From your browser** — the built-in health check:

```
http://YOUR_VPS_IP/api/health/
```

You want to see:

```json
{
  "status": "ok",
  "database": "connected",
  "api": true,
  "worker":   { "running": true, "lastSeen": "…" },
  "scheduler": { "running": true, "lastSeen": "…" }
}
```

`worker` = pipeline scheduler alive · `scheduler` = daily-report thread alive.
On the dashboard the **Pipeline page** status strip shows the same info.

**From SSH:**

```bash
docker compose ps                 # all services "Up" (healthy)
docker compose logs worker | tail -20
```

## 7. First-deploy validation checklist (merged stack)

Run once after every fresh deploy of the merged monorepo. Commands run on the
VPS from `/opt/agentic` unless noted. Step 0 needs no Docker — it also works
on the dev laptop.

**0 — validate compose config BEFORE starting (no Docker required):**

```bash
docker compose config -q    # silence = OK; prints errors like a missing ${WARMUP_JWT_SECRET}
```

**1 — build and start:**

```bash
docker compose up -d --build
docker compose ps           # every service Up; db/redis healthy, django healthy
```

**2 — Postgres volume predates the merge?** The `agent` database was never
created (init scripts only run on first cluster init). Create it by hand —
the script is idempotent:

```bash
docker compose exec db psql -U warmpulse \
  -f /docker-entrypoint-initdb.d/10-create-agent-db.sql
docker compose restart django   # entrypoint then migrates the agent schema
```

**3 — curl matrix** (replace `localhost` with your IP/domain when testing
from outside the VPS):

| URL | Expect |
|---|---|
| `curl -fsS http://localhost/api/health/` | 200 JSON, `"database": "connected"` (Django + its DB) |
| `curl -fsS http://localhost/wp-api/health` | 200 `{"status":"ok"}` (FastAPI alive behind the gateway) |
| `curl -s -o /dev/null -w '%{http_code}\n' http://localhost/wp-api/api/auth/me` | `401` — reachable but auth-required (NOT 404/502) |
| `curl -s -o /dev/null -w '%{http_code}\n' http://localhost/docs` | `404` in production — interactive docs are OFF once `APP_ENV=production` (FastAPI refuses `/docs` `/redoc` `/openapi.json`) |
| `curl -fsS http://localhost/` | 200 — the SPA shell (frontend container) |

**4 — bridge JWT round-trip** (Django mints → FastAPI accepts — the core of
the merged stack):

```bash
DJANGO_TOKEN=$(curl -fsS -X POST http://localhost/api/auth/login/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"operator","password":"operator-demo-2026"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
BRIDGE=$(curl -fsS -X POST http://localhost/api/auth/warmup-token/ \
  -H "Authorization: Token $DJANGO_TOKEN" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -fsS http://localhost/wp-api/api/auth/me -H "Authorization: Bearer $BRIDGE"
# Expect 200 with the provisioned WarmPulse user JSON (same email as the Django user).
```

If the last call 401s, the two sides hold different secrets: compose wires
BOTH from the one `WARMUP_JWT_SECRET` in root `.env` — check with
`docker compose config | grep -i jwt`. Note: a *platform admin* account gets
`403 {"detail": "OTP required"}` from warmup-token until the session passes
TOTP (`POST /api/platform/2fa/verify/`) — test the round-trip with a regular
workspace user (e.g. `operator` on demo installs).

## 8. How automatic restart works

Every service has `restart: unless-stopped` in `docker-compose.yml`:

- **If a container crashes** → Docker restarts it within seconds, forever.
- **If the VPS reboots** → Docker itself starts at boot and brings every
  container back automatically. No SSH needed after a reboot.
- The only way it stays down is if *you* ran `docker compose stop` (that's
  the "unless-stopped").
- Migrations run automatically at every start (`entrypoint.sh`), and data
  lives in the `pgdata` volume — restarts never lose leads.

## 9. How to update after pushing new code

```bash
cd /opt/agentic
git pull                          # or scp the changed files again
docker compose up -d --build      # rebuilds changed images, restarts, keeps data
```

Migrations apply automatically during the restart. Downtime: a few seconds.

## 10. Accessing the dashboard from laptop / phone

- Same URL everywhere: `http://YOUR_VPS_IP` (bookmark it). Login:
  `operator` / `operator-demo-2026` — change it in Django Admin → Users after
  first login.
- Django Admin: `http://YOUR_VPS_IP/admin/` (`admin` / `admin-demo-2026` —
  change this password too).
- It works from any browser (phone included) because the layout is responsive.

**HTTPS (recommended once you have a domain, ~₹200–800/yr):** point the
domain's A record to your VPS IP, add `DOMAIN=myagent.com` to `.env`, add
`CSRF_TRUSTED_ORIGINS=https://myagent.com`, then:

```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

Caddy obtains + renews the certificate automatically. Dashboard becomes
`https://myagent.com`.

## 11. Monthly cost options

| Provider | Spec | Price/mo |
|---|---|---|
| **Hetzner CX22** (best value) | 2 vCPU / 4 GB | ~€4.50 (~₹450) |
| DigitalOcean basic droplet | 1 vCPU / 1 GB (tight but works) | $6 (~₹550) |
| Linode (Akamai) Nanode | 1 vCPU / 1 GB | $5 (~₹450) |
| Oracle Cloud Always Free | 4 ARM cores / 24 GB | **$0** (free tier, capacity permitting) |
| AWS Lightsail | 1 vCPU / 2 GB | $5 (~₹450) |

The whole stack (4 containers + Postgres) idles comfortably under 1 GB RAM.

---

## What was added to the project (nothing else touched)

| File | Purpose |
|---|---|
| `Dockerfile` (root) + `nginx.conf` | builds frontend, serves it, proxies `/api` `/admin` `/static` |
| `backend/Dockerfile` + `backend/entrypoint.sh` | API image: migrate → collectstatic → seed → gunicorn |
| `docker-compose.yml` | db + api + worker + frontend, auto-restart, healthchecks |
| `docker-compose.https.yml` + `Caddyfile` | optional automatic-HTTPS layer |
| `.env.example` | template for server secrets |
| `backend/core/management/commands/run_worker.py` | the always-on agent (pipeline + report + heartbeats) |
| `backend/core/health.py`, `HealthBeat` model | liveness for `/api/health/` |
| `settings.py` | env-based hosts/CORS/CSRF, WhiteNoise, `STATIC_ROOT` |
| `requirements.txt` | + gunicorn, whitenoise, tzdata |

Local development is unchanged: `runserver` + `npm run dev` still work exactly
as before.
