import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  Heart,
  Radio,
  Reply,
  Send,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * AgDashC4Pulse — Agency-tier dashboard #4 (constellation-family), "Pulse Map /
 * Live-Activity Constellation".
 *
 * A single-ring orbital map of the agency's sub-clients, but ALIVE. Every node
 * pulses with its own per-sub-client rhythm derived from its mailbox count, the
 * connecting wires from the core breathe with travelling data packets, and the
 * inspector's empty state is a continuously updating ACTIVITY TICKER rather
 * than static copy. The defining feature of this variant — distinguishing it
 * from C1 (single-ring static), C2 (two concentric rings), and C3 (tri-prong
 * branches) — is constant motion.
 *
 * Layout: page header + 3 LIVE stat chips · main canvas with the orbital ring
 * (lg:col-span-8, ~680px) · activity-ticker inspector (lg:col-span-4) · a
 * bottom rail of four mini "pulse stat" tiles.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Renders only page content; the app shell supplies the chrome. Every value
 * comes from the inline MOCK so the preview harness can mount it prop-less.
 */

// ---------------------------------------------------------------------------
// Data shapes
// Shape duplicated across all 4 Agency dashboard variants — keep in sync.
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
// MOCK data — Northwind Agency, 9 sub-clients, internally-consistent KPIs.
// 6 healthy · 2 warming · 1 at-risk. Mailbox counts vary so each node has a
// different pulse cadence on the canvas.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyDashData['subClients'] = [
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'LL',
    mailboxCount: 14,
    avgWarmth: 88,
    status: 'healthy',
    last7dTrend: [80, 82, 83, 85, 86, 87, 88],
    monthlyMrrUsd: 720,
    lastActivityAgo: '12s ago',
  },
  {
    id: 'sc-aria',
    name: 'Aria Studio',
    logoChar: 'AR',
    mailboxCount: 18,
    avgWarmth: 91,
    status: 'healthy',
    last7dTrend: [85, 86, 88, 89, 90, 91, 91],
    monthlyMrrUsd: 900,
    lastActivityAgo: '24s ago',
  },
  {
    id: 'sc-acme',
    name: 'Acme Outreach',
    logoChar: 'AC',
    mailboxCount: 9,
    avgWarmth: 76,
    status: 'healthy',
    last7dTrend: [72, 73, 73, 74, 75, 75, 76],
    monthlyMrrUsd: 450,
    lastActivityAgo: '38s ago',
  },
  {
    id: 'sc-bramble',
    name: 'Bramble & Co',
    logoChar: 'BC',
    mailboxCount: 6,
    avgWarmth: 62,
    status: 'warming',
    last7dTrend: [48, 52, 55, 57, 59, 61, 62],
    monthlyMrrUsd: 300,
    lastActivityAgo: '1m ago',
  },
  {
    id: 'sc-vela',
    name: 'Vela Ventures',
    logoChar: 'VV',
    mailboxCount: 22,
    avgWarmth: 84,
    status: 'healthy',
    last7dTrend: [79, 80, 81, 82, 83, 84, 84],
    monthlyMrrUsd: 1080,
    lastActivityAgo: '6s ago',
  },
  {
    id: 'sc-pivot',
    name: 'Pivot Sales',
    logoChar: 'PS',
    mailboxCount: 4,
    avgWarmth: 41,
    status: 'at_risk',
    last7dTrend: [55, 53, 50, 48, 45, 43, 41],
    monthlyMrrUsd: 200,
    lastActivityAgo: '4m ago',
  },
  {
    id: 'sc-orbit',
    name: 'Orbit Reply',
    logoChar: 'OR',
    mailboxCount: 11,
    avgWarmth: 81,
    status: 'healthy',
    last7dTrend: [76, 77, 78, 79, 80, 80, 81],
    monthlyMrrUsd: 540,
    lastActivityAgo: '18s ago',
  },
  {
    id: 'sc-quill',
    name: 'Quill & Quartz',
    logoChar: 'QQ',
    mailboxCount: 7,
    avgWarmth: 58,
    status: 'warming',
    last7dTrend: [44, 47, 50, 52, 54, 56, 58],
    monthlyMrrUsd: 360,
    lastActivityAgo: '52s ago',
  },
  {
    id: 'sc-helio',
    name: 'Helio Mail',
    logoChar: 'HM',
    mailboxCount: 16,
    avgWarmth: 87,
    status: 'healthy',
    last7dTrend: [82, 83, 84, 85, 86, 86, 87],
    monthlyMrrUsd: 820,
    lastActivityAgo: '8s ago',
  },
];

const TOTAL_MBX = SUB_CLIENTS.reduce((s, c) => s + c.mailboxCount, 0);
const AVG_WARMTH = Math.round(
  SUB_CLIENTS.reduce((s, c) => s + c.avgWarmth * c.mailboxCount, 0) / TOTAL_MBX,
);
const AT_RISK_MBX = SUB_CLIENTS.filter((c) => c.status === 'at_risk').reduce(
  (s, c) => s + c.mailboxCount,
  0,
);
const ACTIVE_SC = SUB_CLIENTS.filter((c) => c.status !== 'at_risk').length;
const MRR = SUB_CLIENTS.reduce((s, c) => s + c.monthlyMrrUsd, 0);

export const AGENCY_DASH_SKELETON_C4: AgencyDashData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: SUB_CLIENTS.length,
    mailboxCount: TOTAL_MBX,
  },
  kpis: {
    totalMailboxes: TOTAL_MBX,
    avgWarmth: AVG_WARMTH,
    mailboxesAtRisk: AT_RISK_MBX,
    activeSubClients: ACTIVE_SC,
    mrrUsd: MRR,
    momGrowthPct: 11.4,
  },
  subClients: SUB_CLIENTS,
  alerts: [
    {
      id: 'al-1',
      subClientId: 'sc-pivot',
      subClientName: 'Pivot Sales',
      kind: 'mailbox_paused',
      message: '2 mailboxes paused — bounce-rate ceiling tripped',
      ago: '4m ago',
      severity: 'critical',
    },
    {
      id: 'al-2',
      subClientId: 'sc-pivot',
      subClientName: 'Pivot Sales',
      kind: 'dns_break',
      message: 'DMARC failing on outbound.pivot-sales.io',
      ago: '11m ago',
      severity: 'critical',
    },
    {
      id: 'al-3',
      subClientId: 'sc-bramble',
      subClientName: 'Bramble & Co',
      kind: 'bounce_spike',
      message: 'Bounce rate 4.1% — investigate list hygiene',
      ago: '38m ago',
      severity: 'warn',
    },
    {
      id: 'al-4',
      subClientId: 'sc-quill',
      subClientName: 'Quill & Quartz',
      kind: 'peer_failed',
      message: '3 peer inboxes dropped — pool reshuffled',
      ago: '1h ago',
      severity: 'warn',
    },
    {
      id: 'al-5',
      subClientId: 'sc-acme',
      subClientName: 'Acme Outreach',
      kind: 'bounce_spike',
      message: 'Bounce blip on sales@acme.io — back to baseline',
      ago: '2h ago',
      severity: 'warn',
    },
    {
      id: 'al-6',
      subClientId: 'sc-pivot',
      subClientName: 'Pivot Sales',
      kind: 'peer_failed',
      message: 'Peer rotation flagged 5 low-rep inboxes',
      ago: '3h ago',
      severity: 'warn',
    },
  ],
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

// Mirrors tailwind.config.ts color tokens so inline-SVG fills/strokes match
// the className-driven colors. `accent` is the workspace orange (set via the
// --wp-accent CSS var; falls back to the brand orange); accent2 is orange-2
// (the LIVE accent), accent3 red, accent4 yellow.
const HEX = {
  accent: '#F26522', // healthy / replies (workspace orange)
  accent2: '#FF8A4B', // activity / sends — the LIVE accent (orange-2)
  accent3: '#FF9670', // at-risk / alerts
  accent4: '#ffd54f', // warming / warnings
  surface: '#12121a',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  textDim: '#8888a0',
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

const ALERT_LABEL: Record<AlertKind, string> = {
  mailbox_paused: 'Mailbox paused',
  bounce_spike: 'Bounce spike',
  peer_failed: 'Peer failed',
  dns_break: 'DNS break',
};

/** ViewBox space — a fixed coordinate system the stage scales to fit. */
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const RING_R = 320;
const CORE_R = 90;

interface Placed {
  sub: AgencyDashData['subClients'][number];
  x: number;
  y: number;
  /** Node radius scaled by mailbox count. */
  r: number;
  /** Pulse cadence in seconds — lower mailbox count = slower pulse. */
  pulseDuration: number;
  /** Per-node phase offset so the ring doesn't pulse in lockstep. */
  phaseDelay: number;
  /** Number of data packets travelling the core→node wire. */
  packetCount: number;
  /** Wire packet cadence in seconds. */
  packetDuration: number;
}

/**
 * Single-ring placement: 9 nodes spread evenly starting from the top
 * (`-90deg`), each node sized by mailbox count and pulse-cadence derived from
 * mailbox count (more mailboxes = faster pulse). At-risk nodes pulse faster +
 * more dramatically so the eye lands on them first.
 */
function place(subs: AgencyDashData['subClients']): Placed[] {
  const maxMbx = Math.max(...subs.map((s) => s.mailboxCount), 1);
  return subs.map((sub, i) => {
    const ang = (-90 + (360 / subs.length) * i) * (Math.PI / 180);
    const vol = sub.mailboxCount / maxMbx; // 0..1
    const r = 26 + vol * 20;
    // Pulse cadence: bigger fleet => faster heartbeat. At-risk override: fast +
    // urgent regardless of size.
    let pulseDuration = 3.6 - vol * 1.6; // 2.0–3.6s
    if (sub.status === 'at_risk') pulseDuration = 1.4;
    // Stagger phase so nodes don't sync — derived from index for determinism.
    const phaseDelay = (i / subs.length) * pulseDuration;
    // Data packets per wire: 2 baseline + scaled by mailbox volume.
    const packetCount = 2 + Math.round(vol * 2);
    const packetDuration = 2.4 + (1 - vol) * 1.6; // 2.4–4.0s
    return {
      sub,
      x: CX + RING_R * Math.cos(ang),
      y: CY + RING_R * Math.sin(ang),
      r,
      pulseDuration,
      phaseDelay,
      packetCount,
      packetDuration,
    };
  });
}

/**
 * Synthesised sends-per-minute for a sub-client — proportional to mailbox
 * count weighted by status. Used by the inspector pulse panel + ticker.
 */
function sendsPerMinute(sub: AgencyDashData['subClients'][number]): number {
  const weight =
    sub.status === 'healthy' ? 1.0 : sub.status === 'warming' ? 0.55 : 0.25;
  return Math.max(1, Math.round(sub.mailboxCount * 1.4 * weight));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgDashC4Pulse({
  data,
}: {
  data?: AgencyDashData;
} = {}): JSX.Element {
  const d = data ?? AGENCY_DASH_SKELETON_C4;
  const placed = useMemo(() => place(d.subClients), [d.subClients]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => placed.find((p) => p.sub.id === activeId)?.sub ?? null,
    [placed, activeId],
  );

  // Derived "live" stats for the header chips.
  const fleetSendsPerMin = useMemo(
    () => d.subClients.reduce((s, c) => s + sendsPerMinute(c), 0),
    [d.subClients],
  );
  const activeMailboxes = useMemo(
    () => d.kpis.totalMailboxes - d.kpis.mailboxesAtRisk,
    [d.kpis],
  );

  // Bottom-rail derived stats (mocked, internally consistent).
  const totalSendsToday = useMemo(
    () => fleetSendsPerMin * 60 * 6, // ~6 active hours of cadence
    [fleetSendsPerMin],
  );
  const totalRepliesToday = Math.round(totalSendsToday * 0.36);
  const activePeers = 1240; // matches the peer-pool spec language

  return (
    <div className="space-y-5">
      <PageHeader
        d={d}
        fleetSendsPerMin={fleetSendsPerMin}
        activeMailboxes={activeMailboxes}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <PulseStage
            data={d}
            placed={placed}
            activeId={activeId}
            hoverId={hoverId}
            onSelect={setActiveId}
            onHover={setHoverId}
          />
          <PulseLegend />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            sub={active}
            onClose={() => setActiveId(null)}
            data={d}
          />
        </div>
      </motion.div>

      <BottomRail
        sendsToday={totalSendsToday}
        repliesToday={totalRepliesToday}
        activePeers={activePeers}
        atRiskAlerts={d.alerts.filter((a) => a.severity === 'critical').length}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header
// ---------------------------------------------------------------------------

function PageHeader({
  d,
  fleetSendsPerMin,
  activeMailboxes,
}: {
  d: AgencyDashData;
  fleetSendsPerMin: number;
  activeMailboxes: number;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
            <Radio className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            Pulse map
          </h1>
          <Badge variant="blue">
            <Building2 className="h-3 w-3" />
            Agency
          </Badge>
          {/* LIVE indicator with breathing dot */}
          <span className="ml-1 flex items-center gap-1.5 rounded-full border border-accent2/30 bg-accent2/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent2">
            <motion.span
              className="block h-1.5 w-1.5 rounded-full bg-accent2"
              animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
            />
            Live
          </span>
        </div>
        <p className="text-sm text-text-dim">
          Real-time view of fleet activity — each sub-client pulses with its own
          send + reply rhythm.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatChip label="Avg warmth" value={String(d.kpis.avgWarmth)} accent />
        <StatChip
          label="MBX active"
          value={`${activeMailboxes}/${d.kpis.totalMailboxes}`}
        />
        <StatChip
          label="Sends/min"
          value={String(fleetSendsPerMin)}
          live
        />
      </div>
    </motion.header>
  );
}

function StatChip({
  label,
  value,
  accent,
  live,
}: {
  label: string;
  value: string;
  accent?: boolean;
  live?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs backdrop-blur-xl">
      {live && (
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-accent2"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
      <span className="text-text-dim">{label}</span>
      <span
        className={`font-mono font-semibold tabular-nums ${
          accent ? 'text-accent' : live ? 'text-accent2' : 'text-text'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pulse stage — the canvas
// ---------------------------------------------------------------------------

function PulseStage({
  data,
  placed,
  activeId,
  hoverId,
  onSelect,
  onHover,
}: {
  data: AgencyDashData;
  placed: Placed[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[680px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(rgba(120,140,180,0.18) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Soft cyan bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[52%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent2}1c` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Pulse map: fleet core with sub-client nodes pulsing on a single orbit"
      >
        <defs>
          <radialGradient id="c4-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.85} />
            <stop offset="55%" stopColor={HEX.accent2} stopOpacity={0.28} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Single orbit guide ring */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R}
          fill="none"
          stroke={HEX.border}
          strokeWidth={1}
          strokeDasharray="2 7"
        />
        {/* Subtle inner guide */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R * 0.55}
          fill="none"
          stroke={HEX.border}
          strokeOpacity={0.45}
          strokeWidth={1}
          strokeDasharray="1 9"
        />

        {/* Connecting wires + travelling data packets */}
        {placed.map((p) => (
          <WireWithPackets
            key={`w-${p.sub.id}`}
            placed={p}
            focused={activeId === p.sub.id || hoverId === p.sub.id}
            dimmed={
              (activeId !== null || hoverId !== null) &&
              activeId !== p.sub.id &&
              hoverId !== p.sub.id
            }
          />
        ))}

        {/* Sub-client nodes */}
        {placed.map((p, i) => (
          <NodeGlyph
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
            onSelect={() =>
              onSelect(p.sub.id === activeId ? null : p.sub.id)
            }
            onHover={onHover}
          />
        ))}

        {/* The fleet core */}
        <CoreGlyph data={data} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connecting wire with travelling data packets
// Two cyan "send" packets travel core→node, one accent-green "reply" packet
// travels node→core. Higher-volume nodes (more mailboxes) get more packets.
// ---------------------------------------------------------------------------

function WireWithPackets({
  placed,
  focused,
  dimmed,
}: {
  placed: Placed;
  focused: boolean;
  dimmed: boolean;
}) {
  const { x, y, sub, packetCount, packetDuration } = placed;
  const color = STATUS_HEX[sub.status];

  // Build N evenly-spaced packets travelling core→node, plus one reply packet
  // going the other way. Cyan packets = outbound sends; green = inbound reply.
  const sendPackets = Array.from({ length: packetCount }, (_, i) => ({
    delay: (i / packetCount) * packetDuration,
    radius: 4 + (i === 0 ? 1 : 0),
  }));

  return (
    <g>
      {/* Base wire — static stroke, status-coloured. */}
      <line
        x1={CX}
        y1={CY}
        x2={x}
        y2={y}
        stroke={color}
        strokeOpacity={dimmed ? 0.05 : focused ? 0.55 : 0.18}
        strokeWidth={focused ? 2.6 : 1.6}
        strokeLinecap="round"
      />

      {/* Send packets (cyan): core → node */}
      {!dimmed &&
        sendPackets.map((pkt, i) => (
          <motion.circle
            key={`s-${i}`}
            r={pkt.radius}
            fill={HEX.accent2}
            opacity={focused ? 1 : 0.85}
            initial={{ cx: CX, cy: CY }}
            animate={{ cx: [CX, x], cy: [CY, y] }}
            transition={{
              duration: packetDuration,
              ease: 'linear',
              repeat: Infinity,
              delay: pkt.delay,
              times: [0, 1],
            }}
          />
        ))}

      {/* Reply packet (accent-green): node → core, slower cadence */}
      {!dimmed && (
        <motion.circle
          r={3.5}
          fill={HEX.accent}
          opacity={focused ? 1 : 0.7}
          initial={{ cx: x, cy: y }}
          animate={{ cx: [x, CX], cy: [y, CY] }}
          transition={{
            duration: packetDuration * 1.6,
            ease: 'linear',
            repeat: Infinity,
            delay: packetDuration * 0.4,
            times: [0, 1],
          }}
        />
      )}

      {/* For at-risk nodes only — a small accent3 "warning packet" */}
      {!dimmed && sub.status === 'at_risk' && (
        <motion.circle
          r={3}
          fill={HEX.accent3}
          opacity={0.9}
          initial={{ cx: x, cy: y }}
          animate={{ cx: [x, CX], cy: [y, CY] }}
          transition={{
            duration: packetDuration * 0.7,
            ease: 'linear',
            repeat: Infinity,
            delay: 0.3,
            times: [0, 1],
          }}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Core glyph — the fleet centre
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: AgencyDashData }) {
  return (
    <g>
      {/* Continuous radial pulse ring — the heartbeat of the whole fleet. */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.55 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{ duration: 2.6, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Second offset pulse so the core feels like it has rhythm. */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={1.6}
        initial={{ scale: 1, opacity: 0.4 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{
          duration: 2.6,
          ease: 'easeOut',
          repeat: Infinity,
          delay: 1.3,
        }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />

      <circle cx={CX} cy={CY} r={CORE_R * 1.65} fill="url(#c4-core)" />

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
        y={CY - 24}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 12, letterSpacing: 2.4, fontWeight: 600 }}
      >
        FLEET
      </text>
      <text
        x={CX}
        y={CY - 2}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 16, fontWeight: 600 }}
      >
        {data.workspace.name}
      </text>
      <text
        x={CX}
        y={CY + 24}
        textAnchor="middle"
        className="fill-accent2"
        style={{
          fontSize: 24,
          fontWeight: 600,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {data.kpis.totalMailboxes} MBX
      </text>
      <text
        x={CX}
        y={CY + 46}
        textAnchor="middle"
        className="fill-text-dim"
        style={{
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        ${data.kpis.mrrUsd.toLocaleString()}/mo
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-client node glyph — pulses with its own rhythm.
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
  const { sub, x, y, r, pulseDuration, phaseDelay } = placed;
  const color = STATUS_HEX[sub.status];
  const lifted = active || hovered;
  const atRisk = sub.status === 'at_risk';

  // Pulse intensity: at-risk pushes harder + faster.
  const pulseScale = atRisk ? 2.2 : 1.7;
  const pulseOpacity = atRisk ? 0.65 : 0.5;

  // Label vertical offset (so text sits below the node + its pulse ring).
  const labelY = y + r + 26;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: faded ? 0.34 : 1,
        scale: 1,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: {
          duration: 0.5,
          delay: 0.25 + index * 0.05,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name} — ${sub.mailboxCount} mailboxes, status ${sub.status}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
    >
      {/* Continuous per-node pulse ring — the defining "alive" effect. */}
      <motion.circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={atRisk ? 2.2 : 1.6}
        initial={{ scale: 1, opacity: pulseOpacity }}
        animate={{ scale: pulseScale, opacity: 0 }}
        transition={{
          duration: pulseDuration,
          ease: 'easeOut',
          repeat: Infinity,
          delay: phaseDelay,
        }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />
      {/* Second, offset pulse — the "double beat". */}
      <motion.circle
        cx={x}
        cy={y}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={atRisk ? 1.8 : 1.3}
        strokeOpacity={0.5}
        initial={{ scale: 1, opacity: pulseOpacity * 0.7 }}
        animate={{ scale: pulseScale * 0.85, opacity: 0 }}
        transition={{
          duration: pulseDuration,
          ease: 'easeOut',
          repeat: Infinity,
          delay: phaseDelay + pulseDuration * 0.5,
        }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />

      {/* Hover/active outer ring */}
      {lifted && (
        <circle
          cx={x}
          cy={y}
          r={r + 10}
          fill="none"
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={1.5}
        />
      )}

      {/* Soft glow halo */}
      <circle
        cx={x}
        cy={y}
        r={r + 4}
        fill={color}
        fillOpacity={lifted ? 0.24 : 0.12}
      />

      {/* The node disc */}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={HEX.surface2}
        stroke={color}
        strokeWidth={lifted ? 2.6 : 1.8}
      />

      {/* Logo char inside */}
      <text
        x={x}
        y={y + r * 0.18}
        textAnchor="middle"
        fill={color}
        style={{ fontSize: r * 0.62, fontWeight: 700 }}
      >
        {sub.logoChar}
      </text>

      {/* Name below */}
      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {sub.name}
      </text>
      {/* Warmth chip below name */}
      <g>
        <rect
          x={x - 36}
          y={labelY + 8}
          width={72}
          height={20}
          rx={10}
          fill={`${color}`}
          fillOpacity={0.14}
          stroke={color}
          strokeOpacity={0.5}
          strokeWidth={1}
        />
        <text
          x={x}
          y={labelY + 22}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {sub.avgWarmth} · {sub.mailboxCount}mbx
        </text>
      </g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Legend — overlaid bottom-left
// ---------------------------------------------------------------------------

function PulseLegend() {
  const items: Array<{ status: SubClientStatus; label: string }> = [
    { status: 'healthy', label: 'Healthy ≥ 75' },
    { status: 'warming', label: 'Warming 50–74' },
    { status: 'at_risk', label: 'At risk < 50' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.9 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-text-dim">
        <Heart className="h-3 w-3 text-accent2" />
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
        <Activity className="h-3 w-3 text-accent2" />
        Pulse rate = activity intensity
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector panel — Activity ticker (empty state) / sub-client pulse
// ---------------------------------------------------------------------------

function InspectorPanel({
  sub,
  onClose,
  data,
}: {
  sub: AgencyDashData['subClients'][number] | null;
  onClose: () => void;
  data: AgencyDashData;
}) {
  return (
    <div className="relative h-[680px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {sub ? (
          <motion.div
            key={sub.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <SubClientPulsePanel sub={sub} alerts={data.alerts} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div
            key="ticker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col"
          >
            <ActivityTicker data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity ticker (empty state)
// ---------------------------------------------------------------------------

type TickerEventKind = 'send' | 'reply' | 'engagement' | 'alert';

interface TickerEvent {
  id: string;
  kind: TickerEventKind;
  subClientName: string;
  message: string;
  timestamp: string;
}

const TICKER_EVENTS: TickerEvent[] = [
  {
    id: 'ev-1',
    kind: 'send',
    subClientName: 'Aria Studio',
    message: 'founder@aria.studio → peer pool',
    timestamp: '12:38:42',
  },
  {
    id: 'ev-2',
    kind: 'reply',
    subClientName: 'Lumen Labs',
    message: 'peer reply landed inbox · sales@lumen.io',
    timestamp: '12:38:31',
  },
  {
    id: 'ev-3',
    kind: 'send',
    subClientName: 'Vela Ventures',
    message: 'partners@vela.vc → peer pool',
    timestamp: '12:38:18',
  },
  {
    id: 'ev-4',
    kind: 'engagement',
    subClientName: 'Helio Mail',
    message: 'thread starred by peer · 3 engagements',
    timestamp: '12:38:04',
  },
  {
    id: 'ev-5',
    kind: 'alert',
    subClientName: 'Pivot Sales',
    message: 'mailbox paused — bounce ceiling',
    timestamp: '12:37:51',
  },
  {
    id: 'ev-6',
    kind: 'send',
    subClientName: 'Orbit Reply',
    message: 'demo@orbit.reply → peer pool',
    timestamp: '12:37:39',
  },
  {
    id: 'ev-7',
    kind: 'reply',
    subClientName: 'Acme Outreach',
    message: 'spam-rescue triggered · success@acme',
    timestamp: '12:37:22',
  },
  {
    id: 'ev-8',
    kind: 'engagement',
    subClientName: 'Bramble & Co',
    message: 'peer opened thread · 2 engagements',
    timestamp: '12:37:08',
  },
  {
    id: 'ev-9',
    kind: 'send',
    subClientName: 'Quill & Quartz',
    message: 'editor@quill.studio → peer pool',
    timestamp: '12:36:55',
  },
  {
    id: 'ev-10',
    kind: 'reply',
    subClientName: 'Aria Studio',
    message: 'peer reply landed inbox · hello@aria',
    timestamp: '12:36:41',
  },
  {
    id: 'ev-11',
    kind: 'engagement',
    subClientName: 'Vela Ventures',
    message: 'thread starred by peer · 4 engagements',
    timestamp: '12:36:24',
  },
  {
    id: 'ev-12',
    kind: 'send',
    subClientName: 'Helio Mail',
    message: 'team@helio.com → peer pool',
    timestamp: '12:36:09',
  },
];

const TICKER_ICON: Record<TickerEventKind, typeof Send> = {
  send: Send,
  reply: Reply,
  engagement: Heart,
  alert: AlertTriangle,
};

const TICKER_COLOR: Record<TickerEventKind, string> = {
  send: 'text-accent2',
  reply: 'text-accent',
  engagement: 'text-accent4',
  alert: 'text-accent3',
};

const TICKER_BG: Record<TickerEventKind, string> = {
  send: 'bg-accent2/10 border-accent2/25',
  reply: 'bg-accent/10 border-accent/25',
  engagement: 'bg-accent4/10 border-accent4/25',
  alert: 'bg-accent3/10 border-accent3/25',
};

function ActivityTicker({ data }: { data: AgencyDashData }) {
  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-accent2" />
          <h2 className="text-base font-semibold text-text">Activity ticker</h2>
          <span className="flex items-center gap-1.5 rounded-full border border-accent2/30 bg-accent2/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent2">
            <motion.span
              className="block h-1.5 w-1.5 rounded-full bg-accent2"
              animate={{ opacity: [1, 0.25, 1], scale: [1, 1.4, 1] }}
              transition={{
                duration: 1.4,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
            Live
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {data.workspace.subClientCount} clients
        </span>
      </header>

      <p className="px-5 pt-3 text-xs text-text-dim">
        Streaming sends, replies and peer engagement from across the fleet.
        Click a node on the canvas to inspect a single sub-client.
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
        <AnimatePresence initial={false}>
          {TICKER_EVENTS.map((ev, i) => (
            <motion.div
              key={ev.id}
              layout
              initial={{ opacity: 0, x: 14, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{
                duration: 0.35,
                delay: i * 0.04,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`flex items-start gap-2.5 rounded-xl border ${TICKER_BG[ev.kind]} px-3 py-2.5`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 ${TICKER_COLOR[ev.kind]}`}
              >
                <TickerIcon kind={ev.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-text">
                    {ev.subClientName}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-dim">
                    {ev.timestamp}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-text-dim">
                  {ev.message}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-white/5 px-5 py-3 text-[11px] text-text-dim">
        <span className="flex items-center gap-1.5">
          <Wifi className="h-3 w-3 text-accent2" />
          Stream feed · auto-scrolling
        </span>
      </div>
    </>
  );
}

function TickerIcon({ kind }: { kind: TickerEventKind }) {
  const Icon = TICKER_ICON[kind];
  return <Icon className="h-3.5 w-3.5" />;
}

// ---------------------------------------------------------------------------
// Sub-client pulse panel (selected node)
// ---------------------------------------------------------------------------

function SubClientPulsePanel({
  sub,
  alerts,
  onClose,
}: {
  sub: AgencyDashData['subClients'][number];
  alerts: AgencyDashData['alerts'];
  onClose: () => void;
}) {
  const color = STATUS_HEX[sub.status];
  const spm = sendsPerMinute(sub);
  const subAlerts = alerts.filter((a) => a.subClientId === sub.id);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-base font-semibold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {sub.logoChar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {sub.name}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-text-dim">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full`}
                style={{ background: color }}
                aria-hidden
              />
              <span className={STATUS_TEXT[sub.status]}>
                {STATUS_LABEL[sub.status]}
              </span>
              <span>·</span>
              <span>{sub.lastActivityAgo}</span>
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
        {/* Live sends/min headline — with a continuous pulse on the value. */}
        <div className="rounded-xl border border-accent2/30 bg-accent2/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-text-dim">
              <motion.span
                className="block h-1.5 w-1.5 rounded-full bg-accent2"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{
                  duration: 1.2,
                  ease: 'easeInOut',
                  repeat: Infinity,
                }}
              />
              Sends per minute
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent2">
              Live
            </span>
          </div>
          <motion.p
            className="mt-1.5 font-mono text-4xl font-semibold tabular-nums leading-none text-accent2"
            animate={{ opacity: [1, 0.75, 1], scale: [1, 1.015, 1] }}
            transition={{
              duration: 2.2,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          >
            {spm}
          </motion.p>
          <p className="mt-1.5 text-xs text-text-dim">
            cadence across {sub.mailboxCount} mailbox{sub.mailboxCount === 1 ? '' : 'es'}
          </p>
        </div>

        {/* Inline metrics grid */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCell
            label="Avg warmth"
            value={String(sub.avgWarmth)}
            sub={STATUS_LABEL[sub.status]}
            valueClass={STATUS_TEXT[sub.status]}
          />
          <MetricCell
            label="Mailboxes"
            value={String(sub.mailboxCount)}
            sub="in fleet"
          />
          <MetricCell
            label="MRR"
            value={`$${sub.monthlyMrrUsd.toLocaleString()}`}
            sub="this month"
          />
          <MetricCell
            label="Last activity"
            value={sub.lastActivityAgo}
            sub="signal seen"
          />
        </div>

        {/* 7-day micro sparkline drawn as a tiny SVG */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-text-dim">
            <Activity className="h-3 w-3 text-accent2" />
            Warmth · 7d
          </p>
          <MiniSpark values={sub.last7dTrend} color={color} />
        </div>

        {/* Alerts for this sub-client */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-text-dim">
              <Bell className="h-3 w-3 text-accent3" />
              Alerts
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              {subAlerts.length} active
            </span>
          </div>
          {subAlerts.length === 0 ? (
            <p className="text-xs text-text-dim">
              No active alerts. Pulse is steady.
            </p>
          ) : (
            <ul className="space-y-2">
              {subAlerts.map((al) => (
                <li
                  key={al.id}
                  className="flex items-start gap-2 rounded-lg border border-border-muted bg-surface px-3 py-2"
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${al.severity === 'critical' ? 'bg-accent3/15 text-accent3' : 'bg-accent4/15 text-accent4'}`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-text">
                      <span>{ALERT_LABEL[al.kind]}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                        {al.ago}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-dim">
                      {al.message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function MetricCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-text-dim">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${valueClass ?? 'text-text'}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-text-dim">{sub}</p>
    </div>
  );
}

function MiniSpark({ values, color }: { values: number[]; color: string }) {
  const w = 260;
  const h = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });
  const d = pts
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ');
  const dFill = `${d} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
    >
      <defs>
        <linearGradient id="c4-mini-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={dFill} fill="url(#c4-mini-spark)" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} />
      {last && <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail — 4 mini pulse-stat tiles
// ---------------------------------------------------------------------------

function BottomRail({
  sendsToday,
  repliesToday,
  activePeers,
  atRiskAlerts,
}: {
  sendsToday: number;
  repliesToday: number;
  activePeers: number;
  atRiskAlerts: number;
}) {
  const tiles = [
    {
      key: 'sends',
      icon: Send,
      label: 'Sends · today',
      value: sendsToday.toLocaleString(),
      accentClass: 'text-accent2',
      bg: 'bg-accent2/10',
      border: 'border-accent2/25',
      dotHex: HEX.accent2,
    },
    {
      key: 'replies',
      icon: Reply,
      label: 'Replies · today',
      value: repliesToday.toLocaleString(),
      accentClass: 'text-accent',
      bg: 'bg-accent/10',
      border: 'border-accent/25',
      dotHex: HEX.accent,
    },
    {
      key: 'peers',
      icon: Users,
      label: 'Active peers',
      value: activePeers.toLocaleString(),
      accentClass: 'text-text',
      bg: 'bg-surface-2',
      border: 'border-border-muted',
      dotHex: HEX.textDim,
    },
    {
      key: 'alerts',
      icon: AlertTriangle,
      label: 'At-risk alerts',
      value: String(atRiskAlerts),
      accentClass: 'text-accent3',
      bg: 'bg-accent3/10',
      border: 'border-accent3/25',
      dotHex: HEX.accent3,
    },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.4 }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {tiles.map((t, i) => (
        <PulseTile
          key={t.key}
          icon={t.icon}
          label={t.label}
          value={t.value}
          accentClass={t.accentClass}
          bg={t.bg}
          border={t.border}
          dotHex={t.dotHex}
          delay={0.5 + i * 0.08}
        />
      ))}
    </motion.div>
  );
}

function PulseTile({
  icon: Icon,
  label,
  value,
  accentClass,
  bg,
  border,
  dotHex,
  delay,
}: {
  icon: typeof Send;
  label: string;
  value: string;
  accentClass: string;
  bg: string;
  border: string;
  dotHex: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
      className={`relative overflow-hidden rounded-2xl border ${border} ${bg} px-4 py-3.5 backdrop-blur-xl`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`grid h-8 w-8 place-items-center rounded-lg bg-surface ${accentClass}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <motion.span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dotHex }}
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
        />
      </div>
      <p className="mt-2.5 text-[11px] uppercase tracking-[0.18em] text-text-dim">
        {label}
      </p>
      {/* One-shot pulse on mount to give the value a "data just landed" feel. */}
      <motion.p
        className={`mt-0.5 font-mono text-2xl font-semibold tabular-nums ${accentClass}`}
        initial={{ scale: 0.92, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
      >
        {value}
      </motion.p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Default export for harness convenience.
// ---------------------------------------------------------------------------

export default AgDashC4Pulse;
