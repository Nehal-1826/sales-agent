import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  GitBranch,
  Inbox,
  Mail,
  MailOpen,
  Network,
  Reply as ReplyIcon,
  ShieldAlert,
  Sparkles,
  Star,
  Waypoints,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatNumber } from '@/lib/format';

/**
 * ProPlusAct3Flow — STANDALONE Pro-Plus "Warmup Activity" section, built for
 * the isolated preview harness. Renders ONLY page content (no nav / chrome);
 * the harness supplies the shell. No router / query / fetch / props — every
 * number comes from the inline MOCK const.
 *
 * Concept — ACTIVITY FLOW / SANKEY. The warmup engine's 24h throughput drawn
 * as a single left → right volumetric flow across THREE node columns:
 *
 *   col 0  Mailboxes   (the client's outbound mailboxes — 6 of 15 shown)
 *   col 1  Actions     (Sent → Opened → Replied → Starred → Spam-rescued)
 *   col 2  Peer network(the system-owned peer-inbox pool, the moat)
 *
 * Ribbons are hand-rolled cubic Béziers whose THICKNESS encodes volume; a
 * dash-flow particle travels each ribbon to convey live throughput. Each
 * column's nodes are stacked and sized strictly proportionally to the volume
 * flowing through them — node y-extents and ribbon endpoints are derived
 * deterministically from the MOCK link weights, NO layout / sankey library.
 *
 * Hovering a node or ribbon traces its full connected path (upstream +
 * downstream), dims everything else, and swaps the side panel to a focused
 * conversion read-out (sent → opened → replied funnel).
 *
 * Deliberately distinct from every sibling section:
 *   - StarterActivity  = stacked-bar SVG + drilldown list
 *   - ProActivity      = Slack-style channel rail + message feed
 *   - ProPlusActivity  = pulse-counter strip + linear timeline feed
 *   - Constellation    = RADIAL polar node-graph (orbit rings, centre core)
 * This is the only one whose primary surface is a horizontal flow of volume:
 * no bars, no timeline, no log, no clock, no orbit.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type ActionId = 'sent' | 'opened' | 'replied' | 'starred' | 'spam_rescued';
/** Which token group a node tints with. */
type Tone = 'a2' | 'accent' | 'a4' | 'a3' | 'dim';

interface MailboxNode {
  id: string;
  email: string;
  /** Total events this mailbox contributed in the window. */
  volume: number;
}

interface ActionNode {
  id: ActionId;
  label: string;
  /** Total events of this action type in the window. */
  volume: number;
}

interface PeerNode {
  id: string;
  label: string;
  /** Total events routed through this peer-pool segment. */
  volume: number;
}

/** A ribbon: mailbox → action (stage 0) or action → peer (stage 1). */
interface FlowLink {
  id: string;
  from: string;
  to: string;
  value: number;
  /** 0 = mailbox→action, 1 = action→peer. */
  stage: 0 | 1;
}

interface FlowMock {
  windowLabel: string;
  events24h: number;
  throughputPerHr: number;
  mailboxCount: number;
  activeCount: number;
  peerPoolSize: number;
  mailboxes: MailboxNode[];
  actions: ActionNode[];
  peers: PeerNode[];
  links: FlowLink[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-Plus 24h funnel (busy 15-mailbox account).
//
// The funnel tapers: many SENT, fewer OPENED, fewer REPLIED, fewer STARRED,
// a thin SPAM-RESCUED stream. Per-mailbox shares roll up to the action
// totals; action totals fan back out across two peer-pool segments. All
// derived numbers below are consistent by construction.
// ---------------------------------------------------------------------------

const ACTION_DEFS: { id: ActionId; label: string; tone: Tone }[] = [
  { id: 'sent', label: 'Sent', tone: 'a2' },
  { id: 'opened', label: 'Opened', tone: 'accent' },
  { id: 'replied', label: 'Replied', tone: 'a4' },
  { id: 'starred', label: 'Starred', tone: 'dim' },
  { id: 'spam_rescued', label: 'Spam recovery', tone: 'a3' },
];

/** Per-mailbox split of each action's total volume (rows sum to action total). */
const MAILBOX_DEFS: { id: string; email: string; split: Record<ActionId, number> }[] = [
  {
    id: 'mb-1',
    email: 'founder@acme.io',
    split: { sent: 58, opened: 44, replied: 19, starred: 11, spam_rescued: 2 },
  },
  {
    id: 'mb-2',
    email: 'sales@acme.io',
    split: { sent: 52, opened: 39, replied: 16, starred: 9, spam_rescued: 1 },
  },
  {
    id: 'mb-3',
    email: 'success@acme.io',
    split: { sent: 44, opened: 32, replied: 13, starred: 8, spam_rescued: 1 },
  },
  {
    id: 'mb-4',
    email: 'growth@acme.io',
    split: { sent: 36, opened: 25, replied: 10, starred: 6, spam_rescued: 1 },
  },
  {
    id: 'mb-5',
    email: 'partnerships@acme.co',
    split: { sent: 28, opened: 19, replied: 7, starred: 4, spam_rescued: 1 },
  },
  {
    id: 'mb-6',
    email: 'hello@acme.co',
    split: { sent: 22, opened: 14, replied: 5, starred: 3, spam_rescued: 0 },
  },
];

/** Fraction of each action's volume routed through the "core" peer segment. */
const CORE_FRACTION: Record<ActionId, number> = {
  sent: 0.62,
  opened: 0.6,
  replied: 0.58,
  starred: 0.64,
  spam_rescued: 0.5,
};

function buildMock(): FlowMock {
  // 1. Action totals = column sums of the per-mailbox split table.
  const actions: ActionNode[] = ACTION_DEFS.map((a) => ({
    id: a.id,
    label: a.label,
    volume: MAILBOX_DEFS.reduce((s, m) => s + m.split[a.id], 0),
  }));

  // 2. Mailbox totals = row sums.
  const mailboxes: MailboxNode[] = MAILBOX_DEFS.map((m) => ({
    id: m.id,
    email: m.email,
    volume: (Object.values(m.split) as number[]).reduce((s, v) => s + v, 0),
  }));

  const links: FlowLink[] = [];

  // 3. Stage-0 ribbons: mailbox → action (skip zero cells).
  for (const m of MAILBOX_DEFS) {
    for (const a of ACTION_DEFS) {
      const v = m.split[a.id];
      if (v <= 0) continue;
      links.push({
        id: `${m.id}->${a.id}`,
        from: m.id,
        to: a.id,
        value: v,
        stage: 0,
      });
    }
  }

  // 4. Stage-1 ribbons: action → one of two peer-pool segments.
  let coreTotal = 0;
  let edgeTotal = 0;
  for (const a of actions) {
    const core = Math.round(a.volume * CORE_FRACTION[a.id]);
    const edge = a.volume - core;
    coreTotal += core;
    edgeTotal += edge;
    if (core > 0)
      links.push({
        id: `${a.id}->pr-core`,
        from: a.id,
        to: 'pr-core',
        value: core,
        stage: 1,
      });
    if (edge > 0)
      links.push({
        id: `${a.id}->pr-edge`,
        from: a.id,
        to: 'pr-edge',
        value: edge,
        stage: 1,
      });
  }

  const peers: PeerNode[] = [
    { id: 'pr-core', label: 'Core group', volume: coreTotal },
    { id: 'pr-edge', label: 'Rotation group', volume: edgeTotal },
  ];

  const events24h = actions.reduce((s, a) => s + a.volume, 0);

  return {
    windowLabel: 'Last 24 hours',
    events24h,
    throughputPerHr: Math.round(events24h / 24),
    mailboxCount: 15,
    activeCount: 14,
    peerPoolSize: 1240,
    mailboxes,
    actions,
    peers,
    links,
  };
}

const MOCK: FlowMock = buildMock();

// ---------------------------------------------------------------------------
// Theme — hex mirrors of Tailwind tokens (SVG fills can't read class tokens).
// accent resolves via CSS var at the wrapper; these are the static fallbacks.
// ---------------------------------------------------------------------------

const HEX = {
  a2: '#FF8A4B', // accent2  — Sent
  accent: '#F26522', // accent   — Opened
  a4: '#ffd54f', // accent4  — Replied
  a3: '#ff6b4a', // accent3  — Spam-rescued
  dim: '#8888a0', // text-dim — Starred / structural
  surface2: '#1a1a26',
  border: '#2a2a3a',
} as const;

const TONE_HEX: Record<Tone, string> = {
  a2: HEX.a2,
  accent: HEX.accent,
  a4: HEX.a4,
  a3: HEX.a3,
  dim: HEX.dim,
};

const ACTION_TONE: Record<ActionId, Tone> = {
  sent: 'a2',
  opened: 'accent',
  replied: 'a4',
  starred: 'dim',
  spam_rescued: 'a3',
};

const ACTION_TEXT: Record<ActionId, string> = {
  sent: 'text-accent2',
  opened: 'text-accent',
  replied: 'text-accent4',
  starred: 'text-text-dim',
  spam_rescued: 'text-accent3',
};

const ACTION_ICON: Record<ActionId, typeof Mail> = {
  sent: Mail,
  opened: MailOpen,
  replied: ReplyIcon,
  starred: Star,
  spam_rescued: ShieldAlert,
};

// ---------------------------------------------------------------------------
// Layout maths — pure, deterministic Sankey placement.
//
// ViewBox is a fixed coordinate system the stage scales to fit. Each column
// stacks its nodes top-to-bottom; a node's HEIGHT is proportional to its
// volume share of the busiest column, so the three columns read as one
// conserved flow. Ribbon endpoints are sub-slices of the node faces.
// ---------------------------------------------------------------------------

const VB_W = 1000;
const VB_H = 620;
const PAD_Y = 26;
const NODE_W = 18;
const COL_X = [70, 492, 912] as const; // left edge of each column's node bar
const GAP = 12; // vertical gap between stacked nodes in a column

interface PlacedNode {
  id: string;
  /** Column index 0/1/2. */
  col: 0 | 1 | 2;
  x: number;
  y: number;
  h: number;
  volume: number;
  tone: Tone;
  label: string;
  /** Secondary line (email tail / count). */
  sub: string;
}

interface PlacedLink extends FlowLink {
  /** Cubic-Bézier path string for the ribbon centre-line band. */
  d: string;
  /** Ribbon thickness in viewBox units. */
  width: number;
  tone: Tone;
}

interface FlowLayout {
  nodes: PlacedNode[];
  links: PlacedLink[];
  byId: Map<string, PlacedNode>;
}

/** Stack one column's nodes; returns scale (px per unit-volume). */
function scaleFor(volumes: number[]): number {
  const total = volumes.reduce((s, v) => s + v, 0);
  const usable = VB_H - PAD_Y * 2 - GAP * Math.max(0, volumes.length - 1);
  return total > 0 ? usable / total : 0;
}

function computeLayout(d: FlowMock): FlowLayout {
  const colVols = [
    d.mailboxes.map((m) => m.volume),
    d.actions.map((a) => a.volume),
    d.peers.map((p) => p.volume),
  ];
  // One shared scale (the densest column) keeps ribbons volume-true across
  // all three stages rather than re-normalising per column.
  const scale = Math.min(...colVols.map((vs) => scaleFor(vs)));

  const nodes: PlacedNode[] = [];
  const byId = new Map<string, PlacedNode>();

  const stack = (
    items: { id: string; volume: number; tone: Tone; label: string; sub: string }[],
    col: 0 | 1 | 2,
  ) => {
    const totalH =
      items.reduce((s, it) => s + it.volume * scale, 0) +
      GAP * Math.max(0, items.length - 1);
    let cursor = PAD_Y + (VB_H - PAD_Y * 2 - totalH) / 2; // vertically centred
    for (const it of items) {
      const h = Math.max(8, it.volume * scale);
      const n: PlacedNode = {
        id: it.id,
        col,
        x: COL_X[col],
        y: cursor,
        h,
        volume: it.volume,
        tone: it.tone,
        label: it.label,
        sub: it.sub,
      };
      nodes.push(n);
      byId.set(n.id, n);
      cursor += h + GAP;
    }
  };

  stack(
    d.mailboxes.map((m) => ({
      id: m.id,
      volume: m.volume,
      tone: 'dim' as Tone,
      label: m.email.split('@')[0] ?? m.email,
      sub: `@${m.email.split('@')[1] ?? ''}`,
    })),
    0,
  );
  stack(
    d.actions.map((a) => ({
      id: a.id,
      volume: a.volume,
      tone: ACTION_TONE[a.id],
      label: a.label,
      sub: `${a.volume}`,
    })),
    1,
  );
  stack(
    d.peers.map((p) => ({
      id: p.id,
      volume: p.volume,
      tone: 'accent' as Tone,
      label: p.label,
      sub: `${p.volume}`,
    })),
    2,
  );

  // Per-node running offsets so stacked ribbons tile the node face exactly.
  const outOff = new Map<string, number>();
  const inOff = new Map<string, number>();

  // Order links by source-then-target stack position for tidy, non-crossing
  // ribbon fans (classic Sankey ribbon ordering).
  const ordered = [...d.links].sort((l1, l2) => {
    if (l1.stage !== l2.stage) return l1.stage - l2.stage;
    const a = byId.get(l1.from)!.y - byId.get(l2.from)!.y;
    if (a !== 0) return a;
    return byId.get(l1.to)!.y - byId.get(l2.to)!.y;
  });

  const links: PlacedLink[] = ordered.map((lk) => {
    const src = byId.get(lk.from)!;
    const dst = byId.get(lk.to)!;
    const w = Math.max(1.5, lk.value * scale);

    const so = outOff.get(src.id) ?? 0;
    const di = inOff.get(dst.id) ?? 0;
    outOff.set(src.id, so + w);
    inOff.set(dst.id, di + w);

    const y1 = src.y + so + w / 2;
    const y2 = dst.y + di + w / 2;
    const x1 = src.x + NODE_W; // leave source node's right face
    const x2 = dst.x; // arrive at dest node's left face
    const dx = (x2 - x1) * 0.5; // horizontal Bézier handle length

    const tone: Tone =
      lk.stage === 0
        ? ACTION_TONE[lk.to as ActionId]
        : ACTION_TONE[lk.from as ActionId];

    return {
      ...lk,
      width: w,
      tone,
      d: `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`,
    };
  });

  return { nodes, links, byId };
}

// ---------------------------------------------------------------------------
// Connected-path resolver — given a focused node OR link, returns the set of
// node + link ids on its full upstream→downstream path.
// ---------------------------------------------------------------------------

interface FocusSet {
  nodes: Set<string>;
  links: Set<string>;
}

function pathForNode(id: string, layout: FlowLayout): FocusSet {
  const nodes = new Set<string>([id]);
  const links = new Set<string>();
  const node = layout.byId.get(id);
  if (!node) return { nodes, links };

  if (node.col === 0) {
    // Mailbox → its actions → those actions' peers.
    for (const l of layout.links) {
      if (l.from === id) {
        links.add(l.id);
        nodes.add(l.to);
        for (const l2 of layout.links)
          if (l2.from === l.to) {
            links.add(l2.id);
            nodes.add(l2.to);
          }
      }
    }
  } else if (node.col === 1) {
    // Action → upstream mailboxes + downstream peers.
    for (const l of layout.links) {
      if (l.to === id || l.from === id) {
        links.add(l.id);
        nodes.add(l.from);
        nodes.add(l.to);
      }
    }
  } else {
    // Peer ← its actions ← those actions' mailboxes.
    for (const l of layout.links) {
      if (l.to === id) {
        links.add(l.id);
        nodes.add(l.from);
        for (const l2 of layout.links)
          if (l2.to === l.from) {
            links.add(l2.id);
            nodes.add(l2.from);
          }
      }
    }
  }
  return { nodes, links };
}

function pathForLink(id: string, layout: FlowLayout): FocusSet {
  const link = layout.links.find((l) => l.id === id);
  if (!link) return { nodes: new Set(), links: new Set() };
  const a = pathForNode(link.from, layout);
  const b = pathForNode(link.to, layout);
  return {
    nodes: new Set([...a.nodes, ...b.nodes]),
    links: new Set([...a.links, ...b.links, id]),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusAct3Flow(): JSX.Element {
  const d = MOCK;
  const layout = useMemo(() => computeLayout(d), [d]);

  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);

  const focus: FocusSet | null = useMemo(() => {
    if (hoverNode) return pathForNode(hoverNode, layout);
    if (hoverLink) return pathForLink(hoverLink, layout);
    return null;
  }, [hoverNode, hoverLink, layout]);

  const sent = d.actions.find((a) => a.id === 'sent')?.volume ?? 0;
  const opened = d.actions.find((a) => a.id === 'opened')?.volume ?? 0;
  const replied = d.actions.find((a) => a.id === 'replied')?.volume ?? 0;

  return (
    <div className="space-y-5">
      {/* Slim summary header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Waypoints className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Warmup activity flow
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Volumetric view of the warmup engine — your mailboxes flow into
            actions, actions flow into the helper-inbox network.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label={d.windowLabel} value={`${d.events24h} events`} accent />
          <StatChip label="Throughput" value={`${d.throughputPerHr}/hr`} />
          <StatChip
            label="Warming"
            value={`${d.activeCount}/${d.mailboxCount}`}
          />
        </div>
      </motion.header>

      {/* Conversion funnel strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <FunnelStat
          label="Sent"
          value={sent}
          caption="entered the flow"
          tone="a2"
          pct={100}
        />
        <FunnelStat
          label="Sent → Opened"
          value={opened}
          caption={`${pct(opened, sent)}% open rate`}
          tone="accent"
          pct={pct(opened, sent)}
        />
        <FunnelStat
          label="Sent → Replied"
          value={replied}
          caption={`${pct(replied, sent)}% reply rate`}
          tone="a4"
          pct={pct(replied, sent)}
        />
      </motion.div>

      {/* Flow stage + side panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
      >
        <div className="relative xl:col-span-8">
          <FlowStage
            layout={layout}
            focus={focus}
            onHoverNode={setHoverNode}
            onHoverLink={setHoverLink}
          />
        </div>
        <div className="xl:col-span-4">
          <SidePanel data={d} layout={layout} focusNode={hoverNode} />
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header stat chip
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
// Conversion funnel stat tile
// ---------------------------------------------------------------------------

function FunnelStat({
  label,
  value,
  caption,
  tone,
  pct: barPct,
}: {
  label: string;
  value: number;
  caption: string;
  tone: Tone;
  pct: number;
}) {
  const color = TONE_HEX[tone];
  return (
    <div className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-text-dim">
          {label}
        </span>
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
      </div>
      <motion.p
        className="mt-1 text-2xl font-semibold tabular-nums leading-none text-text"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
      >
        {value}
      </motion.p>
      <p className="mt-1 text-xs text-text-dim">{caption}</p>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, barPct)}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The flow stage (fixed-height SVG Sankey scene)
// ---------------------------------------------------------------------------

function FlowStage({
  layout,
  focus,
  onHoverNode,
  onHoverLink,
}: {
  layout: FlowLayout;
  focus: FocusSet | null;
  onHoverNode: (id: string | null) => void;
  onHoverLink: (id: string | null) => void;
}) {
  const dimmed = (kind: 'node' | 'link', id: string): boolean => {
    if (!focus) return false;
    return kind === 'node' ? !focus.nodes.has(id) : !focus.links.has(id);
  };

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* soft directional bloom under the action column */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle at center, ${HEX.accent}1a 0%, transparent 72%)` }}
      />

      {/* Column captions (HTML overlay — crisper than SVG text) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-3 text-[11px] uppercase tracking-wider text-text-dim">
        <span className="flex items-center gap-1.5">
          <Inbox className="h-3 w-3 text-text-dim" />
          Mailboxes
        </span>
        <span className="flex items-center gap-1.5">
          <GitBranch className="h-3 w-3 text-accent" />
          Actions
        </span>
        <span className="flex items-center gap-1.5">
          <Network className="h-3 w-3 text-accent" />
          Helper network
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Warmup activity Sankey: mailboxes flow into action types, action types flow into the helper-inbox network"
      >
        <defs>
          {/* Per-tone ribbon gradients (source-tinted → dest-tinted). */}
          {(['a2', 'accent', 'a4', 'a3', 'dim'] as Tone[]).map((t) => (
            <linearGradient
              key={t}
              id={`flow-rib-${t}`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor={TONE_HEX[t]} stopOpacity={0.16} />
              <stop offset="50%" stopColor={TONE_HEX[t]} stopOpacity={0.42} />
              <stop offset="100%" stopColor={TONE_HEX[t]} stopOpacity={0.16} />
            </linearGradient>
          ))}
        </defs>

        {/* RIBBONS (drawn first so nodes sit on top of their endpoints) */}
        {layout.links.map((l, i) => (
          <Ribbon
            key={l.id}
            link={l}
            index={i}
            dim={dimmed('link', l.id)}
            active={!!focus && focus.links.has(l.id)}
            onEnter={() => onHoverLink(l.id)}
            onLeave={() => onHoverLink(null)}
          />
        ))}

        {/* NODES */}
        {layout.nodes.map((n, i) => (
          <NodeBar
            key={n.id}
            node={n}
            index={i}
            dim={dimmed('node', n.id)}
            active={!!focus && focus.nodes.has(n.id)}
            onEnter={() => onHoverNode(n.id)}
            onLeave={() => onHoverNode(null)}
          />
        ))}
      </svg>

      {/* Legend (overlaid bottom-left) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.95 }}
        className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-2.5 backdrop-blur-xl"
      >
        {ACTION_DEFS.map((a) => (
          <span
            key={a.id}
            className="flex items-center gap-1.5 text-[11px] text-text"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: TONE_HEX[a.tone] }}
              aria-hidden
            />
            {a.label}
          </span>
        ))}
        <span className="ml-1 border-l border-border-muted pl-3 text-[11px] text-text-dim">
          Ribbon width = volume
        </span>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ribbon — a cubic-Bézier band with a draw-in + travelling dash-flow particle
// ---------------------------------------------------------------------------

function Ribbon({
  link,
  index,
  dim,
  active,
  onEnter,
  onLeave,
}: {
  link: PlacedLink;
  index: number;
  dim: boolean;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const color = TONE_HEX[link.tone];
  const delay = 0.35 + (link.stage === 0 ? index : index + 6) * 0.035;

  return (
    <g
      style={{ cursor: 'pointer' }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      opacity={dim ? 0.07 : 1}
    >
      {/* invisible fat hit-area so thin ribbons stay hoverable */}
      <path
        d={link.d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(link.width, 14)}
      />

      {/* the volume band itself */}
      <motion.path
        d={link.d}
        fill="none"
        stroke={active ? color : `url(#flow-rib-${link.tone})`}
        strokeWidth={link.width}
        strokeLinecap="butt"
        strokeOpacity={active ? 0.8 : 1}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          pathLength: { duration: 0.9, ease: 'easeInOut', delay },
          opacity: { duration: 0.3, delay },
        }}
      />

      {/* travelling throughput particle (a short dash sliding the path) */}
      <motion.path
        d={link.d}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(2, link.width * 0.4)}
        strokeLinecap="round"
        strokeOpacity={dim ? 0 : active ? 0.95 : 0.5}
        strokeDasharray="2 70"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -144 }}
        transition={{
          duration: 2.4 + (index % 5) * 0.45,
          ease: 'linear',
          repeat: Infinity,
          delay: delay + 0.6,
        }}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Node bar — a rounded rect with an HTML label via foreignObject
// ---------------------------------------------------------------------------

function NodeBar({
  node,
  index,
  dim,
  active,
  onEnter,
  onLeave,
}: {
  node: PlacedNode;
  index: number;
  dim: boolean;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const color = TONE_HEX[node.tone];
  const labelLeft = node.col === 2; // peer column labels sit to the LEFT
  const labelW = 168;
  const lx = labelLeft ? node.x - labelW - 12 : node.x + NODE_W + 12;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: dim ? 0.28 : 1, scale: 1 }}
      transition={{
        opacity: { duration: 0.3 },
        scale: {
          duration: 0.5,
          delay: 0.12 + index * 0.04,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{ cursor: 'pointer', transformOrigin: `${node.x}px ${node.y}px` }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      tabIndex={0}
      role="button"
      aria-label={`${node.label}, ${node.volume} events`}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      {active && (
        <rect
          x={node.x - 3}
          y={node.y - 3}
          width={NODE_W + 6}
          height={node.h + 6}
          rx={6}
          fill="none"
          stroke={color}
          strokeOpacity={0.5}
          strokeWidth={1.5}
        />
      )}
      <rect
        x={node.x}
        y={node.y}
        width={NODE_W}
        height={node.h}
        rx={4}
        fill={color}
        fillOpacity={active ? 0.95 : 0.78}
      />

      {/* label card */}
      <foreignObject
        x={lx}
        y={node.y + node.h / 2 - 17}
        width={labelW}
        height={34}
      >
        <div
          className={`flex h-full items-center gap-2 ${
            labelLeft ? 'flex-row-reverse text-right' : ''
          }`}
        >
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold leading-tight text-text">
              {node.label}
            </span>
            <span className="block truncate text-[10px] leading-tight text-text-dim">
              {node.sub}
            </span>
          </span>
        </div>
      </foreignObject>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Side panel — overview by default; focused conversion read-out on hover
// ---------------------------------------------------------------------------

function SidePanel({
  data,
  layout,
  focusNode,
}: {
  data: FlowMock;
  layout: FlowLayout;
  focusNode: string | null;
}) {
  const focused = focusNode ? layout.byId.get(focusNode) ?? null : null;

  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {focused ? (
          <motion.div
            key={focused.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col"
          >
            <FocusDetail node={focused} data={data} layout={layout} />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="flex h-full flex-col"
          >
            <FlowOverview data={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FlowOverview({ data }: { data: FlowMock }) {
  const sent = data.actions.find((a) => a.id === 'sent')?.volume ?? 0;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Waypoints className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">Flow summary</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Hover any node or ribbon to trace its path.
        </p>
      </header>

      <div className="space-y-3 p-5">
        <OverviewRow
          label="Helper-inbox network"
          value={`${formatNumber(data.peerPoolSize)} inboxes`}
          sub="the warmup moat"
        />
        <OverviewRow
          label="Events in window"
          value={`${data.events24h}`}
          sub={`${data.throughputPerHr}/hr average throughput`}
        />
        <OverviewRow
          label="Mailboxes feeding flow"
          value={`${data.activeCount} / ${data.mailboxCount}`}
          sub="actively warming"
        />
      </div>

      <div className="mt-auto border-t border-white/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
            Action breakdown
          </span>
        </div>
        <ul className="space-y-2">
          {data.actions.map((a) => {
            const Icon = ACTION_ICON[a.id];
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border-muted bg-surface-2/40 p-3"
              >
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                  style={{
                    background: `${TONE_HEX[ACTION_TONE[a.id]]}26`,
                    color: TONE_HEX[ACTION_TONE[a.id]],
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-text">{a.label}</span>
                    <span
                      className={`font-semibold tabular-nums ${ACTION_TEXT[a.id]}`}
                    >
                      {a.volume}
                    </span>
                  </p>
                  <p className="text-xs text-text-dim">
                    {pct(a.volume, sent)}% of sent volume
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

function FocusDetail({
  node,
  data,
  layout,
}: {
  node: PlacedNode;
  data: FlowMock;
  layout: FlowLayout;
}) {
  const colLabel =
    node.col === 0 ? 'Mailbox' : node.col === 1 ? 'Action type' : 'Peer segment';

  // Downstream (col 0/1) or upstream (col 2) link breakdown for this node.
  const related = layout.links
    .filter((l) =>
      node.col === 2 ? l.to === node.id : l.from === node.id,
    )
    .map((l) => {
      const otherId = node.col === 2 ? l.from : l.to;
      const other = layout.byId.get(otherId)!;
      return { other, value: l.value, tone: l.tone };
    })
    .sort((a, b) => b.value - a.value);

  // For a mailbox, surface its sent→opened→replied funnel.
  const funnel =
    node.col === 0 ? mailboxFunnel(node.id, layout) : null;

  return (
    <>
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-text-dim">
            {colLabel}
          </span>
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: TONE_HEX[node.tone] }}
            aria-hidden
          />
        </div>
        <h2 className="mt-1 truncate text-lg font-semibold text-text">
          {node.label}
        </h2>
        <p className="text-xs text-text-dim">
          {node.volume} events · {pct(node.volume, data.events24h)}% of total
          flow
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {funnel && (
          <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
            <p className="mb-3 text-xs uppercase tracking-wider text-text-dim">
              Conversion funnel
            </p>
            <FunnelBar
              label="Sent"
              value={funnel.sent}
              base={funnel.sent}
              tone="a2"
            />
            <FunnelBar
              label="Opened"
              value={funnel.opened}
              base={funnel.sent}
              tone="accent"
            />
            <FunnelBar
              label="Replied"
              value={funnel.replied}
              base={funnel.sent}
              tone="a4"
            />
          </div>
        )}

        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <p className="mb-2.5 text-xs uppercase tracking-wider text-text-dim">
            {node.col === 2 ? 'Fed by' : 'Flows into'}
          </p>
          <ul className="space-y-2">
            {related.map((r) => (
              <li
                key={r.other.id}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: TONE_HEX[r.tone] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-text">
                  {r.other.label}
                </span>
                <ArrowRight className="h-3 w-3 shrink-0 text-text-dim" />
                <span className="shrink-0 font-semibold tabular-nums text-text">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

function FunnelBar({
  label,
  value,
  base,
  tone,
}: {
  label: string;
  value: number;
  base: number;
  tone: Tone;
}) {
  const color = TONE_HEX[tone];
  const w = base > 0 ? Math.round((value / base) * 100) : 0;
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-text-dim">{label}</span>
        <span className="font-semibold tabular-nums text-text">
          {value}
          <span className="ml-1 text-text-dim">({w}%)</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, w)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Sent / opened / replied counts for one mailbox's outgoing ribbons. */
function mailboxFunnel(
  mailboxId: string,
  layout: FlowLayout,
): { sent: number; opened: number; replied: number } {
  let sent = 0;
  let opened = 0;
  let replied = 0;
  for (const l of layout.links) {
    if (l.stage !== 0 || l.from !== mailboxId) continue;
    if (l.to === 'sent') sent += l.value;
    else if (l.to === 'opened') opened += l.value;
    else if (l.to === 'replied') replied += l.value;
  }
  return { sent, opened, replied };
}

export default ProPlusAct3Flow;
