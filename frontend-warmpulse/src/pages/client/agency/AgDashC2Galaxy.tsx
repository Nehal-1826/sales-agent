import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDot,
  DollarSign,
  Layers,
  Minus,
  Orbit,
  ShieldAlert,
  Sparkles,
  Sun,
  Telescope,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';

/**
 * AgDashC2Galaxy — Agency-tier dashboard #2, "Two-Ring Galaxy".
 *
 * The Agency tier ships a fleet of sub-clients under one workspace. The agency
 * owner is a portfolio manager — they need a SPATIAL read of which accounts
 * carry the revenue and which are growth-stage. This dashboard stratifies the
 * client portfolio across TWO concentric orbital rings drawn as one SVG scene:
 *
 *   - The FLEET CORE pulses at the centre of a tall stage with the agency
 *     name and the sub-client count.
 *   - The INNER RING (radius ~170) holds the TOP-MRR sub-clients ("premier"
 *     accounts) — slightly larger nodes with a faint glow and brighter
 *     connection lines, reading as the close-in, high-value cluster.
 *   - The OUTER RING (radius ~270) holds everyone else ("growth" accounts) —
 *     smaller, slightly more transparent, further out. Distance = revenue tier.
 *   - Three faint DASHED GUIDE CIRCLES (outer / inner / core) underline the
 *     orbit structure.
 *   - Each node tints by status (healthy / warming / at-risk), pulses on
 *     at-risk, lifts outward on hover.
 *   - A side INSPECTOR PANEL shows a portfolio breakdown by default and the
 *     full client card on node-select, with sparkline + alerts.
 *
 * Distinct from C1 (single ring): TWO concentric rings + visual stratification.
 * Fully STANDALONE — no network, router, query hooks, or required props. The
 * harness mounts it prop-less; every value comes from the inline MOCK const.
 * Renders only page content; the shell supplies the sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency dashboard variants
// ---------------------------------------------------------------------------
// Shape duplicated across all 4 Agency dashboard variants — keep in sync.

type SubClientStatus = 'healthy' | 'warming' | 'at_risk';
type AlertSeverity = 'warn' | 'critical';
type AlertKind = 'mailbox_paused' | 'bounce_spike' | 'peer_failed' | 'dns_break';

export interface AgencyDashData {
  workspace: { name: string; subClientCount: number; mailboxCount: number };
  kpis: {
    totalMailboxes: number;
    avgWarmth: number;
    mailboxesAtRisk: number;
    activeSubClients: number;
    mrrUsd: number;
    momGrowthPct: number;
  };
  subClients: Array<{
    id: string;
    name: string;
    logoChar: string;
    mailboxCount: number;
    avgWarmth: number;
    status: SubClientStatus;
    last7dTrend: number[];
    monthlyMrrUsd: number;
    lastActivityAgo: string;
  }>;
  alerts: Array<{
    id: string;
    subClientId: string;
    subClientName: string;
    kind: AlertKind;
    message: string;
    ago: string;
    severity: AlertSeverity;
  }>;
}

// ---------------------------------------------------------------------------
// MOCK data — 9 sub-clients with varied MRR ($60 – $1500).
// Top 4 by MRR ride the inner ring; bottom 5 ride the outer ring.
// Status distribution: 6 healthy, 2 warming, 1 at-risk (Atlas Bio).
// KPI aggregates are computed below from the sub-client list so the header
// band stays consistent with the spatial scene.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyDashData['subClients'] = [
  {
    id: 'sc-helix',
    name: 'Helix Analytics',
    logoChar: 'HA',
    mailboxCount: 22,
    avgWarmth: 89,
    status: 'healthy',
    last7dTrend: [82, 84, 85, 86, 87, 88, 89],
    monthlyMrrUsd: 1480,
    lastActivityAgo: '3m ago',
  },
  {
    id: 'sc-nimbus',
    name: 'Nimbus Cloud',
    logoChar: 'NC',
    mailboxCount: 18,
    avgWarmth: 86,
    status: 'healthy',
    last7dTrend: [80, 81, 82, 83, 84, 85, 86],
    monthlyMrrUsd: 1120,
    lastActivityAgo: '7m ago',
  },
  {
    id: 'sc-orion',
    name: 'Orion Sales',
    logoChar: 'OS',
    mailboxCount: 15,
    avgWarmth: 91,
    status: 'healthy',
    last7dTrend: [85, 87, 88, 89, 90, 91, 91],
    monthlyMrrUsd: 980,
    lastActivityAgo: '14m ago',
  },
  {
    id: 'sc-vega',
    name: 'Vega Outbound',
    logoChar: 'VO',
    mailboxCount: 12,
    avgWarmth: 78,
    status: 'warming',
    last7dTrend: [68, 70, 72, 74, 75, 76, 78],
    monthlyMrrUsd: 740,
    lastActivityAgo: '21m ago',
  },
  {
    id: 'sc-quasar',
    name: 'Quasar Growth',
    logoChar: 'QG',
    mailboxCount: 10,
    avgWarmth: 82,
    status: 'healthy',
    last7dTrend: [75, 77, 78, 79, 80, 81, 82],
    monthlyMrrUsd: 520,
    lastActivityAgo: '34m ago',
  },
  {
    id: 'sc-lyra',
    name: 'Lyra Studio',
    logoChar: 'LS',
    mailboxCount: 8,
    avgWarmth: 84,
    status: 'healthy',
    last7dTrend: [78, 79, 80, 81, 82, 83, 84],
    monthlyMrrUsd: 360,
    lastActivityAgo: '52m ago',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'AB',
    mailboxCount: 6,
    avgWarmth: 54,
    status: 'at_risk',
    last7dTrend: [68, 66, 63, 60, 58, 56, 54],
    monthlyMrrUsd: 240,
    lastActivityAgo: '1h ago',
  },
  {
    id: 'sc-pixel',
    name: 'Pixel Forge',
    logoChar: 'PF',
    mailboxCount: 5,
    avgWarmth: 71,
    status: 'warming',
    last7dTrend: [60, 62, 64, 66, 68, 69, 71],
    monthlyMrrUsd: 180,
    lastActivityAgo: '2h ago',
  },
  {
    id: 'sc-koto',
    name: 'Koto Mail',
    logoChar: 'KM',
    mailboxCount: 3,
    avgWarmth: 79,
    status: 'healthy',
    last7dTrend: [73, 74, 75, 76, 77, 78, 79],
    monthlyMrrUsd: 60,
    lastActivityAgo: '4h ago',
  },
];

const TOTAL_MAILBOXES = SUB_CLIENTS.reduce((s, c) => s + c.mailboxCount, 0);
const TOTAL_MRR = SUB_CLIENTS.reduce((s, c) => s + c.monthlyMrrUsd, 0);
const AVG_WARMTH = Math.round(
  SUB_CLIENTS.reduce((s, c) => s + c.avgWarmth * c.mailboxCount, 0) /
    TOTAL_MAILBOXES,
);
const AT_RISK_MAILBOXES = SUB_CLIENTS.filter((c) => c.status === 'at_risk')
  .reduce((s, c) => s + c.mailboxCount, 0);
const ACTIVE_CLIENTS = SUB_CLIENTS.filter((c) => c.status !== 'at_risk').length;

const ALERTS: AgencyDashData['alerts'] = [
  {
    id: 'al-1',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'bounce_spike',
    message: 'Bounce rate 7.4% on outreach@atlas-bio.com (24h)',
    ago: '38m ago',
    severity: 'critical',
  },
  {
    id: 'al-2',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'dns_break',
    message: 'DMARC record removed from atlas-bio.com',
    ago: '1h ago',
    severity: 'critical',
  },
  {
    id: 'al-3',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    kind: 'mailbox_paused',
    message: 'Auto-paused 1 mailbox after spam complaint',
    ago: '2h ago',
    severity: 'warn',
  },
  {
    id: 'al-4',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    kind: 'peer_failed',
    message: '2 peer inboxes deactivated in workspace pool',
    ago: '3h ago',
    severity: 'warn',
  },
  {
    id: 'al-5',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'mailbox_paused',
    message: 'Mailbox sales@atlas-bio.com paused — high spam folder rate',
    ago: '4h ago',
    severity: 'warn',
  },
  {
    id: 'al-6',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    kind: 'dns_break',
    message: 'SPF lookup returned soft-fail for vega-outbound.io',
    ago: '6h ago',
    severity: 'warn',
  },
];

export const AGENCY_DASH_SKELETON_C2: AgencyDashData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: SUB_CLIENTS.length,
    mailboxCount: TOTAL_MAILBOXES,
  },
  kpis: {
    totalMailboxes: TOTAL_MAILBOXES,
    avgWarmth: AVG_WARMTH,
    mailboxesAtRisk: AT_RISK_MAILBOXES,
    activeSubClients: ACTIVE_CLIENTS,
    mrrUsd: TOTAL_MRR,
    momGrowthPct: 9.6,
  },
  subClients: SUB_CLIENTS,
  alerts: ALERTS,
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522', // healthy (orange)
  accent2: '#FF8A4B', // galaxy orange accent
  accent3: '#FF9670', // at_risk (light orange)
  accent4: '#ffd54f', // warming (yellow)
  surface2: '#1a1a26',
  border: '#2a2a3a',
} as const;

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
};

const STATUS_TEXT: Record<SubClientStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
};

const ALERT_ICON: Record<AlertKind, typeof AlertTriangle> = {
  mailbox_paused: AlertTriangle,
  bounce_spike: TrendingUp,
  peer_failed: Users,
  dns_break: ShieldAlert,
};

const ALERT_LABEL: Record<AlertKind, string> = {
  mailbox_paused: 'Mailbox paused',
  bounce_spike: 'Bounce spike',
  peer_failed: 'Peer failed',
  dns_break: 'DNS break',
};

/** ViewBox space — a fixed coordinate system the stage scales to fit. */
const VB = 800;
const CX = VB / 2;
const CY = VB / 2;
const RING_INNER = 170;
const RING_OUTER = 270;
const GUIDE_CORE = 70;
const CORE_R = 48;
/** Cut-off: top N by MRR ride the inner ring. */
const INNER_TOP_N = 4;

interface Placed {
  id: string;
  client: AgencyDashData['subClients'][number];
  /** 0 = inner ring (premier), 1 = outer ring (growth). */
  ring: 0 | 1;
  x: number;
  y: number;
  /** Node radius in viewBox units. */
  r: number;
}

/**
 * Stratified radial placement:
 *  - Sort all clients by MRR descending.
 *  - Top INNER_TOP_N ride the inner ring at radius RING_INNER (slightly larger).
 *  - The rest ride the outer ring at radius RING_OUTER (smaller).
 *  - Each ring spreads its nodes evenly via angle = -90 + i*(360/count);
 *    the outer ring is offset half a step so the rings interleave visually.
 */
function place(clients: AgencyDashData['subClients']): Placed[] {
  const sorted = [...clients].sort((a, b) => b.monthlyMrrUsd - a.monthlyMrrUsd);
  const inner = sorted.slice(0, INNER_TOP_N);
  const outer = sorted.slice(INNER_TOP_N);
  const maxInnerMrr = Math.max(...inner.map((c) => c.monthlyMrrUsd), 1);
  const maxOuterMrr = Math.max(...outer.map((c) => c.monthlyMrrUsd), 1);

  const layoutInner = inner.map((client, i) => {
    const ang = (-90 + (360 / inner.length) * i) * (Math.PI / 180);
    const vol = client.monthlyMrrUsd / maxInnerMrr; // 0..1
    return {
      id: client.id,
      client,
      ring: 0 as const,
      x: CX + RING_INNER * Math.cos(ang),
      y: CY + RING_INNER * Math.sin(ang),
      r: 30 + vol * 8, // 30..38
    };
  });

  const layoutOuter = outer.map((client, i) => {
    const phase = 360 / outer.length / 2;
    const ang = (-90 + phase + (360 / outer.length) * i) * (Math.PI / 180);
    const vol = client.monthlyMrrUsd / maxOuterMrr; // 0..1
    return {
      id: client.id,
      client,
      ring: 1 as const,
      x: CX + RING_OUTER * Math.cos(ang),
      y: CY + RING_OUTER * Math.sin(ang),
      r: 22 + vol * 7, // 22..29
    };
  });

  return [...layoutInner, ...layoutOuter];
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n}`;
}

/** True if the given client lands on the inner ring (top INNER_TOP_N by MRR). */
function isInnerRing(
  target: AgencyDashData['subClients'][number],
  all: AgencyDashData['subClients'],
): boolean {
  const sorted = [...all].sort((a, b) => b.monthlyMrrUsd - a.monthlyMrrUsd);
  const cutoffIdx = Math.min(INNER_TOP_N, sorted.length) - 1;
  if (cutoffIdx < 0) return false;
  const cutoffVal = sorted[cutoffIdx]?.monthlyMrrUsd ?? 0;
  return target.monthlyMrrUsd >= cutoffVal;
}

function DeltaPill({ delta }: { delta: number }) {
  const flat = delta === 0;
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? 'text-text-dim'
    : delta > 0
      ? 'text-accent'
      : 'text-accent3';
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgDashC2Galaxy({
  data,
}: { data?: AgencyDashData } = {}): JSX.Element {
  const d = data ?? AGENCY_DASH_SKELETON_C2;
  const placed = useMemo(() => place(d.subClients), [d.subClients]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => placed.find((p) => p.id === activeId)?.client ?? null,
    [placed, activeId],
  );

  // Inner-vs-outer aggregates for the bottom rail + panel breakdown.
  const innerPlaced = placed.filter((p) => p.ring === 0);
  const outerPlaced = placed.filter((p) => p.ring === 1);
  const innerMrr = innerPlaced.reduce((s, p) => s + p.client.monthlyMrrUsd, 0);
  const outerMrr = outerPlaced.reduce((s, p) => s + p.client.monthlyMrrUsd, 0);
  const innerMailboxes = innerPlaced.reduce(
    (s, p) => s + p.client.mailboxCount,
    0,
  );
  const outerMailboxes = outerPlaced.reduce(
    (s, p) => s + p.client.mailboxCount,
    0,
  );
  const innerWarmth = innerPlaced.length
    ? Math.round(
        innerPlaced.reduce(
          (s, p) => s + p.client.avgWarmth * p.client.mailboxCount,
          0,
        ) / innerMailboxes,
      )
    : 0;
  const outerWarmth = outerPlaced.length
    ? Math.round(
        outerPlaced.reduce(
          (s, p) => s + p.client.avgWarmth * p.client.mailboxCount,
          0,
        ) / outerMailboxes,
      )
    : 0;

  return (
    <div className="space-y-5">
      {/* Slim global stat header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
              <Telescope className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Agency galaxy
            </h1>
            <Badge variant="blue">
              <Sparkles className="h-3 w-3" />
              Agency
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Top accounts on the inner ring · long tail on the outer · click any
            node to inspect.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Avg warmth" value={String(d.kpis.avgWarmth)} accent />
          <StatChip label="MRR" value={fmtUsd(d.kpis.mrrUsd)} />
          <StatChip
            label="MoM"
            value={`${d.kpis.momGrowthPct > 0 ? '+' : ''}${d.kpis.momGrowthPct.toFixed(1)}%`}
          />
        </div>
      </motion.header>

      {/* Galaxy stage + side inspector */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <GalaxyStage
            data={d}
            placed={placed}
            activeId={activeId}
            hoverId={hoverId}
            innerCount={innerPlaced.length}
            onSelect={setActiveId}
            onHover={setHoverId}
          />
          <Legend />
          <StageAnnotation
            innerCount={innerPlaced.length}
            outerCount={outerPlaced.length}
          />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            client={active}
            onClose={() => setActiveId(null)}
            data={d}
            innerPlaced={innerPlaced}
            outerPlaced={outerPlaced}
            innerMrr={innerMrr}
            outerMrr={outerMrr}
            innerMailboxes={innerMailboxes}
            outerMailboxes={outerMailboxes}
          />
        </div>
      </motion.div>

      {/* Bottom rail — inner / outer breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.18 }}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <BottomTile
          icon={DollarSign}
          label="Inner ring MRR"
          value={fmtUsd(innerMrr)}
          sub={`${innerPlaced.length} premier accounts`}
          accent="accent2"
        />
        <BottomTile
          icon={Orbit}
          label="Outer ring MRR"
          value={fmtUsd(outerMrr)}
          sub={`${outerPlaced.length} growth accounts`}
          accent="dim"
        />
        <BottomTile
          icon={Sun}
          label="Warmth split"
          value={`${innerWarmth} · ${outerWarmth}`}
          sub="Inner vs outer (weighted)"
          accent="accent"
        />
        <BottomTile
          icon={TrendingUp}
          label="MoM growth"
          value={`${d.kpis.momGrowthPct > 0 ? '+' : ''}${d.kpis.momGrowthPct.toFixed(1)}%`}
          sub="Across the fleet"
          accent={d.kpis.momGrowthPct >= 0 ? 'accent' : 'accent3'}
        />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slim header stat chip
// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs backdrop-blur-xl">
      <span className="text-text-dim">{label}</span>
      <span
        className={`font-mono font-semibold tabular-nums ${
          accent ? 'text-accent2' : 'text-text'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Top-of-stage annotation
// ---------------------------------------------------------------------------

function StageAnnotation({
  innerCount,
  outerCount,
}: {
  innerCount: number;
  outerCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.8 }}
      className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-border-muted bg-surface/70 px-3 py-1.5 backdrop-blur-xl"
    >
      <CircleDot className="h-3 w-3 text-accent2" />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
        Inner: top {innerCount} by MRR · Outer: {outerCount} others
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The galaxy stage (fixed-height SVG scene)
// ---------------------------------------------------------------------------

function GalaxyStage({
  data,
  placed,
  activeId,
  hoverId,
  innerCount,
  onSelect,
  onHover,
}: {
  data: AgencyDashData;
  placed: Placed[];
  activeId: string | null;
  hoverId: string | null;
  innerCount: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[680px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(140,140,160,0.35) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* soft radial bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent2}1f` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Agency two-ring galaxy: ${data.workspace.name} with ${data.workspace.subClientCount} sub-clients on two concentric rings`}
      >
        <defs>
          <radialGradient id="gal-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.9} />
            <stop offset="60%" stopColor={HEX.accent2} stopOpacity={0.32} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="gal-inner-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.1} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Three dashed guide circles — the orbit scaffolding */}
        <circle
          cx={CX}
          cy={CY}
          r={GUIDE_CORE}
          fill="none"
          stroke={HEX.border}
          strokeWidth={1}
          strokeDasharray="2 6"
          opacity={0.55}
        />
        <circle
          cx={CX}
          cy={CY}
          r={RING_INNER}
          fill="none"
          stroke={HEX.accent2}
          strokeOpacity={0.22}
          strokeWidth={1.2}
          strokeDasharray="3 7"
        />
        <circle
          cx={CX}
          cy={CY}
          r={RING_OUTER}
          fill="none"
          stroke={HEX.border}
          strokeWidth={1}
          strokeDasharray="2 9"
          opacity={0.7}
        />

        {/* Slow drifting outer halo (the long tail rim) */}
        <motion.circle
          cx={CX}
          cy={CY}
          r={RING_OUTER + 30}
          fill="none"
          stroke={HEX.accent2}
          strokeOpacity={0.16}
          strokeWidth={1.5}
          strokeDasharray="3 22"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 90, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />

        {/* Connection lines: core → each node */}
        {placed.map((p, i) => {
          const focused = activeId === p.id || hoverId === p.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused;
          const stroke = STATUS_HEX[p.client.status];
          const baseOpacity = p.ring === 0 ? 0.34 : 0.18;
          // Inner-ring lines are slightly brighter than outer.
          const w = p.ring === 0 ? 1.6 : 1.1;
          return (
            <g key={`l-${p.id}`}>
              <line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={
                  dimmed ? 0.06 : focused ? 0.78 : baseOpacity
                }
                strokeWidth={focused ? w + 1.2 : w}
                strokeLinecap="round"
              />
              {/* Activity flux travelling the wire */}
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0 : p.ring === 0 ? 0.78 : 0.5}
                strokeWidth={focused ? 2.6 : p.ring === 0 ? 1.8 : 1.4}
                strokeLinecap="round"
                strokeDasharray="2.5 48"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -101 }}
                transition={{
                  duration: 2.8 + (i % 5) * 0.4,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}

        {/* Sub-client nodes — render outer first so inner sits on top */}
        {placed
          .slice()
          .sort((a, b) => a.ring - b.ring)
          .map((p, i) => (
            <NodeGlyph
              key={p.id}
              placed={p}
              index={i}
              active={activeId === p.id}
              hovered={hoverId === p.id}
              faded={
                (activeId !== null || hoverId !== null) &&
                activeId !== p.id &&
                hoverId !== p.id
              }
              onSelect={() =>
                onSelect(p.id === activeId ? null : p.id)
              }
              onHover={onHover}
            />
          ))}

        {/* The fleet core */}
        <CoreGlyph data={data} innerCount={innerCount} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core glyph (centre of the galaxy)
// ---------------------------------------------------------------------------

function CoreGlyph({
  data,
  innerCount,
}: {
  data: AgencyDashData;
  innerCount: number;
}) {
  return (
    <g>
      {/* Expanding pulse halo */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 3.6, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <circle cx={CX} cy={CY} r={CORE_R * 1.8} fill="url(#gal-core)" />
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <text
        x={CX}
        y={CY - 16}
        textAnchor="middle"
        className="fill-text-dim"
        style={{
          fontSize: 9,
          letterSpacing: 1.8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        FLEET CORE
      </text>
      <text
        x={CX}
        y={CY + 2}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {truncate(data.workspace.name, 16)}
      </text>
      <text
        x={CX}
        y={CY + 20}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 11 }}
      >
        {data.workspace.subClientCount} sub-clients
      </text>
      <text
        x={CX}
        y={CY + 35}
        textAnchor="middle"
        fill="#5a5a72"
        style={{
          fontSize: 9,
          letterSpacing: 1.2,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        TOP {innerCount} · INNER
      </text>
    </g>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Sub-client node glyph
// ---------------------------------------------------------------------------

function NodeGlyph({
  placed,
  index,
  active,
  hovered,
  faded,
  onSelect,
  onHover,
}: {
  placed: Placed;
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { id, client, ring, x, y, r } = placed;
  const color = STATUS_HEX[client.status];
  const lifted = active || hovered;
  const isInner = ring === 0;
  const atRisk = client.status === 'at_risk';

  // Inner-ring nodes are subtly richer: higher base opacity, a glow halo.
  const baseOpacity = faded ? 0.28 : isInner ? 1 : 0.78;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: baseOpacity,
        scale: 1,
        // Nudge OUTWARD from the core on hover.
        x: lifted ? (x - CX) * 0.05 : 0,
        y: lifted ? (y - CY) * 0.05 : 0,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: {
          duration: 0.5,
          delay: 0.25 + index * 0.04,
          ease: [0.22, 1, 0.36, 1],
        },
        x: { duration: 0.3 },
        y: { duration: 0.3 },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${client.name}, status ${STATUS_LABEL[client.status]}, ${client.mailboxCount} mailboxes, MRR ${fmtUsd(client.monthlyMrrUsd)}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      {/* Gentle orbital bob */}
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -3 : 3, 0] }}
        transition={{
          duration: 5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* At-risk pulse */}
        {atRisk && (
          <motion.circle
            cx={x}
            cy={y}
            r={r + 6}
            fill="none"
            stroke={color}
            strokeWidth={2}
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {/* Hover ring */}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 9}
            fill="none"
            stroke={color}
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
        )}
        {/* Inner-ring nodes get an extra subtle glow ring */}
        {isInner && (
          <circle
            cx={x}
            cy={y}
            r={r + 6}
            fill="none"
            stroke={color}
            strokeOpacity={0.28}
            strokeWidth={1.2}
          />
        )}
        {/* Disc background tint */}
        <circle
          cx={x}
          cy={y}
          r={r + 3}
          fill={color}
          fillOpacity={isInner ? (lifted ? 0.24 : 0.16) : lifted ? 0.18 : 0.1}
        />
        {/* Main disc */}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={isInner ? (lifted ? 2.6 : 2) : lifted ? 2.2 : 1.6}
        />
        {/* Faint inner highlight on inner-ring nodes (gives the "richer" feel) */}
        {isInner && (
          <circle
            cx={x}
            cy={y - r * 0.25}
            r={r * 0.65}
            fill="url(#gal-inner-glow)"
          />
        )}
        {/* Logo char inside the disc */}
        <text
          x={x}
          y={y + r * 0.28}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.78,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          {client.logoChar}
        </text>
        {/* Name below the node */}
        <text
          x={x}
          y={y + r + 16}
          textAnchor="middle"
          className="fill-text"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {truncate(client.name, 14)}
        </text>
        {/* Warmth chip below the name */}
        <g>
          <rect
            x={x - 22}
            y={y + r + 22}
            width={44}
            height={14}
            rx={7}
            fill={HEX.surface2}
            stroke={color}
            strokeOpacity={0.6}
            strokeWidth={1}
          />
          <text
            x={x}
            y={y + r + 32}
            textAnchor="middle"
            fill={color}
            style={{
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            W{client.avgWarmth}
          </text>
        </g>
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Legend (compact, overlaid bottom-left)
// ---------------------------------------------------------------------------

function Legend() {
  const items: Array<{ status: SubClientStatus; label: string }> = [
    { status: 'healthy', label: 'Healthy · warmth ≥ 75' },
    { status: 'warming', label: 'Warming · 60–74' },
    { status: 'at_risk', label: 'At risk · < 60' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.9 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Orbit className="h-3 w-3 text-accent2" />
        Warmth tier
      </span>
      {items.map((it) => (
        <span
          key={it.status}
          className="flex items-center gap-2 text-xs text-text"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_HEX[it.status] }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <DollarSign className="h-3 w-3 text-accent2" />
        Distance = revenue tier
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Side inspector panel — empty state = portfolio breakdown, otherwise client.
// ---------------------------------------------------------------------------

function InspectorPanel({
  client,
  onClose,
  data,
  innerPlaced,
  outerPlaced,
  innerMrr,
  outerMrr,
  innerMailboxes: _innerMailboxes,
  outerMailboxes,
}: {
  client: AgencyDashData['subClients'][number] | null;
  onClose: () => void;
  data: AgencyDashData;
  innerPlaced: Placed[];
  outerPlaced: Placed[];
  innerMrr: number;
  outerMrr: number;
  innerMailboxes: number;
  outerMailboxes: number;
}) {
  return (
    <div className="relative h-[680px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {client ? (
          <motion.div
            key={client.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <ClientDetail
              client={client}
              data={data}
              onClose={onClose}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <PortfolioBreakdown
              data={data}
              innerPlaced={innerPlaced}
              outerPlaced={outerPlaced}
              innerMrr={innerMrr}
              outerMrr={outerMrr}
              outerMailboxes={outerMailboxes}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty-state portfolio breakdown
// ---------------------------------------------------------------------------

function PortfolioBreakdown({
  data,
  innerPlaced,
  outerPlaced,
  innerMrr,
  outerMrr,
  outerMailboxes,
}: {
  data: AgencyDashData;
  innerPlaced: Placed[];
  outerPlaced: Placed[];
  innerMrr: number;
  outerMrr: number;
  outerMailboxes: number;
}) {
  const topAlerts = data.alerts.slice(0, 3);
  const fleetTotal = innerMrr + outerMrr;
  const innerPct = fleetTotal ? Math.round((innerMrr / fleetTotal) * 100) : 0;
  const outerPct = 100 - innerPct;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Telescope className="h-4 w-4 text-accent2" />
          <h2 className="text-base font-semibold text-text">Galaxy state</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Select any node to inspect the sub-client.
        </p>
      </header>

      <div className="space-y-4 p-5">
        {/* MRR split visual */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            Portfolio breakdown
          </p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-text-dim">Total fleet MRR</p>
              <p className="font-mono text-2xl font-semibold tabular-nums text-text">
                {fmtUsd(fleetTotal)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-dim">Mailboxes</p>
              <p className="font-mono text-base font-semibold tabular-nums text-text">
                {data.kpis.totalMailboxes}
              </p>
            </div>
          </div>
          {/* Stacked horizontal MRR split */}
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full"
              style={{ background: HEX.accent2 }}
              initial={{ width: 0 }}
              animate={{ width: `${innerPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            <motion.div
              className="h-full"
              style={{ background: `${HEX.accent2}55` }}
              initial={{ width: 0 }}
              animate={{ width: `${outerPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-text-dim">
            <span>Inner {innerPct}%</span>
            <span>Outer {outerPct}%</span>
          </div>
        </div>

        {/* Inner ring list */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <CircleDot className="h-3 w-3 text-accent2" />
              Inner ring (premier)
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {innerPlaced.length} · {fmtUsd(innerMrr)}
            </span>
          </div>
          <ul className="space-y-1.5">
            {innerPlaced.map((p) => (
              <RingRow key={p.id} placed={p} kind="inner" />
            ))}
          </ul>
        </section>

        {/* Outer ring summary */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Orbit className="h-3 w-3 text-text-dim" />
              Outer ring (growth)
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {outerPlaced.length} · {fmtUsd(outerMrr)}
            </span>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-text-dim" />
                <span className="text-sm font-medium text-text">
                  {outerPlaced.length} growth accounts
                </span>
              </div>
              <span className="font-mono text-xs tabular-nums text-text">
                {outerMailboxes} mailboxes
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-text-dim">
              Combined MRR {fmtUsd(outerMrr)} ·{' '}
              {Math.round((outerMrr / fleetTotal) * 100)}% of fleet
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {outerPlaced.slice(0, 8).map((p) => (
                <span
                  key={p.id}
                  className="rounded border border-border-muted bg-surface/60 px-1.5 py-0.5 text-[10px] font-medium text-text-dim"
                  style={{ borderColor: `${STATUS_HEX[p.client.status]}55` }}
                  title={`${p.client.name} · ${fmtUsd(p.client.monthlyMrrUsd)}`}
                >
                  {p.client.logoChar}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Top alerts strip */}
      <div className="mt-auto border-t border-white/5 p-5">
        <div className="mb-2.5 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-accent3" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            Top alerts
          </span>
          <Badge variant="orange">{topAlerts.length}</Badge>
        </div>
        <ul className="space-y-2">
          {topAlerts.map((a) => {
            const Icon = ALERT_ICON[a.kind];
            const isCrit = a.severity === 'critical';
            return (
              <li
                key={a.id}
                className="flex items-start gap-2.5 rounded-lg border border-border-muted bg-surface-2/40 p-2.5"
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                    isCrit
                      ? 'bg-accent3/15 text-accent3'
                      : 'bg-accent4/15 text-accent4'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-text">
                      {a.subClientName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-text-dim">
                      {a.ago}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-text-dim">
                    {a.message}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function RingRow({
  placed,
  kind,
}: {
  placed: Placed;
  kind: 'inner' | 'outer';
}) {
  const color = STATUS_HEX[placed.client.status];
  return (
    <li
      className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
      style={{ borderColor: kind === 'inner' ? `${color}40` : undefined }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-bg"
          style={{ background: color }}
          aria-hidden
        >
          {placed.client.logoChar}
        </span>
        <span className="truncate text-xs font-medium text-text">
          {placed.client.name}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-text">
          {fmtUsd(placed.client.monthlyMrrUsd)}
        </span>
        <span
          className={`font-mono text-[10px] tabular-nums ${STATUS_TEXT[placed.client.status]}`}
        >
          W{placed.client.avgWarmth}
        </span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Client-detail view (when a node is selected)
// ---------------------------------------------------------------------------

function ClientDetail({
  client,
  data,
  onClose,
}: {
  client: AgencyDashData['subClients'][number];
  data: AgencyDashData;
  onClose: () => void;
}) {
  const color = STATUS_HEX[client.status];
  const trendData = useMemo(
    () => client.last7dTrend.map((v, i) => ({ i, v })),
    [client.last7dTrend],
  );
  const fleetMrr = data.kpis.mrrUsd;
  const fleetPct = fleetMrr
    ? Math.round((client.monthlyMrrUsd / fleetMrr) * 100)
    : 0;
  const alerts = data.alerts.filter((a) => a.subClientId === client.id);
  const trendDelta =
    (client.last7dTrend[client.last7dTrend.length - 1] ?? 0) - (client.last7dTrend[0] ?? 0);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-bold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {client.logoChar}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-text">
                {client.name}
              </p>
              <span
                className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_TEXT[client.status]}`}
                style={{ borderColor: `${color}55`, background: `${color}14` }}
              >
                {STATUS_LABEL[client.status]}
              </span>
            </div>
            <p className="text-xs text-text-dim">
              {client.mailboxCount} mailboxes · {client.lastActivityAgo}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {/* MRR contribution headline */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                Monthly contribution
              </p>
              <p
                className="mt-0.5 font-mono text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {fmtUsd(client.monthlyMrrUsd)}
              </p>
              <p className="mt-1 text-xs text-text-dim">
                {fleetPct}% of fleet MRR
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-text-dim" />
                <span className="font-mono text-sm tabular-nums text-text">
                  {client.mailboxCount}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-dim">mailboxes</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${fleetPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Warmth + trend */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <Activity className="h-3.5 w-3.5 text-accent2" />
              7-day warmth
            </div>
            <DeltaPill delta={trendDelta} />
          </div>
          <div className="mt-2 flex items-end justify-between">
            <p
              className="font-mono text-3xl font-semibold tabular-nums leading-none"
              style={{ color }}
            >
              {client.avgWarmth}
            </p>
            <p className={`text-xs font-medium ${STATUS_TEXT[client.status]}`}>
              {STATUS_LABEL[client.status]}
            </p>
          </div>
          <div className="mt-2 h-[90px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trendData}
                margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`gal-spark-${client.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={color} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <YAxis hide domain={['dataMin - 6', 'dataMax + 6']} />
                <Tooltip
                  contentStyle={{
                    background: '#12121a',
                    border: `1px solid ${HEX.border}`,
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelFormatter={() => 'Warmth'}
                  formatter={(v: number | string) => [String(v), 'Score']}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={color}
                  strokeWidth={2.2}
                  fill={`url(#gal-spark-${client.id})`}
                  dot={false}
                  activeDot={{ r: 3 }}
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCell
            icon={Building2}
            label="Mailboxes"
            value={String(client.mailboxCount)}
            sub="under this account"
          />
          <StatCell
            icon={DollarSign}
            label="Fleet share"
            value={`${fleetPct}%`}
            sub="of total MRR"
          />
          <StatCell
            icon={Activity}
            label="Last activity"
            value={client.lastActivityAgo}
            sub="warmup signal"
          />
          <StatCell
            icon={Orbit}
            label="Ring tier"
            value={isInnerRing(client, data.subClients) ? 'Inner' : 'Outer'}
            sub="placement on canvas"
          />
        </div>

        {/* Alerts for this client */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              <AlertTriangle className="h-3 w-3 text-accent3" />
              Account alerts
            </span>
            <Badge variant={alerts.length ? 'orange' : 'green'}>
              {alerts.length || 'Clear'}
            </Badge>
          </div>
          {alerts.length === 0 ? (
            <p className="text-[11px] text-text-dim">
              No outstanding alerts on this account.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 4).map((a) => {
                const Icon = ALERT_ICON[a.kind];
                const isCrit = a.severity === 'critical';
                return (
                  <li key={a.id} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${
                        isCrit
                          ? 'bg-accent3/15 text-accent3'
                          : 'bg-accent4/15 text-accent4'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold text-text">
                          {ALERT_LABEL[a.kind]}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-text-dim">
                          {a.ago}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-dim">{a.message}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-text">
        {value}
      </p>
      <p className="text-[11px] text-text-dim">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail tile
// ---------------------------------------------------------------------------

type BottomTileAccent = 'accent' | 'accent2' | 'accent3' | 'accent4' | 'dim';

const BOTTOM_TILE_TONE: Record<BottomTileAccent, string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
  dim: 'text-text-dim',
};

const BOTTOM_TILE_BORDER: Record<BottomTileAccent, string> = {
  accent: 'border-accent/30 bg-accent/5',
  accent2: 'border-accent2/30 bg-accent2/5',
  accent3: 'border-accent3/30 bg-accent3/5',
  accent4: 'border-accent4/30 bg-accent4/5',
  dim: 'border-border-muted bg-surface-2/40',
};

function BottomTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub: string;
  accent: BottomTileAccent;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg border ${BOTTOM_TILE_BORDER[accent]} ${BOTTOM_TILE_TONE[accent]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-text">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-text-dim">{sub}</p>
    </div>
  );
}

export default AgDashC2Galaxy;
