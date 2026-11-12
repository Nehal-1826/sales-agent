import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useActivityFeedInfinite,
  useTodayStats,
} from '@/features/activity/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { ActivityAction, ActivityItem } from '@/features/activity/types';
import type { Mailbox } from '@/features/mailboxes/types';
import type { AgencyActivityData } from '@/pages/client/agency/AgActS4Wrapped';

/**
 * Live-data adapter for the Agency-tier "Wrapped Story" activity surface
 * (`pages/client/agency/AgActS4Wrapped.tsx` — the locked-live design).
 *
 * Maps the existing TanStack-Query workspace / mailbox / activity-feed /
 * today-stats hooks onto the exact `AgencyActivityData` shape the Wrapped
 * story carousel consumes. Modelled on the Pro-Plus activity adapter and
 * the sibling Agency adapters (`useAgencyDashboardData`,
 * `useAgencyMailboxesData`): real data where a hook surfaces it, skeleton
 * zeros + zero-fill empty collections elsewhere (no fabrication).
 *
 *   - still loading the workspace or mailbox list → `isLoading: true`, `data: null`
 *   - no workspace + no auth user                 → `data: null`
 *     (caller shows the shared PageLoader empty state)
 *
 * NB on synthesised fields. The backend doesn't currently expose a single
 * per-sub-client activity rollup endpoint, so:
 *   - `events[].subClientId / subClientName / subClientLogoChar` are
 *     attributed by matching the mailbox's email domain against each
 *     sub-client's `owner_email` domain. The mailbox itself is the
 *     authoritative event source — we just label it.
 *   - `weeklyHeatmap` is bucketed from the activity feed by JS-weekday +
 *     hour-of-day. Same approach as `useProPlusActivityData`'s clock dial.
 *     If the feed is empty the heatmap is all-zero — never invented.
 *   - `peerInteractionsToday` = sum of (opens + replies + starred + rescues)
 *     today. `eventsLastHour` and `avgEventsPerMin` are derived from the
 *     feed's last 60 minutes.
 *
 * Re-export the shape so callers (`activity/AgencyActivity`) can import the
 * type from either module.
 */
export type { AgencyActivityData } from '@/pages/client/agency/AgActS4Wrapped';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function logoCharFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const ch = trimmed[0] ?? '?';
  return ch.toUpperCase();
}

function formatTimeAgo(seconds: number): string {
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Map a backend `ActivityAction` onto the Wrapped design's narrower
 * `ActionKind`. The design surfaces `bounce` as an action; we don't have a
 * bounce event in the feed today so we never emit one — leaving the bucket
 * empty rather than fabricating bounces.
 */
function mapActionKind(
  a: ActivityAction,
): AgencyActivityData['events'][number]['kind'] {
  switch (a) {
    case 'sent':
      return 'sent';
    case 'opened':
      return 'opened';
    case 'replied':
      return 'replied';
    case 'starred':
    case 'marked_important':
      // Closest visual analogue in the design — same convention as
      // `useProPlusActivityData.ts`.
      return 'starred';
    case 'spam_rescued':
      return 'spam_rescue';
    default:
      return 'opened';
  }
}

function normalizeProvider(
  p: string,
): AgencyActivityData['events'][number]['provider'] {
  if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return p;
  return 'smtp';
}

/**
 * Find the sub-client this mailbox belongs to by matching the email
 * domain against each sub-client's owner_email domain. The agency
 * workspace itself acts as a fallback when no sub-client matches — same
 * domain-match rule the mailboxes adapter uses.
 */
function findSubClient(
  mailboxEmail: string,
  subs: SubClient[],
): SubClient | null {
  const dom = domainOf(mailboxEmail);
  if (!dom) return null;
  return subs.find((s) => domainOf(s.owner_email) === dom) ?? null;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyActivityDataResult {
  data: AgencyActivityData | null;
  isLoading: boolean;
}

export function useAgencyActivityData(): UseAgencyActivityDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const feedQuery = useActivityFeedInfinite();
  const todayQuery = useTodayStats();
  const authUser = useAuthStore((s) => s.user);

  // Loading: workspace + mailbox list are the primary gates (they decide
  // identity + roster). The feed and today-stats are best-effort — both
  // resolve to empty fallbacks on 404, so we never block on them.
  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const feedItems = useMemo<ActivityItem[]>(() => {
    const pages = feedQuery.data?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [feedQuery.data]);

  const data = useMemo<AgencyActivityData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    if (!ws && !authUser) return null;

    const rawMailboxes: Mailbox[] = mailboxesQuery.data?.items ?? [];
    const subClients: SubClient[] = ws?.sub_clients ?? [];

    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    const agencyId = ws ? `agency-${agencyName}` : 'agency-self';

    // Build a mailbox-id → mailbox lookup so events can resolve provider +
    // sub-client without scanning the array every time.
    const mailboxById = new Map<string, Mailbox>();
    for (const m of rawMailboxes) mailboxById.set(m.id, m);

    // ── events: map feed items into the Wrapped event shape ────────
    const now = Date.now();
    const events: AgencyActivityData['events'] = feedItems.map((it) => {
      const tsMs = new Date(it.ts).getTime();
      const ageSec = Number.isFinite(tsMs)
        ? Math.max(0, Math.floor((now - tsMs) / 1000))
        : 0;
      const mbox = mailboxById.get(it.mailbox_id);
      const sub = mbox ? findSubClient(mbox.email_address, subClients) : null;
      const subClientName = sub?.name ?? agencyName;
      const provider = normalizeProvider(mbox?.provider ?? 'smtp');
      const kind = mapActionKind(it.action);
      return {
        id: it.id,
        kind,
        timestamp: it.ts,
        timeAgo: formatTimeAgo(ageSec),
        mailboxId: it.mailbox_id,
        mailboxEmail: it.mailbox_email || mbox?.email_address || '',
        provider,
        subClientId: sub?.id ?? agencyId,
        subClientName,
        subClientLogoChar: logoCharFor(subClientName),
        peerEmail: it.peer_email || null,
        // The feed doesn't carry a free-form note; surface the subject when
        // present so the row reads as recognisable activity rather than a
        // bare action label.
        note: it.subject ?? '',
      };
    });

    // ── today + window-derived KPIs ────────────────────────────────
    const today = todayQuery.data;
    const sendsToday = num(today?.sent);
    const opensToday = num(today?.opens);
    const repliesToday = num(today?.replies);
    const spamRescuesToday = num(today?.spam_rescues);

    // Peer interactions today = opens + replies + starred + rescues. The
    // today-stats endpoint doesn't surface `starred`, so we count from the
    // feed for that piece and fold the rest from the (already-aggregated)
    // today-stats numbers.
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    let starredToday = 0;
    let eventsLastHour = 0;
    const hourAgoMs = now - 3_600_000;
    for (const e of events) {
      const tsMs = new Date(e.timestamp).getTime();
      if (!Number.isFinite(tsMs)) continue;
      if (tsMs >= dayStartMs && e.kind === 'starred') starredToday += 1;
      if (tsMs >= hourAgoMs) eventsLastHour += 1;
    }

    const peerInteractionsToday =
      opensToday + repliesToday + starredToday + spamRescuesToday;
    const eventsToday =
      sendsToday +
      opensToday +
      repliesToday +
      starredToday +
      spamRescuesToday;

    // Events / min: rolling-hour average. If the feed is empty surface 0.
    const avgEventsPerMin =
      eventsLastHour > 0 ? Math.round((eventsLastHour / 60) * 10) / 10 : 0;

    // ── hourlyVolume: 24 entries, newest hour LAST (matches MOCK_HOURLY)
    // Each entry covers a one-hour-wide window aligned to the current hour.
    const hourlyVolume: AgencyActivityData['hourlyVolume'] = [];
    const baseHour = new Date(now);
    baseHour.setMinutes(0, 0, 0);
    // hourly[0] = 23 hours ago … hourly[23] = current hour.
    const hourlyAcc: Array<{
      sends: number;
      opens: number;
      replies: number;
      rescues: number;
    }> = Array.from({ length: 24 }, () => ({
      sends: 0,
      opens: 0,
      replies: 0,
      rescues: 0,
    }));
    for (const e of events) {
      const tsMs = new Date(e.timestamp).getTime();
      if (!Number.isFinite(tsMs)) continue;
      const hoursAgo = Math.floor((now - tsMs) / 3_600_000);
      if (hoursAgo < 0 || hoursAgo > 23) continue;
      const idx = 23 - hoursAgo;
      const bucket = hourlyAcc[idx];
      if (!bucket) continue;
      if (e.kind === 'sent') bucket.sends += 1;
      else if (e.kind === 'opened') bucket.opens += 1;
      else if (e.kind === 'replied') bucket.replies += 1;
      else if (e.kind === 'spam_rescue') bucket.rescues += 1;
    }
    for (let i = 0; i < 24; i++) {
      const hoursAgo = 23 - i;
      const d = new Date(baseHour.getTime() - hoursAgo * 3_600_000);
      const hh = String(d.getHours()).padStart(2, '0');
      const bucket = hourlyAcc[i] ?? { sends: 0, opens: 0, replies: 0, rescues: 0 };
      hourlyVolume.push({
        hour: `${hh}:00`,
        sends: bucket.sends,
        opens: bucket.opens,
        replies: bucket.replies,
        rescues: bucket.rescues,
      });
    }

    // ── weeklyHeatmap: 7 days × 24 hours bucketed from the feed.
    // day index follows MOCK_HEATMAP convention (0..6). The Wrapped design
    // doesn't surface day labels, so the absolute mapping doesn't matter
    // visually — what matters is the distribution itself.
    const heatmapCells: AgencyActivityData['weeklyHeatmap'] = [];
    const heatmapAcc: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0),
    );
    for (const e of events) {
      const t = new Date(e.timestamp);
      const ms = t.getTime();
      if (!Number.isFinite(ms)) continue;
      const day = t.getDay(); // 0 = Sun … 6 = Sat
      const hour = t.getHours();
      const dayRow = heatmapAcc[day];
      if (!dayRow) continue;
      const prev = dayRow[hour] ?? 0;
      dayRow[hour] = prev + 1;
    }
    // Normalize per-day so intensity is comparable; events column carries
    // the raw count.
    for (let day = 0; day < 7; day++) {
      const row = heatmapAcc[day] ?? [];
      const maxHour = Math.max(1, ...row);
      for (let hour = 0; hour < 24; hour++) {
        const eventsCount = row[hour] ?? 0;
        const intensity = maxHour > 0 ? eventsCount / maxHour : 0;
        heatmapCells.push({ day, hour, intensity, events: eventsCount });
      }
    }

    // ── topActiveMailboxes: tally events per mailbox from the feed.
    const perMailbox = new Map<
      string,
      { events: number; mailboxEmail: string; subClientName: string }
    >();
    for (const e of events) {
      const cur = perMailbox.get(e.mailboxId) ?? {
        events: 0,
        mailboxEmail: e.mailboxEmail,
        subClientName: e.subClientName,
      };
      cur.events += 1;
      cur.mailboxEmail = cur.mailboxEmail || e.mailboxEmail;
      cur.subClientName = cur.subClientName || e.subClientName;
      perMailbox.set(e.mailboxId, cur);
    }
    const topActiveMailboxes: AgencyActivityData['topActiveMailboxes'] =
      Array.from(perMailbox.entries())
        .map(([mailboxId, v]) => ({
          mailboxId,
          mailboxEmail: v.mailboxEmail,
          subClientName: v.subClientName,
          eventsToday: v.events,
        }))
        .sort((a, b) => b.eventsToday - a.eventsToday)
        .slice(0, 8);

    // ── alerts: skeleton — no agency-wide alerts feed exists yet.
    // Synthesise from paused mailboxes attributable to a sub-client, same
    // approach the dashboard adapter takes. Capped at 6 so the radar tile
    // stays readable.
    const alerts: AgencyActivityData['alerts'] = rawMailboxes
      .filter((m) => m.is_paused)
      .slice(0, 6)
      .map<AgencyActivityData['alerts'][number] | null>((m) => {
        const sub = findSubClient(m.email_address, subClients);
        if (!sub) return null;
        return {
          id: `paused-${m.id}`,
          kind: 'silence',
          severity: 'warn',
          message: `${m.email_address} paused — no warmup traffic`,
          timeAgo: 'recent',
          subClientId: sub.id,
          subClientName: sub.name,
        };
      })
      .filter((a): a is AgencyActivityData['alerts'][number] => a !== null);

    const totalMailboxes =
      rawMailboxes.length +
      subClients.reduce(
        (acc, s) => acc + Math.max(0, (s.mailbox_count ?? 0) - 0),
        0,
      );

    return {
      workspace: {
        name: agencyName,
        subClientCount: subClients.length,
        // Prefer the visible roster the API returned. Fall back to the
        // sub-client mailbox-count sum if the roster is empty.
        mailboxCount: rawMailboxes.length || totalMailboxes,
      },
      kpis: {
        eventsToday,
        sendsToday,
        opensToday,
        repliesToday,
        spamRescuesToday,
        peerInteractionsToday,
        eventsLastHour,
        avgEventsPerMin,
      },
      events,
      hourlyVolume,
      weeklyHeatmap: heatmapCells,
      topActiveMailboxes,
      alerts,
    };
  }, [
    isLoading,
    workspaceQuery.data,
    mailboxesQuery.data,
    feedItems,
    todayQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
