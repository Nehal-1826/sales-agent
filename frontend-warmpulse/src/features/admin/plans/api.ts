/**
 * Plans feature hooks.
 *
 * Re-exports the low-level `useAdminPlans` / `useUpdatePlan` mutations from
 * the parent admin api, and composes a `usePlans()` hook that yields both
 * the list of plans and a derived MRR-contribution series for charts.
 *
 * The `Plan` alias exists so pages can import `{ usePlans, type Plan }`
 * without reaching into the admin-wide type barrel.
 */
import { useMemo } from 'react';
import {
  useAdminPlans,
  useUpdatePlan,
} from '@/features/admin/api';
import type { PlanRow } from '@/features/admin/types';

export { useAdminPlans, useUpdatePlan };

/** Exposed as `Plan` so page-level code can stay agnostic of the backend name. */
export type Plan = PlanRow;

export interface PlanRevenueSharePoint {
  plan: string;
  mrr_usd: number;
  user_count: number;
}

export interface PlansBundle {
  plans: Plan[];
  revenue_share: PlanRevenueSharePoint[];
}

export interface UsePlansResult {
  data: PlansBundle | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Top-level plans hook used by `PlansPage`.
 *
 * Derives the revenue-share series from each plan's monthly price multiplied
 * by its subscriber count. `subscriber_count` is read from the first field
 * the backend is likely to expose (`user_count` / `subscriber_count` /
 * `active_subscriptions`) and falls back to `0` so we don't falsely imply
 * revenue that isn't there.
 */
export function usePlans(): UsePlansResult {
  const query = useAdminPlans();

  const data = useMemo<PlansBundle | undefined>(() => {
    if (!query.data) return undefined;
    const plans = query.data;
    const revenue_share: PlanRevenueSharePoint[] = plans.map((plan) => {
      const extra = plan as PlanRow & {
        user_count?: number;
        subscriber_count?: number;
        active_subscriptions?: number;
      };
      const user_count =
        extra.user_count ??
        extra.subscriber_count ??
        extra.active_subscriptions ??
        0;
      const mrr_usd = Number((user_count * plan.price_monthly_usd).toFixed(2));
      return { plan: plan.name, user_count, mrr_usd };
    });
    return { plans, revenue_share };
  }, [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
