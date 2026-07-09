# Starter App Sections — Design Spec

**Date:** 2026-06-27
**Scope:** Authenticated in-app section screens for the Starter tier, in the
React Native app at `warmpulse-mobile/`. UI-first (mock data); no backend wiring.

## Goal

Build the post-onboarding app experience for a Starter-tier user: an app shell
with a hamburger drawer and 8 section screens, in the established premium
glass + reanimated style used across the app.

## Sections (8)

Dashboard · Mailboxes · Activity · Stats · Tools · Reports · Settings · Billing.

Explicitly excluded: **Health / Reputation** (removed for all plans — also
remove from the web client nav). CRM/Leads and Workspace remain Pro+ (not built).

## Navigation

Hamburger drawer (no bottom tab bar):
- Header per screen: ☰ menu button · section title · avatar (initials).
- Drawer: slide-in glass panel (reanimated translateX + dimmed backdrop tap-to-close)
  listing the 8 sections (icon + label, active highlighted) + Log out at the bottom.
- Android hardware back: if drawer open → close; else → previous behavior.

## Architecture

```
warmpulse-mobile/
  nav/nav.tsx            + add 'app' to Screen union
  screens/app/
    AppShell.tsx         header + Drawer + active-section switch; owns section + drawerOpen state
    Drawer.tsx           animated glass drawer (8 items + logout)
    sections/
      Dashboard.tsx  Mailboxes.tsx  Activity.tsx  Stats.tsx
      Tools.tsx      Reports.tsx    Settings.tsx  Billing.tsx
  components/
    KpiCard.tsx          label + big value + optional delta/icon (glass)
    MiniBars.tsx         SVG bar mini-chart (animated grow)
    Sparkline.tsx        SVG line/area mini-chart
    Row.tsx              list row (leading icon, title, subtitle, trailing value/chevron)
```

Reuse existing: `theme/tokens`, `components/{Glass,GradientText,Gauge,SectionTitle,Field,PingDot}`.

## Conventions (all section screens follow these)

- Each section is a default-exported component rendering a `ScrollView` of its
  content (the AppShell provides the header + safe-area + drawer).
- Animations: `react-native-reanimated` (`FadeInUp` entrances, `withRepeat` loops).
  **Do NOT use Moti** (duplicate-React crash — see memory).
- Styling: `StyleSheet` + `wp` tokens only. No new colors.
- Mock data lives inline at the top of each section file.
- Premium treatment: glass cards, gradient accents, gauges, subtle glow/shimmer.

## Section content (mock)

- **Dashboard** — S1 Focus: warmth `Gauge` (74, +3), provider/day pills (Gmail · Day 12),
  4 `KpiCard`s (Sent 28/30, Opens 22·79%, Replies 9·32%, Spam-rescue 3), 14-day warmth
  `Sparkline` (+14 pts), DNS health rows (SPF/DKIM/DMARC ✓), reputation 98.
- **Mailboxes** — the 1 connected mailbox card (email, Active · D12, warmth, provider) with
  a manage row; "Connect another mailbox" CTA gated to Pro.
- **Activity** — reverse-chron feed of warmup events: sent / opened / replied / starred /
  spam-rescued, each with peer address + relative time + colored type icon. Filter chips.
- **Stats** — 7/30/90-day toggle; inbox-placement % `Sparkline`; opens vs replies `MiniBars`;
  3 summary KpiCards.
- **Tools** — 5 tool cards (Placement Tester, Spam Scanner, DNS Validator, Template Designer,
  Warmup Preview): icon + name + one-line + arrow. (Cards only; detail screens later.)
- **Reports** — scheduled-reports list (name, cadence, format) + "New report" CTA +
  recent exports (CSV/PDF) rows.
- **Settings** — profile (avatar, name, email), security (2FA toggle row, recovery codes),
  appearance (theme), notifications toggles.
- **Billing** — current plan card (Starter, ₹1,500/mo, renews date), payment method row,
  invoices list, "Upgrade to Pro" CTA.

## Wiring

- **Login** submit → `reset('app')` (returning user lands on their Dashboard).
- **Signup** submit → `reset('onboarding')` (new user sets up first).
- Onboarding "Start warming" → `reset('app')` (lands in AppShell on Dashboard).
- Drawer "Log out" → `reset('landing')`.

## Execution plan

1. **Foundation (sequential, first):** nav 'app' screen, AppShell, Drawer, and the
   4 shared components (KpiCard, MiniBars, Sparkline, Row). Everything else depends on these.
2. **Parallel subagents:** one per section screen (8), each building against the
   foundation + established components. Each verifies its file typechecks.
3. **Integrate + verify:** wire all sections into AppShell, `tsc --noEmit` + `expo export`
   (Android) must pass. Remove Health from web client nav.

## Out of scope

Real API/data, tool detail screens, Pro/Pro Plus/Agency tier variants, push notifications.
