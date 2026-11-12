"""WarmPulse merged-stack E2E gate (Task 8, merge/agent-foundation).

One Playwright pass over the live dev stack:
  landing (rebrand + SEO assets) -> login (operator demo) -> sidebar nav
  -> Leads tabs -> #/warmup deep link + health panel -> logout (token purge)
plus a browser-less dist/ check (one meta description + PNG favicon per route).

Shell & UX batch (Task 6) additions: sign-out reachable in the rail (desktop
and in the 375px drawer), sidebar is a full-height rail (no bottom nav),
signup password rules flip fail->pass live, removed WarmPulse/WhatsApp
strings absent from Settings, footer slim (<=6 links).

Prereqs (see scripts/e2e/README.md):
  Django on :8000, FastAPI on :8001, Vite dev on :5173 (IPv4 or IPv6),
  `npm run build` in frontend/ if you want the dist checks counted.

If FastAPI is down the warmup-live check flips to SKIPPED and the
"not reachable" panel is asserted instead — the gate still passes.
"""
import io
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist"
SHOTS = ROOT / ".superpowers" / "sdd" / "e2e-shots"
SHOTS.mkdir(parents=True, exist_ok=True)

USERNAME, PASSWORD = "operator", "operator-demo-2026"
VIOLET = "rgb(107, 73, 255)"  # --accent #6b49ff


def http_ok(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def pick_base() -> str:
    """Vite binds when READY and may take IPv6 [::1] only — probe both."""
    for base in ("http://127.0.0.1:5173", "http://[::1]:5173", "http://localhost:5174"):
        if http_ok(base):
            return base
    sys.exit("FAIL  no Vite dev server on :5173/:5174 — start `npm run dev` first")


BASE = pick_base()
WP_UP = http_ok("http://127.0.0.1:8001/health")

results = []


def check(name: str, cond, detail: str = "") -> None:
    results.append((name, bool(cond)))
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  — {detail}" if detail and not cond else ""))


def skip(name: str, reason: str) -> None:
    results.append((name, None))
    print(f"SKIP  {name}  — {reason}")


def safe_text(loc) -> str:
    """inner_text() for a condition/detail arg that must never raise: a
    missing element yields a placeholder so the check FAILs with detail
    instead of aborting the remaining checks + summary."""
    try:
        return loc.inner_text()
    except Exception as exc:  # noqa: BLE001
        return f"<element missing: {type(exc).__name__}>"


print(f"# base={BASE}  fastapi={'up' if WP_UP else 'DOWN'}")
print(f"# shots -> {SHOTS}")

console_errors: list[str] = []
bad_responses: list[tuple[str, int]] = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    page.on("console", lambda m: console_errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
    page.on("response", lambda r: bad_responses.append((r.url, r.status)) if r.status >= 400 else None)
    ok_api: list[str] = []
    page.on("response", lambda r: ok_api.append(r.url) if "/api/" in r.url and r.status < 400 else None)

    # ── 1. Landing page (signed out) ────────────────────────────────
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    check("landing: <title> contains WarmPulse", "WarmPulse" in page.title(), page.title())
    h1 = safe_text(page.locator("h1.lp-hero-line"))
    check("landing: hero H1 'Find the Lead'", "Find the Lead" in h1, h1)
    tagline = safe_text(page.locator(".lp-hero-tagline"))
    check("landing: tagline 'Keep every sender warm'", "Keep every sender warm" in tagline, tagline)
    cards = page.locator(".lp-card h3").all_inner_texts()
    first_card = safe_text(page.locator(".lp-card").first).lower()
    check("landing: first how-it-works card mentions warming",
          bool(cards) and "warm" in cards[0].lower() and "warm" in first_card,
          f"cards={cards[:2]}")
    for asset in ("/warmpulse-mark.svg", "/warmpulse-logo.svg", "/warmpulse-logo.png"):
        check(f"asset 200: {asset}", http_ok(BASE + asset))
    cta_color = page.locator("a.lp-cta-solid").first.evaluate("el => getComputedStyle(el).backgroundImage")
    check("rebrand: violet on primary CTA", "107, 73, 255" in cta_color, cta_color)
    # Task A4: slim footer — wordmark, contact, legal only
    footer_links = page.locator("footer.lp-footer a").count()
    check("footer: slim — ≤6 links", footer_links <= 6, f"{footer_links} links")
    page.screenshot(path=str(SHOTS / "01-landing.png"))

    # ── 2. Sign in -> login page ────────────────────────────────────
    page.locator("a, button", has_text="Sign in").first.click()
    page.wait_for_load_state("networkidle")
    wordmark = safe_text(page.locator(".login-title strong"))
    check("login: wordmark 'WarmPulse'", wordmark.strip() == "WarmPulse", wordmark)
    btn_color = page.locator("button.btn-primary").first.evaluate("el => getComputedStyle(el).backgroundColor")
    check("rebrand: primary button is violet", btn_color == VIOLET, btn_color)
    user_in = page.locator("input[autocomplete=username]")
    pass_in = page.locator("input[type=password]")
    check("login: form visible", user_in.count() == 1 and pass_in.count() == 1)
    user_in.fill(USERNAME)
    pass_in.fill(PASSWORD)
    page.screenshot(path=str(SHOTS / "02-login.png"))
    pass_in.press("Enter")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    check("auth: Django token stored", page.evaluate("() => !!localStorage.getItem('agentic-ai:token')"))
    check("auth: app shell reached", page.locator("aside.sidebar").count() == 1,
          page.locator("body").inner_text()[:120].replace("\n", " "))
    # Task A1: sign-out is a full row in the sidebar rail — reachable on desktop
    check("shell: side-logout visible in rail after login",
          page.locator("button.side-logout").is_visible())
    page.screenshot(path=str(SHOTS / "03-after-login.png"))

    # ── 3. Sidebar nav: every page renders ─────────────────────────
    nav_labels = ["Home", "Approvals", "Replies", "Tasks", "Leads", "Activity",
                  "Assistant", "Warmup", "Settings"]
    for label in nav_labels:
        page.locator("button.nav-item", has_text=label).first.click()
        page.wait_for_timeout(1100)
        body = page.locator("body").inner_text()
        check(f"nav: {label} renders", len(body) > 200 and "Sign in" not in body)
        page.screenshot(path=str(SHOTS / f"04-{label.lower()}.png"))

    # ── 3b. Settings DOM: removed WarmPulse/WhatsApp strings stay gone (A3)
    page.locator("button.nav-item", has_text="Settings").first.click()
    page.wait_for_timeout(1200)
    settings_text = page.locator("body").inner_text()
    check('settings: "WarmPulse (optional)" absent from DOM', "WarmPulse (optional)" not in settings_text)
    check('settings: "Risk of a ban" absent from DOM', "Risk of a ban" not in settings_text)

    # ── 4. Leads sub-tabs (pipeline-tab analog) ─────────────────────
    page.locator("button.nav-item", has_text="Leads").first.click()
    page.wait_for_timeout(800)
    for tab in ["All leads", "Board", "Reports"]:
        t = page.locator(".subtab", has_text=tab).first
        if t.count():
            t.click()
            page.wait_for_timeout(800)
            check(f"leads tab: {tab}", page.locator(".subtab.active", has_text=tab).count() > 0)
        else:
            check(f"leads tab: {tab}", False, "subtab not found")
    page.screenshot(path=str(SHOTS / "05-leads-tabs.png"))

    # ── 5. Warmup: sidebar order, deep link, TopBar, health panel ──
    order = page.evaluate(
        """() => Array.from(document.querySelectorAll('button.nav-item span'))
                 .map(s => s.textContent.trim())"""
    )
    try:
        ia, iw, is_ = order.index("Assistant"), order.index("Warmup"), order.index("Settings")
        check("nav order: Assistant -> Warmup -> Settings", ia < iw < is_, str(order))
    except ValueError:
        check("nav order: Assistant -> Warmup -> Settings", False, str(order))

    page.goto(BASE + "/#/warmup")
    page.wait_for_timeout(1800)
    top_title = safe_text(page.locator(".topbar-title"))
    check("warmup: deep link stays on Warmup (TopBar title)", top_title.strip() == "Warmup", top_title)
    body = page.locator("body").inner_text()
    check("warmup: page renders (no bounce home)", "Warmup backend" in body, body[:120])
    check("warmup: sidebar item present", page.locator("button.nav-item", has_text="Warmup").count() == 1)
    page.wait_for_timeout(1500)  # let the health probe settle
    ws = page.locator(".warmup-status")
    ws_txt = safe_text(ws)
    if WP_UP:
        check("warmup: health live · FastAPI",
              page.locator(".warmup-status.up").count() > 0 and "live · FastAPI" in ws_txt,
              ws_txt)
    else:
        check("warmup: not-reachable panel when FastAPI down",
              page.locator(".warmup-status.down").count() > 0 and "not reachable" in ws_txt,
              ws_txt)
        skip("warmup: health live · FastAPI", "FastAPI not reachable on :8001")
    page.screenshot(path=str(SHOTS / "06-warmup.png"))

    # ── 6. Live-backend proof + network hygiene ────────────────────
    page.locator("button.nav-item", has_text="Home").first.click()
    page.wait_for_timeout(1500)
    check("live: /api/ calls succeeded", len(ok_api) > 5, f"{len(ok_api)} ok /api/ responses")

    # ── 6b. 375px: full-height rail, no bottom nav; sign-out in drawer (A1)
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(500)
    rail = page.locator("aside.sidebar").bounding_box()
    check("mobile: sidebar is a full-height rail (>500px, not a bottom strip)",
          bool(rail) and rail["height"] > 500, str(rail))
    page.locator("button.menu-btn").click()
    page.wait_for_timeout(500)
    check("mobile: side-logout reachable after opening drawer",
          page.locator("button.side-logout").is_visible())
    page.screenshot(path=str(SHOTS / "06b-mobile-drawer.png"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    page.set_viewport_size({"width": 1920, "height": 1080})
    page.wait_for_timeout(400)

    # ── 7. Logout — both token namespaces must be gone ─────────────
    page.locator("button.side-logout").first.click()
    page.wait_for_timeout(1500)
    check("logout: returns to sign-in", page.locator("input[type=password]").count() > 0)
    leftovers = page.evaluate(
        """() => ['agentic-ai:token', 'warmpulse:wp-token']
                 .filter(k => localStorage.getItem(k) !== null)"""
    )
    check("logout: neither agentic-ai:token nor warmpulse:wp-token remains", not leftovers, str(leftovers))
    page.screenshot(path=str(SHOTS / "07-logged-out.png"))

    # ── 7b. Signup: password rules flip fail -> pass live (A2)
    page.goto(BASE + "/?signup=1")
    page.wait_for_selector("ul.pw-rules", timeout=10000)
    pw = page.locator("input[autocomplete='new-password']")
    pw.fill("weak")
    page.wait_for_timeout(300)
    fails = page.locator("ul.pw-rules li.fail").count()
    passes = page.locator("ul.pw-rules li.pass").count()
    check("signup: weak password — all 3 rules fail", fails == 3 and passes == 0,
          f"fail={fails} pass={passes}")
    pw.fill("StrongPass123")
    page.wait_for_timeout(300)
    fails = page.locator("ul.pw-rules li.fail").count()
    passes = page.locator("ul.pw-rules li.pass").count()
    check("signup: strong password — all 3 rules pass", passes == 3 and fails == 0,
          f"fail={fails} pass={passes}")
    page.screenshot(path=str(SHOTS / "08-signup-rules.png"))
    page.goto(BASE)  # back to the landing page for a clean end state

    # ── 8. Hygiene: console + 404s (over the whole session) ────────
    # A deliberately-down FastAPI still makes /wp-api/health proxy-500; those
    # probe failures are the skipped mode's expected noise — so /wp-api/ is
    # exempt ONLY in down-mode. With FastAPI up, its 4xx/5xx count as
    # failures like every other route's.
    if WP_UP:
        nonwp_bad = list(bad_responses)
    else:
        nonwp_bad = [(u, s) for u, s in bad_responses if "/wp-api/" not in u]
    hygiene_errors = console_errors
    if not WP_UP:
        n_probe = sum(1 for u, _ in bad_responses if "/wp-api/" in u)
        probe_errs = [e for e in console_errors if "Failed to load resource" in e][:n_probe]
        hygiene_errors = [e for e in console_errors if e not in probe_errs]
    check("hygiene: zero console errors", not hygiene_errors, "; ".join(hygiene_errors[:3]))
    check("hygiene: no 404/5xx network responses", not nonwp_bad, str(nonwp_bad[:3]))

    browser.close()

# ── 9. Dist check (no browser) ─────────────────────────────────────
if DIST.is_dir():
    # every prerendered route: / plus one dir per path (compare routes nest 2 deep)
    route_htmls = sorted(DIST.rglob("index.html"))
    check("dist: route html files found", len(route_htmls) >= 7,
          str([h.relative_to(DIST).as_posix() for h in route_htmls]))
    for html in route_htmls:
        rel = html.relative_to(DIST).as_posix()
        src = html.read_text(encoding="utf-8", errors="replace")
        n_desc = len(re.findall(r"<meta\s+name=[\"']description[\"']", src))
        png_favicon = re.search(r"<link[^>]+rel=[\"']icon[\"'][^>]+type=[\"']image/png[\"']", src) or \
            re.search(r"<link[^>]+type=[\"']image/png[\"'][^>]+rel=[\"']icon[\"']", src)
        check(f"dist {rel}: exactly one meta description", n_desc == 1, f"count={n_desc}")
        check(f"dist {rel}: PNG favicon link", bool(png_favicon))
else:
    skip("dist: prerendered routes checked", "no frontend/dist — run `npm run build` first")

passed = sum(1 for _, ok in results if ok is True)
failed = sum(1 for _, ok in results if ok is False)
skipped = sum(1 for _, ok in results if ok is None)
print(f"\n=== SUMMARY: {passed}/{len(results)} passed, {failed} failed, {skipped} skipped ===")
if console_errors:
    print("\nCONSOLE/PAGE ERRORS:")
    for e in console_errors[:15]:
        print("  ", e[:200])
if bad_responses:
    print("\nBAD RESPONSES:")
    for url, status in bad_responses[:15]:
        print(f"   {status} {url[:160]}")
sys.exit(1 if failed else 0)
