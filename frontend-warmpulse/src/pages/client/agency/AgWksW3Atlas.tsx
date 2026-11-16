import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Anchor,
  Building2,
  Crown,
  Feather,
  Flag,
  Globe2,
  Key,
  Mail,
  Plus,
  Scroll,
  Shield,
  Sparkles,
  Swords,
  Users,
  Webhook,
  Wind,
  X,
} from 'lucide-react';
import type { AgencyWorkspaceData } from '@/pages/client/agency/AgWksC1Federation';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksW3Atlas — Agency-tier Workspace, design candidate "W3 Antique Atlas".
 *
 * /app/workspace for Agency-tier accounts rendered as a hand-drawn 17th-century
 * atlas page. Each sub-client is a TERRITORY with irregular Voronoi-style
 * borders, a capital (sub-client name in italic serif), population stats
 * (mailbox count) and an annual yield (daily sends). The agency itself is the
 * "empire" surveying these territories.
 *
 * Page chrome:
 *   - Cartouche header up top: "ATLAS OF THE [AGENCY] EMPIRE", subtitle
 *     "Surveyed Anno [year]", scrollwork bands, drop-cap monogram, compass
 *     rose pinned to the right.
 *   - Main canvas: parchment SVG with grain (feTurbulence), faint lat-lon
 *     graticule, irregular polygon territories, ornate capital markers,
 *     dashed trade routes, sea-monsters in corners (only when at-risk
 *     territories exist), sketchy mountains, wind cherub puffing across the
 *     map.
 *   - Left legend strip: status sigils, scale bar in mailboxes, compass notes
 *     (declination etc — purely decorative), and a parchment marginalia
 *     pull-quote.
 *   - Bottom rail: Charter office (features) · Privy council (team) · Royal
 *     seals (API keys + webhooks).
 *   - Click a territory → a detail cartouche slides out underneath the map
 *     ("royal correspondence" panel) — reframes the last 3 events in
 *     old-style language.
 *
 * Distinguishing concept vs C1–C4: this is OLD-WORLD CARTOGRAPHY (parchment +
 * sepia + ink + scrollwork) where each sub-client occupies a piece of LAND on
 * the page, not a node on a network or a row in a roster.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props. The
 * preview harness mounts it prop-less; every value comes from the inline MOCK.
 * Renders only page content; the app shell supplies the chrome.
 */

// ---------------------------------------------------------------------------
// Local mock — Northwind agency + 8 sub-clients (Helix, Nimbus, Orion, etc.)
// ---------------------------------------------------------------------------

const MOCK: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    ownerEmail: 'you@northwind.agency',
    region: 'us-east-1',
    slug: 'northwind-agency',
  },
  features: {
    whiteLabel: { enabled: true, brandName: 'Northwind Mail Charter', hasLogo: true },
    customDomain: { enabled: true, domain: 'mail.northwind.agency', status: 'verified' },
    dedicatedPool: { enabled: true, poolName: 'Northwind Crown Pool', memberCount: 312 },
  },
  subClients: [
    {
      id: 'sc-helix', name: 'Helix Analytics', logoChar: 'HX',
      ownerEmail: 'ops@helix-analytics.io', plan: 'Pro Plus',
      mailboxCount: 24, teamCount: 6, avgWarmth: 91, status: 'healthy',
      monthlyMrrUsd: 1480, createdAgo: 'joined 11 months ago', lastActiveAgo: 'active 2m ago',
    },
    {
      id: 'sc-nimbus', name: 'Nimbus Cloud', logoChar: 'NB',
      ownerEmail: 'team@nimbus.cloud', plan: 'Pro Plus',
      mailboxCount: 19, teamCount: 5, avgWarmth: 88, status: 'healthy',
      monthlyMrrUsd: 1180, createdAgo: 'joined 8 months ago', lastActiveAgo: 'active 6m ago',
    },
    {
      id: 'sc-orion', name: 'Orion Sales', logoChar: 'OR',
      ownerEmail: 'gtm@orion-sales.co', plan: 'Pro',
      mailboxCount: 15, teamCount: 4, avgWarmth: 85, status: 'healthy',
      monthlyMrrUsd: 880, createdAgo: 'joined 6 months ago', lastActiveAgo: 'active 11m ago',
    },
    {
      id: 'sc-vega', name: 'Vega Outreach', logoChar: 'VG',
      ownerEmail: 'hello@vega-outreach.io', plan: 'Pro',
      mailboxCount: 12, teamCount: 3, avgWarmth: 81, status: 'warming',
      monthlyMrrUsd: 640, createdAgo: 'joined 4 months ago', lastActiveAgo: 'active 19m ago',
    },
    {
      id: 'sc-lyra', name: 'Lyra Studio', logoChar: 'LY',
      ownerEmail: 'mail@lyra.studio', plan: 'Pro',
      mailboxCount: 10, teamCount: 3, avgWarmth: 78, status: 'healthy',
      monthlyMrrUsd: 520, createdAgo: 'joined 3 months ago', lastActiveAgo: 'active 28m ago',
    },
    {
      id: 'sc-quasar', name: 'Quasar Growth', logoChar: 'QS',
      ownerEmail: 'founders@quasar.gg', plan: 'Starter',
      mailboxCount: 8, teamCount: 2, avgWarmth: 64, status: 'warming',
      monthlyMrrUsd: 340, createdAgo: 'joined 6 weeks ago', lastActiveAgo: 'active 42m ago',
    },
    {
      id: 'sc-pyx', name: 'Pyx Forge', logoChar: 'PX',
      ownerEmail: 'team@pyx-forge.dev', plan: 'Starter',
      mailboxCount: 6, teamCount: 2, avgWarmth: 58, status: 'warming',
      monthlyMrrUsd: 220, createdAgo: 'joined 5 weeks ago', lastActiveAgo: 'active 1h ago',
    },
    {
      id: 'sc-atlas', name: 'Atlas Bio', logoChar: 'AB',
      ownerEmail: 'sales@atlas-bio.com', plan: 'Starter',
      mailboxCount: 5, teamCount: 1, avgWarmth: 32, status: 'at_risk',
      monthlyMrrUsd: 180, createdAgo: 'joined 10 weeks ago', lastActiveAgo: 'active 3h ago',
    },
  ],
  team: [
    { id: 't-owner', name: 'You', email: 'you@northwind.agency', role: 'owner',
      lastActiveAgo: 'now', subClientsManaged: 8 },
    { id: 't-admin-1', name: 'Mariana Castro', email: 'mariana@northwind.agency',
      role: 'admin', lastActiveAgo: '12m ago', subClientsManaged: 3 },
    { id: 't-admin-2', name: 'Jaime Okafor', email: 'jaime@northwind.agency',
      role: 'admin', lastActiveAgo: '34m ago', subClientsManaged: 3 },
    { id: 't-member-1', name: 'Felix Berg', email: 'felix@northwind.agency',
      role: 'member', lastActiveAgo: '1h ago', subClientsManaged: 2 },
    { id: 't-member-2', name: 'Priya Subramanian', email: 'priya@northwind.agency',
      role: 'member', lastActiveAgo: '4h ago', subClientsManaged: 1 },
  ],
  apiKeys: [
    { id: 'ak-1', label: 'Production · Charter API', masked: 'wp_live_••••_8Fk2',
      scope: 'admin', lastUsedAgo: '4m ago' },
    { id: 'ak-2', label: 'Cartographer · readonly', masked: 'wp_live_••••_Lp93',
      scope: 'read', lastUsedAgo: '38m ago' },
    { id: 'ak-3', label: 'Quartermaster · writes', masked: 'wp_live_••••_Qx41',
      scope: 'write', lastUsedAgo: '2h ago' },
  ],
  webhooks: [
    { id: 'wh-1', url: 'hooks.northwind.agency/warmpulse/events',
      events: ['mailbox.paused', 'warmth.alert', 'bounce.spike'], status: 'live' },
    { id: 'wh-2', url: 'ops.northwind.agency/slack/relay',
      events: ['peer.failed', 'dns.break'], status: 'paused' },
  ],
};

// ---------------------------------------------------------------------------
// Theme tokens — all colour via Shailog orange CSS vars. No hardcoded
// purple/violet/cyan/teal allowed anywhere in this file.
// ---------------------------------------------------------------------------

const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";
const ITAL = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
/** Cream parchment tint (matches design-doc directive). */
const PARCH = 'color-mix(in srgb, var(--wp-warning) 6%, var(--wp-surface))';
/** Slightly stronger parchment for elevated surfaces. */
const PARCH_2 = 'color-mix(in srgb, var(--wp-warning) 9%, var(--wp-surface))';
/** Ink border default. */
const INK = 'color-mix(in srgb, var(--wp-accent) 22%, var(--wp-border))';
/** Stronger ink border for emphasised panels. */
const INK_STRONG = 'color-mix(in srgb, var(--wp-accent) 28%, var(--wp-border))';

type SubClientStatus = NonNullable<AgencyWorkspaceData['subClients'][number]['status']>;

/** Old-world vocabulary mapping for sub-client status. */
const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'Prosperous',
  warming: 'Warming Frontier',
  at_risk: 'Embattled',
  inactive: 'Dormant',
};

/** Province tag above territories — null for healthy (no tag wanted). */
const STATUS_TAG: Record<SubClientStatus, string | null> = {
  healthy: null,
  warming: 'FRONTIER',
  at_risk: 'DISPUTED',
  inactive: 'DORMANT',
};

const STATUS_VAR: Record<SubClientStatus, string> = {
  healthy: 'var(--wp-accent)',
  warming: 'var(--wp-warning)',
  at_risk: 'var(--wp-danger)',
  inactive: 'var(--wp-text-faint)',
};

const STATUS_FILL: Record<SubClientStatus, string> = {
  healthy: 'color-mix(in srgb, var(--wp-accent) 6%, transparent)',
  warming: 'color-mix(in srgb, var(--wp-warning) 9%, transparent)',
  at_risk: 'color-mix(in srgb, var(--wp-danger) 12%, transparent)',
  inactive: 'color-mix(in srgb, var(--wp-text-faint) 6%, transparent)',
};

/** Old-world translations for the activity-event blurbs in the cartouche. */
const OLD_VERBS = {
  sent: 'dispatched',
  reply: 'received reply from',
  open: 'opened by',
  star: 'starred by the herald of',
  bounce: 'lost a courier to',
  warmth: 'measured the kiln-heat of',
} as const;

/** Helper: token-coloured fill expression. */
const tint = (v: string, pct: number) =>
  `color-mix(in srgb, ${v} ${pct}%, transparent)`;
/** Helper: layered token over parchment. */
const surfaceTint = (v: string, pct: number) =>
  `color-mix(in srgb, ${v} ${pct}%, ${PARCH})`;

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

function rand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function jitter(seed: number, amt: number): number {
  return (rand(seed) - 0.5) * 2 * amt;
}

// ---------------------------------------------------------------------------
// Atlas geometry
// ---------------------------------------------------------------------------

const VB_W = 1000;
const VB_H = 720;
const INSET_X = 88;
const INSET_Y = 88;
const PLAY_W = VB_W - INSET_X * 2;
const PLAY_H = VB_H - INSET_Y * 2;

interface TerritoryCellShape {
  id: string;
  cx: number;
  cy: number;
  r: number;
  points: string;
  vertices: Array<{ x: number; y: number }>;
}

/**
 * Approximate-Voronoi layout: deterministic jittered grid of centres, each one
 * given an irregular 5-7 sided polygon whose vertices sit on a jittered circle.
 * Not a real Voronoi decomposition — perfectly fine for a static pictorial
 * atlas of <= ~12 territories where the gestalt matters more than topology.
 */
function layoutTerritories(
  subs: AgencyWorkspaceData['subClients'],
): TerritoryCellShape[] {
  if (subs.length === 0) return [];
  const cols = subs.length <= 4 ? subs.length : subs.length <= 6 ? 3 : 4;
  const rows = Math.ceil(subs.length / cols);
  const cellW = PLAY_W / cols;
  const cellH = PLAY_H / rows;
  return subs.map((sub, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const seed = hashId(sub.id);
    const cx = INSET_X + cellW * (col + 0.5) + jitter(seed + 1, cellW * 0.16);
    const cy = INSET_Y + cellH * (row + 0.5) + jitter(seed + 2, cellH * 0.16);
    const sides = 5 + (seed % 3);
    const baseR = Math.min(cellW, cellH) * 0.42;
    const verts: Array<{ x: number; y: number }> = [];
    for (let v = 0; v < sides; v++) {
      const t = (v / sides) * Math.PI * 2 + jitter(seed + 10 + v, 0.18);
      const rJit = baseR * (0.78 + rand(seed + 30 + v) * 0.32);
      verts.push({ x: cx + Math.cos(t) * rJit, y: cy + Math.sin(t) * rJit });
    }
    const points = verts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return { id: sub.id, cx, cy, r: baseR, points, vertices: verts };
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgWksW3Atlas(
  { data }: { data?: AgencyWorkspaceData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const cells = useMemo(() => layoutTerritories(d.subClients), [d.subClients]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const active = useMemo(
    () => d.subClients.find((sc) => sc.id === activeId) ?? null,
    [d.subClients, activeId],
  );

  const totalSubs = d.subClients.length;
  const totalMailboxes = useMemo(
    () => d.subClients.reduce((a, sc) => a + sc.mailboxCount, 0),
    [d.subClients],
  );
  const totalMrr = useMemo(
    () => d.subClients.reduce((a, sc) => a + sc.monthlyMrrUsd, 0),
    [d.subClients],
  );
  const prosperousCount = useMemo(
    () => d.subClients.filter((sc) => sc.status === 'healthy').length,
    [d.subClients],
  );
  const frontierCount = useMemo(
    () => d.subClients.filter((sc) => sc.status === 'warming').length,
    [d.subClients],
  );
  const embattledCount = useMemo(
    () => d.subClients.filter((sc) => sc.status === 'at_risk').length,
    [d.subClients],
  );

  // Deterministic trade routes: up to 4 pairs of cells connected by a curved
  // dashed ink line. The slug seeds the picker so the routes don't reshuffle
  // between renders.
  const tradeRoutes = useMemo(() => {
    if (cells.length < 2) return [] as Array<[TerritoryCellShape, TerritoryCellShape]>;
    const seed = hashId(d.agency.slug || d.agency.name);
    const pairs: Array<[TerritoryCellShape, TerritoryCellShape]> = [];
    const count = Math.min(4, cells.length - 1);
    for (let i = 0; i < count; i++) {
      const a = cells[Math.floor(rand(seed + i * 7) * cells.length) % cells.length];
      if (!a) continue;
      const bIdx = (cells.indexOf(a) + 1 + Math.floor(rand(seed + i * 11) * (cells.length - 1)))
        % cells.length;
      const b = cells[bIdx];
      if (b && a.id !== b.id) pairs.push([a, b]);
    }
    return pairs;
  }, [cells, d.agency.slug, d.agency.name]);

  const hasEmbattled = embattledCount > 0;
  const surveyYear = 2026; // matches CLAUDE.md currentDate context (2026-05-29)
  const empireName = d.agency.name.replace(/\s+Agency\s*$/i, '').trim() || d.agency.name;

  return (
    <div className="space-y-5">
      <AtlasCartouche
        empireName={empireName}
        plan={d.agency.plan}
        region={d.agency.region}
        surveyYear={surveyYear}
        totalSubs={totalSubs}
        totalMailboxes={totalMailboxes}
        totalMrr={totalMrr}
        prosperousCount={prosperousCount}
        frontierCount={frontierCount}
        embattledCount={embattledCount}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="lg:col-span-3 xl:col-span-2">
          <LegendStrip
            prosperous={prosperousCount}
            frontier={frontierCount}
            embattled={embattledCount}
            totalMailboxes={totalMailboxes}
          />
        </div>

        <div className="lg:col-span-9 xl:col-span-10">
          <AtlasCanvas
            data={d}
            cells={cells}
            tradeRoutes={tradeRoutes}
            activeId={activeId}
            hoverId={hoverId}
            hasEmbattled={hasEmbattled}
            onSelect={setActiveId}
            onHover={setHoverId}
          />

          <AnimatePresence>
            {active && (
              <TerritoryDetailCartouche
                key={active.id}
                sub={active}
                onClose={() => setActiveId(null)}
              />
            )}
          </AnimatePresence>

          <AtlasFooterRail data={d} />
        </div>
      </motion.div>
    </div>
  );
}

export default AgWksW3Atlas;

// ===========================================================================
// AtlasCartouche — top-of-page ornate banner with drop-cap monogram, title,
// subtitle "Surveyed Anno YYYY · region", KPI ribbon, and compass rose.
// ===========================================================================

function AtlasCartouche({
  empireName, plan, region, surveyYear,
  totalSubs, totalMailboxes, totalMrr,
  prosperousCount, frontierCount, embattledCount,
}: {
  empireName: string; plan: string; region: string; surveyYear: number;
  totalSubs: number; totalMailboxes: number; totalMrr: number;
  prosperousCount: number; frontierCount: number; embattledCount: number;
}) {
  const drop = (empireName[0] ?? 'A').toUpperCase();
  const rest = empireName.slice(1);
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border"
      style={{
        background: `linear-gradient(180deg, ${surfaceTint('var(--wp-warning)', 9)} 0%, ${surfaceTint('var(--wp-warning)', 4)} 100%)`,
        borderColor: INK_STRONG,
      }}
    >
      <CartoucheBand position="top" />
      <CartoucheBand position="bottom" />

      <div className="relative flex flex-wrap items-center gap-6 px-6 py-7 sm:px-9">
        {/* Drop-cap monogram framed in an ornate cartouche outline. */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid h-20 w-20 shrink-0 place-items-center rounded-xl"
          style={{
            background: tint('var(--wp-accent)', 12),
            border: `1.5px solid ${tint('var(--wp-accent)', 55)}`,
            boxShadow: `inset 0 0 0 3px ${tint('var(--wp-warning)', 25)}`,
          }}
          aria-hidden
        >
          <span
            className="text-[44px] leading-none"
            style={{ fontFamily: SERIF, color: 'var(--wp-accent)', fontWeight: 700, letterSpacing: '-0.02em' }}
          >
            {drop}
          </span>
          <Crown
            className="absolute -top-3 left-1/2 h-4 w-4 -translate-x-1/2"
            style={{ color: 'var(--wp-warning)' }}
          />
        </motion.div>

        {/* Title block. */}
        <div className="min-w-0 flex-1">
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="text-[13px] uppercase tracking-[0.32em]"
            style={{ fontFamily: SERIF, color: 'var(--wp-text-dim)' }}
          >
            Atlas of the
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, delay: 0.3 }}
            className="mt-0.5 flex flex-wrap items-baseline gap-x-3"
          >
            <span
              className="text-[28px] leading-none sm:text-[32px]"
              style={{ fontFamily: SERIF, color: 'var(--wp-text)', fontWeight: 700, letterSpacing: '0.02em' }}
            >
              {drop}
              {rest} EMPIRE
            </span>
            <span
              className="rounded-full border px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.28em]"
              style={{
                color: 'var(--wp-accent)',
                background: tint('var(--wp-accent)', 12),
                borderColor: tint('var(--wp-accent)', 35),
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {plan}
              </span>
            </span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}
          >
            <span>Surveyed Anno {surveyYear}</span>
            <span aria-hidden style={{ color: 'var(--wp-text-faint)' }}>·</span>
            <span className="font-mono not-italic text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>{region}</span>
            <span aria-hidden style={{ color: 'var(--wp-text-faint)' }}>·</span>
            <span>
              <span style={{ color: 'var(--wp-text)' }}>{totalSubs}</span>{' '}
              territories under Crown survey
            </span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <CartoucheStatPill label="Prosperous" value={`${prosperousCount}/${totalSubs}`} accent="var(--wp-accent)" icon={Flag} />
            <CartoucheStatPill label="Vessels" value={`${totalMailboxes}`} accent="var(--wp-accent-2)" icon={Anchor} />
            <CartoucheStatPill label="Crown MRR" value={formatMoney(totalMrr)} accent="var(--wp-accent-3)" icon={Crown} />
            {frontierCount > 0 && (
              <CartoucheStatPill label="Frontier" value={`${frontierCount}`} accent="var(--wp-warning)" icon={Wind} />
            )}
            {embattledCount > 0 && (
              <CartoucheStatPill label="Embattled" value={`${embattledCount}`} accent="var(--wp-danger)" icon={Swords} />
            )}
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                color: 'var(--wp-accent)',
                background: tint('var(--wp-accent)', 12),
                border: `1px solid ${tint('var(--wp-accent)', 40)}`,
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Charter new territory
            </button>
          </motion.div>
        </div>

        <div className="shrink-0">
          <CompassRose size={104} />
        </div>
      </div>
    </motion.header>
  );
}

function CartoucheStatPill({
  label, value, accent, icon: Icon,
}: { label: string; value: string; accent: string; icon: typeof Flag }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
      style={{
        background: `color-mix(in srgb, ${accent} 10%, ${PARCH})`,
        border: `1px solid ${tint(accent, 35)}`,
      }}
    >
      <Icon className="h-3 w-3" style={{ color: accent }} />
      <span style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}>{label}</span>
      <span className="font-mono tabular-nums" style={{ color: accent, fontWeight: 600 }}>{value}</span>
    </span>
  );
}

/** Decorative deckle band along the top/bottom edge of the cartouche. */
function CartoucheBand({ position }: { position: 'top' | 'bottom' }) {
  // A short wavy clip-path simulates torn deckle parchment. We tile a single
  // small SVG path horizontally with `preserveAspectRatio="none"`.
  const d = position === 'top'
    ? 'M0 6 Q5 2 10 6 T20 6 T30 6 T40 6 T50 6 T60 6 T70 6 T80 6 T90 6 T100 6 T110 6 T120 6 T130 6 T140 6 T150 6 T160 6 T170 6 T180 6 T190 6 T200 6 L200 0 L0 0 Z'
    : 'M0 0 Q5 4 10 0 T20 0 T30 0 T40 0 T50 0 T60 0 T70 0 T80 0 T90 0 T100 0 T110 0 T120 0 T130 0 T140 0 T150 0 T160 0 T170 0 T180 0 T190 0 T200 0 L200 6 L0 6 Z';
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-3"
      style={{ [position]: 0 } as React.CSSProperties}
      viewBox="0 0 200 6"
      preserveAspectRatio="none"
    >
      <path d={d} fill={tint('var(--wp-accent)', 16)} opacity={0.6} />
    </svg>
  );
}

// ===========================================================================
// CompassRose — top-right ornament. 24 graduated ticks, rotating inner star,
// fixed N/E/S/W labels in serif.
// ===========================================================================

function CompassRose({ size = 96 }: { size?: number }) {
  const c = size / 2;
  const ringR = c - 4;
  const innerR = ringR * 0.62;
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
        <defs>
          <radialGradient id="agwksw3-compass-fill" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor={surfaceTint('var(--wp-warning)', 18)} />
            <stop offset="100%" stopColor={surfaceTint('var(--wp-warning)', 6)} />
          </radialGradient>
        </defs>
        <circle
          cx={c} cy={c} r={ringR}
          fill="url(#agwksw3-compass-fill)"
          stroke={tint('var(--wp-accent)', 60)}
          strokeWidth={1.4}
        />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
          const isMain = i % 6 === 0;
          const inset = isMain ? 7 : 4;
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * (ringR - inset)} y1={c + Math.sin(a) * (ringR - inset)}
              x2={c + Math.cos(a) * (ringR - 1.5)} y2={c + Math.sin(a) * (ringR - 1.5)}
              stroke={tint('var(--wp-accent)', 55)}
              strokeWidth={isMain ? 1.4 : 0.8}
            />
          );
        })}
        <motion.g
          initial={{ rotate: 0 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 60, ease: 'linear', repeat: Infinity }}
          style={{ transformOrigin: `${c}px ${c}px` }}
        >
          <polygon
            points={`${c},${c - innerR} ${c + innerR * 0.18},${c} ${c},${c + innerR} ${c - innerR * 0.18},${c}`}
            fill={tint('var(--wp-accent)', 75)}
            stroke={tint('var(--wp-accent)', 95)}
            strokeWidth={1}
          />
          <polygon
            points={`${c + innerR},${c} ${c},${c - innerR * 0.18} ${c - innerR},${c} ${c},${c + innerR * 0.18}`}
            fill={tint('var(--wp-accent-3)', 65)}
            stroke={tint('var(--wp-accent)', 90)}
            strokeWidth={0.8}
          />
          <circle
            cx={c} cy={c} r={3.5}
            fill={surfaceTint('var(--wp-accent)', 80)}
            stroke="var(--wp-accent)"
            strokeWidth={1}
          />
        </motion.g>
        <text x={c} y={11} textAnchor="middle"
          style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 700 }} fill="var(--wp-accent)">N</text>
        <text x={size - 7} y={c + 4} textAnchor="middle"
          style={{ fontFamily: SERIF, fontSize: 11 }} fill="var(--wp-text-dim)">E</text>
        <text x={c} y={size - 3} textAnchor="middle"
          style={{ fontFamily: SERIF, fontSize: 11 }} fill="var(--wp-text-dim)">S</text>
        <text x={7} y={c + 4} textAnchor="middle"
          style={{ fontFamily: SERIF, fontSize: 11 }} fill="var(--wp-text-dim)">W</text>
      </svg>
    </div>
  );
}

// ===========================================================================
// LegendStrip — vertical strip on the left edge of the map.
// Sections: Status sigils · Scale of vessels · Compass notes · Marginalia.
// ===========================================================================

function LegendStrip({
  prosperous, frontier, embattled, totalMailboxes,
}: { prosperous: number; frontier: number; embattled: number; totalMailboxes: number }) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border p-4"
      style={{
        background: `linear-gradient(160deg, ${surfaceTint('var(--wp-warning)', 6)} 0%, ${surfaceTint('var(--wp-warning)', 3)} 100%)`,
        borderColor: INK,
      }}
    >
      <SectionTitle label="Status of Realms" />
      <ul className="space-y-1.5">
        <LegendSigil sigil="✦" label="Prosperous" count={prosperous} tone="var(--wp-accent)" />
        <LegendSigil sigil="✿" label="Warming" count={frontier} tone="var(--wp-warning)" />
        <LegendSigil sigil="✪" label="Embattled" count={embattled} tone="var(--wp-danger)" />
      </ul>

      <LegendDivider />

      <SectionTitle label="Scale of Vessels" />
      <ScaleBar maxMailboxes={Math.max(100, totalMailboxes)} />
      <p className="mt-2 text-[10px] leading-relaxed"
         style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}>
        One vessel ≈ one connected mailbox of correspondence.
      </p>

      <LegendDivider />

      <SectionTitle label="Compass Notes" />
      <dl className="space-y-1.5 text-[11px]">
        <CompassNote label="Declination" value="07° 14′ E" />
        <CompassNote label="True North" value="↑ aligned" />
        <CompassNote label="Magnetic" value="varies seasonally" />
        <CompassNote label="Heralded by" value="The Charter Office" />
      </dl>

      <LegendDivider />

      <p className="text-[10px] leading-relaxed"
         style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-faint)' }}>
        “Where the inkwell runneth dry, so too the warmth of the post.” —
        Charter notes, vol. III, fol. 42.
      </p>
    </motion.aside>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <h3
      className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em]"
      style={{ fontFamily: SERIF, color: 'var(--wp-accent)' }}
    >
      {label}
    </h3>
  );
}

function LegendDivider() {
  return (
    <div
      className="my-4 h-px"
      style={{ background: tint('var(--wp-accent)', 26) }}
      aria-hidden
    />
  );
}

function LegendSigil({
  sigil, label, count, tone,
}: { sigil: string; label: string; count: number; tone: string }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full text-[11px]"
          style={{
            color: tone,
            background: tint(tone, 14),
            border: `1px solid ${tint(tone, 45)}`,
            fontFamily: SERIF,
          }}
        >
          {sigil}
        </span>
        <span className="text-[11px]" style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text)' }}>
          {label}
        </span>
      </span>
      <span className="font-mono text-[11px] tabular-nums" style={{ color: tone, fontWeight: 600 }}>{count}</span>
    </li>
  );
}

function ScaleBar({ maxMailboxes }: { maxMailboxes: number }) {
  const ticks = [0, 25, 50, 75, 100];
  // Alternating ink/cream segments for the bar — looks like a cartographic
  // scale ruler. Built as a CSS gradient with hard stops.
  const bg =
    `linear-gradient(90deg, ${tint('var(--wp-accent)', 70)} 0%, ${tint('var(--wp-accent)', 70)} 25%,` +
    ` ${surfaceTint('var(--wp-warning)', 5)} 25%, ${surfaceTint('var(--wp-warning)', 5)} 50%,` +
    ` ${tint('var(--wp-accent)', 70)} 50%, ${tint('var(--wp-accent)', 70)} 75%,` +
    ` ${surfaceTint('var(--wp-warning)', 5)} 75%, ${surfaceTint('var(--wp-warning)', 5)} 100%)`;
  return (
    <div className="space-y-1">
      <div
        className="relative h-3 rounded-sm"
        style={{ background: bg, border: `1px solid ${tint('var(--wp-accent)', 55)}` }}
        aria-hidden
      />
      <div className="flex justify-between">
        {ticks.map((t) => (
          <span key={t} className="font-mono text-[9px]" style={{ color: 'var(--wp-text-dim)' }}>{t}</span>
        ))}
      </div>
      <p className="text-[10px]"
         style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-faint)' }}>
        Crown survey ceiling: {maxMailboxes} vessels
      </p>
    </div>
  );
}

function CompassNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[10px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)', fontFamily: SERIF }}>
        {label}
      </dt>
      <dd className="text-[11px]"
          style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}>
        {value}
      </dd>
    </div>
  );
}

// ===========================================================================
// AtlasCanvas — the parchment SVG map.
// Layers (back → front):
//   1. Parchment fill + feTurbulence grain
//   2. Vignette
//   3. Lat-lon graticule
//   4. Page frame + corner flourishes
//   5. Decorative mountains + waves
//   6. Trade routes
//   7. Territories
//   8. Sea monsters (only if at-risk)
//   9. Wind cherub
// ===========================================================================

function AtlasCanvas({
  data, cells, tradeRoutes, activeId, hoverId, hasEmbattled, onSelect, onHover,
}: {
  data: AgencyWorkspaceData;
  cells: TerritoryCellShape[];
  tradeRoutes: Array<[TerritoryCellShape, TerritoryCellShape]>;
  activeId: string | null;
  hoverId: string | null;
  hasEmbattled: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div
      className="relative h-[560px] w-full overflow-hidden rounded-2xl border"
      style={{
        background: `linear-gradient(160deg, ${surfaceTint('var(--wp-warning)', 7)} 0%, ${surfaceTint('var(--wp-warning)', 4)} 60%, ${surfaceTint('var(--wp-warning)', 2)} 100%)`,
        borderColor: 'color-mix(in srgb, var(--wp-accent) 25%, var(--wp-border))',
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Antique atlas of agency territories"
      >
        <defs>
          {/* Parchment grain — feTurbulence noise tinted sepia. */}
          <filter id="agwksw3-parchment" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={4} result="noise" />
            <feColorMatrix in="noise" type="matrix"
              values="0 0 0 0 0.95   0 0 0 0 0.78   0 0 0 0 0.45   0 0 0 0.12 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <radialGradient id="agwksw3-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="60%" stopColor="black" stopOpacity={0} />
            <stop offset="100%" stopColor={tint('var(--wp-accent)', 30)} stopOpacity={0.18} />
          </radialGradient>
          <pattern id="agwksw3-graticule" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0 L0 0 L0 60" fill="none" stroke={tint('var(--wp-accent)', 14)} strokeWidth={0.7} />
          </pattern>
        </defs>

        {/* 1. parchment + grain */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill={PARCH} />
        <rect x={0} y={0} width={VB_W} height={VB_H}
          fill={tint('var(--wp-accent)', 20)}
          filter="url(#agwksw3-parchment)"
          opacity={0.55}
        />

        {/* 2. vignette */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="url(#agwksw3-vignette)" />

        {/* 3. graticule */}
        <rect x={40} y={40} width={VB_W - 80} height={VB_H - 80} fill="url(#agwksw3-graticule)" opacity={0.5} />

        {/* 4. page frame */}
        <PageFrame />

        {/* 5. mountains + waves */}
        <DecorativeMountains seed={hashId(data.agency.slug || 'atlas')} />
        <DecorativeWaves seed={hashId(data.agency.name + 'waves')} />

        {/* 6. trade routes */}
        {tradeRoutes.map((pair, i) => (
          <TradeRoute key={`trade-${i}`} from={pair[0]} to={pair[1]} index={i} />
        ))}

        {/* 7. territories */}
        {cells.map((cell, i) => {
          const sub = data.subClients.find((s) => s.id === cell.id);
          if (!sub) return null;
          return (
            <TerritoryCell
              key={cell.id}
              cell={cell}
              sub={sub}
              index={i}
              active={activeId === cell.id}
              hovered={hoverId === cell.id}
              faded={
                (activeId !== null || hoverId !== null) &&
                activeId !== cell.id && hoverId !== cell.id
              }
              onSelect={() => onSelect(cell.id === activeId ? null : cell.id)}
              onHover={onHover}
            />
          );
        })}

        {/* 8. sea monsters — only if any at-risk territory exists */}
        {hasEmbattled && (
          <>
            <SeaMonster cornerX={70} cornerY={VB_H - 90} variant="dragon" />
            <SeaMonster cornerX={VB_W - 130} cornerY={VB_H - 90} variant="kraken" />
          </>
        )}

        {/* 9. wind cherub */}
        <WindCherub cx={120} cy={120} />

        {/* Page-fold triangle. */}
        <polygon
          points={`${VB_W - 28},${VB_H} ${VB_W},${VB_H} ${VB_W},${VB_H - 28}`}
          fill={tint('var(--wp-accent)', 18)}
          opacity={0.55}
        />
      </svg>

      {cells.length === 0 && (
        <div className="absolute inset-x-8 inset-y-12 grid place-items-center">
          <div
            className="max-w-md rounded-2xl border p-6 text-center"
            style={{ background: PARCH_2, borderColor: `color-mix(in srgb, var(--wp-accent) 35%, var(--wp-border))` }}
          >
            <span
              className="mx-auto grid h-12 w-12 place-items-center rounded-xl"
              style={{
                background: tint('var(--wp-accent)', 12),
                border: `1px solid ${tint('var(--wp-accent)', 45)}`,
                color: 'var(--wp-accent)',
              }}
            >
              <Scroll className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-base font-semibold"
                style={{ fontFamily: SERIF, color: 'var(--wp-text)' }}>
              Uncharted lands
            </h3>
            <p className="mt-1 text-xs"
               style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}>
              Charter your first territory and the cartographers shall draw it
              upon the page.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
              style={{
                color: 'var(--wp-accent)',
                background: tint('var(--wp-accent)', 14),
                border: `1px solid ${tint('var(--wp-accent)', 45)}`,
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Charter territory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageFrame — ink rectangles + corner curls.
// ---------------------------------------------------------------------------

function PageFrame() {
  const corners = [
    { x: 32, y: 32, sx: 1, sy: 1 },
    { x: VB_W - 32, y: 32, sx: -1, sy: 1 },
    { x: 32, y: VB_H - 32, sx: 1, sy: -1 },
    { x: VB_W - 32, y: VB_H - 32, sx: -1, sy: -1 },
  ];
  return (
    <g>
      <rect x={32} y={32} width={VB_W - 64} height={VB_H - 64}
        fill="none" stroke={tint('var(--wp-accent)', 55)} strokeWidth={1.4} />
      <rect x={42} y={42} width={VB_W - 84} height={VB_H - 84}
        fill="none" stroke={tint('var(--wp-accent)', 35)} strokeWidth={0.8}
        strokeDasharray="3 5" />
      {corners.map((c, i) => (
        <g key={i} transform={`translate(${c.x},${c.y}) scale(${c.sx},${c.sy})`}>
          <path
            d="M0 0 L 18 0 M0 0 L 0 18 M8 0 Q 14 0 14 6 M0 8 Q 0 14 6 14"
            fill="none"
            stroke={tint('var(--wp-accent)', 70)}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// DecorativeMountains — sketchy triangles in empty space, deterministic.
// ---------------------------------------------------------------------------

function DecorativeMountains({ seed }: { seed: number }) {
  const positions = useMemo(() => {
    const pts: Array<{ x: number; y: number; size: number }> = [];
    for (let i = 0; i < 6; i++) {
      const along = rand(seed + i * 17);
      const onEdge = rand(seed + i * 23) < 0.5;
      const x = onEdge ? 60 + along * (VB_W - 120) : rand(seed + i * 7) * VB_W;
      const y = !onEdge ? 60 + along * (VB_H - 120) : rand(seed + i * 13) * VB_H;
      const size = 14 + rand(seed + i * 29) * 14;
      pts.push({ x, y, size });
    }
    return pts;
  }, [seed]);
  return (
    <g aria-hidden>
      {positions.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          <path d={`M 0 0 L ${p.size * 0.4} -${p.size * 0.9} L ${p.size * 0.8} 0 Z`}
            fill="none" stroke={tint('var(--wp-accent)', 50)} strokeWidth={1} strokeLinejoin="round" />
          <path d={`M ${p.size * 0.6} 0 L ${p.size * 1.0} -${p.size * 0.7} L ${p.size * 1.4} 0 Z`}
            fill="none" stroke={tint('var(--wp-accent)', 50)} strokeWidth={1} strokeLinejoin="round" />
          <path d={`M ${p.size * 0.2} -${p.size * 0.4} L ${p.size * 0.3} -${p.size * 0.55}`}
            stroke={tint('var(--wp-accent)', 35)} strokeWidth={0.7} />
          <path d={`M ${p.size * 0.3} -${p.size * 0.25} L ${p.size * 0.4} -${p.size * 0.4}`}
            stroke={tint('var(--wp-accent)', 35)} strokeWidth={0.7} />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// DecorativeWaves — sea-corner curved hatching.
// ---------------------------------------------------------------------------

function DecorativeWaves({ seed }: { seed: number }) {
  const patches = [
    { x: 60, y: 220 },
    { x: VB_W - 120, y: 180 },
    { x: 70, y: VB_H - 200 },
    { x: VB_W - 130, y: VB_H - 200 },
  ];
  return (
    <g aria-hidden opacity={0.35}>
      {patches.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          {[0, 6, 12, 18, 24, 30, 36].map((dy, j) => (
            <path
              key={j}
              d={`M 0 ${dy} Q 6 ${dy - 3 + jitter(seed + i * 10 + j, 1)} 12 ${dy} T 24 ${dy} T 36 ${dy} T 48 ${dy}`}
              fill="none"
              stroke={tint('var(--wp-accent)', 45)}
              strokeWidth={0.7}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// TradeRoute — curved dashed ink line between two cell centres, with a tiny
// "✛" ship marker at midpoint.
// ---------------------------------------------------------------------------

function TradeRoute({
  from, to, index,
}: { from: TerritoryCellShape; to: TerritoryCellShape; index: number }) {
  const mx = (from.cx + to.cx) / 2;
  const my = (from.cy + to.cy) / 2;
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const offsetMag = Math.min(28, len * 0.12);
  const sign = index % 2 === 0 ? 1 : -1;
  const ox = (-dy / len) * offsetMag * sign;
  const oy = (dx / len) * offsetMag * sign;
  const path = `M ${from.cx} ${from.cy} Q ${mx + ox} ${my + oy} ${to.cx} ${to.cy}`;
  return (
    <g>
      <motion.path
        d={path}
        fill="none"
        stroke={tint('var(--wp-accent)', 60)}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeDasharray="3 7"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.85 }}
        transition={{
          pathLength: { duration: 1.6, delay: 0.4 + index * 0.18, ease: 'easeOut' },
          opacity: { duration: 0.5, delay: 0.4 + index * 0.18 },
        }}
      />
      <motion.text
        x={mx + ox} y={my + oy + 4} textAnchor="middle"
        style={{ fontFamily: SERIF, fontSize: 12, fill: tint('var(--wp-accent)', 80) }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.85 }}
        transition={{ duration: 0.4, delay: 1.5 + index * 0.2 }}
      >
        ✛
      </motion.text>
    </g>
  );
}

// ===========================================================================
// TerritoryCell — heart of the visual concept.
//   - Irregular polygon border (drawn on with pathLength)
//   - Faint orange fill, darker for at-risk
//   - Capital city marker (8-point star) at the centre
//   - Italic serif label for the sub-client name
//   - Tag pill ("FRONTIER" / "DISPUTED") for warming / at-risk
//   - Coat-of-arms shield with logoChar nearby
//   - On hover: thickens border + adds glow
// ===========================================================================

function TerritoryCell({
  cell, sub, index, active, hovered, faded, onSelect, onHover,
}: {
  cell: TerritoryCellShape;
  sub: AgencyWorkspaceData['subClients'][number];
  index: number;
  active: boolean;
  hovered: boolean;
  faded: boolean;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const tone = STATUS_VAR[sub.status];
  const fill = STATUS_FILL[sub.status];
  const tag = STATUS_TAG[sub.status];
  const lifted = active || hovered;
  const capX = cell.cx;
  const capY = cell.cy;

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: faded ? 0.3 : 1 }}
      transition={{ opacity: { duration: 0.45, delay: 0.25 + index * 0.1, ease: 'easeOut' } }}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onMouseEnter={() => onHover(sub.id)}
      onMouseLeave={() => onHover(null)}
      tabIndex={0}
      role="button"
      aria-label={`${sub.name}, ${sub.mailboxCount} mailboxes, status ${STATUS_LABEL[sub.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
      onFocus={() => onHover(sub.id)}
      onBlur={() => onHover(null)}
    >
      {lifted && (
        <polygon points={cell.points} fill={tone} opacity={0.18} transform="translate(2 3)" />
      )}
      <motion.polygon
        points={cell.points} fill={fill} stroke="none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.35 + index * 0.1 }}
      />
      <FilligreeFill cell={cell} seed={hashId(sub.id + 'fill')} tone={tone} />
      {lifted && (
        <motion.polygon
          points={cell.points} fill="none" stroke={tone} strokeOpacity={0.45} strokeWidth={6}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ duration: 0.25 }}
        />
      )}
      <motion.polygon
        points={cell.points} fill="none" stroke={tone}
        strokeWidth={lifted ? 2.3 : 1.4}
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, delay: 0.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
      />
      {tag && (
        <g transform={`translate(${cell.cx}, ${cell.cy - cell.r * 0.45})`}>
          <rect x={-28} y={-9} width={56} height={14} rx={3}
            fill={PARCH}
            stroke={tone}
            strokeOpacity={0.7}
            strokeWidth={1}
          />
          <text x={0} y={1} textAnchor="middle"
            style={{ fontFamily: SERIF, fontSize: 8, letterSpacing: '0.22em', fontWeight: 700, fill: tone }}>
            {tag}
          </text>
        </g>
      )}
      <CapitalMarker x={capX} y={capY} tone={tone} accent={lifted} />
      {sub.status === 'at_risk' && (
        <motion.circle
          cx={capX} cy={capY} r={6}
          fill="none" stroke="var(--wp-danger)" strokeWidth={1.4}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 2.5, ease: 'easeOut', repeat: Infinity }}
          style={{ transformOrigin: `${capX}px ${capY}px` }}
        />
      )}
      <text
        x={capX} y={capY + 18} textAnchor="middle"
        style={{
          fontFamily: ITAL, fontStyle: 'italic', fontSize: 14, fontWeight: 700,
          fill: 'var(--wp-text)',
          paintOrder: 'stroke fill',
          stroke: PARCH,
          strokeWidth: 4,
        }}
      >
        {sub.name}
      </text>
      <text
        x={capX} y={capY + 32} textAnchor="middle"
        style={{
          fontFamily: SERIF, fontSize: 10,
          fill: 'var(--wp-text-dim)', letterSpacing: '0.1em',
          paintOrder: 'stroke fill',
          stroke: PARCH,
          strokeWidth: 3,
        }}
      >
        pop. {sub.mailboxCount} · warmth {sub.avgWarmth}
      </text>
      <CoatOfArms x={capX + cell.r * 0.55} y={capY - cell.r * 0.4} char={sub.logoChar} tone={tone} />
    </motion.g>
  );
}

function CapitalMarker({
  x, y, tone, accent,
}: { x: number; y: number; tone: string; accent: boolean }) {
  const r = accent ? 6 : 5;
  const points: string[] = [];
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    points.push(`${(x + Math.cos(ang) * rad).toFixed(2)},${(y + Math.sin(ang) * rad).toFixed(2)}`);
  }
  return (
    <g>
      <circle cx={x} cy={y} r={r + 2}
        fill={PARCH}
        stroke={tone}
        strokeWidth={0.8}
      />
      <polygon points={points.join(' ')} fill={tone} stroke={tone} strokeWidth={0.8} strokeLinejoin="miter" />
      <circle cx={x} cy={y} r={1.2} fill={PARCH_2} />
    </g>
  );
}

function CoatOfArms({
  x, y, char, tone,
}: { x: number; y: number; char: string; tone: string }) {
  const w = 18, h = 22;
  const path =
    `M ${x - w / 2} ${y - h / 2} L ${x + w / 2} ${y - h / 2} L ${x + w / 2} ${y + h / 4}` +
    ` Q ${x + w / 2} ${y + h / 2}, ${x} ${y + h / 2}` +
    ` Q ${x - w / 2} ${y + h / 2}, ${x - w / 2} ${y + h / 4} Z`;
  return (
    <g>
      <path d={path}
        fill={PARCH}
        stroke={tone}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d={`M ${x - w / 2 + 2} ${y - h / 2 + 4} L ${x + w / 2 - 2} ${y + h / 4 - 1}`}
        stroke={tone}
        strokeWidth={1}
        opacity={0.65}
      />
      <text x={x} y={y + 4} textAnchor="middle"
        style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 9, letterSpacing: '0.04em', fill: tone }}>
        {char}
      </text>
    </g>
  );
}

function FilligreeFill({
  cell, seed, tone,
}: { cell: TerritoryCellShape; seed: number; tone: string }) {
  const dots = useMemo(() => {
    const out: Array<{ x: number; y: number; kind: 'dot' | 'cross' }> = [];
    const count = 4 + (seed % 3);
    for (let i = 0; i < count; i++) {
      const t = rand(seed + i * 7) * Math.PI * 2;
      const rr = rand(seed + i * 13) * cell.r * 0.6;
      out.push({
        x: cell.cx + Math.cos(t) * rr,
        y: cell.cy + Math.sin(t) * rr,
        kind: rand(seed + i * 17) < 0.7 ? 'dot' : 'cross',
      });
    }
    return out;
  }, [cell, seed]);
  return (
    <g aria-hidden opacity={0.35}>
      {dots.map((dot, i) =>
        dot.kind === 'dot' ? (
          <circle key={i} cx={dot.x} cy={dot.y} r={0.9} fill={tone} />
        ) : (
          <g key={i} transform={`translate(${dot.x},${dot.y})`}>
            <line x1={-2} y1={0} x2={2} y2={0} stroke={tone} strokeWidth={0.7} />
            <line x1={0} y1={-2} x2={0} y2={2} stroke={tone} strokeWidth={0.7} />
          </g>
        ),
      )}
    </g>
  );
}

// ===========================================================================
// SeaMonster — sea-corner waver. Only mounted when at-risk territories exist —
// the classical cartography "Here be dragons" idiom.
// ===========================================================================

function SeaMonster({
  cornerX, cornerY, variant,
}: { cornerX: number; cornerY: number; variant: 'dragon' | 'kraken' }) {
  return (
    <motion.g
      transform={`translate(${cornerX},${cornerY})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.78 }}
      transition={{ duration: 0.6, delay: 0.7 }}
    >
      <motion.g
        animate={{ rotate: [-2.5, 2.5, -2.5] }}
        transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
        style={{ transformOrigin: '0px 0px' }}
      >
        {variant === 'dragon' ? <DragonShape /> : <KrakenShape />}
        {variant === 'dragon' && (
          <text x={20} y={48}
            style={{
              fontFamily: ITAL, fontStyle: 'italic', fontSize: 9,
              letterSpacing: '0.16em', fill: tint('var(--wp-danger)', 75),
            }}>
            hic sunt dracones
          </text>
        )}
      </motion.g>
    </motion.g>
  );
}

function DragonShape() {
  const fill = tint('var(--wp-danger)', 60);
  const stroke = tint('var(--wp-danger)', 80);
  const body = tint('var(--wp-danger)', 75);
  const fin = tint('var(--wp-danger)', 65);
  return (
    <g>
      <path d="M 0 30 Q 12 18, 24 30 T 48 30 T 72 30"
        fill="none" stroke={body} strokeWidth={2} strokeLinecap="round" />
      <path d="M 72 30 Q 80 26 84 30 Q 80 36 72 30 Z"
        fill={fill} stroke={stroke} strokeWidth={1.2} />
      <circle cx={78} cy={29} r={0.8} fill="var(--wp-surface)" />
      <path d="M 12 18 L 14 12 L 18 18 M 36 26 L 38 20 L 42 26 M 60 26 L 62 20 L 66 26"
        fill="none" stroke={fin} strokeWidth={1} />
      <path d="M 0 30 L -8 22 L -4 30 L -8 38 Z"
        fill={tint('var(--wp-danger)', 55)} stroke={body} strokeWidth={1} />
    </g>
  );
}

function KrakenShape() {
  const mantle = tint('var(--wp-danger)', 50);
  const stroke = tint('var(--wp-danger)', 78);
  const tent = tint('var(--wp-danger)', 70);
  return (
    <g>
      <ellipse cx={28} cy={22} rx={16} ry={10}
        fill={mantle} stroke={stroke} strokeWidth={1.2} />
      <circle cx={32} cy={20} r={1.6}
        fill="var(--wp-surface)" stroke={tint('var(--wp-danger)', 90)} strokeWidth={0.6} />
      {[
        'M 16 30 Q 8 38 14 46 Q 18 42 16 38',
        'M 22 32 Q 18 44 26 50 Q 28 44 24 40',
        'M 30 34 Q 32 46 38 50 Q 36 44 34 40',
        'M 38 32 Q 46 42 44 50 Q 40 46 40 40',
        'M 44 30 Q 54 36 52 46 Q 46 44 46 38',
      ].map((d, i) => (
        <path key={i} d={d} fill="none" stroke={tent} strokeWidth={1.6} strokeLinecap="round" />
      ))}
    </g>
  );
}

// ===========================================================================
// WindCherub — corner ornament with puffed cheeks and wind streaks.
// ===========================================================================

function WindCherub({ cx, cy }: { cx: number; cy: number }) {
  const cloudFill = surfaceTint('var(--wp-warning)', 14);
  const cloudStroke = tint('var(--wp-accent)', 55);
  const faceFill = surfaceTint('var(--wp-warning)', 18);
  const faceStroke = tint('var(--wp-accent)', 70);
  const inkLine = tint('var(--wp-accent)', 80);
  const cheekFill = tint('var(--wp-accent-2)', 35);
  const cheekStroke = tint('var(--wp-accent)', 65);
  const mouthFill = tint('var(--wp-accent)', 70);
  return (
    <motion.g
      transform={`translate(${cx},${cy})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.72 }}
      transition={{ duration: 0.6, delay: 0.55 }}
    >
      <path
        d="M -28 0 Q -32 -16 -16 -18 Q -8 -28 6 -22 Q 18 -28 24 -16 Q 36 -10 28 6 Q 30 18 14 18 Q 0 24 -10 18 Q -28 18 -28 0 Z"
        fill={cloudFill} stroke={cloudStroke} strokeWidth={1.2}
      />
      <circle cx={0} cy={-2} r={14}
        fill={faceFill} stroke={faceStroke} strokeWidth={1.3} />
      <path d="M -5 -5 Q -3 -3 -1 -5 M 1 -5 Q 3 -3 5 -5"
        stroke={inkLine} strokeWidth={1} fill="none" strokeLinecap="round" />
      <motion.circle
        cx={-9} cy={2} r={3.5}
        fill={cheekFill} stroke={cheekStroke} strokeWidth={0.8}
        animate={{ r: [3, 4.2, 3] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.circle
        cx={9} cy={2} r={3.5}
        fill={cheekFill} stroke={cheekStroke} strokeWidth={0.8}
        animate={{ r: [3, 4.2, 3] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, delay: 0.3 }}
      />
      <ellipse cx={0} cy={5} rx={2.2} ry={2.6} fill={mouthFill} />
      {[0, 1, 2].map((i) => (
        <motion.path
          key={i}
          d={`M 4 ${6 + i * 2} Q ${20 + i * 6} ${10 + i * 4}, ${40 + i * 8} ${14 + i * 6}`}
          fill="none"
          stroke={tint('var(--wp-accent)', 55)}
          strokeWidth={1}
          strokeLinecap="round"
          strokeDasharray="2 4"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }}
        />
      ))}
    </motion.g>
  );
}

// ===========================================================================
// TerritoryDetailCartouche — slides out beneath the map on cell select.
//   Top row: shield + name + close button
//   Body cols: Crown record · Royal correspondence
//   Footer: wax-seal action buttons
// ===========================================================================

function TerritoryDetailCartouche({
  sub, onClose,
}: { sub: AgencyWorkspaceData['subClients'][number]; onClose: () => void }) {
  const tone = STATUS_VAR[sub.status];
  // Synthesise three "royal correspondence" lines deterministically from the
  // sub's data. In a live render this would come from a query — fine here.
  const correspondence = useMemo(() => [
    { when: sub.lastActiveAgo, verb: OLD_VERBS.sent,    target: 'a Northwind herald',     sigil: '✉' },
    { when: '2h prior',         verb: OLD_VERBS.reply,   target: 'the Helix scriptorium',  sigil: '↵' },
    { when: '5h prior',         verb: OLD_VERBS.warmth,  target: 'the apprentice mailbox', sigil: '🜂' },
  ], [sub.lastActiveAgo]);
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.99 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-4 overflow-hidden rounded-2xl border"
      style={{
        background: `linear-gradient(180deg, ${surfaceTint('var(--wp-warning)', 8)} 0%, ${surfaceTint('var(--wp-warning)', 4)} 100%)`,
        borderColor: `color-mix(in srgb, ${tone} 35%, var(--wp-border))`,
      }}
    >
      <CartoucheBand position="top" />
      <div className="relative px-5 py-5 sm:px-7">
        <div className="mb-3 flex items-start gap-3">
          {/* Coat-of-arms preview */}
          <div
            className="relative grid h-14 w-12 shrink-0 place-items-center rounded-md"
            style={{
              background: PARCH_2,
              border: `1px solid ${tone}`,
              clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
            }}
            aria-hidden
          >
            <span className="text-[16px] font-bold" style={{ fontFamily: SERIF, color: tone }}>
              {sub.logoChar}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[10px] uppercase tracking-[0.28em]"
                    style={{ fontFamily: SERIF, color: 'var(--wp-text-faint)' }}>
                The realm of
              </span>
              <h3 className="text-[22px]"
                  style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text)', fontWeight: 700 }}>
                {sub.name}
              </h3>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{
                  color: tone,
                  background: tint(tone, 14),
                  border: `1px solid ${tint(tone, 40)}`,
                }}>
                {STATUS_LABEL[sub.status]}
              </span>
            </div>
            <p className="mt-1 text-xs"
               style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}>
              Bearing the seal of {sub.ownerEmail} · {sub.createdAgo} · {sub.lastActiveAgo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full transition-colors"
            style={{
              color: 'var(--wp-text-dim)',
              border: '1px solid var(--wp-border)',
              background: PARCH,
            }}
            aria-label="Close territory record"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CrownRecord sub={sub} tone={tone} />
          <RoyalCorrespondence entries={correspondence} tone={tone} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <WaxSeal label="View capital" icon={Building2} tone="var(--wp-accent)" />
          <WaxSeal label="Open correspondence" icon={Mail} tone="var(--wp-accent-2)" />
          <WaxSeal label="Issue charter" icon={Feather} tone="var(--wp-accent-3)" />
          {sub.status === 'at_risk' && (
            <WaxSeal label="Send reinforcements" icon={Swords} tone="var(--wp-danger)" />
          )}
        </div>
      </div>
      <CartoucheBand position="bottom" />
    </motion.section>
  );
}

function CrownRecord({
  sub, tone,
}: { sub: AgencyWorkspaceData['subClients'][number]; tone: string }) {
  const dailySends = Math.round(sub.mailboxCount * 6 + sub.avgWarmth * 0.6);
  return (
    <div className="rounded-xl border p-4"
         style={{ background: PARCH, borderColor: INK }}>
      <h4 className="mb-3 text-[11px] uppercase tracking-[0.28em]"
          style={{ fontFamily: SERIF, color: 'var(--wp-accent)' }}>
        Crown record
      </h4>
      <dl className="space-y-2">
        <RecordLine label="Capital"          value={sub.ownerEmail.split('@')[1] ?? sub.ownerEmail} mono />
        <RecordLine label="Population"       value={`${sub.mailboxCount} vessels of correspondence`} />
        <RecordLine label="Annual yield"     value={`${dailySends} missives per day`} />
        <RecordLine label="Status of the realm" value={STATUS_LABEL[sub.status].toUpperCase()} highlight={tone} />
        <RecordLine label="Charter tier"     value={sub.plan} />
        <RecordLine label="Coffers"          value={`${formatMoney(sub.monthlyMrrUsd)} per moon`} highlight="var(--wp-accent-2)" />
      </dl>
    </div>
  );
}

function RecordLine({
  label, value, mono, highlight,
}: { label: string; value: string; mono?: boolean; highlight?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-[10px] uppercase tracking-[0.22em]"
          style={{ fontFamily: SERIF, color: 'var(--wp-text-faint)' }}>
        {label}
      </dt>
      <dd className={mono ? 'font-mono text-xs' : 'text-xs'}
          style={{
            color: highlight ?? 'var(--wp-text)',
            fontWeight: highlight ? 600 : 500,
            fontFamily: mono ? undefined : ITAL,
            fontStyle: mono ? undefined : 'italic',
          }}>
        {value}
      </dd>
    </div>
  );
}

function RoyalCorrespondence({
  entries, tone,
}: {
  entries: Array<{ when: string; verb: string; target: string; sigil: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-xl border p-4"
         style={{ background: PARCH, borderColor: INK }}>
      <h4 className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.28em]"
          style={{ fontFamily: SERIF, color: 'var(--wp-accent)' }}>
        <Scroll className="h-3 w-3" />
        Royal correspondence
      </h4>
      <ul className="space-y-2">
        {entries.map((e, i) => (
          <li key={i}
              className="flex items-start gap-3 rounded-lg border px-3 py-2"
              style={{ background: PARCH_2, borderColor: tint('var(--wp-accent)', 18) }}>
            <span aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px]"
                  style={{
                    background: tint(tone, 12),
                    border: `1px solid ${tint(tone, 40)}`,
                    color: tone,
                  }}>
              {e.sigil}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-snug"
                 style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text)' }}>
                A scroll was <span style={{ color: tone, fontWeight: 700 }}>{e.verb}</span>{' '}
                {e.target}.
              </p>
              <p className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
                {e.when}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WaxSeal({
  label, icon: Icon, tone,
}: { label: string; icon: typeof Building2; tone: string }) {
  return (
    <button
      type="button"
      className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-transform hover:-translate-y-0.5"
      style={{
        color: tone,
        background: tint(tone, 10),
        border: `1px solid ${tint(tone, 45)}`,
      }}
    >
      <span className="grid h-5 w-5 place-items-center rounded-full"
            style={{
              background: tint(tone, 22),
              border: `1px solid ${tint(tone, 65)}`,
            }}>
        <Icon className="h-3 w-3" />
      </span>
      <span style={{ fontFamily: SERIF, letterSpacing: '0.06em' }}>{label}</span>
    </button>
  );
}

// ===========================================================================
// AtlasFooterRail — three-card row below the map.
//   Charter office (features) · Privy council (team) · Royal seals (keys+hooks)
// ===========================================================================

function AtlasFooterRail({ data }: { data: AgencyWorkspaceData }) {
  const liveWebhookCount = data.webhooks.filter((w) => w.status === 'live').length;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
      className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12"
    >
      <div className="md:col-span-4"><CharterOffice features={data.features} /></div>
      <div className="md:col-span-4"><PrivyCouncil team={data.team} /></div>
      <div className="md:col-span-4">
        <RoyalSeals apiKeys={data.apiKeys} webhooks={data.webhooks} liveWebhookCount={liveWebhookCount} />
      </div>
    </motion.div>
  );
}

/** Shared parchment-panel wrapper for the three footer cards. */
function FooterPanel({
  children,
}: { children: React.ReactNode }) {
  return (
    <article
      className="h-full rounded-2xl border p-4"
      style={{
        background: `linear-gradient(170deg, ${surfaceTint('var(--wp-warning)', 6)} 0%, ${surfaceTint('var(--wp-warning)', 3)} 100%)`,
        borderColor: INK,
      }}
    >
      {children}
    </article>
  );
}

function PanelHeader({
  icon: Icon, title, aside,
}: { icon: typeof Scroll; title: string; aside?: React.ReactNode }) {
  return (
    <header className="mb-3 flex items-center justify-between">
      <h3
        className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em]"
        style={{ fontFamily: SERIF, color: 'var(--wp-accent)' }}
      >
        <Icon className="h-3 w-3" />
        {title}
      </h3>
      {aside}
    </header>
  );
}

function CharterOffice({ features }: { features: AgencyWorkspaceData['features'] }) {
  const dom = features.customDomain;
  const domTone =
    dom.status === 'verified' ? 'var(--wp-success)'
      : dom.status === 'pending' ? 'var(--wp-warning)'
      : dom.status === 'failed' ? 'var(--wp-danger)'
      : 'var(--wp-text-dim)';
  return (
    <FooterPanel>
      <PanelHeader
        icon={Scroll}
        title="Charter office"
        aside={
          <span className="text-[10px]" style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text-dim)' }}>
            agency-only privileges
          </span>
        }
      />
      <ul className="space-y-2">
        <CharterRow icon={Sparkles}
          label="White-label" enabled={features.whiteLabel.enabled}
          value={features.whiteLabel.brandName ?? 'Pending'} tone="var(--wp-accent)" />
        <CharterRow icon={Globe2}
          label="Custom domain" enabled={dom.enabled}
          value={dom.domain ?? 'Not configured'} tone={domTone} />
        <CharterRow icon={Shield}
          label="Crown pool" enabled={features.dedicatedPool.enabled}
          value={features.dedicatedPool.enabled
            ? `${formatNumber(features.dedicatedPool.memberCount)} peers`
            : 'Shared pool'}
          tone="var(--wp-accent-2)" />
      </ul>
    </FooterPanel>
  );
}

function CharterRow({
  icon: Icon, label, enabled, value, tone,
}: {
  icon: typeof Sparkles; label: string; enabled: boolean; value: string; tone: string;
}) {
  return (
    <li
      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ background: PARCH, borderColor: tint('var(--wp-accent)', 18) }}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{ color: tone, background: tint(tone, 14), border: `1px solid ${tint(tone, 35)}` }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.22em]"
           style={{ fontFamily: SERIF, color: 'var(--wp-text-dim)' }}>
          {label}
        </p>
        <p className="truncate text-xs"
           style={{
             fontFamily: ITAL, fontStyle: 'italic',
             color: enabled ? 'var(--wp-text)' : 'var(--wp-text-faint)',
           }}>
          {value}
        </p>
      </div>
      <span
        aria-label={enabled ? 'enabled' : 'disabled'}
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: enabled ? tone : 'var(--wp-text-faint)',
          boxShadow: enabled ? `0 0 8px ${tint(tone, 60)}` : 'none',
        }}
      />
    </li>
  );
}

function PrivyCouncil({ team }: { team: AgencyWorkspaceData['team'] }) {
  return (
    <FooterPanel>
      <PanelHeader
        icon={Users}
        title="Privy council"
        aside={
          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--wp-text-dim)' }}>
            {team.length} retainers
          </span>
        }
      />
      {team.length === 0 ? (
        <p className="rounded-lg border px-3 py-4 text-center text-xs"
           style={{
             background: PARCH,
             borderColor: tint('var(--wp-accent)', 18),
             color: 'var(--wp-text-dim)',
             fontFamily: ITAL, fontStyle: 'italic',
           }}>
          The throne sits empty of counsellors.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {team.map((m) => <CouncilEntry key={m.id} member={m} />)}
        </ul>
      )}
    </FooterPanel>
  );
}

function CouncilEntry({
  member,
}: { member: AgencyWorkspaceData['team'][number] }) {
  const initials = member.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const tone =
    member.role === 'owner' ? 'var(--wp-warning)'
      : member.role === 'admin' ? 'var(--wp-accent)'
      : 'var(--wp-text-dim)';
  const role =
    member.role === 'owner' ? 'Sovereign'
      : member.role === 'admin' ? 'Minister'
      : 'Scribe';
  return (
    <li
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{ background: PARCH, borderColor: tint('var(--wp-accent)', 18) }}
      title={`${member.name} (${role}) · ${member.email} · ${member.lastActiveAgo} · manages ${member.subClientsManaged} territories`}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[9px] font-semibold"
        style={{
          background: tint(tone, 14),
          border: `1px solid ${tint(tone, 40)}`,
          color: tone,
        }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold"
           style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text)' }}>
          {member.name}
        </p>
        <p className="font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
          {role} · {member.lastActiveAgo}
        </p>
      </div>
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums"
        style={{
          color: tone,
          background: tint(tone, 12),
          border: `1px solid ${tint(tone, 30)}`,
        }}
      >
        {member.subClientsManaged}
      </span>
    </li>
  );
}

function RoyalSeals({
  apiKeys, webhooks, liveWebhookCount,
}: {
  apiKeys: AgencyWorkspaceData['apiKeys'];
  webhooks: AgencyWorkspaceData['webhooks'];
  liveWebhookCount: number;
}) {
  return (
    <FooterPanel>
      <PanelHeader
        icon={Key}
        title="Royal seals"
        aside={
          <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--wp-text-dim)' }}>
            {apiKeys.length} keys · {liveWebhookCount}/{webhooks.length} live
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-1.5">
        {apiKeys.slice(0, 3).map((k) => <KeyRow key={k.id} k={k} />)}
        <div className="my-1 h-px" style={{ background: tint('var(--wp-accent)', 20) }} />
        {webhooks.slice(0, 2).map((w) => <WebhookRow key={w.id} w={w} />)}
      </div>
    </FooterPanel>
  );
}

function KeyRow({ k }: { k: AgencyWorkspaceData['apiKeys'][number] }) {
  const tone =
    k.scope === 'admin' ? 'var(--wp-accent-3)'
      : k.scope === 'write' ? 'var(--wp-accent)'
      : 'var(--wp-text-dim)';
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{ background: PARCH, borderColor: tint('var(--wp-accent)', 18) }}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{ color: tone, background: tint(tone, 14), border: `1px solid ${tint(tone, 38)}` }}
      >
        <Key className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold"
           style={{ fontFamily: ITAL, fontStyle: 'italic', color: 'var(--wp-text)' }}>
          {k.label}
        </p>
        <p className="font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
          {k.masked} · {k.lastUsedAgo}
        </p>
      </div>
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]"
        style={{ color: tone, background: tint(tone, 10), border: `1px solid ${tint(tone, 30)}` }}
      >
        {k.scope}
      </span>
    </div>
  );
}

function WebhookRow({ w }: { w: AgencyWorkspaceData['webhooks'][number] }) {
  const tone = w.status === 'live' ? 'var(--wp-success)' : 'var(--wp-text-dim)';
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2"
      style={{ background: PARCH, borderColor: tint('var(--wp-accent)', 18) }}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{ color: tone, background: tint(tone, 14), border: `1px solid ${tint(tone, 38)}` }}
      >
        <Webhook className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[11px]" style={{ color: 'var(--wp-text)' }}>{w.url}</p>
        <p className="font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
          {w.events.length} events
        </p>
      </div>
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]"
        style={{ color: tone, background: tint(tone, 12), border: `1px solid ${tint(tone, 30)}` }}
      >
        {w.status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton fallback — mirrors AGENCY_WORKSPACE_SKELETON_C1 so the live adapter
// can swap variants without changing fixture wiring.
// ---------------------------------------------------------------------------

export const AGENCY_WORKSPACE_SKELETON_W3: AgencyWorkspaceData = {
  agency: {
    name: 'Your empire',
    plan: 'Agency',
    ownerEmail: '',
    region: 'us-east-1',
    slug: 'your-empire',
  },
  features: {
    whiteLabel: { enabled: false, brandName: null, hasLogo: false },
    customDomain: { enabled: false, domain: null, status: 'not_set' },
    dedicatedPool: { enabled: false, poolName: null, memberCount: 0 },
  },
  subClients: [],
  team: [],
  apiKeys: [],
  webhooks: [],
};
