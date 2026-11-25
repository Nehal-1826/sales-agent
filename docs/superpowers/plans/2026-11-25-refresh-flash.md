# Refresh Flash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person who refreshes any page of WarmPulse sees a plain loading mark instead of the marketing landing page.

**Architecture:** The build puts the pre-rendered marketing page inside `dist/index.html`, and nginx serves that file for every route. A tiny inline script in that one file checks — before the first paint — whether the browser holds a sign-in; if so it hides `#root` and shows `#boot` until React has drawn its first screen. The pre-render keeps the guard in the home file only, so marketing pages keep their instant first paint.

**Tech Stack:** Vite HTML template (`frontend/index.html`), the pre-render step (`frontend/scripts/prerender.mjs`), React (`frontend/src/App.tsx`), Playwright browser gate (`scripts/e2e/flow.py`).

Spec: `docs/superpowers/specs/2026-11-25-superadmin-controls-2fa-refresh-design.md` § 1.

## Global Constraints

- The template must keep the exact string `<div id="root"></div>` (the pre-render finds it).
- The sign-in key is `agentic-ai:token` (the key `lib/transport.ts` and `App.tsx` read).
- Nothing on the server changes. No new dependencies.
- Signed-out visitors at `/` and every marketing page must still be painted at once.
- Local stack for the browser gate: Django on :8000, FastAPI on :8001, Vite on :5173 (`http://localhost:5173`). Build with `npm run build` in `frontend/` first — the checks read `frontend/dist`.
- No push, no deploy (owner's rule).

---

### Task 1: The guard in the page template, kept in the home file only

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/scripts/prerender.mjs:36-51`
- Test: `scripts/e2e/flow.py` (dist section, ~line 1022)

**Interfaces:**
- Produces: `dist/index.html` with `data-session` guard markup and `#boot`; every other pre-rendered page without either. Task 2 relies on `#boot` and on the attribute name `data-session` on `<html>`.

- [x] **Step 1: Write the failing checks (build level)**

In `scripts/e2e/flow.py`, in the dist section, right after the `check("dist: route html files found", …)` call and before the `for html in route_htmls:` loop, add:

```python
    home_html = (DIST / "index.html").read_text(encoding="utf-8", errors="replace")
    check("dist: the home file hides the marketing page for a signed-in browser before the first paint",
          "data-session" in home_html and 'id="boot"' in home_html and "app-boot-guard" not in home_html,
          f"guard={'data-session' in home_html} mark={'id=\"boot\"' in home_html}")
    pricing_html = DIST / "pricing" / "index.html"
    pricing_src = pricing_html.read_text(encoding="utf-8", errors="replace") if pricing_html.is_file() else ""
    check("dist: marketing pages keep their instant first paint (no loading guard)",
          bool(pricing_src) and "data-session" not in pricing_src and 'id="boot"' not in pricing_src)
```

- [x] **Step 2: Run the checks to verify they fail**

Build first (the dist section is skipped without `frontend/dist`):

Run: `cd frontend && npm run build`
Run: `python scripts/e2e/flow.py 2>&1 | grep -E "dist: the home file|dist: marketing pages|=== SUMMARY"` (local stack up)

Expected: `FAIL  dist: the home file hides the marketing page … — guard=False mark=False` and `PASS  dist: marketing pages keep …`.

- [x] **Step 3: Add the guard to the template**

In `frontend/index.html`, replace the line `    <!--app-head-->` with:

```html
    <!--app-boot-guard-->
    <script>
      // The home file also serves every app route and carries the pre-rendered
      // marketing page. Someone who is signed in must not see that page before
      // the app has loaded: hide it before the first paint and show a plain mark.
      (function () {
        try {
          if (localStorage.getItem('agentic-ai:token')) {
            document.documentElement.setAttribute('data-session', '1');
          }
        } catch (e) {
          /* storage unavailable: nothing to hide for */
        }
      })();
    </script>
    <style>
      html[data-session='1'] #root {
        visibility: hidden;
      }
      #boot {
        display: none;
      }
      html[data-session='1'] #boot {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        background: var(--bg, #07060a);
        color: var(--text, #f5f2ed);
        font: 600 15px/1.4 Inter, system-ui, sans-serif;
      }
      #boot img {
        width: 44px;
        height: 44px;
      }
      #boot small {
        font: 500 13px/1.4 Inter, system-ui, sans-serif;
        color: var(--text-2, #b9b4c0);
      }
    </style>
    <!--/app-boot-guard-->
    <!--app-head-->
```

Then replace

```html
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
```

with

```html
  <body>
    <div id="root"></div>
    <!--app-boot-mark-->
    <div id="boot" role="status" aria-live="polite" aria-busy="true">
      <img src="/warmpulse-logo.svg" alt="" />
      <span>WarmPulse</span>
      <small>Loading…</small>
    </div>
    <!--/app-boot-mark-->
    <script type="module" src="/src/main.tsx"></script>
  </body>
```

- [x] **Step 4: Keep the guard in the home file only**

In `frontend/scripts/prerender.mjs`, after the `baseTemplate` definition (the chain of `.replace(...)` calls on `template`) add:

```js
// The loading guard (index.html) belongs to ONE file: the home page, which
// is also the fallback for every app route. The other marketing pages are
// public and must keep their instant first paint, so it is stripped from them.
const stripGuard = (html) =>
  html
    .replace(/<!--app-boot-guard-->[\s\S]*?<!--\/app-boot-guard-->\s*/g, '')
    .replace(/<!--app-boot-mark-->[\s\S]*?<!--\/app-boot-mark-->\s*/g, '');
// … and the home page keeps it, minus the marker comments themselves
const keepGuard = (html) => html.replace(/<!--\/?app-boot-(?:guard|mark)-->/g, '');
```

and change the page assembly in the loop from

```js
  const page = baseTemplate
    .replace('<!--app-head-->', head)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
```

to

```js
  const shell = route.path === '/' ? keepGuard(baseTemplate) : stripGuard(baseTemplate);
  const page = shell
    .replace('<!--app-head-->', head)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>');
```

- [x] **Step 5: Build and re-run the checks**

Run: `cd frontend && npm run build`
Run: `grep -c "data-session" frontend/dist/index.html frontend/dist/pricing/index.html`

Expected: `frontend/dist/index.html:1` (or more) and `frontend/dist/pricing/index.html:0`.

Run: `python scripts/e2e/flow.py 2>&1 | grep -E "dist: the home file|dist: marketing pages|=== SUMMARY"`

Expected: both `PASS`. (Other checks are unchanged; the browser check in Task 2 is not there yet.)

- [x] **Step 6: Commit**

```bash
git add frontend/index.html frontend/scripts/prerender.mjs scripts/e2e/flow.py
git commit -m "fix(app): the page template hides the pre-rendered marketing page for a signed-in browser before the first paint"
```

---

### Task 2: The app shows itself, and the browser gate proves the flash is gone

**Files:**
- Modify: `frontend/src/App.tsx:37-42` (the top-level `App`)
- Test: `scripts/e2e/flow.py` (signed-out control before the sign-in; signed-in check after "auth: app shell reached")

**Interfaces:**
- Consumes: `#boot` and the `data-session` attribute on `<html>` (Task 1).
- Produces: none (end of this plan).

- [x] **Step 1: Write the failing browser checks**

In `scripts/e2e/flow.py`:

(a) Add the import at the top, next to the other `urllib` imports:

```python
from urllib.parse import urlparse
```

(b) Right after `BASE = pick_base()` / the `WP_UP` line (before `def django_python`), add the helper:

```python
def built_like_nginx(pending):
    """Serve the BUILT files the way nginx does in production: a real file from
    frontend/dist, anything else the home file (which carries the pre-rendered
    marketing page — exactly what every app route gets). The API goes to the
    dev server. `pending` is a list: the app's own JavaScript is left pending
    there instead of answered, which is the moment the flash used to happen in."""
    types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
             ".svg": "image/svg+xml", ".png": "image/png", ".mp4": "video/mp4",
             ".json": "application/json", ".txt": "text/plain", ".xml": "application/xml"}
    home = (DIST / "index.html").read_text(encoding="utf-8")

    def handler(route):
        path = urlparse(route.request.url).path
        if path.startswith("/api/") or path.startswith("/wp-api/"):
            return route.continue_()
        if pending is not None and path.startswith("/assets/index-") and path.endswith(".js"):
            pending.append(route)
            return
        file = DIST / path.lstrip("/")
        if file.is_file() and file.suffix in types:
            return route.fulfill(status=200, body=file.read_bytes(), content_type=types[file.suffix])
        return route.fulfill(status=200, content_type=types[".html"], body=home)

    return handler


MARKETING_PAINTED = ("() => { const el = document.querySelector('.lp-nav');"
                     " return !!el && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }); }")
# (checkVisibility, not getClientRects: the guard hides with `visibility`, and
#  a hidden element still has layout boxes)
```

(c) In section 1 (landing), right before `page.locator("a, button", has_text="Sign in").first.click()`, add the signed-out control:

```python
    # ── 1b. Signed-out visitors must keep the marketing page at once, even
    # while the app's own code is still loading (the loading guard of Task 1
    # must not touch them). Built files, served like nginx.
    if (DIST / "index.html").is_file():
        held = []
        page.route(f"{BASE}/**", built_like_nginx(held))
        page.goto(BASE + "/", wait_until="commit")
        page.wait_for_timeout(1200)
        check("refresh flash: a signed-out visitor gets the marketing page at once (app code still loading)",
              held and page.evaluate(MARKETING_PAINTED) is True,
              f"app-code requests held={len(held)} marketing painted={page.evaluate(MARKETING_PAINTED)}")
        for r in held:
            built_like_nginx(None)(r)
        page.unroute(f"{BASE}/**")
        page.goto(BASE + "/")
        page.wait_for_load_state("networkidle")
```

(d) Right after the two checks `auth: Django token stored` and `auth: app shell reached` (before `shell: side-logout visible in rail after login`), add the signed-in check:

```python
    # ── 2b. A refresh must not show the marketing page to someone who is
    # signed in. Same built files, the app's JavaScript left pending — the
    # moment the landing used to be painted.
    if (DIST / "index.html").is_file():
        held = []
        page.route(f"{BASE}/**", built_like_nginx(held))
        page.goto(BASE + "/leads", wait_until="commit")
        page.wait_for_timeout(1200)
        painted = page.evaluate(MARKETING_PAINTED)
        mark = page.locator("#boot").is_visible()
        check("refresh flash: a signed-in person does not see the marketing page while the app loads",
              bool(held) and painted is False, f"app-code requests held={len(held)} marketing painted={painted}")
        check("refresh flash: a plain loading mark is shown meanwhile", mark)
        page.screenshot(path=str(SHOTS / "02b-refresh-loading-mark.png"))
        for r in held:
            built_like_nginx(None)(r)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        check("refresh flash: then the app appears and the mark is gone",
              page.locator("aside.sidebar").is_visible() and page.locator("#boot").count() == 0)
        page.unroute(f"{BASE}/**")
        page.goto(BASE + "/")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(800)
```

- [x] **Step 2: Run the gate to see the signed-in checks fail**

Run (local stack up, after `npm run build`): `python scripts/e2e/flow.py 2>&1 | grep -E "refresh flash|=== SUMMARY"`

Expected:
`PASS refresh flash: a signed-out visitor gets the marketing page at once`,
`FAIL refresh flash: a signed-in person does not see the marketing page while the app loads — … marketing painted=True`,
`FAIL refresh flash: a plain loading mark is shown meanwhile`,
`PASS refresh flash: then the app appears and the mark is gone` (nothing to lift yet).

- [x] **Step 3: Let the app show itself**

In `frontend/src/App.tsx`, replace the top-level component:

```tsx
/** Public, prerendered marketing pages (/pricing, /privacy …) render without the auth gate. */
export default function App() {
  const path = window.location.pathname;
  if (isMarketingSubpage(path)) return <MarketingPage path={routeMeta(path)!.path} />;
  return <AppGate />;
}
```

with

```tsx
/** Public, prerendered marketing pages (/pricing, /privacy …) render without the auth gate. */
export default function App() {
  const path = window.location.pathname;
  // The home file also serves every app route and carries the pre-rendered
  // marketing page; the page template hides it before the first paint when
  // this browser is signed in (index.html) and shows a plain loading mark.
  // The app has now drawn its first screen — whatever it is — so let it show.
  useEffect(() => {
    document.documentElement.removeAttribute('data-session');
    document.getElementById('boot')?.remove();
  }, []);
  if (isMarketingSubpage(path)) return <MarketingPage path={routeMeta(path)!.path} />;
  return <AppGate />;
}
```

- [x] **Step 4: Build, then run the gate to see them pass**

Run: `cd frontend && npm run build`

Run: `python scripts/e2e/flow.py 2>&1 | grep -E "refresh flash|dist: the home file|dist: marketing pages|^FAIL|=== SUMMARY"`

Expected: the four `refresh flash` checks `PASS`, both `dist:` checks `PASS`, no `FAIL`, summary `138/138` (132 + 2 build checks + 4 browser checks).

- [x] **Step 5: Commit**

```bash
git add frontend/src/App.tsx scripts/e2e/flow.py
git commit -m "fix(app): the app lifts the loading guard once its first screen is drawn; the browser gate serves the built files like nginx and checks the refresh"
```
