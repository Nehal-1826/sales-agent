/**
 * LLM usage feature hooks.
 *
 * Composes the admin-wide summary and list hooks into a single bundle shaped
 * for `LlmUsagePage`:
 *
 *   data?.plan_caps         → caps per plan, fed to CapEditorDialog
 *   data?.spend_over_time   → daily stacked spend by plan
 *   data?.mode_distribution → donut of content-mode split
 *   data?.cost_forecast     → MTD + forecast bar chart with cap reference line
 *   data?.rows              → per-workspace rows for the big table
 *
 * Re-exports `useAdminLlmByUser` and `useUpdateLlmCap` so pages can import
 * everything  related from this module.
 */
import { useMemo } from 'react';
import {
  useAdminLlmByUser,
  useAdminLlmList,
  useAdminLlmSummary,
  useUpdateLlmCap,
} from '@/features/admin/api';
import type { LlmUsageRow, LlmUsageSummary } from '@/features/admin/types';

export { useAdminLlmByUser, useUpdateLlmCap };
export type { LlmUsageRow, LlmUsageSummary };

// ---------------------------------------------------------------------------
// Shaped types
// ---------------------------------------------------------------------------

export interface PlanCap {
  plan_id: string;
  plan: string;
  cap_tokens: number;
}

/** Point on the per-plan daily spend stacked series. */
export interface SpendByPlanPoint {
  date: string;
  /** Additional keys are plan slugs → USD spent that day. */
  [plan: string]: string | number;
}

export interface ModeSliceRaw {
  mode: 'A' | 'B' | 'C' | 'D';
  tokens: number;
  cost_usd: number;
}

export interface ModeSlice {
  mode: 'A' | 'B' | 'C' | 'D';
  name: string;
  tokens: number;
  cost_usd: number;
}

export interface CostForecastPoint {
  label: string;
  mtd_usd: number;
  forecast_usd: number;
}

export interface CostForecastBundle {
  points: CostForecastPoint[];
  /** Horizontal reference line (configured global cap) in USD. */
  cap_usd: number;
  total_mtd_usd: number;
  total_forecast_usd: number;
}

export interface LlmUsageBundle {
  summary: LlmUsageSummary;
  plan_caps: PlanCap[];
  spend_over_time: SpendByPlanPoint[];
  mode_distribution: ModeSlice[];
  cost_forecast: CostForecastBundle;
  rows: LlmUsageRow[];
}

export interface UseLlmUsageResult {
  data: LlmUsageBundle | undefined;
  isLoading: boolean;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Mode humanisation
// ---------------------------------------------------------------------------

// Per spec §6 (modes A/B/C/D): plain / styled / dual / template-only.
const MODE_LABEL: Record<ModeSliceRaw['mode'], string> = {
  A: 'Plain',
  B: 'Styled',
  C: 'Dual',
  D: 'Template-only',
};

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

function derivePlanKey(row: LlmUsageRow): string {
  return (row.plan || 'unknown').toLowerCase();
}

/**
 * Spreads per-row MTD cost across the summary spend_series uniformly per plan.
 * This is a UI-only approximation until the backend ships a per-plan series;
 * if the backend supplies `spend_series_by_plan` (any-shape) we prefer that.
 */
function buildSpendOverTime(
  summary: LlmUsageSummary,
  rows: LlmUsageRow[],
): SpendByPlanPoint[] {
  const withByPlan = summary as LlmUsageSummary & {
    spend_series_by_plan?: SpendByPlanPoint[];
  };
  if (Array.isArray(withByPlan.spend_series_by_plan) && withByPlan.spend_series_by_plan.length > 0) {
    return withByPlan.spend_series_by_plan;
  }
  const series = summary.spend_series ?? [];
  if (series.length === 0) return [];

  const totalMtd = rows.reduce((acc, r) => acc + (r.cost_mtd_usd || 0), 0) || 1;
  const planWeights = new Map<string, number>();
  for (const r of rows) {
    const key = derivePlanKey(r);
    planWeights.set(key, (planWeights.get(key) ?? 0) + (r.cost_mtd_usd || 0) / totalMtd);
  }
  // Ensure at least one series so the chart isn't blank when no rows are loaded.
  if (planWeights.size === 0) planWeights.set('all', 1);

  return series.map((pt) => {
    const out: SpendByPlanPoint = { date: pt.date };
    for (const [plan, w] of planWeights.entries()) {
      out[plan] = Number((pt.cost_usd * w).toFixed(4));
    }
    return out;
  });
}

function buildModeDistribution(summary: LlmUsageSummary): ModeSlice[] {
  // Backend `by_mode` is a dict `{A: tokens, B: tokens, ...}`; older mocks used an array of
  // `{mode, tokens, cost_usd}`. Accept both.
  const isValidMode = (m: string): m is 'A' | 'B' | 'C' | 'D' =>
    m === 'A' || m === 'B' || m === 'C' || m === 'D';
  const label = (m: string): string =>
    isValidMode(m) ? (MODE_LABEL[m] ?? m) : m;

  const raw: unknown = summary.by_mode;
  if (Array.isArray(raw)) {
    return raw
      .filter((m: { mode: string }) => isValidMode(m.mode))
      .map((m: { mode: 'A'|'B'|'C'|'D'; tokens?: number; cost_usd?: number }) => ({
        mode: m.mode,
        name: label(m.mode),
        tokens: m.tokens ?? 0,
        cost_usd: m.cost_usd ?? 0,
      }));
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, number>)
      .filter(([mode]) => isValidMode(mode))
      .map(([mode, tokens]) => ({
        mode: mode as 'A'|'B'|'C'|'D',
        name: label(mode),
        tokens: Number(tokens) || 0,
        cost_usd: 0,
      }));
  }
  return [];
}

function buildCostForecast(summary: LlmUsageSummary): CostForecastBundle {
  const mtd = (summary.total_cost_cents_mtd ?? 0) / 100;
  const forecast = (summary.forecast_eom_cents ?? 0) / 100;
  const remaining = Math.max(0, forecast - mtd);
  // Derive a cap if the backend exposes any cap row; sum all plan caps * $/token
  // is impossible to estimate without a rate, so just use the largest plan cap
  // as the reference line stand-in. Falls back to the forecast when no caps.
  const caps = summary.caps_by_plan ?? [];
  // Very rough: treat each token as $0.003 / 1000 (per spec) to get USD bound.
  const TOKEN_USD = 0.003 / 1000;
  const capUsd =
    caps.length > 0
      ? Math.max(...caps.map((c) => (c.cap_tokens ?? 0) * TOKEN_USD))
      : forecast * 1.1;
  return {
    points: [
      { label: 'Month to date', mtd_usd: mtd, forecast_usd: 0 },
      { label: 'Projected EOM', mtd_usd: mtd, forecast_usd: remaining },
    ],
    cap_usd: Number.isFinite(capUsd) ? capUsd : 0,
    total_mtd_usd: mtd,
    total_forecast_usd: forecast,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLlmUsage(): UseLlmUsageResult {
  const summaryQ = useAdminLlmSummary();
  const listQ = useAdminLlmList({ page: 1, page_size: 100 });

  const isLoading = summaryQ.isLoading || listQ.isLoading;
  const isError = summaryQ.isError || listQ.isError;

  const data = useMemo<LlmUsageBundle | undefined>(() => {
    if (!summaryQ.data || !listQ.data) return undefined;
    const summary = summaryQ.data;
    const rows = listQ.data.items ?? [];
    return {
      summary,
      plan_caps: (summary.caps_by_plan ?? []).map((c) => ({
        plan_id: c.plan_id,
        plan: c.plan,
        cap_tokens: c.cap_tokens,
      })),
      spend_over_time: buildSpendOverTime(summary, rows),
      mode_distribution: buildModeDistribution(summary),
      cost_forecast: buildCostForecast(summary),
      rows,
    };
  }, [summaryQ.data, listQ.data]);

  return { data, isLoading, isError };
}
