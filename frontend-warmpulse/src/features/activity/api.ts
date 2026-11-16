import {
  useInfiniteQuery,
  useQuery,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import type {
  ActivityAction,
  ActivityFeedResponse,
  ActivityFilterState,
  ActivityHourBucket,
  ActivityItem,
  ActivityTodayStats,
} from './types';

/**
 * Hooks for the warmup activity feed (spec §5.1 item 3).
 * - Infinite cursor feed, auto-refreshed every 30s while the tab is visible.
 * - Client-side hourly aggregation for the stacked bar card.
 */

function isAxios404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

function toFilterParams(f: ActivityFilterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.mailbox_id && f.mailbox_id !== 'all') out.mailbox_id = f.mailbox_id;
  if (f.action && f.action !== 'all') out.action = f.action;
  if (f.search) out.search = f.search;
  return out;
}

function normalizeFeedResponse(data: unknown): ActivityFeedResponse {
  if (!data) return { items: [] };
  if (Array.isArray(data)) return { items: data as ActivityItem[] };
  const d = data as Partial<ActivityFeedResponse> & { items?: unknown };
  const items = Array.isArray(d.items) ? (d.items as ActivityItem[]) : [];
  return { items, next_cursor: d.next_cursor ?? null };
}

export function useActivityFeedInfinite(
  filters: ActivityFilterState = {},
): UseInfiniteQueryResult<{ pages: ActivityFeedResponse[]; pageParams: unknown[] }, unknown> {
  const qp = toFilterParams(filters);
  return useInfiniteQuery({
    queryKey: ['activity', 'feed', qp],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      try {
        const params: Record<string, string | number> = { ...qp, limit: 50 };
        if (pageParam !== undefined) params.cursor = pageParam;
        const res = await api.get('/workspace/warmup-activity', { params });
        return normalizeFeedResponse(res.data);
      } catch (err) {
        if (isAxios404(err)) return { items: [], next_cursor: null } satisfies ActivityFeedResponse;
        throw err;
      }
    },
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
}

// ---------------------------------------------------------------------------
// Today stats (summary strip)
// ---------------------------------------------------------------------------

export function useTodayStats(
  mailbox_id?: string,
): UseQueryResult<ActivityTodayStats> {
  const qp: Record<string, string> = {};
  if (mailbox_id && mailbox_id !== 'all') qp.mailbox_id = mailbox_id;
  return useQuery({
    queryKey: ['activity', 'today-stats', qp],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/warmup-activity/today-stats', { params: qp });
        return res.data as ActivityTodayStats;
      } catch (err) {
        if (isAxios404(err)) return { sent: 0, opens: 0, replies: 0, spam_rescues: 0 };
        throw err;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Client-side hourly aggregation for the stacked bar.
// Takes the flattened feed items and buckets by hours-ago (last 24h).
// ---------------------------------------------------------------------------

const ACTION_KEYS: ActivityAction[] = [
  'sent',
  'opened',
  'replied',
  'starred',
  'spam_rescued',
  'marked_important',
];

export function buildHourlyBuckets(items: ActivityItem[]): ActivityHourBucket[] {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const buckets: ActivityHourBucket[] = Array.from({ length: 24 }).map((_, i) => {
    const d = new Date(base.getTime() - (23 - i) * 3_600_000);
    return {
      hour: 23 - i,
      label: d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true }).replace(' ', ''),
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescued: 0,
      marked_important: 0,
    };
  });

  for (const item of items) {
    const t = new Date(item.ts).getTime();
    if (!Number.isFinite(t)) continue;
    const hoursAgo = Math.floor((now.getTime() - t) / 3_600_000);
    if (hoursAgo < 0 || hoursAgo > 23) continue;
    const idx = 23 - hoursAgo;
    const bucket = buckets[idx];
    if (!bucket) continue;
    if (ACTION_KEYS.includes(item.action)) {
      bucket[item.action] = (bucket[item.action] ?? 0) + 1;
    }
  }
  return buckets;
}

export function useActivityStackedBar(
  items: ActivityItem[],
): ActivityHourBucket[] {
  return useMemo(() => buildHourlyBuckets(items), [items]);
}
