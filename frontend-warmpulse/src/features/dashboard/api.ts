import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/lib/api';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';

/**
 * Dashboard data hooks. All endpoints are best-effort: on 404 we fall back
 * to values derived from the mailbox list so the UI stays populated even
 * before the corresponding backend endpoints land.
 */

function isAxios404(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 404;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  warmth_score: number;
  warmth_score_yesterday: number;
  warmth_delta: number;
  sent_today: number;
  opens_today: number;
  replies_today: number;
  spam_rescues_today: number;
  placement: {
    inbox_pct: number;
    promotions_pct: number;
    spam_pct: number;
  };
  trend_30d: Array<{ date: string; warmth_score: number }>;
  mailbox_count: number;
}

export interface ActivityEvent {
  id: string;
  ts: string;
  mailbox_id: string;
  mailbox_email: string;
  peer_email: string;
  action: 'sent' | 'opened' | 'replied' | 'spam_rescued' | 'starred' | 'marked_important';
  result: 'ok' | 'error';
  subject?: string;
}

export interface TodayStatsData {
  sent: number;
  opens: number;
  replies: number;
  spam_rescues: number;
}

// ---------------------------------------------------------------------------
// Helpers — derive fallback values from mailbox list
// ---------------------------------------------------------------------------

function deriveSummaryFromMailboxes(mailboxes: Mailbox[]): DashboardSummary {
  const count = mailboxes.length;
  const mean =
    count === 0
      ? 0
      : mailboxes.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) / count;
  const sentToday = mailboxes.reduce((acc, m) => acc + (Number(m.sent_today) || 0), 0);

  // Build a rough synthetic 30d trend from current warmth — flat with small jitter.
  const today = new Date();
  const trend_30d = Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const jitter = (i / 29) * 0.2;
    const warmth = Math.max(0, Math.min(100, Math.round(mean * (0.85 + jitter))));
    return { date: d.toISOString().slice(0, 10), warmth_score: warmth };
  });

  return {
    warmth_score: Math.round(mean),
    warmth_score_yesterday: Math.round(mean),
    warmth_delta: 0,
    sent_today: sentToday,
    opens_today: 0,
    replies_today: 0,
    spam_rescues_today: 0,
    placement: { inbox_pct: 0, promotions_pct: 0, spam_pct: 0 },
    trend_30d,
    mailbox_count: count,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useDashboardSummary(): UseQueryResult<DashboardSummary> {
  // Seed mailbox list so we always have a fallback to derive from.
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['dashboard', 'summary'],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/analytics/dashboard/summary');
        const data = res.data as Partial<DashboardSummary> & Record<string, unknown>;
        // Merge server fields over the derived fallback — handles partial responses.
        const fallback = deriveSummaryFromMailboxes(mailboxes.data?.items ?? []);
        return { ...fallback, ...data } as DashboardSummary;
      } catch (err) {
        if (isAxios404(err)) {
          return deriveSummaryFromMailboxes(mailboxes.data?.items ?? []);
        }
        throw err;
      }
    },
    // Wait until we at least know the mailbox list (for fallback quality).
    enabled: !mailboxes.isLoading,
  });
}

export function useActivityFeed(limit = 20): UseQueryResult<ActivityEvent[]> {
  return useQuery({
    queryKey: ['dashboard', 'activity', limit],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/warmup-activity', {
          params: { limit },
        });
        const data = res.data as unknown;
        if (Array.isArray(data)) return data as ActivityEvent[];
        if (data && typeof data === 'object' && 'items' in data) {
          return (data as { items: ActivityEvent[] }).items ?? [];
        }
        return [];
      } catch (err) {
        if (isAxios404(err)) return [];
        throw err;
      }
    },
  });
}

export function useTodayStats(): UseQueryResult<TodayStatsData> {
  const mailboxes = useMailboxes();

  return useQuery({
    queryKey: ['dashboard', 'today'],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      try {
        const res = await api.get('/workspace/warmup-activity/today-stats');
        return res.data as TodayStatsData;
      } catch (err) {
        if (isAxios404(err)) {
          const sent = (mailboxes.data?.items ?? []).reduce(
            (acc, m) => acc + (Number(m.sent_today) || 0),
            0,
          );
          return { sent, opens: 0, replies: 0, spam_rescues: 0 };
        }
        throw err;
      }
    },
    enabled: !mailboxes.isLoading,
  });
}
