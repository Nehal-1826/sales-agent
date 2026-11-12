import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  DollarSign,
  Inbox,
  Minus,
  Network,
  Orbit,
  Radio,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * AgDashC1Orbital — Agency-tier dashboard #1, "Single-Ring Orbital Constellation".
 *
 * The simplest of the Agency constellation family — closest in spirit to the
 * Pro-Plus N3 Constellation but tuned for the AGENCY topology: every SUB-CLIENT
 * orbits the agency core on one ring. Nodes are sized by mailbox count, tinted
 * by warmth-tier status, and tethered to the core by status-coloured lines
 * whose stroke flux encodes activity. At-risk nodes pulse subtly.
 *
 * Fully STANDALONE — no network, router, or query hooks; no required props.
 * Every value comes from the inline MOCK constant so the preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies the
 * sidebar/chrome. Node coordinates are deterministic trig on the array index.
 */

// ---------------------------------------------------------------------------
// Shared Agency dashboard data shape (kept in sync across all 4 variants).
// ---------------------------------------------------------------------------

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
// Mock data — Northwind Agency with 9 sub-clients
// ---------------------------------------------------------------------------

/** Deterministic 7-pt warmth sparkline ending near `end`. */
function spark(end: number, climb: number): number[] {
  return Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    const v = end - climb + climb * t + Math.sin(i * 1.1 + end) * 2.2;
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

const SUB_CLIENTS: AgencyDashData['subClients'] = [
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'LL',
    mailboxCount: 18,
    avgWarmth: 91,
    status: 'healthy',
    last7dTrend: spark(91, 6),
    monthlyMrrUsd: 880,
    lastActivityAgo: '2m ago',
  },
  {
    id: 'sc-northwind',
    name: 'Northwind',
    logoChar: 'NW',
    mailboxCount: 14,
    avgWarmth: 87,
    status: 'healthy',
    last7dTrend: spark(87, 5),
    monthlyMrrUsd: 720,
    lastActivityAgo: '4m ago',
  },
  {
    id: 'sc-acme',
    name: 'Acme Outreach',
    logoChar: 'AO',
    mailboxCount: 11,
    avgWarmth: 84,
    status: 'healthy',
    last7dTrend: spark(84, 7),
    monthlyMrrUsd: 580,
    lastActivityAgo: '6m ago',
  },
  {
    id: 'sc-helio',
    name: 'Helio Sales',
    logoChar: 'HS',
    mailboxCount: 9,
    avgWarmth: 79,
    status: 'healthy',
    last7dTrend: spark(79, 8),
    monthlyMrrUsd: 460,
    lastActivityAgo: '11m ago',
  },
  {
    id: 'sc-crestwood',
    name: 'Crestwood',
    logoChar: 'CW',
    mailboxCount: 7,
    avgWarmth: 76,
    status: 'healthy',
    last7dTrend: spark(76, 6),
    monthlyMrrUsd: 360,
    lastActivityAgo: '18m ago',
  },
  {
    id: 'sc-slate',
    name: 'Slate',
    logoChar: 'SL',
    mailboxCount: 6,
    avgWarmth: 75,
    status: 'healthy',
    last7dTrend: spark(75, 5),
    monthlyMrrUsd: 320,
    lastActivityAgo: '24m ago',
  },
  {
    id: 'sc-vector',
    name: 'Vector',
    logoChar: 'VC',
    mailboxCount: 4,
    avgWarmth: 64,
    status: 'warming',
    last7dTrend: spark(64, 11),
    monthlyMrrUsd: 200,
    lastActivityAgo: '38m ago',
  },
  {
    id: 'sc-forge',
    name: 'Forge',
    logoChar: 'FG',
    mailboxCount: 3,
    avgWarmth: 52,
    status: 'warming',
    last7dTrend: spark(52, 9),
    monthlyMrrUsd: 140,
    lastActivityAgo: '52m ago',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'AB',
    mailboxCount: 1,
    avgWarmth: 32,
    status: 'at_risk',
    last7dTrend: spark(32, -8),
    monthlyMrrUsd: 60,
    lastActivityAgo: '3h ago',
  },
];

const ALERTS: AgencyDashData['alerts'] = [
  {
    id: 'al-1',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'bounce_spike',
    message: 'Bounce rate spiked to 9.2% on press@atlasbio.co (last 6h).',
    ago: '14m ago',
    severity: 'critical',
  },
  {
    id: 'al-2',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'dns_break',
    message: 'DMARC record returned NXDOMAIN — alignment is broken.',
    ago: '38m ago',
    severity: 'critical',
  },
  {
    id: 'al-3',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'mailbox_paused',
    message: 'Sole mailbox auto-paused — warmth dropped below 35.',
    ago: '1h ago',
    severity: 'warn',
  },
  {
    id: 'al-4',
    subClientId: 'sc-forge',
    subClientName: 'Forge',
    kind: 'peer_failed',
    message: 'Peer inbox response degraded — switched pool overnight.',
    ago: '2h ago',
    severity: 'warn',
  },
  {
    id: 'al-5',
    subClientId: 'sc-vector',
    subClientName: 'Vector',
    kind: 'mailbox_paused',
    message: 'sales@vector.io paused for ramp-day-3 stabilisation.',
    ago: '3h ago',
    severity: 'warn',
  },
  {
    id: 'al-6',
    subClientId: 'sc-crestwood',
    subClientName: 'Crestwood',
    kind: 'bounce_spike',
    message: 'Brief 2.1% bounce blip — auto-recovered within 30m.',
    ago: '5h ago',
    severity: 'warn',
  },
];

/** Aggregate KPIs derived from the sub-clients (no hand-picked numbers). */
function deriveKpis(subClients: AgencyDashData['subClients']): AgencyDashData['kpis'] {
  const totalMailboxes = subClients.reduce((acc, sc) => acc + sc.mailboxCount, 0);
  // Mailbox-weighted average warmth — a one-mailbox client doesn't pull as
  // hard as an 18-mailbox client. Matches how the backend rolls workspace
  // warmth (sum of per-mailbox warmth / mailbox count, agency edition).
  const weighted = subClients.reduce(
    (acc, sc) => acc + sc.avgWarmth * sc.mailboxCount,
    0,
  );
  const avgWarmth = totalMailboxes > 0 ? Math.round(weighted / totalMailboxes) : 0;
  // "At risk" mailboxes = every mailbox owned by an at_risk sub-client (their
  // mailboxes are all the at-risk one's exposure surface).
  const mailboxesAtRisk = subClients
    .filter((sc) => sc.status === 'at_risk')
    .reduce((acc, sc) => acc + sc.mailboxCount, 0);
  const activeSubClients = subClients.filter((sc) => sc.status !== 'at_risk').length;
  const mrrUsd = subClients.reduce((acc, sc) => acc + sc.monthlyMrrUsd, 0);
  return {
    totalMailboxes,
    avgWarmth,
    mailboxesAtRisk,
    activeSubClients,
    mrrUsd,
    momGrowthPct: 12.4,
  };
}

const MOCK: AgencyDashData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: SUB_CLIENTS.length,
    mailboxCount: SUB_CLIENTS.reduce((acc, sc) => acc + sc.mailboxCount, 0),
  },
  kpis: deriveKpis(SUB_CLIENTS),
  subClients: SUB_CLIENTS,
  alerts: ALERTS,
};

export const AGENCY_DASH_SKELETON_C1: AgencyDashData = MOCK;

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522', // healthy / high-trust
  accent4: '#ffd54f', // warming / caution
  accent3: '#FF9670', // at-risk / danger
  accent2: '#FF8A4B', // info / MRR pulse
  surface2: '#1a1a26',
  border: '#2a2a3a',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

type WarmthTier = 'high' | 'mid' | 'low';

function tier(score: number): WarmthTier {
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

const TIER_HEX: Record<WarmthTier, string> = {
  high: HEX.accent,
  mid: HEX.accent4,
  low: HEX.accent3,
};

const TIER_TEXT: Record<WarmthTier, string> = {
  high: 'text-accent',
  mid: 'text-accent4',
  low: 'text-accent3',
};

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
};

const STATUS_BG: Record<SubClientStatus, string> = {
  healthy: 'bg-accent/10 border-accent/30',
  warming: 'bg-accent4/10 border-accent4/30',
  at_risk: 'bg-accent3/10 border-accent3/30',
};

const ALERT_ICON: Record<AlertKind, typeof AlertTriangle> = {
  mailbox_paused: Inbox,
  bounce_spike: TrendingUp,
  peer_failed: Network,
  dns_break: ShieldAlert,
};

const ALERT_TINT: Record<AlertSeverity, string> = {
  warn: 'text-accent4',
  critical: 'text-accent3',
};

const ALERT_RING: Record<AlertSeverity, string> = {
  warn: 'bg-accent4/10',
  critical: 'bg-accent3/10',
};

/** SVG viewBox space — coordinate system the stage scales to fit. */
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const RING_PRIMARY = 308;
const RING_GUIDE_A = 188;
const RING_GUIDE_B = 408;
const CORE_R = 86;

interface PlacedNode {
  sub: AgencyDashData['subClients'][number];
  x: number;
  y: number;
  /** Outer node radius in viewBox units — scales with mailbox count. */
  r: number;
}

/**
 * Deterministic radial placement on a SINGLE ring of nodes.
 *
 * Nodes are spread evenly with angle = -90deg + index * (360 / count) so the
 * first node sits at the top of the ring and the rest walk clockwise. Node
 * radius scales linearly with mailbox count (clamped 28..52 in viewBox units),
 * which projects to ~40-80px on the rendered stage.
 */
function place(subs: AgencyDashData['subClients']): PlacedNode[] {
  const maxMb = Math.max(...subs.map((s) => s.mailboxCount), 1);
  const minMb = Math.min(...subs.map((s) => s.mailboxCount), 1);
  const span = Math.max(maxMb - minMb, 1);
  return subs.map((sub, i) => {
    const ang = (-90 + (360 / subs.length) * i) * (Math.PI / 180);
    const t = (sub.mailboxCount - minMb) / span; // 0..1
    const r = 28 + t * 24; // 28..52 in viewBox space
    return {
      sub,
      x: CX + RING_PRIMARY * Math.cos(ang),
      y: CY + RING_PRIMARY * Math.sin(ang),
      r,
    };
  });
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function DeltaPill({ delta, suffix = '7d' }: { delta: number; suffix?: string }) {
  const flat = Math.abs(delta) < 0.05;
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? 'text-text-dim'
    : delta > 0
      ? 'text-accent'
      : 'text-accent3';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1)}
      <span className="ml-0.5 text-[10px] text-text-dim">· {suffix}</span>
    </span>
  );
}

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
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgDashC1Orbital(
  { data }: { data?: AgencyDashData } = {},
): JSX.Element {
  const d = data ?? AGENCY_DASH_SKELETON_C1;
  const placed = useMemo(() => place(d.subClients), [d.subClients]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => placed.find((p) => p.sub.id === activeId)?.sub ?? null,
    [placed, activeId],
  );

  const healthyCount = useMemo(
    () => d.subClients.filter((sc) => sc.status === 'healthy').length,
    [d.subClients],
  );
  const totalSubs = d.subClients.length;
  const mrrLabel = `$${d.kpis.mrrUsd.toLocaleString()}`;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Orbit className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Sub-client constellation
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Agency
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            A spatial map of your fleet — the agency core, {totalSubs} sub-client
            nodes in orbit, and their warmth signal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Avg warmth" value={String(d.kpis.avgWarmth)} accent />
          <StatChip label="Healthy" value={`${healthyCount}/${totalSubs}`} />
          <StatChip label="MRR" value={mrrLabel} />
        </div>
      </motion.header>

      {/* Constellation canvas + inspector panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <ConstellationStage
            data={d}
            placed={placed}
            activeId={activeId}
            hoverId={hoverId}
            onSelect={setActiveId}
            onHover={setHoverId}
          />
          <Legend />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            data={d}
            active={active}
            onClose={() => setActiveId(null)}
          />
        </div>
      </motion.div>

      {/* Bottom KPI tile strip */}
      <BottomKpiStrip data={d} />
    </div>
  );
}

export default AgDashC1Orbital;

// ---------------------------------------------------------------------------
// Constellation stage (single-ring orbital SVG scene)
// ---------------------------------------------------------------------------

function ConstellationStage({
  data,
  placed,
  activeId,
  hoverId,
  onSelect,
  onHover,
}: {
  data: AgencyDashData;
  placed: PlacedNode[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Faint radar-screen dot grid */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
      >
        <defs>
          <pattern
            id="agc1-dotgrid"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill={HEX.border} fillOpacity={0.55} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#agc1-dotgrid)" />
      </svg>

      {/* Soft accent bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[64%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent}1f` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Agency sub-client constellation: agency core with sub-client nodes in orbit"
      >
        <defs>
          <radialGradient id="agc1-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.55} />
            <stop offset="55%" stopColor={HEX.accent2} stopOpacity={0.22} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="agc1-core-disc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22223a" stopOpacity={1} />
            <stop offset="100%" stopColor={HEX.surface2} stopOpacity={1} />
          </radialGradient>
          <linearGradient id="agc1-scan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.45} />
          </linearGradient>
        </defs>

        {/* Three concentric guide rings (dashed, low opacity) */}
        {[RING_GUIDE_A, RING_PRIMARY, RING_GUIDE_B].map((r, i) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={HEX.border}
            strokeOpacity={i === 1 ? 0.5 : 0.32}
            strokeWidth={i === 1 ? 1.2 : 1}
            strokeDasharray={i === 1 ? '3 9' : '2 10'}
          />
        ))}

        {/* Sweeping radar scan arc — slow continuous rotation */}
        <motion.g
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - RING_GUIDE_B}
            stroke="url(#agc1-scan)"
            strokeWidth={3}
          />
        </motion.g>

        {/* Connecting lines: core → each sub-client node (drawn-in via pathLength) */}
        {placed.map((p, i) => {
          const focused = activeId === p.sub.id || hoverId === p.sub.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused;
          const stroke = STATUS_HEX[p.sub.status];
          // stroke width encodes mailbox count
          const w = 1 + (p.sub.mailboxCount / 18) * 3;
          return (
            <g key={`l-${p.sub.id}`}>
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0.06 : focused ? 0.78 : 0.25}
                strokeWidth={focused ? w + 1.2 : w}
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: 0.9, delay: 0.12 + i * 0.05, ease: 'easeOut' },
                  opacity: { duration: 0.4, delay: 0.12 + i * 0.05 },
                }}
              />
              {/* Activity-flux dash travelling outward along the wire */}
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0 : 0.85}
                strokeWidth={focused ? 3 : 1.9}
                strokeLinecap="round"
                strokeDasharray="3 60"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -126 }}
                transition={{
                  duration: 2.8 + (i % 5) * 0.45,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}

        {/* Sub-client nodes (orbiting discs) */}
        {placed.map((p, i) => (
          <SubClientNode
            key={p.sub.id}
            placed={p}
            index={i}
            active={activeId === p.sub.id}
            hovered={hoverId === p.sub.id}
            faded={
              (activeId !== null || hoverId !== null) &&
              activeId !== p.sub.id &&
              hoverId !== p.sub.id
            }
            onSelect={() => onSelect(p.sub.id === activeId ? null : p.sub.id)}
            onHover={onHover}
          />
        ))}

        {/* The agency core (centre of the constellation) */}
        <CoreGlyph data={data} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core glyph (centre — the "AGENCY" disc)
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: AgencyDashData }) {
  const mrrLabel = `$${data.kpis.mrrUsd.toLocaleString()}/mo`;
  return (
    <g>
      {/* Outer expanding pulse halo */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.4 }}
        animate={{ scale: 2.2, opacity: 0 }}
        transition={{ duration: 3.8, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Outer soft bloom */}
      <circle cx={CX} cy={CY} r={CORE_R * 1.65} fill="url(#agc1-core)" />
      {/* Core disc */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="url(#agc1-core-disc)"
        stroke={HEX.accent}
        strokeWidth={2}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Inner thin ring */}
      <circle
        cx={CX}
        cy={CY}
        r={CORE_R - 8}
        fill="none"
        stroke={HEX.accent}
        strokeOpacity={0.18}
        strokeWidth={1}
      />
      {/* Eyebrow */}
      <text
        x={CX}
        y={CY - 36}
        textAnchor="middle"
        fill={HEX.textDim}
        style={{
          fontSize: 11,
          letterSpacing: 3,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        AGENCY
      </text>
      {/* Workspace name */}
      <text
        x={CX}
        y={CY - 12}
        textAnchor="middle"
        fill="#e8e8f0"
        style={{ fontSize: 18, fontWeight: 600 }}
      >
        {data.workspace.name}
      </text>
      {/* Big avg warmth value */}
      <text
        x={CX}
        y={CY + 22}
        textAnchor="middle"
        fill={HEX.accent}
        style={{
          fontSize: 36,
          fontWeight: 600,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {data.kpis.avgWarmth}
      </text>
      {/* Sub-line */}
      <text
        x={CX}
        y={CY + 44}
        textAnchor="middle"
        fill={HEX.textDim}
        style={{
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: 0.6,
        }}
      >
        {data.workspace.subClientCount} sub-clients · {mrrLabel}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-client node glyph
// ---------------------------------------------------------------------------

function SubClientNode({
  placed,
  index,
  active,
  hovered,
  faded,
  onSelect,
  onHover,
}: {
  placed: PlacedNode;
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { sub, x, y, r } = placed;
  const color = STATUS_HEX[sub.status];
  const lifted = active || hovered;
  const isAtRisk = sub.status === 'at_risk';

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: faded ? 0.3 : 1,
        scale: 1,
        // gentle outward "lift" toward the viewer on focus
        x: lifted ? (x - CX) * 0.035 : 0,
        y: lifted ? (y - CY) * 0.035 : 0,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: { duration: 0.5, delay: 0.3 + index * 0.06, ease: [0.22, 1, 0.36, 1] },
        x: { duration: 0.3 },
        y: { duration: 0.3 },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name}, warmth ${sub.avgWarmth}, ${sub.mailboxCount} mailboxes, status ${STATUS_LABEL[sub.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
    >
      {/* Gentle vertical bob — alternates phase per node so the ring "breathes" */}
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -4 : 4, 0] }}
        transition={{
          duration: 5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* At-risk pulse ring — only fires for at_risk nodes */}
        {isAtRisk && (
          <motion.circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke={HEX.accent3}
            strokeWidth={2}
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{
              duration: 2.2,
              ease: 'easeOut',
              repeat: Infinity,
            }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {/* Outer focus halo (only on hover/active) */}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 10}
            fill="none"
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        )}
        {/* Soft inner glow */}
        <circle
          cx={x}
          cy={y}
          r={r + 5}
          fill={color}
          fillOpacity={lifted ? 0.24 : 0.14}
        />
        {/* The avatar disc itself */}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.6 : 1.7}
        />
        {/* logoChar — centred avatar text */}
        <text
          x={x}
          y={y + r * 0.28}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.7,
            fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {sub.logoChar}
        </text>
        {/* Label group below the disc — name + warmth chip */}
        <text
          x={x}
          y={y + r + 22}
          textAnchor="middle"
          fill={lifted ? '#e8e8f0' : HEX.textDim}
          style={{
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {sub.name}
        </text>
        {/* Warmth value chip — pill shape under the name */}
        <g>
          <rect
            x={x - 28}
            y={y + r + 30}
            width={56}
            height={18}
            rx={9}
            fill={HEX.surface2}
            stroke={color}
            strokeOpacity={lifted ? 0.55 : 0.32}
            strokeWidth={1}
          />
          <text
            x={x}
            y={y + r + 43}
            textAnchor="middle"
            fill={color}
            style={{
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: 0.4,
            }}
          >
            {sub.avgWarmth} · {sub.mailboxCount}mb
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
  const items: Array<{ tier: WarmthTier; label: string }> = [
    { tier: 'high', label: 'High trust ≥ 75' },
    { tier: 'mid', label: 'Warming 50–74' },
    { tier: 'low', label: 'At risk < 50' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.95 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        <Orbit className="h-3 w-3 text-accent" />
        Warmth tier
      </span>
      {items.map((it) => (
        <span key={it.tier} className="flex items-center gap-2 text-xs text-text">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: TIER_HEX[it.tier] }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <Users className="h-3 w-3 text-accent" />
        Node size = mailbox count
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel (right column — empty state OR selected sub-client detail)
// ---------------------------------------------------------------------------

function InspectorPanel({
  data,
  active,
  onClose,
}: {
  data: AgencyDashData;
  active: AgencyDashData['subClients'][number] | null;
  onClose: () => void;
}) {
  return (
    <div className="relative h-[640px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {active ? (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            // overflow-y-auto inside an overflow-hidden shell: the inner content
            // scrolls while the slide-in/out animation still clips cleanly at
            // the panel edge. overscroll-contain stops page rubber-banding.
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <SubClientDetail
              sub={active}
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
            <NetworkState data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — empty state (no node selected)
// ---------------------------------------------------------------------------

function NetworkState({ data }: { data: AgencyDashData }) {
  const recent = data.alerts.slice(0, 5);
  const healthyCount = data.subClients.filter((sc) => sc.status === 'healthy').length;
  const warmingCount = data.subClients.filter((sc) => sc.status === 'warming').length;
  const atRiskCount = data.subClients.filter((sc) => sc.status === 'at_risk').length;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">Network state</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Select any sub-client node to inspect it.
        </p>
      </header>

      <div className="space-y-3 p-5">
        <OverviewRow
          icon={Inbox}
          label="Total mailboxes"
          value={String(data.kpis.totalMailboxes)}
          sub={`across ${data.workspace.subClientCount} sub-clients`}
        />
        <OverviewRow
          icon={Building2}
          label="Active sub-clients"
          value={`${data.kpis.activeSubClients} / ${data.workspace.subClientCount}`}
          sub={`${healthyCount} healthy · ${warmingCount} warming · ${atRiskCount} at risk`}
        />
        <OverviewRow
          icon={DollarSign}
          label="MRR pulse"
          value={`$${data.kpis.mrrUsd.toLocaleString()}`}
          sub={`MoM +${data.kpis.momGrowthPct.toFixed(1)}% · billing healthy`}
          tone="accent2"
        />
      </div>

      <div className="mt-auto border-t border-white/5 px-5 py-4">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-accent3" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-text-dim">
            Recent alerts
          </span>
          <Badge variant="orange">{data.alerts.length}</Badge>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-border-muted bg-surface-2/40 px-4 py-6 text-center text-xs text-text-dim">
            No active alerts — the fleet is quiet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {recent.map((al) => {
              const Icon = ALERT_ICON[al.kind];
              return (
                <li
                  key={al.id}
                  className="flex items-start gap-3 rounded-xl border border-border-muted bg-surface-2/40 p-3"
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${ALERT_RING[al.severity]} ${ALERT_TINT[al.severity]}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-text">
                        {al.subClientName}
                      </span>
                      <span className="font-mono text-[11px] text-text-faint">
                        {al.ago}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-dim">
                      {al.message}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function OverviewRow({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'text',
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  sub: string;
  tone?: 'text' | 'accent' | 'accent2';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-text';
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border-muted bg-surface-2/40 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-dim">{label}</p>
        <p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${valueTone}`}>
          {value}
        </p>
        <p className="text-xs text-text-dim">{sub}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector — selected sub-client detail
// ---------------------------------------------------------------------------

function SubClientDetail({
  sub,
  data,
  onClose,
}: {
  sub: AgencyDashData['subClients'][number];
  data: AgencyDashData;
  onClose: () => void;
}) {
  const t = tier(sub.avgWarmth);
  const color = STATUS_HEX[sub.status];
  // 7-day delta = last - first trend point
  const first = sub.last7dTrend[0] ?? sub.avgWarmth;
  const last = sub.last7dTrend[sub.last7dTrend.length - 1] ?? sub.avgWarmth;
  const delta7d = last - first;
  // Filter alerts that belong to this sub-client
  const subAlerts = useMemo(
    () => data.alerts.filter((a) => a.subClientId === sub.id),
    [data.alerts, sub.id],
  );

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-mono text-base font-bold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {sub.logoChar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{sub.name}</p>
            <p className="text-xs text-text-dim">
              {sub.mailboxCount} mailboxes · last active {sub.lastActivityAgo}
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

      <div className="flex-1 space-y-4 p-5">
        {/* Warmth headline */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                Warmth
              </p>
              <p
                className="mt-0.5 font-mono text-4xl font-semibold leading-none tabular-nums"
                style={{ color }}
              >
                {sub.avgWarmth}
              </p>
            </div>
            <div className="text-right">
              <DeltaPill delta={delta7d} />
              <span
                className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BG[sub.status]} ${TIER_TEXT[t]}`}
              >
                {STATUS_LABEL[sub.status]}
              </span>
            </div>
          </div>
          {/* Warmth progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${sub.avgWarmth}%` }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* 7-day sparkline (inline SVG) */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-text-dim">
            <Activity className="h-3.5 w-3.5 text-accent" />
            7-day warmth
          </div>
          <MiniSparkline data={sub.last7dTrend} color={color} />
        </div>

        {/* Mailbox + MRR metric pair */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCell
            icon={Inbox}
            label="Mailboxes"
            value={String(sub.mailboxCount)}
            sub="connected"
          />
          <MetricCell
            icon={DollarSign}
            label="Monthly MRR"
            value={`$${sub.monthlyMrrUsd.toLocaleString()}`}
            sub="this billing cycle"
            tone="accent2"
          />
        </div>

        {/* Alerts for this sub-client */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-text-dim">
              <Bell className="h-3.5 w-3.5 text-accent3" />
              Alerts
            </span>
            <span className="font-mono text-xs text-text-faint">
              {subAlerts.length} active
            </span>
          </div>
          {subAlerts.length === 0 ? (
            <p className="rounded-lg border border-border-muted bg-surface px-3 py-4 text-center text-xs text-text-dim">
              No alerts — {sub.name} is quiet.
            </p>
          ) : (
            <ul className="space-y-2">
              {subAlerts.map((al) => {
                const Icon = ALERT_ICON[al.kind];
                return (
                  <li
                    key={al.id}
                    className="flex items-start gap-2.5 rounded-lg border border-border-muted bg-surface px-3 py-2.5"
                  >
                    <span
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${ALERT_RING[al.severity]} ${ALERT_TINT[al.severity]}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider ${ALERT_TINT[al.severity]}`}
                        >
                          {al.severity === 'critical' ? 'Critical' : 'Warn'}
                        </span>
                        <span className="font-mono text-[11px] text-text-faint">
                          {al.ago}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-text">{al.message}</p>
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

function MetricCell({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'text',
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  sub: string;
  tone?: 'text' | 'accent' | 'accent2';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-text';
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={`font-mono text-xl font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
      <p className="text-xs text-text-dim">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini sparkline — inline SVG, no recharts dep needed for 7 points
// ---------------------------------------------------------------------------

function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const W = 240;
  const H = 64;
  if (data.length < 2) {
    return (
      <div className="grid h-[64px] w-full place-items-center text-xs text-text-dim">
        Not enough data
      </div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(max - min, 1);
  const stepX = W / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = H - 6 - ((v - min) / span) * (H - 14);
    return { x, y };
  });
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const firstPt = pts[0]!;
  const lastPt = pts[pts.length - 1]!;
  const areaPath = `${path} L ${lastPt.x.toFixed(1)} ${H} L ${firstPt.x.toFixed(1)} ${H} Z`;
  const gradId = `agc1-spark-${color.replace('#', '')}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-[64px] w-full"
      role="img"
      aria-label="7-day warmth sparkline"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.38} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <motion.path
        d={areaPath}
        fill={`url(#${gradId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      />
      <motion.path
        d={path}
        stroke={color}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.85, ease: 'easeOut' }}
      />
      {/* End marker dot */}
      <circle cx={lastPt.x} cy={lastPt.y} r={3} fill={color} />
      <circle
        cx={lastPt.x}
        cy={lastPt.y}
        r={5}
        fill="none"
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={1}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Bottom KPI tile strip (4 cards under the canvas + panel grid)
// ---------------------------------------------------------------------------

function BottomKpiStrip({ data }: { data: AgencyDashData }) {
  const tiles: Array<{
    icon: typeof Inbox;
    label: string;
    value: string;
    sub: string;
    tone: 'text' | 'accent' | 'accent2' | 'accent3' | 'accent4';
  }> = [
    {
      icon: Inbox,
      label: 'Total mailboxes',
      value: String(data.kpis.totalMailboxes),
      sub: `across ${data.workspace.subClientCount} sub-clients`,
      tone: 'text',
    },
    {
      icon: ShieldAlert,
      label: 'Mailboxes at risk',
      value: String(data.kpis.mailboxesAtRisk),
      sub:
        data.kpis.mailboxesAtRisk === 0
          ? 'fleet is clean'
          : `${Math.round(
              (data.kpis.mailboxesAtRisk / Math.max(data.kpis.totalMailboxes, 1)) * 100,
            )}% of fleet`,
      tone: data.kpis.mailboxesAtRisk > 0 ? 'accent3' : 'accent',
    },
    {
      icon: TrendingUp,
      label: 'MoM growth',
      value: `${data.kpis.momGrowthPct > 0 ? '+' : ''}${data.kpis.momGrowthPct.toFixed(1)}%`,
      sub: `MRR $${data.kpis.mrrUsd.toLocaleString()}`,
      tone: data.kpis.momGrowthPct >= 0 ? 'accent' : 'accent3',
    },
    {
      icon: Bell,
      label: 'Active alerts',
      value: String(data.alerts.length),
      sub: `${data.alerts.filter((a) => a.severity === 'critical').length} critical`,
      tone: data.alerts.some((a) => a.severity === 'critical') ? 'accent3' : 'accent4',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.25 }}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      {tiles.map((tile, i) => (
        <KpiTile key={tile.label} {...tile} index={i} />
      ))}
    </motion.div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  index,
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  sub: string;
  tone: 'text' | 'accent' | 'accent2' | 'accent3' | 'accent4';
  index: number;
}) {
  const TONE_TEXT: Record<typeof tone, string> = {
    text: 'text-text',
    accent: 'text-accent',
    accent2: 'text-accent2',
    accent3: 'text-accent3',
    accent4: 'text-accent4',
  };
  const TONE_RING: Record<typeof tone, string> = {
    text: 'bg-surface-2 text-text-dim',
    accent: 'bg-accent/10 text-accent',
    accent2: 'bg-accent2/10 text-accent2',
    accent3: 'bg-accent3/10 text-accent3',
    accent4: 'bg-accent4/10 text-accent4',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 + index * 0.06, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            {label}
          </p>
          <p
            className={`mt-1.5 font-mono text-2xl font-semibold leading-none tabular-nums ${TONE_TEXT[tone]}`}
          >
            {value}
          </p>
          <p className="mt-1.5 text-xs text-text-dim">{sub}</p>
        </div>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_RING[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </motion.div>
  );
}
