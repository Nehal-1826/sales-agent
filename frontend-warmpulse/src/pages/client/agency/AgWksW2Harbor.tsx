import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, Anchor, ArrowUpRight, Bell, Building2, Compass, Crown, Flag,
  Globe, Inbox, Layers, Mail, Navigation, Palette, Radio, Sailboat,
  Shield, ShieldAlert, Ship as ShipIcon, Sparkles, Users, Waves,
  Wind, X,
} from 'lucide-react';
import type { AgencyWorkspaceData } from '@/pages/client/agency/AgWksC1Federation';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksW2Harbor — Agency-tier WORKSPACE, design candidate W2 "Marina Harbor".
 *
 * Top-down nautical chart: agency = harbormaster lighthouse, sub-clients = ships
 * moored in numbered slips along tier-grouped piers. Bathymetric contour grid,
 * compass rose, slow-rotating beam, flags + pennants per ship, animated wake
 * ripples. Tide chart, weather summary, harbormaster bulletins and vessel
 * registry sit in the footer band.
 *
 * Visual rule: nautical metaphor, palette stays orange — the "sea" is the dark
 * Shailog surface with subtle orange harbor lights, never blue. Flags use
 * semantic green/orange/red.
 *
 * Fully STANDALONE — no router, no query hooks, no required props. All values
 * come from the inline MOCK so the preview harness can mount it prop-less.
 */

// ---------------------------------------------------------------------------
// Theme + geometry helpers (token CSS vars with fallbacks)
// ---------------------------------------------------------------------------

/**
 * Centralised palette. `var(--wp-…)` with deterministic fallbacks so SVG
 * `stroke` / `fill` still paint when the CSS var is undefined (pre-paint, etc).
 */
const TOK = {
  accent: 'var(--wp-accent, #F26522)',
  accent2: 'var(--wp-accent-2, #FF8A4B)',
  accent3: 'var(--wp-accent-3, #FF9670)',
  success: 'var(--wp-success, #3ddc97)',
  warning: 'var(--wp-warning, #ffb454)',
  danger: 'var(--wp-danger, #ff5c7a)',
  surface: 'var(--wp-surface, #12121a)',
  surface2: 'var(--wp-surface-2, #1a1a26)',
  border: 'var(--wp-border, #2a2a3a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #8888a0)',
  textFaint: 'var(--wp-text-faint, #5a5a72)',
} as const;

/**
 * Hard hex fallbacks for SVG attributes where `var(…)` is risky (e.g. inside
 * `stopColor` on a `linearGradient`). Matches the Shailog orange palette.
 */
const HEX = {
  accent: '#F26522', accent2: '#FF8A4B', accent3: '#FF9670', accentDeep: '#C8470E',
  success: '#3ddc97', warning: '#ffb454', danger: '#ff5c7a',
  surface: '#12121a', surface2: '#1a1a26', surfaceDeep: '#0c0c14', border: '#2a2a3a',
  textDim: '#8888a0', textFaint: '#5a5a72',
} as const;

type SubClientStatus = AgencyWorkspaceData['subClients'][number]['status'];
type SubClient = AgencyWorkspaceData['subClients'][number];

const STATUS_HEX: Record<SubClientStatus, string> = {
  healthy: HEX.success, warming: HEX.warning, at_risk: HEX.danger, inactive: HEX.textFaint,
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'All clear', warming: 'Warming', at_risk: 'Distress', inactive: 'Moored',
};

const STATUS_FLAG_NAME: Record<SubClientStatus, string> = {
  healthy: 'Green flag', warming: 'Yellow flag', at_risk: 'Red flag', inactive: 'White flag',
};

// ---------------------------------------------------------------------------
// MOCK data — Northwind Agency, 8 sub-clients (Helix, Nimbus, Orion, etc.)
// ---------------------------------------------------------------------------

const SUB_CLIENTS: AgencyWorkspaceData['subClients'] = [
  { id: 'sc-helix', name: 'Helix', logoChar: 'HX', ownerEmail: 'cap@helix.io',
    plan: 'Pro Plus', mailboxCount: 24, teamCount: 6, avgWarmth: 92,
    status: 'healthy', monthlyMrrUsd: 1620,
    createdAgo: 'moored 9 months ago', lastActiveAgo: 'signal 1m ago' },
  { id: 'sc-nimbus', name: 'Nimbus Cloud', logoChar: 'NM', ownerEmail: 'ops@nimbus.cloud',
    plan: 'Pro Plus', mailboxCount: 20, teamCount: 5, avgWarmth: 87,
    status: 'healthy', monthlyMrrUsd: 1340,
    createdAgo: 'moored 7 months ago', lastActiveAgo: 'signal 4m ago' },
  { id: 'sc-orion', name: 'Orion Reach', logoChar: 'OR', ownerEmail: 'helm@orionreach.com',
    plan: 'Pro Plus', mailboxCount: 17, teamCount: 4, avgWarmth: 84,
    status: 'healthy', monthlyMrrUsd: 1080,
    createdAgo: 'moored 5 months ago', lastActiveAgo: 'signal 9m ago' },
  { id: 'sc-fjord', name: 'Fjord Sales', logoChar: 'FJ', ownerEmail: 'first@fjord.sale',
    plan: 'Pro', mailboxCount: 12, teamCount: 3, avgWarmth: 79,
    status: 'healthy', monthlyMrrUsd: 720,
    createdAgo: 'moored 4 months ago', lastActiveAgo: 'signal 16m ago' },
  { id: 'sc-azure-reef', name: 'Azure Reef', logoChar: 'AR', ownerEmail: 'mate@azurereef.co',
    plan: 'Pro', mailboxCount: 10, teamCount: 3, avgWarmth: 76,
    status: 'healthy', monthlyMrrUsd: 580,
    createdAgo: 'moored 3 months ago', lastActiveAgo: 'signal 21m ago' },
  { id: 'sc-tideway', name: 'Tideway', logoChar: 'TW', ownerEmail: 'crew@tideway.email',
    plan: 'Starter', mailboxCount: 7, teamCount: 2, avgWarmth: 68,
    status: 'warming', monthlyMrrUsd: 340,
    createdAgo: 'moored 7 weeks ago', lastActiveAgo: 'signal 41m ago' },
  { id: 'sc-driftwood', name: 'Driftwood', logoChar: 'DW', ownerEmail: 'crew@driftwood.io',
    plan: 'Starter', mailboxCount: 5, teamCount: 2, avgWarmth: 58,
    status: 'warming', monthlyMrrUsd: 240,
    createdAgo: 'moored 5 weeks ago', lastActiveAgo: 'signal 1h ago' },
  { id: 'sc-marlin', name: 'Marlin Outreach', logoChar: 'ML', ownerEmail: 'first@marlinoutreach.com',
    plan: 'Starter', mailboxCount: 4, teamCount: 1, avgWarmth: 34,
    status: 'at_risk', monthlyMrrUsd: 180,
    createdAgo: 'moored 10 weeks ago', lastActiveAgo: 'signal 3h ago' },
];

const TEAM: AgencyWorkspaceData['team'] = [
  { id: 't-owner', name: 'You', email: 'you@northwind.agency',
    role: 'owner', lastActiveAgo: 'now', subClientsManaged: 8 },
  { id: 't-admin-1', name: 'Priya Anand', email: 'priya@northwind.agency',
    role: 'admin', lastActiveAgo: '12m ago', subClientsManaged: 3 },
  { id: 't-admin-2', name: 'Marc Hollis', email: 'marc@northwind.agency',
    role: 'admin', lastActiveAgo: '34m ago', subClientsManaged: 3 },
  { id: 't-member-1', name: 'Lia Soto', email: 'lia@northwind.agency',
    role: 'member', lastActiveAgo: '1h ago', subClientsManaged: 2 },
];

const API_KEYS: AgencyWorkspaceData['apiKeys'] = [
  { id: 'ak-1', label: 'Bridge · Production', masked: 'wp_live_••••_8Fk2',
    scope: 'admin', lastUsedAgo: '4m ago' },
  { id: 'ak-2', label: 'Logbook CRON', masked: 'wp_live_••••_Lp93',
    scope: 'read', lastUsedAgo: '38m ago' },
];

const WEBHOOKS: AgencyWorkspaceData['webhooks'] = [
  { id: 'wh-1', url: 'hooks.northwind.agency/warmpulse/events',
    events: ['mailbox.paused', 'warmth.alert', 'bounce.spike'], status: 'live' },
  { id: 'wh-2', url: 'ops.northwind.agency/slack/relay',
    events: ['peer.failed', 'dns.break'], status: 'paused' },
];

const MOCK: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency', plan: 'Agency',
    ownerEmail: 'you@northwind.agency', region: 'us-east-1', slug: 'northwind-agency',
  },
  features: {
    whiteLabel: { enabled: true, brandName: 'Northwind Mail Ops', hasLogo: true },
    customDomain: { enabled: true, domain: 'mail.northwind.agency', status: 'verified' },
    dedicatedPool: { enabled: true, poolName: 'Northwind Premium Pool', memberCount: 412 },
  },
  subClients: SUB_CLIENTS,
  team: TEAM,
  apiKeys: API_KEYS,
  webhooks: WEBHOOKS,
};

/** Skeleton fallback shared with sibling variants — keeps live adapter safe. */
export const AGENCY_WORKSPACE_SKELETON_W2: AgencyWorkspaceData = {
  agency: {
    name: 'Your agency', plan: 'Agency',
    ownerEmail: '', region: 'us-east-1', slug: 'your-agency',
  },
  features: {
    whiteLabel: { enabled: false, brandName: null, hasLogo: false },
    customDomain: { enabled: false, domain: null, status: 'not_set' },
    dedicatedPool: { enabled: false, poolName: null, memberCount: 0 },
  },
  subClients: [], team: [], apiKeys: [], webhooks: [],
};

// ---------------------------------------------------------------------------
// Harbor geometry — SVG viewBox + pier / slip placement model
// ---------------------------------------------------------------------------

const VB_W = 1100;
const VB_H = 760;
/** Lighthouse base position — center-top of the canvas, slightly inset. */
const LIGHTHOUSE_X = VB_W / 2;
const LIGHTHOUSE_Y = 110;

/** Horizontal piers extending from the harbormaster wall into the water. */
interface PierDef {
  id: 'pier-a' | 'pier-b' | 'pier-c';
  /** Display label rendered as a chart annotation near the base of the pier. */
  label: string;
  /** Y-coordinate of the pier's spine in viewBox space. */
  y: number;
  /** Which sub-client tier docks here. Tier is derived from `plan`. */
  tier: 'tier-1' | 'tier-2' | 'tier-3';
}

const PIERS: PierDef[] = [
  { id: 'pier-a', label: 'Pier A · Flagship', y: 310, tier: 'tier-1' },
  { id: 'pier-b', label: 'Pier B · Standard', y: 470, tier: 'tier-2' },
  { id: 'pier-c', label: 'Pier C · Tugs', y: 620, tier: 'tier-3' },
];

const PIER_LEFT_X = 130;
const PIER_RIGHT_X = VB_W - 130;
const PIER_LENGTH = PIER_RIGHT_X - PIER_LEFT_X;

/** Classify a sub-client into one of the three pier tiers. */
function tierForSub(sub: SubClient): PierDef['tier'] {
  if (sub.plan === 'Pro Plus') return 'tier-1';
  if (sub.plan === 'Pro') return 'tier-2';
  return 'tier-3';
}

/** Hull-size token bucket used by the ship glyph and tooltip. */
type HullSize = 'sloop' | 'cutter' | 'frigate';

function hullSizeForMailboxes(mailboxCount: number): HullSize {
  if (mailboxCount >= 16) return 'frigate';
  if (mailboxCount >= 9) return 'cutter';
  return 'sloop';
}

const HULL_DIMS: Record<HullSize, { w: number; h: number }> = {
  sloop: { w: 48, h: 22 },
  cutter: { w: 64, h: 28 },
  frigate: { w: 84, h: 34 },
};

/**
 * Slip placement — deterministic per pier, evenly spaced along its length.
 * `x` / `y` are the moored hull's center in viewBox space; `slipLabel` is the
 * human-readable plate ("A-03") rendered on the hull.
 */
interface PlacedShip {
  sub: SubClient;
  pier: PierDef;
  slipIndex: number;
  x: number;
  y: number;
  hull: HullSize;
  slipLabel: string;
}

/**
 * Build the slip plan deterministically:
 * 1. Bucket sub-clients by tier → pier.
 * 2. Sort each bucket by mailboxCount DESC (largest ships dock outermost).
 * 3. Evenly space ships along the pier.
 */
function placeShips(subs: SubClient[]): PlacedShip[] {
  const buckets: Record<PierDef['tier'], SubClient[]> = {
    'tier-1': [], 'tier-2': [], 'tier-3': [],
  };
  for (const sub of subs) buckets[tierForSub(sub)].push(sub);
  for (const tier of Object.keys(buckets) as PierDef['tier'][]) {
    buckets[tier].sort((a, b) => b.mailboxCount - a.mailboxCount);
  }

  const placed: PlacedShip[] = [];
  for (const pier of PIERS) {
    const tierSubs = buckets[pier.tier];
    if (tierSubs.length === 0) continue;
    const slotCount = tierSubs.length;
    const inset = 90;
    const usable = PIER_LENGTH - inset * 2;
    const step = slotCount === 1 ? 0 : usable / (slotCount - 1);
    tierSubs.forEach((sub, i) => {
      const hull = hullSizeForMailboxes(sub.mailboxCount);
      const x = PIER_LEFT_X + inset + (slotCount === 1 ? usable / 2 : step * i);
      const y = pier.y - HULL_DIMS[hull].h / 2 - 14;
      placed.push({
        sub, pier, slipIndex: i, x, y, hull,
        slipLabel: `${pier.id.slice(-1).toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      });
    });
  }
  return placed;
}

// ---------------------------------------------------------------------------
// Live ticker — drives the timestamp + tide indicator every few seconds
// ---------------------------------------------------------------------------

function useHarborClock(): { hhmm: string; secondsTick: number } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 2_500);
    return () => window.clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return { hhmm: `${hh}:${mm}`, secondsTick: now.getSeconds() };
}

// ---------------------------------------------------------------------------
// Aggregate metrics derived from the data shape
// ---------------------------------------------------------------------------

interface HarborMetrics {
  totalShips: number;
  inDistress: number;
  warming: number;
  healthy: number;
  totalMailboxes: number;
  totalMrrUsd: number;
  weather: 'FAIR' | 'OVERCAST' | 'STORMY';
  band: 'ALL CLEAR' | 'STORM WATCH';
  avgWarmth: number;
}

function computeMetrics(subs: SubClient[]): HarborMetrics {
  let healthy = 0;
  let warming = 0;
  let inDistress = 0;
  let totalMailboxes = 0;
  let totalMrrUsd = 0;
  let warmthSum = 0;
  for (const sub of subs) {
    if (sub.status === 'healthy') healthy += 1;
    if (sub.status === 'warming') warming += 1;
    if (sub.status === 'at_risk') inDistress += 1;
    totalMailboxes += sub.mailboxCount;
    totalMrrUsd += sub.monthlyMrrUsd;
    warmthSum += sub.avgWarmth;
  }
  const totalShips = subs.length;
  const healthyRatio = totalShips === 0 ? 1 : healthy / totalShips;
  const weather: HarborMetrics['weather'] =
    inDistress > 0 ? 'STORMY' : healthyRatio < 0.7 ? 'OVERCAST' : 'FAIR';
  const band: HarborMetrics['band'] = inDistress > 0 ? 'STORM WATCH' : 'ALL CLEAR';
  const avgWarmth = totalShips === 0 ? 0 : Math.round(warmthSum / totalShips);
  return {
    totalShips, inDistress, warming, healthy,
    totalMailboxes, totalMrrUsd, weather, band, avgWarmth,
  };
}

// ---------------------------------------------------------------------------
// Component (default + named export)
// ---------------------------------------------------------------------------

export function AgWksW2Harbor(
  { data }: { data?: AgencyWorkspaceData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const placed = useMemo(() => placeShips(d.subClients), [d.subClients]);
  const metrics = useMemo(() => computeMetrics(d.subClients), [d.subClients]);
  const { hhmm, secondsTick } = useHarborClock();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const activePlaced = useMemo(
    () => placed.find((p) => p.sub.id === activeId) ?? null,
    [placed, activeId],
  );

  // Synthesised tide chart series — derived from per-sub mailbox totals so
  // the wave shape responds to the actual portfolio, not a static curve.
  const tideSeries = useMemo(() => buildTideSeries(d.subClients), [d.subClients]);

  // Recent maritime bulletins — derived from at-risk / warming sub-clients.
  // Falls back to an "all-clear" bulletin when the harbor is healthy.
  const bulletins = useMemo(() => buildBulletins(d.subClients), [d.subClients]);

  return (
    <div className="space-y-5">
      <HarborHeader agency={d.agency} metrics={metrics} hhmm={hhmm} secondsTick={secondsTick} />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut', delay: 0.05 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className={`relative ${activePlaced ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          <HarborView
            placed={placed} activeId={activeId} hoverId={hoverId}
            onSelect={setActiveId} onHover={setHoverId}
            agencyName={d.agency.name} metrics={metrics}
          />
        </div>

        <AnimatePresence mode="wait">
          {activePlaced && (
            <motion.div
              key={activePlaced.sub.id}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-4"
            >
              <ShipDetailPanel
                placed={activePlaced} agency={d.agency}
                onClose={() => setActiveId(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <HarborFooter
        metrics={metrics} tideSeries={tideSeries} bulletins={bulletins}
        team={d.team} apiKeyCount={d.apiKeys.length}
        webhookCount={d.webhooks.filter((w) => w.status === 'live').length}
        features={d.features}
      />
    </div>
  );
}

export default AgWksW2Harbor;

// ---------------------------------------------------------------------------
// Harbor header band — harbormaster station + tide / wind / status pill
// ---------------------------------------------------------------------------

function HarborHeader({
  agency, metrics, hhmm, secondsTick,
}: {
  agency: AgencyWorkspaceData['agency'];
  metrics: HarborMetrics;
  hhmm: string;
  secondsTick: number;
}) {
  // Synthesise tide / wind readings from the seconds tick so the UI breathes.
  const tideMetres = useMemo(
    () => (2.0 + Math.sin(((secondsTick % 12) / 12) * Math.PI * 2) * 0.6).toFixed(1),
    [secondsTick],
  );
  const windKts = useMemo(() => 10 + ((secondsTick * 3) % 10), [secondsTick]);

  const bandColor =
    metrics.band === 'ALL CLEAR'
      ? { bg: 'bg-accent/10', border: 'border-accent/35', text: 'text-accent' }
      : {
          bg: 'bg-[var(--wp-danger,#ff5c7a)]/12',
          border: 'border-[var(--wp-danger,#ff5c7a)]/40',
          text: 'text-[var(--wp-danger,#ff5c7a)]',
        };

  return (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-border-muted bg-surface/65 px-5 py-4 backdrop-blur-xl"
    >
      <div className="flex min-w-0 items-start gap-4">
        <motion.span
          aria-hidden
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent/35 bg-accent/12"
        >
          <Navigation className="h-5 w-5 text-accent" style={{ transform: 'rotate(-22deg)' }} />
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{ boxShadow: '0 0 22px rgba(242,101,34,0.32)' }}
            animate={{ opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
          />
        </motion.span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
              Harbormaster station
            </span>
            <span className="font-mono text-[10px] text-text-faint">·</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-dim">
              Port of {agency.region}
            </span>
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-text">
            {agency.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
              <Sparkles className="h-3 w-3" />
              {agency.plan}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/70 px-2.5 py-0.5 font-mono text-[11px] text-text-dim">
              <Anchor className="h-3 w-3" />
              {metrics.totalShips} ships moored
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/70 px-2.5 py-0.5 font-mono text-[11px] text-text-dim">
              <Inbox className="h-3 w-3" />
              {metrics.totalMailboxes} mailboxes
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.3em] text-text-faint sm:inline">
          {hhmm} UTC
        </span>
        <ReadingPill icon={<Waves className="h-3.5 w-3.5" />} label="HIGH TIDE" value={`${tideMetres}m`} />
        <ReadingPill icon={<Wind className="h-3.5 w-3.5" />} label="NE" value={`${windKts}kts`} />
        <motion.span
          className={`inline-flex items-center gap-1.5 rounded-full border ${bandColor.border} ${bandColor.bg} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${bandColor.text}`}
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
        >
          <motion.span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: metrics.band === 'ALL CLEAR' ? HEX.accent : HEX.danger }}
            animate={{ scale: [1, 1.35, 1] }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
          />
          {metrics.band}
        </motion.span>
      </div>
    </motion.header>
  );
}

function ReadingPill({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-1 text-[11px]">
      <span className="text-accent">{icon}</span>
      <span className="font-mono uppercase tracking-[0.2em] text-text-faint">{label}</span>
      <span className="font-mono tabular-nums text-text">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// HarborView — the central SVG canvas: sea, grid, compass, lighthouse, piers, ships
// ---------------------------------------------------------------------------

function HarborView({
  placed,
  activeId,
  hoverId,
  onSelect,
  onHover,
  agencyName,
  metrics,
}: {
  placed: PlacedShip[];
  activeId: string | null;
  hoverId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  agencyName: string;
  metrics: HarborMetrics;
}) {
  // group ships by pier for legend cards
  const perPierCounts = useMemo(() => {
    const byPier: Record<PierDef['id'], number> = { 'pier-a': 0, 'pier-b': 0, 'pier-c': 0 };
    for (const p of placed) byPier[p.pier.id] += 1;
    return byPier;
  }, [placed]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/65 backdrop-blur-xl">
      <ChartAnnotationStrip />
      {/* Inline legend ribbon — sits between the chart annotation strip and the
         SVG canvas so it can't overlap the bottom row of ships (Pier C) like
         the previous absolutely-positioned overlay did. */}
      <HarborLegendRibbon perPierCounts={perPierCounts} />

      <div className="relative h-[640px] w-full">
        {/* Soft orange harbor-light gradient (subtle, doesn't tilt to blue) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 50% 20%, rgba(242,101,34,0.10) 0%, rgba(242,101,34,0) 70%)',
          }}
        />

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${agencyName} harbor chart with ${metrics.totalShips} ships moored across three piers`}
        >
          <defs><SVGGradients /></defs>
          <BathymetricGrid />
          <CompassRose cx={VB_W - 110} cy={140} r={64} />
          <HarbormasterWall />
          <Lighthouse cx={LIGHTHOUSE_X} cy={LIGHTHOUSE_Y} agencyName={agencyName} />
          {PIERS.map((pier) => (
            <Pier key={pier.id} pier={pier} shipCount={perPierCounts[pier.id]} />
          ))}
          {placed.map((p, i) => (
            <Ship
              key={p.sub.id}
              placed={p}
              index={i}
              active={activeId === p.sub.id}
              hovered={hoverId === p.sub.id}
              faded={
                (activeId !== null || hoverId !== null)
                && activeId !== p.sub.id
                && hoverId !== p.sub.id
              }
              onSelect={() => onSelect(p.sub.id === activeId ? null : p.sub.id)}
              onHover={onHover}
            />
          ))}
        </svg>

        <ShipHoverTooltip placed={placed} hoverId={hoverId} activeId={activeId} />
        <ScaleBar />
      </div>

      {placed.length === 0 && (
        <div className="absolute inset-x-6 bottom-[80px] top-[80px] grid place-items-center">
          <div className="max-w-sm rounded-2xl border border-border-muted bg-surface-2/70 px-6 py-8 text-center backdrop-blur-xl">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Anchor className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text">No ships in port</p>
            <p className="mt-1 text-xs text-text-dim">
              Invite your first sub-client to moor them at Pier A.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Thin chart-style annotation bar that runs above the SVG canvas. */
function ChartAnnotationStrip() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-muted/70 bg-surface-2/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
      <span className="flex items-center gap-2">
        <Compass className="h-3 w-3 text-accent" />
        Harbor chart · scale 1 : 4000
      </span>
      <span className="hidden items-center gap-2 sm:flex">
        <Layers className="h-3 w-3" />
        Bathymetry 0.5m intervals
      </span>
      <span className="flex items-center gap-2">
        <Radio className="h-3 w-3 text-accent" />
        VHF ch 16 live
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG gradient definitions — kept in one block for legibility
// ---------------------------------------------------------------------------

function SVGGradients() {
  return (
    <>
      <radialGradient id="w2-lighthouse-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.85} />
        <stop offset="60%" stopColor={HEX.accent2} stopOpacity={0.22} />
        <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
      </radialGradient>
      <radialGradient id="w2-lighthouse-base" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#22223a" stopOpacity={1} />
        <stop offset="100%" stopColor={HEX.surface2} stopOpacity={1} />
      </radialGradient>
      <linearGradient id="w2-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.55} />
        <stop offset="55%" stopColor={HEX.accent2} stopOpacity={0.18} />
        <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
      </linearGradient>
      <linearGradient id="w2-pier" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#26262e" stopOpacity={1} />
        <stop offset="100%" stopColor="#1a1a22" stopOpacity={1} />
      </linearGradient>
      <linearGradient id="w2-pier-stripe" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.45} />
        <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0.05} />
      </linearGradient>
      <linearGradient id="w2-hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.95} />
        <stop offset="100%" stopColor={HEX.accent} stopOpacity={1} />
      </linearGradient>
      <linearGradient id="w2-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1f1f28" stopOpacity={1} />
        <stop offset="100%" stopColor="#14141c" stopOpacity={1} />
      </linearGradient>
    </>
  );
}

// ---------------------------------------------------------------------------
// BathymetricGrid — sea base + faint contour lines underneath everything
// ---------------------------------------------------------------------------

function BathymetricGrid() {
  // Concentric ellipses = depth contours; nested patterns = chart-paper grid.
  const contours = useMemo(
    () =>
      [0.32, 0.45, 0.6, 0.78, 0.95].map((scale) => ({
        rx: VB_W * 0.45 * scale,
        ry: VB_H * 0.4 * scale,
      })),
    [],
  );
  const tickFont = {
    fontSize: 9,
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: 0.6,
  } as const;

  return (
    <g aria-hidden>
      {/* sea base wash + darker uneven patches for the sea bed */}
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={HEX.surfaceDeep} />
      <rect x={0} y={0} width={VB_W} height={VB_H} fill={HEX.surface} fillOpacity={0.5} />
      <ellipse cx={VB_W * 0.28} cy={VB_H * 0.7} rx={220} ry={120} fill={HEX.surfaceDeep} fillOpacity={0.55} />
      <ellipse cx={VB_W * 0.72} cy={VB_H * 0.55} rx={260} ry={140} fill={HEX.surfaceDeep} fillOpacity={0.4} />

      {/* contour ellipses */}
      {contours.map((c, i) => (
        <ellipse
          key={`c-${i}`}
          cx={VB_W / 2} cy={VB_H * 0.62} rx={c.rx} ry={c.ry}
          fill="none" stroke={HEX.textDim} strokeOpacity={0.08}
          strokeWidth={1} strokeDasharray="3 8"
        />
      ))}

      {/* fine + major chart grids */}
      <pattern id="w2-grid-fine" x={0} y={0} width={40} height={40} patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke={HEX.border} strokeOpacity={0.35} strokeWidth={1} />
      </pattern>
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#w2-grid-fine)" />
      <pattern id="w2-grid-major" x={0} y={0} width={200} height={200} patternUnits="userSpaceOnUse">
        <path d="M 200 0 L 0 0 0 200" fill="none" stroke={HEX.border} strokeOpacity={0.55} strokeWidth={1} />
      </pattern>
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#w2-grid-major)" />

      {/* chart border (double) */}
      <rect
        x={6} y={6} width={VB_W - 12} height={VB_H - 12}
        fill="none" stroke={HEX.border} strokeOpacity={0.6} strokeWidth={1.5}
      />
      <rect
        x={14} y={14} width={VB_W - 28} height={VB_H - 28}
        fill="none" stroke={HEX.border} strokeOpacity={0.35}
        strokeWidth={1} strokeDasharray="6 10"
      />

      {/* lat / long ticks */}
      {Array.from({ length: 11 }).map((_, i) => {
        const x = 80 + (i * (VB_W - 160)) / 10;
        return (
          <g key={`tx-${i}`}>
            <line x1={x} y1={6} x2={x} y2={20} stroke={HEX.textFaint} strokeOpacity={0.5} strokeWidth={1} />
            <text x={x} y={36} textAnchor="middle" fill={HEX.textFaint} style={tickFont}>
              {(40 + i * 2).toString().padStart(2, '0')}°
            </text>
          </g>
        );
      })}
      {Array.from({ length: 7 }).map((_, i) => {
        const y = 60 + (i * (VB_H - 120)) / 6;
        return (
          <g key={`ty-${i}`}>
            <line x1={6} y1={y} x2={20} y2={y} stroke={HEX.textFaint} strokeOpacity={0.5} strokeWidth={1} />
            <text x={32} y={y + 3} fill={HEX.textFaint} style={tickFont}>
              {String.fromCharCode(65 + i)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// CompassRose — top-right ornament; a proper nautical-chart compass
// ---------------------------------------------------------------------------

function CompassRose({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (
    <g aria-hidden>
      {/* 3 nested rings */}
      <circle
        cx={cx} cy={cy} r={r} fill={HEX.surface} fillOpacity={0.55}
        stroke={HEX.accent} strokeOpacity={0.35} strokeWidth={1.2}
      />
      <circle cx={cx} cy={cy} r={r - 8} fill="none" stroke={HEX.border} strokeOpacity={0.7} strokeWidth={1} />
      <circle
        cx={cx} cy={cy} r={r - 22} fill="none" stroke={HEX.border}
        strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 4"
      />

      {/* spokes */}
      {Array.from({ length: 16 }).map((_, i) => {
        const ar = ((i * 360) / 16 - 90) * (Math.PI / 180);
        const c = Math.cos(ar);
        const s = Math.sin(ar);
        return (
          <line
            key={`s-${i}`}
            x1={cx + (r - 22) * c} y1={cy + (r - 22) * s}
            x2={cx + (r - 8) * c} y2={cy + (r - 8) * s}
            stroke={HEX.textFaint} strokeOpacity={0.6}
            strokeWidth={i % 2 === 0 ? 1.4 : 0.8}
          />
        );
      })}

      {/* cardinal labels */}
      {points.map((p, i) => {
        const ar = ((i * 360) / 8 - 90) * (Math.PI / 180);
        const isN = p === 'N';
        return (
          <text
            key={p}
            x={cx + (r + 14) * Math.cos(ar)}
            y={cy + (r + 14) * Math.sin(ar) + 3}
            textAnchor="middle"
            fill={isN ? HEX.accent : HEX.textDim}
            style={{
              fontSize: isN ? 11 : 9,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: isN ? 700 : 500,
              letterSpacing: 0.6,
            }}
          >
            {p}
          </text>
        );
      })}

      {/* needle — gentle nudge so it feels alive */}
      <motion.g
        animate={{ rotate: [-2, 3, -2] }}
        transition={{ duration: 5.5, ease: 'easeInOut', repeat: Infinity }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <polygon
          points={`${cx},${cy - (r - 26)} ${cx - 6},${cy} ${cx},${cy + (r - 26)} ${cx + 6},${cy}`}
          fill={HEX.surface2} stroke={HEX.accent} strokeWidth={1.2}
        />
        <polygon
          points={`${cx},${cy - (r - 26)} ${cx - 6},${cy} ${cx + 6},${cy}`}
          fill={HEX.accent} fillOpacity={0.85}
        />
        <circle cx={cx} cy={cy} r={3.5} fill={HEX.surface} stroke={HEX.accent} strokeWidth={1.2} />
      </motion.g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// HarbormasterWall — the seawall along the bottom + a thin one on top
// ---------------------------------------------------------------------------

function HarbormasterWall() {
  const wallY = VB_H - 50;
  return (
    <g aria-hidden>
      <rect
        x={70} y={wallY} width={VB_W - 140} height={40} rx={4}
        fill="url(#w2-wall)" stroke={HEX.border} strokeWidth={1.2}
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const x = 80 + (i * (VB_W - 160)) / 12;
        return (
          <line
            key={`m-${i}`}
            x1={x} y1={wallY + 4} x2={x} y2={wallY + 36}
            stroke={HEX.surfaceDeep} strokeOpacity={0.6} strokeWidth={1}
          />
        );
      })}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = 100 + (i * (VB_W - 200)) / 13;
        return (
          <circle
            key={`b-${i}`}
            cx={x} cy={wallY - 4} r={3}
            fill={HEX.surface2} stroke={HEX.accent}
            strokeOpacity={0.55} strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Lighthouse — agency tower with slowly rotating beam
// ---------------------------------------------------------------------------

function Lighthouse({
  cx, cy, agencyName,
}: {
  cx: number;
  cy: number;
  agencyName: string;
}) {
  const flagBase = `${cx},${cy - 84} ${cx + 14},${cy - 80} ${cx},${cy - 76}`;
  const flagWave = `${cx},${cy - 84} ${cx + 16},${cy - 78} ${cx},${cy - 76}`;
  return (
    <g aria-label={`Harbormaster lighthouse · ${agencyName}`}>
      {/* expansive glow halo */}
      <circle cx={cx} cy={cy} r={150} fill="url(#w2-lighthouse-glow)" />

      {/* rotating beam */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      >
        <polygon
          points={`${cx},${cy} ${cx - 26},${cy + 540} ${cx + 26},${cy + 540}`}
          fill="url(#w2-beam)" opacity={0.55}
        />
        <polygon
          points={`${cx},${cy} ${cx - 8},${cy + 540} ${cx + 8},${cy + 540}`}
          fill={HEX.accent} opacity={0.32}
        />
      </motion.g>

      {/* rocky-islet base */}
      <ellipse cx={cx} cy={cy + 56} rx={64} ry={14} fill="#1a1a22" stroke={HEX.border} strokeWidth={1.2} />
      <ellipse cx={cx} cy={cy + 56} rx={50} ry={9} fill="#22222c" />

      {/* tower body + stripes */}
      <rect
        x={cx - 22} y={cy - 30} width={44} height={80} rx={4}
        fill={HEX.surface} stroke={HEX.accent} strokeOpacity={0.7} strokeWidth={1.4}
      />
      <rect x={cx - 22} y={cy - 30} width={44} height={14} fill={HEX.accent} fillOpacity={0.9} />
      <rect x={cx - 22} y={cy - 2} width={44} height={14} fill={HEX.accent} fillOpacity={0.55} />
      <rect x={cx - 22} y={cy + 26} width={44} height={14} fill={HEX.accent} fillOpacity={0.3} />

      {/* lamp room + pulse + roof */}
      <rect
        x={cx - 16} y={cy - 50} width={32} height={20} rx={3}
        fill={HEX.surface2} stroke={HEX.accent} strokeWidth={1.4}
      />
      <motion.circle
        cx={cx} cy={cy - 40} r={7} fill={HEX.accent}
        animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.18, 1] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        style={{ transformOrigin: `${cx}px ${cy - 40}px` }}
      />
      <polygon
        points={`${cx - 16},${cy - 50} ${cx + 16},${cy - 50} ${cx},${cy - 66}`}
        fill={HEX.accent} stroke={HEX.accentDeep} strokeWidth={1.2}
      />

      {/* flagstaff */}
      <line x1={cx} y1={cy - 66} x2={cx} y2={cy - 84} stroke={HEX.textDim} strokeWidth={1.2} />
      <motion.polygon
        points={flagBase}
        fill={HEX.accent}
        animate={{ points: [flagBase, flagWave, flagBase] }}
        transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
      />

      {/* nameplate */}
      <text
        x={cx} y={cy + 80} textAnchor="middle" fill={HEX.textDim}
        style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 2.4 }}
      >
        HARBORMASTER
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pier — horizontal dock structure with end-cap, planks, label, tier stripe
// ---------------------------------------------------------------------------

function Pier({ pier, shipCount }: { pier: PierDef; shipCount: number }) {
  const y = pier.y;
  const t = 22; // pier thickness
  return (
    <g aria-label={`${pier.label}, ${shipCount} ship${shipCount === 1 ? '' : 's'}`}>
      {/* connecting walkway from harbormaster wall to pier base */}
      <rect
        x={PIER_LEFT_X - 22} y={y - 4} width={22} height={t - 4}
        fill="url(#w2-pier)" stroke={HEX.border} strokeWidth={1}
      />

      {/* main pier body */}
      <rect
        x={PIER_LEFT_X} y={y - t / 2} width={PIER_LENGTH} height={t} rx={4}
        fill="url(#w2-pier)" stroke={HEX.border} strokeWidth={1.2}
      />

      {/* accent stripe */}
      <rect
        x={PIER_LEFT_X + 4} y={y - t / 2 + 2} width={PIER_LENGTH - 8} height={3} rx={1.5}
        fill="url(#w2-pier-stripe)" opacity={0.6}
      />

      {/* plank divisions */}
      {Array.from({ length: 26 }).map((_, i) => {
        const x = PIER_LEFT_X + 10 + (i * (PIER_LENGTH - 20)) / 25;
        return (
          <line
            key={`p-${pier.id}-${i}`}
            x1={x} y1={y - t / 2 + 6} x2={x} y2={y + t / 2 - 2}
            stroke={HEX.surfaceDeep} strokeOpacity={0.5} strokeWidth={0.9}
          />
        );
      })}

      {/* T-head end cap */}
      <rect
        x={PIER_RIGHT_X - 14} y={y - t / 2 - 8} width={28} height={t + 16} rx={4}
        fill="url(#w2-pier)" stroke={HEX.border} strokeWidth={1.2}
      />

      {/* bollards */}
      {Array.from({ length: 9 }).map((_, i) => {
        const x = PIER_LEFT_X + 20 + (i * (PIER_LENGTH - 40)) / 8;
        return (
          <circle
            key={`b-${pier.id}-${i}`}
            cx={x} cy={y - t / 2 - 3} r={2.2}
            fill={HEX.surfaceDeep} stroke={HEX.accent}
            strokeOpacity={0.45} strokeWidth={0.8}
          />
        );
      })}

      {/* label tag — widened from 130→180 so labels like "Pier A · Flagship"
         fit without truncating to "Pier A · F…". Text-anchor stays middle and
         we recalc its center accordingly. */}
      <g>
        <rect
          x={PIER_LEFT_X - 8} y={y + t / 2 + 6} width={180} height={18} rx={9}
          fill={HEX.surface} stroke={HEX.accent} strokeOpacity={0.35} strokeWidth={1}
        />
        <text
          x={PIER_LEFT_X + 82} y={y + t / 2 + 19} textAnchor="middle" fill={HEX.accent}
          style={{
            fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600, letterSpacing: 0.8,
          }}
        >
          {pier.label}
        </text>
      </g>

      {/* end-cap slip count badge */}
      <g>
        <rect
          x={PIER_RIGHT_X - 36} y={y - 10} width={50} height={20} rx={10}
          fill={HEX.surface} stroke={HEX.accent} strokeOpacity={0.55} strokeWidth={1}
        />
        <text
          x={PIER_RIGHT_X - 11} y={y + 4} textAnchor="middle" fill={HEX.accent}
          style={{
            fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700, letterSpacing: 0.6,
          }}
        >
          {shipCount} BTH
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ship — the ship glyph mooring at a slip. Hull / pennants / wake / flag.
// ---------------------------------------------------------------------------

function Ship({
  placed, index, active, hovered, faded, onSelect, onHover,
}: {
  placed: PlacedShip;
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const { sub, x, y, hull } = placed;
  const dims = HULL_DIMS[hull];
  const flag = STATUS_HEX[sub.status];
  const lifted = active || hovered;

  // Pennants — 1-3 colored streamers indicating recent activity (sends /
  // opens / replies). Count derived from mailbox volume so the visual gets
  // richer as a ship gets busier.
  const pennantCount = Math.min(3, Math.max(1, Math.round(sub.mailboxCount / 8)));
  const pennantColors = [HEX.accent, HEX.accent2, HEX.accent3];

  // Bob phase varies so the harbor doesn't pulse in unison.
  const bobDelay = (index % 5) * 0.18;
  const isAtRisk = sub.status === 'at_risk';
  const isWarming = sub.status === 'warming';

  // Masthead Y is reused by mast, pennants, and the status flag.
  const mastTopY = y - dims.h * 0.65 - 36;
  const flagPts = (off: number) =>
    `${x},${mastTopY} ${x + 16 + off},${mastTopY + 4 - (off ? 2 : 0)} ${x},${mastTopY + 8}`;

  return (
    <motion.g
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: faded ? 0.35 : 1, y: 0 }}
      transition={{
        opacity: { duration: 0.35 },
        y: { duration: 0.5, delay: 0.25 + index * 0.06, ease: [0.22, 1, 0.36, 1] },
      }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name} ${placed.slipLabel}, ${sub.mailboxCount} mailboxes, ${STATUS_LABEL[sub.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
    >
      <ShipWake x={x} y={y + dims.h / 2 + 8} index={index} active={!faded} />

      <motion.g
        animate={{ y: [0, -2, 0, 2, 0] }}
        transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity, delay: bobDelay }}
      >
        {lifted && (
          <ellipse
            cx={x} cy={y} rx={dims.w / 2 + 14} ry={dims.h / 2 + 12}
            fill="none" stroke={HEX.accent} strokeOpacity={0.55}
            strokeWidth={1.5} strokeDasharray="3 4"
          />
        )}

        <motion.g animate={{ y: lifted ? -4 : 0 }} transition={{ duration: 0.22 }}>
          {/* mooring lines to the pier */}
          <line
            x1={x - dims.w * 0.3} y1={y + dims.h / 2}
            x2={x - dims.w * 0.4} y2={y + dims.h / 2 + 18}
            stroke={HEX.textDim} strokeOpacity={0.55} strokeWidth={1}
          />
          <line
            x1={x + dims.w * 0.3} y1={y + dims.h / 2}
            x2={x + dims.w * 0.4} y2={y + dims.h / 2 + 18}
            stroke={HEX.textDim} strokeOpacity={0.55} strokeWidth={1}
          />

          <ShipHull x={x} y={y} w={dims.w} h={dims.h} hullSize={hull} lifted={lifted} />

          {/* deck cabin */}
          <rect
            x={x - dims.w * 0.25} y={y - dims.h * 0.65}
            width={dims.w * 0.5} height={dims.h * 0.55} rx={2}
            fill={HEX.surface2} stroke={HEX.accent}
            strokeOpacity={lifted ? 0.85 : 0.55} strokeWidth={1}
          />

          {/* portholes */}
          {(() => {
            const portCount = hull === 'sloop' ? 2 : hull === 'cutter' ? 3 : 4;
            const portStep = (dims.w * 0.4) / (portCount - 1 || 1);
            return Array.from({ length: portCount }).map((_, i) => (
              <circle
                key={`port-${i}`}
                cx={x - dims.w * 0.2 + i * portStep}
                cy={y - dims.h * 0.4} r={1.6}
                fill={HEX.accent2} fillOpacity={0.85}
              />
            ));
          })()}

          {/* mast */}
          <line
            x1={x} y1={y - dims.h * 0.65} x2={x} y2={mastTopY}
            stroke={HEX.textDim} strokeWidth={1.2}
          />

          {/* pennants */}
          {Array.from({ length: pennantCount }).map((_, i) => {
            const py = mastTopY + 4 + i * 6;
            const color = pennantColors[i % pennantColors.length] ?? HEX.accent;
            return (
              <motion.polygon
                key={`pen-${i}`}
                points={`${x},${py} ${x + 14},${py + 2} ${x},${py + 4}`}
                fill={color}
                animate={{
                  points: [
                    `${x},${py} ${x + 14},${py + 2} ${x},${py + 4}`,
                    `${x},${py} ${x + 16},${py + 1} ${x},${py + 4}`,
                    `${x},${py} ${x + 14},${py + 2} ${x},${py + 4}`,
                  ],
                }}
                transition={{
                  duration: 1.5 + i * 0.12, ease: 'easeInOut',
                  repeat: Infinity, delay: i * 0.08,
                }}
              />
            );
          })}

          {/* status flag at masthead */}
          <motion.polygon
            points={flagPts(0)}
            fill={flag}
            animate={{ points: [flagPts(0), flagPts(2), flagPts(0)] }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
          />

          {/* slip-number plate on the hull */}
          <rect
            x={x - 15} y={y - 5} width={30} height={11} rx={2}
            fill={HEX.surface} stroke={HEX.accent}
            strokeOpacity={0.55} strokeWidth={0.8}
          />
          <text
            x={x} y={y + 3.5} textAnchor="middle" fill={HEX.accent}
            style={{
              fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700, letterSpacing: 0.4,
            }}
          >
            {placed.slipLabel}
          </text>

          {/* ship name */}
          <text
            x={x} y={y + dims.h / 2 + 32} textAnchor="middle"
            fill={lifted ? '#e8e8f0' : HEX.textDim}
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {sub.name}
          </text>

          {/* mailbox count badge */}
          <g>
            <rect
              x={x - 20} y={y + dims.h / 2 + 38} width={40} height={13} rx={6.5}
              fill={HEX.surface} stroke={flag}
              strokeOpacity={lifted ? 0.65 : 0.4} strokeWidth={0.8}
            />
            <text
              x={x} y={y + dims.h / 2 + 48} textAnchor="middle" fill={flag}
              style={{
                fontSize: 9, fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700, letterSpacing: 0.4,
              }}
            >
              {sub.mailboxCount}mb
            </text>
          </g>
        </motion.g>

        {/* status pulses */}
        {isAtRisk && (
          <motion.ellipse
            cx={x} cy={y} rx={dims.w / 2 + 6} ry={dims.h / 2 + 6}
            fill="none" stroke={HEX.danger} strokeWidth={1.6}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 2.0, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
        {isWarming && !isAtRisk && (
          <motion.ellipse
            cx={x} cy={y} rx={dims.w / 2 + 4} ry={dims.h / 2 + 4}
            fill="none" stroke={HEX.warning} strokeWidth={1.2}
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{ duration: 2.6, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        )}
      </motion.g>
    </motion.g>
  );
}

// ---------------------------------------------------------------------------
// ShipHull — the chunky boat-shape (bow + stern + flat deck)
// ---------------------------------------------------------------------------

function ShipHull({
  x, y, w, h, hullSize, lifted,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  hullSize: HullSize;
  lifted: boolean;
}) {
  // ship silhouette: flat deck on top, curved bow/stern on the bottom.
  const left = x - w / 2;
  const right = x + w / 2;
  const top = y - h / 2;
  const bottom = y + h / 2;
  const taper = w * 0.18;
  const accentStroke =
    hullSize === 'frigate' ? HEX.accentDeep
    : hullSize === 'cutter' ? HEX.accent
    : HEX.accent2;

  return (
    <g>
      <path
        d={`M ${left + taper} ${top}
            L ${right - taper} ${top}
            Q ${right + 4} ${top + h * 0.35}, ${right - taper * 0.6} ${bottom}
            L ${left + taper * 0.6} ${bottom}
            Q ${left - 4} ${top + h * 0.35}, ${left + taper} ${top}
            Z`}
        fill="url(#w2-hull)"
        stroke={lifted ? HEX.accent : accentStroke}
        strokeOpacity={0.9}
        strokeWidth={lifted ? 1.6 : 1.2}
      />
      <line
        x1={left + taper * 0.4} y1={y + h * 0.18}
        x2={right - taper * 0.4} y2={y + h * 0.18}
        stroke={HEX.surfaceDeep} strokeOpacity={0.6} strokeWidth={1.2}
      />
      <line
        x1={left + taper} y1={top + 2}
        x2={right - taper} y2={top + 2}
        stroke={HEX.surfaceDeep} strokeOpacity={0.5} strokeWidth={0.8}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// ShipWake — animated ripples beneath the hull (only when not faded)
// ---------------------------------------------------------------------------

function ShipWake({
  x, y, index, active,
}: {
  x: number;
  y: number;
  index: number;
  active: boolean;
}) {
  if (!active) return null;
  return (
    <g aria-hidden>
      {[0, 1].map((i) => (
        <motion.ellipse
          key={`wake-${i}`}
          cx={x} cy={y} rx={26} ry={5}
          fill="none" stroke={HEX.accent2} strokeOpacity={0.5} strokeWidth={1}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: [0.7, 1.8, 2.6], opacity: [0, 0.55, 0] }}
          transition={{
            duration: 3.4, ease: 'easeOut', repeat: Infinity,
            delay: i * 1.6 + (index % 4) * 0.4,
          }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// ShipHoverTooltip — HTML overlay shown when a ship is hovered/focused
// ---------------------------------------------------------------------------

function ShipHoverTooltip({
  placed,
  hoverId,
  activeId,
}: {
  placed: PlacedShip[];
  hoverId: string | null;
  activeId: string | null;
}) {
  // Show tooltip whenever hover is set AND the hovered ship isn't already the
  // active (open) one (because the detail panel is already showing the data).
  const target =
    hoverId && hoverId !== activeId
      ? placed.find((p) => p.sub.id === hoverId) ?? null
      : null;
  if (!target) return null;

  // Convert viewBox coords to viewport-relative % so the tooltip floats
  // correctly regardless of SVG scaling. Clamp top so it stays in-canvas.
  const leftPct = (target.x / VB_W) * 100;
  const topPct = Math.max(((target.y - 90) / VB_H) * 100, 4);

  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="rounded-xl border border-border-muted bg-surface/95 px-3 py-2 shadow-glass backdrop-blur-xl"
      >
        <div className="flex items-center gap-2">
          <ShipIcon className="h-3.5 w-3.5 text-accent" />
          <p className="text-xs font-semibold text-text">{target.sub.name}</p>
          <span
            className="ml-1 inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: STATUS_HEX[target.sub.status] }}
            aria-hidden
          />
        </div>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
          Slip {target.slipLabel} · {target.sub.mailboxCount} mailboxes
        </p>
        <p className="mt-0.5 text-[10px] text-text-dim">Click to open the captain's log</p>
      </motion.div>
      <span
        aria-hidden
        className="absolute left-1/2 top-full -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent"
        style={{ borderTopColor: HEX.border }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HarborLegendRibbon — inline horizontal legend that runs BETWEEN the chart
// annotation strip and the SVG canvas. Replaces the older bottom-left
// overlay which collided with the Pier C ship row at the bottom of the
// canvas. Single row, wraps to two on narrower viewports so the swatches +
// pier counts stay readable without ever clipping a ship.
// ---------------------------------------------------------------------------

function HarborLegendRibbon({
  perPierCounts,
}: {
  perPierCounts: Record<PierDef['id'], number>;
}) {
  const swatch = (color: string, label: string) => (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="h-2 w-2 shrink-0 rounded-sm"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-text">{label}</span>
    </span>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.55 }}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-muted/70 bg-surface-2/30 px-4 py-2 text-[11px]"
    >
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-dim">
        <Flag className="h-3 w-3 text-accent" />
        Flag colors
      </span>
      <span className="hidden h-3 w-px bg-border-muted sm:block" aria-hidden />
      {swatch(HEX.success, 'Green · clear')}
      {swatch(HEX.warning, 'Yellow · warming')}
      {swatch(HEX.danger, 'Red · distress')}
      {swatch(HEX.textFaint, 'White · moored')}
      <span className="hidden h-3 w-px bg-border-muted sm:block" aria-hidden />
      <span className="flex items-center gap-1.5 whitespace-nowrap text-text-dim">
        <ShipIcon className="h-3 w-3 text-accent" />
        Hull = mailbox count
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-dim">
        <span>A · {perPierCounts['pier-a']}</span>
        <span className="text-text-faint">·</span>
        <span>B · {perPierCounts['pier-b']}</span>
        <span className="text-text-faint">·</span>
        <span>C · {perPierCounts['pier-c']}</span>
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ScaleBar — chart-style scale annotation bottom-right
// ---------------------------------------------------------------------------

function ScaleBar() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 1.05 }}
      className="pointer-events-none absolute bottom-3 right-3 rounded-xl border border-border-muted bg-surface/85 px-3 py-2 backdrop-blur-xl"
    >
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-text-faint">
        Scale (m)
      </p>
      <div className="flex h-2 w-32 items-center overflow-hidden rounded-sm border border-border-muted">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-full flex-1"
            style={{ background: i % 2 === 0 ? HEX.accent : HEX.surface }}
          />
        ))}
      </div>
      <div className="mt-1 flex w-32 justify-between font-mono text-[8px] text-text-faint">
        <span>0</span><span>50</span><span>100</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ShipDetailPanel — right-rail "captain's log" for the selected ship
// ---------------------------------------------------------------------------

function ShipDetailPanel({
  placed,
  agency,
  onClose,
}: {
  placed: PlacedShip;
  agency: AgencyWorkspaceData['agency'];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { sub, slipLabel, hull } = placed;
  const flag = STATUS_HEX[sub.status];
  const hullLabelMap: Record<HullSize, string> = {
    sloop: 'Sloop · small craft',
    cutter: 'Cutter · medium',
    frigate: 'Frigate · capital ship',
  };

  // Voyage history — synthesised from lastActiveAgo
  const voyageEvents = useMemo(
    () => buildVoyageEvents(sub, slipLabel),
    [sub, slipLabel],
  );

  // Pennant key derived from mailbox count, mirroring the canvas
  const pennantCount = Math.min(3, Math.max(1, Math.round(sub.mailboxCount / 8)));
  const pennantKey: Array<{ color: string; label: string }> = [
    { color: HEX.accent, label: 'Outbound sends' },
    { color: HEX.accent2, label: 'Opens' },
    { color: HEX.accent3, label: 'Replies received' },
  ].slice(0, pennantCount);

  return (
    <div className="relative h-[680px] overflow-hidden rounded-2xl border border-border-muted bg-surface/65 backdrop-blur-xl">
      {/* Captain's-log header */}
      <header className="border-b border-border-muted px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl font-mono text-base font-bold text-bg"
              style={{ background: flag }} aria-hidden
            >
              {sub.logoChar}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text">{sub.name}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-text-faint">
                Slip {slipLabel} · {hullLabelMap[hull]}
              </p>
            </div>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close detail"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border-muted text-text-dim transition-colors hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
          Captain's log · port of {agency.region}
        </p>
      </header>

      <div className="h-[calc(100%-92px)] space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        {/* Flag + plan strip */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
            style={{ borderColor: `${flag}55`, background: `${flag}1f`, color: flag }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: flag }} aria-hidden />
            {STATUS_FLAG_NAME[sub.status]} · {STATUS_LABEL[sub.status]}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-accent2/30 bg-accent2/10 px-2.5 py-0.5 text-[11px] font-medium text-accent2">
            <Sparkles className="h-3 w-3" />
            {sub.plan}
          </span>
          <span className="ml-auto font-mono text-[10px] text-text-faint">{sub.createdAgo}</span>
        </div>

        {/* Captain card */}
        <div className="rounded-xl border border-border-muted bg-surface-2/50 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">Captain</p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/15 text-accent"
              aria-hidden
            >
              <Crown className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                {extractCaptainName(sub.ownerEmail)}
              </p>
              <p className="truncate font-mono text-[10px] text-text-dim">{sub.ownerEmail}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = `mailto:${sub.ownerEmail}`;
              }}
              className="grid h-7 w-7 place-items-center rounded-md border border-border-muted text-text-dim transition-colors hover:text-text"
              aria-label="Hail captain"
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Cargo manifest */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
            Cargo manifest
          </p>
          <div className="grid grid-cols-3 gap-2">
            <ManifestCell icon={Inbox} label="Mailboxes" value={String(sub.mailboxCount)} />
            <ManifestCell icon={Users} label="Crew" value={String(sub.teamCount)} />
            <ManifestCell
              icon={Activity} label="Warmth" value={String(sub.avgWarmth)}
              tone={
                sub.status === 'at_risk' ? 'danger'
                : sub.status === 'warming' ? 'warning'
                : 'success'
              }
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ManifestCell
              icon={Sailboat} label="Daily sends"
              value={String(estimateDailySends(sub))} hint="rolling 24h"
            />
            <ManifestCell
              icon={Anchor} label="Last port-of-call"
              value={sub.lastActiveAgo.replace(/^signal\s+/, '')} hint="latest signal"
            />
          </div>
        </div>

        {/* Voyage history mini-timeline */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
              Voyage history
            </p>
            <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface/70 px-1.5 py-0.5 font-mono text-[9px] text-text-dim">
              <Activity className="h-2.5 w-2.5 text-accent" />
              last 24h
            </span>
          </div>
          <ol className="mt-2 space-y-2">
            {voyageEvents.map((ev) => (
              <li key={ev.id} className="flex items-start gap-2.5">
                <span
                  className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                  style={{ background: `${ev.color}1f`, color: ev.color }}
                >
                  <ev.icon className="h-2.5 w-2.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text">{ev.label}</p>
                  <p className="font-mono text-[9px] text-text-faint">{ev.when}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Pennant key */}
        <div className="rounded-xl border border-border-muted bg-surface-2/40 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
            Pennant key
          </p>
          <ul className="mt-2 space-y-1.5">
            {pennantKey.map((p) => (
              <li key={p.label} className="flex items-center gap-2.5 text-[11px] text-text">
                <span
                  className="h-2 w-3.5"
                  style={{ background: p.color, clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}
                  aria-hidden
                />
                {p.label}
              </li>
            ))}
            {pennantKey.length < 3 && (
              <li className="text-[10px] text-text-faint">
                Ships with higher mailbox counts fly more pennants.
              </li>
            )}
          </ul>
        </div>

        {/* MRR strip + actions */}
        <div className="rounded-xl border border-accent/25 bg-accent/8 px-3.5 py-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent/80">
                Monthly retainer
              </p>
              <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-accent">
                {formatMoney(sub.monthlyMrrUsd)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/app/billing')}
              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/20"
            >
              Invoice
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Action row */}
        <div className="grid grid-cols-2 gap-2">
          <ActionLink
            icon={Mail} label="Open mailboxes" primary
            onClick={() => navigate('/app/mailboxes')}
          />
          <ActionLink
            icon={Users} label="View crew"
            onClick={() => navigate('/app/workspace')}
          />
        </div>

        {/* At-risk callout */}
        {sub.status === 'at_risk' && (
          <div className="rounded-xl border border-[var(--wp-danger,#ff5c7a)]/30 bg-[var(--wp-danger,#ff5c7a)]/10 p-3">
            <div className="flex items-start gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--wp-danger,#ff5c7a)]/15 text-[var(--wp-danger,#ff5c7a)]">
                <ShieldAlert className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--wp-danger,#ff5c7a)]">
                  Vessel in distress
                </p>
                <p className="mt-0.5 text-xs text-text-dim">
                  Warmth has dipped beneath the safe waterline. Dispatch the
                  rescue boat and pause new sends until the harbormaster
                  inspects the rigging.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ManifestCell({
  icon: Icon, label, value, hint, tone = 'default',
}: {
  icon: typeof Inbox;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneColor =
    tone === 'success' ? TOK.success
    : tone === 'warning' ? TOK.warning
    : tone === 'danger' ? TOK.danger
    : TOK.text;
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-dim">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums" style={{ color: toneColor }}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[9px] text-text-faint">{hint}</p>}
    </div>
  );
}

function ActionLink({
  icon: Icon,
  label,
  primary,
  onClick,
}: {
  icon: typeof Mail;
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        primary
          ? 'border-accent/35 bg-accent/15 text-accent hover:bg-accent/25'
          : 'border-border-muted bg-surface-2/60 text-text hover:bg-surface-2'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// HarborFooter — tide chart + weather + alerts + vessel registry mini-cards
// ---------------------------------------------------------------------------

function HarborFooter({
  metrics, tideSeries, bulletins, team, apiKeyCount, webhookCount, features,
}: {
  metrics: HarborMetrics;
  tideSeries: number[];
  bulletins: Bulletin[];
  team: AgencyWorkspaceData['team'];
  apiKeyCount: number;
  webhookCount: number;
  features: AgencyWorkspaceData['features'];
}) {
  // Row 1: 4-card weather strip. Wrap to 2×2 below `lg` so each card has
  // enough horizontal room for full content ("MARINE FORECAST", body text,
  // sub-counts) instead of clipping mid-word. min-w-0 on every wrapper so
  // flex/grid children can actually shrink without pushing past their slot.
  // Row 2: 3 cards rendered as a separate grid so a tight Operations stack
  // doesn't squeeze the Crew Roster and Feature Rail into illegible slivers.
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.18 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0"><TideChart series={tideSeries} metrics={metrics} /></div>
        <div className="min-w-0"><WeatherCard metrics={metrics} /></div>
        <div className="min-w-0"><AlertBulletinCard bulletins={bulletins} /></div>
        <div className="min-w-0"><VesselRegistry metrics={metrics} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-6"><CrewRoster team={team} /></div>
        <div className="min-w-0 lg:col-span-4"><AgencyFeatureRail features={features} /></div>
        <div className="min-w-0 lg:col-span-2">
          <OperationsStack apiKeyCount={apiKeyCount} webhookCount={webhookCount} />
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TideChart — 24-hour activity volume rendered as an animated wave SVG
// ---------------------------------------------------------------------------

function TideChart({
  series, metrics,
}: {
  series: number[];
  metrics: HarborMetrics;
}) {
  const W = 360;
  const H = 110;
  const points = series.map((v, i) => ({
    x: (i * W) / (series.length - 1 || 1),
    y: H - 14 - v * (H - 28),
  }));
  const linePath = useMemo(() => smoothPath(points), [points]);
  const fillPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;
  const last = points[points.length - 1];

  return (
    // `overflow-hidden` on the card so the inner SVG can never bleed into
    // sibling rows even at extreme aspect ratios; explicit max-height on the
    // SVG keeps the wave at a fixed height instead of stretching with the
    // grid cell.
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
            24h tide chart
          </p>
          <p className="mt-0.5 text-sm font-semibold text-text">Activity volume</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-accent">
          <Waves className="h-2.5 w-2.5" />
          rising
        </span>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-border-muted bg-surface-2/40 p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[110px] max-h-[110px] w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
        >
          {[0.25, 0.5, 0.75].map((p) => (
            <line
              key={`g-${p}`}
              x1={0} y1={H * p + 4} x2={W} y2={H * p + 4}
              stroke={HEX.border} strokeOpacity={0.6}
              strokeWidth={0.8} strokeDasharray="2 4"
            />
          ))}
          <defs>
            <linearGradient id="w2-tide-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <motion.path
            d={fillPath} fill="url(#w2-tide-fill)"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
          <motion.path
            d={linePath} fill="none" stroke={HEX.accent}
            strokeWidth={1.8} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={{ duration: 1.3, ease: 'easeOut' }}
          />
          {last && (
            <>
              <motion.circle
                cx={last.x} cy={last.y} r={4} fill={HEX.accent}
                animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.3, 1] }}
                transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
                style={{ transformOrigin: `${last.x}px ${last.y}px` }}
              />
              <circle cx={last.x} cy={last.y} r={2} fill={HEX.surface} stroke={HEX.accent} strokeWidth={1} />
            </>
          )}
          {['00', '06', '12', '18', '24'].map((label, i) => {
            const x = (i * W) / 4;
            return (
              <text
                key={label}
                x={x} y={H - 2} textAnchor="middle" fill={HEX.textFaint}
                style={{
                  fontSize: 8, fontFamily: 'JetBrains Mono, monospace',
                  letterSpacing: 0.4,
                }}
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-text-dim">
        <span>
          Peak{' '}
          <span className="text-text">
            {Math.round(Math.max(...series) * metrics.totalMailboxes)}
          </span>{' '}
          sends
        </span>
        <span>
          Avg warmth{' '}
          <span className="text-text">{metrics.avgWarmth}</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeatherCard — aggregate health styled as a weather conditions card
// ---------------------------------------------------------------------------

function WeatherCard({ metrics }: { metrics: HarborMetrics }) {
  const weather = metrics.weather;
  const conf =
    weather === 'FAIR'
      ? { tone: HEX.success, subtitle: 'Visibility unlimited', label: 'FAIR · 0/5 storm cells' }
      : weather === 'OVERCAST'
        ? { tone: HEX.warning, subtitle: 'Cloud cover building', label: 'OVERCAST · 2/5 storm cells' }
        : { tone: HEX.danger, subtitle: 'Squall reported port-side', label: 'STORMY · 4/5 storm cells' };
  const WeatherIcon = weather === 'FAIR' ? Sparkles : weather === 'OVERCAST' ? Wind : ShieldAlert;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
        Marine forecast
      </p>
      <div className="mt-2 flex items-center gap-3">
        <motion.span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border"
          style={{ borderColor: `${conf.tone}55`, background: `${conf.tone}1a`, color: conf.tone }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
        >
          <WeatherIcon className="h-5 w-5" />
        </motion.span>
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight" style={{ color: conf.tone }}>
            {weather}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            {conf.label}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-text-dim">{conf.subtitle}</p>
      <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3">
        <ForecastCell label="Healthy" value={metrics.healthy} tone={HEX.success} />
        <ForecastCell label="Warming" value={metrics.warming} tone={HEX.warning} />
        <ForecastCell label="Distress" value={metrics.inDistress} tone={HEX.danger} />
      </div>
    </div>
  );
}

function ForecastCell({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/40 p-2">
      <p className="font-mono text-base font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-faint">
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertBulletinCard — harbormaster bulletins
// ---------------------------------------------------------------------------

interface Bulletin {
  id: string;
  severity: 'info' | 'warning' | 'danger';
  body: string;
  when: string;
}

function AlertBulletinCard({ bulletins }: { bulletins: Bulletin[] }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
          Harbormaster bulletins
        </p>
        <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2/70 px-1.5 py-0.5 font-mono text-[9px] text-text-dim">
          <Bell className="h-2.5 w-2.5 text-accent" />
          live
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {bulletins.length === 0 && (
          <li className="rounded-lg border border-border-muted bg-surface-2/30 p-3 text-center text-[11px] text-text-dim">
            No recent bulletins. Harbor is quiet.
          </li>
        )}
        {bulletins.map((b) => {
          const tone =
            b.severity === 'danger' ? HEX.danger
            : b.severity === 'warning' ? HEX.warning
            : HEX.accent;
          const label =
            b.severity === 'danger' ? 'VESSEL ALERT'
            : b.severity === 'warning' ? 'ADVISORY'
            : 'NOTICE';
          return (
            <li
              key={b.id}
              className="rounded-lg border bg-surface-2/40 p-2.5"
              style={{ borderColor: `${tone}33` }}
            >
              <p
                className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: tone }}
              >
                {label}
              </p>
              <p className="mt-1 text-[11px] text-text">{b.body}</p>
              <p className="mt-0.5 font-mono text-[9px] text-text-faint">{b.when}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VesselRegistry — total ships / moored / active / in distress
// ---------------------------------------------------------------------------

function VesselRegistry({ metrics }: { metrics: HarborMetrics }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
        Vessel registry
      </p>
      <ul className="mt-2 space-y-1.5">
        <RegistryRow icon={ShipIcon} label="Total" value={metrics.totalShips} />
        <RegistryRow icon={Anchor} label="Active" value={metrics.healthy + metrics.warming} />
        <RegistryRow icon={Activity} label="Warming" value={metrics.warming} tone={HEX.warning} />
        <RegistryRow icon={ShieldAlert} label="Distress" value={metrics.inDistress} tone={HEX.danger} />
      </ul>
      <div className="mt-auto rounded-lg border border-border-muted bg-surface-2/40 px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
        Updated {Math.floor(Math.random() * 3) + 1}s ago
      </div>
    </div>
  );
}

function RegistryRow({
  icon: Icon, label, value, tone = TOK.text,
}: {
  icon: typeof ShipIcon;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <li className="flex items-center justify-between rounded-md border border-border-muted bg-surface-2/40 px-2 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-text">
        <Icon className="h-3 w-3 text-accent" />
        {label}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: tone }}>
        {value}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// CrewRoster — agency team chips in a roster-style row
// ---------------------------------------------------------------------------

function CrewRoster({ team }: { team: AgencyWorkspaceData['team'] }) {
  const navigate = useNavigate();
  return (
    <div className="h-full rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
          Harbor crew
        </p>
        <button
          type="button"
          onClick={() => navigate('/app/workspace')}
          className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2/70 px-2 py-0.5 text-[10px] text-text-dim transition-colors hover:text-text"
        >
          <Users className="h-3 w-3" />
          Manage
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {team.length === 0 && (
          <li className="text-[11px] text-text-dim">No crew assigned yet.</li>
        )}
        {team.map((m) => (
          <CrewChip key={m.id} member={m} />
        ))}
      </ul>
    </div>
  );
}

function CrewChip({
  member,
}: {
  member: AgencyWorkspaceData['team'][number];
}) {
  const initials = member.name
    .split(' ').map((s) => s.charAt(0)).join('').slice(0, 2).toUpperCase();
  const rolePin =
    member.role === 'owner' ? { color: HEX.accent, label: 'Harbormaster' }
    : member.role === 'admin' ? { color: HEX.accent2, label: 'Dock master' }
    : { color: HEX.textDim, label: 'Deckhand' };
  return (
    <li
      className="group inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px]"
      style={{ borderColor: `${rolePin.color}40`, background: `${rolePin.color}10` }}
      title={`${member.name} (${rolePin.label}) · ${member.email} · ${member.lastActiveAgo} · ${member.subClientsManaged} ships`}
    >
      <span
        className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border-muted bg-surface-2 font-mono text-[8px] font-semibold"
        style={{ color: rolePin.color }}
      >
        {initials}
      </span>
      <span className="font-medium text-text">{member.name}</span>
      <span
        className="font-mono text-[9px] uppercase tracking-[0.14em]"
        style={{ color: rolePin.color }}
      >
        {rolePin.label}
      </span>
      <span className="font-mono text-[10px] text-text-faint">·</span>
      <span className="font-mono text-[10px] text-text-dim">{member.subClientsManaged} ships</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// AgencyFeatureRail — white-label / domain / dedicated pool as port amenities
// ---------------------------------------------------------------------------

function AgencyFeatureRail({
  features,
}: {
  features: AgencyWorkspaceData['features'];
}) {
  const wl = features.whiteLabel;
  const cd = features.customDomain;
  const dp = features.dedicatedPool;
  const wlDetail = wl.enabled
    ? `Branded as ${wl.brandName ?? '—'}`
    : 'Replace WarmPulse branding with yours';
  const cdDetail = cd.enabled
    ? `${cd.domain ?? '—'} · ${cd.status}`
    : 'Serve the portal on your own host';
  const dpDetail = dp.enabled
    ? `${dp.poolName ?? 'Private helper group'} · ${formatNumber(dp.memberCount)} peers`
    : 'Isolate your sub-clients from the shared helper group';
  return (
    <div className="h-full rounded-2xl border border-border-muted bg-surface/65 p-4 backdrop-blur-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">
        Port amenities
      </p>
      <ul className="mt-2 space-y-2">
        <FeatureLine icon={Palette} label="White-label livery" enabled={wl.enabled} detail={wlDetail} />
        <FeatureLine icon={Globe} label="Custom moorings" enabled={cd.enabled} detail={cdDetail} />
        <FeatureLine icon={Shield} label="Private flotilla" enabled={dp.enabled} detail={dpDetail} />
      </ul>
    </div>
  );
}

function FeatureLine({
  icon: Icon, label, enabled, detail,
}: {
  icon: typeof Palette;
  label: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border-muted bg-surface-2/40 p-2.5">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
          enabled ? 'bg-accent/12 text-accent' : 'bg-surface-2 text-text-faint'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-text">{label}</span>
          <span
            className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
              enabled ? 'text-accent' : 'text-text-faint'
            }`}
          >
            {enabled ? 'On' : 'Off'}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-text-dim">{detail}</p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// OperationsStack — API key + webhook tile pair
// ---------------------------------------------------------------------------

function OperationsStack({
  apiKeyCount, webhookCount,
}: {
  apiKeyCount: number;
  webhookCount: number;
}) {
  return (
    <div className="grid h-full grid-cols-1 gap-2">
      <OpsTile label="API keys" value={String(apiKeyCount)} sub="active" icon={Building2} />
      <OpsTile label="Webhooks" value={String(webhookCount)} sub="live" icon={Radio} />
    </div>
  );
}

function OpsTile({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Building2;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-muted bg-surface/65 p-3 backdrop-blur-xl">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-faint">{label}</p>
        <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-text">
          {value}
          <span className="ml-1 text-[10px] font-normal text-text-dim">{sub}</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Derived helpers — synthesise tide series, bulletins, voyage events, captain names
// ---------------------------------------------------------------------------

/**
 * 25 sample points (0..1) representing a synthetic 24h activity curve.
 * Shape is driven by total mailbox volume so different portfolios get
 * visibly different tide signatures without per-account real data.
 */
function buildTideSeries(subs: SubClient[]): number[] {
  const totalMb = subs.reduce((acc, s) => acc + s.mailboxCount, 0);
  const base = Math.min(1, totalMb / 120);
  const points: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    // double-sin with offset to mimic a tidal-cycle / business-day curve
    const t = i / 24;
    const morning = Math.sin(t * Math.PI * 2 - Math.PI / 2);
    const afternoon = 0.55 * Math.sin(t * Math.PI * 4 + Math.PI / 6);
    const v = 0.5 + (morning + afternoon) * 0.22;
    points.push(Math.max(0.08, Math.min(1, v * (0.5 + base * 0.5))));
  }
  return points;
}

/**
 * Smooth a polyline into a Catmull-Rom-ish path string for the tide chart.
 * Each segment uses a cubic bezier with control points midway between
 * adjacent samples, producing the gentle wave-like shape we want.
 */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    if (!p) return '';
    return `M ${p.x} ${p.y}`;
  }
  const head = points[0];
  if (!head) return '';
  let d = `M ${head.x} ${head.y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;
    const cx1 = (prev.x + curr.x) / 2;
    d += ` C ${cx1} ${prev.y}, ${cx1} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

/**
 * Build harbormaster-bulletin entries from the sub-client roster. At-risk
 * sub-clients turn into "VESSEL ALERT"; warming → "ADVISORY"; otherwise a
 * single "all clear" notice is surfaced so the card is never empty.
 */
function buildBulletins(subs: SubClient[]): Bulletin[] {
  const out: Bulletin[] = [];
  const atRisk = subs.filter((s) => s.status === 'at_risk');
  const warming = subs.filter((s) => s.status === 'warming');

  for (const sub of atRisk.slice(0, 2)) {
    out.push({
      id: `bul-${sub.id}-d`, severity: 'danger',
      body: `${sub.name} reports rough conditions — failure rate elevated. Captain hailed for rigging inspection.`,
      when: sub.lastActiveAgo.replace(/^signal\s+/, 'last hailed '),
    });
  }
  for (const sub of warming.slice(0, 2)) {
    out.push({
      id: `bul-${sub.id}-w`, severity: 'warning',
      body: `${sub.name} crossing the warming channel — keep wide berth on outbound volume for 24h.`,
      when: sub.lastActiveAgo.replace(/^signal\s+/, 'last hailed '),
    });
  }
  if (out.length === 0) {
    out.push({
      id: 'bul-allclear', severity: 'info',
      body: 'All vessels reporting fair seas. Outbound traffic clear to leave port.',
      when: 'logged 1m ago',
    });
  }
  return out.slice(0, 3);
}

interface VoyageEvent {
  id: string;
  label: string;
  when: string;
  icon: typeof Mail;
  color: string;
}

/**
 * Three-step voyage timeline modelled on the ship's recent activity, mirroring
 * the warmup engine's outbound/engagement/reply pattern.
 */
function buildVoyageEvents(sub: SubClient, slipLabel: string): VoyageEvent[] {
  const crates = Math.max(1, Math.round(sub.mailboxCount / 3));
  const sisters = Math.max(2, Math.round(sub.mailboxCount / 2));
  const pennants = Math.max(1, Math.round(sub.mailboxCount / 4));
  return [
    { id: `${sub.id}-ev-1`,
      label: `Departed slip ${slipLabel} with ${crates} crates`,
      when: sub.lastActiveAgo.replace(/^signal\s+/, 'today · '),
      icon: Mail, color: HEX.accent },
    { id: `${sub.id}-ev-2`,
      label: `Hailed by ${sisters} sister vessels`,
      when: 'today · 2h ago',
      icon: Radio, color: HEX.accent2 },
    { id: `${sub.id}-ev-3`,
      label: `Returning convoy reported ${pennants} reply pennants`,
      when: 'today · 4h ago',
      icon: Activity, color: HEX.accent3 },
  ];
}

/** Extract a presentable captain name from the owner email. */
function extractCaptainName(email: string): string {
  if (!email) return 'Captain unassigned';
  const local = email.split('@')[0] ?? email;
  // turn "first.last" / "first-last" / "first_last" into "First Last"
  const parts = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  if (parts.length === 0) return 'Captain unassigned';
  return `Capt. ${parts.join(' ')}`;
}

/** Rough proxy for the ship's daily send volume — keeps the manifest alive. */
function estimateDailySends(sub: SubClient): number {
  // ramp ladder caps + warmth modifier — purely cosmetic but deterministic
  const cap = sub.plan === 'Pro Plus' ? 50 : sub.plan === 'Pro' ? 35 : 20;
  const factor = sub.avgWarmth / 100;
  return Math.max(1, Math.round(sub.mailboxCount * cap * factor * 0.06));
}
