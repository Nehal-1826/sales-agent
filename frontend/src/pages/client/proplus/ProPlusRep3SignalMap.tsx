import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Crosshair,
  Globe,
  Mail,
  Radio,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Workflow,
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
import { formatDate } from '@/lib/format';

/**
 * ProPlusRep3SignalMap — "Signal Map" (Pro Plus reputation differentiator).
 *
 * An interactive *spatial node-link diagram* of the sending domain's
 * reputation signal graph. NOT a card dashboard, NOT a NOC ops / status
 * board, NOT an accounting ledger, NOT an audit checklist, NOT a radar
 * chart (sibling agents + existing cards own those shapes).
 *
 * Standalone for the isolated preview harness: NO network / router / query
 * hooks, NO required props, inline MOCK. Renders ONLY page content — the
 * harness supplies the shell + sidebar.
 *
 * The graph (hand-rolled SVG, NO graph library):
 *   • Center  → the sending DOMAIN node (composite reputation).
 *   • Ring 1  → the 4 signal SOURCE nodes (DNS Auth, Google Postmaster,
 *               Microsoft SNDS, Blacklist). Each links to the domain by an
 *               edge whose stroke width + colour encode signal health.
 *   • Ring 2  → 4 provider CLUSTER nodes (Gmail, Outlook, Yahoo, SMTP),
 *               each wired to the source(s) that observe it.
 *
 * Interaction: real useState selection + hover. Clicking / hovering any
 * node opens the right-hand INSPECTOR panel with that node's detail
 * payload (Postmaster → domain rep tier, IP rep, spam rate, auth pass,
 * 30d trend; SNDS → IP status, complaint rate, trap hits, 30d trend; etc.)
 * Selecting a node also highlights its incident edges on the map.
 *
 * Postmaster + SNDS are the Pro Plus unlock — their source nodes are
 * flagged LIVE: a green link ring + a traveling "signal particle" that
 * loops along their edge to the domain. DNS / Blacklist are probed (static
 * edges, no particle).
 *
 * Animation (framer-motion): edges draw in via pathLength, nodes scale-in
 * on a stagger, the selected node carries a pulsing focus ring, a signal
 * particle loops along each live edge, and the inspector slides / fades on
 * every selection change. The inspector mini-trend is Recharts inside a
 * fixed-height parent with ResponsiveContainer 100%/100%.
 *
 * Colour: existing Tailwind tokens only. healthy → accent, watch → accent4,
 * critical → accent3. Recharts pulls the same RGBs the token palette uses
 * so the mini-trend stays on-palette without importing chart internals.
 */

// ---------------------------------------------------------------------------
// Palette — token RGBs (no new colours).
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // healthy
  accent4: 'rgb(255, 213, 79)', // watch
  accent3: 'rgb(255, 107, 74)', // critical
  domain: 'rgb(255, 138, 75)', // accent2 RGB — the domain hub itself
  muted: 'rgb(136, 136, 160)',
  grid: 'rgb(42, 42, 58)',
  link: 'rgb(58, 58, 78)', // idle ring-2 wiring
} as const;

export type Health = 'healthy' | 'watch' | 'critical';

const HEALTH_COLOR: Record<Health, string> = {
  healthy: C.accent,
  watch: C.accent4,
  critical: C.accent3,
};

const HEALTH_TEXT: Record<Health, string> = {
  healthy: 'text-accent',
  watch: 'text-accent4',
  critical: 'text-accent3',
};

const HEALTH_DOT: Record<Health, string> = {
  healthy: 'bg-accent',
  watch: 'bg-accent4',
  critical: 'bg-accent3',
};

const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  critical: 'Critical',
};

// ---------------------------------------------------------------------------
// Mock data — node-link graph with precomputed positions on a 880×560 viewBox
// ---------------------------------------------------------------------------

const VIEW_W = 880;
const VIEW_H = 560;
const CX = 360; // domain hub x (graph is left-weighted; inspector sits right)
const CY = 280; // domain hub y

const ANCHOR = new Date('2026-05-17');

function isoMinusDays(days: number): string {
  const d = new Date(ANCHOR);
  d.setDate(ANCHOR.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface TrendPoint extends Record<string, unknown> {
  date: string;
  v: number;
}

/** 30-day series climbing from `from` → `to` with light noise. */
function buildTrend(from: number, to: number, jitter: number): TrendPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const t = i / 29;
    const v = from + (to - from) * t + Math.sin(i * 0.7) * jitter;
    return { date: isoMinusDays(29 - i), v: Math.round(v * 100) / 100 };
  });
}

export interface DetailRow {
  label: string;
  value: string;
  tone: Health;
}

export type NodeKind = 'domain' | 'source' | 'provider';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sub: string;
  x: number;
  y: number;
  r: number;
  health: Health;
  /** Pro Plus live-fed source (Postmaster / SNDS). */
  live?: boolean;
  /** Short headline shown under the title in the inspector. */
  headline: string;
  rows: DetailRow[];
  /** Inspector mini-trend (sources only). */
  trend?: TrendPoint[];
  trendLabel?: string;
  trendUnit?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** 0–1 — drives stroke width + which side carries the live particle. */
  strength: number;
  health: Health;
  live?: boolean;
}

export interface SignalMapData {
  domainName: string;
  composite: number;
  mailboxCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Ring-1 source nodes sit N/E/S/W of the hub; ring-2 providers sit further out.
const MOCK: SignalMapData = {
  domainName: 'acme.io',
  composite: 91,
  mailboxCount: 15,
  nodes: [
    {
      id: 'domain',
      kind: 'domain',
      label: 'acme.io',
      sub: 'sending domain',
      x: CX,
      y: CY,
      r: 52,
      health: 'healthy',
      headline: 'Composite sender trust across every connected mailbox.',
      rows: [
        { label: 'Composite score', value: '91 / 100', tone: 'healthy' },
        { label: 'Connected mailboxes', value: '15', tone: 'healthy' },
        { label: 'Signal sources live', value: '2 of 4', tone: 'healthy' },
        { label: '30-day trend', value: '+6 pts', tone: 'healthy' },
      ],
    },
    {
      id: 'src-dns',
      kind: 'source',
      label: 'DNS Auth',
      sub: 'SPF · DKIM · DMARC',
      x: CX,
      y: CY - 188,
      r: 36,
      health: 'healthy',
      headline: 'Authentication records resolved across all 15 mailboxes.',
      rows: [
        { label: 'SPF', value: '15 / 15 pass', tone: 'healthy' },
        { label: 'DKIM', value: '15 / 15 pass', tone: 'healthy' },
        { label: 'DMARC', value: '14 / 15 pass', tone: 'watch' },
        { label: 'Probe', value: 'every 6h', tone: 'healthy' },
      ],
      trend: buildTrend(86, 99, 1.4),
      trendLabel: 'Auth pass rate',
      trendUnit: '%',
    },
    {
      id: 'src-postmaster',
      kind: 'source',
      label: 'Google Postmaster',
      sub: 'Gmail · domain trust',
      x: CX + 188,
      y: CY,
      r: 36,
      health: 'healthy',
      live: true,
      headline: 'Live Gmail feed — domain trust climbed Medium → High.',
      rows: [
        { label: 'Domain trust', value: 'High', tone: 'healthy' },
        { label: 'IP trust', value: 'High', tone: 'healthy' },
        { label: 'Spam rate', value: '0.03%', tone: 'healthy' },
        { label: 'Auth pass', value: '99.6%', tone: 'healthy' },
      ],
      trend: buildTrend(62, 96, 2.4),
      trendLabel: 'Domain trust',
      trendUnit: '/100',
    },
    {
      id: 'src-snds',
      kind: 'source',
      label: 'Microsoft SNDS',
      sub: 'Outlook · per-IP filter',
      x: CX,
      y: CY + 188,
      r: 36,
      health: 'watch',
      live: true,
      headline: 'Live Microsoft feed — green IP with a single recent trap hit.',
      rows: [
        { label: 'IP status', value: 'Green', tone: 'healthy' },
        { label: 'Complaint rate', value: '0.003%', tone: 'healthy' },
        { label: 'Trap hits (30d)', value: '1', tone: 'watch' },
        { label: 'Volume / day', value: '2,284', tone: 'healthy' },
      ],
      trend: buildTrend(820, 2284, 90),
      trendLabel: 'Daily volume',
      trendUnit: '',
    },
    {
      id: 'src-blacklist',
      kind: 'source',
      label: 'Block list',
      sub: 'RBL / DBL zones',
      x: CX - 188,
      y: CY,
      r: 36,
      health: 'watch',
      headline: 'All major zones clear — one dynamic-range flag in delisting.',
      rows: [
        { label: 'Spamhaus ZEN', value: 'Not listed', tone: 'healthy' },
        { label: 'Barracuda BRBL', value: 'Not listed', tone: 'healthy' },
        { label: 'SORBS DUHL', value: 'Flagged', tone: 'watch' },
        { label: 'Zones clear', value: '5 of 6', tone: 'watch' },
      ],
      trend: buildTrend(4, 5, 0.3),
      trendLabel: 'Zones clear',
      trendUnit: ' / 6',
    },
    {
      id: 'prov-gmail',
      kind: 'provider',
      label: 'Gmail',
      sub: '7 mailboxes',
      x: CX + 150,
      y: CY - 196,
      r: 27,
      health: 'healthy',
      headline: 'Gmail-routed mailboxes — observed by Postmaster + DNS Auth.',
      rows: [
        { label: 'Mailboxes', value: '7', tone: 'healthy' },
        { label: 'Where emails land', value: '97.4%', tone: 'healthy' },
        { label: 'Observed by', value: 'Postmaster · DNS', tone: 'healthy' },
      ],
    },
    {
      id: 'prov-outlook',
      kind: 'provider',
      label: 'Outlook',
      sub: '5 mailboxes',
      x: CX + 150,
      y: CY + 196,
      r: 27,
      health: 'watch',
      headline: 'Outlook-routed mailboxes — observed by SNDS + DNS Auth.',
      rows: [
        { label: 'Mailboxes', value: '5', tone: 'healthy' },
        { label: 'Where emails land', value: '94.1%', tone: 'watch' },
        { label: 'Observed by', value: 'SNDS · DNS', tone: 'healthy' },
      ],
    },
    {
      id: 'prov-yahoo',
      kind: 'provider',
      label: 'Yahoo',
      sub: '2 mailboxes',
      x: CX - 150,
      y: CY + 196,
      r: 27,
      health: 'watch',
      headline: 'Yahoo-routed mailboxes — covered by DNS Auth + block list.',
      rows: [
        { label: 'Mailboxes', value: '2', tone: 'healthy' },
        { label: 'Where emails land', value: '92.0%', tone: 'watch' },
        { label: 'Observed by', value: 'DNS · Block list', tone: 'watch' },
      ],
    },
    {
      id: 'prov-smtp',
      kind: 'provider',
      label: 'Generic SMTP',
      sub: '1 mailbox',
      x: CX - 150,
      y: CY - 196,
      r: 27,
      health: 'watch',
      headline: 'Generic-SMTP mailbox — covered by DNS Auth + block list.',
      rows: [
        { label: 'Mailboxes', value: '1', tone: 'healthy' },
        { label: 'Where emails land', value: '90.6%', tone: 'watch' },
        { label: 'Observed by', value: 'DNS · Block list', tone: 'watch' },
      ],
    },
  ],
  edges: [
    // Ring 1 → domain (signal-source edges; thickness/colour = strength/health)
    { id: 'e-dns', from: 'src-dns', to: 'domain', strength: 0.93, health: 'healthy' },
    {
      id: 'e-pm',
      from: 'src-postmaster',
      to: 'domain',
      strength: 0.96,
      health: 'healthy',
      live: true,
    },
    {
      id: 'e-snds',
      from: 'src-snds',
      to: 'domain',
      strength: 0.78,
      health: 'watch',
      live: true,
    },
    {
      id: 'e-bl',
      from: 'src-blacklist',
      to: 'domain',
      strength: 0.72,
      health: 'watch',
    },
    // Ring 2 → the source(s) that observe each provider cluster
    { id: 'e-gmail-pm', from: 'prov-gmail', to: 'src-postmaster', strength: 0.9, health: 'healthy' },
    { id: 'e-gmail-dns', from: 'prov-gmail', to: 'src-dns', strength: 0.7, health: 'healthy' },
    { id: 'e-outlook-snds', from: 'prov-outlook', to: 'src-snds', strength: 0.82, health: 'watch' },
    { id: 'e-outlook-dns', from: 'prov-outlook', to: 'src-dns', strength: 0.66, health: 'healthy' },
    { id: 'e-yahoo-dns', from: 'prov-yahoo', to: 'src-dns', strength: 0.6, health: 'watch' },
    {
      id: 'e-yahoo-bl',
      from: 'prov-yahoo',
      to: 'src-blacklist',
      strength: 0.58,
      health: 'watch',
    },
    { id: 'e-smtp-dns', from: 'prov-smtp', to: 'src-dns', strength: 0.55, health: 'watch' },
    {
      id: 'e-smtp-bl',
      from: 'prov-smtp',
      to: 'src-blacklist',
      strength: 0.52,
      health: 'watch',
    },
  ],
};

/**
 * The fixed node-link TOPOLOGY (node ids, kinds, x/y/r positions, edge
 * wiring) the live adapter overlays real metrics onto. Layout is a design
 * constant — the live adapter (`features/reputation/useProPlusSignalMapData`)
 * keeps these positions/edges and only swaps in real composite / health /
 * metric rows / trends, so the graph never has to be re-laid-out from the
 * API. Exported (not redefined) so the adapter maps onto the *same* skeleton
 * the prop-less preview renders.
 */
export const SIGNAL_MAP_SKELETON: SignalMapData = MOCK;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(v: unknown): string {
  if (typeof v !== 'string') return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return formatDate(d);
}

const NODE_ICON: Record<string, typeof Mail> = {
  domain: Globe,
  'src-dns': ShieldCheck,
  'src-postmaster': Mail,
  'src-snds': ShieldAlert,
  'src-blacklist': Crosshair,
  'prov-gmail': Mail,
  'prov-outlook': Mail,
  'prov-yahoo': Mail,
  'prov-smtp': ServerCog,
};

/** Point on the line between two nodes, offset by each node's radius so the
 *  edge starts/ends on the node boundary rather than its centre. */
function edgeGeometry(a: GraphNode, b: GraphNode) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: a.x + ux * a.r,
    y1: a.y + uy * a.r,
    x2: b.x - ux * b.r,
    y2: b.y - uy * b.r,
  };
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

const TOOLTIP_STYLE = {
  background: 'rgb(26, 26, 38)',
  border: `1px solid ${C.grid}`,
  borderRadius: 10,
  fontSize: 12,
  color: 'rgb(232, 232, 240)',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRep3SignalMap({
  data,
}: { data?: SignalMapData } = {}): JSX.Element {
  // Prop-less in the :35001 design preview → MOCK; live wrapper passes
  // real workspace-derived data overlaid onto the same skeleton topology.
  const d = data ?? MOCK;
  const [selectedId, setSelectedId] = useState<string>('domain');
  const [hoverId, setHoverId] = useState<string | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of d.nodes) m.set(n.id, n);
    return m;
  }, [d.nodes]);

  const activeId = hoverId ?? selectedId;
  const selected = nodeById.get(selectedId) ?? d.nodes[0]!;

  // Edges touching the active node (for highlight on hover/selection).
  const incidentEdgeIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of d.edges) {
      if (e.from === activeId || e.to === activeId) set.add(e.id);
    }
    return set;
  }, [d.edges, activeId]);

  const liveSources = d.nodes.filter((n) => n.kind === 'source' && n.live).length;
  const sourceNodes = d.nodes.filter((n) => n.kind === 'source');
  const healthyEdges = d.edges.filter((e) => e.health === 'healthy').length;
  const watchEdges = d.edges.filter((e) => e.health !== 'healthy').length;

  const SelIcon = NODE_ICON[selected.id] ?? Globe;

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Signal Map
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            A spatial graph of every sender-trust signal feeding{' '}
            <span className="font-medium text-text">{d.domainName}</span> —
            click any node to inspect it. {d.mailboxCount} mailboxes,{' '}
            {liveSources} live source feeds.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">Postmaster + SNDS</span>
          <span className="text-border-muted">·</span>
          <span>streaming live</span>
        </div>
      </motion.header>

      {/* Compact health summary strip */}
      <motion.div
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <SummaryTile
          Icon={Activity}
          label="Composite"
          value={`${d.composite}`}
          suffix="/ 100"
          tone="healthy"
        />
        <SummaryTile
          Icon={Radio}
          label="Live source feeds"
          value={`${liveSources}`}
          suffix={`/ ${sourceNodes.length}`}
          tone="healthy"
        />
        <SummaryTile
          Icon={Workflow}
          label="Healthy edges"
          value={`${healthyEdges}`}
          suffix={`/ ${d.edges.length}`}
          tone="healthy"
        />
        <SummaryTile
          Icon={ShieldAlert}
          label="Edges to watch"
          value={`${watchEdges}`}
          suffix={`/ ${d.edges.length}`}
          tone="watch"
        />
      </motion.div>

      {/* Map + inspector */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* The node-link map */}
        <motion.div
          {...fade(0.1)}
          className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface xl:col-span-8"
        >
          <div className="flex items-center justify-between border-b border-border-muted px-5 py-3">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Sender-trust signal graph
              </h3>
            </div>
            <Legend />
          </div>

          {/* Fixed-aspect SVG container so it lays out in the harness. */}
          <div
            className="relative w-full"
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
          >
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="absolute inset-0 h-full w-full"
              role="img"
              aria-label="Domain sender-trust signal node-link map"
            >
              {/* faint concentric guide rings around the hub */}
              {[188, 270].map((rr) => (
                <circle
                  key={rr}
                  cx={CX}
                  cy={CY}
                  r={rr}
                  fill="none"
                  stroke={C.grid}
                  strokeDasharray="2 8"
                  strokeWidth={1}
                />
              ))}

              {/* Edges (draw in via pathLength) */}
              {d.edges.map((e, i) => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return null;
                const g = edgeGeometry(a, b);
                const isProvEdge =
                  a.kind === 'provider' || b.kind === 'provider';
                const dim =
                  activeId !== 'domain' &&
                  hoverId == null &&
                  selectedId !== 'domain' &&
                  !incidentEdgeIds.has(e.id);
                const highlighted = incidentEdgeIds.has(e.id);
                const baseColor = isProvEdge
                  ? C.link
                  : HEALTH_COLOR[e.health];
                const width =
                  (isProvEdge ? 1.5 : 2.5) + e.strength * (isProvEdge ? 2 : 5);
                return (
                  <g key={e.id}>
                    <motion.line
                      x1={g.x1}
                      y1={g.y1}
                      x2={g.x2}
                      y2={g.y2}
                      stroke={
                        highlighted ? HEALTH_COLOR[e.health] : baseColor
                      }
                      strokeWidth={highlighted ? width + 1.5 : width}
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{
                        pathLength: 1,
                        opacity: dim ? 0.25 : highlighted ? 1 : 0.78,
                      }}
                      transition={{
                        pathLength: {
                          duration: 0.9,
                          delay: 0.3 + i * 0.05,
                          ease: 'easeInOut',
                        },
                        opacity: { duration: 0.3 },
                      }}
                    />
                    {/* Live signal particle — Postmaster / SNDS only */}
                    {e.live && (
                      <motion.circle
                        r={4}
                        fill={HEALTH_COLOR[e.health]}
                        initial={{ cx: g.x1, cy: g.y1, opacity: 0 }}
                        animate={{
                          cx: [g.x1, g.x2],
                          cy: [g.y1, g.y2],
                          opacity: [0, 1, 1, 0],
                        }}
                        transition={{
                          duration: 2.2,
                          delay: 1.2 + i * 0.2,
                          repeat: Infinity,
                          repeatDelay: 0.6,
                          ease: 'easeInOut',
                        }}
                      />
                    )}
                  </g>
                );
              })}

              {/* Nodes (scale-in stagger) */}
              {d.nodes.map((n, i) => {
                const Icon = NODE_ICON[n.id] ?? Globe;
                const isSel = n.id === selectedId;
                const isHover = n.id === hoverId;
                const isDomain = n.kind === 'domain';
                const ringColor = isDomain
                  ? C.domain
                  : HEALTH_COLOR[n.health];
                const fillBase = isDomain
                  ? 'rgb(20, 26, 34)'
                  : 'rgb(22, 22, 34)';
                return (
                  <motion.g
                    key={n.id}
                    style={{ cursor: 'pointer' }}
                    initial={{ opacity: 0, scale: 0.3 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      duration: 0.45,
                      delay: 0.15 + i * 0.06,
                      ease: 'easeOut',
                    }}
                    onClick={() => setSelectedId(n.id)}
                    onMouseEnter={() => setHoverId(n.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    {/* selected focus ring — pulsing */}
                    {isSel && (
                      <motion.circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r + 9}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={2}
                        initial={{ opacity: 0.7, scale: 0.92 }}
                        animate={{
                          opacity: [0.7, 0.15, 0.7],
                          scale: [0.92, 1.06, 0.92],
                        }}
                        transition={{
                          duration: 2.4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                        style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                      />
                    )}

                    {/* live link ring — Postmaster / SNDS source nodes */}
                    {n.live && !isSel && (
                      <motion.circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r + 6}
                        fill="none"
                        stroke={HEALTH_COLOR[n.health]}
                        strokeWidth={1.5}
                        strokeDasharray="3 5"
                        initial={{ opacity: 0.5 }}
                        animate={{ opacity: [0.5, 0.18, 0.5] }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                    )}

                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r}
                      fill={fillBase}
                      stroke={ringColor}
                      strokeWidth={isSel || isHover ? 3 : 2}
                      opacity={isHover && !isSel ? 0.95 : 1}
                    />
                    {/* subtle inner health wash */}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r}
                      fill={ringColor}
                      opacity={0.08}
                    />

                    <foreignObject
                      x={n.x - n.r}
                      y={n.y - n.r}
                      width={n.r * 2}
                      height={n.r * 2}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div className="flex h-full w-full flex-col items-center justify-center px-1 text-center">
                        <Icon
                          className="mb-0.5"
                          style={{
                            color: ringColor,
                            width: isDomain ? 20 : 16,
                            height: isDomain ? 20 : 16,
                          }}
                        />
                        <span
                          className="font-semibold leading-tight text-text"
                          style={{ fontSize: isDomain ? 13 : 10.5 }}
                        >
                          {n.label}
                        </span>
                        {isDomain && (
                          <span
                            className="font-semibold tabular-nums leading-tight"
                            style={{ fontSize: 17, color: C.domain }}
                          >
                            {d.composite}
                          </span>
                        )}
                        {!isDomain && n.kind === 'source' && (
                          <span
                            className="leading-tight"
                            style={{ fontSize: 8.5, color: C.muted }}
                          >
                            {n.live ? 'live' : 'probed'}
                          </span>
                        )}
                      </div>
                    </foreignObject>
                  </motion.g>
                );
              })}
            </svg>
          </div>
        </motion.div>

        {/* Inspector panel — slides / fades on selection change */}
        <motion.div
          {...fade(0.14)}
          className="xl:col-span-4"
        >
          <div className="flex h-full min-h-[360px] flex-col rounded-2xl border border-border-muted bg-surface">
            <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-dim">
                <Crosshair className="h-3.5 w-3.5" />
                Inspector
              </div>
              {selectedId !== 'domain' && (
                <button
                  type="button"
                  onClick={() => setSelectedId('domain')}
                  className="flex items-center gap-1 rounded-md border border-border-muted px-2 py-0.5 text-[11px] text-text-dim transition-colors hover:text-text"
                >
                  <X className="h-3 w-3" />
                  domain
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex flex-1 flex-col gap-4 p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background:
                        selected.kind === 'domain'
                          ? `${C.domain}1f`
                          : `${HEALTH_COLOR[selected.health]}1f`,
                      color:
                        selected.kind === 'domain'
                          ? C.domain
                          : HEALTH_COLOR[selected.health],
                    }}
                  >
                    <SelIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-text">
                        {selected.label}
                      </h3>
                      {selected.live && (
                        <span className="flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          <span className="relative inline-flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                          </span>
                          live
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-dim">{selected.sub}</p>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                    selected.kind === 'domain'
                      ? 'border-border-muted bg-surface-2 text-text-dim'
                      : `border-border-muted bg-surface-2 ${HEALTH_TEXT[selected.health]}`
                  }`}
                >
                  {selected.kind !== 'domain' && (
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${HEALTH_DOT[selected.health]}`}
                    />
                  )}
                  <span
                    className={
                      selected.kind === 'domain' ? '' : 'font-semibold'
                    }
                  >
                    {selected.kind === 'domain'
                      ? selected.headline
                      : `${HEALTH_LABEL[selected.health]} — ${selected.headline}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {selected.rows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2"
                    >
                      <div className="text-[11px] text-text-dim">
                        {row.label}
                      </div>
                      <div
                        className={`mt-0.5 text-sm font-semibold tabular-nums ${HEALTH_TEXT[row.tone]}`}
                      >
                        {row.value}
                      </div>
                    </div>
                  ))}
                </div>

                {selected.trend && (
                  <div className="mt-auto">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-text-dim">
                      <span>30-day {selected.trendLabel}</span>
                      <span
                        className={`flex items-center gap-1 ${HEALTH_TEXT[selected.health]}`}
                      >
                        <ArrowUpRight className="h-3 w-3" />
                        trending up
                      </span>
                    </div>
                    <div className="h-[110px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={selected.trend}
                          margin={{ top: 6, right: 4, left: 4, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="ppr3-trend"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={HEALTH_COLOR[selected.health]}
                                stopOpacity={0.4}
                              />
                              <stop
                                offset="100%"
                                stopColor={HEALTH_COLOR[selected.health]}
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <YAxis hide domain={['dataMin', 'dataMax']} />
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelFormatter={(v) => fmtDate(v)}
                            formatter={(v: number) => [
                              `${v}${selected.trendUnit ?? ''}`,
                              selected.trendLabel ?? 'Value',
                            ]}
                          />
                          <Area
                            type="monotone"
                            dataKey="v"
                            stroke={HEALTH_COLOR[selected.health]}
                            strokeWidth={2}
                            fill="url(#ppr3-trend)"
                            isAnimationActive
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {!selected.trend && (
                  <div className="mt-auto flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5 text-xs text-text-dim">
                    <Workflow className="h-3.5 w-3.5 shrink-0 text-accent" />
                    {selected.kind === 'domain'
                      ? 'Every source edge folds into this composite. Select a node on the map to drill in.'
                      : 'Provider cluster — wired to the signal sources that observe it. Select a source node for its trend.'}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryTile({
  Icon,
  label,
  value,
  suffix,
  tone,
}: {
  Icon: typeof Mail;
  label: string;
  value: string;
  suffix: string;
  tone: Health;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-muted bg-surface px-4 py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${HEALTH_TEXT[tone]}`}
        style={{ background: `${HEALTH_COLOR[tone]}1f` }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[11px] uppercase tracking-wider text-text-dim">
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-semibold tabular-nums leading-none text-text">
            {value}
          </span>
          <span className="text-xs text-text-dim">{suffix}</span>
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const items: Array<{ c: string; label: string }> = [
    { c: C.accent, label: 'Healthy' },
    { c: C.accent4, label: 'Watch' },
    { c: C.accent3, label: 'Critical' },
    { c: C.domain, label: 'Domain' },
  ];
  return (
    <div className="hidden items-center gap-3 sm:flex">
      {items.map((it) => (
        <span
          key={it.label}
          className="flex items-center gap-1.5 text-[11px] text-text-dim"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: it.c }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export default ProPlusRep3SignalMap;
