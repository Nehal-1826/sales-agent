import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Per-panel visibility + ordering preferences for the Pro Analytics
 * dashboard. Persisted to localStorage under `warmpulse.dashboardPrefs.v1`.
 *
 * Mirrors the persistence approach used by `stores/ui.ts` and
 * `stores/auth.ts` (zustand `persist` + `createJSONStorage(localStorage)`
 * + `partialize`). Only `hidden` + `order` are persisted; everything else
 * (the action closures) is recreated on each load.
 *
 * A pure `visiblePanels()` selector is exported so a consumer (the
 * dashboard renderer, owned by a parallel agent) can derive the visible
 * panel order without subscribing to the store. Locked panels are always
 * present and always pinned to the front in canonical order.
 */

// Stable panel ids for the Analytics dashboard:
export const DASHBOARD_PANELS = [
  { id: 'kpi-band', label: 'Deliverability KPIs', locked: true },
  { id: 'warmth-volume', label: 'Warmth & volume', locked: true },
  { id: 'placement', label: 'Placement trend', locked: false },
  { id: 'provider', label: 'Provider split', locked: false },
  { id: 'engagement', label: 'Engagement', locked: false },
  { id: 'leaderboard', label: 'Mailbox leaderboard', locked: false },
] as const;
export type DashboardPanelId = (typeof DASHBOARD_PANELS)[number]['id'];

export const MAX_HIDDEN_PRO = 3; // Pro can hide at most 3 panels

export interface DashboardPrefsState {
  hidden: DashboardPanelId[]; // user-hidden panel ids (locked ids never here)
  order: DashboardPanelId[]; // full ordering of ALL panel ids
  toggle: (id: DashboardPanelId) => void; // no-op on locked; respects MAX_HIDDEN_PRO
  move: (id: DashboardPanelId, dir: 'up' | 'down') => void; // no-op on locked or boundary
  reset: () => void; // back to DASHBOARD_PANELS default order, nothing hidden
}

// ---------------------------------------------------------------------------
// Canonical id helpers
// ---------------------------------------------------------------------------

const CANONICAL_ORDER: DashboardPanelId[] = DASHBOARD_PANELS.map((p) => p.id);

const PANEL_BY_ID: Record<DashboardPanelId, (typeof DASHBOARD_PANELS)[number]> =
  DASHBOARD_PANELS.reduce(
    (acc, p) => {
      acc[p.id] = p;
      return acc;
    },
    {} as Record<DashboardPanelId, (typeof DASHBOARD_PANELS)[number]>,
  );

const LOCKED_IDS: DashboardPanelId[] = DASHBOARD_PANELS.filter((p) => p.locked).map(
  (p) => p.id,
);

function isKnownId(value: unknown): value is DashboardPanelId {
  return typeof value === 'string' && value in PANEL_BY_ID;
}

function isLocked(id: DashboardPanelId): boolean {
  return PANEL_BY_ID[id].locked;
}

/**
 * Re-pin locked panels to the front (in canonical order), keep the
 * relative order of the remaining non-locked panels as supplied, drop
 * unknown ids, and ensure every canonical id appears exactly once.
 *
 * Used both when sanitising persisted state on load and after a move.
 */
function normaliseOrder(input: readonly unknown[] | undefined): DashboardPanelId[] {
  const seen = new Set<DashboardPanelId>();
  const nonLocked: DashboardPanelId[] = [];

  for (const raw of input ?? []) {
    if (!isKnownId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    if (!isLocked(raw)) nonLocked.push(raw);
  }

  // Any canonical non-locked id that wasn't present (e.g. a brand-new
  // panel added in a later release) appends in canonical order.
  for (const id of CANONICAL_ORDER) {
    if (isLocked(id) || seen.has(id)) continue;
    seen.add(id);
    nonLocked.push(id);
  }

  // Locked panels always lead, pinned in canonical order.
  return [...LOCKED_IDS, ...nonLocked];
}

function sanitiseHidden(input: readonly unknown[] | undefined): DashboardPanelId[] {
  const out: DashboardPanelId[] = [];
  const seen = new Set<DashboardPanelId>();
  for (const raw of input ?? []) {
    if (!isKnownId(raw) || seen.has(raw)) continue;
    if (isLocked(raw)) continue; // locked panels can never be hidden
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDashboardPrefs = create<DashboardPrefsState>()(
  persist(
    (set) => ({
      hidden: [],
      order: [...CANONICAL_ORDER],

      toggle: (id) =>
        set((state) => {
          // Locked panels can never be hidden/shown.
          if (!isKnownId(id) || isLocked(id)) return state;

          const currentlyHidden = state.hidden.includes(id);
          if (currentlyHidden) {
            // Always allowed to re-show a panel.
            return { hidden: state.hidden.filter((h) => h !== id) };
          }

          // Hiding: enforce the cap here too (UI also guards).
          if (state.hidden.length >= MAX_HIDDEN_PRO) return state;
          return { hidden: [...state.hidden, id] };
        }),

      move: (id, dir) =>
        set((state) => {
          if (!isKnownId(id) || isLocked(id)) return state;

          const order = normaliseOrder(state.order);
          const idx = order.indexOf(id);
          if (idx === -1) return state;

          const target = dir === 'up' ? idx - 1 : idx + 1;
          if (target < 0 || target >= order.length) return state; // boundary

          const neighbour = order[target];
          // Never let a non-locked panel cross above the contiguous
          // leading block of locked panels — they stay pinned at the top.
          if (neighbour === undefined || isLocked(neighbour)) return state;

          const next = [...order];
          next[idx] = neighbour;
          next[target] = id;
          return { order: next };
        }),

      reset: () => set(() => ({ hidden: [], order: [...CANONICAL_ORDER] })),
    }),
    {
      name: 'warmpulse.dashboardPrefs.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ hidden: state.hidden, order: state.order }),
      // Sanitise persisted state on rehydration: drop unknown ids, re-pin
      // locked panels to the front, ensure each canonical id appears once.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<
          Pick<DashboardPrefsState, 'hidden' | 'order'>
        >;
        return {
          ...current,
          order: normaliseOrder(p.order),
          hidden: sanitiseHidden(p.hidden),
        };
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Pure selector
// ---------------------------------------------------------------------------

/**
 * Given the canonical panel id list (via the user's persisted prefs),
 * return the VISIBLE ids in the user's preferred order. Locked panels are
 * always present; if `order` is missing ids (new panels added later) they
 * append in canonical order. Hidden non-locked ids are filtered out.
 */
export function visiblePanels(
  prefs: Pick<DashboardPrefsState, 'hidden' | 'order'>,
): DashboardPanelId[] {
  const order = normaliseOrder(prefs.order);
  const hidden = new Set(sanitiseHidden(prefs.hidden));
  return order.filter((id) => isLocked(id) || !hidden.has(id));
}
