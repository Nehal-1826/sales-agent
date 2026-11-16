import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Network,
  Orbit,
  Radar,
  Radio,
  ShieldCheck,
  Sparkles,
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
import { formatNumber } from '@/lib/format';

/**
 * ProPlusDashN3Constellation — "Network Constellation" Pro-Plus dashboard.
 *
 * NOT a card/grid/list/cockpit/editorial layout. This is a single SPATIAL
 * node-graph visualization of the warmup network rendered as one SVG scene:
 *
 *   - The WORKSPACE CORE pulses at the centre of a fixed-height stage.
 *   - The 15 mailboxes are NODES placed on two concentric orbits via pure
 *     radial trig (angle = index step), sized by send volume and tinted by
 *     warmth tier, each tethered to the core by a connection line whose
 *     stroke width + animated dash flux encodes live activity.
 *   - Two Pro-Plus SIGNAL-SOURCE nodes (Google Postmaster + Microsoft SNDS)
 *     sit on a feeder axis and pipe signal into the core (the moat).
 *   - An OUTER ARC RING represents the peer-inbox network enclosing it all,
 *     with a continuously sweeping radar scan arc passing over the nodes.
 *   - Clicking / focusing a mailbox node slides in a side DETAIL PANEL with
 *     that mailbox's warmth, ramp day, sends, DNS triad and a sparkline.
 *
 * Distinct from every existing Pro-Plus / Starter dashboard: there is no KPI
 * tile grid, no bento boxes, no chart rail, no leaderboard list, no oversized
 * editorial numeral — the entire primary surface is a positioned graph.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Every value comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies the
 * sidebar / chrome. Node coordinates are computed deterministically (trig on
 * the array index) — no layout libraries.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';
type DnsState = 'pass' | 'warn' | 'fail';
type WarmthTier = 'high' | 'mid' | 'low';

interface MailboxNode {
  id: string;
  email: string;
  provider: Provider;
  /** 0..100 workspace warmth contribution. */
  warmth: number;
  /** 7-day warmth change. */
  delta: number;
  /** Ramp day (drives the D1..D29+ ladder). */
  day: number;
  sentToday: number;
  target: number;
  inboxPct: number;
  dns: { spf: DnsState; dkim: DnsState; dmarc: DnsState };
  /** Which orbit ring this node rides (0 = inner, 1 = outer). */
  ring: 0 | 1;
  /** Tiny 14-pt warmth sparkline for the detail panel. */
  spark: number[];
}

interface SignalNode {
  id: 'postmaster' | 'snds';
  label: string;
  short: string;
  value: string;
  status: 'good' | 'watch' | 'bad';
  detail: string;
}

interface ConstellationData {
  avgWarmth: number;
  warmthDelta: number;
  mailboxCount: number;
  warmingCount: number;
  sentToday: number;
  sentTarget: number;
  peerPoolCount: number;
  peerActive: number;
  mailboxes: MailboxNode[];
  signals: SignalNode[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers (avg warmth ~84, 15 mailboxes)
// ---------------------------------------------------------------------------

/** Deterministic 14-pt warmth sparkline ending near `end`. */
function spark(end: number, climb: number): number[] {
  return Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const v = end - climb + climb * t + Math.sin(i * 0.9 + end) * 1.8;
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

function dns(spf: DnsState, dkim: DnsState, dmarc: DnsState) {
  return { spf, dkim, dmarc };
}

const MOCK: ConstellationData = {
  avgWarmth: 84,
  warmthDelta: 2.6,
  mailboxCount: 15,
  warmingCount: 12,
  sentToday: 648,
  sentTarget: 840,
  peerPoolCount: 1240,
  peerActive: 96,
  mailboxes: [
    // Inner ring — the most-warmed, highest-volume senders.
    { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail', warmth: 93, delta: 1.4, day: 31, sentToday: 72, target: 75, inboxPct: 96.4, dns: dns('pass', 'pass', 'pass'), ring: 0, spark: spark(93, 7) },
    { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook', warmth: 90, delta: 2.1, day: 29, sentToday: 68, target: 72, inboxPct: 95.1, dns: dns('pass', 'pass', 'pass'), ring: 0, spark: spark(90, 9) },
    { id: 'mb-3', email: 'success@acme.io', provider: 'gmail', warmth: 88, delta: 1.8, day: 27, sentToday: 62, target: 68, inboxPct: 94.0, dns: dns('pass', 'pass', 'warn'), ring: 0, spark: spark(88, 8) },
    { id: 'mb-4', email: 'partnerships@acme.io', provider: 'outlook', warmth: 86, delta: 2.9, day: 24, sentToday: 56, target: 64, inboxPct: 93.2, dns: dns('pass', 'pass', 'pass'), ring: 0, spark: spark(86, 11) },
    { id: 'mb-5', email: 'hello@acme.co', provider: 'smtp', warmth: 85, delta: 2.4, day: 22, sentToday: 52, target: 60, inboxPct: 92.6, dns: dns('pass', 'warn', 'pass'), ring: 0, spark: spark(85, 10) },
    { id: 'mb-6', email: 'demo@acme.io', provider: 'gmail', warmth: 84, delta: 1.6, day: 21, sentToday: 50, target: 58, inboxPct: 92.1, dns: dns('pass', 'pass', 'pass'), ring: 0, spark: spark(84, 9) },
    { id: 'mb-7', email: 'team@acme.io', provider: 'outlook', warmth: 83, delta: 2.0, day: 20, sentToday: 48, target: 56, inboxPct: 91.7, dns: dns('pass', 'pass', 'pass'), ring: 0, spark: spark(83, 9) },
    // Outer ring — earlier in the ramp, lower volume / warmth.
    { id: 'mb-8', email: 'support@acme.co', provider: 'yahoo', warmth: 80, delta: 1.9, day: 17, sentToday: 42, target: 52, inboxPct: 90.4, dns: dns('pass', 'pass', 'warn'), ring: 1, spark: spark(80, 10) },
    { id: 'mb-9', email: 'careers@acme.io', provider: 'gmail', warmth: 78, delta: 1.5, day: 16, sentToday: 38, target: 48, inboxPct: 89.6, dns: dns('pass', 'pass', 'pass'), ring: 1, spark: spark(78, 9) },
    { id: 'mb-10', email: 'press@acme.io', provider: 'outlook', warmth: 75, delta: 2.2, day: 15, sentToday: 34, target: 44, inboxPct: 88.8, dns: dns('pass', 'warn', 'warn'), ring: 1, spark: spark(75, 11) },
    { id: 'mb-11', email: 'growth@acme.io', provider: 'gmail', warmth: 71, delta: -1.2, day: 13, sentToday: 28, target: 40, inboxPct: 87.3, dns: dns('pass', 'pass', 'pass'), ring: 1, spark: spark(71, -5) },
    { id: 'mb-12', email: 'ops@acme.co', provider: 'smtp', warmth: 66, delta: 2.6, day: 10, sentToday: 22, target: 30, inboxPct: 85.6, dns: dns('warn', 'pass', 'pass'), ring: 1, spark: spark(66, 9) },
    { id: 'mb-13', email: 'billing@acme.co', provider: 'smtp', warmth: 61, delta: 2.8, day: 8, sentToday: 18, target: 24, inboxPct: 84.2, dns: dns('pass', 'warn', 'fail'), ring: 1, spark: spark(61, 10) },
    { id: 'mb-14', email: 'newsletter@acme.io', provider: 'gmail', warmth: 54, delta: 3.1, day: 6, sentToday: 14, target: 18, inboxPct: 82.0, dns: dns('pass', 'pass', 'pass'), ring: 1, spark: spark(54, 12) },
    { id: 'mb-15', email: 'invites@acme.co', provider: 'outlook', warmth: 47, delta: 2.4, day: 4, sentToday: 10, target: 12, inboxPct: 79.5, dns: dns('warn', 'warn', 'pass'), ring: 1, spark: spark(47, 11) },
  ],
  signals: [
    {
      id: 'postmaster',
      label: 'Google Postmaster',
      short: 'PM',
      value: 'High',
      status: 'good',
      detail: 'Domain trust High · spam 0.06% · 6 Gmail mailboxes',
    },
    {
      id: 'snds',
      label: 'Microsoft SNDS',
      short: 'SNDS',
      value: 'Green',
      status: 'good',
      detail: 'Filter result green · 0 complaints · Outlook IP healthy',
    },
  ],
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522', // warmth high
  accent4: '#ffd54f', // warmth mid
  accent3: '#ff6b4a', // warmth low
  surface2: '#1a1a26',
  border: '#2a2a3a',
  textDim: '#8888a0',
} as const;

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

const TIER_LABEL: Record<WarmthTier, string> = {
  high: 'High trust',
  mid: 'Warming',
  low: 'Early build-up',
};

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  smtp: 'SMTP',
  yahoo: 'Yahoo',
};

const DNS_DOT: Record<DnsState, string> = {
  pass: 'bg-accent',
  warn: 'bg-accent4',
  fail: 'bg-accent3',
};

const STATUS_TEXT: Record<SignalNode['status'], string> = {
  good: 'text-accent',
  watch: 'text-accent4',
  bad: 'text-accent3',
};

/** ViewBox space — a fixed coordinate system the stage scales to fit. */
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const RING_INNER = 188;
const RING_OUTER = 322;
const PEER_RING = 432;
const CORE_R = 58;

interface Placed {
  node: MailboxNode;
  x: number;
  y: number;
  /** Node radius scaled by send volume. */
  r: number;
}

/**
 * Deterministic radial placement: nodes on a ring are spread evenly by
 * `angle = -90deg + index * (360 / count)`, the inner ring offset half a step
 * so the two rings interleave visually rather than line up.
 */
function place(nodes: MailboxNode[]): Placed[] {
  const inner = nodes.filter((n) => n.ring === 0);
  const outer = nodes.filter((n) => n.ring === 1);
  const maxSend = Math.max(...nodes.map((n) => n.sentToday), 1);

  const layout = (group: MailboxNode[], radius: number, phase: number) =>
    group.map((node, i) => {
      const ang = (-90 + phase + (360 / group.length) * i) * (Math.PI / 180);
      const vol = node.sentToday / maxSend; // 0..1
      return {
        node,
        x: CX + radius * Math.cos(ang),
        y: CY + radius * Math.sin(ang),
        r: 17 + vol * 17,
      };
    });

  return [
    ...layout(inner, RING_INNER, 0),
    ...layout(outer, RING_OUTER, 360 / outer.length / 2),
  ];
}

/** The two signal-source nodes ride a fixed feeder axis below the core. */
const SIGNAL_POS: Record<SignalNode['id'], { x: number; y: number }> = {
  postmaster: { x: CX - 132, y: CY + PEER_RING - 36 },
  snds: { x: CX + 132, y: CY + PEER_RING - 36 },
};

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
      {delta.toFixed(1)} · 7d
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusDashN3Constellation(): JSX.Element {
  const d = MOCK;
  const placed = useMemo(() => place(d.mailboxes), [d.mailboxes]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => placed.find((p) => p.node.id === activeId)?.node ?? null,
    [placed, activeId],
  );
  const sentPct = Math.round((d.sentToday / d.sentTarget) * 100);

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
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Network className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Network constellation
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            A spatial map of your warmup network — the workspace core, {d.mailboxCount}{' '}
            mailbox nodes in orbit, and the helper-inbox ring that powers it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Avg warmth" value={String(d.avgWarmth)} accent />
          <StatChip
            label="Warming"
            value={`${d.warmingCount}/${d.mailboxCount}`}
          />
          <StatChip
            label="Sends today"
            value={`${d.sentToday} · ${sentPct}%`}
          />
        </div>
      </motion.header>

      {/* The constellation stage + side detail panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
      >
        <div className="relative xl:col-span-8">
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

        <div className="xl:col-span-4">
          <DetailPanel
            mailbox={active}
            onClose={() => setActiveId(null)}
            data={d}
          />
        </div>
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
        className={`font-semibold tabular-nums ${
          accent ? 'text-accent' : 'text-text'
        }`}
      >
        {value}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The constellation stage (fixed-height SVG scene)
// ---------------------------------------------------------------------------

function ConstellationStage({
  data,
  placed,
  activeId,
  hoverId,
  onSelect,
  onHover,
}: {
  data: ConstellationData;
  placed: Placed[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* soft radial bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle at center, ${HEX.accent}1f 0%, transparent 72%)` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Warmup network constellation: workspace core with mailbox nodes in orbit"
      >
        <defs>
          <radialGradient id="cst-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.9} />
            <stop offset="60%" stopColor={HEX.accent} stopOpacity={0.32} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="cst-scan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.55} />
          </linearGradient>
        </defs>

        {/* Orbit guide rings */}
        {[RING_INNER, RING_OUTER].map((r) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={HEX.border}
            strokeWidth={1}
            strokeDasharray="2 7"
          />
        ))}

        {/* Outer peer-inbox network ring (the moat) */}
        <circle
          cx={CX}
          cy={CY}
          r={PEER_RING}
          fill="none"
          stroke={HEX.accent}
          strokeOpacity={0.22}
          strokeWidth={1.5}
        />
        <motion.circle
          cx={CX}
          cy={CY}
          r={PEER_RING}
          fill="none"
          stroke={HEX.accent}
          strokeOpacity={0.5}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="3 26"
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 64, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />

        {/* Sweeping radar scan arc */}
        <motion.g
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 11, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={CX}
            y2={CY - PEER_RING}
            stroke="url(#cst-scan)"
            strokeWidth={3}
          />
          <path
            d={`M ${CX} ${CY} L ${CX} ${CY - PEER_RING} A ${PEER_RING} ${PEER_RING} 0 0 1 ${
              CX + PEER_RING * Math.sin(0.5)
            } ${CY - PEER_RING * Math.cos(0.5)} Z`}
            fill="url(#cst-scan)"
            fillOpacity={0.12}
          />
        </motion.g>

        {/* Signal-source feeder nodes (Pro Plus moat) → core */}
        {data.signals.map((s, i) => {
          const p = SIGNAL_POS[s.id];
          return (
            <SignalLink key={s.id} x={p.x} y={p.y} index={i} />
          );
        })}

        {/* Connection lines: core → each mailbox node */}
        {placed.map((p, i) => {
          const focused = activeId === p.node.id || hoverId === p.node.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused;
          const t = tier(p.node.warmth);
          const stroke = TIER_HEX[t];
          // Stroke width encodes today's send volume.
          const w = 1 + (p.node.sentToday / 75) * 3.4;
          return (
            <g key={`l-${p.node.id}`}>
              <line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0.07 : focused ? 0.7 : 0.26}
                strokeWidth={focused ? w + 1.2 : w}
                strokeLinecap="round"
              />
              {/* animated activity flux travelling the wire */}
              <motion.line
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeOpacity={dimmed ? 0 : 0.85}
                strokeWidth={focused ? 3 : 2}
                strokeLinecap="round"
                strokeDasharray="3 60"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -126 }}
                transition={{
                  duration: 2.6 + (i % 5) * 0.4,
                  ease: 'linear',
                  repeat: Infinity,
                }}
              />
            </g>
          );
        })}

        {/* Mailbox nodes */}
        {placed.map((p, i) => (
          <NodeGlyph
            key={p.node.id}
            placed={p}
            index={i}
            active={activeId === p.node.id}
            hovered={hoverId === p.node.id}
            faded={
              (activeId !== null || hoverId !== null) &&
              activeId !== p.node.id &&
              hoverId !== p.node.id
            }
            onSelect={() => onSelect(p.node.id === activeId ? null : p.node.id)}
            onHover={onHover}
          />
        ))}

        {/* Signal-source node glyphs */}
        {data.signals.map((s, i) => (
          <SignalGlyph
            key={s.id}
            signal={s}
            pos={SIGNAL_POS[s.id]}
            index={i}
          />
        ))}

        {/* The workspace core */}
        <CoreGlyph data={data} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Core glyph (centre of the constellation)
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: ConstellationData }) {
  return (
    <g>
      {/* expanding pulse halo */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 2.5, opacity: 0 }}
        transition={{ duration: 3.4, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <circle cx={CX} cy={CY} r={CORE_R * 1.7} fill="url(#cst-core)" />
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.accent}
        strokeWidth={2}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <text
        x={CX}
        y={CY - 14}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 15, letterSpacing: 1.5 }}
      >
        WORKSPACE
      </text>
      <text
        x={CX}
        y={CY + 16}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 40, fontWeight: 600 }}
      >
        {data.avgWarmth}
      </text>
      <text
        x={CX}
        y={CY + 36}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 13 }}
      >
        avg warmth
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Mailbox node glyph
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
  const { node, x, y, r } = placed;
  const t = tier(node.warmth);
  const color = TIER_HEX[t];
  const lifted = active || hovered;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: faded ? 0.32 : 1,
        scale: 1,
        x: lifted ? (x - CX) * 0.04 : 0,
        y: lifted ? (y - CY) * 0.04 : 0,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: { duration: 0.5, delay: 0.25 + index * 0.045, ease: [0.22, 1, 0.36, 1] },
        x: { duration: 0.3 },
        y: { duration: 0.3 },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${node.email}, warmth ${node.warmth}, day ${node.day}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
    >
      {/* gentle orbital drift bob */}
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -4 : 4, 0] }}
        transition={{
          duration: 5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
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
        <circle
          cx={x}
          cy={y}
          r={r + 4}
          fill={color}
          fillOpacity={lifted ? 0.22 : 0.12}
        />
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.4 : 1.6}
        />
        <text
          x={x}
          y={y + r * 0.32}
          textAnchor="middle"
          fill={color}
          style={{ fontSize: r * 0.82, fontWeight: 600 }}
        >
          {PROVIDER_LETTER[node.provider]}
        </text>
        {/* warmth value tag below the node */}
        <text
          x={x}
          y={y + r + 16}
          textAnchor="middle"
          className="fill-text-dim"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {node.warmth}
        </text>
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Signal-source feeder link + glyph (Pro Plus moat)
// ---------------------------------------------------------------------------

function SignalLink({
  x,
  y,
  index,
}: {
  x: number;
  y: number;
  index: number;
}) {
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={CX}
        y2={CY}
        stroke={HEX.accent}
        strokeOpacity={0.18}
        strokeWidth={2}
        strokeDasharray="4 5"
      />
      {/* signal pulse flowing INTO the core */}
      <motion.line
        x1={x}
        y1={y}
        x2={CX}
        y2={CY}
        stroke={HEX.accent}
        strokeOpacity={0.7}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeDasharray="3 48"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -102 }}
        transition={{
          duration: 2.2 + index * 0.5,
          ease: 'linear',
          repeat: Infinity,
        }}
      />
    </g>
  );
}

function SignalGlyph({
  signal,
  pos,
  index,
}: {
  signal: SignalNode;
  pos: { x: number; y: number };
  index: number;
}) {
  const Icon = signal.id === 'postmaster' ? ShieldCheck : Radar;
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: 0.6 + index * 0.12,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <rect
        x={pos.x - 64}
        y={pos.y - 26}
        width={128}
        height={52}
        rx={14}
        fill={HEX.surface2}
        stroke={HEX.accent}
        strokeOpacity={0.5}
        strokeWidth={1.5}
      />
      <foreignObject x={pos.x - 60} y={pos.y - 20} width={120} height={40}>
        <div className="flex h-full items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent/15 text-accent">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold leading-tight text-text">
              {signal.short}
            </span>
            <span className={`block text-[10px] leading-tight ${STATUS_TEXT[signal.status]}`}>
              {signal.value}
            </span>
          </span>
        </div>
      </foreignObject>
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
    { tier: 'low', label: 'Early build-up < 50' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.9 }}
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-dim">
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
        Node size = sends today
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Side detail panel (slides in on node select)
// ---------------------------------------------------------------------------

function DetailPanel({
  mailbox,
  onClose,
  data,
}: {
  mailbox: MailboxNode | null;
  onClose: () => void;
  data: ConstellationData;
}) {
  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {mailbox ? (
          <motion.div
            key={mailbox.id}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            // overflow-y-auto on the inner motion div: lets PanelOverview /
            // NodeDetail scroll inside the fixed 560px shell, while the
            // outer wrapper keeps `overflow-hidden` so the slide-in /
            // slide-out animation still clips cleanly at the panel edge.
            // overscroll-contain stops the page from rubber-banding when
            // the inner panel reaches its scroll boundary.
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <NodeDetail mailbox={mailbox} onClose={onClose} />
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
            <PanelOverview data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelOverview({ data }: { data: ConstellationData }) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">Network state</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Select any mailbox node to inspect it.
        </p>
      </header>

      <div className="space-y-3 p-5">
        <OverviewRow
          label="Helper-inbox group"
          value={`${formatNumber(data.peerPoolCount)} inboxes`}
          sub={`${data.peerActive}% live · the moat`}
        />
        <OverviewRow
          label="Mailboxes warming"
          value={`${data.warmingCount} / ${data.mailboxCount}`}
          sub="orbiting the core"
        />
        <OverviewRow
          label="Sends today"
          value={`${data.sentToday} / ${data.sentTarget}`}
          sub={`${Math.round((data.sentToday / data.sentTarget) * 100)}% of ceiling`}
        />
      </div>

      <div className="mt-auto border-t border-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent3" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
            Signal sources
          </span>
          <Badge variant="orange">Pro Plus</Badge>
        </div>
        <ul className="space-y-2.5">
          {data.signals.map((s) => {
            const Icon = s.id === 'postmaster' ? ShieldCheck : Radar;
            return (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-xl border border-border-muted bg-surface-2/40 p-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text">
                      {s.label}
                    </span>
                    <span
                      className={`text-sm font-semibold ${STATUS_TEXT[s.status]}`}
                    >
                      {s.value}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-dim">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 px-4 py-3">
      <p className="text-xs text-text-dim">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-text">
        {value}
      </p>
      <p className="text-xs text-text-dim">{sub}</p>
    </div>
  );
}

function NodeDetail({
  mailbox,
  onClose,
}: {
  mailbox: MailboxNode;
  onClose: () => void;
}) {
  const t = tier(mailbox.warmth);
  const color = TIER_HEX[t];
  const sparkData = useMemo(
    () => mailbox.spark.map((v, i) => ({ i, v })),
    [mailbox.spark],
  );
  const sendPct = Math.round((mailbox.sentToday / mailbox.target) * 100);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-semibold text-bg"
            style={{ background: color }}
            aria-hidden
          >
            {PROVIDER_LETTER[mailbox.provider]}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {mailbox.email}
            </p>
            <p className="text-xs text-text-dim">
              {PROVIDER_LABEL[mailbox.provider]} · Day {mailbox.day}
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
        {/* Warmth headline */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-dim">
                Warmth
              </p>
              <p
                className="mt-0.5 text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {mailbox.warmth}
              </p>
            </div>
            <div className="text-right">
              <DeltaPill delta={mailbox.delta} />
              <p className={`mt-1 text-xs font-medium ${TIER_TEXT[t]}`}>
                {TIER_LABEL[t]}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${mailbox.warmth}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Warmth sparkline */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-dim">
            <Activity className="h-3.5 w-3.5 text-accent" />
            14-day warmth
          </div>
          <div className="h-[110px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sparkData}
                margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="cst-spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.4} />
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
                  fill="url(#cst-spark)"
                  dot={false}
                  activeDot={{ r: 3 }}
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Send + placement */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCell
            label="Sends today"
            value={`${mailbox.sentToday}/${mailbox.target}`}
            sub={`${sendPct}% of target`}
          />
          <MetricCell
            label="Where emails land"
            value={`${mailbox.inboxPct}%`}
            sub="seed landing"
          />
        </div>

        {/* DNS triad */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <p className="mb-2.5 text-xs uppercase tracking-wider text-text-dim">
            Domain records (DNS) health
          </p>
          <div className="flex gap-2">
            {(['spf', 'dkim', 'dmarc'] as const).map((rec) => (
              <span
                key={rec}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface px-2 py-2 text-xs font-medium text-text"
              >
                <span
                  className={`h-2 w-2 rounded-full ${DNS_DOT[mailbox.dns[rec]]}`}
                  aria-hidden
                />
                {rec.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function MetricCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
      <p className="text-xs text-text-dim">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-text">
        {value}
      </p>
      <p className="text-xs text-text-dim">{sub}</p>
    </div>
  );
}

export default ProPlusDashN3Constellation;
