# Tools + Template Designer — Per-Tier Redesign (Cycle 1)

**Date:** 2026-06-24
**Status:** Approved (design)
**Scope:** The `/app/tools` area — the per-tier landing pages **and** the
Template Designer tool. Sent-email HTML (backend `mail_templates.py`) is a
**separate later cycle** and out of scope here.

## Context

`/app/tools` already dispatches by plan via `usePlan()` in `ToolsPage.tsx` to
`StarterTools` / `ProTools` / `ProPlusTools` / `AgencyTools`, all sharing the
working sub-tools (`PlacementTester`, `SpamScanner`, `TemplateDesigner`,
`WarmupPreview`). The tiers are currently **inverted**: Starter (481 lines) and
Pro (326) are rich; Pro Plus (77) and Agency (39) are thin stubs. Goal: a clear
quality ladder — Starter clean/calm → Agency premium command center — using a
**tiered-components** model (shared skeleton, key components swap per tier).

This is the author's semester project; all mailboxes are owned by them; not for
release. Constraint: every control must work or be removed (no coming-soon).

## Goal

Redesign the Tools landing + Template Designer so each paid tier
(Starter → Pro → Pro Plus → Agency) has a visibly distinct, escalating
experience, without forking the underlying tool logic.

## Non-goals

- No change to the working tool logic (Placement/Spam/Warmup/Template engines).
- No sent-email HTML redesign (separate cycle C).
- Free tier keeps its existing minimal/locked view.

## Architecture

Shared tier-aware primitives drive the skin/density; the tool logic is untouched.

```
frontend/src/features/tools/tier/
  tierTheme.ts     — TierConfig per tier: accent, surface, radius, glow, motion,
                     density, shellKind ('list'|'tabs'|'lab'|'workbench')
  TierShell.tsx    — page frame (header, accent, motion level) driven by TierConfig
  ToolLauncher.tsx — renders the 4 tool entries in the tier's style:
                     list row | card | lab panel | glass tile
  index.ts
frontend/src/pages/client/tools/
  StarterTools.tsx / ProTools.tsx / ProPlusTools.tsx / AgencyTools.tsx
                   — thin: select TierConfig + compose TierShell + ToolLauncher
                     (+ tier-specific extras)
```

`ToolsPage.tsx` dispatch is unchanged. The 4 sub-tools remain the working
sub-routes; only their **entry presentation** (the launcher) changes.

### TierConfig (tierTheme.ts)

```ts
type ShellKind = 'list' | 'tabs' | 'lab' | 'workbench';
interface TierConfig {
  tier: 'starter'|'pro'|'pro_plus'|'agency';
  shellKind: ShellKind;
  accent: string;        // existing token or color-mix expression
  glow: boolean;
  motion: 'none'|'subtle'|'reveal'|'spring';
  density: 'roomy'|'normal'|'compact';
  title: string;         // "Tools" | "Pro Tools" | "Experiment Lab" | "Agency Workbench"
  extras: ('recent'|'liveStats'|'mailboxPicker'|'commandK'|'bulk')[];
}
```

## Components & per-tier behavior

### Tools landing

| Tier | shellKind | Tool entries | motion | extras |
|---|---|---|---|---|
| Starter | list | flat rows, "Open ›" | none | upgrade hint footer |
| Pro | tabs | 2-col cards, icon + hover lift | subtle | recent-activity strip |
| Pro Plus | lab | lab panels + live stat tiles (workspace data) | reveal | mailbox picker, mini charts |
| Agency | workbench | glass tiles, gradient hero + glow | spring | ⌘K palette, bulk actions bar |

Live data for Pro Plus / Agency reuses existing hooks (`useProPlusLabData`,
`useAgencyToolsData`) where present; no new endpoints.

### Template Designer (shared skeleton: editor + live preview)

| Tier | Capability |
|---|---|
| Starter | one template, subject/body, plain preview |
| Pro | variable chips, few presets, light/dark preview toggle |
| Pro Plus | preset gallery, save multiple, send-test-to-mailbox |
| Agency | full library + categories, glass editor, device-frame preview, duplicate/bulk |

Tier capability gating via `usePlan()`; higher-tier-only actions render a
tasteful upgrade nudge (functional link to billing), never a dead button. Where
"save multiple / send-test / library" need persistence, reuse existing template
endpoints if present; if an endpoint is missing, that capability is omitted for
now (and not shown) rather than faked — to honor no-coming-soon.

## Cross-cutting

- Tailwind tokens only + per-tier accent/glow in `tierTheme.ts`. Respect the
  var-token alpha gotcha (use `color-mix` / `/opacity`, not bare alpha on
  var-backed tokens).
- `planOverride` (super-admin) previews all four tiers from one login.
- Motion via framer-motion (already used in `ToolsPage`).

## Error handling

- Live-data tiers degrade to a calm empty/loading state on fetch error (no red
  screen), matching existing best-effort hook conventions.
- Missing optional capability → omitted, not errored.

## Testing

- `pnpm`/`npx tsc -b` strict build must pass (Docker build uses `tsc -b`).
- Manual tier preview via `planOverride` for all four tiers (Tools landing +
  Template Designer), confirming no dead controls and no overlap.
- No backend changes → no pytest impact expected.

## Deploy

- Frontend-only. Build `frontend`, `docker compose up -d frontend`. Deploy to
  live per project convention; push when asked.

## Build order (phases)

1. `tierTheme.ts` + `TierShell` + `ToolLauncher` primitives.
2. Rewire the 4 landing files onto the primitives (Starter→Agency).
3. Template Designer tiering.
4. tsc -b, deploy, visual pass across all 4 tiers.
