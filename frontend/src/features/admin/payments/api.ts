/**
 * Payments feature hooks.
 *
 * Composes the low-level `useAdminPayments` query into a richer analytics
 * object consumed by the payments page. When the backend provides
 * `revenue_series` and `by_plan_series` on the list response we forward
 * them; otherwise we derive equivalents from `items`.
 */
import { useMemo } from 'react';
import {
  useAdminPayments,
  useExportPaymentsCsv,
} from '@/features/admin/api';
import type {
  AdminPayment,
  PaymentStatus,
  PaymentsFilters,
  PaymentsListResponse,
} from '@/features/admin/types';

export { useAdminPayments, useExportPaymentsCsv };
export type { AdminPayment, PaymentStatus, PaymentsFilters, PaymentsListResponse };

export interface MonthlyRevenuePoint {
  date: string;
  revenue_usd: number;
}

export interface PlanConversionsPoint {
  month: string;
  [plan: string]: string | number;
}

export interface PaymentsAnalytics {
  monthly_revenue: MonthlyRevenuePoint[];
  plan_conversions: PlanConversionsPoint[];
  total_revenue_usd: number;
  count: number;
}

export interface UsePaymentsAnalyticsResult {
  data: PaymentsAnalytics | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** Derive a daily-revenue series from the list of successful payments. */
function deriveRevenueSeries(items: AdminPayment[]): MonthlyRevenuePoint[] {
  const buckets = new Map<string, number>();
  for (const p of items) {
    if (p.status !== 'succeeded') continue;
    const day = (p.created_at ?? '').slice(0, 10);
    if (!day) continue;
    buckets.set(day, (buckets.get(day) ?? 0) + p.amount_usd);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue_usd]) => ({ date, revenue_usd: Number(revenue_usd.toFixed(2)) }));
}

/** Derive month-by-plan signup counts from the list. */
function derivePlanConversions(items: AdminPayment[]): PlanConversionsPoint[] {
  const buckets = new Map<string, Record<string, number>>();
  const plans = new Set<string>();
  for (const p of items) {
    if (p.status !== 'succeeded') continue;
    const month = (p.created_at ?? '').slice(0, 7);
    if (!month) continue;
    plans.add(p.plan);
    const row = buckets.get(month) ?? {};
    row[p.plan] = (row[p.plan] ?? 0) + 1;
    buckets.set(month, row);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, plansRow]) => {
      const point: PlanConversionsPoint = { month };
      for (const plan of plans) {
        point[plan] = plansRow[plan] ?? 0;
      }
      return point;
    });
}

/**
 * Top-level analytics hook used by `PaymentsPage`. Accepts optional filters
 * so callers can narrow the revenue/conversion windows alongside the table.
 */
export function usePaymentsAnalytics(
  filters?: PaymentsFilters,
): UsePaymentsAnalyticsResult {
  const query = useAdminPayments(filters);

  const data = useMemo<PaymentsAnalytics | undefined>(() => {
    const resp = query.data;
    if (!resp) return undefined;
    const items = resp.items ?? [];
    const monthly_revenue =
      resp.revenue_series && resp.revenue_series.length > 0
        ? resp.revenue_series.map((p) => ({
            date: p.date,
            revenue_usd: Number(p.revenue_usd),
          }))
        : deriveRevenueSeries(items);
    const plan_conversions =
      resp.by_plan_series && resp.by_plan_series.length > 0
        ? (resp.by_plan_series as PlanConversionsPoint[])
        : derivePlanConversions(items);
    const total_revenue_usd = items
      .filter((p) => p.status === 'succeeded')
      .reduce((sum, p) => sum + p.amount_usd, 0);
    return {
      monthly_revenue,
      plan_conversions,
      total_revenue_usd: Number(total_revenue_usd.toFixed(2)),
      count: items.length,
    };
  }, [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

// ---------------------------------------------------------------------------
// Filter helpers (used by PaymentsTable)
// ---------------------------------------------------------------------------

export interface PaymentsFilterDraft {
  status: PaymentStatus | 'all';
  plan: string;
  user_email: string;
  date_from: string;
  date_to: string;
}

export const EMPTY_PAYMENTS_DRAFT: PaymentsFilterDraft = {
  status: 'all',
  plan: '',
  user_email: '',
  date_from: '',
  date_to: '',
};

export function draftToFilters(
  draft: PaymentsFilterDraft,
  page: number,
  page_size: number,
): PaymentsFilters {
  const out: PaymentsFilters = { page, page_size };
  if (draft.status !== 'all') out.status = draft.status;
  if (draft.plan.trim()) out.plan = draft.plan.trim();
  if (draft.user_email.trim()) out.user_email = draft.user_email.trim();
  if (draft.date_from) out.date_from = draft.date_from;
  if (draft.date_to) out.date_to = draft.date_to;
  return out;
}

export function formatUsd(amountUsd: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(amountUsd);
  } catch {
    return `$${amountUsd.toFixed(2)}`;
  }
}
