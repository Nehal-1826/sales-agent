import { useMemo } from 'react';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox, MailboxProvider } from '@/features/mailboxes/types';
import {
  useDnsRollup,
  useDomainReputation,
  usePostmasterStatus,
  useReputationOverview,
  useSndsStatus,
  type DomainReputation,
} from '@/features/reputation/api';
import {
  SIGNAL_MAP_SKELETON,
  type GraphEdge,
  type GraphNode,
  type Health,
  type SignalMapData,
} from '@/pages/client/proplus/ProPlusRep3SignalMap';

/**
 * Live-data adapter for the Pro-Plus "Signal Map" surface
 * (`pages/client/proplus/ProPlusRep3SignalMap.tsx`).
 *
 * Maps the existing TanStack-Query reputation / mailbox hooks onto the exact
 * `SignalMapData` shape the node-link graph consumes. Modelled on
 * `useProPlusBenchmarkData.ts`: everything is best-effort — the reputation
 * hooks already fall back (404 / empty / `{connected:false}`) so any signal
 * the workspace hasn't materialised yet keeps the skeleton's value rather
 * than being faked.
 *
 *   - empty workspace (0 mailboxes) → returns `data: null` (caller shows the
 *     existing "complete onboarding" empty state)
 *   - still loading mailbox list    → `isLoading: true`, `data: null`
 *
 * TOPOLOGY vs DATA: the graph layout (node ids, kinds, x/y/r positions, edge
 * wiring) is a DESIGN constant. We start from the design's exported
 * `SIGNAL_MAP_SKELETON` and overlay ONLY real values (composite, per-node
 * health / metric rows / trends, edge strengths) onto the fixed topology —
 * we never recompute graph positions from the API. Any metric with NO API
 * source keeps the skeleton value and is flagged with a `// TODO: no API
 * source — skeleton value` comment (same honesty rule as
 * `useProPlusBenchmarkData.ts` — no synthetic numbers).
 *
 * Re-export the shape so callers (`ProPlusReputation`) can import the type
 * from either module.
 */
export type {
  GraphEdge,
  GraphNode,
  Health,
  SignalMapData,
} from '@/pages/client/proplus/ProPlusRep3SignalMap';

const num = (v: unknown, dflt = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Map a 0–100 score to a node Health band (same thresholds the Starter /
 *  Pro reputation surfaces use: ≥80 healthy, ≥50 watch, else critical). */
function healthFromScore(score: number): Health {
  if (score >= 80) return 'healthy';
  if (score >= 50) return 'watch';
  return 'critical';
}

/** Postmaster / SNDS expose reputation as a textual tier ("High" / "Medium"
 *  / "Low" / "Bad"). Map to a Health band + a stable 0–100 proxy so the
 *  composite + node colour stay on-palette. Unknown → null. */
function repTierToScore(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const t = tier.toLowerCase();
  if (t.includes('high') || t === 'green') return 95;
  if (t.includes('medium') || t.includes('fair') || t === 'yellow') return 70;
  if (t.includes('low')) return 45;
  if (t.includes('bad') || t.includes('red')) return 20;
  return null;
}

const PROVIDER_LABEL: Record<MailboxProvider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'Generic SMTP',
};

/** % of a boolean DNS field that is `true` across a mailbox list. */
function dnsPassPct(
  list: Mailbox[],
  key: 'spf_valid' | 'dkim_valid' | 'dmarc_valid',
): number {
  if (list.length === 0) return 0;
  const ok = list.filter((m) => m[key] === true).length;
  return Math.round((ok / list.length) * 100);
}

export interface UseProPlusSignalMapDataResult {
  data: SignalMapData | null;
  isLoading: boolean;
}

export function useProPlusSignalMapData(): UseProPlusSignalMapDataResult {
  const mailboxesQuery = useMailboxes();

  // All reputation hooks are best-effort (404 / empty / {connected:false}
  // fallbacks live in features/reputation/api.ts) — never a loading gate.
  const overviewQuery = useReputationOverview();
  const dnsQuery = useDnsRollup();
  const postmasterQuery = usePostmasterStatus();
  const sndsQuery = useSndsStatus();
  const domainRepQuery = useDomainReputation();

  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Loading: the mailbox list is the only gate (it decides whether this
  // workspace has anything to map; the reputation series are best-effort and
  // resolve to fallbacks so we never block on them).
  const isLoading = mailboxesQuery.isLoading;

  const data = useMemo<SignalMapData | null>(() => {
    if (mailboxesQuery.isLoading) return null;
    if (mailboxes.length === 0) return null;

    const overview = overviewQuery.data;
    const dns = dnsQuery.data;
    const postmaster = postmasterQuery.data;
    const snds = sndsQuery.data;
    const domainRep = domainRepQuery.data;

    // Index the skeleton so we overlay onto the EXACT fixed topology —
    // positions (x/y/r), node ids/kinds and edge wiring are untouched.
    const skel = SIGNAL_MAP_SKELETON;
    const skelNode = (id: string): GraphNode =>
      skel.nodes.find((n) => n.id === id) ?? skel.nodes[0]!;

    // Active (latest-snapshot-bearing) Postmaster / SNDS credentials.
    const pmCred: DomainReputation | null =
      domainRep?.postmaster.find((r) => r.is_active) ??
      domainRep?.postmaster[0] ??
      null;
    const sndsCred: DomainReputation | null =
      domainRep?.snds.find((r) => r.is_active) ?? domainRep?.snds[0] ?? null;

    const pmConnected = postmaster?.connected === true || pmCred != null;
    const sndsConnected = snds?.connected === true || sndsCred != null;

    // ── Primary sending domain (most-common mailbox domain) ──────────────
    const domainCounts = new Map<string, number>();
    for (const m of mailboxes) {
      const at = m.email_address.lastIndexOf('@');
      const dom =
        at >= 0
          ? m.email_address.slice(at + 1).toLowerCase()
          : m.email_address.toLowerCase();
      domainCounts.set(dom, (domainCounts.get(dom) ?? 0) + 1);
    }
    const domainName =
      [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      skel.domainName;

    // ── DOMAIN composite node ───────────────────────────────────────────
    // Real domain composite from the reputation overview; if the workspace
    // hasn't materialised an overview yet, keep the skeleton composite.
    const composite = clamp(
      Math.round(num(overview?.overall_reputation, skel.composite)),
      0,
      100,
    );
    const liveSources = (pmConnected ? 1 : 0) + (sndsConnected ? 1 : 0);
    const domainHealth = healthFromScore(composite);

    const domainNode: GraphNode = {
      ...skelNode('domain'),
      label: domainName,
      health: domainHealth,
      headline:
        'Composite sender trust across every connected mailbox.',
      rows: [
        {
          label: 'Composite score',
          value: `${composite} / 100`,
          tone: domainHealth,
        },
        {
          label: 'Connected mailboxes',
          value: `${mailboxes.length}`,
          tone: 'healthy',
        },
        {
          label: 'Signal sources live',
          value: `${liveSources} of 4`,
          tone: liveSources >= 2 ? 'healthy' : 'watch',
        },
        // TODO: no API source — skeleton value (no composite history endpoint;
        // useReputationTrend is workspace-synthesized, not a real delta).
        skelNode('domain').rows[3]!,
      ],
    };

    // ── DNS Auth source node (real — useDnsRollup) ──────────────────────
    const spfPct = num(dns?.spf_pct);
    const dkimPct = num(dns?.dkim_pct);
    const dmarcPct = num(dns?.dmarc_pct);
    const totalMb = num(dns?.total_mailboxes, mailboxes.length);
    const dnsAvg = (spfPct + dkimPct + dmarcPct) / 3;
    const dnsHealth = healthFromScore(dnsAvg);
    const fmtCount = (pct: number): string =>
      `${Math.round((pct / 100) * totalMb)} / ${totalMb} pass`;
    const dnsSkel = skelNode('src-dns');
    const dnsNode: GraphNode = {
      ...dnsSkel,
      health: dnsHealth,
      headline: `Authentication records resolved across ${totalMb} mailboxes.`,
      rows: [
        {
          label: 'SPF',
          value: fmtCount(spfPct),
          tone: healthFromScore(spfPct),
        },
        {
          label: 'DKIM',
          value: fmtCount(dkimPct),
          tone: healthFromScore(dkimPct),
        },
        {
          label: 'DMARC',
          value: fmtCount(dmarcPct),
          tone: healthFromScore(dmarcPct),
        },
        // TODO: no API source — skeleton value (probe cadence is not surfaced).
        dnsSkel.rows[3]!,
      ],
      // TODO: no API source — skeleton trend (no auth-pass-rate time series;
      // useDnsRollup is a point-in-time aggregate only).
      trend: dnsSkel.trend,
    };

    // ── Google Postmaster source node (real — usePostmasterStatus +
    //    useDomainReputation.postmaster latest_snapshot) ─────────────────
    const pmSnap = pmCred?.latest_snapshot ?? null;
    const pmDomScore = repTierToScore(pmSnap?.domain_reputation);
    const pmIpScore = repTierToScore(pmSnap?.ip_reputation);
    const pmSpam = pmSnap?.spam_rate;
    const pmAuth = pmSnap?.auth_pass_pct;
    const pmHealth: Health = !pmConnected
      ? 'watch'
      : pmDomScore != null
        ? healthFromScore(pmDomScore)
        : 'watch';
    const pmSkel = skelNode('src-postmaster');
    const postmasterNode: GraphNode = {
      ...pmSkel,
      health: pmHealth,
      live: pmConnected,
      headline: pmConnected
        ? 'Live Gmail feed — Google Postmaster domain & IP trust.'
        : 'Connect Google Postmaster Tools to stream Gmail trust.',
      rows: [
        {
          label: 'Domain trust',
          value: pmSnap?.domain_reputation ?? (pmConnected ? '—' : 'Not connected'),
          tone: pmDomScore != null ? healthFromScore(pmDomScore) : 'watch',
        },
        {
          label: 'IP trust',
          value: pmSnap?.ip_reputation ?? '—',
          tone: pmIpScore != null ? healthFromScore(pmIpScore) : 'watch',
        },
        {
          label: 'Spam rate',
          value:
            pmSpam != null ? `${(num(pmSpam) * (num(pmSpam) <= 1 ? 100 : 1)).toFixed(2)}%` : '—',
          tone:
            pmSpam != null
              ? num(pmSpam) * (num(pmSpam) <= 1 ? 100 : 1) < 0.3
                ? 'healthy'
                : 'watch'
              : 'watch',
        },
        {
          label: 'Auth pass',
          value: pmAuth != null ? `${num(pmAuth).toFixed(1)}%` : '—',
          tone:
            pmAuth != null
              ? healthFromScore(num(pmAuth))
              : 'watch',
        },
      ],
      // TODO: no API source — skeleton trend (latest_snapshot is a single
      // point; no domain-reputation history endpoint exists).
      trend: pmSkel.trend,
    };

    // ── Microsoft SNDS source node (real — useSndsStatus +
    //    useDomainReputation.snds latest_snapshot) ───────────────────────
    const sndsSnap = sndsCred?.latest_snapshot ?? null;
    const sndsIpScore = repTierToScore(sndsSnap?.ip_reputation);
    const sndsComplaint = sndsSnap?.complaint_rate;
    const sndsHealth: Health = !sndsConnected
      ? 'watch'
      : sndsIpScore != null
        ? healthFromScore(sndsIpScore)
        : 'watch';
    const sndsSkel = skelNode('src-snds');
    const sndsNode: GraphNode = {
      ...sndsSkel,
      health: sndsHealth,
      live: sndsConnected,
      headline: sndsConnected
        ? 'Live Microsoft feed — SNDS per-IP filter status.'
        : 'Connect Microsoft SNDS to stream Outlook IP status.',
      rows: [
        {
          label: 'IP status',
          value: sndsSnap?.ip_reputation ?? (sndsConnected ? '—' : 'Not connected'),
          tone: sndsIpScore != null ? healthFromScore(sndsIpScore) : 'watch',
        },
        {
          label: 'Complaint rate',
          value:
            sndsComplaint != null
              ? `${(num(sndsComplaint) * (num(sndsComplaint) <= 1 ? 100 : 1)).toFixed(3)}%`
              : '—',
          tone:
            sndsComplaint != null
              ? num(sndsComplaint) * (num(sndsComplaint) <= 1 ? 100 : 1) < 0.1
                ? 'healthy'
                : 'watch'
              : 'watch',
        },
        // TODO: no API source — skeleton values (SNDS snapshot exposes no
        // trap-hit count or per-day volume in DomainReputationSnapshotFields).
        sndsSkel.rows[2]!,
        sndsSkel.rows[3]!,
      ],
      // TODO: no API source — skeleton trend (single latest_snapshot only).
      trend: sndsSkel.trend,
    };

    // ── Blacklist source node (real — reputation overview blacklist_hits) ─
    const allHits = new Set<string>();
    for (const dom of overview?.domains ?? []) {
      for (const h of dom.blacklist_hits ?? []) allHits.add(h);
    }
    const blSkel = skelNode('src-blacklist');
    const blHealth: Health =
      allHits.size === 0 ? 'healthy' : allHits.size <= 1 ? 'watch' : 'critical';
    const blacklistNode: GraphNode = {
      ...blSkel,
      health: blHealth,
      headline:
        allHits.size === 0
          ? 'No monitored RBL/DBL zones list this domain.'
          : `${allHits.size} block list hit${allHits.size === 1 ? '' : 's'} across monitored zones.`,
      rows:
        allHits.size === 0
          ? // TODO: no API source — per-zone results not in ReputationOverview;
            // overview only exposes a flat blacklist_hits[] (empty = all clear).
            blSkel.rows.map((r) =>
              r.label === 'Zones clear'
                ? { ...r, value: 'All clear', tone: 'healthy' as Health }
                : { ...r, tone: 'healthy' as Health },
            )
          : [
              {
                label: 'Listed on',
                value: `${allHits.size} zone${allHits.size === 1 ? '' : 's'}`,
                tone: blHealth,
              },
              {
                label: 'Top hit',
                value: [...allHits][0] ?? '—',
                tone: blHealth,
              },
              // TODO: no API source — overview gives no per-zone breakdown.
              blSkel.rows[2]!,
              blSkel.rows[3]!,
            ],
      // TODO: no API source — skeleton trend (no zones-clear history endpoint).
      trend: blSkel.trend,
    };

    // ── Provider cluster nodes (real — mailboxes grouped by provider) ────
    const byProvider = new Map<MailboxProvider, Mailbox[]>();
    for (const m of mailboxes) {
      const p = (m.provider as MailboxProvider) ?? 'smtp';
      const list = byProvider.get(p) ?? [];
      list.push(m);
      byProvider.set(p, list);
    }

    const providerSkelId: Record<MailboxProvider, string> = {
      gmail: 'prov-gmail',
      outlook: 'prov-outlook',
      yahoo: 'prov-yahoo',
      smtp: 'prov-smtp',
    };

    const providerNodes: GraphNode[] = (
      ['gmail', 'outlook', 'yahoo', 'smtp'] as MailboxProvider[]
    ).map((p) => {
      const sk = skelNode(providerSkelId[p]);
      const list = byProvider.get(p) ?? [];
      const count = list.length;
      // Health = blend of mean warmth + DNS pass across this provider's
      // mailboxes (the only real per-provider signals we have).
      const meanWarmth =
        count === 0
          ? 0
          : list.reduce((acc, m) => acc + num(m.warmth_score), 0) / count;
      const dnsAvgP =
        count === 0
          ? 0
          : (dnsPassPct(list, 'spf_valid') +
              dnsPassPct(list, 'dkim_valid') +
              dnsPassPct(list, 'dmarc_valid')) /
            3;
      const score = count === 0 ? 0 : (meanWarmth + dnsAvgP) / 2;
      const health: Health = count === 0 ? 'watch' : healthFromScore(score);
      return {
        ...sk,
        sub: `${count} mailbox${count === 1 ? '' : 'es'}`,
        health,
        headline:
          count === 0
            ? `No ${PROVIDER_LABEL[p]}-routed mailboxes connected yet.`
            : `${PROVIDER_LABEL[p]}-routed mailboxes — ${Math.round(meanWarmth)} mean warmth.`,
        rows: [
          { label: 'Mailboxes', value: `${count}`, tone: 'healthy' },
          {
            label: 'Mean warmth',
            value: count === 0 ? '—' : `${Math.round(meanWarmth)} / 100`,
            tone: count === 0 ? 'watch' : healthFromScore(meanWarmth),
          },
          {
            label: 'Domain records (DNS) pass',
            value: count === 0 ? '—' : `${Math.round(dnsAvgP)}%`,
            tone: count === 0 ? 'watch' : healthFromScore(dnsAvgP),
          },
        ],
      };
    });

    const nodes: GraphNode[] = [
      domainNode,
      dnsNode,
      postmasterNode,
      sndsNode,
      blacklistNode,
      ...providerNodes,
    ];
    const nodeHealth = new Map<string, Health>();
    for (const n of nodes) nodeHealth.set(n.id, n.health);

    // ── Edges: keep the skeleton WIRING + base strength; only refresh the
    // health colour from the (now real) endpoint node so a degraded source
    // visibly degrades its edge. Source→domain edges also adopt the live
    // flag from their (real) source node. Strength is a layout/topology
    // weight with no API source — kept from the skeleton.
    const edges: GraphEdge[] = skel.edges.map((e) => {
      const fromH = nodeHealth.get(e.from);
      const toH = nodeHealth.get(e.to);
      // Edge health = worst of its two endpoints (skeleton fallback).
      const order: Health[] = ['critical', 'watch', 'healthy'];
      const worst =
        [fromH, toH, e.health]
          .filter((h): h is Health => !!h)
          .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0] ?? e.health;
      const liveSrc =
        e.from === 'src-postmaster' || e.from === 'src-snds'
          ? nodes.find((n) => n.id === e.from)?.live
          : undefined;
      return {
        ...e,
        health: worst,
        // TODO: no API source — edge `strength` is a topology weight kept
        // from the skeleton (no per-edge signal-strength metric exists).
        ...(liveSrc !== undefined ? { live: liveSrc } : {}),
      };
    });

    return {
      domainName,
      composite,
      mailboxCount: mailboxes.length,
      nodes,
      edges,
    };
  }, [
    mailboxesQuery.isLoading,
    mailboxes,
    overviewQuery.data,
    dnsQuery.data,
    postmasterQuery.data,
    sndsQuery.data,
    domainRepQuery.data,
  ]);

  return { data, isLoading };
}
