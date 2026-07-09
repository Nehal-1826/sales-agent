# Starter App Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated Starter-tier app experience in `warmpulse-mobile/` — a hamburger-drawer shell + 8 section screens.

**Architecture:** A new `'app'` nav screen renders `AppShell` (header + slide-in `Drawer` + active-section switch). Eight section screens hang off the shell, each a self-contained `ScrollView` built on shared components (`KpiCard`, `MiniBars`, `Sparkline`, `Row`) plus existing primitives (`Glass`, `GradientText`, `Gauge`, `SectionTitle`).

**Tech Stack:** Expo SDK 54, React Native 0.81, react-native-reanimated 4 (entrances/loops — NOT Moti), expo-linear-gradient, expo-blur, react-native-svg, lucide-react-native.

## Global Constraints

- Animations via `react-native-reanimated` only. **Never import `moti`** (duplicate-React crash).
- Styling: `StyleSheet` + `wp` tokens from `theme/tokens`. No new colors.
- Each section screen: `export function <Name>()`, returns a `ScrollView` (the shell owns header/safe-area/drawer). Mock data inline at top of file.
- Verification per task: `cd warmpulse-mobile && npx tsc --noEmit` exits 0.
- Reuse, don't recreate: `components/{Glass,GradientText,Gauge,SectionTitle,Field,PingDot}`, `theme/tokens` (`wp`, `fonts`), `components/Glass` exports `hexA(hex, alpha)`.

---

## Task 1: Shared components (foundation)

**Files:**
- Create: `warmpulse-mobile/components/KpiCard.tsx`
- Create: `warmpulse-mobile/components/MiniBars.tsx`
- Create: `warmpulse-mobile/components/Sparkline.tsx`
- Create: `warmpulse-mobile/components/Row.tsx`

**Interfaces (Produces — section tasks consume these exact signatures):**
- `KpiCard({ label: string, value: string, sub?: string, accent?: string })` — glass card, mono `value` (22px), muted `label`, optional `sub` line.
- `MiniBars({ data: number[], color?: string, height?: number })` — SVG bars, animated grow on mount (reanimated or `whileInView` not available → use `withTiming` on a shared value driving height, or static heights with `FadeInUp`). Max-normalized.
- `Sparkline({ data: number[], color?: string, height?: number, fill?: boolean })` — SVG polyline (+ optional area fill) scaled to `data` min/max.
- `Row({ icon?: LucideIcon, title: string, subtitle?: string, value?: string, onPress?: () => void, accent?: string })` — list row: leading icon chip, title+subtitle, trailing value or chevron.

- [ ] **Step 1:** Build all four components per the interfaces above, using `wp` tokens + `hexA`. SVG via `react-native-svg`. Icons via `lucide-react-native`.
- [ ] **Step 2:** Verify: `cd warmpulse-mobile && npx tsc --noEmit` → exit 0.
- [ ] **Step 3:** Commit: `feat(mobile): shared app components (KpiCard, MiniBars, Sparkline, Row)`

---

## Task 2: App shell + drawer + nav wiring

**Files:**
- Modify: `warmpulse-mobile/nav/nav.tsx` — add `'app'` to `Screen` union.
- Create: `warmpulse-mobile/screens/app/AppShell.tsx`
- Create: `warmpulse-mobile/screens/app/Drawer.tsx`
- Modify: `warmpulse-mobile/App.tsx` — render `<AppShell/>` when `screen === 'app'`.
- Modify: `warmpulse-mobile/screens/Login.tsx` — submit → `reset('app')`.
- Modify: `warmpulse-mobile/screens/Onboarding.tsx` — final "Start warming" → `reset('app')`.

**Interfaces (Produces):**
- `SECTIONS: { key: SectionKey; label: string; Icon: LucideIcon }[]` exported from `AppShell.tsx` (or a `screens/app/sections-config.ts`) where `SectionKey = 'dashboard'|'mailboxes'|'activity'|'stats'|'tools'|'reports'|'settings'|'billing'`.
- `AppShell()` owns `useState<SectionKey>('dashboard')` + `drawerOpen`. Header: ☰ button (opens drawer) · current section label · avatar (user initials, mock "MO"). Renders active section component.
- `Drawer({ open, active, onSelect, onClose, onLogout })` — reanimated translateX panel (width ~78%) + dimmed `Pressable` backdrop; lists `SECTIONS` (icon+label, active highlighted) + Log out. `onLogout` → `reset('landing')`.

- [ ] **Step 1:** Add `'app'` to `Screen`. Build `sections-config.ts` (SECTIONS array, placeholder section components imported lazily or via a switch — start with all 8 rendering a stub `<Text>` until Tasks 3–10 land).
- [ ] **Step 2:** Build `AppShell` (header + drawer + section switch) and `Drawer` (animated). Android back: if `drawerOpen` close it.
- [ ] **Step 3:** Wire `App.tsx` (`screen==='app' → <AppShell/>`), `Login` submit → `reset('app')`, `Onboarding` finish → `reset('app')`.
- [ ] **Step 4:** Verify `npx tsc --noEmit` → 0.
- [ ] **Step 5:** Commit: `feat(mobile): app shell + hamburger drawer + nav wiring`

---

## Tasks 3–10: Section screens (parallelizable — all depend on Tasks 1 & 2)

Each task: create `warmpulse-mobile/screens/app/sections/<Name>.tsx`, `export function <Name>()` returning a `ScrollView` (padding 20, gap via margins). Mock data inline. Use `FadeInUp` entrances. Verify `npx tsc --noEmit` → 0. Commit `feat(mobile): <section> screen`.

### Task 3: Dashboard.tsx  (S1 Focus)
- `SectionTitle` eyebrow "Single mailbox · Day 12", title "alex@lumen-labs.com".
- Provider/day pills row (Gmail · Day 12).
- Centered `Gauge value={74}` + "+3 · 24h" delta chip.
- 2×2 `KpiCard` grid: Sent "28/30", Opens "22" sub "79% rate", Replies "9" sub "32% rate", Spam-rescue "3" sub "pulled from spam".
- "Warmth · last 14 days" `Glass` card with `Sparkline` (14 ascending points) + "+14 pts" badge.
- DNS health `Glass`: three `Row`s SPF/DKIM/DMARC each trailing "Verified ✓" (success). Reputation score 98 chip.

### Task 4: Mailboxes.tsx
- `SectionTitle` "Your mailbox", "1 of 1 connected".
- One mailbox `Glass` card: avatar "G", email "alex@lumen-labs.com", "Active · Day 12", small `Gauge`(74, size 64) or warmth chip, provider Gmail. A `Row` "Manage mailbox" → chevron.
- Locked "Connect another mailbox" card (dimmed) with "Pro" badge + "Upgrade to add more".

### Task 5: Activity.tsx
- `SectionTitle` "Warmup activity", "Live peer-network engagement".
- Filter chips: All · Sent · Opened · Replied · Starred · Rescued (selectable, mock).
- Reverse-chron feed (~10 items) of `{type, peer, time}` rendered as `Row`s: type icon+color (sent=accent Send, opened=blue MailOpen, replied=success Reply, starred=warning Star, rescued=danger ShieldCheck), title e.g. "Replied by maya.r@hubspot-peer.net", subtitle relative time ("1m","6m","14m"…).

### Task 6: Stats.tsx
- `SectionTitle` "Stats", "Deliverability over time".
- 7/30/90-day toggle (pill group, mock state).
- "Inbox placement" `Glass` with big "94.2%" + `Sparkline` (rising).
- "Opens vs replies" `Glass` with `MiniBars` (two-tone or one series).
- 3 `KpiCard`s: Avg warmth "88", Bounce "0.4%", Spam "1.1%".

### Task 7: Tools.tsx
- `SectionTitle` "Tools", "Test & validate deliverability".
- 5 tool `Row`/cards (icon, name, one-liner, chevron): Placement Tester (Target), Spam Scanner (ShieldAlert/Radar), DNS Validator (ShieldCheck), Template Designer (FileText), Warmup Preview (Mail). onPress no-op for now.

### Task 8: Reports.tsx
- `SectionTitle` "Reports", "Scheduled & on-demand".
- "Scheduled" `Glass`: 2 `Row`s (e.g., "Weekly summary · Every Mon · PDF", "Monthly deliverability · 1st · CSV") + "New report" CTA button (gradient).
- "Recent exports" list: 3 `Row`s (name, date, format badge) trailing a download icon.

### Task 9: Settings.tsx
- `SectionTitle` "Settings".
- Profile `Glass`: avatar + name "Alex Rivera" + email; "Edit profile" Row.
- Security `Glass`: "Two-factor auth" Row with a `Switch` (RN), "Recovery codes" Row → chevron.
- Appearance `Glass`: theme toggle Row (Dark active). Notifications `Glass`: 2–3 toggle Rows (Warmth alerts, Weekly report, Product updates).

### Task 10: Billing.tsx
- `SectionTitle` "Billing".
- Current plan `Glass`: "Starter" + "₹1,500/mo" + "Renews 27 Jul 2026" + small features list; "Upgrade to Pro" gradient CTA.
- Payment method `Row` (card ····6411, Edit).
- Invoices list: 3 `Row`s (date, amount, Paid badge) trailing download icon.

---

## Task 11: Integrate + verify + remove web Health

**Files:**
- Modify: `warmpulse-mobile/screens/app/sections-config.ts` / `AppShell.tsx` — replace section stubs with the real components (Tasks 3–10).
- Modify: `frontend/src/components/layout/nav-config.ts` — remove the `Health` (`/app/reputation`) entry from `CLIENT_NAV`.

- [ ] **Step 1:** Wire all 8 real section components into the AppShell switch.
- [ ] **Step 2:** Remove the `{ label: 'Health', to: '/app/reputation', icon: ShieldCheck }` item from `CLIENT_NAV` (web).
- [ ] **Step 3:** Verify `cd warmpulse-mobile && npx tsc --noEmit` → 0, then `npx expo export --platform android --output-dir dist-check` → "Exported"; remove `dist-check`.
- [ ] **Step 4:** Commit: `feat(mobile): wire Starter app sections; remove Health from web nav`
