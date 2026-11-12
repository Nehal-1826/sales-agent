import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CircleDot,
  Compass,
  DollarSign,
  Globe2,
  Heart,
  Inbox,
  Mail,
  MapPin,
  Minus,
  Radar,
  ShieldAlert,
  Siren,
  Sparkles,
  Target,
  Thermometer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/lib/format';

/**
 * AgDshD3Tiered — Agency-tier dashboard variant D3, "Tiered Status Constellation".
 *
 * The Agency tier ships a fleet of sub-clients under one workspace. The agency
 * owner is a triage operator more than a portfolio manager — when something
 * goes wrong with a sub-client's deliverability, they need to spot it from
 * across the room. This dashboard turns the portfolio into a SAFETY MAP:
 *
 *   - Three concentric STATUS RINGS form the constellation. The reading rule
 *     is dead-simple: closer to the centre = safer. The further out, the more
 *     attention the node needs.
 *   - INNER ring (radius 160) holds HEALTHY sub-clients — the green zone.
 *   - MIDDLE ring (radius 240) holds WARMING sub-clients — the yellow zone.
 *   - OUTER ring (radius 320) holds AT-RISK sub-clients — the red zone.
 *
 * Compared with the C1 (sector-wedge) and C2 (revenue-stratified) variants,
 * this layout abandons MRR as the spatial driver entirely. Distance from the
 * centre means HEALTH, not money. Two sub-clients with the same status sit on
 * the same ring no matter how much revenue separates them — the chart is
 * answering "where do I need to look?" not "where is the money?".
 *
 * Composition:
 *   - CENTRE (radius 0–75): the AGENCY CORE pulses with an accent-tinted disc,
 *     showing the agency name, sub-client count and a small "safe zone"
 *     compass glyph. A slow expanding halo communicates a steady heartbeat.
 *
 *   - THREE CONCENTRIC RINGS (radii 160 / 240 / 320): each ring is a faint
 *     dashed circle with eight decorative tick marks at 45° intervals. A
 *     small monospace zone label sits at the top of each ring ("HEALTHY",
 *     "WARMING", "AT-RISK"). Behind each ring sits a wide annulus tinted in
 *     the ring's status colour — very low opacity so the page never feels
 *     bright, but enough to give the canvas three visible safety bands.
 *
 *   - 8 SUB-CLIENT NODES distributed by status onto their ring:
 *       5 healthy nodes on the inner ring at -90 + i*72° (top-anchored, even).
 *       2 warming nodes on the middle ring at -45° and 135° (opposite sides).
 *       1 at-risk node (Atlas) on the outer ring at 0° (right side).
 *     Each node carries a status-tinted disc with a logoChar + an OUTER
 *     CARTOUCHE radially outward holding the sub-client name, warmth and
 *     mailbox count. The at-risk node carries a continuous, pronounced alarm
 *     ring pulse (scale 1 → 1.3 → 1, 1.8s loop) — the danger zone gets the
 *     loudest visual treatment in this variant.
 *
 *   - SPOKES (status-tinted, opacity ~0.4) run from the core out to each node,
 *     drawing in on mount with a pathLength stagger. They do NOT cross — every
 *     spoke is radial.
 *
 *   - Subtle rotation: the whole ring set drifts at ~60s/revolution. Barely
 *     perceptible; it gives the canvas a living quality without dragging the
 *     eye. The nodes themselves do not rotate, only the ring scaffolding.
 *
 * Top header: agency name + region pill + 4 KPI tiles + MoM growth chip.
 * Right inspector (lg:col-span-4): default = "Distribution overview" with a
 * 3-bar histogram of nodes per status tier and a recent-alerts ticker. On
 * node click → cross-fades to a status-tinted sub-client detail card with
 * MRR contribution, 7-day warmth sparkline, quick-stat grid and any open
 * alerts on that account.
 * Bottom strip: legend explaining the tier system ("Closer to centre = safer
 * · Outer ring needs attention") + ring-occupancy chips.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props. The
 * harness mounts it prop-less; every value comes from the inline MOCK const.
 * Renders only page content; the shell supplies sidebar / chrome.
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
// MOCK data — 8 sub-clients distributed across three status tiers.
//   Inner ring (5): Helix 89, Nimbus 86, Orion 91, Quasar 82, Lyra 84.
//   Middle ring (2): Vega 72, Pixel 65.
//   Outer ring (1): Atlas 48 (the at-risk node).
// KPI aggregates are computed from the sub-client list so the header band
// stays consistent with the spatial scene below.
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
    avgWarmth: 72,
    status: 'warming',
    last7dTrend: [66, 67, 68, 69, 70, 71, 72],
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
    avgWarmth: 48,
    status: 'at_risk',
    last7dTrend: [62, 60, 58, 55, 52, 50, 48],
    monthlyMrrUsd: 240,
    lastActivityAgo: '1h ago',
  },
  {
    id: 'sc-pixel',
    name: 'Pixel Forge',
    logoChar: 'PF',
    mailboxCount: 5,
    avgWarmth: 65,
    status: 'warming',
    last7dTrend: [56, 58, 60, 62, 63, 64, 65],
    monthlyMrrUsd: 180,
    lastActivityAgo: '2h ago',
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
    message: 'Failure rate 7.4% on outreach@atlas-bio.com (24h window)',
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
    message: '2 helper inboxes deactivated in workspace helper group',
    ago: '3h ago',
    severity: 'warn',
  },
];

const MOCK: AgencyDashData = {
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

export const AGENCY_DASHBOARD_SKELETON_D3: AgencyDashData = {
  workspace: { name: 'Your agency', subClientCount: 0, mailboxCount: 0 },
  kpis: {
    totalMailboxes: 0,
    avgWarmth: 0,
    mailboxesAtRisk: 0,
    activeSubClients: 0,
    mrrUsd: 0,
    momGrowthPct: 0,
  },
  subClients: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#26d281', // healthy (green)
  accent2: '#FF9670', // info / cyan accent
  accent3: '#ff6b4a', // at_risk (red)
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

const STATUS_ZONE_LABEL: Record<SubClientStatus, string> = {
  healthy: 'HEALTHY',
  warming: 'WARMING',
  at_risk: 'AT-RISK',
};

const ALERT_ICON: Record<AlertKind, typeof AlertTriangle> = {
  mailbox_paused: AlertTriangle,
  bounce_spike: TrendingUp,
  peer_failed: Users,
  dns_break: ShieldAlert,
};

const ALERT_LABEL: Record<AlertKind, string> = {
  mailbox_paused: 'Mailbox paused',
  bounce_spike: 'Failure spike',
  peer_failed: 'Helper failed',
  dns_break: 'Domain records (DNS) break',
};

/**
 * Canvas geometry — origin is centred at (0,0); viewBox is
 * "-VB_HALF -VB_HALF VB VB" (square, centred on origin) so the SVG draws
 * comfortably around the centre without any +X/+Y translation maths in
 * every coordinate.
 *
 * VB is sized so the outermost cartouches — which sit at radius
 * {@link CARTOUCHE_BASE_R} plus their own width — never clip beyond the
 * viewBox. CARTOUCHE_BASE_R (380) + CARTOUCHE_W (120) = 500, so VB_HALF
 * must be at least 500. We use 510 for a comfortable 10 vbu margin.
 */
const VB = 1020;
const VB_HALF = VB / 2;
const CORE_R = 75;
const RING_INNER = 160; // healthy zone
const RING_MIDDLE = 240; // warming zone
const RING_OUTER = 320; // at-risk zone

const RING_RADIUS: Record<SubClientStatus, number> = {
  healthy: RING_INNER,
  warming: RING_MIDDLE,
  at_risk: RING_OUTER,
};

const NODE_R_MIN = 22;
const NODE_R_MAX = 40;
/** Mailbox count that maps to the upper end of the node-radius range. */
const NODE_R_REF = 22;

/** Cartouche geometry — these are also referenced by the collision-avoidance
 *  pass in {@link place}, so keep them in sync with {@link CartoucheCard}. */
const CARTOUCHE_W = 120;
const CARTOUCHE_H = 40;
/** Cartouche centres start at this radius — comfortably beyond the outer ring
 *  (320) and its zone-wash (360) so labels never sit ON a ring. */
const CARTOUCHE_BASE_R = 380;
/** Greedy collision pass pushes overlapping cartouches outward by this step
 *  (viewBox units) until they no longer intersect a previously-placed bbox. */
const CARTOUCHE_PUSH_STEP = 32;
/** Maximum number of push iterations per cartouche — a safety guard against
 *  pathological inputs (e.g. dozens of nodes clumped at the same angle). */
const CARTOUCHE_MAX_PUSH = 8;
/** Angular tolerance for treating a node as "top" or "bottom" — within this
 *  many degrees of -90 / +90 the cartouche uses text-anchor="middle" so the
 *  label reads symmetrically rather than veering off-axis. */
const CARTOUCHE_MIDDLE_DEG = 22;

type CartoucheAnchor = 'start' | 'middle' | 'end';

interface Placed {
  id: string;
  client: AgencyDashData['subClients'][number];
  ring: SubClientStatus;
  angleRad: number;
  /** Angle in degrees from the +X axis (math convention). */
  angleDeg: number;
  x: number;
  y: number;
  /** Node radius in viewBox units, scales with mailbox count (22–40). */
  r: number;
  /** Radial distance from origin at which the cartouche centre sits. Computed
   *  by {@link place} so every cartouche begins beyond the outer ring then
   *  shifted further out by the collision pass if it would overlap another. */
  cartoucheRadius: number;
  /** Cartouche centre coordinates after the collision-avoidance pass. */
  cartoucheX: number;
  cartoucheY: number;
  /** SVG text-anchor for the cartouche text — derived from the angle so the
   *  cartouche always opens AWAY from the canvas centre. */
  cartoucheAnchor: CartoucheAnchor;
  /** When the cartouche sits above the y-axis centre line we flip the vertical
   *  alignment so the rectangle stacks upward; otherwise it stacks downward. */
  cartoucheAbove: boolean;
}

/**
 * Status-aware radial placement.
 *
 * Each status owns its ring and the sub-clients on that ring are spread
 * around it on fixed anchor angles:
 *   - HEALTHY (5 slots): starts at top (-90°) and steps +72°.
 *   - WARMING (2 slots): -45° and +135° (opposite corners).
 *   - AT-RISK (1 slot): +0° (3 o'clock, right side).
 *
 * If a ring has more or fewer nodes than its anchor list, slots are
 * regenerated as an even sweep starting from the first anchor — so a
 * skeleton with 0 clients renders cleanly and a future MOCK with extra
 * at-risk nodes still finds spots without overlapping.
 */
function place(clients: AgencyDashData['subClients']): Placed[] {
  const byStatus: Record<SubClientStatus, AgencyDashData['subClients']> = {
    healthy: clients.filter((c) => c.status === 'healthy'),
    warming: clients.filter((c) => c.status === 'warming'),
    at_risk: clients.filter((c) => c.status === 'at_risk'),
  };

  const anchors: Record<SubClientStatus, number[]> = {
    healthy: [-90, -18, 54, 126, 198], // -90 + i*72 for i in 0..4
    warming: [-45, 135],
    at_risk: [0],
  };

  const placed: Placed[] = [];
  (Object.keys(byStatus) as SubClientStatus[]).forEach((status) => {
    const list = byStatus[status];
    if (list.length === 0) return;
    const radius = RING_RADIUS[status];
    const baseAnchors = anchors[status];
    const angles: number[] =
      list.length === baseAnchors.length
        ? baseAnchors
        : Array.from({ length: list.length }, (_, i) => {
            const first = baseAnchors[0] ?? -90;
            const step = 360 / list.length;
            return first + step * i;
          });
    list.forEach((client, i) => {
      const angDeg = angles[i] ?? -90 + (360 / list.length) * i;
      const angRad = (angDeg * Math.PI) / 180;
      const vol = Math.min(client.mailboxCount / NODE_R_REF, 1);
      const r = NODE_R_MIN + vol * (NODE_R_MAX - NODE_R_MIN);
      const cx = radius * Math.cos(angRad);
      const cy = radius * Math.sin(angRad);
      // Cartouche centre starts on a virtual ring beyond the outer ring so
      // labels never sit on top of any ring/zone wash. The collision pass
      // below may bump this further out if neighbours overlap.
      const cartoucheRadius = CARTOUCHE_BASE_R;
      const ccx = cartoucheRadius * Math.cos(angRad);
      const ccy = cartoucheRadius * Math.sin(angRad);
      // Anchor based on the node hemisphere. Nodes near 12 / 6 o'clock read
      // best with centred text; otherwise the cartouche extends away from
      // the canvas centre.
      const normAng = ((angDeg + 180) % 360) - 180;
      const nearTop = Math.abs(normAng + 90) <= CARTOUCHE_MIDDLE_DEG;
      const nearBottom = Math.abs(normAng - 90) <= CARTOUCHE_MIDDLE_DEG;
      const anchor: CartoucheAnchor =
        nearTop || nearBottom ? 'middle' : Math.cos(angRad) >= 0 ? 'start' : 'end';
      placed.push({
        id: client.id,
        client,
        ring: status,
        angleRad: angRad,
        angleDeg: angDeg,
        x: cx,
        y: cy,
        r,
        cartoucheRadius,
        cartoucheX: ccx,
        cartoucheY: ccy,
        cartoucheAnchor: anchor,
        cartoucheAbove: Math.sin(angRad) < 0,
      });
    });
  });

  // Greedy collision-avoidance pass — sort by angle so adjacent cartouches
  // are compared in order, then walk through and push any cartouche that
  // would overlap a previously-placed bbox further out radially. Stops at
  // CARTOUCHE_MAX_PUSH iterations per cartouche so pathological inputs can't
  // create runaway layouts.
  const sorted = placed.slice().sort((a, b) => a.angleDeg - b.angleDeg);
  const accepted: Placed[] = [];
  for (const p of sorted) {
    let bbox = cartoucheBbox(p);
    let pushes = 0;
    while (
      pushes < CARTOUCHE_MAX_PUSH &&
      accepted.some((q) => bboxesOverlap(bbox, cartoucheBbox(q)))
    ) {
      p.cartoucheRadius += CARTOUCHE_PUSH_STEP;
      p.cartoucheX = p.cartoucheRadius * Math.cos(p.angleRad);
      p.cartoucheY = p.cartoucheRadius * Math.sin(p.angleRad);
      bbox = cartoucheBbox(p);
      pushes += 1;
    }
    accepted.push(p);
  }

  return placed;
}

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Compute the axis-aligned bounding box of a cartouche given its anchor side.
 *  Keep this in sync with the offsetX/offsetY arithmetic inside
 *  {@link CartoucheCard} — the geometry must match for collision detection
 *  to mean anything. */
function cartoucheBbox(p: Placed): Bbox {
  const W = CARTOUCHE_W;
  const H = CARTOUCHE_H;
  const cx = p.cartoucheX;
  const cy = p.cartoucheY;
  let x0: number;
  let x1: number;
  if (p.cartoucheAnchor === 'middle') {
    x0 = cx - W / 2;
    x1 = cx + W / 2;
  } else if (p.cartoucheAnchor === 'start') {
    x0 = cx;
    x1 = cx + W;
  } else {
    x0 = cx - W;
    x1 = cx;
  }
  const y0 = p.cartoucheAbove ? cy - H - 4 : cy + 4;
  const y1 = y0 + H;
  // Pad the bbox by 6 viewBox units to give a little breathing room between
  // adjacent cartouches even when they "just touch".
  return { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6 };
}

function bboxesOverlap(a: Bbox, b: Bbox): boolean {
  return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
}

function fmtUsd(n: number): string {
  return formatMoney(n);
}

/**
 * Order on which animation stagger fires. Healthy first (calming establishing
 * shot of the safe zone), then warming, then at-risk last (so the danger
 * nodes feel like they "arrive" with weight, never blink in first).
 */
const STAGGER_ORDER: SubClientStatus[] = ['healthy', 'warming', 'at_risk'];

function staggerIndex(placedItem: Placed, all: Placed[]): number {
  const buckets: Record<SubClientStatus, Placed[]> = {
    healthy: [],
    warming: [],
    at_risk: [],
  };
  all.forEach((p) => buckets[p.ring].push(p));
  let count = 0;
  for (const status of STAGGER_ORDER) {
    if (status === placedItem.ring) {
      return count + buckets[status].findIndex((p) => p.id === placedItem.id);
    }
    count += buckets[status].length;
  }
  return count;
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

export function AgDshD3Tiered({
  data,
}: { data?: AgencyDashData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const placed = useMemo(() => place(d.subClients), [d.subClients]);
  const [selectedSubClientId, setSelectedSubClientId] = useState<string | null>(
    null,
  );
  const [hoverId, setHoverId] = useState<string | null>(null);

  const selected = useMemo(
    () => placed.find((p) => p.id === selectedSubClientId)?.client ?? null,
    [placed, selectedSubClientId],
  );

  // Per-tier aggregates fed into the bottom rail + inspector histogram.
  const tierCounts = useMemo(
    () => ({
      healthy: placed.filter((p) => p.ring === 'healthy').length,
      warming: placed.filter((p) => p.ring === 'warming').length,
      at_risk: placed.filter((p) => p.ring === 'at_risk').length,
    }),
    [placed],
  );

  const tierMailboxes = useMemo(
    () => ({
      healthy: placed
        .filter((p) => p.ring === 'healthy')
        .reduce((s, p) => s + p.client.mailboxCount, 0),
      warming: placed
        .filter((p) => p.ring === 'warming')
        .reduce((s, p) => s + p.client.mailboxCount, 0),
      at_risk: placed
        .filter((p) => p.ring === 'at_risk')
        .reduce((s, p) => s + p.client.mailboxCount, 0),
    }),
    [placed],
  );

  return (
    <div className="space-y-5">
      {/* Top header: agency identity + KPI tile rail */}
      <HeaderBand data={d} />

      {/* Stage + side inspector */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-8 space-y-3">
          <div className="relative">
            <ConstellationStage
              data={d}
              placed={placed}
              selectedId={selectedSubClientId}
              hoverId={hoverId}
              onSelect={setSelectedSubClientId}
              onHover={setHoverId}
            />
            <StageAnnotation
              healthyCount={tierCounts.healthy}
              warmingCount={tierCounts.warming}
              atRiskCount={tierCounts.at_risk}
            />
            <RingLegend />
          </div>
          <Legend />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            client={selected}
            data={d}
            placed={placed}
            tierCounts={tierCounts}
            tierMailboxes={tierMailboxes}
            onClose={() => setSelectedSubClientId(null)}
          />
        </div>
      </motion.div>

      {/* Bottom rail — tier explanation + occupancy chips */}
      <BottomRail
        data={d}
        tierCounts={tierCounts}
        tierMailboxes={tierMailboxes}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top header band
// ---------------------------------------------------------------------------

function HeaderBand({ data }: { data: AgencyDashData }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
              <Target className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {data.workspace.name || 'Your agency'}
            </h1>
            <Badge variant="blue">
              <Sparkles className="h-3 w-3" />
              Agency
            </Badge>
            <span className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/60 px-2.5 py-0.5 text-[11px] text-text-dim backdrop-blur-xl">
              <Globe2 className="h-3 w-3" />
              Global · all regions
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Three concentric rings — closer to the centre is safer, the outer
            ring needs attention. Click any node to drill in.
          </p>
        </div>
        <DeltaChip delta={data.kpis.momGrowthPct} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={Inbox}
          label="Total mailboxes"
          value={String(data.kpis.totalMailboxes)}
          sub={`${data.workspace.subClientCount} sub-clients`}
          accent="accent2"
        />
        <KpiTile
          icon={Thermometer}
          label="Average warmth"
          value={String(data.kpis.avgWarmth)}
          sub="weighted by mailbox count"
          accent={data.kpis.avgWarmth >= 75 ? 'accent' : 'accent4'}
        />
        <KpiTile
          icon={Siren}
          label="Mailboxes at risk"
          value={String(data.kpis.mailboxesAtRisk)}
          sub={`${data.subClients.filter((c) => c.status === 'at_risk').length} accounts in red zone`}
          accent={data.kpis.mailboxesAtRisk > 0 ? 'accent3' : 'accent'}
        />
        <KpiTile
          icon={DollarSign}
          label="Monthly MRR"
          value={fmtUsd(data.kpis.mrrUsd)}
          sub={`${data.kpis.activeSubClients} active accounts`}
          accent="accent2"
        />
      </div>
    </motion.header>
  );
}

function DeltaChip({ delta }: { delta: number }) {
  const positive = delta > 0;
  const flat = delta === 0;
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? 'border-border-muted bg-surface-2/60 text-text-dim'
    : positive
      ? 'border-accent/30 bg-accent/10 text-accent'
      : 'border-accent3/30 bg-accent3/10 text-accent3';
  return (
    <span
      className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs backdrop-blur-xl ${tone}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono font-semibold tabular-nums">
        {positive ? '+' : ''}
        {delta.toFixed(1)}%
      </span>
      <span className="text-text-dim">MoM</span>
    </span>
  );
}

type KpiAccent = 'accent' | 'accent2' | 'accent3' | 'accent4' | 'dim';

const KPI_TONE: Record<KpiAccent, string> = {
  accent: 'text-accent',
  accent2: 'text-accent2',
  accent3: 'text-accent3',
  accent4: 'text-accent4',
  dim: 'text-text-dim',
};

const KPI_TONE_BG: Record<KpiAccent, string> = {
  accent: 'border-accent/30 bg-accent/5',
  accent2: 'border-accent2/30 bg-accent2/5',
  accent3: 'border-accent3/30 bg-accent3/5',
  accent4: 'border-accent4/30 bg-accent4/5',
  dim: 'border-border-muted bg-surface-2/40',
};

function KpiTile({
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
  accent: KpiAccent;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg border ${KPI_TONE_BG[accent]} ${KPI_TONE[accent]}`}
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

// ---------------------------------------------------------------------------
// Stage annotation (top-left overlay on the canvas)
// ---------------------------------------------------------------------------

function StageAnnotation({
  healthyCount,
  warmingCount,
  atRiskCount,
}: {
  healthyCount: number;
  warmingCount: number;
  atRiskCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.8 }}
      className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-border-muted bg-surface/70 px-3 py-1.5 backdrop-blur-xl"
    >
      <Radar className="h-3 w-3 text-accent2" />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-dim">
        Inner {healthyCount} · Mid {warmingCount} · Outer {atRiskCount}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Ring legend overlay (top-right) — the tier labels live here instead of on
// the rings themselves so they can never collide with node cartouches.
// ---------------------------------------------------------------------------

function RingLegend() {
  const tiers: Array<{ status: SubClientStatus; ring: string; label: string }> = [
    { status: 'healthy', ring: 'Inner', label: STATUS_ZONE_LABEL.healthy },
    { status: 'warming', ring: 'Middle', label: STATUS_ZONE_LABEL.warming },
    { status: 'at_risk', ring: 'Outer', label: STATUS_ZONE_LABEL.at_risk },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.85 }}
      className="pointer-events-none absolute right-4 top-4 flex flex-col gap-1.5 rounded-xl border border-border-muted bg-surface/80 px-3 py-2.5 backdrop-blur-xl"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
        Ring tiers
      </span>
      {tiers.map((t) => (
        <span
          key={t.status}
          className="flex items-center gap-2 font-mono text-[10px] tracking-[0.16em]"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: STATUS_HEX[t.status] }}
            aria-hidden
          />
          <span className="text-text-dim">{t.ring}</span>
          <span
            className="font-semibold"
            style={{ color: STATUS_HEX[t.status] }}
          >
            {t.label}
          </span>
        </span>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Status-rings legend strip — explains the colour-coded zones and the central
// "closer = safer" reading rule. Mirrors the top-right RingLegend in container
// chrome but speaks to the safety-tier semantics rather than the ring labels
// themselves. Rendered as a horizontal strip BELOW the constellation canvas
// (a normal block-level sibling, not an absolute overlay) so it can never
// overlap with sub-client cartouches that sit on the virtual outer ring.
// ---------------------------------------------------------------------------

function Legend() {
  const rows: Array<{
    color: string;
    label: string;
    description?: string;
  }> = [
    {
      color: HEX.accent,
      label: 'Healthy',
      description: 'warmth ≥ 75 · safe zone',
    },
    {
      color: HEX.accent4,
      label: 'Warming',
      description: '60–74 · building up',
    },
    {
      color: HEX.accent3,
      label: 'At risk',
      description: '< 60 · needs attention',
    },
    {
      color: HEX.accent2,
      label: 'Closer to centre = safer',
    },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.9 }}
      className="rounded-xl border border-border-muted bg-surface/60 p-3 backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-1.5">
          <Compass className="h-3 w-3 text-text-dim" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
            Status rings
          </span>
        </div>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center gap-2 text-xs text-text-dim"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: row.color }}
              aria-hidden
            />
            <span className="font-medium text-text">{row.label}</span>
            {row.description ? (
              <span className="text-text-dim">{row.description}</span>
            ) : null}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Stage — the SVG constellation
// ---------------------------------------------------------------------------

function ConstellationStage({
  data,
  placed,
  selectedId,
  hoverId,
  onSelect,
  onHover,
}: {
  data: AgencyDashData;
  placed: Placed[];
  selectedId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="relative h-[760px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(140,140,160,0.32) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Soft radial bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[52%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle at center, ${HEX.accent2}1f 0%, transparent 72%)` }}
      />

      <svg
        viewBox={`-${VB_HALF} -${VB_HALF} ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Agency tiered constellation: ${data.workspace.name} with ${data.workspace.subClientCount} sub-clients placed on three concentric safety rings`}
      >
        <defs>
          <radialGradient id="d3-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.95} />
            <stop offset="60%" stopColor={HEX.accent2} stopOpacity={0.3} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
          {/* Zone wash gradients — drawn behind each ring so the canvas
              communicates "safe / warming / danger" at a single glance. */}
          <radialGradient id="d3-zone-healthy" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.05} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="d3-zone-warming" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent4} stopOpacity={0.0} />
            <stop offset="55%" stopColor={HEX.accent4} stopOpacity={0.05} />
            <stop offset="100%" stopColor={HEX.accent4} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="d3-zone-atrisk" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent3} stopOpacity={0} />
            <stop offset="60%" stopColor={HEX.accent3} stopOpacity={0.04} />
            <stop offset="80%" stopColor={HEX.accent3} stopOpacity={0.08} />
            <stop offset="100%" stopColor={HEX.accent3} stopOpacity={0} />
          </radialGradient>
          {/* Per-status node fills (used by NodeGlyph). */}
          <radialGradient id="d3-node-healthy" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.42} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.08} />
          </radialGradient>
          <radialGradient id="d3-node-warming" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={HEX.accent4} stopOpacity={0.4} />
            <stop offset="100%" stopColor={HEX.accent4} stopOpacity={0.08} />
          </radialGradient>
          <radialGradient id="d3-node-atrisk" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={HEX.accent3} stopOpacity={0.45} />
            <stop offset="100%" stopColor={HEX.accent3} stopOpacity={0.08} />
          </radialGradient>
        </defs>

        {/* Zone washes — drawn behind the rings as wide annuli. We layer three
            full discs at decreasing radii so the colours blend smoothly without
            any visible boundary line. */}
        <circle cx={0} cy={0} r={RING_OUTER + 40} fill="url(#d3-zone-atrisk)" />
        <circle
          cx={0}
          cy={0}
          r={RING_MIDDLE + 30}
          fill="url(#d3-zone-warming)"
        />
        <circle
          cx={0}
          cy={0}
          r={RING_INNER + 20}
          fill="url(#d3-zone-healthy)"
        />

        {/* The whole ring-set rotates slowly — only the scaffolding, not the
            nodes — to give the canvas a subtly living quality. */}
        <motion.g
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 60, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: '0px 0px' }}
        >
          <RingScaffold
            radius={RING_INNER}
            status="healthy"
            tickColor={HEX.accent}
            labelDelay={0.45}
          />
          <RingScaffold
            radius={RING_MIDDLE}
            status="warming"
            tickColor={HEX.accent4}
            labelDelay={0.55}
          />
          <RingScaffold
            radius={RING_OUTER}
            status="at_risk"
            tickColor={HEX.accent3}
            labelDelay={0.65}
          />
        </motion.g>

        {/* Radial spokes core → node. Drawn outside the rotating group so the
            spokes track the (non-rotating) nodes precisely. */}
        {placed.map((p, i) => (
          <SpokeLine
            key={`sp-${p.id}`}
            placed={p}
            index={i}
            focused={selectedId === p.id || hoverId === p.id}
            dimmed={
              (selectedId !== null || hoverId !== null) &&
              selectedId !== p.id &&
              hoverId !== p.id
            }
          />
        ))}

        {/* Sub-client nodes — render at-risk LAST so its pulse halo sits on top
            and never gets clipped by adjacent healthy nodes' discs. */}
        {placed
          .slice()
          .sort((a, b) => {
            const order: Record<SubClientStatus, number> = {
              healthy: 0,
              warming: 1,
              at_risk: 2,
            };
            return order[a.ring] - order[b.ring];
          })
          .map((p) => (
            <NodeGlyph
              key={p.id}
              placed={p}
              staggerIdx={staggerIndex(p, placed)}
              selected={selectedId === p.id}
              hovered={hoverId === p.id}
              faded={
                (selectedId !== null || hoverId !== null) &&
                selectedId !== p.id &&
                hoverId !== p.id
              }
              onSelect={() =>
                onSelect(p.id === selectedId ? null : p.id)
              }
              onHover={onHover}
            />
          ))}

        {/* The agency core */}
        <CoreGlyph data={data} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ring scaffolding — dashed circle, decorative ticks, top-of-ring label
// ---------------------------------------------------------------------------

function RingScaffold({
  radius,
  status,
  tickColor,
  labelDelay,
}: {
  radius: number;
  status: SubClientStatus;
  tickColor: string;
  labelDelay: number;
}) {
  // Eight decorative tick marks at 45° intervals. The tier label that used
  // to live at -90° has been moved out of the SVG into the {@link RingLegend}
  // HTML overlay so it can never collide with a sub-client cartouche at the
  // same angle (see "alignment" fix).
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const angDeg = -90 + i * 45;
    const angRad = (angDeg * Math.PI) / 180;
    const inner = radius - 6;
    const outer = radius + 6;
    return {
      x1: inner * Math.cos(angRad),
      y1: inner * Math.sin(angRad),
      x2: outer * Math.cos(angRad),
      y2: outer * Math.sin(angRad),
    };
  });

  const opacityByStatus: Record<SubClientStatus, number> = {
    healthy: 0.35,
    warming: 0.42,
    at_risk: 0.5,
  };

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: labelDelay, ease: 'easeOut' }}
    >
      {/* The dashed orbit circle itself */}
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill="none"
        stroke={tickColor}
        strokeOpacity={opacityByStatus[status]}
        strokeWidth={1.1}
        strokeDasharray="3 8"
      />
      {/* Decorative tick marks */}
      {ticks.map((t, i) => (
        <line
          key={`tk-${radius}-${i}`}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={tickColor}
          strokeOpacity={0.45}
          strokeWidth={1}
          strokeLinecap="round"
        />
      ))}
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Radial spoke from core to a node
// ---------------------------------------------------------------------------

function SpokeLine({
  placed,
  index,
  focused,
  dimmed,
}: {
  placed: Placed;
  index: number;
  focused: boolean;
  dimmed: boolean;
}) {
  const color = STATUS_HEX[placed.client.status];
  // Spoke endpoints stop short of both the core edge and the node edge so we
  // don't paint over the disc strokes.
  const startMul = (CORE_R + 4) / RING_RADIUS[placed.ring];
  const endMul = (RING_RADIUS[placed.ring] - placed.r - 4) / RING_RADIUS[placed.ring];
  const x1 = placed.x * startMul;
  const y1 = placed.y * startMul;
  const x2 = placed.x * endMul;
  const y2 = placed.y * endMul;
  const baseOpacity = dimmed ? 0.08 : focused ? 0.75 : 0.4;
  const baseWidth = focused ? 2.2 : 1.4;

  return (
    <g>
      {/* Static spoke that draws in on mount via pathLength. */}
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeOpacity={baseOpacity}
        strokeWidth={baseWidth}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: baseOpacity }}
        transition={{
          duration: 0.7,
          delay: 0.4 + index * 0.06,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
      {/* Activity flux travelling along the wire — gives a sense of live signal
          flowing core → node. */}
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeOpacity={dimmed ? 0 : focused ? 0.85 : 0.55}
        strokeWidth={focused ? 2.5 : 1.6}
        strokeLinecap="round"
        strokeDasharray="2.5 44"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -94 }}
        transition={{
          duration: 3 + (index % 5) * 0.4,
          ease: 'linear',
          repeat: Infinity,
        }}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Agency core glyph
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: AgencyDashData }) {
  return (
    <g>
      {/* Expanding pulse halo — gives the centre a heartbeat. */}
      <motion.circle
        cx={0}
        cy={0}
        r={CORE_R}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.45 }}
        animate={{ scale: 2.2, opacity: 0 }}
        transition={{ duration: 3.6, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: '0px 0px' }}
      />
      {/* Soft outer bloom */}
      <circle cx={0} cy={0} r={CORE_R * 1.85} fill="url(#d3-core)" />
      {/* Main disc */}
      <motion.circle
        cx={0}
        cy={0}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.accent2}
        strokeWidth={2}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '0px 0px' }}
      />
      {/* "SAFE ZONE" eyebrow */}
      <text
        x={0}
        y={-32}
        textAnchor="middle"
        fill={HEX.accent2}
        style={{
          fontSize: 9,
          letterSpacing: 1.8,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        SAFE ZONE
      </text>
      <text
        x={0}
        y={-12}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {truncate(data.workspace.name || 'Your agency', 16)}
      </text>
      <text
        x={0}
        y={8}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 11 }}
      >
        {data.workspace.subClientCount} sub-clients
      </text>
      <text
        x={0}
        y={26}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 11 }}
      >
        {data.workspace.mailboxCount} mailboxes
      </text>
      <text
        x={0}
        y={45}
        textAnchor="middle"
        fill="#5a5a72"
        style={{
          fontSize: 8,
          letterSpacing: 1.4,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        CLOSER = SAFER
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
  staggerIdx,
  selected,
  hovered,
  faded,
  onSelect,
  onHover,
}: {
  placed: Placed;
  staggerIdx: number;
  selected: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { id, client, ring, x, y, r, cartoucheX, cartoucheY, cartoucheAnchor, cartoucheAbove } = placed;
  const color = STATUS_HEX[client.status];
  const lifted = selected || hovered;
  const atRisk = client.status === 'at_risk';
  const nodeGradient =
    ring === 'healthy'
      ? 'url(#d3-node-healthy)'
      : ring === 'warming'
        ? 'url(#d3-node-warming)'
        : 'url(#d3-node-atrisk)';

  const baseOpacity = faded ? 0.32 : 1;

  // Connector segment from the node edge to the cartouche edge — the
  // cartouche now sits beyond the outer ring (see CARTOUCHE_BASE_R) and the
  // collision-avoidance pass may push it even further out, so a thin tether
  // keeps the visual link from node → label intact.
  const unit = useMemo(() => {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }, [x, y]);
  const connectorStart = useMemo(
    () => ({ x: x + unit.x * (r + 2), y: y + unit.y * (r + 2) }),
    [x, y, unit, r],
  );
  // Pull the connector all the way to a point a few px outside the cartouche
  // rectangle. The cartouche position is the rect's anchor corner (or middle
  // for the centred case), so derive the end point from cartoucheAnchor.
  const connectorEnd = useMemo(() => {
    const dist = Math.hypot(cartoucheX - x, cartoucheY - y);
    const back = 6; // step back from the cartouche rect by this many viewBox units
    const t = Math.max(0, (dist - back) / Math.max(dist, 1));
    return {
      x: x + (cartoucheX - x) * t,
      y: y + (cartoucheY - y) * t,
    };
  }, [x, y, cartoucheX, cartoucheY]);

  // `outline: 'none'` on the <motion.g> wrapper below suppresses the
  // browser's default focus ring. Without it, click/focus draws a large
  // bounding-box rectangle around the whole group (node + tether +
  // cartouche). Selection emphasis is carried by the node halo and the
  // cartouche stroke instead.
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: baseOpacity,
        scale: 1,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: {
          duration: 0.55,
          delay: 0.55 + staggerIdx * 0.07,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{ cursor: 'pointer', outline: 'none' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${client.name}, status ${STATUS_LABEL[client.status]}, ${client.mailboxCount} mailboxes, warmth ${client.avgWarmth}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      {/* Pronounced at-risk alarm ring — scale-pulse 1 → 1.3 → 1 over 1.8s.
          This is the loudest visual treatment in this variant; the outer ring
          is the danger zone, so we lean into it. */}
      {atRisk && (
        <>
          <motion.circle
            cx={x}
            cy={y}
            r={r + 10}
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            initial={{ scale: 1, opacity: 0.65 }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.65, 0, 0.65] }}
            transition={{
              duration: 1.8,
              ease: 'easeOut',
              repeat: Infinity,
            }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
          <motion.circle
            cx={x}
            cy={y}
            r={r + 6}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeOpacity={0.55}
            animate={{ scale: [1, 1.18, 1] }}
            transition={{
              duration: 1.8,
              ease: 'easeOut',
              repeat: Infinity,
            }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        </>
      )}

      {/* Selection sonar ping ring */}
      {selected && (
        <motion.circle
          cx={x}
          cy={y}
          r={r + 4}
          fill="none"
          stroke={color}
          strokeWidth={2}
          initial={{ scale: 1, opacity: 0.65 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}

      {/* Hover ring */}
      {lifted && !atRisk && (
        <circle
          cx={x}
          cy={y}
          r={r + 8}
          fill="none"
          stroke={color}
          strokeOpacity={0.45}
          strokeWidth={1.5}
        />
      )}

      {/* Outer stroke ring — sits just outside the disc to read as a "halo". */}
      <circle
        cx={x}
        cy={y}
        r={r + 4}
        fill="none"
        stroke={color}
        strokeOpacity={selected ? 0.7 : 0.42}
        strokeWidth={1.2}
      />

      {/* Gradient-filled disc */}
      <circle cx={x} cy={y} r={r + 1} fill={nodeGradient} />
      {/* Surface disc with status-tinted stroke */}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={HEX.surface2}
        stroke={color}
        strokeWidth={selected ? 2.6 : lifted ? 2.2 : 1.7}
      />

      {/* LogoChar centred */}
      <text
        x={x}
        y={y + r * 0.28}
        textAnchor="middle"
        fill={color}
        style={{
          fontSize: r * 0.78,
          fontWeight: 700,
          letterSpacing: -0.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {client.logoChar}
      </text>

      {/* Connector line — thin tether from the node edge to the cartouche so
          the label still reads as "belonging to" the node even when the
          collision pass has pushed the cartouche several rings outward.
          When the node is hovered or selected the tether brightens and
          thickens to draw the eye from node → cartouche; otherwise it sits
          at a low, unobtrusive opacity. */}
      <line
        x1={connectorStart.x}
        y1={connectorStart.y}
        x2={connectorEnd.x}
        y2={connectorEnd.y}
        stroke={color}
        strokeOpacity={selected || hovered ? 0.55 : 0.28}
        strokeWidth={selected || hovered ? 1.2 : 0.9}
        strokeDasharray="2 3"
        strokeLinecap="round"
      />
      {/* Cartouche beyond the outer ring: a bordered card with rows for
          name, warmth, and mailbox count. The dashed connector tether
          (above) and the cartouche's own stroke both brighten on
          hover/selected to signal focus. The SVG <title> child surfaces
          the full name on hover for any name truncated to 14 chars. */}
      <CartoucheCard
        cx={cartoucheX}
        cy={cartoucheY}
        anchor={cartoucheAnchor}
        above={cartoucheAbove}
        color={color}
        client={client}
        selected={selected}
        hovered={hovered}
      />
    </motion.g>
  );
}

/**
 * Cartouche — the bordered label "card" outside each node. The cartouche
 * sits beyond the outer ring (radius >= {@link CARTOUCHE_BASE_R}) so it
 * never overlays any ring scaffolding. The card is a rounded rectangle
 * (status-tinted stroke, dark fill) sized to {@link CARTOUCHE_W} × {@link
 * CARTOUCHE_H} — also the footprint used by the collision-avoidance pass.
 * Inside the card sit three pieces of text: the sub-client name, the warmth
 * value (status-tinted), and the mailbox count. The `anchor` prop drives
 * the horizontal text alignment; the `above` prop flips the vertical
 * stacking so the rows stack away from the canvas centre. The `selected`
 * and `hovered` props brighten the card's stroke when the owning node is
 * focused so the cartouche reads as part of that node's emphasis state.
 */
function CartoucheCard({
  cx,
  cy,
  anchor,
  above,
  color,
  client,
  selected,
  hovered,
}: {
  cx: number;
  cy: number;
  anchor: CartoucheAnchor;
  above: boolean;
  color: string;
  client: AgencyDashData['subClients'][number];
  selected: boolean;
  hovered: boolean;
}) {
  const W = CARTOUCHE_W;
  const H = CARTOUCHE_H;
  const lifted = selected || hovered;
  // Virtual left edge of the label region derived from anchor: start → grow
  // right, end → grow left, middle → centre on cx (used for nodes near 12 /
  // 6 o'clock). The same coordinates drive text placement and the
  // collision-avoidance bbox in {@link cartoucheBbox}; keep them in sync.
  const anchorX = anchor === 'start' ? cx : anchor === 'end' ? cx - W : cx - W / 2;
  const anchorY = above ? cy - H - 4 : cy + 4;
  const padX = 8;
  const isMiddle = anchor === 'middle';
  // Name + warmth share the dominant alignment; mailbox count sits at the
  // opposite edge so the row balances visually. For the centred case both
  // values are placed via a single combined text below the name so there's
  // no horizontal competition.
  const nameX = isMiddle
    ? cx
    : anchor === 'start'
      ? anchorX + padX
      : anchorX + W - padX;
  const warmthX = isMiddle
    ? cx - 14
    : anchor === 'start'
      ? anchorX + padX
      : anchorX + W - padX;
  const mailboxX = isMiddle
    ? cx + 14
    : anchor === 'start'
      ? anchorX + W - padX
      : anchorX + padX;
  const mailboxAnchor: CartoucheAnchor = isMiddle
    ? 'start'
    : anchor === 'start'
      ? 'end'
      : 'start';
  const warmthAnchor: CartoucheAnchor = isMiddle ? 'end' : anchor;
  const truncated = truncate(client.name, 14);
  const isTruncated = truncated !== client.name;

  return (
    <g>
      {/* SVG <title> gives a native browser tooltip on hover for the
          long form of a truncated sub-client name. */}
      {isTruncated && <title>{client.name}</title>}
      {/* Bordered cartouche background — sits behind the label text rows.
          Status-tinted stroke brightens on hover / selected so the cartouche
          reads as part of the focused node's "card". The rect uses the same
          anchor-derived coordinates as the text below; keep both in sync
          with {@link cartoucheBbox} for collision-avoidance to match. */}
      <rect
        x={anchorX}
        y={anchorY}
        width={W}
        height={H}
        rx={8}
        fill={HEX.surface2}
        fillOpacity={0.85}
        stroke={color}
        strokeWidth={lifted ? 1.8 : 1.4}
        strokeOpacity={lifted ? 0.95 : 0.55}
      />
      <text
        x={nameX}
        y={anchorY + 15}
        textAnchor={anchor}
        className="fill-text"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        {truncated}
      </text>
      <text
        x={warmthX}
        y={anchorY + 30}
        textAnchor={warmthAnchor}
        fill={color}
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.5,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        W{client.avgWarmth}
      </text>
      <text
        x={mailboxX}
        y={anchorY + 30}
        textAnchor={mailboxAnchor}
        className="fill-text-dim"
        style={{
          fontSize: 9,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {client.mailboxCount} mb
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Right inspector panel — distribution by default, client detail on select
// ---------------------------------------------------------------------------

function InspectorPanel({
  client,
  data,
  placed,
  tierCounts,
  tierMailboxes,
  onClose,
}: {
  client: AgencyDashData['subClients'][number] | null;
  data: AgencyDashData;
  placed: Placed[];
  tierCounts: Record<SubClientStatus, number>;
  tierMailboxes: Record<SubClientStatus, number>;
  onClose: () => void;
}) {
  return (
    <div className="relative h-[760px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
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
            <ClientDetail client={client} data={data} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div
            key="distribution"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <DistributionOverview
              data={data}
              placed={placed}
              tierCounts={tierCounts}
              tierMailboxes={tierMailboxes}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default inspector — distribution histogram + alerts ticker
// ---------------------------------------------------------------------------

function DistributionOverview({
  data,
  placed,
  tierCounts,
  tierMailboxes,
}: {
  data: AgencyDashData;
  placed: Placed[];
  tierCounts: Record<SubClientStatus, number>;
  tierMailboxes: Record<SubClientStatus, number>;
}) {
  const total = tierCounts.healthy + tierCounts.warming + tierCounts.at_risk;
  const maxCount = Math.max(
    tierCounts.healthy,
    tierCounts.warming,
    tierCounts.at_risk,
    1,
  );
  const bars: Array<{
    status: SubClientStatus;
    label: string;
    count: number;
    mailboxes: number;
  }> = [
    {
      status: 'healthy',
      label: 'Healthy',
      count: tierCounts.healthy,
      mailboxes: tierMailboxes.healthy,
    },
    {
      status: 'warming',
      label: 'Warming',
      count: tierCounts.warming,
      mailboxes: tierMailboxes.warming,
    },
    {
      status: 'at_risk',
      label: 'At risk',
      count: tierCounts.at_risk,
      mailboxes: tierMailboxes.at_risk,
    },
  ];

  const topAlerts = data.alerts.slice(0, 4);
  const innerList = placed.filter((p) => p.ring === 'healthy');
  const middleList = placed.filter((p) => p.ring === 'warming');
  const outerList = placed.filter((p) => p.ring === 'at_risk');

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-accent2" />
          <h2 className="text-base font-semibold text-text">
            Distribution overview
          </h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Sub-clients grouped by safety tier. Select a node to inspect details.
        </p>
      </header>

      <div className="space-y-4 p-5">
        {/* Histogram — one row per tier with a status-tinted bar. */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              Tier distribution
            </span>
            <span className="font-mono text-[10px] tabular-nums text-text-dim">
              {total} clients
            </span>
          </div>
          <ul className="space-y-3">
            {bars.map((b, i) => {
              const widthPct = (b.count / maxCount) * 100;
              const color = STATUS_HEX[b.status];
              return (
                <li key={b.status}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: color }}
                        aria-hidden
                      />
                      <span className="font-medium text-text">{b.label}</span>
                    </span>
                    <span className="font-mono tabular-nums text-text-dim">
                      {b.count} · {b.mailboxes} mb
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{
                        duration: 0.8,
                        delay: 0.12 + i * 0.08,
                        ease: 'easeOut',
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Ring breakdown — three compact sections listing the occupants of
            each ring. Inner ring is the longest list, so it uses a vertical
            list; outer/middle are kept compact. */}
        <RingBreakdown
          status="healthy"
          label="Inner ring · Healthy"
          icon={Heart}
          placed={innerList}
        />
        <RingBreakdown
          status="warming"
          label="Middle ring · Warming"
          icon={Thermometer}
          placed={middleList}
        />
        <RingBreakdown
          status="at_risk"
          label="Outer ring · At risk"
          icon={Siren}
          placed={outerList}
        />
      </div>

      {/* Alerts ticker pinned to the bottom of the panel */}
      <div className="mt-auto border-t border-white/5 p-5">
        <div className="mb-2.5 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-accent3" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            Recent alerts
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

function RingBreakdown({
  status,
  label,
  icon: Icon,
  placed,
}: {
  status: SubClientStatus;
  label: string;
  icon: typeof Activity;
  placed: Placed[];
}) {
  const color = STATUS_HEX[status];
  if (placed.length === 0) {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            <Icon className="h-3 w-3" style={{ color }} />
            {label}
          </span>
          <span className="font-mono text-[10px] text-text-dim">empty</span>
        </div>
        <div className="rounded-xl border border-dashed border-border-muted bg-surface-2/20 px-3 py-2 text-[11px] text-text-dim">
          No sub-clients on this ring.
        </div>
      </section>
    );
  }
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          <Icon className="h-3 w-3" style={{ color }} />
          {label}
        </span>
        <span className="font-mono text-[10px] text-text-dim">
          {placed.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {placed.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
            style={{ borderColor: `${color}33` }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold text-bg"
                style={{ background: color }}
                aria-hidden
              >
                {p.client.logoChar}
              </span>
              <span className="truncate text-xs font-medium text-text">
                {p.client.name}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`font-mono text-[10px] tabular-nums ${STATUS_TEXT[p.client.status]}`}
              >
                W{p.client.avgWarmth}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-text-dim">
                {p.client.mailboxCount}mb
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Client detail (when a node is selected)
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
  const fleetMrr = data.kpis.mrrUsd;
  const fleetPct = fleetMrr
    ? Math.round((client.monthlyMrrUsd / fleetMrr) * 100)
    : 0;
  const alerts = data.alerts.filter((a) => a.subClientId === client.id);
  const firstTrend = client.last7dTrend[0] ?? 0;
  const lastTrend =
    client.last7dTrend[client.last7dTrend.length - 1] ?? firstTrend;
  const trendDelta = lastTrend - firstTrend;

  return (
    <>
      <header
        className="relative flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4"
        // Subtle status-tinted top wash so the panel header announces the tier.
        style={{
          backgroundImage: `linear-gradient(180deg, ${color}14, transparent)`,
        }}
      >
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
        {/* Ring position pill — tells you which tier this client is on. */}
        <div
          className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
          style={{
            borderColor: `${color}40`,
            background: `${color}0d`,
          }}
        >
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5" style={{ color }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              Ring position
            </span>
          </div>
          <span
            className="font-mono text-xs font-semibold"
            style={{ color }}
          >
            {ringNameByStatus(client.status)}
          </span>
        </div>

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
          <WarmthSparkline
            data={client.last7dTrend}
            color={color}
            gradientId={`d3-spark-${client.id}`}
          />
        </div>

        {/* Quick-stat grid */}
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
            label="Last signal"
            value={client.lastActivityAgo}
            sub="warmup activity"
          />
          <StatCell
            icon={MapPin}
            label="Ring tier"
            value={ringNameByStatus(client.status)}
            sub="placement"
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

function ringNameByStatus(status: SubClientStatus): string {
  switch (status) {
    case 'healthy':
      return 'Inner';
    case 'warming':
      return 'Middle';
    case 'at_risk':
      return 'Outer';
  }
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
// Warmth sparkline — custom SVG line chart with cursor tracking. Mouse-moving
// across the chart pins a dashed vertical guide line at the nearest data
// point, a coloured dot on the line, and a floating tooltip showing
// "Day N · W{value}". Built standalone (no recharts) so the cursor behaviour
// matches the exact spec without fighting the recharts internals.
// ---------------------------------------------------------------------------

const SPARK_W = 320;
const SPARK_H = 90;
const SPARK_PAD_X = 6;
const SPARK_PAD_Y = 8;

function WarmthSparkline({
  data,
  color,
  gradientId,
}: {
  data: number[];
  color: string;
  gradientId: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Normalise to (x, y) in viewBox space. We pad the vertical range by 6
  // either side so the sparkline never hugs the top/bottom edge.
  const { points, lineD, areaD } = useMemo(() => {
    if (data.length === 0) {
      return {
        points: [] as Array<{ x: number; y: number; v: number }>,
        lineD: '',
        areaD: '',
      };
    }
    const lo = Math.min(...data);
    const hi = Math.max(...data);
    const range = Math.max(hi - lo, 1) + 12; // +6 padding either side
    const mn = lo - 6;
    const innerH = SPARK_H - SPARK_PAD_Y * 2;
    const innerW = SPARK_W - SPARK_PAD_X * 2;
    const denom = Math.max(data.length - 1, 1);
    const xFn = (i: number) => SPARK_PAD_X + (i / denom) * innerW;
    const yFn = (v: number) =>
      SPARK_PAD_Y + innerH - ((v - mn) / range) * innerH;
    const pts = data.map((v, i) => ({ x: xFn(i), y: yFn(v), v }));
    const line = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    const area = `${line} L${pts[pts.length - 1]!.x.toFixed(2)} ${SPARK_H - SPARK_PAD_Y} L${pts[0]!.x.toFixed(2)} ${SPARK_H - SPARK_PAD_Y} Z`;
    return { points: pts, lineD: line, areaD: area };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="mt-2 h-[90px] w-full" aria-hidden>
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        />
      </div>
    );
  }

  const handleMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(xPct * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };
  const handleLeave = () => setHoverIdx(null);

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  // Anchor the tooltip on whichever side of the chart has more room so it
  // never clips beyond the sparkline canvas.
  const tooltipOnLeft = hoverPoint ? hoverPoint.x > SPARK_W * 0.6 : false;

  return (
    <div className="relative mt-2 h-[90px] w-full">
      <svg
        viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
        className="h-full w-full cursor-crosshair"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        role="img"
        aria-label={`7-day warmth sparkline: ${data.join(', ')}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.42} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {/* Area fill under the line */}
        <motion.path
          d={areaD}
          fill={`url(#${gradientId})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        {/* The line itself — draws on mount via pathLength */}
        <motion.path
          d={lineD}
          fill="none"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* Cursor guide + active dot when the mouse is over the chart */}
        {hoverPoint && (
          <g>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={SPARK_PAD_Y - 2}
              y2={SPARK_H - SPARK_PAD_Y + 2}
              stroke={color}
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
            <circle
              cx={hoverPoint.x}
              cy={hoverPoint.y}
              r={4.5}
              fill={HEX.surface2}
              stroke={color}
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {/* Floating tooltip overlay — positioned absolutely so it lives outside
          the SVG viewBox transform and reads at native font size. */}
      {hoverPoint && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-1 flex flex-col rounded-lg border border-border-muted bg-surface-2/95 px-2 py-1 text-[10px] backdrop-blur-xl"
          style={{
            left: tooltipOnLeft
              ? undefined
              : `calc(${(hoverPoint.x / SPARK_W) * 100}% + 8px)`,
            right: tooltipOnLeft
              ? `calc(${((SPARK_W - hoverPoint.x) / SPARK_W) * 100}% + 8px)`
              : undefined,
          }}
        >
          <span className="font-mono uppercase tracking-[0.18em] text-text-dim">
            Day {hoverIdx + 1}
          </span>
          <span
            className="font-mono text-sm font-semibold tabular-nums"
            style={{ color }}
          >
            W{hoverPoint.v}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail — legend strip + per-ring occupancy chips
// ---------------------------------------------------------------------------

function BottomRail({
  data,
  tierCounts,
  tierMailboxes,
}: {
  data: AgencyDashData;
  tierCounts: Record<SubClientStatus, number>;
  tierMailboxes: Record<SubClientStatus, number>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.18 }}
      className="grid grid-cols-1 gap-3 lg:grid-cols-4"
    >
      <TierChip
        status="healthy"
        label="Inner ring · Healthy"
        sub="Closer to centre · safe"
        count={tierCounts.healthy}
        mailboxes={tierMailboxes.healthy}
      />
      <TierChip
        status="warming"
        label="Middle ring · Warming"
        sub="Mid-distance · building up"
        count={tierCounts.warming}
        mailboxes={tierMailboxes.warming}
      />
      <TierChip
        status="at_risk"
        label="Outer ring · At risk"
        sub="Furthest out · needs attention"
        count={tierCounts.at_risk}
        mailboxes={tierMailboxes.at_risk}
      />
      <div className="flex flex-col justify-between gap-2 rounded-xl border border-accent2/30 bg-accent2/5 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <Mail className="h-3.5 w-3.5" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            Reading the chart
          </span>
        </div>
        <p className="text-xs leading-relaxed text-text-dim">
          Closer to centre = safer · outer ring needs attention. Total fleet:{' '}
          <span className="font-mono font-semibold text-text">
            {data.kpis.totalMailboxes}
          </span>{' '}
          mailboxes across{' '}
          <span className="font-mono font-semibold text-text">
            {data.workspace.subClientCount}
          </span>{' '}
          sub-clients.
        </p>
      </div>
    </motion.div>
  );
}

function TierChip({
  status,
  label,
  sub,
  count,
  mailboxes,
}: {
  status: SubClientStatus;
  label: string;
  sub: string;
  count: number;
  mailboxes: number;
}) {
  const color = STATUS_HEX[status];
  const toneText = STATUS_TEXT[status];
  return (
    <div
      className="rounded-xl border bg-surface/60 p-4 backdrop-blur-xl"
      style={{ borderColor: `${color}40` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 place-items-center rounded-lg border"
          style={{ borderColor: `${color}55`, background: `${color}14`, color }}
        >
          <CircleDot className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p
          className={`font-mono text-2xl font-semibold tabular-nums leading-none ${toneText}`}
        >
          {count}
        </p>
        <span className="font-mono text-[10px] tabular-nums text-text-dim">
          {mailboxes} mb
        </span>
      </div>
      <p className="mt-1 text-[11px] text-text-dim">{sub}</p>
    </div>
  );
}

export default AgDshD3Tiered;
