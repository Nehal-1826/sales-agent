# WarmPulse Frontend

React + Vite + TypeScript frontend for WarmPulse.

## Quick start

```bash
pnpm install
pnpm dev
```

App runs on http://localhost:5173. API calls to `/api/*` are proxied to `http://localhost:8001`.

## Scripts

- `pnpm dev` — Vite dev server
- `pnpm build` — type-check + production bundle
- `pnpm preview` — serve the built bundle
- `pnpm lint` — ESLint
- `pnpm typecheck` — `tsc --noEmit`

## Layout

- `src/components/ui/` — themed Radix primitives (`AppDialog`, `AppDropdown`, `Button`, etc.)
- `src/components/layout/` — `PublicLayout`, `ClientLayout`, `AdminLayout`, `OnboardingLayout`, `AuthGuard`
- `src/pages/` — routed pages (stubs for most sections)
- `src/stores/` — Zustand stores (`auth`, `ui`)
- `src/providers/` — `LenisProvider`, `ScrollProgress`
- `src/lib/` — `api`, `cn`, `query`, `env`

See `docs/superpowers/specs/2026-04-23-warmpulse-platform-architecture-design.md` for the architecture contract.
