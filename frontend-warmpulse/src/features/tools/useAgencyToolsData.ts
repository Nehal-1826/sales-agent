import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  usePlacementTests,
  useSpamScans,
  useTemplates,
} from '@/features/tools/api';
import { useWorkspace, type SubClient } from '@/features/workspace/api';
import { useAuthStore } from '@/stores/auth';
import type { Mailbox } from '@/features/mailboxes/types';
import type {
  AgencyToolsData,
  ToolSlug,
} from '@/pages/client/agency/AgTolT3Workshop';

/**
 * Live-data adapter for the Agency-tier "Workshop Drawer" tools surface
 * (`pages/client/agency/AgTolT3Workshop.tsx` — the locked-live design).
 *
 * Maps the existing TanStack-Query workspace / mailbox / tools hooks
 * (`usePlacementTests`, `useSpamScans`, `useTemplates`) onto the exact
 * `AgencyToolsData` shape the workshop consumes. Modelled on the sibling
 * Agency adapters (`useAgencyDashboardData`, `useAgencyMailboxesData`,
 * `useAgencyBillingData`, `useAgencySettingsData`, `useAgencyActivityData`,
 * `useAgencyAnalyticsData`, `useAgencyReputationData`,
 * `useAgencyWorkspaceData`): real data where a hook surfaces it, skeleton
 * zeros + zero-fill empty collections elsewhere (no fabrication).
 *
 *   - still loading the workspace or mailbox list → `isLoading: true`, `data: null`
 *   - no workspace + no auth user                 → `data: null`
 *     (caller shows the shared PageLoader empty state)
 *
 * The four `tools[]` entries (preview / templates / spam / placement) are
 * catalog metadata — slug + display name + short label + description are
 * design constants, not metrics. We hardcode them from the design's MOCK
 * so the peg-board always reads the same four implements regardless of
 * what the backend surfaces. The per-tool `lastRunAt` + `runsLast30d`
 * counters ARE derived from real data where a list endpoint exists:
 *
 *   - `preview` → no list endpoint (`useWarmupPreview` is a dry mutation,
 *     not queryable state). Zero-fill `runsLast30d`, `lastRunAt: null`.
 *   - `templates` → `useTemplates()` returns the full template catalogue.
 *     We use the total count as a coarse "runs" proxy and the newest
 *     `created_at` as `lastRunAt`. Templates aren't strictly "runs" but
 *     they're the only queryable signal for that tool's recency.
 *   - `spam` → `useSpamScans()` returns the last 10 scans (page_size: 10
 *     in the hook). We count those within 30 days and read the newest
 *     `created_at` as `lastRunAt`. A 10-row window under-counts a busy
 *     agency, but it's never fabrication — it's the truth this endpoint
 *     surfaces.
 *   - `placement` → `usePlacementTests()` mirrors spam: last 10 tests,
 *     30-day filter, newest `sent_at`.
 *
 * NB on synthesised / zero-fill fields. The backend doesn't yet expose a
 * single agency-wide "tool runs" rollup endpoint, so:
 *   - `recentRuns[]` is built by interleaving the spam-scan and
 *     placement-test lists (the two tool endpoints that return runnable
 *     rows). Template creates and warmup-preview mutations are NOT
 *     queryable state, so they never appear in this list. Each row is
 *     attributed to a sub-client by matching the mailbox's email domain
 *     against each sub-client's `owner_email` domain (placement carries
 *     `mailbox_id`; spam scans don't, so spam rows attribute to the
 *     agency itself).
 *   - `summary.totalRunsToday` / `totalRuns30d` count runs from the
 *     interleaved list above. Under-counts behind a busy bench, but
 *     never invented.
 *   - `summary.avgPlacementScore` is the mean of `results.inbox` percent
 *     across the placement-test list. When no tests exist → 0.
 *   - `summary.queuedRuns` is always 0 — there's no per-workspace queue
 *     depth endpoint yet.
 *   - `subClients[].mailboxCount` is computed from the mailbox roster by
 *     domain match (same rule the mailboxes adapter uses). `status` reads
 *     'active' when the sub-client has mailboxes, 'onboarding' otherwise
 *     — there's no per-sub-client paused/onboarding flag yet.
 *
 * Re-export the shape so callers (`tools/AgencyTools`) can import the
 * type from either module.
 */
export type { AgencyToolsData } from '@/pages/client/agency/AgTolT3Workshop';

// ---------------------------------------------------------------------------
// Constants — the four tool catalog entries (slug + display strings only).
// These are design constants, not metrics. Per-tool metrics (lastRunAt,
// runsLast30d) are overlaid from real hooks below.
// ---------------------------------------------------------------------------

interface ToolCatalogEntry {
  slug: ToolSlug;
  name: string;
  short: string;
  description: string;
}

const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    slug: 'preview',
    name: 'Warmup Preview',
    short: 'Loupe',
    description:
      'Render the next outbound thread message and inspect headers, body and signing.',
  },
  {
    slug: 'templates',
    name: 'Template Studio',
    short: 'T-square',
    description:
      'Compose, fork and version the AI template families used by the content factory.',
  },
  {
    slug: 'spam',
    name: 'Spam Scanner',
    short: 'Scanner',
    description:
      'Score a candidate message body / subject pair against the SpamAssassin rule set.',
  },
  {
    slug: 'placement',
    name: 'Inbox Test',
    short: 'Compass',
    description:
      'Send a probe across the helper network and report which folder each provider lands it in.',
  },
];

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

/**
 * Find the sub-client this mailbox belongs to by matching the email
 * domain against each sub-client's owner_email domain. Returns null when
 * no sub-client matches — caller decides the fallback. Same domain-match
 * rule the dashboard / mailboxes / activity adapters use.
 */
function findSubClient(
  mailboxEmail: string,
  subs: SubClient[],
): SubClient | null {
  const dom = domainOf(mailboxEmail);
  if (!dom) return null;
  return subs.find((s) => domainOf(s.owner_email) === dom) ?? null;
}

/** ISO comparison helper — newest first. Returns 0 for invalid. */
function isoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Newest ISO timestamp in a list (or null when empty). */
function newestIso(isoList: Array<string | null | undefined>): string | null {
  let best: { iso: string; ms: number } | null = null;
  for (const iso of isoList) {
    const ms = isoMs(iso);
    if (ms > 0 && (best === null || ms > best.ms)) {
      best = { iso: iso as string, ms };
    }
  }
  return best?.iso ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function withinDays(iso: string | null | undefined, days: number, nowMs: number): boolean {
  const t = isoMs(iso);
  if (t === 0) return false;
  return nowMs - t < days * DAY_MS;
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

export interface UseAgencyToolsDataResult {
  data: AgencyToolsData | null;
  isLoading: boolean;
}

export function useAgencyToolsData(): UseAgencyToolsDataResult {
  const workspaceQuery = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const placementsQuery = usePlacementTests();
  const scansQuery = useSpamScans();
  const templatesQuery = useTemplates();
  const authUser = useAuthStore((s) => s.user);

  // Workspace + mailbox list are the primary gates (they decide identity
  // + roster). The three tools queries are best-effort — they soft-fail
  // to empty fallbacks at the API layer (or surface a 404 the caller
  // ignores), so we never block on them.
  const isLoading = workspaceQuery.isLoading || mailboxesQuery.isLoading;

  const data = useMemo<AgencyToolsData | null>(() => {
    if (isLoading) return null;
    const ws = workspaceQuery.data;
    if (!ws && !authUser) return null;

    const rawMailboxes: Mailbox[] = mailboxesQuery.data?.items ?? [];
    const subClientsRaw: SubClient[] = ws?.sub_clients ?? [];
    const placements = placementsQuery.data?.items ?? [];
    const scans = scansQuery.data?.items ?? [];
    const templates = templatesQuery.data?.items ?? [];

    // ── agency identity ──────────────────────────────────────────────
    const agencyName =
      ws?.name ??
      (authUser?.email
        ? `${authUser.email.split('@')[0]}'s agency`
        : 'Your agency');
    // TODO: skeleton — workspace payload has no region field; default to
    // the platform default (matches the harbor / dashboard adapters).
    const region = 'us-east-1';

    const nowMs = Date.now();

    // ── sub-clients: domain-match mailbox roster, derive status ─────
    // Build a mailbox-id → mailbox lookup so the runs list can resolve
    // sub-client attribution without scanning the array every time.
    const mailboxById = new Map<string, Mailbox>();
    for (const m of rawMailboxes) mailboxById.set(m.id, m);

    const subClients: AgencyToolsData['subClients'] = subClientsRaw.map(
      (s) => {
        const dom = domainOf(s.owner_email);
        const bucket = dom
          ? rawMailboxes.filter((m) => domainOf(m.email_address) === dom)
          : [];
        const mailboxCount = s.mailbox_count ?? bucket.length;
        // TODO: skeleton — no per-sub-client paused flag on the backend.
        // 'active' when the bucket carries mailboxes, 'onboarding' when
        // empty. 'paused' is unreachable until that column ships.
        const status: AgencyToolsData['subClients'][number]['status'] =
          mailboxCount > 0 ? 'active' : 'onboarding';
        return {
          id: s.id,
          name: s.name,
          domain: dom || s.owner_email,
          mailboxCount,
          status,
        };
      },
    );

    // ── recentRuns: interleave spam-scan + placement-test rows ──────
    // The other two tools (preview, templates) have no queryable run
    // history. Each row is attributed to a sub-client by domain match
    // (placement carries `mailbox_id` → lookup → domain; spam scans
    // attribute to the agency itself since they don't carry a mailbox
    // reference).
    const agencyFallbackId = 'agency-self';
    const agencyFallbackName = agencyName;

    interface RawRun {
      id: string;
      toolSlug: ToolSlug;
      subClientId: string;
      subClientName: string;
      startedAt: string;
      status: AgencyToolsData['recentRuns'][number]['status'];
      summary: string;
      durationMs: number;
      ms: number;
    }

    const placementRuns: RawRun[] = placements.map((p) => {
      const mbox = mailboxById.get(p.mailbox_id);
      const sub = mbox ? findSubClient(mbox.email_address, subClientsRaw) : null;
      const inboxPct = num(p.results?.inbox);
      return {
        id: `placement-${p.test_id}`,
        toolSlug: 'placement' as ToolSlug,
        subClientId: sub?.id ?? agencyFallbackId,
        subClientName: sub?.name ?? agencyFallbackName,
        startedAt: p.sent_at,
        // The list endpoint only returns completed tests; no in-flight
        // shape surfaces here. Map every row to 'completed'.
        status: 'completed' as const,
        summary: `Inbox ${inboxPct}% across ${num(p.seed_count)} seeds`,
        // TODO: backend doesn't surface placement durations — zero-fill.
        durationMs: 0,
        ms: isoMs(p.sent_at),
      };
    });

    const scanRuns: RawRun[] = scans.map((s) => ({
      id: `spam-${s.id}`,
      // Spam scans don't carry a mailbox reference, so they always
      // attribute to the agency itself rather than a specific sub-client.
      toolSlug: 'spam' as ToolSlug,
      subClientId: agencyFallbackId,
      subClientName: agencyFallbackName,
      startedAt: s.created_at,
      status: s.passed ? 'completed' : 'failed',
      summary: s.passed
        ? `SpamAssassin score ${s.score.toFixed(1)} — passed`
        : `SpamAssassin score ${s.score.toFixed(1)} — failed (${s.triggers.length} triggers)`,
      // TODO: backend doesn't surface spam-scan durations — zero-fill.
      durationMs: 0,
      ms: isoMs(s.created_at),
    }));

    const recentRuns: AgencyToolsData['recentRuns'] = [
      ...placementRuns,
      ...scanRuns,
    ]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 20)
      .map(({ ms: _ms, ...rest }) => rest);

    // ── tools[]: catalog metadata + per-tool last-run / 30d counters ─
    // Derive lastRunAt + runsLast30d for spam and placement from their
    // list endpoints. Templates → use the catalog total + newest creation
    // (templates aren't runs, but they're the queryable proxy). Preview
    // has no list endpoint, so it stays at zero / null.
    const placementLastIso = newestIso(placements.map((p) => p.sent_at));
    const placement30d = placements.filter((p) =>
      withinDays(p.sent_at, 30, nowMs),
    ).length;

    const scanLastIso = newestIso(scans.map((s) => s.created_at));
    const scan30d = scans.filter((s) => withinDays(s.created_at, 30, nowMs))
      .length;

    const templateLastIso = newestIso(templates.map((t) => t.created_at));
    const template30d = templates.filter((t) =>
      withinDays(t.created_at, 30, nowMs),
    ).length;

    const toolMetrics: Record<
      ToolSlug,
      { lastRunAt: string | null; runsLast30d: number }
    > = {
      // TODO: no list endpoint for warmup-preview (it's a dry mutation).
      preview: { lastRunAt: null, runsLast30d: 0 },
      templates: { lastRunAt: templateLastIso, runsLast30d: template30d },
      spam: { lastRunAt: scanLastIso, runsLast30d: scan30d },
      placement: { lastRunAt: placementLastIso, runsLast30d: placement30d },
    };

    const tools: AgencyToolsData['tools'] = TOOL_CATALOG.map((entry) => {
      const metrics = toolMetrics[entry.slug];
      return {
        ...entry,
        lastRunAt: metrics.lastRunAt,
        runsLast30d: metrics.runsLast30d,
        // The four tools are always available on Agency tier — gates
        // (e.g. seed quotas) live inside the individual tool components.
        available: true,
      };
    });

    // ── summary ─────────────────────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const totalRunsToday = recentRuns.filter(
      (r) => isoMs(r.startedAt) >= todayStartMs,
    ).length;
    const totalRuns30d = placement30d + scan30d;
    const inboxScores = placements
      .map((p) => num(p.results?.inbox))
      .filter((v) => v > 0);
    const avgPlacementScore =
      inboxScores.length > 0
        ? Math.round(
            inboxScores.reduce((acc, v) => acc + v, 0) / inboxScores.length,
          )
        : 0;

    const summary: AgencyToolsData['summary'] = {
      totalRunsToday,
      totalRuns30d,
      avgPlacementScore,
      // TODO: no per-workspace queue-depth endpoint yet — zero rather than
      // fabricate a queue size the user might trust.
      queuedRuns: 0,
    };

    return {
      agency: { name: agencyName, region },
      subClients,
      tools,
      recentRuns,
      summary,
    };
  }, [
    isLoading,
    workspaceQuery.data,
    mailboxesQuery.data,
    placementsQuery.data,
    scansQuery.data,
    templatesQuery.data,
    authUser,
  ]);

  return { data, isLoading };
}
