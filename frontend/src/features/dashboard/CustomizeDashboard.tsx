import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { usePlan } from '@/lib/usePlan';
import {
  DASHBOARD_PANELS,
  MAX_HIDDEN_PRO,
  useDashboardPrefs,
} from '@/stores/dashboardPrefs';

/**
 * CustomizeDashboard — a self-contained "Customize" control for the Pro
 * Analytics dashboard. Reads/writes ONLY via `useDashboardPrefs`; renders
 * standalone (no parent context beyond what AppDialog needs).
 *
 * Styling targets the live app's admin `--wp-*` token surface (this is the
 * same theme the admin pages use). Accent is `var(--wp-accent)`.
 */

const PANEL_INDEX = DASHBOARD_PANELS.reduce<Record<string, number>>(
  (acc, p, i) => {
    acc[p.id] = i;
    return acc;
  },
  {},
);

export function CustomizeDashboard(): JSX.Element {
  const [open, setOpen] = useState(false);
  const { isAgency } = usePlan();

  const hidden = useDashboardPrefs((s) => s.hidden);
  const order = useDashboardPrefs((s) => s.order);
  const toggle = useDashboardPrefs((s) => s.toggle);
  const move = useDashboardPrefs((s) => s.move);
  const reset = useDashboardPrefs((s) => s.reset);

  const hiddenCount = hidden.length;
  const atLimit = hiddenCount >= MAX_HIDDEN_PRO;

  // Render rows in the user's current order. Fall back to canonical order
  // for any id missing from the persisted order (defensive — the store
  // normalises this, but the component must not assume).
  const rows = [...DASHBOARD_PANELS].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    const an = ai === -1 ? PANEL_INDEX[a.id] ?? 0 : ai;
    const bn = bi === -1 ? PANEL_INDEX[b.id] ?? 0 : bi;
    return an - bn;
  });

  const headerNote = isAgency
    ? 'Full control.'
    : `Pro plan · customize up to ${MAX_HIDDEN_PRO} panels. Upgrade to Agency for full control.`;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<SlidersHorizontal className="h-4 w-4" />}
        onClick={() => setOpen(true)}
      >
        Customize
      </Button>

      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent description="Show, hide, and reorder dashboard panels.">
          <AppDialogHeader>
            <AppDialogTitle>Customize dashboard</AppDialogTitle>
            <p
              className="pl-4 text-sm leading-relaxed"
              style={{ color: 'var(--wp-text-dim, rgba(255,255,255,0.55))' }}
            >
              {headerNote}
            </p>
          </AppDialogHeader>

          <AppDialogBody>
            <ul className="flex flex-col gap-2">
              {rows.map((panel, visualIdx) => {
                const isHidden = hidden.includes(panel.id);
                // Disable the "hide" affordance for visible non-locked
                // panels once the limit is reached (can still re-show).
                const toggleDisabled =
                  panel.locked || (!isHidden && atLimit);
                const atTop = visualIdx === 0;
                const atBottom = visualIdx === rows.length - 1;

                return (
                  <li
                    key={panel.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{
                      background:
                        'color-mix(in srgb, var(--wp-surface, #16161d) 70%, transparent)',
                      border: '1px solid var(--wp-border, #2a2a2a)',
                      color: 'var(--wp-text, #fff)',
                      opacity: panel.locked ? 0.85 : 1,
                    }}
                  >
                    {/* Reorder controls */}
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Move ${panel.label} up`}
                        disabled={panel.locked || atTop}
                        onClick={() => move(panel.id, 'up')}
                        className="inline-flex h-4 w-5 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                        style={{ color: 'var(--wp-text-dim, rgba(255,255,255,0.55))' }}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${panel.label} down`}
                        disabled={panel.locked || atBottom}
                        onClick={() => move(panel.id, 'down')}
                        className="inline-flex h-4 w-5 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                        style={{ color: 'var(--wp-text-dim, rgba(255,255,255,0.55))' }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Label + locked caption */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {panel.label}
                        </span>
                        {panel.locked ? (
                          <Lock
                            className="h-3 w-3 flex-none"
                            style={{
                              color: 'var(--wp-text-dim, rgba(255,255,255,0.45))',
                            }}
                          />
                        ) : null}
                      </div>
                      {panel.locked ? (
                        <span
                          className="text-[11px]"
                          style={{
                            color: 'var(--wp-text-dim, rgba(255,255,255,0.45))',
                          }}
                        >
                          Core panel
                        </span>
                      ) : null}
                    </div>

                    {/* Visibility toggle */}
                    <button
                      type="button"
                      aria-label={
                        isHidden ? `Show ${panel.label}` : `Hide ${panel.label}`
                      }
                      aria-pressed={!isHidden}
                      disabled={toggleDisabled}
                      onClick={() => toggle(panel.id)}
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        background: isHidden
                          ? 'transparent'
                          : 'color-mix(in srgb, var(--wp-accent, #F26522) 16%, transparent)',
                        color: isHidden
                          ? 'var(--wp-text-dim, rgba(255,255,255,0.55))'
                          : 'var(--wp-accent, #F26522)',
                      }}
                    >
                      {isHidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {atLimit && !isAgency ? (
              <p
                className="mt-3 text-[11px]"
                style={{ color: 'var(--wp-text-dim, rgba(255,255,255,0.45))' }}
              >
                Limit reached ({MAX_HIDDEN_PRO}). Re-show a panel to hide a
                different one.
              </p>
            ) : null}
          </AppDialogBody>

          <AppDialogFooter>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
              style={{ color: 'var(--wp-text-dim, rgba(255,255,255,0.6))' }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to default
            </button>
            <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}

export default CustomizeDashboard;
