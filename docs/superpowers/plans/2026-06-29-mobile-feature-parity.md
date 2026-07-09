# Mobile Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add missing mobile app features: Notifications screen, Workspace screen, Tool detail screens, and UI polish.

**Architecture:** Extend warmpulse-mobile/ with new section screens following established patterns (ScrollView, Glass, reanimated entrances, TanStack Query).

**Tech Stack:** React Native 0.85, Expo SDK 56, TanStack Query, react-native-reanimated 4

## Global Constraints

- No Moti animations — use react-native-reanimated directly (FadeInUp, withRepeat)
- Glass styling via components/Glass.tsx with hexA() helper
- Theme tokens only — wp.* colors from theme/tokens.ts
- Shared components: Row, KpiCard, MiniBars, Sparkline, Gauge, Field, SectionTitle, Async, PromptModal
- API layer via lib/api.ts authFetch + TanStack Query useQuery/useMutation
- TypeScript strict — npx tsc --noEmit must pass
- Mock data initially, then wire to real backend
- Navigation via Drawer — update sections-config.tsx

---

## Task 1: Notifications Inbox Screen

**Reference:** frontend/src/pages/client/NotificationsPage.tsx

**Files:**
- Create: warmpulse-mobile/screens/app/sections/Notifications.tsx
- Modify: warmpulse-mobile/lib/data.ts (add notifications query)
- Modify: warmpulse-mobile/lib/mutations.ts (add mark read mutations)
- Modify: warmpulse-mobile/screens/app/sections-config.tsx (add to SECTIONS)

**API Endpoints:**
- GET /api/workspace/notifications-inbox
- POST /api/workspace/notifications-inbox/{id}/read
- POST /api/workspace/notifications-inbox/read-all

**Interfaces:**
```typescript
type InboxNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: { url?: string };
  read_at: string | null;
  created_at: string;
};

type InboxResponse = {
  items: InboxNotification[];
  unread: number;
};
```

**Components:**
- NotificationItem row (icon, title, body, timeAgo, unread dot)
- Filter chips (All, Unread)
- Mark all read button
- Empty state

**Steps:**
- [ ] Add InboxNotification types to lib/data.ts
- [ ] Add useNotificationsInbox hook to lib/data.ts (polling 60s)
- [ ] Add useMarkNotificationRead and useMarkAllNotificationsRead to lib/mutations.ts
- [ ] Create Notifications.tsx screen with ScrollView, header, list
- [ ] Add notification icons per kind (Bell, MailX, AlertTriangle, CreditCard, etc.)
- [ ] Add timeAgo formatting function
- [ ] Add mark-read on tap logic + URL navigation
- [ ] Add FadeInUp entrance animations
- [ ] Update sections-config.tsx to include Notifications section
- [ ] Test with mock data, verify type-check

---

## Task 2: Workspace Settings Screen

**Reference:** frontend/src/pages/client/WorkspacePage.tsx

**Files:**
- Create: warmpulse-mobile/screens/app/sections/Workspace.tsx
- Modify: warmpulse-mobile/lib/data.ts (add workspace query)
- Modify: warmpulse-mobile/screens/app/sections-config.tsx

**API Endpoints:**
- GET /api/workspace (already exists, used by Settings)

**Focus:** Starter-tier workspace profile (identity-led, not tabs)
- Workspace name
- Plan display
- Avatar/initials
- Team members (if Starter gets multi-user later)

**Steps:**
- [ ] Create Workspace.tsx with ScrollView + header
- [ ] Display workspace name, plan, avatar
- [ ] Add glass card for workspace profile
- [ ] Add FadeInUp animations
- [ ] Update sections-config.tsx
- [ ] Type-check

---

## Task 3: Tool Detail Screens (5 tools)

**Reference:** frontend/src/pages/client/tools/*

**Tools:**
1. Placement Tester (/api/workspace/tools/placement)
2. Spam Scanner (/api/workspace/tools/spam-scan)
3. DNS Validator (already in Settings, may stand alone)
4. Template Designer (/api/workspace/tools/template)
5. Warmup Preview (/api/workspace/tools/warmup-preview)

**Files:**
- Create: warmpulse-mobile/screens/app/tools/PlacementTester.tsx
- Create: warmpulse-mobile/screens/app/tools/SpamScanner.tsx
- Create: warmpulse-mobile/screens/app/tools/DnsValidator.tsx
- Create: warmpulse-mobile/screens/app/tools/TemplateDesigner.tsx
- Create: warmpulse-mobile/screens/app/tools/WarmupPreview.tsx
- Modify: warmpulse-mobile/screens/app/sections/Tools.tsx (navigation to detail screens)
- Modify: warmpulse-mobile/nav/nav.tsx (add tool detail screens)

**Common Pattern per Tool:**
- Header with back button
- Description card
- Input/selector (mailbox for placement, content for spam)
- Run button
- Results display (glass card with metrics)
- History list (if applicable)

**Steps:**
- [ ] Add tool-screen type to nav/nav.tsx
- [ ] Create PlacementTester.tsx (mailbox picker, test button, results)
- [ ] Create SpamScanner.tsx (content input, scan button, score display)
- [ ] Create DnsValidator.tsx (domain input, check button, SPF/DKIM/DMARC results)
- [ ] Create TemplateDesigner.tsx (subject/body inputs, preview card)
- [ ] Create WarmupPreview.tsx (generate button, sample emails list)
- [ ] Update Tools.tsx to navigate to detail screens
- [ ] Add entrance animations to all tool screens
- [ ] Type-check all

---

## Task 4: UI Polish & Review

**Files:** All section screens

**Goals:**
- Consistent spacing (20px padding, 16-24px gaps)
- Consistent typography (eyebrow/heading/subheading hierarchy)
- Smooth entrance animations (staggered FadeInUp)
- Glass effect consistency (correct alpha values)
- Loading states (Async component)
- Empty states where applicable

**Steps:**
- [ ] Review all sections for spacing consistency
- [ ] Verify all screens have FadeInUp entrances
- [ ] Check glass card alpha values
- [ ] Ensure all lists have loading/empty states
- [ ] Test navigation between sections
- [ ] Verify type-check passes
- [ ] Run expo export --platform android

---

## Execution Notes

- Start with Task 1 (Notifications) — highest priority
- Each task ends with a working, testable screen
- Use existing components from components/ directory
- Mock data in lib/data.ts initially, swap to real endpoints later

