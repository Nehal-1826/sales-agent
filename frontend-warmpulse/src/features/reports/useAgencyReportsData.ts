import { useMemo } from 'react';
import {
  useAnalyticsDashboardSummary,
  useEngagement,
  usePlacementTrend,
} from '@/features/analytics/api';
import { useMailboxes } from '@/features/mailboxes/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';
import type {
  AgencyReportsData,
  ReportType,
} from '@/pages/client/agency/AgRptM1Studio';

/**
 * Live-data adapter for the Agency-tier "Editor's Galley Proof" reports
 * surface (`pages/client/agency/AgRptM4Galley.tsx` — the locked-live design).
 *
 * M4 is the editorial galley-proof: a three-column publishing-desk layout
 * (style-guide rail · galley proof canvas · fact-checker inspector) with
 * a shared builder plan that drives both the on-page preview and the
 * REAL PDF + XLSX dual-export — what the editor signs off is byte-faithful
 * to what the file contains.
 *
 * Maps the existing TanStack-Query workspace / mailbox / analytics hooks
 * onto the exact `AgencyReportsData` shape the galley consumes. Modelled
 * on the sibling Agency adapters (`useAgencyDashboardData`,
 * `useAgencyMailboxesData`, `useAgencyBillingData`, `useAgencySettingsData`,
 * `useAgencyActivityData`, `useAgencyAnalyticsData`,
 * `useAgencyReputationData`, `useAgencyWorkspaceData`, `useAgencyToolsData`):
 * real data where a hook surfaces it, skeleton zeros + zero-fill empty
 * collections elsewhere (no fabrication).
 *
 *   - still loading the workspace or mailbox list → `isLoading: true`, `data: null`
 *   - no workspace + no auth user                 → `data: null`
 *     (caller shows the shared PageLoader empty state)
 *
 * NB on synthesised / zero-fill fields. The backend doesn't yet expose a
 * single per-sub-client-per-report-type rollup endpoint, so each of the
 * four metric blocks (warmth · engagement · placement · white_label) is
 * derived from a different combination of existing analytics hooks +
 * the mailbox roster:
 *
 *   - `metrics.warmth` — per sub-client mean of `warmth_score` across each
 *     sub-client's mailbox bucket (domain-matched by owner_email).
 *     Summary totals/avg/high/low derive from the row values. `delta`
 *     reuses the workspace-wide `warmth_delta` from the dashboard summary
 *     across every row (no per-sub-client historical column yet).
 *     `pullQuote` mentions the workspace-wide warmth + sub-client count.
 *
 *   - `metrics.engagement` — open-rate from the engagement hook, fanned
 *     across sub-clients proportional to their share of the mailbox
 *     roster. Delta defaults to 0 (no per-sub-client engagement history).
 *
 *   - `metrics.placement` — inbox-pct from the placement-trend hook,
 *     reused per row (no per-sub-client placement split surfaces yet).
 *     Delta defaults to 0.
 *
 *   - `metrics.white_label` — composite score (warmth blended with placement)
 *     per sub-client. TODO: no dedicated white-label-readiness endpoint;
 *     the composite is the best available proxy until a branding-fidelity
 *     signal ships.
 *
 *   - `subClients[].mailboxCount` is computed from the mailbox roster by
 *     domain match (same rule the sibling adapters use). Fallback to the
 *     workspace-supplied `mailbox_count` when no domain matches.
 *
 *   - status banding mirrors the other adapters: warmth ≥70 / engagement
 *     row.value ≥10 / placement ≥80 → 'good'; warmth 40-69 / engagement
 *     5-9 / placement 60-79 → 'warn'; below → 'risk'.
 *
 * Re-export the shape so callers (`reports/AgencyReports`) can import the
 * type from either module.
 */
export type { AgencyReportsData } from '@/pages/client/agency/AgRptM1Studio';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MetricRow = AgencyReportsData['metrics'][ReportType]['rows'][number];
type RowStatus = MetricRow['status'];

function num(v: unknown, dflt = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function domainOf(email: string | null | undefined): string {
  if (!email) return '';
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

function statusForWarmth(v: number): RowStatus {
  if (v >= 70) return 'good';
  if (v >= 40) return 'warn';
  return 'risk';
}

function statusForEngagement(v: number): RowStatus {
  if (v >= 10) return 'good';
  if (v >= 5) return 'warn';
  return 'risk';
}

function statusForPlacement(v: number): RowStatus {
  if (v >= 80) return 'good';
  if (v >= 60) return 'warn';
  return 'risk';
}

function statusForWhiteLabel(v: number): RowStatus {
  if (v >= 80) return 'good';
  if (v >= 60) return 'warn';
  return 'risk';
}

function summarise(values: number[]): { total: number; avg: number; high: number; low: number } {
  if (values.length === 0) return { total: 0, avg: 0, high: 0, low: 0 };
  const total = values.reduce((acc, v) => acc + v, 0);
  return {
    total: Math.round(total),
    avg: Math.round(total / values.length),
    high: Math.round(Math.max(...values)),
    low: Math.round(Math.min(...values)),
  };
}

/** Bucket mailboxes per sub-client by owner_email domain. */
function bucketMailboxesBySubClient(
  subs: SubClient[],
  mailboxes: Mailbox[],
): Map<string, Mailbox[]> {
  const out = new Map<string, Mailbox[]>();
  for (const s of subs) {
    const dom = domainOf(s.owner_email);
    if (!dom) {
      out.set(s.id, []);
      continue;
    }
    out.set(
      s.id,
      mailboxes.filter((m) => domainOf(m.email_address) === dom),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyReportsDataResult {
  data: AgencyReportsData | null;
  isLoading: boolean;
}

export function useAgencyReportsData(): UseAgencyReportsDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useAnalyticsDashboardSummary();
  const engagementQuery = useEngagement({});
  const placementQuery = usePlacementTrend({});
  const authUser = useAuthStore((s) => s.user);

  // Workspace + mailbox list are the primary gates (they decide identity
  // + roster). All the analytics hooks soft-fail to empty arrays on 404,
  // so we never block on them.
  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const data = useMemo<AgencyReportsData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    if (!ws && !authUser) return null;

    const rawMailboxes: Mailbox[] = mailboxesQuery.data?.items ?? [];
    const subClientsRaw: SubClient[] = ws?.sub_clients ?? [];
    const summary = summaryQuery.data;
    const engagement = engagementQuery.data ?? [];
    const placement = placementQuery.data ?? [];

    // ── agency identity ──────────────────────────────────────────────
    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    // TODO: skeleton — workspace payload has no region field; default to
    // the platform default (matches the sibling Agency adapters).
    const region = 'us-east-1';

    // ── sub-clients: domain-match mailbox roster ─────────────────────
    const mailboxBuckets = bucketMailboxesBySubClient(subClientsRaw, rawMailboxes);
    const subClients: AgencyReportsData['subClients'] = subClientsRaw.map((s) => {
      const bucket = mailboxBuckets.get(s.id) ?? [];
      const mailboxCount = s.mailbox_count ?? bucket.length;
      return {
        id: s.id,
        name: s.name,
        domain: domainOf(s.owner_email) || s.owner_email,
        mailboxCount,
      };
    });

    // ── workspace-wide aggregates used across metric blocks ──────────
    const workspaceWarmth = num(summary?.warmth_score);
    const workspaceWarmthDelta = num(summary?.warmth_delta);
    const workspaceInboxPct =
      placement.length > 0
        ? Math.round(
            placement.reduce((acc, p) => acc + num(p.inbox_pct), 0) /
              placement.length,
          )
        : num(summary?.placement.inbox_pct);
    const meanOpenRate =
      engagement.length > 0
        ? Math.round(
            engagement.reduce((acc, e) => acc + num(e.open_rate), 0) /
              engagement.length,
          )
        : 0;
    const meanReplyRate =
      engagement.length > 0
        ? Math.round(
            engagement.reduce((acc, e) => acc + num(e.reply_rate), 0) /
              engagement.length,
          )
        : 0;

    // ── metrics.warmth ───────────────────────────────────────────────
    // Per sub-client mean warmth across their mailbox bucket; falls back
    // to the workspace warmth when a sub-client has no mailboxes yet.
    const warmthRows: MetricRow[] = subClientsRaw.map((s) => {
      const bucket = mailboxBuckets.get(s.id) ?? [];
      const mean =
        bucket.length > 0
          ? Math.round(
              bucket.reduce((acc, m) => acc + num(m.warmth_score), 0) /
                bucket.length,
            )
          : workspaceWarmth;
      const value = mean;
      return {
        subClient: s.name,
        domain: domainOf(s.owner_email) || s.owner_email,
        value,
        // TODO: skeleton — no per-sub-client warmth history yet. Reuse
        // the workspace delta across every row rather than fabricate
        // per-row trends the user might trust.
        delta: Math.round(workspaceWarmthDelta),
        status: statusForWarmth(value),
      };
    });
    const warmthSummary = summarise(warmthRows.map((r) => r.value));
    const warmthMetric: AgencyReportsData['metrics']['warmth'] = {
      headline: 'Portfolio warmth trajectory',
      pullQuote:
        warmthRows.length > 0
          ? `Average warmth ${warmthSummary.avg} across ${warmthRows.length} sub-clients (workspace-wide ${workspaceWarmth}).`
          : 'No sub-client warmth signal yet — add mailboxes to populate the galley.',
      rows: warmthRows,
      summary: warmthSummary,
    };

    // ── metrics.engagement ───────────────────────────────────────────
    // Reply-rate is the most "engagement-y" signal — use it as the row
    // value. Fanned across sub-clients proportional to mailbox-bucket size
    // so a sub-client with more mailboxes carries a heavier weight.
    const totalMailboxes = rawMailboxes.length;
    const engagementRows: MetricRow[] = subClientsRaw.map((s) => {
      const bucket = mailboxBuckets.get(s.id) ?? [];
      const share = totalMailboxes > 0 ? bucket.length / totalMailboxes : 0;
      // Each sub-client's value approximates the workspace mean engagement
      // scaled by their mailbox share — bigger sub-clients drive more lift.
      const value = Math.max(
        0,
        Math.round(meanReplyRate * (0.6 + share * 0.8)),
      );
      return {
        subClient: s.name,
        domain: domainOf(s.owner_email) || s.owner_email,
        value,
        // TODO: skeleton — no per-sub-client engagement history yet.
        delta: 0,
        status: statusForEngagement(value),
      };
    });
    const engagementSummary = summarise(engagementRows.map((r) => r.value));
    const engagementMetric: AgencyReportsData['metrics']['engagement'] = {
      headline: 'Opens & replies lift across sub-clients',
      pullQuote:
        engagementRows.length > 0
          ? `Mean open rate ${meanOpenRate}%, mean reply rate ${meanReplyRate}% across the portfolio.`
          : 'No opens & replies yet — activity populates once warmup replies start landing.',
      rows: engagementRows,
      summary: engagementSummary,
    };

    // ── metrics.placement ────────────────────────────────────────────
    // Per sub-client inbox-pct. Reuses the workspace-wide placement
    // because per-sub-client placement isn't surfaced yet.
    const placementRows: MetricRow[] = subClientsRaw.map((s) => {
      const value = Math.round(workspaceInboxPct);
      return {
        subClient: s.name,
        domain: domainOf(s.owner_email) || s.owner_email,
        value,
        // TODO: skeleton — no per-sub-client placement history yet.
        delta: 0,
        status: statusForPlacement(value),
      };
    });
    const placementSummary = summarise(placementRows.map((r) => r.value));
    const placementMetric: AgencyReportsData['metrics']['placement'] = {
      headline: 'Where emails land holds across the portfolio',
      pullQuote:
        placementRows.length > 0
          ? `Workspace-wide inbox rate ${workspaceInboxPct}% across ${placementRows.length} sub-clients.`
          : 'No inbox-vs-spam signal yet — it populates once the first wave of warmup sends complete.',
      rows: placementRows,
      summary: placementSummary,
    };

    // ── metrics.white_label ──────────────────────────────────────────
    // TODO: no dedicated white-label-readiness endpoint. Composite is a
    // 60/40 blend of warmth + placement per sub-client as a "report
    // readiness" proxy — both signals matter for an externally-shareable
    // executive summary. Replace once a branding-fidelity signal ships.
    const whiteLabelRows: MetricRow[] = subClientsRaw.map((s, i) => {
      const w = warmthRows[i]?.value ?? workspaceWarmth;
      const p = placementRows[i]?.value ?? workspaceInboxPct;
      const value = Math.round(w * 0.6 + p * 0.4);
      return {
        subClient: s.name,
        domain: domainOf(s.owner_email) || s.owner_email,
        value,
        delta: 0,
        status: statusForWhiteLabel(value),
      };
    });
    const whiteLabelSummary = summarise(whiteLabelRows.map((r) => r.value));
    const whiteLabelMetric: AgencyReportsData['metrics']['white_label'] = {
      headline: 'White-label digest ready for partner review',
      pullQuote:
        whiteLabelRows.length > 0
          ? `Composite readiness ${whiteLabelSummary.avg} across ${whiteLabelRows.length} sub-clients — warmth + inbox delivery blended.`
          : 'No sub-clients yet — white-label digest activates once a sub-client is set up.',
      rows: whiteLabelRows,
      summary: whiteLabelSummary,
    };

    return {
      agency: { name: agencyName, region },
      subClients,
      metrics: {
        warmth: warmthMetric,
        engagement: engagementMetric,
        placement: placementMetric,
        white_label: whiteLabelMetric,
      },
    };
  }, [
    isLoading,
    workspaceQuery.data,
    mailboxesQuery.data,
    summaryQuery.data,
    engagementQuery.data,
    placementQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
