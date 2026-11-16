/**
 * Platform analytics composite hook.
 *
 * Fans out to the existing admin react-query hooks and reshapes their results
 * into the single blob `PlatformAnalyticsPage` expects. Fields without a
 * dedicated backend hook yet (placement_trend, spam_rate, provider_breakdown,
 * funnel) are fetched opportunistically via soft-failing GETs — when the
 * backend lights them up, they will populate; until then they resolve to
 * empty arrays so the UI renders "no data" states instead of throwing.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import {
  useAdminOverview,
  useAdminWarmthDistribution,
  useAdminSendVolume,
  useAdminPlanDistribution,
  useAdminTopClients,
} from '@/features/admin/api';
import type {
  PlatformOverview,
  VolumePoint,
  WarmthBin,
  PlanDistributionRow,
  TopClient,
} from '@/features/admin/types';

// ---------------------------------------------------------------------------
// Types exposed to page + components
// ---------------------------------------------------------------------------

export interface PlacementTrendPoint {
  date: string;
  inbox_pct: number;
  promotions_pct: number;
  spam_pct: number;
}

export interface SpamRatePoint {
  date: string;
  spam_rate: number;
}

export interface ProviderBreakdownSlice {
  provider: string;
  count: number;
}

export interface FunnelStep {
  stage: string;
  value: number;
}

export interface PlatformAnalyticsData {
  overview: PlatformOverview | undefined;
  total_sends: VolumePoint[];
  warmth_histogram: WarmthBin[];
  placement_trend: PlacementTrendPoint[];
  spam_rate: SpamRatePoint[];
  provider_breakdown: ProviderBreakdownSlice[];
  funnel: FunnelStep[];
  top_workspaces: TopClient[];
  plan_distribution: PlanDistributionRow[];
}

export interface PlatformAnalyticsResult {
  data: PlatformAnalyticsData | undefined;
  isLoading: boolean;
  isError: boolean;
}

// ---------------------------------------------------------------------------
// Soft-failing helpers (same pattern as features/admin/api.ts)
// ---------------------------------------------------------------------------

function isSoftMissing(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  const s = err.response?.status ?? null;
  return s === 404 || s === 501 || s === 503;
}

async function getOrEmpty<T>(path: string, empty: T): Promise<T> {
  try {
    const res = await api.get<T>(path);
    return res.data;
  } catch (err) {
    if (isSoftMissing(err)) return empty;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Opportunistic fetches for fields without a dedicated hook yet
// ---------------------------------------------------------------------------

function usePlacementTrend(): UseQueryResult<PlacementTrendPoint[]> {
  return useQuery({
    queryKey: ['admin', 'platform-analytics', 'placement-trend'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<
        PlacementTrendPoint[] | { items: PlacementTrendPoint[] }
      >('/admin/platform-analytics/placement-trend', []);
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

function useSpamRate(): UseQueryResult<SpamRatePoint[]> {
  return useQuery({
    queryKey: ['admin', 'platform-analytics', 'spam-rate'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<SpamRatePoint[] | { items: SpamRatePoint[] }>(
        '/admin/platform-analytics/spam-rate',
        [],
      );
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

function useProviderBreakdown(): UseQueryResult<ProviderBreakdownSlice[]> {
  return useQuery({
    queryKey: ['admin', 'platform-analytics', 'provider-breakdown'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<
        ProviderBreakdownSlice[] | { items: ProviderBreakdownSlice[] }
      >('/admin/platform-analytics/provider-breakdown', []);
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

function useEngagementFunnel(): UseQueryResult<FunnelStep[]> {
  return useQuery({
    queryKey: ['admin', 'platform-analytics', 'engagement-funnel'] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await getOrEmpty<FunnelStep[] | { items: FunnelStep[] }>(
        '/admin/platform-analytics/engagement-funnel',
        [],
      );
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
}

// ---------------------------------------------------------------------------
// Composite hook
// ---------------------------------------------------------------------------

/**
 * Aggregate every platform-analytics query into a single result object.
 *
 * `isLoading` is true while any primary query is still on its first fetch;
 * `isError` is true only if every primary query failed (individual soft-missing
 * endpoints are expected and don't flip the global error flag).
 */
export function usePlatformAnalytics(): PlatformAnalyticsResult {
  const overview = useAdminOverview();
  const sendVolume = useAdminSendVolume(30);
  const warmth = useAdminWarmthDistribution();
  const planDist = useAdminPlanDistribution();
  const topClients = useAdminTopClients('send_volume');

  const placement = usePlacementTrend();
  const spam = useSpamRate();
  const providers = useProviderBreakdown();
  const funnel = useEngagementFunnel();

  const primaries = [overview, sendVolume, warmth, planDist, topClients];
  const isLoading = primaries.some((q) => q.isLoading);
  const isError = primaries.every((q) => q.isError);

  const data: PlatformAnalyticsData = {
    overview: overview.data,
    total_sends: sendVolume.data ?? [],
    warmth_histogram: warmth.data ?? [],
    placement_trend: placement.data ?? [],
    spam_rate: spam.data ?? [],
    provider_breakdown: providers.data ?? [],
    funnel: funnel.data ?? [],
    top_workspaces: topClients.data ?? [],
    plan_distribution: planDist.data ?? [],
  };

  return { data, isLoading, isError };
}
