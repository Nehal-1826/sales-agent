import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import { useActivityFeedInfinite, useTodayStats } from '@/features/activity/api';
import type { ActivityItem } from '@/features/activity/types';
import type {
  ClockMock,
  HourSlice,
  WeekdayDial,
} from '@/pages/client/proplus/ProPlusAct2Clock';

/**
 * Live-data adapter for the Pro-Plus "Warmup Activity Clock" surface
 * (`pages/client/proplus/ProPlusAct2Clock.tsx`).
 *
 * Maps the existing TanStack-Query activity / mailbox hooks into the exact
 * `ClockMock` shape the radial dial renders. Modelled on
 * `useProPlusMailboxesData.ts` / `useProPlusConsoleData.ts`: everything is
 * best-effort — `useMailboxes` / `useActivityFeedInfinite` / `useTodayStats`
 * already fall back to empty results on 404, so any bucket the backend
 * hasn't materialised yet is zero-filled here, never faked.
 *
 *   - empty workspace (0 mailboxes)  → returns `data: null` (caller shows
 *     the existing "complete onboarding" empty state)
 *   - still loading mailbox list     → `isLoading: true`, `data: null`
 *
 * Re-export the shapes so callers (ProPlusActivity) can import the type
 * from either module.
 */
export type {
  ActivityAction,
  ClockMock,
  HourSlice,
  WeekdayDial,
} from '@/pages/client/proplus/ProPlusAct2Clock';

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

const WEEKDAY_META: Array<{ short: string; long: string }> = [
  { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' },
  { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' },
  { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
  { short: 'Sun', long: 'Sunday' },
];

/** Empty 24-length hour distribution for a weekday (all action counts 0). */
function emptyHours(): HourSlice[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sent: 0,
    opened: 0,
    replied: 0,
    starred: 0,
    spam_rescued: 0,
    total: 0,
  }));
}

/**
 * JS `Date.getDay()` is 0 = Sunday … 6 = Saturday. The dial indexes weekdays
 * 0 = Monday … 6 = Sunday, so rotate: Sun (0) → 6, Mon (1) → 0, etc.
 */
function jsDayToDialIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export interface UseProPlusActivityDataResult {
  data: ClockMock | null;
  isLoading: boolean;
}

export function useProPlusActivityData(): UseProPlusActivityDataResult {
  const mailboxesQuery = useMailboxes();
  const feedQuery = useActivityFeedInfinite();
  // Workspace-wide today totals — only available as a daily aggregate (no
  // per-hour / per-weekday breakdown), so it can't feed the dial buckets.
  // Pulled best-effort so a later use can surface it; not gating.
  useTodayStats();

  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Loading: the mailbox list is the only gate (it decides whether this
  // workspace has anything to warm; the feed is best-effort and resolves to
  // an empty list on 404 so we never block on it).
  const isLoading = mailboxesQuery.isLoading;

  const feedItems = useMemo<ActivityItem[]>(() => {
    const pages = feedQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [feedQuery.data]);

  const data = useMemo<ClockMock | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    const mailboxCount = mailboxes.length;
    const activeCount = mailboxes.filter(
      (m) => !m.is_paused && m.warmup_status !== 'paused',
    ).length;
    const nowHour = new Date().getHours();

    // Build 7 weekday dials, each a 24-length hour distribution. Bucket the
    // real activity feed by local weekday + hour-of-day. Each ActivityItem
    // carries a real `ts`, so the dial reflects actual warmup signal — no
    // synthesised diurnal curve.
    const weekdayHours: HourSlice[][] = WEEKDAY_META.map(() => emptyHours());

    for (const item of feedItems) {
      const t = new Date(item.ts);
      const ms = t.getTime();
      if (!Number.isFinite(ms)) continue;
      const di = jsDayToDialIndex(t.getDay());
      const hr = t.getHours();
      const slice = weekdayHours[di]?.[hr];
      if (!slice) continue;
      switch (item.action) {
        case 'sent':
          slice.sent += 1;
          break;
        case 'opened':
          slice.opened += 1;
          break;
        case 'replied':
          slice.replied += 1;
          break;
        case 'starred':
          slice.starred += 1;
          break;
        case 'spam_rescued':
          slice.spam_rescued += 1;
          break;
        case 'marked_important':
          // The dial doesn't model `marked_important`; fold it onto
          // `starred` (closest visual analogue — same convention as
          // useProPlusConsoleData.ts).
          slice.starred += 1;
          break;
        default:
          break;
      }
      slice.total =
        slice.sent +
        slice.opened +
        slice.replied +
        slice.starred +
        slice.spam_rescued;
    }

    const weekdays: WeekdayDial[] = WEEKDAY_META.map((meta, index) => {
      const hours = weekdayHours[index] ?? emptyHours();
      const total = hours.reduce((s, h) => s + h.total, 0);
      let peakHour = 0;
      let peakVal = -1;
      for (const h of hours) {
        if (h.total > peakVal) {
          peakVal = h.total;
          peakHour = h.hour;
        }
      }
      return {
        index,
        short: meta.short,
        long: meta.long,
        hours,
        total,
        peakHour,
      };
    });

    return {
      mailboxCount: num(mailboxCount),
      activeCount: num(activeCount),
      nowHour,
      weekdays,
    };
  }, [mailboxesQuery.isLoading, mailboxes, feedItems]);

  return { data, isLoading };
}
