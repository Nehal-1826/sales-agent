# WarmPulse × Agent Merge — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One monorepo (this repo) running both backends behind one gateway, one login (Django identity + JWT bridge to FastAPI), WarmPulse brand on the sales-agent shell, warmup section stub live — all tests green.

**Architecture:** Two backends (Django `backend-agent/`, FastAPI `backend-warmup/`), nginx/Vite gateway routing `/api/` → Django and `/wp-api/` → FastAPI (rewritten to FastAPI's internal `/api/` prefix). Django mints an HS256 bridge JWT (`iss: agent-bridge`); FastAPI auto-provisions passwordless users from it. The sales-agent frontend becomes `frontend/`; the old WarmPulse frontend is preserved at `frontend-warmpulse/` as the porting source.

**Tech Stack:** Django+DRF, FastAPI+SQLAlchemy+Celery, React+Vite+TS (custom CSS, no Tailwind), nginx, docker compose, PyJWT, axios, Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-11-12-warmpulse-agent-merge-design.md`

## Global Constraints

- Repo home = `ShailogTech/Email-Warmup`, branch `main`. Both histories preserved.
- Brand = WarmPulse, violet accent `#7C5CFF` (dark) / `#6B49FF` (light). No Tailwind in `frontend/`.
- FastAPI public API paths unchanged (`/api/...` internally); mobile app untouched.
- One shared JWT secret: env `WARMUP_JWT_SECRET` (Django) must equal FastAPI's `JWT_SECRET` in every environment. HS256 only.
- No secrets in frontend code. TypeScript `strict` stays. All existing test suites keep passing.
- Bridge JWT claims (exact): `iss=agent-bridge`, `type=access`, `sub=<django user id str>`, `role=<client|super_admin>`, `email=<email>`, `workspace=<workspace slug>`, `exp`, `iat`.
- Workspace paths contain a space (`Devesh B`) — quote all shell paths.

---

### Task 1: Subtree-import sales-agent and lay out the monorepo

**Files:**
- Create: `backend-agent/` (from sales-agent `backend/`), `frontend/` (from sales-agent root frontend files), `frontend-warmpulse/` (current `frontend/` renamed), `docs/DEPLOY-agent.md` (from sales-agent `DEPLOY.md`)
- Delete: nothing from WarmPulse history (moves only)

**Interfaces:**
- Produces: directory layout every later task depends on — `backend-agent/manage.py`, `frontend/package.json`, `frontend-warmpulse/package.json`.

- [ ] **Step 1: Import the sales-agent repo (feat/saas-billing) as a subtree**

Run from repo root (`Email-Warmup/`). No `--squash` — the spec requires both histories to survive:

```bash
git subtree add --prefix=agent-origin https://github.com/Nehal-1826/sales-agent.git feat/saas-billing
```

Expected: merge commit created, `agent-origin/backend/manage.py` exists.

- [ ] **Step 2: Rearrange to target layout**

```bash
git mv frontend frontend-warmpulse
git mv agent-origin/backend backend-agent
git mv agent-origin/src frontend/src
git mv agent-origin/public frontend/public
git mv agent-origin/index.html frontend/index.html
git mv agent-origin/vite.config.ts frontend/vite.config.ts
git mv agent-origin/tsconfig.json frontend/tsconfig.json
git mv agent-origin/package.json frontend/package.json
git mv agent-origin/package-lock.json frontend/package-lock.json
git mv agent-origin/DEPLOY.md docs/DEPLOY-agent.md
git rm -r agent-origin   # remaining files: README.md, Dockerfile, nginx.conf, docker-compose*, scripts/, .env.example, backend leftovers
```

Keep `agent-origin/nginx.conf` + `agent-origin/scripts/prerender.mjs` + `agent-origin/Dockerfile` — they are the frontend build image (Task 2 uses them):

```bash
mkdir -p frontend/deploy
git mv agent-origin/Dockerfile frontend/deploy/Dockerfile
git mv agent-origin/nginx.conf frontend/deploy/nginx.conf
git mv agent-origin/scripts frontend/scripts   # prerender.mjs (build script references ../scripts — fix path in Task 3)
```

- [ ] **Step 3: Verify layout + history survives**

```bash
ls backend-agent/manage.py frontend/package.json frontend-warmpulse/package.json frontend-warmpulse/src
git log --follow --oneline -3 -- backend-agent/manage.py | head -3
```

Expected: all files exist; `git log --follow` shows sales-agent commits (not just the import merge).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "merge: import sales-agent (feat/saas-billing) as backend-agent + frontend — monorepo layout"
```

---

### Task 2: Gateway nginx + root docker-compose

**Files:**
- Create: `ops/gateway/nginx.conf`
- Modify: `docker-compose.yml` (root — becomes the full-stack compose)

**Interfaces:**
- Produces: service names `gateway`, `frontend`, `django`, `fastapi`, `celery-worker`, `celery-beat`, `db` (Postgres), `redis`; routing contract of the spec §2. Dev parity rules live in Task 3.

- [ ] **Step 1: Write the gateway config**

`ops/gateway/nginx.conf`:

```nginx
server {
  listen 80;

  # Frontend SPA (prerendered build)
  location / {
    proxy_pass http://frontend:80/;
    proxy_set_header Host $host;
  }

  # Django agent API
  location /api/ {
    proxy_pass http://django:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  # WarmPulse FastAPI: /wp-api/x  ->  FastAPI /api/x  (strip + internal prefix)
  location /wp-api/api/ {
    proxy_pass http://fastapi:8001/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Prefix /wp-api;
  }
  # any other /wp-api/* path (e.g. /wp-api/health) maps to FastAPI root path
  location /wp-api/ {
    proxy_pass http://fastapi:8001/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Prefix /wp-api;
  }

  # FastAPI docs — same domain for platform admins
  location ~ ^/(docs|redoc|openapi.json)$ {
    proxy_pass http://fastapi:8001;
    proxy_set_header Host $host;
  }
}
```

- [ ] **Step 2: Rewrite root docker-compose.yml to run the full stack**

Merge both stacks into one file. Keep WarmPulse's existing services (`rename backend → fastapi`; keep `celery-worker`, `celery-beat`, `db`, `redis`, their volumes/env). Add the three new services with this skeleton:

```yaml
  django:
    build: ./backend-agent
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/agent
      WARMUP_JWT_SECRET: ${WARMUP_JWT_SECRET}
    depends_on: [db]

  frontend:
    build:
      context: ./frontend
      dockerfile: deploy/Dockerfile

  gateway:
    image: nginx:1.27-alpine
    ports: ["80:80"]
    volumes:
      - ./ops/gateway/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on: [frontend, django, fastapi]
```

And set `JWT_SECRET: ${WARMUP_JWT_SECRET}` on the `fastapi` service (one secret, two names — see Global Constraints). For the two databases, follow the init-script pattern already in `ops/` if present; otherwise add `db` init that runs `CREATE DATABASE agent;` when absent.

- [ ] **Step 3: Validate compose parses**

```bash
docker compose config -q && echo COMPOSE_OK
```

Expected: `COMPOSE_OK` (if Docker Desktop is unavailable on this machine, record the skip in the commit message and validate again before any deploy).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml ops/gateway/nginx.conf
git commit -m "ops: one gateway + one compose for django/fastapi/frontend/celery — /api vs /wp-api split"
```

---

### Task 3: Frontend — dev proxy for /wp-api, prerender path fix

**Files:**
- Modify: `frontend/vite.config.ts`, `frontend/package.json` (build script prerender path)

**Interfaces:**
- Consumes: gateway routing contract (Task 2).
- Produces: dev URLs — `/api/*` → Django :8000, `/wp-api/*` → FastAPI :8001 rewritten to `/api/*`, `/wp-api/health` → FastAPI `/health`.

- [ ] **Step 1: Add the /wp-api proxy rule (rewrite to FastAPI's internal /api prefix)**

In `frontend/vite.config.ts`, inside `server`:

```ts
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/wp-api': {
        target: process.env.WP_API_PROXY_TARGET || 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wp-api\/api/, '/api').replace(/^\/wp-api/, ''),
      },
    },
```

- [ ] **Step 2: Fix the prerender script path in build**

`frontend/package.json` build script (imported from sales-agent) references `scripts/prerender.mjs`; after Task 1 the folder is `frontend/scripts/`. Verify:

```bash
grep -n "prerender" frontend/package.json
```

If the path says `node scripts/prerender.mjs` it is already correct inside `frontend/`; if it references repo-root paths, rewrite to `node ./scripts/prerender.mjs`.

- [ ] **Step 3: Typecheck + build**

```bash
cd frontend && npm install && npm run build
```

Expected: `tsc --noEmit` + `vite build` + prerender all succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts frontend/package.json frontend/package-lock.json
git commit -m "frontend: /wp-api dev proxy (rewrite to FastAPI /api), prerender path fix"
```

---

### Task 4: Django bridge endpoint — POST /api/auth/warmup-token/

**Files:**
- Modify: `backend-agent/requirements.txt` (add `PyJWT==2.9.0`)
- Create: `backend-agent/core/warmup_bridge.py`
- Modify: `backend-agent/core/views.py` (import + view), `backend-agent/core/urls.py` (route)
- Test: `backend-agent/core/tests/test_warmup_token.py`

**Interfaces:**
- Consumes: authenticated DRF token request (`Authorization: Token …`).
- Produces: `{"token": "<HS256 JWT>"}` with claims exactly: `iss=agent-bridge`, `type=access`, `sub=str(user.id)`, `role` (`super_admin` if `user.platform_admin` else `client`), `email`, `workspace` (user's workspace slug), `exp` (now + 12 h), `iat`. Secret: env `WARMUP_JWT_SECRET` (shared with FastAPI `JWT_SECRET`).

- [ ] **Step 1: Write the failing test**

`backend-agent/core/tests/test_warmup_token.py`:

```python
import os
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from django.contrib.auth import get_user_model

from core.tests.base import AuthenticatedApiTestCase  # adjust to the suite's existing auth-test base; if none, create user + token inline like other tests in the suite do

SECRET = "test-bridge-secret"


class WarmupTokenTests(AuthenticatedApiTestCase):
    def test_mints_valid_bridge_jwt(self):
        os.environ["WARMUP_JWT_SECRET"] = SECRET
        res = self.client.post(
            "/api/auth/warmup-token/",
            HTTP_AUTHORIZATION=f"Token {self.token.key}",
        )
        self.assertEqual(res.status_code, 200)
        claims = pyjwt.decode(res.json()["token"], SECRET, algorithms=["HS256"])
        self.assertEqual(claims["iss"], "agent-bridge")
        self.assertEqual(claims["type"], "access")
        self.assertEqual(claims["sub"], str(self.user.id))
        self.assertEqual(claims["email"], self.user.email)
        self.assertIn(claims["role"], ("client", "super_admin"))

    def test_requires_auth(self):
        res = self.client.post("/api/auth/warmup-token/")
        self.assertEqual(res.status_code, 401)
```

If the suite has no `AuthenticatedApiTestCase`, mirror how existing tests in `backend-agent/core/tests/` create a user + DRF token (find with `grep -rl "Token " backend-agent/core/tests | head -3`) and use that pattern verbatim instead.

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend-agent && python -m pip install PyJWT==2.9.0
export DATABASE_URL=sqlite:///db-agent-test.sqlite3
python manage.py test core.tests.test_warmup_token -v 2
```

Expected: FAIL — URL not found (404).

- [ ] **Step 3: Implement**

`backend-agent/core/warmup_bridge.py`:

```python
"""Mint the HS256 bridge JWT consumed by backend-warmup (FastAPI)."""
import os
import time

import jwt

TTL_SECONDS = 12 * 60 * 60


def mint_warmup_token(*, user, workspace_slug: str) -> str:
    secret = os.environ.get("WARMUP_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("WARMUP_JWT_SECRET is not set — cannot mint bridge tokens")
    now = int(time.time())
    claims = {
        "iss": "agent-bridge",
        "type": "access",
        "sub": str(user.id),
        "role": "super_admin" if getattr(user, "platform_admin", False) else "client",
        "email": user.email,
        "workspace": workspace_slug,
        "iat": now,
        "exp": now + TTL_SECONDS,
    }
    return jwt.encode(claims, secret, algorithm="HS256")
```

In `backend-agent/core/views.py` (follow the file's existing import style; workspace slug comes from the billing line's workspace relation — find the accessor with `grep -n "workspace" backend-agent/core/models.py | head -10` and use the real field; if a user has no workspace, pass `"default"`):

```python
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def warmup_token(request):
    from core.warmup_bridge import mint_warmup_token

    ws = getattr(request.user, "workspace", None)
    slug = getattr(ws, "slug", None) or "default"
    return Response({"token": mint_warmup_token(user=request.user, workspace_slug=slug)})
```

In `backend-agent/core/urls.py`, beside the other auth routes:

```python
path("auth/warmup-token/", views.warmup_token, name="warmup-token"),
```

- [ ] **Step 4: Run tests — new passes, suite green**

```bash
python manage.py test core.tests.test_warmup_token -v 2
python manage.py test
```

Expected: new tests PASS; full suite green (same count as before + 2).

- [ ] **Step 5: Commit**

```bash
git add backend-agent/requirements.txt backend-agent/core/warmup_bridge.py backend-agent/core/views.py backend-agent/core/urls.py backend-agent/core/tests/test_warmup_token.py
git commit -m "agent: POST /api/auth/warmup-token — mint HS256 agent-bridge JWT (FastAPI contract)"
```

---

### Task 5: FastAPI bridge auth — accept agent-bridge JWT + auto-provision

**Files:**
- Modify: `backend-warmup/app/config.py` (add `agent_bridge_enabled`), `backend-warmup/app/api/deps.py` (bridge branch in `get_current_user`)
- Test: `backend-warmup/tests/test_bridge_auth.py`

**Interfaces:**
- Consumes: bridge JWT claims from Task 4 (exact claims in Global Constraints); `decode_token` from `app.services.security` (same shared secret = `settings.jwt_secret`).
- Produces: `get_current_user` resolves bridge JWTs to a provisioned `User` (email-unique, passwordless, `role=client|super_admin`, `email_verified=True`, `onboarding_status=mailbox_pending`). Normal WarmPulse JWTs unchanged.

- [ ] **Step 1: Write the failing test**

`backend-warmup/tests/test_bridge_auth.py` (uses the suite's existing `client` fixture from `tests/conftest.py:48`; mirror an existing auth test for any setup it needs):

```python
"""Agent-bridge JWT: FastAPI provisions passwordless users from Django-minted tokens."""
import time

import jwt

from app.db.models.users import OnboardingStatus, User, UserRole


def _bridge_token(settings, *, sub="17", email="bridge@shailog.com", role="client"):
    now = int(time.time())
    claims = {
        "iss": "agent-bridge", "type": "access", "sub": sub,
        "role": role, "email": email, "workspace": "demo",
        "iat": now, "exp": now + 3600,
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


class TestBridgeAuth:
    def test_bridge_jwt_creates_user_and_authenticates(self, client, settings, db_session):
        token = _bridge_token(settings)
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        user = db_session.query(User).filter_by(email="bridge@shailog.com").one()
        assert user.hashed_password is None
        assert user.email_verified is True
        assert user.onboarding_status == OnboardingStatus.mailbox_pending
        assert user.role == UserRole.client

    def test_bridge_is_idempotent(self, client, settings, db_session):
        for _ in range(2):
            res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {_bridge_token(settings)}"})
            assert res.status_code == 200
        assert db_session.query(User).filter_by(email="bridge@shailog.com").count() == 1

    def test_platform_admin_maps_to_super_admin(self, client, settings, db_session):
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {_bridge_token(settings, role='super_admin')}"})
        assert res.status_code == 200
        assert db_session.query(User).filter_by(email="bridge@shailog.com").one().role == UserRole.super_admin

    def test_rejects_bad_issuer(self, client, settings):
        now = int(time.time())
        bad = jwt.encode({"iss": "other", "type": "access", "sub": "1", "role": "client",
                          "exp": now + 60}, settings.jwt_secret, algorithm="HS256")
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert res.status_code == 401
```

Adjust fixture names (`db_session`, `settings`) to the conftest's actual names — check `backend-warmup/tests/conftest.py` first (`grep -n "def " backend-warmup/tests/conftest.py`). `/api/auth/me` must exist — confirm the route with `grep -rn "\"/me\"\|/me" backend-warmup/app/api/routes/auth.py | head -3`; if the me-route differs, use any authed GET route that exists.

- [ ] **Step 2: Run, verify failure**

```bash
cd backend-warmup && python -m pip install -e ".[dev]"
python -m pytest tests/test_bridge_auth.py -v
```

Expected: first three tests FAIL (404/401 — bridge user never provisioned), `test_rejects_bad_issuer` may already pass.

- [ ] **Step 3: Implement the bridge branch in deps.py**

In `backend-warmup/app/api/deps.py`, extend `get_current_user` (keep the existing normal path intact):

```python
_BRIDGE_ISSUER = "agent-bridge"


async def _provision_bridge_user(session: AsyncSession, claims: dict[str, Any]) -> User:
    email = str(claims.get("email", "")).lower()
    if not email:
        raise HTTPException(status_code=401, detail="Bridge token missing email")
    role = UserRole.super_admin if claims.get("role") == "super_admin" else UserRole.client
    user = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            hashed_password=None,
            role=role,
            email_verified=True,
            onboarding_status=OnboardingStatus.mailbox_pending,
        )
        session.add(user)
        await session.commit()
    return user
```

At the top of `get_current_user`, after claims are decoded:

```python
    if claims.get("iss") == _BRIDGE_ISSUER:
        return await _provision_bridge_user(session, claims)
```

Add to the existing imports at the top of `deps.py`: `OnboardingStatus` and `UserRole` from `app.db.models.users`. Follow the existing function's session-acquisition pattern — it already has an `AsyncSession` dependency; place the branch right after the claims decode.

- [ ] **Step 4: Run tests — new passes, suite green**

```bash
python -m pytest tests/test_bridge_auth.py -v
python -m pytest
```

Expected: bridge tests PASS; full WarmPulse suite green (zero regressions — mobile-facing paths untouched).

- [ ] **Step 5: Commit**

```bash
git add backend-warmup/app/api/deps.py backend-warmup/tests/test_bridge_auth.py
git commit -m "warmup: accept agent-bridge JWTs — auto-provision passwordless users, map platform_admin"
```

---

### Task 6: Frontend warmup API client + Warmup section stub

**Files:**
- Create: `frontend/src/lib/warmupApi.ts`, `frontend/src/pages/WarmupPage.tsx`
- Modify: `frontend/src/lib/types.ts` (`PageKey` + `PipelineTab` untouched — Warmup is a top-level page), `frontend/src/App.tsx` (PAGES entry), `frontend/src/components/Sidebar.tsx` (nav item)
- Test: `scripts/e2e/flow.py` (copied from the sales-agent E2E, extended — see Task 8)

**Interfaces:**
- Consumes: `POST /api/auth/warmup-token/` (Task 4), `/wp-api/health` (gateway contract, Task 2/3).
- Produces: `getWarmupToken(): Promise<string>` (acquire + cache in `localStorage['warmpulse:wp-token']`, re-acquire once on 401); `warmupGet<T>(path: string): Promise<T>` for later page-port tasks (paths passed WITHOUT `/wp-api` prefix, e.g. `"api/mailboxes"`).

- [ ] **Step 1: warmupApi.ts**

```ts
/** WarmPulse FastAPI client — Bearer bridge JWT on /wp-api (gateway rewrites to /api). */
import { fetchJson } from './api';

const TOKEN_KEY = 'warmpulse:wp-token';
let inflight: Promise<string> | null = null;

export async function getWarmupToken(): Promise<string> {
  const cached = localStorage.getItem(TOKEN_KEY);
  if (cached) return cached;
  if (!inflight) {
    inflight = fetchJson<{ token: string }>('/auth/warmup-token/', { method: 'POST', body: '{}' })
      .finally(() => { inflight = null; });
  }
  const { token } = await inflight;
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export function clearWarmupToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function wpFetch(path: string, init?: RequestInit, retry = true): Promise<Response> {
  const token = await getWarmupToken();
  const res = await fetch(`/wp-api/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    clearWarmupToken();
    return wpFetch(path, init, false);
  }
  return res;
}

export async function warmupGet<T>(path: string): Promise<T> {
  const res = await wpFetch(path);
  if (!res.ok) throw new Error(`warmup API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function warmupHealth(): Promise<boolean> {
  try {
    const res = await fetch('/wp-api/health');
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: WarmupPage stub (real pages port in the next plan)**

`frontend/src/pages/WarmupPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { warmupHealth } from '../lib/warmupApi';

export function WarmupPage() {
  const [up, setUp] = useState<boolean | null>(null);
  useEffect(() => { warmupHealth().then(setUp); }, []);
  return (
    <section className="page">
      <header className="page-head">
        <h1>Warmup</h1>
        <p className="page-sub">Mailbox warmup network — dashboards arrive in the next phase.</p>
      </header>
      <div className={`panel warmup-status${up === null ? ' probing' : up ? ' up' : ' down'}`}>
        {up === null ? 'Checking warmup backend…' : up ? 'Warmup backend: live · FastAPI' : 'Warmup backend: not reachable (start backend-warmup on :8001)'}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire nav (mirror the existing patterns)**

`types.ts`: extend `PageKey` union with `'warmup'`. `App.tsx`: add `warmup: () => <WarmupPage />` to `PAGES`. `Sidebar.tsx`: extend `NAV` with `{ key: 'warmup', label: 'Warmup', icon: IconLoop }` (reuse an icon; a dedicated one lands with the rebrand). On logout (`store.ts` or wherever the Django token is cleared) also call `clearWarmupToken()` — find the existing logout/token-clear with `grep -rn "agentic-ai:token" frontend/src/lib | head -5` and clear both keys there.

- [ ] **Step 4: Build + quick UI check**

```bash
cd frontend && npm run build
```

Expected: build green. Manual/E2E check happens in Task 8.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "frontend: Warmup section stub + warmupApi bridge client (/wp-api, JWT from /api/auth/warmup-token)"
```

---

### Task 7: Rebrand to WarmPulse (violet) — tokens, titles, landing

**Files:**
- Modify: `frontend/src/styles.css` (accent/brand custom properties), `frontend/index.html` (title + prerender meta), `frontend/src/pages/LandingPage.tsx` (name/copy), `frontend/src/pages/LoginPage.tsx` (wordmark/copy), public logo assets under `frontend/public/`

**Interfaces:**
- Consumes: WarmPulse palette from the WarmPulse DESIGN.md (`#7C5CFF` dark accent, `#6B49FF` light accent, Inter, status hues per DESIGN.md light table).
- Produces: every user-visible string/logo says WarmPulse; CSS custom-property names unchanged (only values swap).

- [ ] **Step 1: Swap brand tokens in styles.css**

Find the root custom properties (`grep -n ":root\|--accent\|--accent-strong" frontend/src/styles.css | head -20`). Change the accent family values: `--accent: #7C5CFF`, `--accent-strong: #6B49FF`, hover `#8D72FF`; update landing hero/marketing gradient tokens if separately defined. Do NOT rename properties — later CSS and pages reference them. If the shell has a light theme block, use `#6B49FF` there.

- [ ] **Step 2: Titles + landing + login copy**

`index.html`: `<title>WarmPulse — Inbox Warmup & AI Outbound</title>`; update prerendered meta description to cover warmup + outreach. `LandingPage.tsx`: replace "Shailog Technologies"/"Shailog AI" brand strings with "WarmPulse", hero line stays "Find the Lead. Spot the Gap. Win the Deal." plus a second line "Keep every sender warm. Land every send."; how-it-works copy gains a warmup step (WarmPulse warms your mailbox → agent finds leads → drafts → you approve → sends land in inbox). `LoginPage.tsx`: wordmark + "Sign in to your workspace" stays. Replace `frontend/public/shailog-*.png` usages only if a WarmPulse mark asset exists in `frontend-warmpulse/` (`ls frontend-warmpulse/public | grep -i logo`); otherwise keep the mark and file an asset follow-up — do not ship a broken img.

- [ ] **Step 3: Build + visual check**

```bash
cd frontend && npm run build
```

Expected: build green; spot-check with the dev server screenshot (Playwright `page.screenshot` of `/` and login) — violet accents present, no missing images (console has zero 404s).

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "brand: WarmPulse violet across shell, landing, login, titles — sales-agent layout kept"
```

---

### Task 8: E2E suite in-repo + full verification pass

**Files:**
- Create: `scripts/e2e/flow.py` (adapted from the sales-agent E2E: login → shell pages → Warmup stub → logout)
- Create: `scripts/e2e/README.md` (how to run: 3 dev servers + script)
- Modify: root `README.md` (monorepo map + dev quickstart), `docs/DEPLOY-agent.md` cross-link note

**Interfaces:**
- Consumes: everything above.
- Produces: green E2E gate for the whole merged stack; the same script re-runs before every future push.

- [ ] **Step 1: Bring up all three dev servers**

```bash
# Terminal 1 — Django
cd backend-agent && export DATABASE_URL=sqlite:///db-agent.sqlite3 && python -m pip install -r requirements.txt && python manage.py migrate && python manage.py seed_demo && python manage.py runserver 127.0.0.1:8000
# Terminal 2 — FastAPI (follow backend-warmup README quickstart: postgres/redis via docker compose db redis, alembic upgrade head, uvicorn app.main:app --port 8001)
# Terminal 3 — Vite
cd frontend && npm run dev
```

- [ ] **Step 2: Port + extend the E2E script**

Copy the sales-agent Playwright flow (login as `operator`/`operator-demo-2026`, sidebar nav incl. new Warmup item, pipeline tabs, logout reachability) and add:

```python
    # Warmup section: stub renders + health badge goes live
    page.locator("button.nav-item", has_text="Warmup").first.click()
    page.wait_for_timeout(1200)
    check("warmup: section renders", page.locator("body").inner_text().find("Warmup") >= 0)
    check("warmup: health live", page.locator(".warmup-status.up").count() > 0,
          "backend-warmup not reachable on :8001")
```

- [ ] **Step 3: Run everything — the full gate**

```bash
cd backend-agent && python manage.py test        # Django suite
cd ../backend-warmup && python -m pytest          # FastAPI suite
cd ../frontend && npm run build                   # tsc + vite + prerender
cd .. && python scripts/e2e/flow.py               # E2E
```

Expected: all four green. Any red = fix before commit (this is the push gate).

- [ ] **Step 4: Commit + tag the milestone**

```bash
git add scripts/e2e README.md docs/DEPLOY-agent.md
git commit -m "e2e: merged-stack Playwright gate + monorepo README — foundation complete"
```

---

## Follow-up plan (NOT this one)

`2026-11-12-warmup-admin-port.md` — ports WarmPulse client pages (Dashboard → Mailboxes → Onboarding → Peer → Reports → Alerts) and the role-gated Admin section from `frontend-warmpulse/src/pages/client|admin/` into `frontend/src/pages/warmup/|admin/`, page by page, on top of this foundation. Written after this plan lands, with the real shell + `warmupApi` in hand.
