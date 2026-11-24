"""WarmPulse merged-stack E2E gate (Task 8, merge/agent-foundation).

One Playwright pass over the live dev stack:
  landing (rebrand + SEO assets) -> login (operator demo) -> sidebar nav
  -> Leads tabs -> #/warmup deep link + live dashboard assertions
  -> logout (token purge)
plus a browser-less dist/ check (one meta description + PNG favicon per route).

Shell & UX batch (Task 6) additions: sign-out reachable in the rail (desktop
and in the 375px drawer), sidebar is a full-height rail (no bottom nav),
signup password rules flip fail->pass live, removed WarmPulse/WhatsApp
strings absent from Settings, footer slim (<=6 links).

Streams C+D gate additions (live pass): the Warmup section's four sub-tabs
(Overview | DNS / Deliverability | Reports | Reputation), Reports summary
cards + per-mailbox table, Reputation score banner + trend charts, mailbox
row Pause/Resume + details drawer, and the Settings → Mailboxes warmup
enroll toggle/chip.

Prereqs (see scripts/e2e/README.md):
  Django on :8000, FastAPI on :8001, Vite dev on :5173 (IPv4 or IPv6),
  `npm run build` in frontend/ if you want the dist checks counted.

If FastAPI is down the warmup dashboard checks flip to SKIPPED and the
"not reachable" panel is asserted instead — the gate still passes.

Accent checks are theme-agnostic (owner may retune the palette any time):
each one resolves var(--accent) in the page (computed color of a throwaway
probe element) and compares against that, never against a literal color.
"""
import base64
import hashlib
import hmac
import io
import json
import os
import re
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "frontend" / "dist"
SHOTS = ROOT / ".superpowers" / "sdd" / "e2e-shots"
SHOTS.mkdir(parents=True, exist_ok=True)

USERNAME, PASSWORD = "operator", "operator-demo-2026"

# Admin door (login split): fixed slug for the admin-console walk. seed_demo
# leaves AppSettings.admin_slug blank, so the gate sets it itself below —
# same command the operator uses (`manage.py set_admin_slug`).
ADMIN_SLUG = "847291"

# Resolve var(--accent) to a computed "rgb(r, g, b)" string inside the page —
# the probe element forces the browser to normalize whatever color format the
# token holds (hex, rgb(), oklch …) so comparisons are literal string equality.
RESOLVE_ACCENT = """() => {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = 'var(--accent)';
  document.body.appendChild(probe);
  const v = getComputedStyle(probe).color;
  probe.remove();
  return v;
}"""


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


def django_python():
    """Python that can run manage.py against the e2e DB — the repo's own
    .venv, else the sibling Email-Warmup one (see the bring-up notes)."""
    dj = ROOT / "backend-agent"
    candidates = [
        dj / ".venv" / "Scripts" / "python.exe",
        ROOT.parent / "Email-Warmup" / "backend-agent" / ".venv" / "Scripts" / "python.exe",
        Path(sys.executable),
    ]
    return next((p for p in candidates if p.exists()), None)


def django_shell(code: str) -> tuple[bool, str]:
    """Run `manage.py shell -c <code>` against the e2e DB. OK when the code ran
    and printed E2E_SHELL_OK; `detail` carries the end of its output."""
    py = django_python()
    if py is None:
        return False, "no usable python found for the Django shell"
    try:
        r = subprocess.run(
            [str(py), "manage.py", "shell", "-c", code],
            cwd=str(ROOT / "backend-agent"),
            env={**os.environ, "DATABASE_URL": "sqlite:///db-agent-e2e.sqlite3"},
            capture_output=True, text=True, timeout=90,
        )
        out = (r.stdout or "") + (r.stderr or "")
        return r.returncode == 0 and "E2E_SHELL_OK" in out, out[-300:].strip()
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


def ensure_admin_slug() -> tuple[bool, str]:
    """Point the e2e DB's admin slug at ADMIN_SLUG (seed_demo leaves it blank).
    Uses the same Django management command the operator runs."""
    py = django_python()
    if py is None:
        return False, "no usable python found for the Django shell"
    try:
        r = subprocess.run(
            [str(py), "manage.py", "set_admin_slug", ADMIN_SLUG],
            cwd=str(ROOT / "backend-agent"),
            env={**os.environ, "DATABASE_URL": "sqlite:///db-agent-e2e.sqlite3"},
            capture_output=True, text=True, timeout=90,
        )
        return r.returncode == 0 and "Admin slug set" in r.stdout, (r.stderr or r.stdout)[-200:]
    except Exception as exc:  # noqa: BLE001
        return False, f"{type(exc).__name__}: {exc}"


# ── Console walk (8c): a REAL platform-admin sign-in ────────────────
# A throwaway superadmin with a known authenticator secret is created in the
# e2e DB, signs in through the admin door with a fresh code, and is deleted
# again whatever happens.
CONSOLE_ADMIN = "e2e-console-admin"
CONSOLE_PW = "e2e-console-pw-2026"
CONSOLE_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"


def totp_code(secret: str) -> str:
    """6-digit authenticator code — the same arithmetic as
    backend-agent/core/totp.py (HMAC-SHA1, 30 s step). Waits for a step with
    at least 7 s left: a code dies with its step and is accepted only once."""
    while int(time.time()) % 30 > 30 - 7:
        time.sleep(0.5)
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return f"{number % 1_000_000:06d}"


def console_admin_code(action: str) -> str:
    """Django shell code that creates / deletes the throwaway console admin."""
    if action == "create":
        return (
            "from django.contrib.auth import get_user_model\n"
            "U = get_user_model()\n"
            f"U.objects.filter(username='{CONSOLE_ADMIN}').delete()\n"
            f"u = U.objects.create_superuser(username='{CONSOLE_ADMIN}', password='{CONSOLE_PW}',\n"
            "                                email='e2e-console@example.invalid')\n"
            "u.is_staff = True\n"
            f"u.totp_secret = '{CONSOLE_SECRET}'\n"
            "u.save()\n"
            "print('E2E_SHELL_OK created')\n"
        )
    return (
        "from django.contrib.auth import get_user_model\n"
        "from rest_framework.authtoken.models import Token\n"
        "from core.models import PlatformSession\n"
        "U = get_user_model()\n"
        f"u = U.objects.filter(username='{CONSOLE_ADMIN}').first()\n"
        "n = 0\n"
        "if u:\n"
        "    for t in Token.objects.filter(user=u):\n"
        "        n += PlatformSession.objects.filter(token=t).delete()[0]\n"
        "        t.delete()\n"
        "    u.delete()\n"
        f"left = U.objects.filter(username__startswith='{CONSOLE_ADMIN}').count()\n"
        "print('E2E_SHELL_OK', 'deleted' if u else 'absent', 'sessions', n, 'left', left)\n"
    )


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
    accent = page.evaluate(RESOLVE_ACCENT)
    # teammate rework (99a78b4) turned the hero <a> into a SpecularButton; the
    # solid accent-gradient CTA on / is now the header Sign-in <button>, so
    # match the class on any tag — the gradient-starts-at-accent assertion is unchanged.
    cta_gradient = page.locator(".lp-cta-solid").first.evaluate("el => getComputedStyle(el).backgroundImage")
    check("rebrand: primary CTA gradient starts at var(--accent)", accent in cta_gradient,
          f"accent={accent} gradient={cta_gradient}")
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
    check("rebrand: primary button background equals var(--accent)", btn_color == accent,
          f"btn={btn_color} accent={accent}")
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

    # ── 3c. Settings → Who to find: a typed entry must save WITHOUT Enter ──
    # The owner typed a country, clicked "Save changes" and it was gone: the
    # tag input only committed on Enter / the Add button. This is that exact
    # click path. The operator's real targeting is read first and put back.
    def settings_api(method: str, body=None):
        return page.evaluate(
            """async ([method, body]) => {
                const res = await fetch('/api/settings/', {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Token ' + localStorage.getItem('agentic-ai:token'),
                    },
                    body: body ? JSON.stringify(body) : undefined,
                });
                return { status: res.status, data: await res.json() };
            }""",
            [method, body],
        )

    original_targeting = settings_api("GET")["data"]["targeting"]
    page.goto(BASE + "/settings/targeting")
    page.wait_for_timeout(1200)
    # by its own label: the Cities field's hint also mentions "countries"
    def countries_field():
        return page.locator(".tags-field").filter(
            has=page.locator("label.field-label", has_text=re.compile(r"^Countries$")))

    probe = "E2E Tagland"
    countries_field().locator("input").fill(probe)
    page.locator("#sec-targeting").click()          # leave the field — no Enter, no Add
    page.wait_for_timeout(400)
    save_button = page.locator("button", has_text="Save changes").first
    check("settings targeting: leaving the field turns the typed text into a tag",
          countries_field().locator(".tag", has_text=probe).count() == 1,
          str(countries_field().locator(".tag").all_inner_texts()))
    if save_button.count():
        save_button.click()
        page.wait_for_timeout(1200)
    saved_countries = settings_api("GET")["data"]["targeting"]["countries"]
    check("settings targeting: typed entry is saved without pressing Enter",
          probe in saved_countries, str(saved_countries))
    page.reload()
    # wait for the page to really come back (the dev server can take a few
    # seconds; a fixed 1.2 s once read the tags before they were loaded)
    try:
        countries_field().locator("input").first.wait_for(state="visible", timeout=30_000)
        page.wait_for_load_state("networkidle")
    except Exception:  # noqa: BLE001  — reported as a FAIL below, never aborts the gate
        pass
    shown_tags = countries_field().locator(".tag").all_inner_texts()
    check("settings targeting: the saved entry survives a reload",
          any(probe in tag for tag in shown_tags), str(shown_tags))
    page.screenshot(path=str(SHOTS / "03c-settings-targeting.png"))
    settings_api("PUT", {"targeting": original_targeting})
    check("settings targeting: the operator's own list is put back",
          settings_api("GET")["data"]["targeting"] == original_targeting)

    # ── 3d. Lead finding is OFF until the setup has proper data ───────────
    # The owner's rule: a workspace nobody set up must never fetch leads
    # ("726 garbage leads … for none users"). Take "what you sell" away and
    # the button, the server and autopilot all refuse and say why; put it
    # back and everything returns. The operator's real settings are restored.
    def api_call(method, path, body=None):
        return page.evaluate(
            """async ([method, path, body]) => {
                const res = await fetch(path, {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Token ' + localStorage.getItem('agentic-ai:token'),
                    },
                    body: body ? JSON.stringify(body) : undefined,
                });
                let data = null;
                try { data = await res.json(); } catch (e) { data = null; }
                return { status: res.status, data };
            }""",
            [method, path, body],
        )

    def lead_gate():
        return api_call("GET", "/api/pipeline/status/")["data"]["leadFetch"]

    # The refused calls are made OUTSIDE the browser: a 4xx answer logs a console
    # error and counts as a bad response in the hygiene checks at the end.
    token = page.evaluate("() => localStorage.getItem('agentic-ai:token')")

    def refused_call(method, path, body=None):
        req = urllib.request.Request(
            BASE + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Content-Type': 'application/json', 'Authorization': f'Token {token}'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read() or b'null')
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read() or b'null')

    original = settings_api("GET")["data"]
    ready_before = lead_gate()["ready"]
    settings_api("PUT", {"company": {"name": "Shailog Technologies", "services": ["Web design"]},
                         "targeting": {"industries": ["dental clinic"]}})
    check("lead gate: proper data allows lead finding", lead_gate() == {
        "ready": True, "missing": [], "message": ""}, str(lead_gate()))

    def go_home():
        # a workspace that has not finished its setup wizard is taken from Home
        # to the wizard when the page loads (App.tsx) — so ask for Home again
        page.locator("button.nav-item", has_text="Home").first.click()
        page.locator(".topbar-title", has_text="Home").wait_for(state="visible", timeout=30_000)
        # the live status is polled; wait until it has caught up with the save
        try:
            page.wait_for_function(
                "() => document.querySelectorAll('.lead-gate-note').length === 0"
                " && !document.querySelector('button.topbar-run').disabled",
                timeout=30_000)
        except Exception:  # noqa: BLE001  — reported as a FAIL below, never aborts the gate
            pass

    go_home()
    check("lead gate: 'Find leads now' is enabled with proper data",
          page.locator("button.topbar-run").is_enabled())
    check("lead gate: no warning with proper data", page.locator(".lead-gate-note").count() == 0)

    settings_api("PUT", {"company": {"services": []}})              # nothing saved as "what you sell"
    gate = lead_gate()
    check("lead gate: without 'what you sell' it is not allowed", gate["ready"] is False, str(gate))
    check("lead gate: it names what is missing", gate["missing"] == ["services"]
          and "what you sell" in gate["message"], str(gate))
    refused_status, refused_data = refused_call("POST", "/api/pipeline/run/?wait=1", {})
    check("lead gate: the server refuses a run", refused_status == 422
          and (refused_data or {}).get("missing") == ["services"], str(refused_data)[:200])
    autopilot_status, autopilot_data = refused_call("PUT", "/api/settings/", {"runs": {"enabled": True}})
    check("lead gate: autopilot cannot be switched on", autopilot_status == 400
          and "what you sell" in str(autopilot_data), str(autopilot_data)[:200])
    page.reload()
    try:
        page.locator("button.topbar-run").wait_for(state="visible", timeout=30_000)
        page.wait_for_load_state("networkidle")
    except Exception:  # noqa: BLE001  — reported as a FAIL below, never aborts the gate
        pass
    run_button = page.locator("button.topbar-run")
    check("lead gate: 'Find leads now' is disabled", run_button.is_disabled())
    check("lead gate: the disabled button says why", "what you sell" in (run_button.get_attribute("title") or ""),
          run_button.get_attribute("title"))
    check("lead gate: the status pill says lead finding is off",
          "off" in safe_text(page.locator(".topbar .status-pill")).lower(),
          safe_text(page.locator(".topbar .status-pill")))
    # the notice lives in Home's status tile (one element, class lead-gate-note)
    page.locator("button.nav-item", has_text="Home").first.click()
    try:
        page.locator(".lead-gate-note").wait_for(state="visible", timeout=30_000)
    except Exception:  # noqa: BLE001  — reported as a FAIL below, never aborts the gate
        pass
    note = page.locator(".lead-gate-note")
    check("lead gate: Home tells the owner what is missing",
          note.count() == 1 and "what you sell" in safe_text(note), safe_text(note))
    check("lead gate: Home offers the way to fix it",
          page.locator(".lead-gate-note button", has_text="Add what's missing").count() == 1)
    page.screenshot(path=str(SHOTS / "03d-lead-gate-off.png"))

    settings_api("PUT", {"company": original["company"], "targeting": original["targeting"],
                         "runs": original["runs"]})
    page.reload()
    try:
        page.locator("button.topbar-run").wait_for(state="visible", timeout=30_000)
        page.wait_for_load_state("networkidle")
    except Exception:  # noqa: BLE001  — reported as a FAIL below, never aborts the gate
        pass
    check("lead gate: the operator's own settings are put back",
          settings_api("GET")["data"]["company"] == original["company"]
          and settings_api("GET")["data"]["targeting"] == original["targeting"]
          and lead_gate()["ready"] == ready_before, str(lead_gate()))
    # the status is polled: wait for it to agree with what was put back
    try:
        page.wait_for_function(
            "(ready) => document.querySelector('button.topbar-run').disabled === !ready",
            arg=ready_before, timeout=30_000)
    except Exception:  # noqa: BLE001  — reported as a FAIL below, never aborts the gate
        pass
    check("lead gate: 'Find leads now' follows the settings again",
          page.locator("button.topbar-run").is_enabled() == ready_before)

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

    # ── 5. Warmup: sidebar order, deep link, live dashboard (B3) ─────
    order = page.evaluate(
        """() => Array.from(document.querySelectorAll('button.nav-item span'))
                 .map(s => s.textContent.trim())"""
    )
    try:
        ia, iw, is_ = order.index("Assistant"), order.index("Warmup"), order.index("Settings")
        check("nav order: Assistant -> Warmup -> Settings", ia < iw < is_, str(order))
    except ValueError:
        check("nav order: Assistant -> Warmup -> Settings", False, str(order))

    # path-router deep link (7fcf7bc: hash #/warmup became /warmup)
    page.goto(BASE + "/warmup")
    page.wait_for_timeout(1800)
    top_title = safe_text(page.locator(".topbar-title"))
    check("warmup: deep link stays on Warmup (TopBar title)", top_title.strip() == "Warmup", top_title)
    check("warmup: sidebar item present", page.locator("button.nav-item", has_text="Warmup").count() == 1)
    if WP_UP:
        # ── real dashboard (B3): health probe -> summary fetch must both
        # resolve before the gated content paints, so wait for the gauge ──
        try:
            page.wait_for_selector(".warmup-gauge-value", timeout=12000)
            mounted = True
        except Exception:
            mounted = False
        check("warmup: dashboard mounts behind live backend", mounted,
              page.locator("body").inner_text()[:120].replace("\n", " "))
        hero = page.locator(".warmup-gauge-value").text_content() if mounted else None
        check("warmup: hero warmth score visible (digits)",
              bool(hero) and re.fullmatch(r"\d+", hero.strip()) is not None, str(hero))
        n_canvas = page.locator(".apexcharts-canvas").count()
        check("warmup: apex chart canvas mounts", n_canvas >= 1, f"{n_canvas} canvases")
        n_mailboxes = page.locator("li.warmup-mailbox-row").count()
        check("warmup: mailbox rows ≥1", n_mailboxes >= 1, f"{n_mailboxes} rows")
        n_alerts = page.locator("ul.warmup-alert-list li.warmup-alert").count()
        n_alerts_empty = page.locator(".warmup-alerts-empty").count()
        check("warmup: alerts render (rows or all-clear panel)",
              n_alerts >= 1 or n_alerts_empty == 1, f"rows={n_alerts} all_clear={n_alerts_empty}")
        n_feed = page.locator("ul.warmup-feed li.warmup-feed-row").count()
        check("warmup: activity feed items ≥1", n_feed >= 1, f"{n_feed} rows")
        page.wait_for_timeout(600)  # let apex charts settle before the shot
    else:
        ws_txt = safe_text(page.locator(".warmup-status.down"))
        check("warmup: not-reachable panel when FastAPI down",
              page.locator(".warmup-status.down").count() > 0 and "not reachable" in ws_txt,
              ws_txt)
        for dash_check in ("dashboard mounts behind live backend",
                           "hero warmth score visible (digits)",
                           "apex chart canvas mounts",
                           "mailbox rows ≥1",
                           "alerts render (rows or all-clear panel)",
                           "activity feed items ≥1"):
            skip(f"warmup: {dash_check}", "FastAPI not reachable on :8001")
    page.screenshot(path=str(SHOTS / "06-warmup.png"))

    # ── 5b. Warmup sub-tab surfaces (Streams C+D gate) ─────────────
    # Four sub-tabs; Reports (cards + per-mailbox table); Reputation
    # (score banner + charts); mailbox row pause/resume + details drawer;
    # Settings → Mailboxes warmup enroll toggle/chip.
    if WP_UP:
        tab_labels = [t.strip() for t in page.locator(".subtabs .subtab").all_inner_texts() if t.strip()]
        check("warmup tabs: exactly four sub-tabs", len(tab_labels) == 4, str(tab_labels))
        check("warmup tabs: Overview | DNS / Deliverability | Reports | Reputation",
              tab_labels == ["Overview", "DNS / Deliverability", "Reports", "Reputation"],
              str(tab_labels))

        # Reports tab: summary cards + range picker + per-mailbox table
        page.locator(".subtab", has_text="Reports").first.click()
        page.wait_for_timeout(2000)
        n_cards = page.locator(".warmup-report-stats .stat-card").count()
        check("warmup reports: six summary cards render", n_cards == 6, f"{n_cards} cards")
        n_range = page.locator(".warmup-range-btn").count()
        check("warmup reports: range picker 7/30/90d", n_range == 3, f"{n_range} buttons")
        n_rrows = page.locator("table.warmup-report-table tbody tr").count()
        check("warmup reports: per-mailbox table rows ≥1", n_rrows >= 1, f"{n_rrows} rows")
        page.screenshot(path=str(SHOTS / "06b-warmup-reports.png"))

        # Reputation tab: score banner + trend charts + domains table
        page.locator(".subtab", has_text="Reputation").first.click()
        page.wait_for_timeout(2400)
        rep_score = safe_text(page.locator(".warmup-rep-banner .warmup-rep-score"))
        check("warmup reputation: score banner shows digits",
              re.fullmatch(r"\d+", rep_score.strip()) is not None, rep_score)
        n_rcanvas = page.locator(".apexcharts-canvas").count()
        check("warmup reputation: trend charts mount (≥2)", n_rcanvas >= 2, f"{n_rcanvas} canvases")
        n_drows = page.locator("table.warmup-report-table tbody tr").count()
        check("warmup reputation: domains table rows ≥1", n_drows >= 1, f"{n_drows} rows")
        page.screenshot(path=str(SHOTS / "06c-warmup-reputation.png"))

        # Overview rows: pause/resume button + Details drawer
        page.locator(".subtab", has_text="Overview").first.click()
        page.wait_for_timeout(1500)
        first_row = page.locator("li.warmup-mailbox-row").first
        n_pr = first_row.locator("button", has_text=re.compile(r"^(Pause|Resume)$")).count()
        check("warmup mailboxes: row has Pause/Resume button", n_pr >= 1, f"{n_pr} buttons")
        first_row.locator("button", has_text="Details").first.click()
        page.wait_for_timeout(1000)
        drawer_warmth = safe_text(page.locator(".drawer .warmup-drawer-warmth"))
        check("warmup mailboxes: details drawer opens with warmth score",
              "/ 100" in drawer_warmth, drawer_warmth)
        page.screenshot(path=str(SHOTS / "06d-warmup-drawer.png"))
        page.locator(".drawer button[aria-label='Close']").first.click()
        page.wait_for_timeout(500)

        # Settings → Mailboxes & speed: warmup enroll toggle + chip
        page.goto(BASE + "/settings/mailboxes")
        page.wait_for_timeout(1800)
        n_tog = page.locator("button.toggle[role=switch][aria-label='Enroll this mailbox in warmup']").count()
        check("settings mailboxes: warmup enroll toggle present", n_tog >= 1, f"{n_tog} toggles")
        n_chip = page.locator(".chip", has_text="Warmup").count()
        check("settings mailboxes: warmup status chip present", n_chip >= 1, f"{n_chip} chips")
        page.screenshot(path=str(SHOTS / "06e-settings-mailboxes.png"))

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

    # ── 8b. Admin door, signed out (login split): /<slug> lands on the admin
    # login card and WORKSPACE credentials are turned away with the admin-only
    # 403. Deliberately AFTER the hygiene snapshot — the expected 403 (and its
    # console line) must not count as session noise.
    slug_ready, slug_detail = ensure_admin_slug()
    check(f"admin door: e2e slug set to {ADMIN_SLUG} (manage.py set_admin_slug)",
          slug_ready, slug_detail)
    page.goto(f"{BASE}/{ADMIN_SLUG}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    check("admin door: signed-out /<slug> redirects to /<slug>/login",
          page.url.endswith(f"/{ADMIN_SLUG}/login"), page.url)
    check('admin door: admin login card says "Platform Console"',
          "Platform Console" in page.locator("body").inner_text())
    page.locator("input[autocomplete=username]").fill(USERNAME)
    page.locator("input[type=password]").fill(PASSWORD)
    page.locator("button.login-submit").click()
    try:
        page.wait_for_selector("p.login-error", timeout=8000)
        door_err = page.locator("p.login-error").inner_text()
    except Exception:
        door_err = safe_text(page.locator("p.login-error"))
    check("admin door: workspace creds refused (admin-only 403 text)",
          "This page is for platform administrators only." in door_err, door_err)
    page.screenshot(path=str(SHOTS / "09-admin-door.png"))
    # (operator's happy path through the DEFAULT door is section 2 above)

    # ── 8c. Console walk: sign in for real as a throwaway platform admin and
    # look at the rail. This stays on the page already loaded above — every
    # load checks the admin URL and that check allows 5 a minute.
    created, detail = django_shell(console_admin_code("create"))
    check("console: throwaway platform admin created in the e2e DB", created, detail)
    try:
        if created:
            page.locator("input[autocomplete=username]").fill(CONSOLE_ADMIN)
            page.locator("input[type=password]").fill(CONSOLE_PW)
            page.locator("button.login-submit").click()
            slot = page.locator(".code-slots__input")
            slot.wait_for(state="attached", timeout=15_000)
            slot.click()
            page.keyboard.type(totp_code(CONSOLE_SECRET))
            page.locator("aside.sidebar").wait_for(state="visible", timeout=30_000)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(800)
            check("console: a real platform-admin sign-in reaches the console",
                  page.url.endswith(f"/{ADMIN_SLUG}/overview"), page.url)

            # No top bar on a wide screen (it only repeated the brand and the
            # open page) — and the page carries its own title instead.
            topbar = page.locator("header.topbar")
            body_text = page.locator("body").inner_text()
            check("console: no 'Platform console' top bar on a wide screen",
                  topbar.evaluate("el => getComputedStyle(el).display") == "none"
                  and "Platform console" not in body_text)

            # The rail's brand row used to be squeezed to 40px by the console's
            # 19-item menu (it is 58px; 50px under 760px tall, 46px under 640px)
            # and the logo sat 2px right of the card below it.
            geo = page.evaluate(
                """() => {
                    const box = (sel) => {
                        const b = document.querySelector(sel).getBoundingClientRect();
                        return {left: b.left, top: b.top, height: b.height};
                    };
                    return {brand: box('.sidebar-brand'), logo: box('.brand-logo'),
                            badge: box('.workspace-badge'), title: box('.content .page-header')};
                }"""
            )
            height = page.viewport_size["height"]
            wanted = 58 if height > 760 else 50 if height > 640 else 46
            check("console: the brand row keeps its height under the 19-item menu",
                  abs(geo["brand"]["height"] - wanted) < 0.5, str(geo["brand"]))
            check("console: the logo is flush with the card below it",
                  abs(geo["logo"]["left"] - geo["badge"]["left"]) < 0.5,
                  f"logo {geo['logo']['left']} vs card {geo['badge']['left']}")
            check("console: the page starts with its own title (no bar above it)",
                  geo["title"]["top"] < 60, str(geo["title"]))
            page.screenshot(path=str(SHOTS / "09b-console.png"))

            # The logo says "Go to Overview": it used to append a stale
            # #/platform/overview and stay on the page.
            page.locator(".side-nav .nav-item", has_text="Users").first.click()
            page.wait_for_timeout(700)
            on_users = page.url.endswith(f"/{ADMIN_SLUG}/users")
            page.locator(".sidebar-brand").click()
            page.wait_for_timeout(700)
            check("console: the logo goes to Overview",
                  on_users and page.url.endswith(f"/{ADMIN_SLUG}/overview"), page.url)

            # On a phone the rail is a drawer: the bar is back, holding the
            # one button that opens it.
            page.set_viewport_size({"width": 375, "height": 812})
            page.wait_for_timeout(700)
            menu_btn = page.locator(".menu-btn")
            check("console: on a phone the bar is back with only the menu button",
                  topbar.evaluate("el => getComputedStyle(el).display") != "none"
                  and menu_btn.is_visible() and "Platform console" not in topbar.inner_text())
            menu_btn.click()
            page.wait_for_timeout(600)
            check("console: the menu button opens the rail",
                  "open" in (page.locator("aside.sidebar").get_attribute("class") or ""))
            page.screenshot(path=str(SHOTS / "09c-console-phone.png"))
            page.set_viewport_size({"width": 1920, "height": 1080})
    except Exception as exc:  # noqa: BLE001  — reported as a FAIL, never aborts the gate
        check("console: the walk finished", False, f"{type(exc).__name__}: {exc}"[:200])
    finally:
        removed, detail = django_shell(console_admin_code("delete"))
    check("console: throwaway platform admin removed again",
          removed and "left 0" in detail, detail)

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
