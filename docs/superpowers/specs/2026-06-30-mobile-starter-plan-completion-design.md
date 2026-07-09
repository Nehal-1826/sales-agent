# Mobile Starter Plan — End-to-End Completion (Design)

**Date:** 2026-06-30
**Author:** Devesh
**Status:** Approved — ready for implementation plan
**App:** WarmPulse mobile (Expo / React Native)

## Goal

Make a brand-new user able to go **sign up → pick Starter → (dummy) pay → connect a
real mailbox → land in a working app with live data**, and close the remaining stub
controls so the Starter-tier experience is genuinely complete. Payment stays a dummy
gateway. Native Google OAuth one-tap mailbox connect is **out of scope** today — the
connect path uses email + app password (SMTP/IMAP).

## Why (current state)

The audit found the Starter-facing sections (Dashboard, Mailboxes, Activity, Stats,
Tools, Notifications, Billing) are already real and wired to the backend. The gap is
the **first-run flow and a few stub controls**:

- `screens/Onboarding.tsx` is a pure UI demo. `next()` only increments a step counter;
  "Start warming" calls `reset('app')`. **Nothing is persisted** — not the plan, not a
  mailbox, not DNS.
- `screens/onboarding/steps.tsx:133` — mailbox connect is a `setTimeout` that sets a
  fake email; it never calls the backend.
- `screens/onboarding/steps2.tsx:12` — DNS check is a `setTimeout`, not the real API.
- `screens/app/sections/Mailboxes.tsx` — has **no "Add mailbox" button at all**; a user
  who finishes onboarding has no way to connect a mailbox.
- `screens/app/sections/Reports.tsx:325` — invoice download is a `Alert.alert('Coming
  Soon')` stub (violates the no-coming-soon rule).
- `screens/app/sections/Settings.tsx:192` — 2FA is correctly hidden for Starter, but
  there is no "upgrade to unlock" hint so the feature is undiscoverable.

After signup, `Signup.tsx:38` routes to `onboarding`, so every new user hits this fake
wizard. This is the real reason Starter "isn't complete."

## Backend endpoints (all already exist — no backend changes needed)

- `GET  /api/workspace/mailboxes/detect-provider?email=` — prefill SMTP/IMAP hosts from domain MX.
- `POST /api/workspace/mailboxes/probe` — verify SMTP (+IMAP) credentials without saving.
- `POST /api/workspace/mailboxes` — create the mailbox (encrypts creds, kicks off warmup).
- `POST /api/workspace/mailboxes/{id}/dns-check` — real SPF/DKIM/DMARC lookup (mobile hook `useMailboxDnsCheck` already exists).
- `POST /api/payments/dummy` — dummy payment that persists the chosen plan on the user.

## Design

### 1. Shared `ConnectMailbox` component

Extract the provider → credentials → probe → create flow into one reusable component
(`screens/app/connect/ConnectMailbox.tsx` or similar) so both onboarding and the
Mailboxes section use identical, real logic. Responsibilities:

- `detect-provider` on email blur to prefill host/port defaults.
- `probe` on "Verify"; block progress until it returns 200; show the SMTP/IMAP error
  detail inline on 400.
- `POST /mailboxes` to create; return the created mailbox (id) to the caller.
- Credential hygiene: app password lives only in local state for the probe/create call;
  cleared from state after success.

### 2. Real onboarding wizard

Keep the 7-step UI; wire each step to the real backend via the shared component and a
new `useCreateMailbox` mutation in `lib/mutations.ts`:

- **Plan / Volume** — local state (Starter pre-selectable).
- **Provider + Connect** — uses `ConnectMailbox` (detect + probe).
- **Create** — on advancing past Connect, the mailbox is actually created; the wizard
  holds the returned `mailboxId`.
- **DNS** — calls real `useMailboxDnsCheck(mailboxId)`, renders SPF/DKIM/DMARC results.
- **Payment (dummy)** — calls `POST /payments/dummy` with the chosen plan so `usePlan()`
  reads the real plan ("Starter"). No real PSP.
- **Start** — invalidate `['mailboxes']`, `['dashboard']`, auth/me queries; `reset('app')`.

Error handling: every network step shows an inline error + retry and never advances on
failure. `back`/exit behaviour unchanged.

### 3. "Add mailbox" in the Mailboxes section

Add a real **Add mailbox** button that opens the shared `ConnectMailbox` component.
Enforce the **Starter 1-mailbox limit**: when a Starter user already has 1 mailbox, the
button renders an "Upgrade to add more" state (links to Billing) instead of creating.
This is the post-onboarding path to connect/reconnect a mailbox.

### 4. Remove stub controls

- **Reports invoice "Coming Soon"** (`Reports.tsx:325`) — **remove** the button (no real
  invoice endpoint exists; per the no-coming-soon rule, dead controls are removed).
- **Settings 2FA for Starter** (`Settings.tsx:192`) — render a subtle locked row with
  "Upgrade to Pro Plus to enable 2FA" linking to Billing, instead of rendering nothing.
  (Lowest priority; drop if time-constrained.)

## Verification & ship

- `cd frontend && pnpm typecheck` and a `tsc -b` pass (Docker build uses `tsc -b`, which
  is stricter — `noUncheckedIndexedAccess`).
- Manual smoke on the live backend: sign up a throwaway account → run the full wizard
  with a real Gmail **app password** → confirm a mailbox row appears and the dashboard
  populates with live data.
- Bump mobile app version, commit, and rebuild per the always-deploy-to-live rule. APK
  rebuild + on-device QA is a follow-up (tracked, not blocking this spec).

## Out of scope (today)

- Native Google OAuth deep-link mailbox connect.
- Real payment gateway / PSP integration.
- iOS build.

## Open follow-ups

- Native OAuth one-tap connect for Gmail/Outlook on mobile.
- On-device QA of the resulting APK build.
