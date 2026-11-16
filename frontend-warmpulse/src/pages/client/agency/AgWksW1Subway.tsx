import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  ChevronRight,
  Clock,
  Compass,
  Crown,
  ExternalLink,
  Flame,
  Inbox,
  Info,
  Mail,
  MapPin,
  Navigation,
  Network,
  Plus,
  Radio,
  Shield,
  Signal,
  Sparkles,
  Star,
  Train,
  TrainFront,
  Users,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import type { AgencyWorkspaceData } from '@/pages/client/agency/AgWksC1Federation';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksW1Subway — Agency workspace, candidate W1 "Subway Map".
 *
 * Visualises the agency portfolio as a stylised metro map. The AGENCY is the
 * central interchange; four TRANSIT LINES radiate outward in N/E/S/W bearings;
 * sub-client STATIONS sit along the lines, bucketed by status (healthy →
 * Express, warming → Warming, at_risk → Recovery, inactive → Onboarding).
 * Sub-clients sharing a peer pool get dashed TRANSFER connectors.
 *
 * Hover a station to highlight, click to open the detail rail. Map entrance
 * draws lines via pathLength, stations fade in after their line lands, and a
 * faint "train pulse" loops along the focused line. Fully STANDALONE — every
 * value falls back to a local MOCK so the preview harness can mount prop-less.
 */

// ---------------------------------------------------------------------------
// Mock — uses the same Northwind Agency roster as the C-variants so this
// candidate reads as a peer view of the same underlying data.
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyWorkspaceData['subClients'] = [
  {
    id: 'sc-helix',
    name: 'Helix Junction',
    logoChar: 'HX',
    ownerEmail: 'rey@helix.io',
    plan: 'Pro Plus',
    mailboxCount: 24,
    teamCount: 6,
    avgWarmth: 92,
    status: 'healthy',
    monthlyMrrUsd: 1580,
    createdAgo: 'joined 9 months ago',
    lastActiveAgo: 'active 2m ago',
  },
  {
    id: 'sc-nimbus',
    name: 'Nimbus Outreach',
    logoChar: 'NB',
    ownerEmail: 'ops@nimbus.co',
    plan: 'Pro Plus',
    mailboxCount: 19,
    teamCount: 5,
    avgWarmth: 88,
    status: 'healthy',
    monthlyMrrUsd: 1240,
    createdAgo: 'joined 7 months ago',
    lastActiveAgo: 'active 4m ago',
  },
  {
    id: 'sc-orion',
    name: 'Orion Mail',
    logoChar: 'OR',
    ownerEmail: 'amelia@orionmail.io',
    plan: 'Pro',
    mailboxCount: 14,
    teamCount: 4,
    avgWarmth: 85,
    status: 'healthy',
    monthlyMrrUsd: 860,
    createdAgo: 'joined 5 months ago',
    lastActiveAgo: 'active 9m ago',
  },
  {
    id: 'sc-lyra',
    name: 'Lyra Sales',
    logoChar: 'LY',
    ownerEmail: 'sam@lyrasales.com',
    plan: 'Pro',
    mailboxCount: 11,
    teamCount: 3,
    avgWarmth: 81,
    status: 'healthy',
    monthlyMrrUsd: 620,
    createdAgo: 'joined 4 months ago',
    lastActiveAgo: 'active 18m ago',
  },
  {
    id: 'sc-pixel',
    name: 'Pixel Forge',
    logoChar: 'PX',
    ownerEmail: 'mira@pixelforge.io',
    plan: 'Pro',
    mailboxCount: 9,
    teamCount: 3,
    avgWarmth: 68,
    status: 'warming',
    monthlyMrrUsd: 480,
    createdAgo: 'joined 8 weeks ago',
    lastActiveAgo: 'active 28m ago',
  },
  {
    id: 'sc-vector',
    name: 'Vector Studio',
    logoChar: 'VC',
    ownerEmail: 'kai@vectorstudio.team',
    plan: 'Starter',
    mailboxCount: 6,
    teamCount: 2,
    avgWarmth: 58,
    status: 'warming',
    monthlyMrrUsd: 280,
    createdAgo: 'joined 5 weeks ago',
    lastActiveAgo: 'active 52m ago',
  },
  {
    id: 'sc-atlas',
    name: 'Atlas Bio',
    logoChar: 'AB',
    ownerEmail: 'jules@atlasbio.co',
    plan: 'Starter',
    mailboxCount: 5,
    teamCount: 1,
    avgWarmth: 34,
    status: 'at_risk',
    monthlyMrrUsd: 180,
    createdAgo: 'joined 11 weeks ago',
    lastActiveAgo: 'active 3h ago',
  },
  {
    id: 'sc-crestwood',
    name: 'Crestwood',
    logoChar: 'CW',
    ownerEmail: 'theo@crestwood.co',
    plan: 'Starter',
    mailboxCount: 3,
    teamCount: 1,
    avgWarmth: 12,
    status: 'inactive',
    monthlyMrrUsd: 90,
    createdAgo: 'joined 2 weeks ago',
    lastActiveAgo: 'active 6h ago',
  },
];

const TEAM: AgencyWorkspaceData['team'] = [
  {
    id: 't-owner',
    name: 'You',
    email: 'you@northwind.agency',
    role: 'owner',
    lastActiveAgo: 'now',
    subClientsManaged: 8,
  },
  {
    id: 't-admin-1',
    name: 'Priya Anand',
    email: 'priya@northwind.agency',
    role: 'admin',
    lastActiveAgo: '14m ago',
    subClientsManaged: 3,
  },
  {
    id: 't-admin-2',
    name: 'Marc Hollis',
    email: 'marc@northwind.agency',
    role: 'admin',
    lastActiveAgo: '38m ago',
    subClientsManaged: 3,
  },
  {
    id: 't-member-1',
    name: 'Lia Soto',
    email: 'lia@northwind.agency',
    role: 'member',
    lastActiveAgo: '1h ago',
    subClientsManaged: 2,
  },
];

const API_KEYS: AgencyWorkspaceData['apiKeys'] = [
  {
    id: 'ak-1',
    label: 'Production · Dispatch',
    masked: 'wp_live_••••_8Fk2',
    scope: 'admin',
    lastUsedAgo: '4m ago',
  },
  {
    id: 'ak-2',
    label: 'Reporting CRON',
    masked: 'wp_live_••••_Lp93',
    scope: 'read',
    lastUsedAgo: '36m ago',
  },
];

const WEBHOOKS: AgencyWorkspaceData['webhooks'] = [
  {
    id: 'wh-1',
    url: 'hooks.northwind.agency/transit/events',
    events: ['mailbox.paused', 'warmth.alert', 'bounce.spike'],
    status: 'live',
  },
  {
    id: 'wh-2',
    url: 'ops.northwind.agency/slack/relay',
    events: ['peer.failed', 'dns.break'],
    status: 'paused',
  },
];

const MOCK: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    ownerEmail: 'you@northwind.agency',
    region: 'us-east-1',
    slug: 'northwind-agency',
  },
  features: {
    whiteLabel: {
      enabled: true,
      brandName: 'Northwind Mail Ops',
      hasLogo: true,
    },
    customDomain: {
      enabled: true,
      domain: 'mail.northwind.agency',
      status: 'verified',
    },
    dedicatedPool: {
      enabled: true,
      poolName: 'Northwind Premium Pool',
      memberCount: 412,
    },
  },
  subClients: SUB_CLIENTS,
  team: TEAM,
  apiKeys: API_KEYS,
  webhooks: WEBHOOKS,
};

// ---------------------------------------------------------------------------
// Transit-line model
// ---------------------------------------------------------------------------

type LineId = 'express' | 'warming' | 'recovery' | 'onboarding';

interface TransitLineDef {
  id: LineId;
  /** Display name, e.g. "Express Line". */
  name: string;
  /** Short single-letter route code for station labels. */
  code: string;
  /** Long form alert label. */
  longName: string;
  /** CSS var reference for the line colour. */
  color: string;
  /** Hex value for inline SVG attrs. */
  colorHex: string;
  /** Status this line serves. */
  status: AgencyWorkspaceData['subClients'][number]['status'];
  /** Compass-rose bearing for the line, in degrees. 0 = right, -90 = top. */
  bearingDeg: number;
  /** Short status sentence shown in the system footer. */
  condition: string;
  /** Icon shown beside the line code on chips. */
  icon: typeof Train;
}

const LINES: TransitLineDef[] = [
  {
    id: 'express',
    name: 'Express',
    longName: 'Express Line',
    code: 'E',
    color: 'var(--wp-accent)',
    colorHex: '#F26522',
    status: 'healthy',
    bearingDeg: 0, // east
    condition: 'Running smooth · all stations on time',
    icon: TrainFront,
  },
  {
    id: 'warming',
    name: 'Warming',
    longName: 'Warming Line',
    code: 'W',
    color: 'var(--wp-warning)',
    colorHex: '#ffb454',
    status: 'warming',
    bearingDeg: 90, // south
    condition: 'Reduced service · ramp-up in progress',
    icon: Flame,
  },
  {
    id: 'recovery',
    name: 'Recovery',
    longName: 'Recovery Line',
    code: 'R',
    color: 'var(--wp-danger)',
    colorHex: '#ff5c7a',
    status: 'at_risk',
    bearingDeg: 180, // west
    condition: 'Maintenance · domain warmup paused',
    icon: AlertTriangle,
  },
  {
    id: 'onboarding',
    name: 'Onboarding',
    longName: 'Onboarding Line',
    code: 'O',
    color: 'var(--wp-accent-2)',
    colorHex: '#FF8A4B',
    status: 'inactive',
    bearingDeg: 270, // north
    condition: 'New service · stations preparing for first run',
    icon: Sparkles,
  },
];

// ---------------------------------------------------------------------------
// SVG geometry constants
// ---------------------------------------------------------------------------

/** SVG viewBox dimensions. The component fills its container — these set the
 * coordinate space for everything that scales with the stage. */
const VB_W = 1100;
const VB_H = 720;
const CX = VB_W / 2;
const CY = VB_H / 2;
/** Distance the agency hub circle occupies. */
const HUB_R = 70;
/** Distance from hub to first station along any line. */
const FIRST_STATION_OFFSET = 150;
/** Distance between consecutive stations on the same line. */
const STATION_PITCH = 110;
/** Station marker radius. */
const STATION_R = 16;
/** Stroke width for the main transit lines. */
const LINE_STROKE = 5.5;
/** Stroke width for transfer connectors. */
const TRANSFER_STROKE = 1.4;

interface PlacedStation {
  sub: AgencyWorkspaceData['subClients'][number];
  /** Station coords in viewBox space. */
  x: number;
  y: number;
  /** The transit line this station belongs to. */
  line: TransitLineDef;
  /** Zero-indexed position along the line, 0 = closest to hub. */
  index: number;
  /** Stop number plate ("E1", "W2", etc). */
  stopCode: string;
}

interface PlacedLine {
  def: TransitLineDef;
  /** Stations along this line, ordered by index (closest to hub first). */
  stations: PlacedStation[];
  /** The polyline path command for the line, hub → last station. */
  path: string;
}

// ---------------------------------------------------------------------------
// Domain-status / role visual maps
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<
  AgencyWorkspaceData['subClients'][number]['status'],
  string
> = {
  healthy: 'Express',
  warming: 'Warming',
  at_risk: 'Recovery',
  inactive: 'Onboarding',
};

const ROLE_RING: Record<
  AgencyWorkspaceData['team'][number]['role'],
  string
> = {
  owner: 'border-accent4/40 bg-accent4/10 text-accent4',
  admin: 'border-accent/30 bg-accent/10 text-accent',
  member: 'border-border-muted bg-surface-2 text-text-dim',
};

const ROLE_LABEL: Record<
  AgencyWorkspaceData['team'][number]['role'],
  string
> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

// ---------------------------------------------------------------------------
// Geometry helpers — deterministic placement off sub-client id ordering
// ---------------------------------------------------------------------------

/**
 * Compute the (x, y) of station #index on line bearing degrees from the hub.
 * Stations walk outward along the bearing in straight lines, so a station at
 * index 0 sits at FIRST_STATION_OFFSET from the hub, index 1 at +PITCH, etc.
 */
function stationCoords(bearingDeg: number, index: number): { x: number; y: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const dist = FIRST_STATION_OFFSET + index * STATION_PITCH;
  return {
    x: CX + dist * Math.cos(rad),
    y: CY + dist * Math.sin(rad),
  };
}

/**
 * Build the SVG path for a transit line: starts at the hub edge, curves out
 * gently for the first 80px of bearing distance, then goes straight to the
 * final station. The curve gives the line a subway-map "bend out of station"
 * feel rather than perfectly radial spokes.
 */
function linePath(line: TransitLineDef, stations: PlacedStation[]): string {
  if (stations.length === 0) return '';
  const rad = (line.bearingDeg * Math.PI) / 180;
  // Hub edge start point
  const startX = CX + HUB_R * Math.cos(rad);
  const startY = CY + HUB_R * Math.sin(rad);
  // Bend control: 30deg lateral, halfway along the run.
  const halfDist =
    HUB_R + (FIRST_STATION_OFFSET - HUB_R + (stations.length - 1) * STATION_PITCH) / 2;
  // perpendicular axis for the bend
  const perpDeg = line.bearingDeg + 90;
  const perpRad = (perpDeg * Math.PI) / 180;
  // Pick a small lateral offset that alternates direction per line for variety.
  const sway =
    line.id === 'express'
      ? 18
      : line.id === 'warming'
        ? -22
        : line.id === 'recovery'
          ? 24
          : -18;
  const ctrlX = CX + halfDist * Math.cos(rad) + sway * Math.cos(perpRad);
  const ctrlY = CY + halfDist * Math.sin(rad) + sway * Math.sin(perpRad);

  // Smooth quadratic to the last station, but make sure intermediate stations
  // ALSO sit on the path — to do this, instead of a single curve we lay down a
  // sequence of short line segments through each station (each leg is its own
  // smooth segment). This mirrors how real metro maps draw straight runs
  // between stations with bends only when the line changes direction.
  let d = `M ${startX.toFixed(2)} ${startY.toFixed(2)}`;
  // First segment from hub edge to station 0 via the control point — quadratic.
  const s0 = stations[0]!;
  d += ` Q ${ctrlX.toFixed(2)} ${ctrlY.toFixed(2)} ${s0.x.toFixed(2)} ${s0.y.toFixed(2)}`;
  // Then straight legs to subsequent stations.
  for (let i = 1; i < stations.length; i++) {
    const s = stations[i]!;
    d += ` L ${s.x.toFixed(2)} ${s.y.toFixed(2)}`;
  }
  return d;
}

/**
 * Place every sub-client onto its appropriate transit line by status.
 * Within a line the order is stable (by id) so the placement is deterministic.
 */
function planTransitSystem(
  subs: AgencyWorkspaceData['subClients'],
): { lines: PlacedLine[]; stationById: Map<string, PlacedStation> } {
  const stationById = new Map<string, PlacedStation>();
  const lines: PlacedLine[] = LINES.map((def) => {
    const onThisLine = subs
      .filter((s) => s.status === def.status)
      .sort((a, b) => a.id.localeCompare(b.id));
    const stations: PlacedStation[] = onThisLine.map((sub, idx) => {
      const { x, y } = stationCoords(def.bearingDeg, idx);
      const placed: PlacedStation = {
        sub,
        x,
        y,
        line: def,
        index: idx,
        stopCode: `${def.code}${idx + 1}`,
      };
      stationById.set(sub.id, placed);
      return placed;
    });
    return {
      def,
      stations,
      path: linePath(def, stations),
    };
  });
  return { lines, stationById };
}

/**
 * Pretend peer-pool assignment for transfer connectors. The real shape doesn't
 * track this, so we derive a synthetic pool from each sub-client's id hash —
 * pairs that share a pool get a dashed connector between their stations. Keeps
 * the topology stable (deterministic) across renders.
 */
function derivePeerPoolKey(subId: string): string {
  // Bucket into 3 pools so we get a few transfers but not chaos.
  let hash = 0;
  for (let i = 0; i < subId.length; i++) {
    hash = (hash * 31 + subId.charCodeAt(i)) >>> 0;
  }
  return ['shared-a', 'shared-b', 'shared-c'][hash % 3] ?? 'shared-a';
}

function buildTransfers(
  stationById: Map<string, PlacedStation>,
): Array<{ from: PlacedStation; to: PlacedStation; pool: string }> {
  const byPool = new Map<string, PlacedStation[]>();
  for (const placed of stationById.values()) {
    const k = derivePeerPoolKey(placed.sub.id);
    const arr = byPool.get(k) ?? [];
    arr.push(placed);
    byPool.set(k, arr);
  }
  const out: Array<{ from: PlacedStation; to: PlacedStation; pool: string }> = [];
  for (const [pool, group] of byPool.entries()) {
    // Build pairs but only across different lines (transfers, not same-line).
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.line.id !== b.line.id) {
          out.push({ from: a, to: b, pool });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Service-alert synthesis — distil portfolio activity into transit-style
// notices so the footer feed reads like a real metro alert board.
// ---------------------------------------------------------------------------

interface ServiceAlert {
  id: string;
  /** Short transit-flavoured headline. */
  headline: string;
  /** Long form detail line. */
  detail: string;
  /** "delay" / "info" / "ok" / "warn" — drives the icon + colour. */
  tone: 'delay' | 'info' | 'ok' | 'warn';
  /** Station code badge for the affected line. */
  badge: string;
}

function buildServiceAlerts(
  d: AgencyWorkspaceData,
  stationById: Map<string, PlacedStation>,
): ServiceAlert[] {
  const out: ServiceAlert[] = [];
  // At-risk stations get a "train delay" alert.
  for (const sc of d.subClients.filter((s) => s.status === 'at_risk')) {
    const st = stationById.get(sc.id);
    if (!st) continue;
    out.push({
      id: `alert-${sc.id}`,
      headline: `${sc.name} → Train delay`,
      detail: `Recovery Line · domain warmup paused, last activity ${sc.lastActiveAgo}`,
      tone: 'delay',
      badge: st.stopCode,
    });
  }
  // Warming stations get a "ramping up" notice.
  for (const sc of d.subClients.filter((s) => s.status === 'warming')) {
    const st = stationById.get(sc.id);
    if (!st) continue;
    out.push({
      id: `alert-${sc.id}`,
      headline: `${sc.name} → Service ramp-up`,
      detail: `Warming Line · climbing toward full schedule, currently ${sc.avgWarmth} warmth`,
      tone: 'warn',
      badge: st.stopCode,
    });
  }
  // Newest healthy station gets an "all clear" arrival.
  const healthy = d.subClients.filter((s) => s.status === 'healthy');
  if (healthy.length > 0) {
    // pick the most recent activity (heuristic: shortest lastActiveAgo string)
    const newest = [...healthy].sort((a, b) =>
      a.lastActiveAgo.localeCompare(b.lastActiveAgo),
    )[0]!;
    const st = stationById.get(newest.id);
    if (st) {
      out.push({
        id: `alert-${newest.id}`,
        headline: `${newest.name} → On schedule`,
        detail: `Express Line · sending normally, peer engagement stable`,
        tone: 'ok',
        badge: st.stopCode,
      });
    }
  }
  // Inactive stations get an "onboarding" notice.
  for (const sc of d.subClients.filter((s) => s.status === 'inactive')) {
    const st = stationById.get(sc.id);
    if (!st) continue;
    out.push({
      id: `alert-${sc.id}`,
      headline: `${sc.name} → New service`,
      detail: `Onboarding Line · awaiting first mailbox connection`,
      tone: 'info',
      badge: st.stopCode,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function AgWksW1Subway(
  { data }: { data?: AgencyWorkspaceData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const { lines, stationById } = useMemo(
    () => planTransitSystem(d.subClients),
    [d.subClients],
  );
  const transfers = useMemo(() => buildTransfers(stationById), [stationById]);
  const alerts = useMemo(
    () => buildServiceAlerts(d, stationById),
    [d, stationById],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const selected = selectedId ? stationById.get(selectedId) ?? null : null;
  const hoverLine = useMemo(() => {
    if (selected) return selected.line.id;
    if (hoverId) return stationById.get(hoverId)?.line.id ?? null;
    return null;
  }, [selected, hoverId, stationById]);

  const totalStations = d.subClients.length;
  const activeLineCount = lines.filter((l) => l.stations.length > 0).length;
  const mailboxTotal = useMemo(
    () => d.subClients.reduce((acc, s) => acc + s.mailboxCount, 0),
    [d.subClients],
  );

  return (
    <div className="space-y-5">
      {/* HEADER STRIP — transit-authority styled */}
      <SystemHeader
        d={d}
        activeLineCount={activeLineCount}
        totalStations={totalStations}
      />

      {/* TRANSIT LEGEND — the four line colours + names */}
      <LineLegend lines={lines} hoverLineId={hoverLine} />

      {/* MAIN CANVAS + DETAIL RAIL */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-8">
          <MetroMap
            d={d}
            lines={lines}
            transfers={transfers}
            selectedId={selectedId}
            hoverId={hoverId}
            onSelect={setSelectedId}
            onHover={setHoverId}
          />
        </div>
        <div className="lg:col-span-4">
          <DetailRail
            d={d}
            selected={selected}
            transfers={transfers}
            totalStations={totalStations}
            mailboxTotal={mailboxTotal}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </motion.div>

      {/* SYSTEM STATUS FOOTER — line-status cards + alert feed */}
      <SystemStatusFooter
        lines={lines}
        alerts={alerts}
        d={d}
        onSelectStation={setSelectedId}
      />
    </div>
  );
}

export default AgWksW1Subway;

// ---------------------------------------------------------------------------
// SystemHeader — top strip mimicking a transit authority masthead.
// ---------------------------------------------------------------------------

function SystemHeader({
  d,
  activeLineCount,
  totalStations,
}: {
  d: AgencyWorkspaceData;
  activeLineCount: number;
  totalStations: number;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl border text-accent"
            style={{
              borderColor: 'rgba(242,101,34,0.30)',
              background: 'rgba(242,101,34,0.10)',
            }}
          >
            <TrainFront className="h-4 w-4" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {d.agency.name} Metro
          </h1>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: 'rgba(242,101,34,0.35)',
              background: 'rgba(242,101,34,0.10)',
              color: 'var(--wp-accent)',
            }}
          >
            <Sparkles className="h-3 w-3" />
            Transit Authority
          </span>
          <span className="rounded-full border border-border-muted bg-surface/60 px-2.5 py-0.5 font-mono text-[11px] text-text-dim">
            {d.agency.region}
          </span>
        </div>
        <p className="text-sm text-text-dim">
          {activeLineCount} active line
          {activeLineCount === 1 ? '' : 's'} ·{' '}
          <span className="font-mono text-text">{totalStations}</span> station
          {totalStations === 1 ? '' : 's'} · Northwind Central Interchange ·{' '}
          <span className="font-mono text-text-dim">{d.agency.ownerEmail}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider"
          style={{
            borderColor: 'rgba(61,220,151,0.35)',
            background: 'rgba(61,220,151,0.10)',
            color: 'var(--wp-success)',
          }}
        >
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: 'var(--wp-success)' }}
            aria-hidden
          />
          All lines running
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs">
          <Clock className="h-3.5 w-3.5 text-text-dim" />
          <span className="text-text-dim">Updated</span>
          <span className="font-mono font-semibold tabular-nums text-text">just now</span>
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
          style={{
            borderColor: 'rgba(242,101,34,0.30)',
            background: 'rgba(242,101,34,0.10)',
            color: 'var(--wp-accent)',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Open new station
        </button>
      </div>
    </motion.header>
  );
}

// ---------------------------------------------------------------------------
// LineLegend — four colour chips, one per transit line, with route codes.
// ---------------------------------------------------------------------------

function LineLegend({
  lines,
  hoverLineId,
}: {
  lines: PlacedLine[];
  hoverLineId: LineId | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border-muted bg-surface/60 px-3 py-2 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        <Navigation className="h-3 w-3 text-accent" />
        System lines
      </span>
      <span className="h-4 w-px bg-border-muted" aria-hidden />
      {lines.map((line) => {
        const dim = hoverLineId !== null && hoverLineId !== line.def.id;
        const focused = hoverLineId === line.def.id;
        return (
          <motion.span
            key={line.def.id}
            animate={{ opacity: dim ? 0.4 : 1, scale: focused ? 1.04 : 1 }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full border bg-surface-2/70 px-2.5 py-1 text-xs"
            style={{
              borderColor: focused
                ? line.def.colorHex
                : `${line.def.colorHex}55`,
            }}
          >
            <span
              className="grid h-5 w-5 place-items-center rounded-full font-mono text-[10px] font-bold text-bg"
              style={{ background: line.def.color }}
              aria-hidden
            >
              {line.def.code}
            </span>
            <span className="font-medium text-text">{line.def.longName}</span>
            <span className="font-mono text-[10px] text-text-dim">
              {line.stations.length} stop{line.stations.length === 1 ? '' : 's'}
            </span>
          </motion.span>
        );
      })}
      <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-faint">
        <Compass className="h-3 w-3" />
        N · E · S · W
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MetroMap — the main SVG canvas with hub, lines, stations, transfers.
// ---------------------------------------------------------------------------

function MetroMap({
  d,
  lines,
  transfers,
  selectedId,
  hoverId,
  onSelect,
  onHover,
}: {
  d: AgencyWorkspaceData;
  lines: PlacedLine[];
  transfers: Array<{ from: PlacedStation; to: PlacedStation; pool: string }>;
  selectedId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const focusedLineId = useMemo<LineId | null>(() => {
    if (selectedId) {
      for (const line of lines) {
        if (line.stations.some((s) => s.sub.id === selectedId)) return line.def.id;
      }
    }
    if (hoverId) {
      for (const line of lines) {
        if (line.stations.some((s) => s.sub.id === hoverId)) return line.def.id;
      }
    }
    return null;
  }, [lines, selectedId, hoverId]);

  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Subtle map grid backdrop */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
      >
        <defs>
          <pattern
            id="agwksw1-mapgrid"
            x="0"
            y="0"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="var(--wp-border)"
              strokeOpacity="0.55"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#agwksw1-mapgrid)" />
      </svg>

      {/* Compass-rose watermark */}
      <CompassWatermark />

      {/* Soft hub bloom */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[44%] w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: 'rgba(242,101,34,0.18)' }}
      />

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Subway map of the agency portfolio: central agency interchange with four transit lines and sub-client stations along each line"
      >
        <defs>
          <radialGradient id="agwksw1-hub-disc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22223a" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--wp-surface-2)" stopOpacity={1} />
          </radialGradient>
          <radialGradient id="agwksw1-hub-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--wp-accent)" stopOpacity={0.45} />
            <stop offset="60%" stopColor="var(--wp-accent-2)" stopOpacity={0.15} />
            <stop offset="100%" stopColor="var(--wp-accent)" stopOpacity={0} />
          </radialGradient>
          {LINES.map((line) => (
            <linearGradient
              key={line.id}
              id={`agwksw1-train-${line.id}`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0%" stopColor={line.colorHex} stopOpacity={0} />
              <stop offset="50%" stopColor={line.colorHex} stopOpacity={1} />
              <stop offset="100%" stopColor={line.colorHex} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {/* TRANSFER CONNECTORS — drawn under the main lines so they read as
            understated cross-pool links between stations on different lines. */}
        {transfers.map((t, i) => (
          <TransferConnector
            key={`xfer-${t.from.sub.id}-${t.to.sub.id}`}
            transfer={t}
            index={i}
            focused={
              selectedId === t.from.sub.id ||
              selectedId === t.to.sub.id ||
              hoverId === t.from.sub.id ||
              hoverId === t.to.sub.id
            }
            dimmed={focusedLineId !== null}
          />
        ))}

        {/* MAIN TRANSIT LINES — drawn in stagger via pathLength animation */}
        {lines.map((line, lineIdx) => (
          <TransitLine
            key={line.def.id}
            line={line}
            index={lineIdx}
            focused={focusedLineId === line.def.id}
            dimmed={focusedLineId !== null && focusedLineId !== line.def.id}
          />
        ))}

        {/* STATIONS — render after lines so they sit on top */}
        {lines.flatMap((line, lineIdx) =>
          line.stations.map((station) => (
            <Station
              key={station.sub.id}
              station={station}
              lineIndex={lineIdx}
              active={selectedId === station.sub.id}
              hovered={hoverId === station.sub.id}
              dimmed={
                focusedLineId !== null && focusedLineId !== station.line.id
              }
              onSelect={() =>
                onSelect(station.sub.id === selectedId ? null : station.sub.id)
              }
              onHover={onHover}
            />
          )),
        )}

        {/* AGENCY HUB — central terminus interchange */}
        <HubStation d={d} />
      </svg>

      {/* Empty-state overlay */}
      {d.subClients.length === 0 && <EmptyMapState />}

      {/* North-arrow chip in the corner */}
      <NorthArrow />

      {/* Travelling train pulse — overlaid SVG so it animates on the focused line */}
      {focusedLineId && (
        <TrainPulse
          line={lines.find((l) => l.def.id === focusedLineId)!}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HubStation — the agency's "Northwind Central Interchange" terminus.
// ---------------------------------------------------------------------------

function HubStation({ d }: { d: AgencyWorkspaceData }) {
  return (
    <g>
      {/* Outer pulse halo — three concentric rings, light expansion */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={HUB_R}
        fill="none"
        stroke="var(--wp-accent)"
        strokeOpacity="0.4"
        strokeWidth={2}
        initial={{ scale: 1, opacity: 0.4 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ duration: 3.6, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Soft bloom */}
      <circle cx={CX} cy={CY} r={HUB_R * 1.6} fill="url(#agwksw1-hub-glow)" />
      {/* Hub disc */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={HUB_R}
        fill="url(#agwksw1-hub-disc)"
        stroke="var(--wp-accent)"
        strokeWidth={2.5}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Inner concentric ring */}
      <circle
        cx={CX}
        cy={CY}
        r={HUB_R - 10}
        fill="none"
        stroke="var(--wp-accent)"
        strokeOpacity="0.25"
        strokeWidth={1}
      />
      {/* Cross-hair indicator — terminus symbol */}
      <line
        x1={CX - HUB_R * 0.55}
        y1={CY}
        x2={CX + HUB_R * 0.55}
        y2={CY}
        stroke="var(--wp-accent)"
        strokeOpacity="0.25"
        strokeWidth={1}
      />
      <line
        x1={CX}
        y1={CY - HUB_R * 0.55}
        x2={CX}
        y2={CY + HUB_R * 0.55}
        stroke="var(--wp-accent)"
        strokeOpacity="0.25"
        strokeWidth={1}
      />
      {/* Star icon — interchange marker */}
      <foreignObject x={CX - 12} y={CY - 38} width={24} height={24}>
        <div className="flex h-full w-full items-center justify-center text-accent4">
          <Star className="h-5 w-5 fill-current" />
        </div>
      </foreignObject>
      {/* Hub title */}
      <text
        x={CX}
        y={CY - 4}
        textAnchor="middle"
        fill="#e8e8f0"
        style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}
      >
        {d.agency.name.split(' ')[0] ?? 'Northwind'}
      </text>
      <text
        x={CX}
        y={CY + 12}
        textAnchor="middle"
        fill="var(--wp-text-dim)"
        style={{ fontSize: 9, letterSpacing: 2.4, fontFamily: 'JetBrains Mono, monospace' }}
      >
        CENTRAL INTERCHANGE
      </text>
      {/* Plan badge */}
      <foreignObject x={CX - 32} y={CY + 22} width={64} height={20}>
        <div className="flex h-full w-full items-center justify-center">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: 'rgba(242,101,34,0.35)',
              background: 'rgba(242,101,34,0.12)',
              color: 'var(--wp-accent)',
            }}
          >
            {d.agency.plan}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

// ---------------------------------------------------------------------------
// TransitLine — the route polyline + subtle "running" dash overlay.
// ---------------------------------------------------------------------------

function TransitLine({
  line,
  index,
  focused,
  dimmed,
}: {
  line: PlacedLine;
  index: number;
  focused: boolean;
  dimmed: boolean;
}) {
  if (line.stations.length === 0) return null;
  const baseOpacity = dimmed ? 0.18 : focused ? 1 : 0.78;
  const stroke = line.def.colorHex;
  const lastStation = line.stations[line.stations.length - 1]!;
  return (
    <g>
      {/* shadow underlay so the line reads as a 3D rail */}
      <motion.path
        d={line.path}
        fill="none"
        stroke="#000"
        strokeOpacity={dimmed ? 0.08 : 0.22}
        strokeWidth={LINE_STROKE + 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          pathLength: { duration: 1.1, delay: 0.18 + index * 0.15, ease: 'easeOut' },
          opacity: { duration: 0.4, delay: 0.18 + index * 0.15 },
        }}
      />
      {/* the main coloured rail */}
      <motion.path
        d={line.path}
        fill="none"
        stroke={stroke}
        strokeOpacity={baseOpacity}
        strokeWidth={focused ? LINE_STROKE + 1.5 : LINE_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: baseOpacity }}
        transition={{
          pathLength: { duration: 1.1, delay: 0.22 + index * 0.15, ease: 'easeOut' },
          opacity: { duration: 0.35 },
        }}
      />
      {/* inner highlight stroke — gives the rail a polished metro-map gloss */}
      <motion.path
        d={line.path}
        fill="none"
        stroke="#ffffff"
        strokeOpacity={dimmed ? 0 : focused ? 0.18 : 0.08}
        strokeWidth={LINE_STROKE - 3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          pathLength: { duration: 1.1, delay: 0.32 + index * 0.15, ease: 'easeOut' },
        }}
      />
      {/* Terminus marker at the line's end — line code on a square plate */}
      <TerminusMarker line={line.def} station={lastStation} dimmed={dimmed} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// TerminusMarker — square plate at the outer end of each transit line.
// ---------------------------------------------------------------------------

function TerminusMarker({
  line,
  station,
  dimmed,
}: {
  line: TransitLineDef;
  station: PlacedStation;
  dimmed: boolean;
}) {
  // Offset the plate further along the bearing so it sits just beyond the
  // last station — mirrors how metro maps show the line continuing one stop
  // further as a destination plate.
  const rad = (line.bearingDeg * Math.PI) / 180;
  const px = station.x + 56 * Math.cos(rad);
  const py = station.y + 56 * Math.sin(rad);
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: dimmed ? 0.3 : 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 1.05, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: `${px}px ${py}px` }}
    >
      <rect
        x={px - 14}
        y={py - 14}
        width={28}
        height={28}
        rx={6}
        fill={line.colorHex}
        stroke="#1a1a26"
        strokeWidth={2}
      />
      <text
        x={px}
        y={py + 5}
        textAnchor="middle"
        fill="#1a1a26"
        style={{ fontSize: 13, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}
      >
        {line.code}
      </text>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// Station — sub-client station marker, label tag, and mailbox-count chip.
// ---------------------------------------------------------------------------

function Station({
  station,
  lineIndex,
  active,
  hovered,
  dimmed,
  onSelect,
  onHover,
}: {
  station: PlacedStation;
  lineIndex: number;
  active: boolean;
  hovered: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { sub, x, y, line, index } = station;
  const isLifted = active || hovered;
  const stroke = line.colorHex;
  const fillOpacity = dimmed ? 0.4 : 1;
  // Label position: below the station for E/W lines, above for N/S lines so
  // labels never overlap the spine of the line they're sitting on.
  const labelBelow = line.bearingDeg === 0 || line.bearingDeg === 180;
  const labelDy = labelBelow ? STATION_R + 26 : -(STATION_R + 16);
  const chipDy = labelBelow ? STATION_R + 46 : -(STATION_R + 38);

  // Stagger delay so stations on the same line appear after their rail.
  const delay = 0.55 + lineIndex * 0.15 + index * 0.08;

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: fillOpacity,
        scale: isLifted ? 1.15 : 1,
      }}
      transition={{
        opacity: { duration: 0.45, delay },
        scale: {
          type: 'spring',
          stiffness: 260,
          damping: 22,
        },
      }}
      style={{ cursor: 'pointer', transformOrigin: `${x}px ${y}px` }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name}, ${line.longName} station ${station.stopCode}, ${sub.mailboxCount} mailboxes, ${STATUS_LABEL[sub.status]}`}
    >
      {/* outer halo on hover/active */}
      {isLifted && (
        <circle
          cx={x}
          cy={y}
          r={STATION_R + 10}
          fill={stroke}
          fillOpacity={0.14}
        />
      )}
      {/* active station: glowing outer ring */}
      {active && (
        <motion.circle
          cx={x}
          cy={y}
          r={STATION_R + 6}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
      {/* the station circle marker — white interior + line-coloured stroke */}
      <circle
        cx={x}
        cy={y}
        r={STATION_R}
        fill="#f4f4f8"
        stroke={stroke}
        strokeWidth={isLifted ? 4 : 3}
      />
      {/* logoChar inside the station */}
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fill={stroke}
        style={{
          fontSize: 10,
          fontWeight: 800,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {sub.logoChar}
      </text>
      {/* Stop code badge — small numbered plate to the side of the station */}
      <StopCodePlate
        line={line}
        station={station}
        labelBelow={labelBelow}
      />
      {/* name label */}
      <text
        x={x}
        y={y + labelDy}
        textAnchor="middle"
        fill={isLifted ? '#f4f4f8' : 'var(--wp-text)'}
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {sub.name}
      </text>
      {/* mailbox-count chip — small rounded plate beneath the name */}
      <g>
        <rect
          x={x - 38}
          y={y + chipDy - 8}
          width={76}
          height={16}
          rx={8}
          fill="var(--wp-surface-2)"
          stroke={stroke}
          strokeOpacity={isLifted ? 0.7 : 0.45}
          strokeWidth={1}
        />
        <text
          x={x}
          y={y + chipDy + 3}
          textAnchor="middle"
          fill={stroke}
          style={{
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 0.4,
          }}
        >
          {sub.mailboxCount}mb · {sub.avgWarmth} warmth
        </text>
      </g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// StopCodePlate — tiny numbered plate (e.g. "E1") attached to a station.
// ---------------------------------------------------------------------------

function StopCodePlate({
  line,
  station,
  labelBelow,
}: {
  line: TransitLineDef;
  station: PlacedStation;
  labelBelow: boolean;
}) {
  // Place the plate perpendicular to the line bearing so it doesn't collide
  // with the line itself. East/west lines get plates above; north/south get
  // plates to the right.
  const perpDeg = line.bearingDeg + (labelBelow ? -90 : 90);
  const perpRad = (perpDeg * Math.PI) / 180;
  const dist = STATION_R + 14;
  const px = station.x + dist * Math.cos(perpRad);
  const py = station.y + dist * Math.sin(perpRad);
  return (
    <g>
      <rect
        x={px - 11}
        y={py - 8}
        width={22}
        height={16}
        rx={4}
        fill={line.colorHex}
        stroke="#1a1a26"
        strokeWidth={1}
      />
      <text
        x={px}
        y={py + 4}
        textAnchor="middle"
        fill="#1a1a26"
        style={{
          fontSize: 9,
          fontWeight: 800,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: 0.4,
        }}
      >
        {station.stopCode}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// TransferConnector — dashed line between two stations on different lines
// that share a peer pool. Renders behind the main rails.
// ---------------------------------------------------------------------------

function TransferConnector({
  transfer,
  index,
  focused,
  dimmed,
}: {
  transfer: { from: PlacedStation; to: PlacedStation; pool: string };
  index: number;
  focused: boolean;
  dimmed: boolean;
}) {
  const { from, to } = transfer;
  // Curve the transfer connector so it doesn't cut straight through the hub.
  // Choose the bend perpendicular to the from→to vector, biased AWAY from the
  // hub centre so it arcs out around the central station.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const toHubX = midX - CX;
  const toHubY = midY - CY;
  const len = Math.max(Math.hypot(toHubX, toHubY), 1);
  const outX = toHubX / len;
  const outY = toHubY / len;
  const bendAmt = 30 + (index % 3) * 12;
  const ctrlX = midX + outX * bendAmt;
  const ctrlY = midY + outY * bendAmt;
  const d = `M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`;
  const opacity = dimmed && !focused ? 0.08 : focused ? 0.6 : 0.22;
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="var(--wp-text-faint)"
      strokeOpacity={opacity}
      strokeWidth={TRANSFER_STROKE}
      strokeDasharray="4 6"
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity }}
      transition={{
        pathLength: { duration: 0.9, delay: 1.2 + index * 0.05, ease: 'easeOut' },
        opacity: { duration: 0.4, delay: 1.2 + index * 0.05 },
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// TrainPulse — a small travelling highlight that loops along the focused line.
// Mimics the "train at this position" indicator on real metro maps.
// ---------------------------------------------------------------------------

function TrainPulse({ line }: { line: PlacedLine }) {
  if (line.stations.length === 0) return null;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <motion.path
        d={line.path}
        fill="none"
        stroke={line.def.colorHex}
        strokeWidth={LINE_STROKE + 2}
        strokeLinecap="round"
        strokeOpacity={0.95}
        strokeDasharray="22 220"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -242 * 6 }}
        transition={{ duration: 4.2, ease: 'linear', repeat: Infinity }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CompassWatermark — subtle 4-directional rose in the canvas background.
// ---------------------------------------------------------------------------

function CompassWatermark() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <g>
        {/* ring */}
        <circle
          cx={CX}
          cy={CY}
          r={300}
          fill="none"
          stroke="var(--wp-border)"
          strokeOpacity={0.5}
          strokeWidth={0.8}
          strokeDasharray="3 10"
        />
        <circle
          cx={CX}
          cy={CY}
          r={420}
          fill="none"
          stroke="var(--wp-border)"
          strokeOpacity={0.35}
          strokeWidth={0.8}
          strokeDasharray="2 14"
        />
        {/* tick marks every 30 degrees */}
        {Array.from({ length: 12 }).map((_, i) => {
          const ang = (i * 30 - 90) * (Math.PI / 180);
          const r1 = 296;
          const r2 = 310;
          const x1 = CX + r1 * Math.cos(ang);
          const y1 = CY + r1 * Math.sin(ang);
          const x2 = CX + r2 * Math.cos(ang);
          const y2 = CY + r2 * Math.sin(ang);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--wp-border)"
              strokeOpacity={0.45}
              strokeWidth={0.8}
            />
          );
        })}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NorthArrow — small "N" indicator pinned to the top-right corner of the map.
// ---------------------------------------------------------------------------

function NorthArrow() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 1.0 }}
      className="pointer-events-none absolute right-4 top-4 flex flex-col items-center gap-0.5 rounded-xl border border-border-muted bg-surface/80 px-2.5 py-2 backdrop-blur-xl"
    >
      <Navigation
        className="h-4 w-4 text-accent"
        style={{ transform: 'rotate(0deg)' }}
        aria-hidden
      />
      <span className="font-mono text-[9px] font-bold tracking-[0.18em] text-text-dim">
        N
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// EmptyMapState — nothing-to-show overlay.
// ---------------------------------------------------------------------------

function EmptyMapState() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="pointer-events-auto max-w-sm rounded-2xl border border-border-muted bg-surface-2/70 px-6 py-8 text-center backdrop-blur-xl">
        <span
          className="mx-auto grid h-12 w-12 place-items-center rounded-xl text-accent"
          style={{
            background: 'rgba(242,101,34,0.10)',
            border: '1px solid rgba(242,101,34,0.30)',
          }}
        >
          <Train className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-semibold text-text">
          No stations on the network
        </p>
        <p className="mt-1 text-xs text-text-dim">
          Open your first sub-client station to start running the metro.
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium text-accent"
          style={{
            borderColor: 'rgba(242,101,34,0.30)',
            background: 'rgba(242,101,34,0.15)',
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Open new station
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailRail — right-side panel: station details when one is selected,
// system overview when nothing is selected.
// ---------------------------------------------------------------------------

function DetailRail({
  d,
  selected,
  transfers,
  totalStations,
  mailboxTotal,
  onClose,
}: {
  d: AgencyWorkspaceData;
  selected: PlacedStation | null;
  transfers: Array<{ from: PlacedStation; to: PlacedStation; pool: string }>;
  totalStations: number;
  mailboxTotal: number;
  onClose: () => void;
}) {
  return (
    <div className="relative h-[640px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key={selected.sub.id}
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <StationDetail
              station={selected}
              transfers={transfers}
              onClose={onClose}
            />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <NetworkOverview
              d={d}
              totalStations={totalStations}
              mailboxTotal={mailboxTotal}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NetworkOverview — default detail rail content when no station is selected.
// ---------------------------------------------------------------------------

function NetworkOverview({
  d,
  totalStations,
  mailboxTotal,
}: {
  d: AgencyWorkspaceData;
  totalStations: number;
  mailboxTotal: number;
}) {
  const mrrTotal = useMemo(
    () => d.subClients.reduce((acc, s) => acc + s.monthlyMrrUsd, 0),
    [d.subClients],
  );
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold text-text">
            Network overview
          </h2>
        </div>
        <p className="mt-1 text-xs text-text-dim">
          Tap any station on the map to inspect that sub-client.
        </p>
      </header>

      <div className="space-y-3 p-5">
        <OverviewRow
          icon={MapPin}
          label="Stations on the network"
          value={String(totalStations)}
          sub="all transit lines combined"
        />
        <OverviewRow
          icon={Inbox}
          label="Mailboxes under management"
          value={String(mailboxTotal)}
          sub="across every line"
        />
        <OverviewRow
          icon={Zap}
          label="Portfolio MRR"
          value={formatMoney(mrrTotal)}
          sub="combined monthly recurring"
          tone="accent2"
        />
      </div>

      <div className="border-t border-white/5 px-5 py-4">
        <div className="mb-2.5 flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-accent4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Premier stations by MRR
          </span>
        </div>
        <ul className="space-y-2">
          {[...d.subClients]
            .sort((a, b) => b.monthlyMrrUsd - a.monthlyMrrUsd)
            .slice(0, 3)
            .map((sc, i) => {
              const lineDef =
                LINES.find((l) => l.status === sc.status) ?? LINES[0]!;
              return (
                <li
                  key={sc.id}
                  className="flex items-center gap-3 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
                >
                  <span className="font-mono text-[11px] text-text-faint w-3">
                    {i + 1}
                  </span>
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold text-bg"
                    style={{ background: lineDef.color }}
                    aria-hidden
                  >
                    {sc.logoChar}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text">
                      {sc.name}
                    </p>
                    <p className="font-mono text-[10px] text-text-dim">
                      {lineDef.longName} · {sc.mailboxCount} mailboxes
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold tabular-nums text-accent2">
                    {formatMoney(sc.monthlyMrrUsd)}
                  </span>
                </li>
              );
            })}
        </ul>
      </div>

      <div className="border-t border-white/5 px-5 py-4">
        <div className="mb-2.5 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Transit team on duty
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {d.team.map((m) => {
            const initials = m.name
              .split(' ')
              .map((s) => s.charAt(0))
              .join('')
              .slice(0, 2)
              .toUpperCase();
            return (
              <span
                key={m.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] ${ROLE_RING[m.role]}`}
                title={`${m.name} (${ROLE_LABEL[m.role]}) · last on duty ${m.lastActiveAgo}`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full border border-border-muted bg-surface-2 font-mono text-[9px] font-semibold">
                  {initials}
                </span>
                <span className="font-medium text-text">{m.name}</span>
                <span className="font-mono text-[10px]">
                  {ROLE_LABEL[m.role]}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-auto border-t border-white/5 px-5 py-4">
        <div className="mb-2.5 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Operating privileges
          </span>
        </div>
        <ul className="space-y-2">
          <PrivilegeRow
            label="Custom branding"
            value={
              d.features.whiteLabel.enabled
                ? (d.features.whiteLabel.brandName ?? 'Branded')
                : 'Off'
            }
            enabled={d.features.whiteLabel.enabled}
          />
          <PrivilegeRow
            label="Custom domain"
            value={
              d.features.customDomain.enabled
                ? (d.features.customDomain.domain ?? 'Pending DNS')
                : 'Off'
            }
            enabled={d.features.customDomain.enabled}
          />
          <PrivilegeRow
            label="Dedicated peer pool"
            value={
              d.features.dedicatedPool.enabled
                ? `${formatNumber(d.features.dedicatedPool.memberCount)} peers`
                : 'Off'
            }
            enabled={d.features.dedicatedPool.enabled}
          />
        </ul>
      </div>
    </div>
  );
}

function PrivilegeRow({
  label,
  value,
  enabled,
}: {
  label: string;
  value: string;
  enabled: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2">
      <span className="flex items-center gap-2 text-xs text-text">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            enabled ? 'bg-accent' : 'bg-text-faint'
          }`}
          aria-hidden
        />
        {label}
      </span>
      <span className="font-mono text-[11px] text-text-dim">{value}</span>
    </li>
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
// StationDetail — content shown in the detail rail when a station is selected.
// ---------------------------------------------------------------------------

function StationDetail({
  station,
  transfers,
  onClose,
}: {
  station: PlacedStation;
  transfers: Array<{ from: PlacedStation; to: PlacedStation; pool: string }>;
  onClose: () => void;
}) {
  const { sub, line } = station;
  const myTransfers = useMemo(
    () =>
      transfers
        .filter((t) => t.from.sub.id === sub.id || t.to.sub.id === sub.id)
        .map((t) => (t.from.sub.id === sub.id ? t.to : t.from)),
    [transfers, sub.id],
  );

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 font-mono text-base font-bold"
            style={{
              background: '#f4f4f8',
              borderColor: line.colorHex,
              color: line.colorHex,
            }}
            aria-hidden
          >
            {sub.logoChar}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-text">
                {sub.name}
              </p>
              <span
                className="grid h-4 w-7 place-items-center rounded font-mono text-[9px] font-bold text-bg"
                style={{ background: line.color }}
                aria-hidden
                title={`Stop ${station.stopCode}`}
              >
                {station.stopCode}
              </span>
            </div>
            <p className="truncate font-mono text-[11px] text-text-dim">
              {sub.ownerEmail}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close station detail"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 space-y-4 p-5">
        {/* Line indicator pill */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: `${line.colorHex}55`,
              background: `${line.colorHex}1a`,
              color: line.colorHex,
            }}
          >
            <line.icon className="h-3 w-3" />
            {line.longName}
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-0.5 text-[11px] font-medium text-accent3"
          >
            <Sparkles className="h-3 w-3" />
            {sub.plan}
          </span>
          <span className="ml-auto font-mono text-[10px] text-text-faint">
            {sub.createdAgo}
          </span>
        </div>

        {/* Headline: warmth + last activity */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-text-dim">
                Train warmth
              </p>
              <p
                className="mt-0.5 font-mono text-4xl font-semibold leading-none tabular-nums"
                style={{ color: line.colorHex }}
              >
                {sub.avgWarmth}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[11px] text-text-dim">
                {sub.lastActiveAgo}
              </p>
              <p className="mt-0.5 text-[10px] text-text-faint">
                last train through
              </p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full"
              style={{ background: line.color }}
              initial={{ width: 0 }}
              animate={{ width: `${sub.avgWarmth}%` }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Quick stats grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <StatCell
            icon={Inbox}
            label="Mailboxes"
            value={String(sub.mailboxCount)}
          />
          <StatCell
            icon={Users}
            label="Team"
            value={String(sub.teamCount)}
          />
          <StatCell
            icon={Zap}
            label="MRR"
            value={formatMoney(sub.monthlyMrrUsd)}
            tone="accent2"
          />
        </div>

        {/* Mini route map — which transfers connect to this station */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              <Waves className="h-3.5 w-3.5 text-accent" />
              Pool transfers
            </span>
            <span className="font-mono text-[10px] text-text-faint">
              {myTransfers.length} connection
              {myTransfers.length === 1 ? '' : 's'}
            </span>
          </div>
          {myTransfers.length === 0 ? (
            <p className="rounded-lg border border-border-muted bg-surface px-3 py-3 text-center text-xs text-text-dim">
              No cross-pool transfers from this station yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {myTransfers.map((other) => (
                <li
                  key={other.sub.id}
                  className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface px-2.5 py-2"
                >
                  <span
                    className="grid h-5 w-5 place-items-center rounded-full border font-mono text-[9px] font-bold"
                    style={{
                      background: '#f4f4f8',
                      borderColor: other.line.colorHex,
                      color: other.line.colorHex,
                    }}
                    aria-hidden
                  >
                    {other.sub.logoChar}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-text">
                    {other.sub.name}
                  </span>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: other.line.colorHex }}
                  >
                    {other.line.code}-{other.stopCode}
                  </span>
                  <ArrowRight className="h-3 w-3 text-text-faint" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Open-dashboard CTA chip */}
        <button
          type="button"
          className="group inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors"
          style={{
            borderColor: line.colorHex,
            background: `${line.colorHex}1a`,
            color: line.colorHex,
          }}
        >
          <Mail className="h-4 w-4" />
          Open {sub.name.split(' ')[0]} station dashboard
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>

        {/* At-risk callout */}
        {sub.status === 'at_risk' && (
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: 'rgba(255,92,122,0.30)',
              background: 'rgba(255,92,122,0.10)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
                style={{
                  background: 'rgba(255,92,122,0.15)',
                  color: 'var(--wp-danger)',
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold"
                  style={{ color: 'var(--wp-danger)' }}
                >
                  Service disruption at this station
                </p>
                <p className="mt-0.5 text-xs text-text-dim">
                  Trains are running with delays — warmup engagement has dropped
                  below the recovery threshold. Inspect DNS / mailbox health
                  before scheduling new departures.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding-line tip */}
        {sub.status === 'inactive' && (
          <div className="rounded-xl border border-accent2/30 bg-accent2/10 p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent2/15 text-accent2">
                <Info className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-accent2">
                  Awaiting first run
                </p>
                <p className="mt-0.5 text-xs text-text-dim">
                  This station is on the Onboarding Line — first train departs
                  once at least one mailbox is connected and verified.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bookmark footer */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 px-3 py-2 text-[11px] text-text-dim">
          <span className="flex items-center gap-1.5">
            <ExternalLink className="h-3 w-3" />
            Bookmark ·{' '}
            <span className="font-mono text-text-faint">
              {station.line.code}/{station.stopCode}/{sub.id}
            </span>
          </span>
        </div>
      </div>
    </>
  );
}

function StatCell({
  icon: Icon,
  label,
  value,
  tone = 'text',
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  tone?: 'text' | 'accent' | 'accent2';
}) {
  const valueTone =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-text';
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={`font-mono text-base font-semibold tabular-nums ${valueTone}`}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SystemStatusFooter — 4 line-status mini cards + a service-alert feed.
// ---------------------------------------------------------------------------

function SystemStatusFooter({
  lines,
  alerts,
  d,
  onSelectStation,
}: {
  lines: PlacedLine[];
  alerts: ServiceAlert[];
  d: AgencyWorkspaceData;
  onSelectStation: (id: string | null) => void;
}) {
  // Map alert.badge → station so we can wire up "jump to station" on alert click.
  const stationByCode = useMemo(() => {
    const m = new Map<string, AgencyWorkspaceData['subClients'][number]['id']>();
    for (const line of lines) {
      for (const s of line.stations) {
        m.set(s.stopCode, s.sub.id);
      }
    }
    return m;
  }, [lines]);
  const liveWebhookCount = d.webhooks.filter((w) => w.status === 'live').length;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* Line status cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:col-span-7">
        {lines.map((line, i) => (
          <LineStatusCard key={line.def.id} line={line} index={i} />
        ))}
      </div>
      {/* Service alerts */}
      <div className="lg:col-span-5">
        <ServiceAlerts
          alerts={alerts}
          stationByCode={stationByCode}
          onSelectStation={onSelectStation}
          d={d}
          liveWebhookCount={liveWebhookCount}
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// LineStatusCard — single transit-line status panel in the system footer.
// ---------------------------------------------------------------------------

function LineStatusCard({
  line,
  index,
}: {
  line: PlacedLine;
  index: number;
}) {
  const empty = line.stations.length === 0;
  const conditionTone: 'ok' | 'warn' | 'delay' | 'info' =
    line.def.id === 'recovery'
      ? 'delay'
      : line.def.id === 'warming'
        ? 'warn'
        : line.def.id === 'onboarding'
          ? 'info'
          : 'ok';
  const dotColor =
    conditionTone === 'ok'
      ? 'var(--wp-success)'
      : conditionTone === 'warn'
        ? 'var(--wp-warning)'
        : conditionTone === 'delay'
          ? 'var(--wp-danger)'
          : 'var(--wp-accent-2)';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 + index * 0.06 }}
      className="overflow-hidden rounded-2xl border bg-surface/70 backdrop-blur-xl"
      style={{
        borderColor: empty ? 'var(--wp-border)' : `${line.def.colorHex}55`,
      }}
    >
      {/* Coloured top stripe matching the line */}
      <div
        className="h-1.5 w-full"
        style={{ background: line.def.color }}
        aria-hidden
      />
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold text-bg"
              style={{ background: line.def.color }}
              aria-hidden
            >
              {line.def.code}
            </span>
            <span className="truncate text-sm font-semibold text-text">
              {line.def.name}
            </span>
          </div>
          <span
            className="flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              borderColor: `${dotColor}55`,
              color: dotColor,
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: dotColor }}
              aria-hidden
            />
            {conditionTone === 'ok'
              ? 'On time'
              : conditionTone === 'warn'
                ? 'Ramping'
                : conditionTone === 'delay'
                  ? 'Delays'
                  : 'New'}
          </span>
        </div>
        <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-text">
          {line.stations.length}
          <span className="ml-1 font-sans text-[11px] font-normal text-text-dim">
            station{line.stations.length === 1 ? '' : 's'}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-text-dim">{line.def.condition}</p>
        {/* tiny strip of dots representing each station on the line */}
        {!empty && (
          <div className="mt-3 flex items-center gap-1.5">
            {line.stations.map((s) => (
              <span
                key={s.sub.id}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: line.def.colorHex }}
                aria-hidden
                title={s.sub.name}
              />
            ))}
            <span className="ml-auto font-mono text-[10px] text-text-faint">
              {line.def.code}1 → {line.def.code}
              {line.stations.length}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ServiceAlerts — transit-style alert feed in the system footer.
// ---------------------------------------------------------------------------

function ServiceAlerts({
  alerts,
  stationByCode,
  onSelectStation,
  d,
  liveWebhookCount,
}: {
  alerts: ServiceAlert[];
  stationByCode: Map<string, string>;
  onSelectStation: (id: string | null) => void;
  d: AgencyWorkspaceData;
  liveWebhookCount: number;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface/70 backdrop-blur-xl">
      <header className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-accent" />
          <span className="text-sm font-semibold text-text">Service alerts</span>
          <span
            className="inline-flex items-center gap-1 rounded-full border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-dim"
            style={{ borderColor: 'var(--wp-border)' }}
          >
            {alerts.length} live
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--wp-success)' }}
          >
            <Signal className="h-3 w-3" />
            Stream up
          </span>
          <span className="font-mono text-[10px] text-text-faint">
            {liveWebhookCount}/{d.webhooks.length} hooks live
          </span>
        </div>
      </header>
      <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {alerts.length === 0 ? (
          <li className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-6 text-center text-xs text-text-dim">
            No service alerts — every line is running on schedule.
          </li>
        ) : (
          alerts.map((alert, i) => (
            <ServiceAlertRow
              key={alert.id}
              alert={alert}
              index={i}
              onClick={() => {
                const id = stationByCode.get(alert.badge);
                if (id) onSelectStation(id);
              }}
            />
          ))
        )}
      </ul>
      <footer className="border-t border-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[10px] text-text-faint">
          <span className="flex items-center gap-1.5">
            <Radio className="h-3 w-3" />
            Live dispatch feed · auto-refresh every 60s
          </span>
          <span className="font-mono">{d.agency.slug}</span>
        </div>
      </footer>
    </div>
  );
}

function ServiceAlertRow({
  alert,
  index,
  onClick,
}: {
  alert: ServiceAlert;
  index: number;
  onClick: () => void;
}) {
  const tone =
    alert.tone === 'delay'
      ? {
          color: 'var(--wp-danger)',
          bg: 'rgba(255,92,122,0.10)',
          border: 'rgba(255,92,122,0.30)',
          icon: AlertTriangle,
          label: 'Delay',
        }
      : alert.tone === 'warn'
        ? {
            color: 'var(--wp-warning)',
            bg: 'rgba(255,180,84,0.10)',
            border: 'rgba(255,180,84,0.30)',
            icon: Flame,
            label: 'Ramping',
          }
        : alert.tone === 'ok'
          ? {
              color: 'var(--wp-success)',
              bg: 'rgba(61,220,151,0.10)',
              border: 'rgba(61,220,151,0.30)',
              icon: Activity,
              label: 'On time',
            }
          : {
              color: 'var(--wp-accent-2)',
              bg: 'rgba(255,138,75,0.10)',
              border: 'rgba(255,138,75,0.30)',
              icon: Sparkles,
              label: 'New',
            };
  return (
    <motion.li
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.45 + index * 0.07 }}
    >
      <button
        type="button"
        onClick={onClick}
        className="group w-full rounded-lg border bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
        style={{ borderColor: tone.border }}
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
            style={{ background: tone.bg, color: tone.color }}
          >
            <tone.icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-semibold text-text">
                {alert.headline}
              </p>
              <span
                className="grid h-4 shrink-0 items-center rounded font-mono text-[9px] font-bold text-bg px-1"
                style={{ background: tone.color }}
              >
                {alert.badge}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-text-dim">
              {alert.detail}
            </p>
          </div>
          <span
            className="shrink-0 font-mono text-[9px] uppercase tracking-wider"
            style={{ color: tone.color }}
          >
            {tone.label}
          </span>
        </div>
      </button>
    </motion.li>
  );
}

