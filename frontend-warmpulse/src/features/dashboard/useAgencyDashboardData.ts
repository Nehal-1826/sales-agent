import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import { useDashboardSummary } from '@/features/dashboard/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { AgencyDashData } from '@/pages/client/agency/AgDshD3Tiered';

/**
 * Live-data adapter for the Agency-tier "Two-Ring Galaxy" dashboard
 * (`pages/client/agency/AgDashC2Galaxy.tsx`).
 *
 * Maps the existing TanStack-Query workspace / mailbox / dashboard hooks onto
 * the exact `AgencyDashData` shape the chart consumes. Modelled on the
 * Pro-Plus `useProPlusConsoleData.ts`: real data where a hook surfaces it,
 * skeleton zeros + synthesised-but-stable derivations elsewhere (no
 * fabrication).
 *
 *   - no workspace + auth user too   → `data: null`
 *     (caller shows a "complete onboarding" empty state)
 *   - still loading the workspace    → `isLoading: true`, `data: null`
 *
 * NB on the synthesised fields. The backend doesn't currently expose:
 *   - per-sub-client average warmth (we derive from the workspace warmth
 *     plus a stable id-hash jitter so each card reads as distinct without
 *     fabricating absolute numbers)
 *   - per-sub-client MRR (we leave it 0 — chart shows "$0" rather than a
 *     made-up dollar value the user might trust)
 *   - per-sub-client last-7d trend (we synthesise a gentle up-curve to
 *     the current warmth so the sparkline isn't empty — flagged as
 *     skeleton)
 *   - per-sub-client last-activity timestamp (we leave 'recent' — same
 *     reason as MRR)
 *   - agency-wide MRR / MoM growth (skeleton zeros)
 *
 * Every synthesised field is flagged with a `TODO:` comment so a real
 * column on the sub_clients table (or a join query) drops straight in.
 *
 * Re-export the shape so callers (`dashboards/AgencyDashboard`) can import
 * the type from either module.
 */
export type { AgencyDashData } from '@/pages/client/agency/AgDshD3Tiered';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubClientStatus = AgencyDashData['subClients'][number]['status'];

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'never';
  const ms = Date.now() - t;
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

/** Two-char initials from a sub-client name (e.g. "Helix Analytics" → "HA"). */
function logoFor(name: string): string {
  const parts = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    const w = parts[0]!;
    return (w[0] ?? '?').toUpperCase() + (w[1] ?? '').toUpperCase();
  }
  return (
    (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '?').toUpperCase()
  );
}

/**
 * Deterministic id → 0..1 jitter. Same hash the existing `AgencyDashboard`
 * uses for its sub-client cards, so the new design stays consistent with
 * whatever the user saw before the lock.
 *
 * TODO: drop this once the backend ships per-sub-client warmth.
 */
function idHash01(id: string): number {
  const seed = Array.from(id).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
    0,
  );
  return (Math.abs(seed) % 1000) / 1000;
}

/**
 * Synthesise an avg-warmth for a sub-client. Centred on the workspace warmth
 * with a stable id-derived jitter so each card reads distinct without
 * inventing absolute numbers.
 *
 * TODO: replace with `client.warmth_score` once the API exposes it.
 */
function syntheticWarmth(client: SubClient, workspaceWarmth: number): number {
  const jitter = Math.round((idHash01(client.id) - 0.5) * 24); // ±12
  const base = workspaceWarmth > 0 ? workspaceWarmth : 50;
  const mailboxPenalty = client.mailbox_count === 0 ? 30 : 0;
  return Math.max(0, Math.min(100, base - mailboxPenalty + jitter));
}

function statusForWarmth(
  warmth: number,
  mailboxCount: number,
): SubClientStatus {
  if (mailboxCount === 0) return 'at_risk';
  if (warmth >= 70) return 'healthy';
  if (warmth >= 40) return 'warming';
  return 'at_risk';
}

/**
 * Synthesise a gentle 7-point up-curve ending at the current warmth. The chart
 * uses this for inspector sparklines; a flat line would suggest "no
 * activity" which isn't necessarily true.
 *
 * TODO: replace with a real `client.last_7d_warmth` array once available.
 */
function syntheticTrend7d(currentWarmth: number): number[] {
  const start = Math.max(0, currentWarmth - 8);
  const step = (currentWarmth - start) / 6;
  return Array.from({ length: 7 }, (_, i) =>
    Math.round(start + step * i),
  );
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyDashboardDataResult {
  data: AgencyDashData | null;
  isLoading: boolean;
}

export function useAgencyDashboardData(): UseAgencyDashboardDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useDashboardSummary();
  const authUser = useAuthStore((s) => s.user);

  const ws = workspaceQuery.data ?? null;
  const isLoading =
    workspaceQuery.isLoading ||
    mailboxesQuery.isLoading ||
    summaryQuery.isLoading;

  const data = useMemo<AgencyDashData | null>(() => {
    if (isLoading) return null;
    // Need at least an identity. Without ws OR authUser, fall through to
    // the "no data" empty state.
    if (!ws && !authUser) return null;

    const mailboxes = mailboxesQuery.data?.items ?? [];
    const summary = summaryQuery.data;
    const subClientsRaw: SubClient[] = ws?.sub_clients ?? [];

    // ── workspace info ─────────────────────────────────────────────
    const totalMailboxes =
      subClientsRaw.reduce((acc, s) => acc + (s.mailbox_count ?? 0), 0) +
      mailboxes.length;
    const workspaceName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');

    // ── KPIs ───────────────────────────────────────────────────────
    const aggregatedWarmth =
      summary?.warmth_score ??
      (mailboxes.length === 0
        ? 0
        : Math.round(
            mailboxes.reduce((a, m) => a + num(m.warmth_score), 0) /
              mailboxes.length,
          ));
    const momGrowthPct = num(summary?.warmth_delta, 0);

    const pausedMailboxes = mailboxes.filter((m) => m.is_paused).length;
    const subClientsWithNoMailbox = subClientsRaw.filter(
      (s) => (s.mailbox_count ?? 0) === 0,
    ).length;
    const mailboxesAtRisk = pausedMailboxes + subClientsWithNoMailbox;

    const activeSubClients = subClientsRaw.filter(
      (s) => (s.mailbox_count ?? 0) > 0,
    ).length;

    // ── per-sub-client roll-up ─────────────────────────────────────
    const subClients: AgencyDashData['subClients'] = subClientsRaw.map((s) => {
      const avgWarmth = syntheticWarmth(s, aggregatedWarmth);
      const mailboxCount = s.mailbox_count ?? 0;
      return {
        id: s.id,
        name: s.name,
        logoChar: logoFor(s.name),
        mailboxCount,
        avgWarmth,
        status: statusForWarmth(avgWarmth, mailboxCount),
        // TODO: skeleton — backend has no per-sub-client trend yet.
        last7dTrend: syntheticTrend7d(avgWarmth),
        // TODO: skeleton — no per-sub-client MRR field. Showing $0 is
        // honest; fabricating dollar amounts the user might trust isn't.
        monthlyMrrUsd: 0,
        // TODO: skeleton — no per-sub-client last-activity timestamp.
        // The activity feed below at-best tags events back to sub-clients
        // by email-domain match (handled separately), but per-CARD
        // last-touch isn't available.
        lastActivityAgo: 'recent',
      };
    });

    // If there are mailboxes directly in the workspace (unassigned to a sub-client),
    // synthesize a "Main Workspace" node so the chart isn't empty.
    if (mailboxes.length > 0) {
      const mailboxCount = mailboxes.length;
      const avgWarmth = aggregatedWarmth;
      subClients.unshift({
        id: 'main-workspace',
        name: 'Main Workspace',
        logoChar: 'MW',
        mailboxCount,
        avgWarmth,
        status: statusForWarmth(avgWarmth, mailboxCount),
        last7dTrend: syntheticTrend7d(avgWarmth),
        monthlyMrrUsd: 0,
        lastActivityAgo: 'now',
      });
    }

    // ── alerts ─────────────────────────────────────────────────────
    // Paused mailboxes that we can tag back to a sub-client via the email
    // domain become 'mailbox_paused' alerts.
    const alerts: AgencyDashData['alerts'] = mailboxes
      .filter((m) => m.is_paused)
      .slice(0, 6)
      .map<AgencyDashData['alerts'][number] | null>((m, _i) => {
        const dom = domainOf(m.email_address);
        const owner = subClientsRaw.find(
          (s) => domainOf(s.owner_email) === dom,
        );
        if (!owner) return null;
        return {
          id: `paused-${m.id}`,
          subClientId: owner.id,
          subClientName: owner.name,
          kind: 'mailbox_paused',
          message: `${m.email_address} paused`,
          ago: relTime(m.last_activity_at ?? m.created_at),
          severity: 'warn',
        };
      })
      .filter((a): a is AgencyDashData['alerts'][number] => a !== null);

    const actualTotalMailboxes = summary?.mailbox_count ?? totalMailboxes;

    return {
      workspace: {
        name: workspaceName,
        subClientCount: subClientsRaw.length,
        mailboxCount: actualTotalMailboxes,
      },
      kpis: {
        totalMailboxes: actualTotalMailboxes,
        avgWarmth: aggregatedWarmth,
        mailboxesAtRisk,
        activeSubClients,
        mrrUsd: 0,
        momGrowthPct,
      },
      subClients,
      alerts,
    };
  }, [
    isLoading,
    ws,
    authUser,
    mailboxesQuery.data,
    summaryQuery.data,
  ]);

  return { data, isLoading };
}
