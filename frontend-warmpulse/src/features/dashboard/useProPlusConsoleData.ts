import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import { useDailyMetrics } from '@/features/analytics/api';
import { useDashboardSummary, useActivityFeed } from '@/features/dashboard/api';
import { usePostmasterStatus, useSndsStatus } from '@/features/reputation/api';
import type { Mailbox } from '@/features/mailboxes/types';
import type { ActivityEvent } from '@/features/dashboard/api';
import type {
  ConsoleData,
  FleetSummary,
  MailboxRecord,
} from '@/pages/client/proplus/ProPlusDashN4Console';

/**
 * Live-data adapter for the Pro-Plus "Console (master–detail)" dashboard
 * (`pages/client/proplus/ProPlusDashN4Console.tsx`).
 *
 * Maps the existing TanStack-Query mailbox / dashboard / analytics /
 * reputation hooks into the exact `ConsoleData` shape the design component
 * renders. Modelled on `useProDashAnalyticsData.ts`: everything is
 * best-effort — each underlying hook already falls back to an empty
 * array / derived value on 404, so any metric the backend hasn't
 * materialised yet is zero-filled here, never faked.
 *
 *   - empty workspace (0 mailboxes)  → returns `data: null` (caller shows
 *     the existing "complete onboarding" empty state)
 *   - still loading mailbox list     → `isLoading: true`, `data: null`
 *
 * Re-export the shape so callers (ProPlusDashboard) can import the type
 * from either module.
 */
export type {
  ConsoleData,
  FleetSummary,
  MailboxRecord,
} from '@/pages/client/proplus/ProPlusDashN4Console';

// Local aliases for the nested row shapes used while mapping. The final
// object is typed `ConsoleData`, so any drift is caught by the compiler at
// the return site.
type Provider = MailboxRecord['provider'];
type MailboxStatusUi = MailboxRecord['status'];
type DnsState = MailboxRecord['dns']['spf'];
type ActivityItem = MailboxRecord['activity'][number];
type DomainSignal = MailboxRecord['signals'][number];

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function normalizeProvider(p: string): Provider {
  if (p === 'gmail' || p === 'outlook' || p === 'yahoo') return p;
  return 'smtp';
}

/**
 * Map the backend mailbox `warmup_status` ('pending' | 'active' | 'paused' |
 * 'completed') onto the Console's narrower status vocabulary
 * ('active' | 'warming' | 'paused'):
 *   - paused                       → paused
 *   - active and finished ramping  → active
 *   - active but still ramping     → warming
 *   - pending / unknown            → warming (it's not live yet, not paused)
 */
function toUiStatus(m: Mailbox): MailboxStatusUi {
  if (m.is_paused || m.warmup_status === 'paused') return 'paused';
  if (m.warmup_status === 'active' || m.warmup_status === 'completed') {
    // current_day past the 28-day ramp ladder counts as fully "active";
    // anything still climbing the ladder is "warming".
    return num(m.current_day) >= 28 ? 'active' : 'warming';
  }
  return 'warming';
}

/** Translate a tri-state DNS flag (true / false / null) → Console DnsState. */
function dnsState(v: boolean | null | undefined): DnsState {
  if (v === true) return 'pass';
  if (v === false) return 'fail';
  // null / undefined = not yet checked → surface as a soft warning.
  return 'warn';
}

const ACTIVITY_ACTIONS: ReadonlySet<ActivityItem['action']> = new Set([
  'sent',
  'opened',
  'replied',
  'starred',
  'spam_rescued',
]);

/**
 * Map a backend `ActivityEvent.action` onto the Console's `ActivityAction`.
 * The backend can also emit `marked_important`, which the Console doesn't
 * model — fold it onto `starred` (closest visual analogue).
 */
function toActivityAction(a: ActivityEvent['action']): ActivityItem['action'] {
  if (a === 'marked_important') return 'starred';
  return ACTIVITY_ACTIONS.has(a as ActivityItem['action'])
    ? (a as ActivityItem['action'])
    : 'sent';
}

function minutesAgo(ts: string): number {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

/**
 * Build a 14-point warmth sparkline (oldest → newest). Prefer a real
 * per-mailbox `warmth_sparkline` if the list endpoint shipped one;
 * otherwise fall back to a flat line at the mailbox's current warmth so
 * the chart renders honestly (no synthetic climb).
 */
function sparkOf(m: Mailbox): number[] {
  const raw = Array.isArray(m.warmth_sparkline) ? m.warmth_sparkline : null;
  const w = Math.round(num(m.warmth_score));
  if (raw && raw.length > 0) {
    const pts = raw.map((v) => Math.round(num(v)));
    if (pts.length === 14) return pts;
    // Resample (down- or up-) to exactly 14 points by nearest index.
    return Array.from({ length: 14 }, (_, i) => {
      const idx = Math.round((i / 13) * (pts.length - 1));
      return pts[Math.max(0, Math.min(pts.length - 1, idx))] ?? w;
    });
  }
  // No per-mailbox series available → honest flat line.
  // TODO: no per-mailbox warmth-history API source yet.
  return Array.from({ length: 14 }, () => w);
}

export interface UseProPlusConsoleDataResult {
  data: ConsoleData | null;
  isLoading: boolean;
}

export function useProPlusConsoleData(): UseProPlusConsoleDataResult {
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useDashboardSummary();
  const dailyQuery = useDailyMetrics({});
  const activityQuery = useActivityFeed(50);
  const postmasterQuery = usePostmasterStatus();
  const sndsQuery = useSndsStatus();

  const mailboxes = mailboxesQuery.data?.items ?? [];
  const summary = summaryQuery.data;
  const daily = dailyQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const postmaster = postmasterQuery.data;
  const snds = sndsQuery.data;

  // Loading: mailbox list is the gate (everything else is best-effort and
  // resolves to empty / derived values on 404, so we don't block on them).
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<ConsoleData | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    const mailboxCount = mailboxes.length;

    // --- Fleet-level daily aggregates (sends / opens / replies today) ----
    // `useDailyMetrics({})` is workspace-wide; the last row is "today".
    const lastDaily = daily[daily.length - 1];
    const sendsToday = lastDaily ? Math.round(num(lastDaily.sent)) : 0;
    const fleetSendTarget = mailboxes.reduce(
      (acc, m) => acc + Math.round(num(m.ramp_target_today ?? m.daily_target)),
      0,
    );

    // --- Recent activity, grouped by mailbox id -------------------------
    const activityByMailbox = new Map<string, ActivityItem[]>();
    for (const e of activity) {
      const item: ActivityItem = {
        id: e.id,
        minutesAgo: minutesAgo(e.ts),
        peer: e.peer_email,
        action: toActivityAction(e.action),
      };
      const list = activityByMailbox.get(e.mailbox_id) ?? [];
      list.push(item);
      activityByMailbox.set(e.mailbox_id, list);
    }

    // --- Per-domain external signal block (Postmaster / SNDS) -----------
    // The reputation status hooks only expose a `connected` flag today —
    // there's no per-domain spam-rate / reputation grade endpoint wired
    // yet, so surface an honest "not connected / pending" signal rather
    // than inventing numbers.
    // TODO: no per-domain Postmaster/SNDS metric API source yet — only a
    // connection-status flag is available.
    const pmConnected = Boolean(postmaster?.connected);
    const sndsConnected = Boolean(snds?.connected);
    const buildSignals = (domain: string): DomainSignal[] => [
      {
        source: 'Postmaster',
        label: `Gmail domain reputation · ${domain}`,
        value: pmConnected ? 'Tracked' : 'Not connected',
        state: pmConnected ? 'good' : 'watch',
        detail: pmConnected
          ? 'Postmaster Tools connected — domain reputation is being tracked'
          : 'Connect Google Postmaster Tools to surface domain reputation',
        strength: pmConnected ? 100 : 0,
      },
      {
        source: 'SNDS',
        label: `Outlook IP / filter result · ${domain}`,
        value: sndsConnected ? 'Tracked' : 'Not connected',
        state: sndsConnected ? 'good' : 'watch',
        detail: sndsConnected
          ? 'Microsoft SNDS connected — IP / filter status is being tracked'
          : 'Connect Microsoft SNDS to surface IP / filter status',
        strength: sndsConnected ? 100 : 0,
      },
    ];

    // --- Mailbox records -----------------------------------------------
    const mailboxRecords: MailboxRecord[] = mailboxes.map((m) => {
      const domain = domainOf(m.email_address);
      const warmth = Math.round(num(m.warmth_score));
      const sends = Math.round(num(m.sent_today));
      const sendTarget = Math.round(
        num(m.ramp_target_today ?? m.daily_target),
      );
      return {
        id: m.id,
        email: m.email_address,
        domain,
        provider: normalizeProvider(m.provider),
        status: toUiStatus(m),
        warmth,
        // Per-mailbox warmth delta isn't exposed by the list endpoint yet.
        // TODO: no per-mailbox warmth-delta API source yet.
        delta: 0,
        day: Math.round(num(m.current_day)),
        rampTarget: sendTarget,
        sends,
        sendTarget,
        // Per-mailbox opens / replies today come from the list endpoint
        // (grouped warmup_logs query). Inbox% / spam% have no per-mailbox
        // API source yet — zero-fill those, never fabricate.
        opens: Math.round(num(m.opens_today)),
        replies: Math.round(num(m.replies_today)),
        inboxPct: 0,
        spamPct: 0,
        dns: {
          spf: dnsState(m.spf_valid),
          dkim: dnsState(m.dkim_valid),
          dmarc: dnsState(m.dmarc_valid),
        },
        spark: sparkOf(m),
        activity: activityByMailbox.get(m.id) ?? [],
        signals: buildSignals(domain),
      };
    });

    const warmingCount = mailboxRecords.filter(
      (m) => m.status === 'warming',
    ).length;

    const avgWarmth = summary
      ? Math.round(num(summary.warmth_score))
      : Math.round(
          mailboxRecords.reduce((acc, m) => acc + m.warmth, 0) /
            mailboxCount,
        );
    const warmthDelta = summary
      ? Math.round(num(summary.warmth_delta) * 10) / 10
      : 0;

    const fleetSummary: FleetSummary = {
      avgWarmth,
      warmthDelta,
      mailboxCount,
      warmingCount,
      sendsToday,
      sendTarget: fleetSendTarget,
      // The reputation hooks only report a connection flag, not a graded
      // health rating — map connected→Healthy/Green, else Watch/Yellow.
      postmasterHealth: pmConnected ? 'Healthy' : 'Watch',
      sndsHealth: sndsConnected ? 'Green' : 'Yellow',
    };

    return {
      summary: fleetSummary,
      mailboxes: mailboxRecords,
    };
  }, [
    mailboxesQuery.isLoading,
    mailboxes,
    summary,
    daily,
    activity,
    postmaster,
    snds,
  ]);

  return { data, isLoading };
}
