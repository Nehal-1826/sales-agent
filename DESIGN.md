# WarmPulse — Design System

## Product
WarmPulse is a B2B SaaS that warms up cold-email sender reputations. Customers connect their Gmail/Outlook/SMTP mailboxes; our peer-inbox network sends, opens, replies, and rescues their mail from spam so they land in inbox. Users are growth marketers, founders, and sales-ops people running cold outbound. The product feels **technical, trustworthy, data-rich**. Not playful, not corporate-stiff. Think Linear × Resend × Stripe Dashboard.

## Brand voice
Precise. No marketing fluff. Numbers over adjectives. Confident defaults.

## Visual direction
- **Two themes, equally polished.** Dark and light. Design every screen in both. Same layout, same density, same component placements — only tokens swap. Light is not "dark with inverted colors": it has its own warmth, its own contrast rhythm, and softer borders.
- **Dense, but breathable.** Lots of data on screen, generous line-height.
- **Mono accents.** Use a monospace font for numbers, IDs, log lines, code.
- **Subtle motion.** Hover lifts, no bouncy springs. 150–200ms ease-out.
- **No gradients on UI surfaces.** Gradients only on hero/marketing.

## Theme behavior
- Active theme is set on `<html data-theme="dark|light">`. Every component reads semantic tokens (`bg`, `surface`, `text`, etc.) — never hardcoded hex.
- Accent stays violet in both themes but shifts slightly: vivid #7C5CFF in dark, slightly deeper #6B49FF in light for WCAG AA contrast on white surfaces.
- Status colors (success/warning/danger/info) shift one notch darker in light mode for legibility on white.
- Shadows are stronger and warmer in light mode (cool grey-blue tints look sickly). Dark mode shadows are deeper but with less spread.
- Borders are 1px hairlines in both, but light mode uses `#E5E7EB` (very subtle) vs dark mode's `#23262E`.
- Charts: line strokes and accent fills stay the same hue; gridlines are token-driven (`border` 1px dashed) so they auto-adjust.
- Screenshots in marketing pages should pair: hero shows dark-mode product, "see it light too" toggle visible.

## Color tokens

### Dark (default)
- `bg`            — `#0A0B0D`  (page background)
- `surface`       — `#111317`  (cards, modals)
- `surface-2`     — `#17191F`  (raised, dropdowns, popovers)
- `surface-3`     — `#1F2229`  (hover state on surfaces)
- `border`        — `#23262E`  (1px hairlines)
- `border-strong` — `#2E323C`  (input borders, focus rings base)
- `text`          — `#E8E9EC`  (primary)
- `text-dim`      — `#9AA0AA`  (secondary)
- `text-faint`    — `#6B7280`  (placeholder, metadata)
- `accent`        — `#7C5CFF`  (primary brand — vivid violet)
- `accent-hover`  — `#8D72FF`
- `accent-soft`   — `#7C5CFF1A` (10% alpha — bg tints)
- `success`       — `#3DDC97`
- `warning`       — `#FFB454`
- `danger`        — `#FF5C7A`
- `info`          — `#4DA3FF`

### Light
- `bg`            — `#FAFAFB`  (page background — warm off-white, not pure)
- `surface`       — `#FFFFFF`  (cards, modals)
- `surface-2`     — `#F4F5F7`  (raised, dropdowns, popovers, hover bg)
- `surface-3`     — `#EBEDF0`  (active/pressed state on surfaces)
- `border`        — `#E5E7EB`  (1px hairlines — barely visible, that's the point)
- `border-strong` — `#D1D5DB`  (input borders, focus rings base)
- `text`          — `#0E1014`  (primary — near-black, not pure)
- `text-dim`      — `#4B5563`  (secondary)
- `text-faint`    — `#9CA3AF`  (placeholder, metadata)
- `accent`        — `#6B49FF`  (slightly deeper than dark mode for AA on white)
- `accent-hover` — `#5A38EE`
- `accent-soft`   — `#6B49FF14` (8% alpha — bg tints; lower than dark because white shows tints stronger)
- `success`       — `#10A36D`  (darker for AA on white)
- `warning`       — `#D97706`
- `danger`        — `#E11D48`
- `info`          — `#2563EB`

### Status pill alphas
- Dark mode: 15% alpha bg + 100% text.
- Light mode: 12% alpha bg + 100% text (white substrate makes tints look stronger).

## Typography
- **UI sans**: Inter (or system equivalent). Weights: 400, 500, 600.
- **Display**: Inter at 600/700 with `-0.02em` tracking on h1/h2.
- **Mono**: JetBrains Mono. Used for: metrics, mailbox addresses, IDs, log timestamps, code.

### Scale (px / line-height)
- `display`   48 / 56  — marketing hero only
- `h1`        32 / 40
- `h2`        24 / 32
- `h3`        18 / 26
- `body`      14 / 22  — default UI text
- `body-lg`   16 / 24  — marketing/onboarding body
- `caption`   12 / 16  — labels, metadata
- `mono-sm`   12 / 16
- `mono-md`   13 / 20

## Spacing
4-pt grid: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 80`.

## Radius
- `sm` 6px (inputs, small chips)
- `md` 10px (buttons, cards)
- `lg` 14px (modals, large panels)
- `pill` 999px (status badges, avatars)

## Elevation

### Dark
- `e1` — `0 1px 0 #FFFFFF06 inset, 0 1px 2px #00000040` (cards)
- `e2` — `0 4px 16px #00000050` (dropdowns, popovers)
- `e3` — `0 24px 60px #00000070` (modals)

### Light
- `e1` — `0 1px 2px #0E101408, 0 1px 0 #0E101404` (cards — barely-there separation)
- `e2` — `0 6px 20px #0E101410, 0 2px 4px #0E101408` (dropdowns, popovers — softer, warmer)
- `e3` — `0 28px 64px #0E101418, 0 4px 12px #0E101410` (modals — clearly elevated above page)

## Components

### Buttons
- **Primary**: accent fill, white text, 36px tall, 12px h-padding, radius `md`. Hover: `accent-hover`. Focus: 2px ring `accent` at 40% alpha.
- **Secondary**: `surface-2` fill, `text` color, `border` outline. Hover: `surface-3`.
- **Ghost**: transparent, `text-dim` color. Hover: `surface-2` bg, `text` color.
- **Danger**: `danger` fill, white text.
- **Sizes**: sm 28h, md 36h (default), lg 44h. Icon-only buttons are square.

### Inputs
- 36px tall, `surface` fill, `border` outline, radius `sm`. Focus: 1px `accent` border + 2px accent ring at 30% alpha. Placeholder uses `text-faint`. Error: `danger` border, helper text below.

### Cards
- `surface` bg, `border` outline (1px), radius `md`. Padding 20px default. Headers use h3 + optional right-side action.

### Status badges (pill)
- Filled at 15% alpha of the semantic color, text at 100%. E.g. "Active" = `success` bg 15% / `success` text. Heights 22px. Mono font.

### Tables
- Header row: `text-dim`, caption size, uppercase, letter-spacing 0.04em.
- Body rows: 44px tall, hairline `border` between rows, hover `surface-2`.
- Numeric columns right-aligned, mono font.

### Charts
- Line: 2px stroke `accent`. Area fill: `accent` at 12% alpha. Gridlines `border` 1px, dashed. Tooltips: `surface-2` bg, `border-strong` outline, `e2` shadow.
- Use sparklines aggressively in metric cards.

### Navigation
- **App shell**: 240px left sidebar (`surface`). Logo top, nav items mid, user/workspace switcher bottom. Active item: `accent-soft` bg + `accent` left border 2px + `text` color.
- **Top bar**: 56px, `bg` color, breadcrumbs left, global search center, notifications + avatar right.

### Empty states
- Centered, mono caption above an h3 headline, body-lg description, primary CTA. No illustrations — use a tasteful icon at 32px in `text-dim`.

## Iconography
Lucide icons, 16px in body / 20px in buttons / 24px in nav. Stroke 1.5.

## Patterns specific to this product
- **Mailbox cards**: avatar with provider badge (Gmail/Outlook/Yahoo/SMTP), email mono-styled, "Day N of ramp" caption, warmth score as a circular gauge (0–100), action buttons in a row at the bottom.
- **Warmth score gauge**: circular progress, accent color, score in the center using mono font, "warmth" label below.
- **Activity feed**: time on the left (mono, 12px), action icon + colored dot, peer mailbox in mono, action verb in body. Group by day.
- **Onboarding wizard**: progress bar at top (4 steps), large card center, "skip / back / continue" footer.

## Hard rules
- Never use pure black `#000` for text or surfaces.
- Never use bright primary colors as fills on large surfaces (only as accents).
- Always show real, plausible data in mockups (not "lorem ipsum"). Use realistic email addresses, sender names, percentages, dates.
- Every screen should show a state that conveys product value (recent activity, ramping mailboxes, climbing graphs).
