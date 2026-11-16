import { useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  GitBranch,
  Heart,
  Mailbox,
  Minus,
  Orbit,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/**
 * AgDashC3Branches — Agency-tier dashboard variant C3, "Health-Branched
 * Constellation".
 *
 * The Agency tier ships a fleet of sub-clients under one workspace. This
 * variant is the THIRD entry in the constellation family of Agency dashboards.
 * Where C1 and C2 use a single ring and concentric rings respectively, C3 is
 * a TRI-PRONG / Y-shaped delta: the central AGENCY core forks outward into
 * THREE branch trunks, one per health tier (HEALTHY east, WARMING north,
 * AT-RISK west). Each branch terminates at a sector hub disc, around which
 * the sub-clients of that tier orbit as a mini sub-constellation. The visual
 * reads as a triage view — "where do my problems live?" at a glance.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Every value comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies the
 * sidebar / chrome. Node coordinates are computed deterministically (trig on
 * the array index) — no layout libraries.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency dashboard variants. Keep in
// sync with AgDash1Portfolio / AgDash2Bridge / AgDash3Manager / AgDash4Tenant
// and any other Agency dashboard variants.
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
// MOCK — 9 sub-clients (6 healthy / 2 warming / 1 at-risk). KPIs are derived
// from this set so the header band stays internally consistent with the
// nodes drawn on the canvas.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyDashData['subClients'] = [
  // ----- Healthy (6) — east branch
  {
    id: 'sc-lumen',
    name: 'Lumen Labs',
    logoChar: 'LL',
    mailboxCount: 14,
    avgWarmth: 88,
    status: 'healthy',
    last7dTrend: [80, 82, 83, 85, 86, 87, 88],
    monthlyMrrUsd: 720,
    lastActivityAgo: '4m ago',
  },
  {
    id: 'sc-northwind',
    name: 'Northwind',
    logoChar: 'NW',
    mailboxCount: 22,
    avgWarmth: 84,
    status: 'healthy',
    last7dTrend: [78, 80, 81, 82, 83, 83, 84],
    monthlyMrrUsd: 1080,
    lastActivityAgo: '1m ago',
  },
  {
    id: 'sc-orbit',
    name: 'Orbit Studio',
    logoChar: 'OS',
    mailboxCount: 9,
    avgWarmth: 82,
    status: 'healthy',
    last7dTrend: [74, 76, 77, 78, 80, 81, 82],
    monthlyMrrUsd: 460,
    lastActivityAgo: '7m ago',
  },
  {
    id: 'sc-vela',
    name: 'Vela & Co',
    logoChar: 'VC',
    mailboxCount: 11,
    avgWarmth: 80,
    status: 'healthy',
    last7dTrend: [72, 74, 75, 77, 78, 79, 80],
    monthlyMrrUsd: 540,
    lastActivityAgo: '2m ago',
  },
  {
    id: 'sc-pinwheel',
    name: 'Pinwheel',
    logoChar: 'PW',
    mailboxCount: 7,
    avgWarmth: 78,
    status: 'healthy',
    last7dTrend: [69, 71, 73, 74, 76, 77, 78],
    monthlyMrrUsd: 360,
    lastActivityAgo: '11m ago',
  },
  {
    id: 'sc-ember',
    name: 'Ember Mfg',
    logoChar: 'EM',
    mailboxCount: 16,
    avgWarmth: 76,
    status: 'healthy',
    last7dTrend: [69, 70, 72, 73, 74, 75, 76],
    monthlyMrrUsd: 820,
    lastActivityAgo: '5m ago',
  },
  // ----- Warming (2) — north branch
  {
    id: 'sc-cascade',
    name: 'Cascade Studio',
    logoChar: 'CS',
    mailboxCount: 6,
    avgWarmth: 62,
    status: 'warming',
    last7dTrend: [48, 51, 54, 56, 58, 60, 62],
    monthlyMrrUsd: 320,
    lastActivityAgo: '23m ago',
  },
  {
    id: 'sc-meridian',
    name: 'Meridian',
    logoChar: 'MD',
    mailboxCount: 5,
    avgWarmth: 51,
    status: 'warming',
    last7dTrend: [40, 42, 44, 46, 48, 50, 51],
    monthlyMrrUsd: 260,
    lastActivityAgo: '38m ago',
  },
  // ----- At-risk (1) — west branch
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'AB',
    mailboxCount: 8,
    avgWarmth: 32,
    status: 'at_risk',
    last7dTrend: [54, 50, 46, 42, 38, 35, 32],
    monthlyMrrUsd: 420,
    lastActivityAgo: '2h ago',
  },
];

const ALERTS: AgencyDashData['alerts'] = [
  {
    id: 'al-1',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'bounce_spike',
    message: 'Bounce rate spiked to 4.8% on press@atlasbio.com',
    ago: '14m ago',
    severity: 'critical',
  },
  {
    id: 'al-2',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'dns_break',
    message: 'DKIM signature failed on outbound from sales@atlasbio.com',
    ago: '32m ago',
    severity: 'critical',
  },
  {
    id: 'al-3',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    kind: 'mailbox_paused',
    message: 'founder@atlasbio.com auto-paused after 3 spam-folder events',
    ago: '1h ago',
    severity: 'warn',
  },
  {
    id: 'al-4',
    subClientId: 'sc-meridian',
    subClientName: 'Meridian',
    kind: 'peer_failed',
    message: 'Peer reputation dropped below threshold for 1 mailbox',
    ago: '46m ago',
    severity: 'warn',
  },
  {
    id: 'al-5',
    subClientId: 'sc-cascade',
    subClientName: 'Cascade Studio',
    kind: 'mailbox_paused',
    message: 'hello@cascadestudio.co paused — ramp Day 4',
    ago: '1h ago',
    severity: 'warn',
  },
  {
    id: 'al-6',
    subClientId: 'sc-ember',
    subClientName: 'Ember Mfg',
    kind: 'dns_break',
    message: 'SPF record missing on a newly-connected sender',
    ago: '3h ago',
    severity: 'warn',
  },
];

function deriveKpis(subs: AgencyDashData['subClients']): AgencyDashData['kpis'] {
  const totalMailboxes = subs.reduce((s, c) => s + c.mailboxCount, 0);
  const avgWarmth = Math.round(
    subs.reduce((s, c) => s + c.avgWarmth * c.mailboxCount, 0) / totalMailboxes,
  );
  const mailboxesAtRisk = subs
    .filter((c) => c.status === 'at_risk')
    .reduce((s, c) => s + c.mailboxCount, 0);
  const activeSubClients = subs.filter((c) => c.status !== 'at_risk').length;
  const mrrUsd = subs.reduce((s, c) => s + c.monthlyMrrUsd, 0);
  return {
    totalMailboxes,
    avgWarmth,
    mailboxesAtRisk,
    activeSubClients,
    mrrUsd,
    momGrowthPct: 8.4,
  };
}

export const AGENCY_DASH_SKELETON_C3: AgencyDashData = {
  workspace: {
    name: 'Northwind Agency',
    subClientCount: SUB_CLIENTS.length,
    mailboxCount: SUB_CLIENTS.reduce((s, c) => s + c.mailboxCount, 0),
  },
  kpis: deriveKpis(SUB_CLIENTS),
  subClients: SUB_CLIENTS,
  alerts: ALERTS,
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

const HEX = {
  accent: '#F26522', // healthy / orange
  accent2: '#FF8A4B', // info / orange-2
  accent3: '#FF9670', // at-risk / light-orange
  accent4: '#ffd54f', // warming / yellow
  surface2: '#1a1a26',
  border: '#2a2a3a',
  bg: '#0d0d14',
} as const;

const SECTOR_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
};

const SECTOR_TEXT: Record<SubClientStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
};

const SECTOR_BG: Record<SubClientStatus, string> = {
  healthy: 'bg-accent/10',
  warming: 'bg-accent4/10',
  at_risk: 'bg-accent3/10',
};

const SECTOR_BORDER: Record<SubClientStatus, string> = {
  healthy: 'border-accent/30',
  warming: 'border-accent4/30',
  at_risk: 'border-accent3/30',
};

const SECTOR_BADGE: Record<SubClientStatus, 'green' | 'yellow' | 'orange'> = {
  healthy: 'green',
  warming: 'yellow',
  at_risk: 'orange',
};

const SECTOR_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
};

const SECTOR_LABEL_LONG: Record<SubClientStatus, string> = {
  healthy: 'HEALTHY',
  warming: 'WARMING',
  at_risk: 'AT RISK',
};

// Where each sector hub sits relative to the core (in degrees, SVG convention
// where -90 = north, 0 = east, 180 = west). We use a TRI-PRONG: HEALTHY east,
// WARMING north, AT RISK west. The unused south slot keeps the canvas reading
// as a "Y" / tri-prong rather than four-quadrant.
const SECTOR_ANGLE: Record<SubClientStatus, number> = {
  healthy: 0, // east
  warming: -90, // north
  at_risk: 180, // west
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  mailbox_paused: 'Mailbox paused',
  bounce_spike: 'Bounce spike',
  peer_failed: 'Peer failed',
  dns_break: 'DNS break',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof Mailbox> = {
  mailbox_paused: Mailbox,
  bounce_spike: TrendingUp,
  peer_failed: ShieldAlert,
  dns_break: AlertTriangle,
};

// SVG coordinate system the stage scales into.
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const CORE_R = 68;
const SECTOR_HUB_R = 44;
const SECTOR_DIST = 300;
const NODE_R_BASE = 30;
const NODE_R_MAX = 46;
const SUB_ORBIT = 138;

interface Placed {
  sub: AgencyDashData['subClients'][number];
  x: number;
  y: number;
  r: number;
}

interface SectorPos {
  status: SubClientStatus;
  cx: number;
  cy: number;
  count: number;
  mailboxes: number;
  avgWarmth: number;
  subs: AgencyDashData['subClients'];
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Place each sector hub on a circle of radius SECTOR_DIST around the core. */
function placeSectors(subs: AgencyDashData['subClients']): SectorPos[] {
  const STATUSES: SubClientStatus[] = ['healthy', 'warming', 'at_risk'];
  return STATUSES.map((status) => {
    const ang = deg2rad(SECTOR_ANGLE[status]);
    const cx = CX + SECTOR_DIST * Math.cos(ang);
    const cy = CY + SECTOR_DIST * Math.sin(ang);
    const sectorSubs = subs.filter((s) => s.status === status);
    const mailboxes = sectorSubs.reduce((s, c) => s + c.mailboxCount, 0);
    const avgWarmth = sectorSubs.length
      ? Math.round(
          sectorSubs.reduce((s, c) => s + c.avgWarmth * c.mailboxCount, 0) /
            Math.max(1, mailboxes),
        )
      : 0;
    return {
      status,
      cx,
      cy,
      count: sectorSubs.length,
      mailboxes,
      avgWarmth,
      subs: sectorSubs,
    };
  });
}

/**
 * Place sub-client nodes around their sector hub. Nodes fan OUTWARD from the
 * core — angular range is centred on the sector's outward direction so the
 * mini-orbits don't visually collide with the central trunk.
 */
function placeSubsAroundSectors(sectors: SectorPos[]): Placed[] {
  const maxMbx = Math.max(
    ...sectors.flatMap((s) => s.subs.map((c) => c.mailboxCount)),
    1,
  );
  const placed: Placed[] = [];
  for (const sec of sectors) {
    if (sec.subs.length === 0) continue;
    const outwardDeg = SECTOR_ANGLE[sec.status];
    // Spread the sector's sub-clients across an arc centred on outward.
    // 1 node → 0 spread, 2 → 90°, 3+ → ~220° around the hub.
    const arcSpan =
      sec.subs.length <= 1
        ? 0
        : sec.subs.length === 2
          ? 90
          : Math.min(220, 60 + sec.subs.length * 24);
    const stepDeg = sec.subs.length > 1 ? arcSpan / (sec.subs.length - 1) : 0;
    const startDeg = outwardDeg - arcSpan / 2;
    sec.subs.forEach((sub, i) => {
      const ang = deg2rad(startDeg + stepDeg * i);
      const radius = SUB_ORBIT;
      const vol = sub.mailboxCount / maxMbx;
      placed.push({
        sub,
        x: sec.cx + radius * Math.cos(ang),
        y: sec.cy + radius * Math.sin(ang),
        r: NODE_R_BASE + vol * (NODE_R_MAX - NODE_R_BASE),
      });
    });
  }
  return placed;
}

function statusOf(id: string, subs: AgencyDashData['subClients']): SubClientStatus | null {
  return subs.find((s) => s.id === id)?.status ?? null;
}

function DeltaPill({ delta }: { delta: number }) {
  const flat = Math.abs(delta) < 0.05;
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

export function AgDashC3Branches({
  data,
}: { data?: AgencyDashData } = {}): JSX.Element {
  const d = data ?? AGENCY_DASH_SKELETON_C3;
  const sectors = useMemo(() => placeSectors(d.subClients), [d.subClients]);
  const placed = useMemo(() => placeSubsAroundSectors(sectors), [sectors]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => placed.find((p) => p.sub.id === activeId)?.sub ?? null,
    [placed, activeId],
  );

  const mrrK = (d.kpis.mrrUsd / 1000).toFixed(1);

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
              <GitBranch className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Fleet triage
            </h1>
            <Badge variant="blue">
              <Sparkles className="h-3 w-3" />
              Agency
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Sub-clients branched by health — healthy on the right, warming up
            top, at-risk on the left. Click any node to inspect.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip
            label="Avg warmth"
            value={String(d.kpis.avgWarmth)}
            tone="accent"
          />
          <StatChip
            label="At risk"
            value={`${d.kpis.mailboxesAtRisk} mbx`}
            tone={d.kpis.mailboxesAtRisk > 0 ? 'danger' : 'muted'}
          />
          <StatChip label="MRR" value={`$${mrrK}k`} tone="default" />
        </div>
      </motion.header>

      {/* The branched constellation stage + side inspector panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8">
          <BranchStage
            data={d}
            sectors={sectors}
            placed={placed}
            activeId={activeId}
            hoverId={hoverId}
            onSelect={setActiveId}
            onHover={setHoverId}
          />
          <Legend />
          <SectorAnnotations sectors={sectors} />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            sub={active}
            sectors={sectors}
            alerts={d.alerts}
            onClose={() => setActiveId(null)}
          />
        </div>
      </motion.div>

      {/* Bottom rail: 3 sector summary cards */}
      <SectorBottomRail sectors={sectors} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header stat chip
// ---------------------------------------------------------------------------

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'danger' | 'muted' | 'default';
}) {
  const valueClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'danger'
        ? 'text-accent3'
        : tone === 'muted'
          ? 'text-text-dim'
          : 'text-text';
  return (
    <span className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs backdrop-blur-xl">
      <span className="text-text-dim">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The branched constellation stage (fixed-height SVG scene)
// ---------------------------------------------------------------------------

function BranchStage({
  data,
  sectors,
  placed,
  activeId,
  hoverId,
  onSelect,
  onHover,
}: {
  data: AgencyDashData;
  sectors: SectorPos[];
  placed: Placed[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const activeStatus = activeId ? statusOf(activeId, data.subClients) : null;

  return (
    <div className="relative h-[720px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Dot-grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      {/* Soft radial bloom behind the core */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[52%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: `${HEX.accent2}1a` }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Health-branched constellation: agency core branching into healthy, warming, and at-risk sectors"
      >
        <defs>
          <radialGradient id="c3-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.92} />
            <stop offset="60%" stopColor={HEX.accent2} stopOpacity={0.32} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>
          {(['healthy', 'warming', 'at_risk'] as const).map((s) => {
            const color = SECTOR_HEX[s];
            return (
              <linearGradient
                key={`trunk-${s}`}
                id={`c3-trunk-${s}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.85} />
                <stop offset="60%" stopColor={color} stopOpacity={0.7} />
                <stop offset="100%" stopColor={color} stopOpacity={1} />
              </linearGradient>
            );
          })}
          {(['healthy', 'warming', 'at_risk'] as const).map((s) => (
            <radialGradient
              key={`hub-${s}`}
              id={`c3-hub-${s}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor={SECTOR_HEX[s]} stopOpacity={0.5} />
              <stop offset="100%" stopColor={SECTOR_HEX[s]} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>

        {/* Subtle inner reference circle so the stage doesn't feel empty */}
        <circle
          cx={CX}
          cy={CY}
          r={SECTOR_DIST + 64}
          fill="none"
          stroke={HEX.border}
          strokeOpacity={0.5}
          strokeWidth={1}
          strokeDasharray="2 8"
        />

        {/* 3 main branch trunks: core → sector hub (curved paths with gradient
            stroke). Each trunk also gets an animated flux pulse travelling
            outward to indicate live activity. */}
        {sectors.map((sec, i) => (
          <TrunkPath
            key={`trunk-${sec.status}`}
            sector={sec}
            index={i}
            dimmed={
              activeStatus !== null && activeStatus !== sec.status
            }
          />
        ))}

        {/* Thin lines: sector hub → sub-client nodes within that sector */}
        {placed.map((p) => {
          const sec = sectors.find((s) => s.status === p.sub.status);
          if (!sec) return null;
          const color = SECTOR_HEX[p.sub.status];
          const focused = activeId === p.sub.id || hoverId === p.sub.id;
          const dimmed =
            (activeId !== null || hoverId !== null) && !focused;
          return (
            <g key={`leaf-${p.sub.id}`}>
              <line
                x1={sec.cx}
                y1={sec.cy}
                x2={p.x}
                y2={p.y}
                stroke={color}
                strokeOpacity={dimmed ? 0.08 : focused ? 0.75 : 0.32}
                strokeWidth={focused ? 2.4 : 1.6}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Sector hubs */}
        {sectors.map((sec, i) => (
          <SectorHub
            key={`hub-${sec.status}`}
            sector={sec}
            index={i}
            dimmed={
              activeStatus !== null && activeStatus !== sec.status
            }
          />
        ))}

        {/* Sub-client nodes */}
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
            onSelect={() =>
              onSelect(p.sub.id === activeId ? null : p.sub.id)
            }
            onHover={onHover}
          />
        ))}

        {/* The agency core (drawn LAST so it overlaps trunks at the centre) */}
        <CoreGlyph data={data} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trunk path: core → sector hub
// ---------------------------------------------------------------------------

function TrunkPath({
  sector,
  index,
  dimmed,
}: {
  sector: SectorPos;
  index: number;
  dimmed: boolean;
}) {
  // Construct a gentle bezier from core → sector hub so the trunk reads as a
  // branching tree-limb rather than a straight spoke. Control point sits at
  // a perpendicular offset from the straight-line midpoint.
  const x1 = CX;
  const y1 = CY;
  const x2 = sector.cx;
  const y2 = sector.cy;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicular vector — small offset gives a tasteful curve.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;
  // Sign trick: top branch bows right, side branches bow downward so the
  // composition reads more like a tree.
  const bowSign = sector.status === 'warming' ? 1 : sector.status === 'healthy' ? -1 : 1;
  const bow = 38 * bowSign;
  const cxC = mx + nx * bow;
  const cyC = my + ny * bow;
  const path = `M ${x1} ${y1} Q ${cxC} ${cyC}, ${x2} ${y2}`;

  return (
    <g opacity={dimmed ? 0.18 : 1}>
      {/* Soft glow under the trunk */}
      <path
        d={path}
        fill="none"
        stroke={SECTOR_HEX[sector.status]}
        strokeOpacity={0.18}
        strokeWidth={20}
        strokeLinecap="round"
      />
      {/* Primary gradient stroke */}
      <motion.path
        d={path}
        fill="none"
        stroke={`url(#c3-trunk-${sector.status})`}
        strokeWidth={6}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          duration: 0.9,
          delay: 0.1 + index * 0.12,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
      {/* Animated activity flux travelling outward */}
      <motion.path
        d={path}
        fill="none"
        stroke={SECTOR_HEX[sector.status]}
        strokeOpacity={0.85}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray="3 90"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -186 }}
        transition={{
          duration: 3.4 + index * 0.4,
          ease: 'linear',
          repeat: Infinity,
        }}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sector hub glyph
// ---------------------------------------------------------------------------

function SectorHub({
  sector,
  index,
  dimmed,
}: {
  sector: SectorPos;
  index: number;
  dimmed: boolean;
}) {
  const color = SECTOR_HEX[sector.status];
  const label = SECTOR_LABEL_LONG[sector.status];
  const allClear = sector.status === 'at_risk' && sector.count === 0;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: dimmed ? 0.4 : 1, scale: 1 }}
      transition={{
        duration: 0.55,
        delay: 0.55 + index * 0.1,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {/* Soft glow */}
      <circle
        cx={sector.cx}
        cy={sector.cy}
        r={SECTOR_HUB_R * 1.9}
        fill={`url(#c3-hub-${sector.status})`}
      />
      {/* Pulse halo */}
      <motion.circle
        cx={sector.cx}
        cy={sector.cy}
        r={SECTOR_HUB_R}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 1.7, opacity: 0 }}
        transition={{
          duration: 3.2,
          ease: 'easeOut',
          repeat: Infinity,
          delay: index * 0.4,
        }}
        style={{ transformOrigin: `${sector.cx}px ${sector.cy}px` }}
      />
      {/* The disc */}
      <circle
        cx={sector.cx}
        cy={sector.cy}
        r={SECTOR_HUB_R}
        fill={HEX.surface2}
        stroke={color}
        strokeWidth={2.4}
      />
      {/* Inner accent ring */}
      <circle
        cx={sector.cx}
        cy={sector.cy}
        r={SECTOR_HUB_R - 8}
        fill="none"
        stroke={color}
        strokeOpacity={0.35}
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      {/* Sector label */}
      <text
        x={sector.cx}
        y={sector.cy - 6}
        textAnchor="middle"
        fill={color}
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
        }}
      >
        {label}
      </text>
      {/* Count or "All clear" */}
      {allClear ? (
        <text
          x={sector.cx}
          y={sector.cy + 14}
          textAnchor="middle"
          fill={color}
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          All clear
        </text>
      ) : (
        <text
          x={sector.cx}
          y={sector.cy + 18}
          textAnchor="middle"
          fill={color}
          style={{ fontSize: 22, fontWeight: 700 }}
        >
          {sector.count}
        </text>
      )}
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Core glyph (the AGENCY centre)
// ---------------------------------------------------------------------------

function CoreGlyph({ data }: { data: AgencyDashData }) {
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
        transition={{ duration: 3.4, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      <circle cx={CX} cy={CY} r={CORE_R * 1.8} fill="url(#c3-core)" />
      <motion.circle
        cx={CX}
        cy={CY}
        r={CORE_R}
        fill={HEX.surface2}
        stroke={HEX.accent2}
        strokeWidth={2.5}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Inner accent ring */}
      <circle
        cx={CX}
        cy={CY}
        r={CORE_R - 9}
        fill="none"
        stroke={HEX.accent2}
        strokeOpacity={0.35}
        strokeWidth={1}
        strokeDasharray="3 5"
      />
      <text
        x={CX}
        y={CY - 18}
        textAnchor="middle"
        className="fill-text-dim"
        style={{ fontSize: 13, letterSpacing: 1.8, fontWeight: 600 }}
      >
        AGENCY
      </text>
      <text
        x={CX}
        y={CY + 4}
        textAnchor="middle"
        className="fill-text"
        style={{ fontSize: 17, fontWeight: 600 }}
      >
        {data.workspace.name}
      </text>
      <text
        x={CX}
        y={CY + 28}
        textAnchor="middle"
        fill={HEX.accent2}
        style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.6 }}
      >
        {data.workspace.subClientCount} clients · {data.workspace.mailboxCount} mbx
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
  placed: Placed;
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { sub, x, y, r } = placed;
  const color = SECTOR_HEX[sub.status];
  const lifted = active || hovered;
  const isAtRisk = sub.status === 'at_risk';

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: faded ? 0.32 : 1,
        scale: 1,
      }}
      transition={{
        opacity: { duration: 0.35 },
        scale: {
          duration: 0.5,
          delay: 0.95 + index * 0.05,
          ease: [0.22, 1, 0.36, 1],
        },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name}, status ${sub.status}, warmth ${sub.avgWarmth}, ${sub.mailboxCount} mailboxes`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
    >
      <motion.g
        animate={{ y: [0, index % 2 === 0 ? -3.5 : 3.5, 0] }}
        transition={{
          duration: 5 + (index % 4),
          ease: 'easeInOut',
          repeat: Infinity,
        }}
      >
        {/* At-risk nodes get a continuously pulsing halo */}
        {isAtRisk && (
          <motion.circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={2}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.55, opacity: 0 }}
            transition={{ duration: 1.7, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {lifted && (
          <circle
            cx={x}
            cy={y}
            r={r + 8}
            fill="none"
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1.5}
          />
        )}
        <circle
          cx={x}
          cy={y}
          r={r + 4}
          fill={color}
          fillOpacity={lifted ? 0.24 : 0.14}
        />
        <circle
          cx={x}
          cy={y}
          r={r}
          fill={HEX.surface2}
          stroke={color}
          strokeWidth={lifted ? 2.4 : 1.6}
        />
        {/* Logo char */}
        <text
          x={x}
          y={y + r * 0.18}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: r * 0.66,
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          {sub.logoChar}
        </text>
        {/* Name */}
        <text
          x={x}
          y={y + r + 18}
          textAnchor="middle"
          className="fill-text"
          style={{ fontSize: 13, fontWeight: 600 }}
        >
          {sub.name}
        </text>
        {/* Warmth + mailbox chip */}
        <foreignObject
          x={x - 56}
          y={y + r + 24}
          width={112}
          height={22}
          style={{ overflow: 'visible' }}
        >
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-1 rounded-full border bg-[rgba(20,20,28,0.7)] px-2 py-0.5 text-[10px] font-medium leading-none backdrop-blur"
              style={{
                borderColor: `${color}55`,
                color,
              }}
            >
              <span className="tabular-nums">{sub.avgWarmth}</span>
              <span className="opacity-60">·</span>
              <span className="tabular-nums">{sub.mailboxCount} mbx</span>
            </span>
          </div>
        </foreignObject>
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Legend (compact, overlaid bottom-left)
// ---------------------------------------------------------------------------

function Legend() {
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
      <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-dim">
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
            style={{ background: SECTOR_HEX[it.status] }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
      <span className="mt-1 flex items-center gap-2 border-t border-border-muted pt-2 text-[11px] text-text-dim">
        <Users className="h-3 w-3 text-accent2" />
        Node size = mailbox count
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Sector annotations (mono labels riding above each sector hub)
// ---------------------------------------------------------------------------

function SectorAnnotations({ sectors }: { sectors: SectorPos[] }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 1.05 }}
      className="pointer-events-none absolute right-4 top-4 flex flex-col gap-1.5 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 font-mono text-[10px] uppercase tracking-wider backdrop-blur-xl"
    >
      <span className="text-text-faint">Sector averages</span>
      {sectors.map((sec) => {
        const dir =
          sec.status === 'healthy'
            ? 'RIGHT'
            : sec.status === 'warming'
              ? 'TOP'
              : 'LEFT';
        return (
          <span
            key={sec.status}
            className={`flex items-center gap-2 ${SECTOR_TEXT[sec.status]}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: SECTOR_HEX[sec.status] }}
            />
            <span className="text-text">
              {dir} ({SECTOR_LABEL_LONG[sec.status]})
            </span>
            <span className="text-text-dim">AVG</span>
            <span className="tabular-nums">{sec.avgWarmth || '—'}</span>
          </span>
        );
      })}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Right inspector panel
// ---------------------------------------------------------------------------

function InspectorPanel({
  sub,
  sectors,
  alerts,
  onClose,
}: {
  sub: AgencyDashData['subClients'][number] | null;
  sectors: SectorPos[];
  alerts: AgencyDashData['alerts'];
  onClose: () => void;
}) {
  return (
    <div className="relative h-[720px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
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
            <SubClientDetail sub={sub} alerts={alerts} onClose={onClose} />
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
            <SectorStateView sectors={sectors} alerts={alerts} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectorStateView({
  sectors,
  alerts,
}: {
  sectors: SectorPos[];
  alerts: AgencyDashData['alerts'];
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-accent2" />
          <h2 className="text-base font-semibold text-text">Sector state</h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Three branches, three health tiers. Click any node on the map to
          drill into a sub-client.
        </p>
      </header>

      <div className="space-y-3 p-5">
        {sectors.map((sec) => (
          <SectorCard
            key={sec.status}
            sector={sec}
            alerts={alerts.filter((a) =>
              sec.subs.some((s) => s.id === a.subClientId),
            )}
          />
        ))}
      </div>

      <div className="mt-auto border-t border-white/5 p-5">
        <div className="mb-2.5 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent2" />
          <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">
            Triage tip
          </span>
        </div>
        <p className="text-xs leading-relaxed text-text-dim">
          The agency core branches outward by health status. Trunks fade from
          cyan (core) to the tier colour at the sector hub, and at-risk nodes
          continuously pulse so the eye lands on the left first.
        </p>
      </div>
    </div>
  );
}

function SectorCard({
  sector,
  alerts,
}: {
  sector: SectorPos;
  alerts: AgencyDashData['alerts'];
}) {
  const color = SECTOR_HEX[sector.status];
  const sparkSeries = useMemo(
    () => buildSectorSparkline(sector.subs),
    [sector.subs],
  );

  // Top issue: pick the most recent critical-or-first alert for this sector.
  const topIssue =
    alerts.find((a) => a.severity === 'critical') ?? alerts[0] ?? null;

  return (
    <div
      className={`rounded-xl border ${SECTOR_BORDER[sector.status]} ${SECTOR_BG[sector.status]} p-4`}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge variant={SECTOR_BADGE[sector.status]}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
          />
          {SECTOR_LABEL[sector.status]}
        </Badge>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
          {sector.count} {sector.count === 1 ? 'client' : 'clients'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-dim">
            Mailboxes
          </p>
          <p
            className="mt-0.5 text-2xl font-semibold tabular-nums leading-none"
            style={{ color }}
          >
            {sector.mailboxes}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-text-dim">
            Avg warmth
          </p>
          <p
            className="mt-0.5 text-2xl font-semibold tabular-nums leading-none"
            style={{ color }}
          >
            {sector.avgWarmth || '—'}
          </p>
        </div>
      </div>

      {/* Mini SVG sparkline of the sector's averaged trend */}
      <div className="mt-3">
        <MiniSparkline data={sparkSeries} color={color} height={36} />
      </div>

      {/* Top issue line — only when there's something to call out */}
      {sector.status !== 'healthy' && topIssue && (
        <div className="mt-3 flex items-start gap-2 border-t border-white/5 pt-2.5">
          <AlertTriangle
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${SECTOR_TEXT[sector.status]}`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-text-dim">
              Top issue
            </p>
            <p className="mt-0.5 truncate text-xs text-text">
              {topIssue.subClientName} — {ALERT_KIND_LABEL[topIssue.kind]}
            </p>
          </div>
        </div>
      )}
      {sector.status === 'healthy' && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-white/5 pt-2.5 text-xs text-accent">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All clients steady
        </div>
      )}
    </div>
  );
}

function buildSectorSparkline(
  subs: AgencyDashData['subClients'],
): number[] {
  const first = subs[0];
  if (!first) return Array.from({ length: 7 }, () => 0);
  const len = first.last7dTrend.length;
  const totalMbx = subs.reduce((s, c) => s + c.mailboxCount, 0);
  return Array.from({ length: len }, (_, i) => {
    const sum = subs.reduce(
      (acc, c) => acc + (c.last7dTrend[i] ?? 0) * c.mailboxCount,
      0,
    );
    return Math.round(sum / Math.max(1, totalMbx));
  });
}

// ---------------------------------------------------------------------------
// Tiny pure-SVG sparkline (avoids a recharts container)
// ---------------------------------------------------------------------------

function MiniSparkline({
  data,
  color,
  height = 36,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const width = 100;
  const stepX = width / (data.length - 1 || 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const last = data[data.length - 1] ?? 0;
  const lastY = height - ((last - min) / span) * (height - 6) - 3;
  // ID-safe colour suffix: strip the '#' so the resulting id is a valid
  // SVG fragment identifier (and url(#…) reference resolves).
  const gradId = `spark-${color.replace('#', '')}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="7-day average warmth trend"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={width} cy={lastY} r={2.2} fill={color} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Selected sub-client detail
// ---------------------------------------------------------------------------

function SubClientDetail({
  sub,
  alerts,
  onClose,
}: {
  sub: AgencyDashData['subClients'][number];
  alerts: AgencyDashData['alerts'];
  onClose: () => void;
}) {
  const color = SECTOR_HEX[sub.status];
  const trend = sub.last7dTrend;
  const lastTrend = trend[trend.length - 1] ?? 0;
  const firstTrend = trend[0] ?? 0;
  const delta = lastTrend - firstTrend;
  const subAlerts = alerts.filter((a) => a.subClientId === sub.id);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-base font-bold"
            style={{
              background: `${color}26`,
              color,
              border: `1.5px solid ${color}55`,
            }}
            aria-hidden
          >
            {sub.logoChar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text">
              {sub.name}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge variant={SECTOR_BADGE[sub.status]}>
                {SECTOR_LABEL[sub.status]}
              </Badge>
              <span className="text-xs text-text-dim">
                {sub.lastActivityAgo}
              </span>
            </div>
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
                Avg warmth
              </p>
              <p
                className="mt-0.5 text-4xl font-semibold tabular-nums leading-none"
                style={{ color }}
              >
                {sub.avgWarmth}
              </p>
            </div>
            <div className="text-right">
              <DeltaPill delta={delta} />
              <p className={`mt-1 text-xs font-medium ${SECTOR_TEXT[sub.status]}`}>
                {SECTOR_LABEL[sub.status]}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, sub.avgWarmth)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* 7-day sparkline (bigger than the sector card's) */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-dim">
            <Activity className="h-3.5 w-3.5" style={{ color }} />
            7-day warmth trend
          </div>
          <MiniSparkline data={sub.last7dTrend} color={color} height={64} />
        </div>

        {/* Three small stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <DetailMetric
            icon={<Mailbox className="h-3.5 w-3.5" />}
            label="Mailboxes"
            value={String(sub.mailboxCount)}
            color={color}
          />
          <DetailMetric
            icon={<Flame className="h-3.5 w-3.5" />}
            label="MRR"
            value={`$${sub.monthlyMrrUsd}`}
            color={color}
          />
          <DetailMetric
            icon={<Heart className="h-3.5 w-3.5" />}
            label="7d Δ"
            value={`${delta > 0 ? '+' : ''}${delta}`}
            color={color}
          />
        </div>

        {/* Alerts for this sub-client */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center gap-1.5">
            <ShieldAlert
              className="h-3.5 w-3.5"
              style={{ color: subAlerts.length ? color : undefined }}
            />
            <span className="text-xs uppercase tracking-wider text-text-dim">
              Active alerts
            </span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-text-dim">
              {subAlerts.length}
            </span>
          </div>
          {subAlerts.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" />
              No active alerts.
            </p>
          ) : (
            <ul className="space-y-2">
              {subAlerts.map((a) => {
                const Icon = ALERT_KIND_ICON[a.kind];
                const sev =
                  a.severity === 'critical'
                    ? 'text-accent3'
                    : 'text-accent4';
                return (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 rounded-lg border border-border-muted bg-surface px-3 py-2"
                  >
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${sev}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-text">
                          {ALERT_KIND_LABEL[a.kind]}
                        </span>
                        <span className="font-mono text-[10px] text-text-dim">
                          {a.ago}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-text-dim">
                        {a.message}
                      </p>
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

function DetailMetric({
  icon,
  label,
  value,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-dim">
        <span style={{ color }}>{icon}</span>
        <span>{label}</span>
      </div>
      <p
        className="mt-1 text-base font-semibold tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom rail — 3 sector summary cards (full-width strip)
// ---------------------------------------------------------------------------

function SectorBottomRail({ sectors }: { sectors: SectorPos[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      {sectors.map((sec) => {
        const totalMrr = sec.subs.reduce(
          (s, c) => s + c.monthlyMrrUsd,
          0,
        );
        const color = SECTOR_HEX[sec.status];
        return (
          <div
            key={sec.status}
            className={`relative overflow-hidden rounded-2xl border ${SECTOR_BORDER[sec.status]} bg-surface/60 p-4 backdrop-blur-xl`}
          >
            {/* Soft accent strip on the left */}
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1"
              style={{ background: color }}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg ${SECTOR_BG[sec.status]}`}
                  style={{ color }}
                >
                  {sec.status === 'healthy' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : sec.status === 'warming' ? (
                    <Flame className="h-4 w-4" />
                  ) : (
                    <ShieldAlert className="h-4 w-4" />
                  )}
                </span>
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color }}
                  >
                    {SECTOR_LABEL[sec.status]}
                  </p>
                  <p className="text-[11px] text-text-dim">
                    {SECTOR_LABEL_LONG[sec.status]} branch
                  </p>
                </div>
              </div>
              <Badge variant={SECTOR_BADGE[sec.status]}>
                {sec.count} {sec.count === 1 ? 'client' : 'clients'}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <RailMetric
                label="Clients"
                value={String(sec.count)}
                color={color}
              />
              <RailMetric
                label="Mailboxes"
                value={String(sec.mailboxes)}
                color={color}
              />
              <RailMetric
                label="MRR"
                value={`$${(totalMrr / 1000).toFixed(1)}k`}
                color={color}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-2.5">
              <span className="text-[10px] uppercase tracking-wider text-text-dim">
                Avg warmth
              </span>
              <span
                className="font-mono text-sm font-semibold tabular-nums"
                style={{ color }}
              >
                {sec.avgWarmth || '—'}
              </span>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

function RailMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/40 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-text-dim">
        {label}
      </p>
      <p
        className="mt-0.5 font-mono text-sm font-semibold tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}

export default AgDashC3Branches;
