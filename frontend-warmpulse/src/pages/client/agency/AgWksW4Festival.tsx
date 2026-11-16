import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  DollarSign,
  Flame,
  Globe,
  Inbox,
  Mail,
  MapPin,
  Megaphone,
  Music,
  Palette,
  Radio,
  Shield,
  Sparkles,
  Star,
  Tent,
  Ticket,
  Volume2,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

import type { AgencyWorkspaceData } from '@/pages/client/agency/AgWksC1Federation';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * AgWksW4Festival — Agency-tier WORKSPACE surface #W4, "Festival Lineup Poster".
 *
 * Concept: the agency portfolio rendered as a Coachella / Glastonbury-style
 * festival lineup poster. The agency itself IS the festival (e.g. "NORTHWIND
 * FEST 2026 · 3-day deliverability summit"). Sub-clients are bands billed in
 * descending typography:
 *   - 1 HEADLINER (largest mailbox count) → top-billing display type
 *   - 2 CO-HEADLINERS → still huge but visibly subordinate
 *   - 3-4 MID-TIER BANDS → grid of band cards
 *   - REMAINING OPENERS → multi-column small-type list at the bottom
 *
 * Each band has a STAGE (mapped to peer pool / status tier) and a SET TIME
 * (warmup window). A horizontal STAGES LEGEND at the bottom maps the 4 stages
 * to capacities and current load. A festival info FOOTER carries the 3-day
 * schedule summary, "backstage" recent events, and a sponsors strip.
 *
 * Visual language: bold festival-poster typography hierarchy, neon orange
 * glow effects on the headliner, dark surfaces with festival-lighting blooms.
 * No purple / blue / cyan ever — Shailog orange palette only.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props. The
 * harness mounts it prop-less; every value comes from the inline MOCK const.
 * Renders only page content; the shell supplies the sidebar / chrome.
 */

// ---------------------------------------------------------------------------
// MOCK content — Northwind Fest 2026, 8 bands on the bill.
// Pulls Helix, Nimbus, Orion, Vega, etc. — the names common to other AgWks*
// mocks. Activity volume = mailboxCount, which drives the band-tier ranking.
// ---------------------------------------------------------------------------

const MOCK: AgencyWorkspaceData = {
  agency: {
    name: 'Northwind Agency',
    plan: 'Agency',
    ownerEmail: 'you@northwind.agency',
    region: 'us-east-1',
    slug: 'northwind-fest',
  },
  features: {
    whiteLabel: {
      enabled: true,
      brandName: 'Northwind Mail Lab',
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
  subClients: [
    {
      id: 'sc-helix',
      name: 'Helix Analytics',
      logoChar: 'HA',
      ownerEmail: 'ops@helix-analytics.io',
      plan: 'Pro Plus',
      mailboxCount: 22,
      teamCount: 6,
      avgWarmth: 91,
      status: 'healthy',
      monthlyMrrUsd: 1480,
      createdAgo: 'joined 14 mo ago',
      lastActiveAgo: '2m ago',
    },
    {
      id: 'sc-nimbus',
      name: 'Nimbus Cloud',
      logoChar: 'NC',
      ownerEmail: 'team@nimbus.cloud',
      plan: 'Pro Plus',
      mailboxCount: 18,
      teamCount: 5,
      avgWarmth: 88,
      status: 'healthy',
      monthlyMrrUsd: 1180,
      createdAgo: 'joined 11 mo ago',
      lastActiveAgo: '5m ago',
    },
    {
      id: 'sc-orion',
      name: 'Orion Sales',
      logoChar: 'OS',
      ownerEmail: 'gtm@orion-sales.co',
      plan: 'Pro Plus',
      mailboxCount: 15,
      teamCount: 4,
      avgWarmth: 85,
      status: 'healthy',
      monthlyMrrUsd: 980,
      createdAgo: 'joined 8 mo ago',
      lastActiveAgo: '8m ago',
    },
    {
      id: 'sc-vega',
      name: 'Vega Outbound',
      logoChar: 'VO',
      ownerEmail: 'hello@vega-outbound.io',
      plan: 'Pro',
      mailboxCount: 12,
      teamCount: 4,
      avgWarmth: 81,
      status: 'healthy',
      monthlyMrrUsd: 720,
      createdAgo: 'joined 5 mo ago',
      lastActiveAgo: '14m ago',
    },
    {
      id: 'sc-quasar',
      name: 'Quasar Growth',
      logoChar: 'QG',
      ownerEmail: 'founders@quasar.gg',
      plan: 'Pro',
      mailboxCount: 10,
      teamCount: 3,
      avgWarmth: 78,
      status: 'healthy',
      monthlyMrrUsd: 540,
      createdAgo: 'joined 4 mo ago',
      lastActiveAgo: '22m ago',
    },
    {
      id: 'sc-lyra',
      name: 'Lyra Studio',
      logoChar: 'LS',
      ownerEmail: 'mail@lyra.studio',
      plan: 'Pro',
      mailboxCount: 8,
      teamCount: 3,
      avgWarmth: 74,
      status: 'warming',
      monthlyMrrUsd: 380,
      createdAgo: 'joined 3 mo ago',
      lastActiveAgo: '38m ago',
    },
    {
      id: 'sc-pixel',
      name: 'Pixel Forge',
      logoChar: 'PF',
      ownerEmail: 'team@pixel-forge.dev',
      plan: 'Starter',
      mailboxCount: 6,
      teamCount: 2,
      avgWarmth: 62,
      status: 'warming',
      monthlyMrrUsd: 240,
      createdAgo: 'joined 6 wk ago',
      lastActiveAgo: '1h ago',
    },
    {
      id: 'sc-atlas',
      name: 'Atlas Bio',
      logoChar: 'AB',
      ownerEmail: 'sales@atlas-bio.com',
      plan: 'Starter',
      mailboxCount: 5,
      teamCount: 1,
      avgWarmth: 34,
      status: 'at_risk',
      monthlyMrrUsd: 180,
      createdAgo: 'joined 11 wk ago',
      lastActiveAgo: '3h ago',
    },
  ],
  team: [
    {
      id: 'tm-owner',
      name: 'Yusra Tahir',
      email: 'you@northwind.agency',
      role: 'owner',
      lastActiveAgo: 'now',
      subClientsManaged: 3,
    },
    {
      id: 'tm-admin-a',
      name: 'Mariana Castro',
      email: 'mariana@northwind.agency',
      role: 'admin',
      lastActiveAgo: '12m ago',
      subClientsManaged: 3,
    },
    {
      id: 'tm-admin-b',
      name: 'Jaime Okafor',
      email: 'jaime@northwind.agency',
      role: 'admin',
      lastActiveAgo: '34m ago',
      subClientsManaged: 2,
    },
    {
      id: 'tm-mem-a',
      name: 'Felix Berg',
      email: 'felix@northwind.agency',
      role: 'member',
      lastActiveAgo: '1h ago',
      subClientsManaged: 2,
    },
    {
      id: 'tm-mem-b',
      name: 'Priya Subramanian',
      email: 'priya@northwind.agency',
      role: 'member',
      lastActiveAgo: '4h ago',
      subClientsManaged: 1,
    },
  ],
  apiKeys: [
    {
      id: 'ak-prod',
      label: 'Production · ingestion',
      masked: 'wp_live_••••_8Fk2',
      scope: 'write',
      lastUsedAgo: '4m ago',
    },
    {
      id: 'ak-readonly',
      label: 'Reporting · BI dashboards',
      masked: 'wp_live_••••_Lp93',
      scope: 'read',
      lastUsedAgo: '38m ago',
    },
    {
      id: 'ak-admin',
      label: 'Internal dashboard · admin',
      masked: 'wp_live_••••_Qx41',
      scope: 'admin',
      lastUsedAgo: '2h ago',
    },
  ],
  webhooks: [
    {
      id: 'wh-zapier',
      url: 'hooks.northwind.agency/warmpulse/events',
      events: ['mailbox.paused', 'warmth.alert', 'bounce.spike'],
      status: 'live',
    },
    {
      id: 'wh-slack',
      url: 'ops.northwind.agency/slack/relay',
      events: ['peer.failed', 'dns.break'],
      status: 'paused',
    },
  ],
};

// ---------------------------------------------------------------------------
// Festival domain types (NOT exported — local to this candidate file)
// ---------------------------------------------------------------------------

type SubClient = AgencyWorkspaceData['subClients'][number];
type SubClientStatus = SubClient['status'];

/** Lineup tier — drives typography weight & layout density. */
type BandTier = 'headliner' | 'co-headliner' | 'mid' | 'opener';

/** Stage = peer pool slice. There are 4 stages on the festival map. */
type StageId = 'main' | 'tent2' | 'pavilion' | 'lounge';

interface StageMeta {
  id: StageId;
  name: string;
  /** Decorative subtitle for the legend card. */
  blurb: string;
  /** Capacity (= peer mailbox cap mapped onto the stage). */
  capacity: number;
  /** Status tier this stage hosts (drives stage card tinting). */
  tier: SubClientStatus | 'mixed';
}

const STAGES: StageMeta[] = [
  {
    id: 'main',
    name: 'MAIN STAGE',
    blurb: 'Headliner inboxes · highest reputation',
    capacity: 96,
    tier: 'healthy',
  },
  {
    id: 'tent2',
    name: 'TENT 2',
    blurb: 'Pro Plus peers · second-billed acts',
    capacity: 72,
    tier: 'healthy',
  },
  {
    id: 'pavilion',
    name: 'OUTDOOR PAVILION',
    blurb: 'Warming bands · ramp-up cohort',
    capacity: 64,
    tier: 'warming',
  },
  {
    id: 'lounge',
    name: 'ACOUSTIC LOUNGE',
    blurb: 'New & at-risk acts · gentle reps',
    capacity: 48,
    tier: 'mixed',
  },
];

/**
 * Map a sub-client's STATUS to a STAGE assignment. Healthy headliner/co-headliner
 * acts get MAIN STAGE; healthy mid-tier acts get TENT 2; warming acts go to the
 * Outdoor Pavilion; at-risk and inactive acts retreat to the Acoustic Lounge.
 */
function stageFor(sub: SubClient, tier: BandTier): StageId {
  if (sub.status === 'at_risk' || sub.status === 'inactive') return 'lounge';
  if (sub.status === 'warming') return 'pavilion';
  if (tier === 'headliner' || tier === 'co-headliner') return 'main';
  return 'tent2';
}

/**
 * Stable, mock-only "set time" for a band. Headliners get the prime late-night
 * slot; co-headliners get evening; mid-tier bands get late-afternoon; openers
 * get the matinee window.
 *
 * Day rotates with band index modulo 3 so the lineup spreads across all three
 * festival days (the schedule strip relies on this distribution).
 */
function setTimeFor(tier: BandTier, dayIndex: number): {
  day: 'DAY 1' | 'DAY 2' | 'DAY 3';
  time: string;
} {
  const day: 'DAY 1' | 'DAY 2' | 'DAY 3' =
    dayIndex % 3 === 0 ? 'DAY 1' : dayIndex % 3 === 1 ? 'DAY 2' : 'DAY 3';
  const time =
    tier === 'headliner'
      ? '22:30'
      : tier === 'co-headliner'
        ? '20:45'
        : tier === 'mid'
          ? '17:30'
          : '14:15';
  return { day, time };
}

// ---------------------------------------------------------------------------
// Mocked "backstage" alerts — festival news-feed copy mapped onto the
// real engine events the agency owner cares about.
// ---------------------------------------------------------------------------

interface BackstageAlert {
  id: string;
  kind: 'crew' | 'sound' | 'gate';
  /** Plain headline-style summary. */
  headline: string;
  /** Sub-line with the actor + timestamp. */
  sub: string;
  /** "DAY N · HH:MM" decorative marker. */
  marker: string;
}

const BACKSTAGE_ALERTS: BackstageAlert[] = [
  {
    id: 'al-1',
    kind: 'crew',
    headline: 'Helix Analytics warmth crossed 90 — encore-ready',
    sub: 'Day-2 main stage · monitored by Mariana C.',
    marker: 'DAY 2 · 09:14',
  },
  {
    id: 'al-2',
    kind: 'sound',
    headline: 'Atlas Bio DNS soundcheck failed — DKIM not found',
    sub: 'Acoustic Lounge · routed to backstage triage',
    marker: 'DAY 1 · 18:47',
  },
  {
    id: 'al-3',
    kind: 'gate',
    headline: 'Lyra Studio onboarded 2 new mailboxes at gate',
    sub: 'Pavilion · welcome reps queued for Day-3 opener',
    marker: 'DAY 3 · 11:02',
  },
];

const ALERT_ICON: Record<BackstageAlert['kind'], typeof Megaphone> = {
  crew: Megaphone,
  sound: Volume2,
  gate: Ticket,
};

const ALERT_TONE: Record<BackstageAlert['kind'], 'accent' | 'danger' | 'success'> = {
  crew: 'accent',
  sound: 'danger',
  gate: 'success',
};

// ---------------------------------------------------------------------------
// Token-only colour helpers — everything routes through CSS vars so the
// Shailog orange theme stays the single source of truth.
// ---------------------------------------------------------------------------

const TOKEN = {
  accent: 'var(--wp-accent)',
  accent2: 'var(--wp-accent-2)',
  accent3: 'var(--wp-accent-3)',
  success: 'var(--wp-success)',
  warning: 'var(--wp-warning)',
  danger: 'var(--wp-danger)',
  surface: 'var(--wp-surface)',
  surface2: 'var(--wp-surface-2)',
  border: 'var(--wp-border)',
  text: 'var(--wp-text)',
  textDim: 'var(--wp-text-dim)',
  textFaint: 'var(--wp-text-faint)',
} as const;

/** Status → token colour for band-tier tinting. */
const STATUS_TOKEN: Record<SubClientStatus, string> = {
  healthy: TOKEN.accent,
  warming: TOKEN.warning,
  at_risk: TOKEN.danger,
  inactive: TOKEN.textFaint,
};

const STATUS_LABEL: Record<SubClientStatus, string> = {
  healthy: 'HEADLINING',
  warming: 'OPENING SET',
  at_risk: 'SOUNDCHECK',
  inactive: 'NO SHOW',
};

/** Tier → letter-spacing in em for tight Coachella-display. */
const TIER_TRACKING: Record<BandTier, string> = {
  headliner: '-0.05em',
  'co-headliner': '-0.045em',
  mid: '-0.035em',
  opener: '-0.02em',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgWksW4Festival(
  { data }: { data?: AgencyWorkspaceData } = {},
): JSX.Element {
  const d = data ?? MOCK;

  /**
   * Rank sub-clients by activity volume (mailboxCount) and slice into tiers:
   *   index 0           → HEADLINER
   *   index 1-2         → CO-HEADLINER
   *   index 3-6         → MID-TIER
   *   index 7+          → OPENER
   * Falls back gracefully when the portfolio is smaller.
   */
  const ranked = useMemo(
    () => [...d.subClients].sort((a, b) => b.mailboxCount - a.mailboxCount),
    [d.subClients],
  );
  const tiers = useMemo(() => assignTiers(ranked), [ranked]);
  const headliner = tiers.headliner ?? null;
  const coHeadliners = tiers.coHeadliners;
  const midBands = tiers.mid;
  const openers = tiers.openers;

  // Festival vital stats
  const totalSubs = d.subClients.length;
  const mailboxTotal = useMemo(
    () => d.subClients.reduce((acc, sc) => acc + sc.mailboxCount, 0),
    [d.subClients],
  );
  const sendsTotal = useMemo(
    () =>
      d.subClients.reduce(
        (acc, sc) => acc + sc.mailboxCount * 12, // mock send fan-out per mailbox
        0,
      ),
    [d.subClients],
  );
  const avgWarmth = useMemo(() => {
    if (d.subClients.length === 0) return 0;
    return Math.round(
      d.subClients.reduce((acc, sc) => acc + sc.avgWarmth, 0) /
        d.subClients.length,
    );
  }, [d.subClients]);

  // "Ticket" status — purely a poster-poster decoration that summarises
  // whether the agency's mailbox slots are oversubscribed.
  const ticket: 'SOLD OUT' | 'LIMITED' | 'ON SALE' =
    totalSubs >= 8 ? 'SOLD OUT' : totalSubs >= 5 ? 'LIMITED' : 'ON SALE';

  // Decorative festival year — kept stable for visual identity.
  const festYear = 2026;

  return (
    <div className="space-y-5">
      {/* 1. POSTER HEADER / FESTIVAL MASTHEAD */}
      <FestivalMasthead
        agencyName={d.agency.name}
        region={d.agency.region}
        ticket={ticket}
        festYear={festYear}
        plan={d.agency.plan}
      />

      {/* 2. HEADLINER BANNER — full-width neon spotlight */}
      <HeadlinerBanner band={headliner} />

      {/* 3. CO-HEADLINER ROW — two slightly-smaller acts */}
      <CoHeadlinerRow bands={coHeadliners} />

      {/* 4. MID-TIER BANDS — grid of band cards */}
      <MidTierGrid bands={midBands} />

      {/* 5. OPENERS LIST — multi-column small-type list */}
      <OpenerList bands={openers} totalSubs={totalSubs} />

      {/* 6. STAGES LEGEND — horizontal strip mapping stages to capacity */}
      <StagesLegend
        bands={ranked}
        tiers={tiers}
      />

      {/* 7. FESTIVAL INFO FOOTER — schedule + backstage news + sponsors */}
      <FestivalFooter
        data={d}
        ranked={ranked}
        tiers={tiers}
        mailboxTotal={mailboxTotal}
        sendsTotal={sendsTotal}
        avgWarmth={avgWarmth}
      />

      {/* Empty-state — only when no bands at all */}
      {totalSubs === 0 && <PosterEmptyState />}
    </div>
  );
}

export default AgWksW4Festival;

// ---------------------------------------------------------------------------
// Tier assignment — ranks the lineup top-down.
// ---------------------------------------------------------------------------

interface TierBundle {
  headliner: SubClient | null;
  coHeadliners: SubClient[];
  mid: SubClient[];
  openers: SubClient[];
}

function assignTiers(ranked: SubClient[]): TierBundle {
  if (ranked.length === 0) {
    return { headliner: null, coHeadliners: [], mid: [], openers: [] };
  }
  const head = ranked[0] ?? null;
  const co = ranked.slice(1, 3);
  const mid = ranked.slice(3, 7);
  const open = ranked.slice(7);
  return {
    headliner: head,
    coHeadliners: co,
    mid,
    openers: open,
  };
}

/** Look up which tier a band belongs to — used by the StagesLegend bucketing. */
function tierOf(sub: SubClient, t: TierBundle): BandTier {
  if (t.headliner && t.headliner.id === sub.id) return 'headliner';
  if (t.coHeadliners.some((s) => s.id === sub.id)) return 'co-headliner';
  if (t.mid.some((s) => s.id === sub.id)) return 'mid';
  return 'opener';
}

// ===========================================================================
// 1. FESTIVAL MASTHEAD
// ===========================================================================

function FestivalMasthead({
  agencyName,
  region,
  ticket,
  festYear,
  plan,
}: {
  agencyName: string;
  region: string;
  ticket: 'SOLD OUT' | 'LIMITED' | 'ON SALE';
  festYear: number;
  plan: string;
}) {
  // Strip "Agency" suffix so the poster reads as a brand-name festival.
  const festName = stripAgencySuffix(agencyName);
  return (
    <motion.header
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border bg-surface/60 backdrop-blur-xl"
      style={{
        borderColor: TOKEN.border,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 40px -16px rgba(242,101,34,0.25)',
      }}
    >
      {/* Backdrop blooms — festival lighting */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--wp-accent) 28%, transparent), transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/2 h-[360px] w-[360px] -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--wp-accent-3) 22%, transparent), transparent 60%)',
        }}
      />
      {/* Grid pattern */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
      >
        <defs>
          <pattern
            id="agwksw4-grid"
            x="0"
            y="0"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke={TOKEN.border}
              strokeWidth="1"
              strokeOpacity="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#agwksw4-grid)" />
      </svg>

      <div className="relative px-6 py-7 sm:px-9 sm:py-9">
        <div className="flex flex-wrap items-start justify-between gap-6">
          {/* LEFT: festival type system */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-text-dim">
              <Music className="h-3 w-3" style={{ color: TOKEN.accent }} />
              <span>PRESENTS</span>
              <span
                aria-hidden
                className="h-px w-10"
                style={{ background: TOKEN.border }}
              />
              <Badge variant="orange">
                <Sparkles className="h-3 w-3" />
                {plan}
              </Badge>
            </div>

            {/* GIANT FESTIVAL NAME */}
            <h1
              className="mt-3 select-none break-words leading-[0.86]"
              style={{
                fontSize: 'clamp(48px, 9vw, 124px)',
                fontWeight: 900,
                letterSpacing: '-0.045em',
                color: TOKEN.text,
                textShadow: `0 0 28px color-mix(in srgb, ${TOKEN.accent} 35%, transparent)`,
              }}
            >
              {festName.toUpperCase()}
              <span
                className="ml-3 align-baseline"
                style={{
                  color: TOKEN.accent,
                  textShadow: `0 0 36px color-mix(in srgb, ${TOKEN.accent} 70%, transparent)`,
                }}
              >
                FEST
              </span>
              <span
                className="ml-3 align-baseline tabular-nums"
                style={{
                  color: TOKEN.accent2,
                  textShadow: `0 0 32px color-mix(in srgb, ${TOKEN.accent2} 60%, transparent)`,
                }}
              >
                {festYear}
              </span>
            </h1>

            {/* Tagline */}
            <p
              className="mt-3 max-w-2xl text-[15px] sm:text-base"
              style={{ color: TOKEN.textDim }}
            >
              3-day deliverability summit · {region} · {festYear}
            </p>

            {/* Date strip */}
            <DateRangeStrip festYear={festYear} />
          </div>

          {/* RIGHT: festival mark + ticket pill */}
          <div className="flex shrink-0 flex-col items-end gap-3">
            <FestivalMark />
            <TicketPill ticket={ticket} />
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]"
              style={{
                borderColor: TOKEN.border,
                color: TOKEN.textDim,
              }}
            >
              <MapPin className="h-3 w-3" style={{ color: TOKEN.accent }} />
              {region}
            </span>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

function DateRangeStrip({ festYear }: { festYear: number }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.22em]">
      {[
        { day: 'FRI', date: 'OCT 16' },
        { day: 'SAT', date: 'OCT 17' },
        { day: 'SUN', date: 'OCT 18' },
      ].map((d) => (
        <span
          key={d.day}
          className="inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5"
          style={{
            borderColor: TOKEN.border,
            background: 'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
            color: TOKEN.text,
          }}
        >
          <span style={{ color: TOKEN.accent }}>{d.day}</span>
          <span style={{ color: TOKEN.textDim }}>{d.date}</span>
        </span>
      ))}
      <span
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 font-mono"
        style={{
          borderColor: TOKEN.border,
          color: TOKEN.textFaint,
        }}
      >
        <Calendar className="h-3 w-3" />
        {festYear} EDITION
      </span>
    </div>
  );
}

/**
 * Decorative festival mark — a hand-built SVG monogram that reads as a
 * concentric speaker / vinyl badge.
 */
function FestivalMark() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="relative grid h-20 w-20 place-items-center"
    >
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full">
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="none"
          stroke={TOKEN.accent}
          strokeOpacity="0.4"
          strokeWidth="1"
        />
        <circle
          cx="32"
          cy="32"
          r="24"
          fill="none"
          stroke={TOKEN.accent2}
          strokeOpacity="0.6"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <circle
          cx="32"
          cy="32"
          r="14"
          fill="none"
          stroke={TOKEN.accent}
          strokeOpacity="0.7"
          strokeWidth="1.2"
        />
        <circle cx="32" cy="32" r="4" fill={TOKEN.accent} />
      </svg>
      <motion.div
        className="absolute inset-0 grid place-items-center"
        animate={{ rotate: 360 }}
        transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
      >
        <Radio className="h-5 w-5" style={{ color: TOKEN.accent }} />
      </motion.div>
    </motion.div>
  );
}

function TicketPill({ ticket }: { ticket: 'SOLD OUT' | 'LIMITED' | 'ON SALE' }) {
  const tone =
    ticket === 'SOLD OUT'
      ? { bg: TOKEN.danger, ring: 'rgba(255,92,122,0.45)' }
      : ticket === 'LIMITED'
        ? { bg: TOKEN.warning, ring: 'rgba(255,180,84,0.45)' }
        : { bg: TOKEN.success, ring: 'rgba(61,220,151,0.45)' };
  return (
    <motion.span
      animate={
        ticket === 'SOLD OUT'
          ? { x: [0, -1.2, 1.2, -0.8, 0.8, 0] }
          : { x: 0 }
      }
      transition={
        ticket === 'SOLD OUT'
          ? { duration: 0.5, repeat: Infinity, repeatDelay: 4.5 }
          : { duration: 0.3 }
      }
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.22em]"
      style={{
        background: `color-mix(in srgb, ${tone.bg} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${tone.bg} 50%, transparent)`,
        color: tone.bg,
        boxShadow: `0 0 18px ${tone.ring}`,
      }}
    >
      <Ticket className="h-3 w-3" />
      {ticket}
    </motion.span>
  );
}

function stripAgencySuffix(name: string): string {
  // "Northwind Agency" → "Northwind". Leaves other names untouched.
  return name.replace(/\s+Agency$/i, '').trim() || name;
}

// ===========================================================================
// 2. HEADLINER BANNER
// ===========================================================================

function HeadlinerBanner({ band }: { band: SubClient | null }) {
  const [hovered, setHovered] = useState(false);
  if (!band) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-2xl border bg-surface/40 px-6 py-10 text-center"
        style={{ borderColor: TOKEN.border }}
      >
        <span
          className="grid h-12 w-12 place-items-center rounded-xl mx-auto"
          style={{
            background: 'color-mix(in srgb, var(--wp-accent) 12%, transparent)',
            color: TOKEN.accent,
          }}
        >
          <Crown className="h-5 w-5" />
        </span>
        <p
          className="mt-3 text-sm font-semibold uppercase tracking-[0.22em]"
          style={{ color: TOKEN.text }}
        >
          Headliner slot open
        </p>
        <p className="mt-1 text-xs" style={{ color: TOKEN.textDim }}>
          Invite your first sub-client to top the bill.
        </p>
      </motion.section>
    );
  }

  const stage = stageFor(band, 'headliner');
  const stageMeta = STAGES.find((s) => s.id === stage);
  const set = setTimeFor('headliner', 0);
  const color = STATUS_TOKEN[band.status];
  const sendsApprox = band.mailboxCount * 12;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative overflow-hidden rounded-2xl border"
      style={{
        borderColor: TOKEN.border,
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-surface) 96%, transparent) 0%, color-mix(in srgb, var(--wp-surface-2) 92%, transparent) 100%)',
      }}
    >
      {/* Pulsing radial glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          width: '90%',
          height: '140%',
          background:
            'radial-gradient(ellipse, color-mix(in srgb, var(--wp-accent) 30%, transparent), transparent 70%)',
        }}
        animate={{ opacity: hovered ? [0.9, 1, 0.9] : [0.55, 0.78, 0.55] }}
        transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
      />

      {/* Spotlight rays */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, transparent, ${TOKEN.accent}, transparent)`,
          boxShadow: `0 0 24px ${TOKEN.accent}`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${TOKEN.accent2}, transparent)`,
        }}
      />

      <div className="relative px-6 py-10 sm:px-12 sm:py-14">
        {/* Eyebrow row */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em]">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1"
            style={{
              borderColor: `color-mix(in srgb, ${TOKEN.accent} 40%, transparent)`,
              background: `color-mix(in srgb, ${TOKEN.accent} 14%, transparent)`,
              color: TOKEN.accent,
            }}
          >
            <Crown className="h-3 w-3" />
            HEADLINER
          </span>
          <span style={{ color: TOKEN.textDim }}>
            {stageMeta?.name ?? 'MAIN STAGE'} · {set.day} · {set.time}
          </span>
          <span style={{ color: TOKEN.textFaint }}>
            {band.createdAgo}
          </span>
        </div>

        {/* GIANT BAND NAME */}
        <motion.h2
          className="mt-4 select-none break-words leading-[0.84]"
          style={{
            fontSize: 'clamp(56px, 11vw, 156px)',
            fontWeight: 900,
            letterSpacing: TIER_TRACKING.headliner,
            color: TOKEN.accent,
            textShadow: `0 0 28px color-mix(in srgb, ${TOKEN.accent} 60%, transparent), 0 0 64px color-mix(in srgb, ${TOKEN.accent} 30%, transparent)`,
          }}
          animate={{
            textShadow: hovered
              ? `0 0 36px color-mix(in srgb, ${TOKEN.accent} 75%, transparent), 0 0 90px color-mix(in srgb, ${TOKEN.accent} 45%, transparent)`
              : `0 0 28px color-mix(in srgb, ${TOKEN.accent} 60%, transparent), 0 0 64px color-mix(in srgb, ${TOKEN.accent} 30%, transparent)`,
          }}
          transition={{ duration: 0.6 }}
        >
          {band.name.toUpperCase()}
        </motion.h2>

        {/* Sub-row: domain + email + status */}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <span
            className="font-mono"
            style={{ color: TOKEN.textDim }}
          >
            {band.ownerEmail}
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: color,
                boxShadow: `0 0 12px ${color}`,
              }}
            />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em]">
              {STATUS_LABEL[band.status]}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px]"
            style={{
              borderColor: `color-mix(in srgb, ${TOKEN.accent3} 35%, transparent)`,
              background: `color-mix(in srgb, ${TOKEN.accent3} 14%, transparent)`,
              color: TOKEN.accent3,
            }}
          >
            <Sparkles className="h-3 w-3" />
            {band.plan}
          </span>
        </div>

        {/* Tour-stats strip */}
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TourStat
            label="Mailboxes"
            value={String(band.mailboxCount)}
            sub="venues on tour"
            icon={Inbox}
          />
          <TourStat
            label="Sends / wk"
            value={formatNumber(sendsApprox)}
            sub="shows performed"
            icon={Mail}
          />
          <TourStat
            label="Warmth"
            value={String(band.avgWarmth)}
            sub="crowd energy"
            icon={Flame}
            valueTone={color}
          />
          <TourStat
            label="MRR"
            value={formatMoney(band.monthlyMrrUsd)}
            sub="gate receipts"
            icon={DollarSign}
            valueTone={TOKEN.accent2}
          />
        </div>
      </div>
    </motion.section>
  );
}

function TourStat({
  label,
  value,
  sub,
  icon: Icon,
  valueTone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Inbox;
  valueTone?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border px-3.5 py-3"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface-2) 70%, transparent)',
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: TOKEN.textDim }}
      >
        <Icon className="h-3 w-3" style={{ color: TOKEN.accent }} />
        {label}
      </div>
      <p
        className="mt-1 font-mono text-2xl font-extrabold tabular-nums leading-none"
        style={{ color: valueTone ?? TOKEN.text }}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px]" style={{ color: TOKEN.textFaint }}>
        {sub}
      </p>
    </div>
  );
}

// ===========================================================================
// 3. CO-HEADLINER ROW
// ===========================================================================

function CoHeadlinerRow({ bands }: { bands: SubClient[] }) {
  if (bands.length === 0) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      <SectionLabel
        eyebrow="CO-HEADLINERS"
        sub="second-billed acts · evening sets"
        icon={Star}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {bands.map((band, i) => (
          <CoHeadlinerCard key={band.id} band={band} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

function CoHeadlinerCard({
  band,
  index,
}: {
  band: SubClient;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const set = setTimeFor('co-headliner', index + 1);
  const stage = stageFor(band, 'co-headliner');
  const stageMeta = STAGES.find((s) => s.id === stage);
  const color = STATUS_TOKEN[band.status];

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.35 + index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative overflow-hidden rounded-2xl border px-5 py-6 transition-shadow"
      style={{
        borderColor: hovered
          ? `color-mix(in srgb, ${TOKEN.accent} 50%, ${TOKEN.border})`
          : TOKEN.border,
        background:
          'linear-gradient(165deg, color-mix(in srgb, var(--wp-surface) 92%, transparent), color-mix(in srgb, var(--wp-surface-2) 86%, transparent))',
        boxShadow: hovered
          ? `0 12px 32px -16px color-mix(in srgb, ${TOKEN.accent} 40%, transparent)`
          : 'none',
      }}
    >
      {/* Side glow bar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{
          background: `linear-gradient(180deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 14px ${color}`,
        }}
      />

      <div className="flex items-baseline justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{
            borderColor: TOKEN.border,
            color: TOKEN.accent2,
          }}
        >
          <Star className="h-3 w-3" />
          CO-HEADLINER
        </span>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: TOKEN.textDim }}
        >
          {set.day} · {set.time}
        </span>
      </div>

      {/* BIG BAND NAME */}
      <h3
        className="mt-3 break-words leading-[0.88]"
        style={{
          fontSize: 'clamp(36px, 6vw, 92px)',
          fontWeight: 900,
          letterSpacing: TIER_TRACKING['co-headliner'],
          color: TOKEN.text,
          textShadow: hovered
            ? `0 0 22px color-mix(in srgb, ${TOKEN.accent} 35%, transparent)`
            : 'none',
        }}
      >
        {band.name.toUpperCase()}
      </h3>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <span className="font-mono" style={{ color: TOKEN.textDim }}>
          {band.ownerEmail}
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color }}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
          />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em]">
            {STATUS_LABEL[band.status]}
          </span>
        </span>
      </div>

      {/* Stat strip — compact for co-headliner */}
      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <CompactStat
          label="MAILBOXES"
          value={String(band.mailboxCount)}
        />
        <CompactStat
          label="WARMTH"
          value={String(band.avgWarmth)}
          tone={color}
        />
        <CompactStat
          label="MRR"
          value={formatMoney(band.monthlyMrrUsd)}
          tone={TOKEN.accent2}
        />
      </div>

      {/* Stage chip */}
      <div className="mt-4 flex items-center gap-2 border-t pt-3"
        style={{ borderColor: TOKEN.border }}
      >
        <Tent className="h-3.5 w-3.5" style={{ color: TOKEN.accent }} />
        <span
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: TOKEN.accent }}
        >
          {stageMeta?.name ?? 'TENT 2'}
        </span>
        <span className="text-[11px]" style={{ color: TOKEN.textFaint }}>
          · {stageMeta?.blurb}
        </span>
      </div>
    </motion.article>
  );
}

function CompactStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg border px-2.5 py-2"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
      }}
    >
      <div
        className="text-[9px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: TOKEN.textDim }}
      >
        {label}
      </div>
      <p
        className="mt-0.5 font-mono text-lg font-extrabold tabular-nums leading-none"
        style={{ color: tone ?? TOKEN.text }}
      >
        {value}
      </p>
    </div>
  );
}

// ===========================================================================
// 4. MID-TIER GRID
// ===========================================================================

function MidTierGrid({ bands }: { bands: SubClient[] }) {
  if (bands.length === 0) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45 }}
      className="space-y-3"
    >
      <SectionLabel
        eyebrow="MID-TIER ACTS"
        sub="afternoon main · supporting slots"
        icon={Music}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {bands.map((band, i) => (
          <MidBandCard key={band.id} band={band} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

function MidBandCard({
  band,
  index,
}: {
  band: SubClient;
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const set = setTimeFor('mid', index + 3);
  const stage = stageFor(band, 'mid');
  const stageMeta = STAGES.find((s) => s.id === stage);
  const color = STATUS_TOKEN[band.status];

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.5 + index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative overflow-hidden rounded-xl border p-4 transition-colors"
      style={{
        borderColor: hovered
          ? `color-mix(in srgb, ${TOKEN.accent} 35%, ${TOKEN.border})`
          : TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface) 88%, transparent)',
      }}
    >
      {/* Top accent bar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: color, opacity: hovered ? 0.85 : 0.4 }}
      />

      <div className="flex items-start justify-between gap-2">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md font-mono text-[11px] font-extrabold"
          style={{
            background: `color-mix(in srgb, ${color} 18%, transparent)`,
            color,
            border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
          }}
          aria-hidden
        >
          {band.logoChar}
        </span>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: TOKEN.textFaint }}
        >
          {set.day} · {set.time}
        </span>
      </div>

      <h4
        className="mt-3 leading-[0.95]"
        style={{
          fontSize: 'clamp(22px, 2.4vw, 44px)',
          fontWeight: 900,
          letterSpacing: TIER_TRACKING.mid,
          color: TOKEN.text,
        }}
      >
        {band.name.toUpperCase()}
      </h4>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="h-1 w-1 rounded-full"
          style={{ background: color }}
        />
        <span
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color }}
        >
          {STATUS_LABEL[band.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StageChip label={stageMeta?.name ?? 'TENT 2'} />
        <span
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] tabular-nums"
          style={{
            borderColor: TOKEN.border,
            color: TOKEN.textDim,
          }}
        >
          <Inbox className="h-2.5 w-2.5" />
          {band.mailboxCount}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] tabular-nums"
          style={{
            borderColor: TOKEN.border,
            color: TOKEN.accent,
          }}
        >
          <Flame className="h-2.5 w-2.5" />
          {band.avgWarmth}
        </span>
      </div>
    </motion.article>
  );
}

function StageChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] transition-transform hover:-translate-y-px"
      style={{
        borderColor: `color-mix(in srgb, ${TOKEN.accent} 36%, transparent)`,
        background: `color-mix(in srgb, ${TOKEN.accent} 12%, transparent)`,
        color: TOKEN.accent,
      }}
    >
      <Tent className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// ===========================================================================
// 5. OPENER LIST
// ===========================================================================

function OpenerList({
  bands,
  totalSubs,
}: {
  bands: SubClient[];
  totalSubs: number;
}) {
  if (bands.length === 0 && totalSubs > 7) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="space-y-3"
    >
      <SectionLabel
        eyebrow="OPENING ACTS"
        sub="matinee · doors open at noon"
        icon={Megaphone}
      />
      <div
        className="rounded-2xl border px-5 py-5"
        style={{
          borderColor: TOKEN.border,
          background:
            'color-mix(in srgb, var(--wp-surface) 70%, transparent)',
        }}
      >
        {bands.length === 0 ? (
          <p
            className="text-center text-xs"
            style={{ color: TOKEN.textDim }}
          >
            All current acts are headlining or co-headlining — no opener slots filled.
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {bands.map((band, i) => (
                <OpenerRow key={band.id} band={band} index={i} />
              ))}
            </ul>
            <div
              className="mt-5 border-t pt-4 text-center font-mono text-[11px] uppercase tracking-[0.32em]"
              style={{
                borderColor: TOKEN.border,
                color: TOKEN.textFaint,
              }}
            >
              {bands.length > 6
                ? '... AND MANY MORE — full lineup at the gate ...'
                : '... and the rest of the day-pass lineup ...'}
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
}

function OpenerRow({
  band,
  index,
}: {
  band: SubClient;
  index: number;
}) {
  const set = setTimeFor('opener', index + 5);
  const stage = stageFor(band, 'opener');
  const stageMeta = STAGES.find((s) => s.id === stage);
  const color = STATUS_TOKEN[band.status];

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: 0.62 + index * 0.04 }}
      className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0"
      style={{ borderColor: 'color-mix(in srgb, var(--wp-border) 55%, transparent)' }}
    >
      <div className="min-w-0 flex-1">
        <p
          className="truncate leading-tight"
          style={{
            fontSize: 'clamp(16px, 1.6vw, 22px)',
            fontWeight: 800,
            letterSpacing: TIER_TRACKING.opener,
            color: TOKEN.text,
          }}
        >
          {band.name.toUpperCase()}
        </p>
        <p
          className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: TOKEN.textDim }}
        >
          <span
            className="h-1 w-1 rounded-full"
            style={{ background: color }}
          />
          {stageMeta?.name ?? 'LOUNGE'} · {set.day} · {set.time}
        </p>
      </div>
      <span
        className="shrink-0 font-mono text-[10px] tabular-nums"
        style={{ color: TOKEN.textFaint }}
      >
        {band.mailboxCount}mb
      </span>
    </motion.li>
  );
}

// ===========================================================================
// 6. STAGES LEGEND
// ===========================================================================

function StagesLegend({
  bands,
  tiers,
}: {
  bands: SubClient[];
  tiers: TierBundle;
}) {
  // Compute current load + assigned bands per stage
  const loadByStage = useMemo(() => {
    const map = new Map<StageId, { load: number; count: number }>();
    for (const s of STAGES) {
      map.set(s.id, { load: 0, count: 0 });
    }
    for (const band of bands) {
      const t = tierOf(band, tiers);
      const sid = stageFor(band, t);
      const cur = map.get(sid) ?? { load: 0, count: 0 };
      cur.load += band.mailboxCount;
      cur.count += 1;
      map.set(sid, cur);
    }
    return map;
  }, [bands, tiers]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.7 }}
      className="space-y-3"
    >
      <SectionLabel
        eyebrow="STAGES"
        sub="peer-pool assignments · stage capacity"
        icon={Tent}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage, i) => {
          const load = loadByStage.get(stage.id) ?? { load: 0, count: 0 };
          return (
            <StageCard
              key={stage.id}
              stage={stage}
              load={load}
              index={i}
            />
          );
        })}
      </div>
    </motion.section>
  );
}

function StageCard({
  stage,
  load,
  index,
}: {
  stage: StageMeta;
  load: { load: number; count: number };
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const pct = Math.min(100, Math.round((load.load / stage.capacity) * 100));
  const tone =
    stage.tier === 'healthy'
      ? TOKEN.accent
      : stage.tier === 'warming'
        ? TOKEN.warning
        : stage.tier === 'at_risk'
          ? TOKEN.danger
          : TOKEN.accent2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.74 + index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative overflow-hidden rounded-xl border p-4 transition-shadow"
      style={{
        borderColor: hovered
          ? `color-mix(in srgb, ${tone} 45%, ${TOKEN.border})`
          : TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface) 90%, transparent)',
        boxShadow: hovered
          ? `0 8px 24px -12px color-mix(in srgb, ${tone} 35%, transparent)`
          : 'none',
      }}
    >
      {/* Side stripe */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: tone }}
      />

      <div className="flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: tone }}
        >
          <Tent className="h-3 w-3" />
          STAGE {index + 1}
        </span>
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{ color: TOKEN.textFaint }}
        >
          {load.count} act{load.count === 1 ? '' : 's'}
        </span>
      </div>

      <h5
        className="mt-2 leading-tight"
        style={{
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          color: TOKEN.text,
        }}
      >
        {stage.name}
      </h5>
      <p
        className="mt-0.5 text-[11px]"
        style={{ color: TOKEN.textDim }}
      >
        {stage.blurb}
      </p>

      {/* Capacity / load bar */}
      <div className="mt-3">
        <div
          className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: TOKEN.textDim }}
        >
          <span>LOAD</span>
          <span className="tabular-nums" style={{ color: TOKEN.text }}>
            {load.load}/{stage.capacity}
          </span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full"
          style={{
            background:
              'color-mix(in srgb, var(--wp-surface-2) 80%, transparent)',
          }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, delay: 0.8 + index * 0.06 }}
          />
        </div>
        <p
          className="mt-1 font-mono text-[10px] tabular-nums"
          style={{ color: TOKEN.textFaint }}
        >
          {pct}% booked
        </p>
      </div>
    </motion.div>
  );
}

// ===========================================================================
// 7. FESTIVAL FOOTER — schedule + backstage news + sponsors
// ===========================================================================

function FestivalFooter({
  data,
  ranked,
  tiers,
  mailboxTotal,
  sendsTotal,
  avgWarmth,
}: {
  data: AgencyWorkspaceData;
  ranked: SubClient[];
  tiers: TierBundle;
  mailboxTotal: number;
  sendsTotal: number;
  avgWarmth: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.85 }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      <div className="lg:col-span-5">
        <FestivalScheduleStrip ranked={ranked} tiers={tiers} />
      </div>
      <div className="lg:col-span-4">
        <BackstageAlerts />
      </div>
      <div className="lg:col-span-3">
        <SponsorsRow
          data={data}
          mailboxTotal={mailboxTotal}
          sendsTotal={sendsTotal}
          avgWarmth={avgWarmth}
        />
      </div>
    </motion.section>
  );
}

// ---- 7a. Schedule strip ---------------------------------------------------

function FestivalScheduleStrip({
  ranked,
  tiers,
}: {
  ranked: SubClient[];
  tiers: TierBundle;
}) {
  // Bucket bands by their setTime day. Same modulo trick used elsewhere.
  const byDay = useMemo(() => {
    const buckets: Record<'DAY 1' | 'DAY 2' | 'DAY 3', SubClient[]> = {
      'DAY 1': [],
      'DAY 2': [],
      'DAY 3': [],
    };
    ranked.forEach((band, i) => {
      const t = tierOf(band, tiers);
      const set = setTimeFor(t, i);
      buckets[set.day].push(band);
    });
    return buckets;
  }, [ranked, tiers]);

  return (
    <div
      className="h-full rounded-2xl border p-4"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
      }}
    >
      <SectionLabel
        eyebrow="3-DAY SCHEDULE"
        sub="lineup spread across the festival weekend"
        icon={Calendar}
        compact
      />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {(['DAY 1', 'DAY 2', 'DAY 3'] as const).map((day, i) => {
          const bands = byDay[day];
          return (
            <DayColumn
              key={day}
              day={day}
              bands={bands}
              index={i}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayColumn({
  day,
  bands,
  index,
}: {
  day: 'DAY 1' | 'DAY 2' | 'DAY 3';
  bands: SubClient[];
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.92 + index * 0.06 }}
      className="rounded-xl border p-3"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
      }}
    >
      <div
        className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: TOKEN.accent }}
      >
        <span>{day}</span>
        <span
          className="tabular-nums"
          style={{ color: TOKEN.textDim }}
        >
          {bands.length} acts
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {bands.slice(0, 3).map((b) => (
          <li
            key={b.id}
            className="truncate text-[11px]"
            style={{ color: TOKEN.text }}
          >
            <span
              className="mr-1.5 inline-block h-1 w-1 align-middle rounded-full"
              style={{ background: STATUS_TOKEN[b.status] }}
            />
            {b.name}
          </li>
        ))}
        {bands.length > 3 && (
          <li
            className="font-mono text-[10px]"
            style={{ color: TOKEN.textFaint }}
          >
            +{bands.length - 3} more
          </li>
        )}
        {bands.length === 0 && (
          <li
            className="text-[10px] italic"
            style={{ color: TOKEN.textFaint }}
          >
            — dark day —
          </li>
        )}
      </ul>
    </motion.div>
  );
}

// ---- 7b. Backstage alerts -------------------------------------------------

function BackstageAlerts() {
  return (
    <div
      className="h-full rounded-2xl border p-4"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
      }}
    >
      <SectionLabel
        eyebrow="BACKSTAGE"
        sub="recent festival news"
        icon={Bell}
        compact
      />
      <ul className="mt-3 space-y-2.5">
        {BACKSTAGE_ALERTS.map((alert, i) => (
          <AlertRow key={alert.id} alert={alert} index={i} />
        ))}
      </ul>
    </div>
  );
}

function AlertRow({
  alert,
  index,
}: {
  alert: BackstageAlert;
  index: number;
}) {
  const Icon = ALERT_ICON[alert.kind];
  const tone = ALERT_TONE[alert.kind];
  const toneColor =
    tone === 'accent'
      ? TOKEN.accent
      : tone === 'danger'
        ? TOKEN.danger
        : TOKEN.success;
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.95 + index * 0.06 }}
      className="flex items-start gap-2.5 rounded-lg border p-2.5"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
      }}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{
          background: `color-mix(in srgb, ${toneColor} 18%, transparent)`,
          color: toneColor,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[12px] font-semibold leading-snug"
          style={{ color: TOKEN.text }}
        >
          {alert.headline}
        </p>
        <p
          className="mt-0.5 text-[10px]"
          style={{ color: TOKEN.textDim }}
        >
          {alert.sub}
        </p>
      </div>
      <span
        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em]"
        style={{ color: TOKEN.textFaint }}
      >
        {alert.marker}
      </span>
    </motion.li>
  );
}

// ---- 7c. Sponsors / agency feature row -----------------------------------

function SponsorsRow({
  data,
  mailboxTotal,
  sendsTotal,
  avgWarmth,
}: {
  data: AgencyWorkspaceData;
  mailboxTotal: number;
  sendsTotal: number;
  avgWarmth: number;
}) {
  const f = data.features;
  return (
    <div
      className="h-full rounded-2xl border p-4"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface) 80%, transparent)',
      }}
    >
      <SectionLabel
        eyebrow="SPONSORS"
        sub="agency entitlements · gate stats"
        icon={Sparkles}
        compact
      />

      {/* Festival vitals (mini KPI strip) */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <SponsorStat
          label="MB"
          value={formatNumber(mailboxTotal)}
          icon={Inbox}
        />
        <SponsorStat
          label="SENDS"
          value={formatNumber(sendsTotal)}
          icon={Mail}
        />
        <SponsorStat
          label="WARM"
          value={String(avgWarmth)}
          icon={Flame}
          tone={TOKEN.accent}
        />
      </div>

      {/* Feature sponsor badges */}
      <ul className="mt-3 space-y-1.5">
        <SponsorBadge
          icon={Palette}
          label="WHITE-LABEL"
          enabled={f.whiteLabel.enabled}
          detail={
            f.whiteLabel.enabled
              ? (f.whiteLabel.brandName ?? 'Branded')
              : 'Standard branding'
          }
        />
        <SponsorBadge
          icon={Globe}
          label="CUSTOM DOMAIN"
          enabled={f.customDomain.enabled}
          detail={
            f.customDomain.enabled
              ? (f.customDomain.domain ?? 'Pending')
              : 'Default host'
          }
        />
        <SponsorBadge
          icon={Shield}
          label="DEDICATED POOL"
          enabled={f.dedicatedPool.enabled}
          detail={
            f.dedicatedPool.enabled
              ? `${formatNumber(f.dedicatedPool.memberCount)} peers`
              : 'Shared pool'
          }
        />
      </ul>

      {/* Tier badges row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3"
        style={{ borderColor: TOKEN.border }}
      >
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: TOKEN.textDim }}
        >
          TIER
        </span>
        <Badge variant="orange">
          <Crown className="h-3 w-3" />
          {data.agency.plan}
        </Badge>
        <Badge variant="green">
          <Zap className="h-3 w-3" />
          LIVE
        </Badge>
      </div>
    </div>
  );
}

function SponsorStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Inbox;
  tone?: string;
}) {
  return (
    <div
      className="rounded-lg border px-2 py-1.5"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
      }}
    >
      <div
        className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.22em]"
        style={{ color: TOKEN.textDim }}
      >
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <p
        className="mt-0.5 truncate font-mono text-sm font-extrabold tabular-nums leading-none"
        style={{ color: tone ?? TOKEN.text }}
      >
        {value}
      </p>
    </div>
  );
}

function SponsorBadge({
  icon: Icon,
  label,
  enabled,
  detail,
}: {
  icon: typeof Palette;
  label: string;
  enabled: boolean;
  detail: string;
}) {
  return (
    <li
      className="flex items-center gap-2 rounded-md border px-2 py-1.5"
      style={{
        borderColor: TOKEN.border,
        background:
          'color-mix(in srgb, var(--wp-surface-2) 60%, transparent)',
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded"
        style={{
          background: enabled
            ? `color-mix(in srgb, ${TOKEN.accent} 18%, transparent)`
            : `color-mix(in srgb, ${TOKEN.surface2} 80%, transparent)`,
          color: enabled ? TOKEN.accent : TOKEN.textFaint,
        }}
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: enabled ? TOKEN.accent : TOKEN.textDim }}
        >
          {label}
        </p>
        <p
          className="truncate text-[10px]"
          style={{ color: TOKEN.textDim }}
        >
          {detail}
        </p>
      </div>
      {enabled ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: TOKEN.success }} />
      ) : (
        <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: TOKEN.textFaint }} />
      )}
    </li>
  );
}

// ===========================================================================
// SHARED — Section label (eyebrow row with subtitle)
// ===========================================================================

function SectionLabel({
  eyebrow,
  sub,
  icon: Icon,
  compact = false,
}: {
  eyebrow: string;
  sub: string;
  icon: typeof Music;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? '' : 'px-1'}`}>
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
        style={{
          background: `color-mix(in srgb, ${TOKEN.accent} 14%, transparent)`,
          color: TOKEN.accent,
        }}
      >
        <Icon className="h-3 w-3" />
      </span>
      <div className="min-w-0">
        <p
          className="font-mono text-[10px] font-semibold uppercase tracking-[0.32em]"
          style={{ color: TOKEN.accent }}
        >
          {eyebrow}
        </p>
        {!compact && (
          <p
            className="text-[11px]"
            style={{ color: TOKEN.textDim }}
          >
            {sub}
          </p>
        )}
      </div>
      {!compact && (
        <span
          aria-hidden
          className="ml-2 h-px flex-1"
          style={{ background: TOKEN.border }}
        />
      )}
    </div>
  );
}

// ===========================================================================
// EMPTY-STATE — only renders when there are NO sub-clients yet.
// ===========================================================================

function PosterEmptyState() {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl border bg-surface/40 px-6 py-12 text-center"
        style={{ borderColor: TOKEN.border }}
      >
        <span
          className="grid h-12 w-12 place-items-center rounded-xl mx-auto"
          style={{
            background: `color-mix(in srgb, ${TOKEN.accent} 14%, transparent)`,
            color: TOKEN.accent,
          }}
        >
          <Building2 className="h-5 w-5" />
        </span>
        <p
          className="mt-3 text-sm font-semibold uppercase tracking-[0.22em]"
          style={{ color: TOKEN.text }}
        >
          No bands on the bill yet
        </p>
        <p
          className="mt-1 text-xs"
          style={{ color: TOKEN.textDim }}
        >
          Invite your first sub-client to start booking the lineup.
        </p>
        <p
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: TOKEN.textFaint }}
        >
          <AlertTriangle className="h-3 w-3" />
          Poster goes to press in 7 days
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
