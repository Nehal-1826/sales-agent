# Shell & UX Batch — Design (Stream A of post-foundation feedback)

Date: 2026-11-12
Status: approved by product owner in design review ("good proceed")
Base: `merge/agent-foundation` @ `8b6a2f5` (foundation merge, WarmPulse brand, one shell)

## Source

Owner clicked through the merged product at localhost:5173 and reported 12 items.
Two work streams: this spec (Stream A — shell/UX, 11 items) and a follow-up spec
(Stream B — WarmPulse real dashboards, written after A lands).

## Decisions (owner-fixed)

- One product: no "WarmPulse (optional) external API key" self-integration block.
- Sidebar nav at all widths; the mobile bottom tab bar is removed.
- Sign out must exist in this shell (billing-line UI currently lacks it).
- Custom mailbox connect = provider-preset wizard (Gmail/Zoho/Outlook/Custom) with a
  real server-side Test Connection (IMAP login + SMTP probe). App passwords only —
  no OAuth (WarmPulse removed OAuth deliberately; keep that decision).
- Company details auto-filled by scraping the signup website URL with the agent's
  own scraper. Signup company name must persist to the workspace.
- ReactBits component library added for dropdowns/backgrounds/loaders, violet tokens only.
- Mailbox bug repro: "saves, never works" — root-cause inside the mailbox task.

## Items → implementation map

1. **Nav alignment** — fix spacing/misalignment in the app rail + top bar
   (`components/Sidebar.tsx`, `components/TopBar.tsx`, styles.css). Verified visually
   via E2E screenshot + Playwright bounding-box assertions where cheap.
2. **Kill bottom nav, keep sidebar** — delete the "MOBILE POLISH — bottom tab bar"
   CSS block (styles.css ~3614+) and any JS toggling it; sidebar visible at all
   breakpoints (responsive, collapsible is fine — disappearing is not).
3. **Sign out** — affordance in the sidebar user area (and/or top-bar profile
   popover with ReactBits AnimatedDropdown): calls the existing `logout()` flow,
   which already clears both tokens (`agentic-ai:token` + `warmpulse:wp-token`).
4. **Footer slim** — landing footer keeps: wordmark + one-liner, contact
   (email/phone/site), legal links row. Everything else removed.
5. **Remove WarmPulse (optional) block** — `pages/settings/MailboxesSection.tsx`
   from `<h3 className="field-label">WarmPulse (optional)</h3>` through its
   "Check WarmPulse now" action, plus related state/fields/wiring (frontend and
   any backend columns handling for warmup api key stays untouched if other code
   depends on it — frontend block only).
6. **Remove WhatsApp ban banner** — `pages/settings/WhatsAppSection.tsx` Banner
   ("Risk of a ban") removed; the rest of the section stays.
7. **Dynamic password hints** — SignupPage password checklist reacts live to the
   typed value (length ≥ 8, upper+lower, digit, maybe symbol) with per-rule
   pass/fail styling. Static text removed.
8. **Company name wiring** — signup's company field persists to the workspace
   (BusinessSection / workspace model — trace where the field currently drops) and
   surfaces in-app (top-bar/profile/BusinessSection shows it).
9. **Company scrape from URL** — signup website-URL field gains a "Fetch details"
   action: `POST /api/company/scrape {url}` (new endpoint) reusing the agent
   scraper (`core/scraper.py`) to return company name/description; fills the
   company fields. Django test included; graceful error state on unreachable URL.
10. **Custom mailbox wizard + connect bug** — provider picker (Gmail / Zoho /
    Outlook / Custom) prefills IMAP host/port + SMTP host/port; app-password
    field; **Test Connection** button calling a new `POST /api/mailboxes/test`
    (backend: IMAP login via existing mailer deps + SMTP NOOP/EHLO probe, returns
    per-leg ok/error, no secrets echoed); on success the mailbox saves already
    connected. Root-cause "saves, never works": trace save → status → send path,
    fix the actual disconnect (likely status never verified or SMTP creds never
    used at send time). Django tests for the probe endpoint (mocked sockets).
11. **ReactBits** — add `reactbits` dependency (or per-component imports per its
    docs); use for: settings/nav dropdowns, page loader skeletons, subtle
    animated backgrounds on landing/auth. Tokens-only styling, no new color
    hexes; reduced-motion respected.

## Constraints

- TypeScript strict; no Tailwind; no secrets in frontend; API changes ship with
  Django tests; all existing suites + E2E gate stay green (extend E2E for new UI:
  signout reachable, bottom-nav absent at 375px viewport, password rules live,
  WarmPulse block gone).
- No changes to the warmup backend (`backend/`) in this stream — mailbox wizard
  is agent-side (Django).
- History/branch: continue on `merge/agent-foundation` (still unmerged by owner
  command; deployment waits for owner).

## Verification

Build (tsc + vite + prerender), Django suite, extended E2E, and a manual-by-owner
pass at localhost before Stream B.
