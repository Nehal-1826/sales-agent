import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Crosshair,
  Gauge,
  Globe,
  Inbox,
  Mail,
  Radar,
  Radio,
  ServerCrash,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Siren,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgRepC1Radar — Agency-tier Reputation, design candidate #1, "Radar Sweep".
 *
 * The Agency Reputation surface visualised as a maritime / military SONAR
 * SCOPE: a circular radar SCREEN with concentric guide rings + N/S/E/W
 * crosshairs. Each sub-client domain is a BLIP, placed radially by
 * reputation score:
 *
 *   - healthy   (>=80) → near the centre (close, friendly contacts)
 *   - warming   (60..79) → middle ring
 *   - at_risk   (<60) → outer ring (far, fading signal)
 *
 * A continuous SWEEP LINE rotates around the centre (~4.5s / revolution).
 * As it passes over a blip, that blip briefly GLOWS (illuminated). The
 * RIGHT inspector cross-fades to the selected domain — DNS chips
 * (SPF/DKIM/DMARC), inbox-vs-spam, 7-day sparkline, latest incident.
 * BELOW the scope: a horizontal provider strip (Gmail / Outlook / Yahoo)
 * with inbox / spam / blocked bar columns. TOP HEADER: agency name,
 * region, and a semicircular OVERALL SCORE gauge whose needle springs in
 * from 0 → current value on mount.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Inline MOCK supplies every field so the preview harness mounts it
 * prop-less. The future adapter passes `data` once the live aggregate
 * endpoint exists.
 *
 * NOT a card grid, NOT a node-link diagram (sibling Pro Plus / Agency
 * variants own those). The scope identity (sweep + radial-by-reputation +
 * gauge needle) is the differentiator.
 */

// ---------------------------------------------------------------------------
// Shared Agency reputation data shape (kept in sync across all 4 variants).
// ---------------------------------------------------------------------------

type DomainStatus = 'healthy' | 'warming' | 'at_risk';
type AlertSeverity = 'warn' | 'critical';
type AlertKind = 'bounce_spike' | 'spam_complaint' | 'dns_break' | 'peer_failed';

export interface AgencyReputationData {
  agency: { name: string; region: string };
  summary: {
    overallScore: number;
    trend7dDelta: number;
    domainsHealthy: number;
    domainsWarming: number;
    domainsAtRisk: number;
    totalSends24h: number;
    bouncePct24h: number;
    spamComplaintPct24h: number;
  };
  domains: Array<{
    id: string;
    domain: string;
    subClientId: string;
    subClientName: string;
    reputationScore: number;
    status: DomainStatus;
    spfPass: boolean;
    dkimPass: boolean;
    dmarcPass: boolean;
    mailboxCount: number;
    inboxRatePct: number;
    spamFolderPct: number;
    last7dScores: number[];
    lastIncidentAgo: string | null;
    lastIncidentKind: AlertKind | null;
  }>;
  providers: Array<{
    id: string;
    label: string;
    inboxPct: number;
    spamPct: number;
    blockedPct: number;
    last24hSends: number;
  }>;
  recentAlerts: Array<{
    id: string;
    domain: string;
    kind: AlertKind;
    message: string;
    ago: string;
    severity: AlertSeverity;
  }>;
}

// ---------------------------------------------------------------------------
// Mock data — Northwind Agency, 8 domains, 3 providers, 4 recent alerts.
// ---------------------------------------------------------------------------

const DOMAINS: AgencyReputationData['domains'] = [
  {
    id: 'd-helix',
    domain: 'helix.com',
    subClientId: 'sc-helix',
    subClientName: 'Helix Outreach',
    reputationScore: 89,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 12,
    inboxRatePct: 91.4,
    spamFolderPct: 1.2,
    last7dScores: [85, 86, 88, 87, 88, 89, 89],
    lastIncidentAgo: '11d ago',
    lastIncidentKind: 'bounce_spike',
  },
  {
    id: 'd-nimbus',
    domain: 'nimbuscloud.io',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    reputationScore: 86,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 18,
    inboxRatePct: 88.1,
    spamFolderPct: 1.9,
    last7dScores: [82, 83, 84, 85, 85, 86, 86],
    lastIncidentAgo: '6d ago',
    lastIncidentKind: 'spam_complaint',
  },
  {
    id: 'd-orion',
    domain: 'orionsales.com',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    reputationScore: 91,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 22,
    inboxRatePct: 93.6,
    spamFolderPct: 0.8,
    last7dScores: [88, 89, 90, 90, 90, 91, 91],
    lastIncidentAgo: '21d ago',
    lastIncidentKind: 'bounce_spike',
  },
  {
    id: 'd-vega',
    domain: 'vegaoutbound.io',
    subClientId: 'sc-vega',
    subClientName: 'Vega Outbound',
    reputationScore: 72,
    status: 'warming',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 8,
    inboxRatePct: 76.2,
    spamFolderPct: 4.4,
    last7dScores: [64, 66, 68, 70, 71, 71, 72],
    lastIncidentAgo: '42m ago',
    lastIncidentKind: 'spam_complaint',
  },
  {
    id: 'd-quasar',
    domain: 'quasargrowth.com',
    subClientId: 'sc-quasar',
    subClientName: 'Quasar Growth',
    reputationScore: 82,
    status: 'healthy',
    spfPass: true,
    dkimPass: false,
    dmarcPass: true,
    mailboxCount: 14,
    inboxRatePct: 84.7,
    spamFolderPct: 2.1,
    last7dScores: [80, 81, 82, 82, 83, 82, 82],
    lastIncidentAgo: '1h ago',
    lastIncidentKind: 'dns_break',
  },
  {
    id: 'd-lyra',
    domain: 'lyrastudio.co',
    subClientId: 'sc-lyra',
    subClientName: 'Lyra Studio',
    reputationScore: 84,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 9,
    inboxRatePct: 87.4,
    spamFolderPct: 1.6,
    last7dScores: [80, 81, 82, 83, 83, 84, 84],
    lastIncidentAgo: '9d ago',
    lastIncidentKind: 'bounce_spike',
  },
  {
    id: 'd-atlas',
    domain: 'atlas-bio.com',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    reputationScore: 48,
    status: 'at_risk',
    spfPass: true,
    dkimPass: true,
    dmarcPass: false,
    mailboxCount: 5,
    inboxRatePct: 51.3,
    spamFolderPct: 18.7,
    last7dScores: [62, 58, 55, 52, 50, 49, 48],
    lastIncidentAgo: '14m ago',
    lastIncidentKind: 'bounce_spike',
  },
  {
    id: 'd-pixel',
    domain: 'pixelforge.io',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    reputationScore: 65,
    status: 'warming',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 6,
    inboxRatePct: 68.9,
    spamFolderPct: 6.2,
    last7dScores: [58, 60, 61, 63, 64, 65, 65],
    lastIncidentAgo: '2h ago',
    lastIncidentKind: 'peer_failed',
  },
];

const PROVIDERS: AgencyReputationData['providers'] = [
  {
    id: 'prov-gmail',
    label: 'Gmail',
    inboxPct: 86,
    spamPct: 1.2,
    blockedPct: 0.4,
    last24hSends: 9840,
  },
  {
    id: 'prov-outlook',
    label: 'Outlook',
    inboxPct: 79,
    spamPct: 2.8,
    blockedPct: 0.8,
    last24hSends: 3120,
  },
  {
    id: 'prov-yahoo',
    label: 'Yahoo',
    inboxPct: 71,
    spamPct: 4.2,
    blockedPct: 1.4,
    last24hSends: 1860,
  },
];

const RECENT_ALERTS: AgencyReputationData['recentAlerts'] = [
  {
    id: 'a-1',
    domain: 'atlas-bio.com',
    kind: 'bounce_spike',
    message: 'Bounce rate spiked to 9.8% over last 60min',
    ago: '14m ago',
    severity: 'critical',
  },
  {
    id: 'a-2',
    domain: 'vegaoutbound.io',
    kind: 'spam_complaint',
    message: 'Yahoo complaint rate >0.4% — throttling outbound',
    ago: '42m ago',
    severity: 'warn',
  },
  {
    id: 'a-3',
    domain: 'quasargrowth.com',
    kind: 'dns_break',
    message: 'DKIM record returning NXDOMAIN at resolver',
    ago: '1h ago',
    severity: 'warn',
  },
  {
    id: 'a-4',
    domain: 'pixelforge.io',
    kind: 'peer_failed',
    message: 'Pool peer reputation dropped below 0.3 threshold',
    ago: '2h ago',
    severity: 'warn',
  },
];

const MOCK: AgencyReputationData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  summary: {
    overallScore: 78,
    trend7dDelta: 2.4,
    domainsHealthy: 5,
    domainsWarming: 2,
    domainsAtRisk: 1,
    totalSends24h: 14820,
    bouncePct24h: 1.8,
    spamComplaintPct24h: 0.4,
  },
  domains: DOMAINS,
  providers: PROVIDERS,
  recentAlerts: RECENT_ALERTS,
};

/**
 * Skeleton fallback for the future live adapter — used when the API hasn't
 * loaded yet (or has failed) so we don't render mock data the user might
 * mistake for their own. Every collection is empty.
 */
export const AGENCY_REPUTATION_SKELETON_C1: AgencyReputationData = {
  agency: { name: 'Your agency', region: 'us-east-1' },
  summary: {
    overallScore: 0,
    trend7dDelta: 0,
    domainsHealthy: 0,
    domainsWarming: 0,
    domainsAtRisk: 0,
    totalSends24h: 0,
    bouncePct24h: 0,
    spamComplaintPct24h: 0,
  },
  domains: [],
  providers: [],
  recentAlerts: [],
};

// ---------------------------------------------------------------------------
// Theme + geometry helpers
// ---------------------------------------------------------------------------

/**
 * Hex equivalents of the Tailwind tokens. Used inside the SVG where Tailwind
 * classes can't reach. Kept in lockstep with tailwind.config.ts — see the
 * sibling C1 Federation file for the established palette.
 */
const HEX = {
  accent: '#F26522',
  accent2: '#FF8A4B',
  accent3: '#ff6b4a',
  accent4: '#ffd54f',
  surface: '#13131d',
  surface2: '#1a1a26',
  border: '#2a2a3a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

const STATUS_HEX: Record<DomainStatus, string> = {
  healthy: HEX.accent,
  warming: HEX.accent4,
  at_risk: HEX.accent3,
};

const STATUS_LABEL: Record<DomainStatus, string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At risk',
};

const STATUS_RING_CLASS: Record<DomainStatus, string> = {
  healthy: 'border-accent/40 bg-accent/10 text-accent',
  warming: 'border-accent4/40 bg-accent4/10 text-accent4',
  at_risk: 'border-accent3/40 bg-accent3/10 text-accent3',
};

const STATUS_TEXT_CLASS: Record<DomainStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
};

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  bounce_spike: 'Bounce spike',
  spam_complaint: 'Spam complaint',
  dns_break: 'DNS break',
  peer_failed: 'Peer failed',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof AlertTriangle> = {
  bounce_spike: TrendingUp,
  spam_complaint: Siren,
  dns_break: ServerCrash,
  peer_failed: ShieldX,
};

const ALERT_SEVERITY_CLASS: Record<AlertSeverity, string> = {
  warn: 'border-accent4/40 bg-accent4/10 text-accent4',
  critical: 'border-accent3/40 bg-accent3/10 text-accent3',
};

/**
 * Radar geometry — viewBox space the SVG scales to fit.
 *
 * The screen is a 1000x1000 square. The centre is the agency, and the three
 * concentric guide rings carve the screen into healthy / warming / at-risk
 * bands. Blip positions are derived from score → radius and a deterministic
 * angle so the same domain always lands in the same place.
 */
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
const RING_INNER = 130; // boundary: healthy → centre side
const RING_MID = 270; // boundary: warming → middle band
const RING_OUTER = 410; // boundary: at-risk → outer band
const RING_EDGE = 470; // screen edge (where graticule terminates)
const BLIP_R = 16; // baseline blip radius before mailbox-scaling

interface PlacedBlip {
  domain: AgencyReputationData['domains'][number];
  /** Final viewBox-space x / y of the blip. */
  x: number;
  y: number;
  /** Angle in radians (0 = right, -PI/2 = top), used for the sweep glow. */
  angle: number;
  /** Visual blip radius (scales with mailbox count). */
  r: number;
  /** Position around the band (0..1) so we can hash a stable angle. */
  bandIndex: number;
}

/**
 * Map a 0..100 reputation score to a viewBox radius so HIGHER score sits
 * CLOSER to centre. Healthy (>=80) → 60..RING_INNER. Warming (60..79) →
 * RING_INNER..RING_MID. At-risk (<60) → RING_MID..RING_OUTER, with the worst
 * scores pushed almost to the screen edge.
 */
function scoreToRadius(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 80) {
    // 80 → RING_INNER, 100 → 60 (well inside the inner ring).
    const t = (s - 80) / 20; // 0..1
    return RING_INNER - t * (RING_INNER - 60);
  }
  if (s >= 60) {
    // 60 → RING_MID, 79 → RING_INNER + 8.
    const t = (s - 60) / 19; // 0..1
    return RING_MID - t * (RING_MID - (RING_INNER + 8));
  }
  // 0 → RING_OUTER + 40 (just shy of edge), 59 → RING_MID + 6.
  const t = s / 59; // 0..1
  return RING_OUTER + 40 - t * (RING_OUTER + 40 - (RING_MID + 6));
}

/**
 * Distribute blips around the screen with deterministic angles so the same
 * domain ID always lands in the same place — but biased so that blips in the
 * same band don't pile on top of each other.
 *
 * Strategy: per-status bucketing, then evenly spaced angles within each
 * bucket starting from the bucket's reference quadrant. Healthy starts at
 * -PI/2 (top), warming at 0 (right), at-risk at PI (left). This produces a
 * recognisable layout where the eye scans top → right → bottom → left in
 * decreasing health order.
 */
function placeBlips(
  domains: AgencyReputationData['domains'],
): PlacedBlip[] {
  if (domains.length === 0) return [];

  const buckets: Record<DomainStatus, AgencyReputationData['domains']> = {
    healthy: [],
    warming: [],
    at_risk: [],
  };
  for (const d of domains) {
    buckets[d.status].push(d);
  }

  // Sort each bucket so the deterministic angle order is alphabetical by
  // domain — keeps the layout stable when a domain flips status.
  for (const status of Object.keys(buckets) as DomainStatus[]) {
    buckets[status].sort((a, b) => a.domain.localeCompare(b.domain));
  }

  const startAngle: Record<DomainStatus, number> = {
    healthy: -Math.PI / 2, // top
    warming: 0, // right
    at_risk: Math.PI, // left
  };
  // Each bucket spans ~270 degrees so blips don't crowd a single quadrant.
  const SPAN = Math.PI * 1.5;

  // Per-bucket mailbox max for sizing.
  const maxMb = Math.max(...domains.map((d) => d.mailboxCount), 1);
  const minMb = Math.min(...domains.map((d) => d.mailboxCount), 1);
  const mbSpan = Math.max(maxMb - minMb, 1);

  const out: PlacedBlip[] = [];
  for (const status of ['healthy', 'warming', 'at_risk'] as DomainStatus[]) {
    const bucket = buckets[status];
    if (bucket.length === 0) continue;
    const step = bucket.length === 1 ? 0 : SPAN / bucket.length;
    bucket.forEach((domain, i) => {
      const angle = startAngle[status] + i * step;
      const radius = scoreToRadius(domain.reputationScore);
      const t = (domain.mailboxCount - minMb) / mbSpan;
      const r = BLIP_R + t * 8; // 16..24
      out.push({
        domain,
        x: CX + radius * Math.cos(angle),
        y: CY + radius * Math.sin(angle),
        angle,
        r,
        bandIndex: i,
      });
    });
  }
  return out;
}

/**
 * Normalise a radian to [0, 2*PI). Used when comparing the sweep angle
 * (which we track unbounded) against a blip angle for the "illuminated"
 * highlight.
 */
function normRad(a: number): number {
  const tau = Math.PI * 2;
  let r = a % tau;
  if (r < 0) r += tau;
  return r;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRepC1Radar(
  { data }: { data?: AgencyReputationData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const placed = useMemo(() => placeBlips(d.domains), [d.domains]);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(
    null,
  );
  // Track the sweep angle (in radians, 0..2*PI cycling) for blip
  // illumination. framer-motion drives the rotation; we read the value
  // through onUpdate.
  const [sweepAngleRad, setSweepAngleRad] = useState<number>(0);

  const selected = useMemo(
    () =>
      placed.find((p) => p.domain.id === selectedDomainId)?.domain ?? null,
    [placed, selectedDomainId],
  );

  return (
    <div className="space-y-5">
      <PageHeader data={d} />

      {/* Main canvas + inspector grid */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        <div className="relative lg:col-span-8 space-y-4">
          <RadarStage
            data={d}
            placed={placed}
            selectedId={selectedDomainId}
            sweepAngleRad={sweepAngleRad}
            onSelect={setSelectedDomainId}
            onSweepUpdate={setSweepAngleRad}
          />
          <ProviderStrip providers={d.providers} />
        </div>

        <div className="lg:col-span-4">
          <InspectorPanel
            data={d}
            selected={selected}
            onClose={() => setSelectedDomainId(null)}
            onSelectAlert={(domain) => {
              const match = placed.find(
                (p) => p.domain.domain === domain,
              )?.domain;
              if (match) {
                setSelectedDomainId(match.id);
              }
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}

export default AgRepC1Radar;

// ---------------------------------------------------------------------------
// Page header — agency / region / overall score gauge / 24h vitals
// ---------------------------------------------------------------------------

function PageHeader({ data }: { data: AgencyReputationData }): JSX.Element {
  const { agency, summary } = data;
  const totalDomains =
    summary.domainsHealthy + summary.domainsWarming + summary.domainsAtRisk;
  const trendUp = summary.trend7dDelta >= 0;
  return (
    <motion.header
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface/60 px-5 py-4 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-5">
        {/* Left: agency identity + sub-counts */}
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent">
            <Radar className="h-6 w-6" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                {agency.name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
                <Globe className="h-2.5 w-2.5" />
                {agency.region}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent2/30 bg-accent2/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent2">
                <Sparkles className="h-2.5 w-2.5" />
                Reputation
              </span>
            </div>
            <p className="text-sm text-text-dim">
              {totalDomains > 0 ? (
                <>
                  Monitoring{' '}
                  <span className="font-mono text-text">{totalDomains}</span>{' '}
                  sub-client domain{totalDomains === 1 ? '' : 's'} ·{' '}
                  <span className="text-accent">
                    {summary.domainsHealthy} healthy
                  </span>{' '}
                  ·{' '}
                  <span className="text-accent4">
                    {summary.domainsWarming} warming
                  </span>{' '}
                  ·{' '}
                  <span className="text-accent3">
                    {summary.domainsAtRisk} at risk
                  </span>
                </>
              ) : (
                'No domains under management yet'
              )}
            </p>
          </div>
        </div>

        {/* Middle: 24h vital chips */}
        <div className="flex flex-wrap items-center gap-2">
          <VitalChip
            icon={Mail}
            label="24h sends"
            value={formatNumber(summary.totalSends24h)}
            tone="text"
          />
          <VitalChip
            icon={TrendingDown}
            label="Bounce"
            value={`${summary.bouncePct24h.toFixed(1)}%`}
            tone={
              summary.bouncePct24h >= 3
                ? 'accent3'
                : summary.bouncePct24h >= 1.5
                  ? 'accent4'
                  : 'accent'
            }
          />
          <VitalChip
            icon={Siren}
            label="Spam"
            value={`${summary.spamComplaintPct24h.toFixed(2)}%`}
            tone={
              summary.spamComplaintPct24h >= 0.6
                ? 'accent3'
                : summary.spamComplaintPct24h >= 0.3
                  ? 'accent4'
                  : 'accent'
            }
          />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/70 px-3 py-1.5 text-xs">
            <span
              className={`grid h-5 w-5 place-items-center rounded-full ${
                trendUp
                  ? 'bg-accent/15 text-accent'
                  : 'bg-accent3/15 text-accent3'
              }`}
            >
              {trendUp ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
            </span>
            <span className="text-text-dim">7d trend</span>
            <span
              className={`font-mono font-semibold ${
                trendUp ? 'text-accent' : 'text-accent3'
              }`}
            >
              {trendUp ? '+' : ''}
              {summary.trend7dDelta.toFixed(1)}
            </span>
          </span>
        </div>

        {/* Right: overall score gauge */}
        <OverallScoreGauge score={summary.overallScore} />
      </div>
    </motion.header>
  );
}

function VitalChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  tone: 'text' | 'accent' | 'accent3' | 'accent4';
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent3'
        ? 'text-accent3'
        : tone === 'accent4'
          ? 'text-accent4'
          : 'text-text';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface-2/70 px-3 py-1.5 text-xs">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-surface/70 text-text-dim">
        <Icon className="h-3 w-3" />
      </span>
      <span className="text-text-dim">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${toneClass}`}>
        {value}
      </span>
    </span>
  );
}

/**
 * Semicircular gauge that sweeps a needle from 0 → score on mount with a
 * spring transition. Score colour follows the same threshold rules as the
 * status palette (>=80 healthy / 60..79 warming / <60 at-risk).
 */
function OverallScoreGauge({ score }: { score: number }): JSX.Element {
  const clamped = Math.max(0, Math.min(100, score));
  const status: DomainStatus =
    clamped >= 80 ? 'healthy' : clamped >= 60 ? 'warming' : 'at_risk';
  const color = STATUS_HEX[status];
  // Gauge spans -180deg → 0deg (left → right) at the bottom of an arc.
  // Convert score → angle in that range.
  const W = 200;
  const H = 110;
  const CX_G = W / 2;
  const CY_G = H - 10;
  const RADIUS = 80;
  const startA = Math.PI; // 180deg
  const endA = 0; // 0deg
  const sweep = endA - startA;
  // Build the background arc (dim).
  const bgArc = arcPath(CX_G, CY_G, RADIUS, startA, endA);
  // Score arc — animated via pathLength so it draws from 0 → current.
  const scoreArc = arcPath(
    CX_G,
    CY_G,
    RADIUS,
    startA,
    startA + (clamped / 100) * sweep,
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.18 }}
      className="relative shrink-0 rounded-2xl border border-border-muted bg-surface-2/60 px-5 py-3"
    >
      <div className="flex items-center gap-4">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          aria-label={`Overall reputation score ${clamped} of 100`}
          role="img"
        >
          <defs>
            <linearGradient id="agrepc1-gauge-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={HEX.accent3} />
              <stop offset="50%" stopColor={HEX.accent4} />
              <stop offset="100%" stopColor={HEX.accent} />
            </linearGradient>
          </defs>
          {/* dim background track */}
          <path
            d={bgArc}
            stroke={HEX.border}
            strokeWidth={10}
            strokeLinecap="round"
            fill="none"
          />
          {/* tick marks every 10% */}
          {Array.from({ length: 11 }, (_, i) => {
            const t = i / 10;
            const a = startA + sweep * t;
            const r1 = RADIUS - 14;
            const r2 = RADIUS - 6;
            return (
              <line
                key={`tk-${i}`}
                x1={CX_G + r1 * Math.cos(a)}
                y1={CY_G + r1 * Math.sin(a)}
                x2={CX_G + r2 * Math.cos(a)}
                y2={CY_G + r2 * Math.sin(a)}
                stroke={HEX.textFaint}
                strokeOpacity={i % 5 === 0 ? 0.7 : 0.35}
                strokeWidth={i % 5 === 0 ? 1.6 : 1}
              />
            );
          })}
          {/* animated score arc */}
          <motion.path
            d={scoreArc}
            stroke="url(#agrepc1-gauge-grad)"
            strokeWidth={10}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              pathLength: { duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.35 },
              opacity: { duration: 0.4, delay: 0.35 },
            }}
          />
          {/* needle — pivots from 0 to clamped/100 */}
          <motion.g
            initial={{ rotate: -180 }}
            animate={{
              rotate: -180 + (clamped / 100) * 180,
            }}
            transition={{
              type: 'spring',
              stiffness: 90,
              damping: 14,
              mass: 0.8,
              delay: 0.4,
            }}
            style={{ transformOrigin: `${CX_G}px ${CY_G}px` }}
          >
            <line
              x1={CX_G}
              y1={CY_G}
              x2={CX_G + RADIUS - 4}
              y2={CY_G}
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <circle
              cx={CX_G + RADIUS - 4}
              cy={CY_G}
              r={3.4}
              fill={color}
            />
          </motion.g>
          {/* hub */}
          <circle cx={CX_G} cy={CY_G} r={6} fill={HEX.surface} stroke={color} strokeWidth={1.6} />
        </svg>
        <div className="flex flex-col items-start leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Overall score
          </span>
          <motion.span
            key={clamped}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.55 }}
            className="font-mono text-3xl font-semibold tabular-nums"
            style={{ color }}
          >
            {clamped}
          </motion.span>
          <span className="text-[11px] text-text-faint">
            /100 ·{' '}
            <span style={{ color }}>{STATUS_LABEL[status]}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Build an SVG arc path from `(cx, cy)` at radius `r`, sweeping from angle
 * `a0` to `a1` (radians). Always renders a single arc segment — caller
 * guarantees |a1 - a0| <= PI.
 */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const largeArc = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} ${sweep} ${x1} ${y1}`;
}

// ---------------------------------------------------------------------------
// Radar stage — sonar SVG scope with sweep + blips
// ---------------------------------------------------------------------------

function RadarStage({
  data,
  placed,
  selectedId,
  sweepAngleRad,
  onSelect,
  onSweepUpdate,
}: {
  data: AgencyReputationData;
  placed: PlacedBlip[];
  selectedId: string | null;
  sweepAngleRad: number;
  onSelect: (id: string | null) => void;
  onSweepUpdate: (rad: number) => void;
}): JSX.Element {
  const hasDomains = placed.length > 0;

  return (
    <div className="relative h-[640px] w-full overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      {/* Faint phosphor-screen gradient behind the radar */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[88%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(circle at center, ${HEX.accent2}1a 0%, ${HEX.accent2}06 45%, transparent 75%)`,
        }}
      />

      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Radar sweep showing sub-client domain reputation. Domains closer to centre have higher reputation; outer ring shows at-risk domains."
      >
        <defs>
          {/* Sweep gradient — a trailing wedge that fades from solid to invisible */}
          <linearGradient id="agrepc1-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0} />
            <stop offset="40%" stopColor={HEX.accent} stopOpacity={0.05} />
            <stop offset="80%" stopColor={HEX.accent} stopOpacity={0.22} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0.55} />
          </linearGradient>

          {/* Wedge fill for the rotating sweep trail */}
          <radialGradient id="agrepc1-sweep-wedge" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.55} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
          </radialGradient>

          <radialGradient id="agrepc1-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent2} stopOpacity={0.55} />
            <stop offset="100%" stopColor={HEX.accent2} stopOpacity={0} />
          </radialGradient>

          {/* Healthy ring tint */}
          <radialGradient id="agrepc1-healthy-tint" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HEX.accent} stopOpacity={0.1} />
            <stop offset="100%" stopColor={HEX.accent} stopOpacity={0} />
          </radialGradient>

          <pattern
            id="agrepc1-grid"
            x="0"
            y="0"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.9" fill={HEX.border} fillOpacity={0.55} />
          </pattern>

          {/* Clip path so the sweep wedge can't escape the outer screen edge. */}
          <clipPath id="agrepc1-screen-clip">
            <circle cx={CX} cy={CY} r={RING_EDGE} />
          </clipPath>
        </defs>

        {/* Faint dot grid */}
        <rect
          x={0}
          y={0}
          width={VB}
          height={VB}
          fill="url(#agrepc1-grid)"
          opacity={0.4}
        />

        {/* Healthy band soft tint (innermost circle) */}
        <circle cx={CX} cy={CY} r={RING_INNER} fill="url(#agrepc1-healthy-tint)" />

        {/* Concentric guide rings */}
        {[RING_INNER, RING_MID, RING_OUTER, RING_EDGE].map((r, i) => (
          <circle
            key={`ring-${r}`}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={HEX.accent2}
            strokeOpacity={i === 3 ? 0.45 : 0.22}
            strokeWidth={i === 3 ? 1.4 : 1}
            strokeDasharray={i === 3 ? '6 6' : '2 8'}
          />
        ))}

        {/* Band labels (right side of each ring) */}
        <BandLabels />

        {/* N/S/E/W crosshairs */}
        <Crosshairs />

        {/* Angle tick marks around the outer screen edge */}
        <AngleTicks />

        {/* Sweep wedge — clipped so it never escapes the screen */}
        <g clipPath="url(#agrepc1-screen-clip)">
          <SweepWedge onUpdate={onSweepUpdate} />
        </g>

        {/* Blips */}
        {placed.map((p) => (
          <BlipNode
            key={p.domain.id}
            placed={p}
            selected={selectedId === p.domain.id}
            sweepAngleRad={sweepAngleRad}
            onSelect={() =>
              onSelect(p.domain.id === selectedId ? null : p.domain.id)
            }
          />
        ))}

        {/* Centre target — the agency */}
        <CenterTarget agency={data.agency} />
      </svg>

      {/* Overlay legend (top-left) */}
      <RadarLegend />

      {/* Overlay status counter (top-right) */}
      <RadarReadout placed={placed} />

      {/* Empty state */}
      {!hasDomains && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="max-w-sm rounded-2xl border border-border-muted bg-surface-2/70 px-6 py-8 text-center backdrop-blur-xl">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent mx-auto">
              <Radar className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-text">
              No domains on the scope yet
            </p>
            <p className="mt-1 text-xs text-text-dim">
              Once your sub-clients connect mailboxes, their domains will
              appear as blips on this radar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Three small text labels along the right radius that explain what each
 * concentric ring represents. Acts as the radar's reading guide.
 */
function BandLabels(): JSX.Element {
  // Place labels along the positive-y axis (south) so they don't collide
  // with the readout overlay.
  return (
    <g>
      {/* Healthy band (centre side) */}
      <g>
        <line
          x1={CX + 8}
          y1={CY + RING_INNER - 30}
          x2={CX + 90}
          y2={CY + RING_INNER - 30}
          stroke={HEX.accent}
          strokeOpacity={0.3}
          strokeWidth={0.8}
          strokeDasharray="2 4"
        />
        <text
          x={CX + 96}
          y={CY + RING_INNER - 26}
          fill={HEX.accent}
          fillOpacity={0.85}
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1.4,
          }}
        >
          HEALTHY ≥80
        </text>
      </g>
      {/* Warming band */}
      <g>
        <line
          x1={CX + 8}
          y1={CY + RING_MID - 30}
          x2={CX + 90}
          y2={CY + RING_MID - 30}
          stroke={HEX.accent4}
          strokeOpacity={0.3}
          strokeWidth={0.8}
          strokeDasharray="2 4"
        />
        <text
          x={CX + 96}
          y={CY + RING_MID - 26}
          fill={HEX.accent4}
          fillOpacity={0.85}
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1.4,
          }}
        >
          WARMING 60-79
        </text>
      </g>
      {/* At-risk band */}
      <g>
        <line
          x1={CX + 8}
          y1={CY + RING_OUTER - 30}
          x2={CX + 90}
          y2={CY + RING_OUTER - 30}
          stroke={HEX.accent3}
          strokeOpacity={0.3}
          strokeWidth={0.8}
          strokeDasharray="2 4"
        />
        <text
          x={CX + 96}
          y={CY + RING_OUTER - 26}
          fill={HEX.accent3}
          fillOpacity={0.85}
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1.4,
          }}
        >
          AT RISK &lt;60
        </text>
      </g>
    </g>
  );
}

function Crosshairs(): JSX.Element {
  return (
    <g>
      <line
        x1={CX - RING_EDGE}
        y1={CY}
        x2={CX + RING_EDGE}
        y2={CY}
        stroke={HEX.accent2}
        strokeOpacity={0.18}
        strokeWidth={1}
      />
      <line
        x1={CX}
        y1={CY - RING_EDGE}
        x2={CX}
        y2={CY + RING_EDGE}
        stroke={HEX.accent2}
        strokeOpacity={0.18}
        strokeWidth={1}
      />
      {/* Cardinal direction labels */}
      {[
        { label: 'N', x: CX, y: CY - RING_EDGE - 8, anchor: 'middle' },
        { label: 'S', x: CX, y: CY + RING_EDGE + 18, anchor: 'middle' },
        { label: 'E', x: CX + RING_EDGE + 14, y: CY + 4, anchor: 'start' },
        { label: 'W', x: CX - RING_EDGE - 14, y: CY + 4, anchor: 'end' },
      ].map((c) => (
        <text
          key={c.label}
          x={c.x}
          y={c.y}
          textAnchor={c.anchor as 'middle' | 'start' | 'end'}
          fill={HEX.textFaint}
          style={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1.5,
          }}
        >
          {c.label}
        </text>
      ))}
    </g>
  );
}

function AngleTicks(): JSX.Element {
  // 36 ticks every 10 degrees — longer every 30deg, longest at the cardinals.
  return (
    <g>
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i * 10 * Math.PI) / 180;
        const isCardinal = i % 9 === 0; // 0, 90, 180, 270deg
        const isMajor = i % 3 === 0;
        const long = isCardinal ? 18 : isMajor ? 12 : 6;
        const r1 = RING_EDGE - long;
        const r2 = RING_EDGE - 1;
        return (
          <line
            key={`tk-${i}`}
            x1={CX + r1 * Math.cos(a)}
            y1={CY + r1 * Math.sin(a)}
            x2={CX + r2 * Math.cos(a)}
            y2={CY + r2 * Math.sin(a)}
            stroke={HEX.accent2}
            strokeOpacity={isMajor ? 0.45 : 0.2}
            strokeWidth={isCardinal ? 1.4 : isMajor ? 1.1 : 0.8}
          />
        );
      })}
    </g>
  );
}

/**
 * The continuous sweep wedge. Rotates 360° every 4.5s linearly and reports
 * its current angle to the parent via onUpdate so blips can light up as the
 * sweep crosses them. Built as a triangular wedge (centre → two outer rim
 * points spanning ~70deg) plus a brighter leading edge line.
 */
function SweepWedge({
  onUpdate,
}: {
  onUpdate: (rad: number) => void;
}): JSX.Element {
  // Wedge geometry: centre at (CX, CY), leading edge along the y-axis up
  // (i.e. the 12 o'clock direction) before rotation, trailing edge at
  // -70deg from the leading edge. With rotation animation this whole shape
  // pivots around (CX, CY).
  const WEDGE_ARC = (70 * Math.PI) / 180; // 70deg wedge
  const r = RING_EDGE + 30; // overshoot a touch — clipped by screen circle
  // Leading edge direction at angle 0 = pointing UP (negative y).
  const leadAng = -Math.PI / 2;
  const trailAng = leadAng - WEDGE_ARC;
  const lx = CX + r * Math.cos(leadAng);
  const ly = CY + r * Math.sin(leadAng);
  const tx = CX + r * Math.cos(trailAng);
  const ty = CY + r * Math.sin(trailAng);
  // Sweep arc between leading and trailing on the outer rim — uses arc cmd.
  const wedgePath = `M ${CX} ${CY} L ${lx} ${ly} A ${r} ${r} 0 0 0 ${tx} ${ty} Z`;

  // framer-motion's onUpdate fires every frame — that would trigger a
  // re-render of every blip 60×/s. Throttle to ~5deg granularity: roughly
  // one update every ~60ms at 4.5s/rev. The blip illumination is a soft
  // visual cue, not pixel-accurate hit-testing, so 5deg is plenty.
  const lastBucketRef = useRef<number>(-1);
  const STEP_DEG = 5;

  return (
    <motion.g
      initial={{ rotate: 0 }}
      animate={{ rotate: 360 }}
      transition={{ duration: 4.5, ease: 'linear', repeat: Infinity }}
      style={{ transformOrigin: `${CX}px ${CY}px` }}
      onUpdate={(latest) => {
        // framer-motion passes a record of all animated values. `rotate`
        // accumulates beyond 360 (then resets on the next loop). Convert to
        // radians and normalise so the parent can compare against blip
        // angles cheaply.
        const rot = latest['rotate'];
        if (typeof rot !== 'number') return;
        const bucket = Math.floor(((rot % 360) + 360) % 360 / STEP_DEG);
        if (bucket === lastBucketRef.current) return;
        lastBucketRef.current = bucket;
        // The sweep's LEADING edge sits at leadAng (-PI/2 in wedge-local
        // coords) when rotate=0. After rotation by `rot` degrees, the
        // leading edge in world space is leadAng + rot.
        const rad = leadAng + (rot * Math.PI) / 180;
        onUpdate(normRad(rad));
      }}
    >
      {/* Trailing wedge (the fading "afterglow" behind the leading line) */}
      <path
        d={wedgePath}
        fill="url(#agrepc1-sweep-wedge)"
        opacity={0.85}
      />
      {/* Bright leading edge line */}
      <line
        x1={CX}
        y1={CY}
        x2={lx}
        y2={ly}
        stroke={HEX.accent}
        strokeWidth={2.2}
        strokeOpacity={0.95}
      />
      {/* Tiny tip glow on the leading edge */}
      <circle
        cx={lx}
        cy={ly}
        r={3}
        fill={HEX.accent}
        opacity={0.9}
      />
    </motion.g>
  );
}

/**
 * Centre "target" glyph — the agency itself. Concentric rings with a
 * Crosshair icon. Acts as the visual anchor for the radar.
 */
function CenterTarget({
  agency,
}: {
  agency: AgencyReputationData['agency'];
}): JSX.Element {
  return (
    <g>
      {/* Soft bloom behind centre */}
      <circle cx={CX} cy={CY} r={70} fill="url(#agrepc1-center)" />
      {/* Expanding pulse — fires every 3s */}
      <motion.circle
        cx={CX}
        cy={CY}
        r={42}
        fill="none"
        stroke={HEX.accent2}
        strokeWidth={1.6}
        initial={{ scale: 1, opacity: 0.55 }}
        animate={{ scale: 2.6, opacity: 0 }}
        transition={{ duration: 3, ease: 'easeOut', repeat: Infinity }}
        style={{ transformOrigin: `${CX}px ${CY}px` }}
      />
      {/* Outer ring */}
      <circle
        cx={CX}
        cy={CY}
        r={50}
        fill={HEX.surface}
        stroke={HEX.accent2}
        strokeOpacity={0.7}
        strokeWidth={1.4}
      />
      {/* Inner ring */}
      <circle
        cx={CX}
        cy={CY}
        r={32}
        fill="none"
        stroke={HEX.accent2}
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      {/* Crosshair icon */}
      <foreignObject x={CX - 14} y={CY - 14} width={28} height={28}>
        <div className="flex h-full w-full items-center justify-center text-accent2">
          <Crosshair className="h-6 w-6" />
        </div>
      </foreignObject>
      {/* Agency label under the target */}
      <text
        x={CX}
        y={CY + 70}
        textAnchor="middle"
        fill={HEX.textDim}
        style={{
          fontSize: 11,
          letterSpacing: 2,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 600,
        }}
      >
        {agency.name.toUpperCase()}
      </text>
    </g>
  );
}

/**
 * A single domain blip on the radar.
 *
 * - Resting state: a small disc with a status-coloured ring.
 * - At-risk: continuous pulse halo (scale 1 → 1.3 → 1).
 * - Selected: sonar ping ring expands outward (scale 1 → 2, opacity 0.8 → 0).
 * - "Illuminated" when the sweep angle is within ~30deg behind it (just
 *   crossed). The illumination intensity decays as the sweep moves on.
 */
function BlipNode({
  placed,
  selected,
  sweepAngleRad,
  onSelect,
}: {
  placed: PlacedBlip;
  selected: boolean;
  sweepAngleRad: number;
  onSelect: () => void;
}): JSX.Element {
  const { domain, x, y, angle, r } = placed;
  const color = STATUS_HEX[domain.status];
  const isAtRisk = domain.status === 'at_risk';

  // Compute illumination factor: how recently did the sweep cross this
  // blip's angle? The sweep's leading edge points at sweepAngleRad. We want
  // illumination when the blip is in the wedge BEHIND the leading edge
  // (i.e. the leading edge has just passed). Wedge spans ~70deg.
  const blipAng = normRad(angle);
  const sweepAng = normRad(sweepAngleRad);
  // Signed distance: how far the sweep has moved past the blip (positive)
  // or how far ahead the blip still is (negative).
  let delta = sweepAng - blipAng;
  if (delta < -Math.PI) delta += Math.PI * 2;
  if (delta > Math.PI) delta -= Math.PI * 2;
  // Illumination window: sweep just passed (delta in [0, ~70deg]).
  const wedgeRad = (70 * Math.PI) / 180;
  let illum = 0;
  if (delta >= 0 && delta <= wedgeRad) {
    illum = 1 - delta / wedgeRad; // 1 at leading edge → 0 at trailing edge
  }

  return (
    <motion.g
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        transformOrigin: `${x}px ${y}px`,
        cursor: 'pointer',
      }}
      onClick={onSelect}
      tabIndex={0}
      role="button"
      aria-label={`${domain.domain} (${domain.subClientName}), reputation ${domain.reputationScore}, ${STATUS_LABEL[domain.status]}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* At-risk pulse — continuous halo for danger */}
      {isAtRisk && (
        <motion.circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={HEX.accent3}
          strokeWidth={2}
          initial={{ scale: 1, opacity: 0.65 }}
          animate={{ scale: 1.3, opacity: 0 }}
          transition={{ duration: 2, ease: 'easeOut', repeat: Infinity }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        />
      )}
      {/* Sonar ping — only when selected */}
      {selected && (
        <>
          <motion.circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={1.8}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeOut', repeat: Infinity }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
          <motion.circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 2.6, opacity: 0 }}
            transition={{
              duration: 1.5,
              delay: 0.5,
              ease: 'easeOut',
              repeat: Infinity,
            }}
            style={{ transformOrigin: `${x}px ${y}px` }}
          />
        </>
      )}

      {/* Selection focus ring */}
      {selected && (
        <circle
          cx={x}
          cy={y}
          r={r + 8}
          fill="none"
          stroke={color}
          strokeOpacity={0.7}
          strokeWidth={2}
        />
      )}

      {/* Sweep-induced glow (decays with `illum`) */}
      {illum > 0 && !selected && (
        <circle
          cx={x}
          cy={y}
          r={r + 6 + illum * 8}
          fill={color}
          fillOpacity={illum * 0.32}
        />
      )}

      {/* Outer soft glow */}
      <circle
        cx={x}
        cy={y}
        r={r + 4}
        fill={color}
        fillOpacity={selected ? 0.28 : 0.12 + illum * 0.18}
      />
      {/* Disc */}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={HEX.surface2}
        stroke={color}
        strokeWidth={selected ? 2.4 : 1.6}
        strokeOpacity={Math.max(0.7, illum)}
      />
      {/* Score number inside the disc */}
      <text
        x={x}
        y={y + r * 0.3}
        textAnchor="middle"
        fill={color}
        style={{
          fontSize: r * 0.85,
          fontWeight: 700,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {domain.reputationScore}
      </text>
      {/* Mailbox-count chip beneath the disc */}
      <g>
        <rect
          x={x - 32}
          y={y + r + 6}
          width={64}
          height={16}
          rx={8}
          fill={HEX.surface2}
          stroke={color}
          strokeOpacity={0.45}
          strokeWidth={1}
        />
        <text
          x={x}
          y={y + r + 17}
          textAnchor="middle"
          fill={color}
          style={{
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 0.4,
          }}
        >
          {domain.mailboxCount}mb
        </text>
      </g>
      {/* Domain name below the chip */}
      <text
        x={x}
        y={y + r + 36}
        textAnchor="middle"
        fill={selected ? HEX.text : HEX.textDim}
        style={{
          fontSize: 12,
          fontWeight: selected ? 700 : 500,
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {domain.domain}
      </text>
    </motion.g>
  );
}

/**
 * Floating legend explaining the radar scale + bands. Sits in the top-left
 * of the canvas, framer-motion fades in after the radar settles.
 */
function RadarLegend(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.9 }}
      className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        <Radar className="h-3 w-3 text-accent2" />
        Sonar scope
      </span>
      <span className="flex items-center gap-2 text-xs text-text">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
        Healthy ≥ 80
      </span>
      <span className="flex items-center gap-2 text-xs text-text">
        <span className="h-2.5 w-2.5 rounded-full bg-accent4" aria-hidden />
        Warming 60-79
      </span>
      <span className="flex items-center gap-2 text-xs text-text">
        <span className="h-2.5 w-2.5 rounded-full bg-accent3" aria-hidden />
        At risk &lt; 60
      </span>
      <span className="mt-1 flex items-start gap-2 border-t border-border-muted pt-2 text-[10px] text-text-faint">
        <Crosshair className="mt-0.5 h-3 w-3 text-text-faint" />
        Closer to centre = better reputation
      </span>
    </motion.div>
  );
}

/**
 * Counter chip in the top-right of the canvas — live tallies of healthy /
 * warming / at_risk for the visible domains.
 */
function RadarReadout({ placed }: { placed: PlacedBlip[] }): JSX.Element {
  const counts = useMemo(() => {
    const c: Record<DomainStatus, number> = {
      healthy: 0,
      warming: 0,
      at_risk: 0,
    };
    for (const p of placed) {
      c[p.domain.status] += 1;
    }
    return c;
  }, [placed]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.95 }}
      className="pointer-events-none absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-border-muted bg-surface/80 px-3.5 py-2 backdrop-blur-xl"
    >
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        <Radio className="h-3 w-3 text-accent" />
        Contacts
      </span>
      <span className="h-4 w-px bg-border-muted" aria-hidden />
      <ReadoutChip label="HEAL" value={counts.healthy} status="healthy" />
      <ReadoutChip label="WARM" value={counts.warming} status="warming" />
      <ReadoutChip label="RISK" value={counts.at_risk} status="at_risk" />
    </motion.div>
  );
}

function ReadoutChip({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: DomainStatus;
}): JSX.Element {
  const color = STATUS_HEX[status];
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span
        className="font-mono text-[10px] uppercase"
        style={{ color }}
      >
        {label}
      </span>
      <span
        className="font-mono text-xs font-semibold tabular-nums"
        style={{ color }}
      >
        {value.toString().padStart(2, '0')}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Provider strip — horizontal bar chart by provider (Gmail/Outlook/Yahoo)
// ---------------------------------------------------------------------------

function ProviderStrip({
  providers,
}: {
  providers: AgencyReputationData['providers'];
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.5 }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-4 backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-accent2/30 bg-accent2/10 text-accent2">
            <Inbox className="h-3.5 w-3.5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text">
              Provider placement
            </span>
            <span className="text-[11px] text-text-dim">
              Last 24h inbox / spam / blocked split by provider
            </span>
          </div>
        </div>
        <span className="hidden items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-text-dim md:flex">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            Inbox
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent4" aria-hidden />
            Spam
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent3" aria-hidden />
            Blocked
          </span>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {providers.length === 0 ? (
          <div className="md:col-span-3 rounded-xl border border-dashed border-border-muted bg-surface-2/40 px-4 py-6 text-center text-xs text-text-dim">
            No provider data yet.
          </div>
        ) : (
          providers.map((p, i) => (
            <ProviderCard key={p.id} provider={p} index={i} />
          ))
        )}
      </div>
    </motion.div>
  );
}

function ProviderCard({
  provider,
  index,
}: {
  provider: AgencyReputationData['providers'][number];
  index: number;
}): JSX.Element {
  // Inbox % is the primary "good" metric. If it's below 75 the provider is
  // borderline; below 60 it's actively bad. This drives the headline tint.
  const tint: DomainStatus =
    provider.inboxPct >= 80
      ? 'healthy'
      : provider.inboxPct >= 65
        ? 'warming'
        : 'at_risk';
  const tintClass = STATUS_TEXT_CLASS[tint];
  const tintColor = STATUS_HEX[tint];
  const other = 100 - provider.inboxPct - provider.spamPct - provider.blockedPct;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.6 + index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="relative overflow-hidden rounded-xl border border-border-muted bg-surface-2/60 p-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ProviderIcon label={provider.label} color={tintColor} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text">
              {provider.label}
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {formatNumber(provider.last24hSends)} sends · 24h
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Inbox
          </span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 + index * 0.08, duration: 0.4 }}
            className={`font-mono text-xl font-semibold tabular-nums ${tintClass}`}
          >
            {provider.inboxPct.toFixed(0)}%
          </motion.span>
        </div>
      </div>
      {/* Stacked bar */}
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface ring-1 ring-border-muted">
        <div className="flex h-full w-full">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${provider.inboxPct}%` }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.7 + index * 0.08,
            }}
            className="bg-accent"
            aria-label={`Inbox ${provider.inboxPct}%`}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${provider.spamPct}%` }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.85 + index * 0.08,
            }}
            className="bg-accent4"
            aria-label={`Spam ${provider.spamPct}%`}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${provider.blockedPct}%` }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1],
              delay: 1.0 + index * 0.08,
            }}
            className="bg-accent3"
            aria-label={`Blocked ${provider.blockedPct}%`}
          />
          {/* `other` fills the remainder so the bar is always full-width */}
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, other)}%` }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1],
              delay: 1.15 + index * 0.08,
            }}
            className="bg-border-muted/60"
            aria-hidden
          />
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <ProviderStat
          label="Spam"
          value={`${provider.spamPct.toFixed(1)}%`}
          tone={
            provider.spamPct >= 3.5
              ? 'text-accent3'
              : provider.spamPct >= 1.5
                ? 'text-accent4'
                : 'text-accent'
          }
        />
        <ProviderStat
          label="Blocked"
          value={`${provider.blockedPct.toFixed(1)}%`}
          tone={
            provider.blockedPct >= 1
              ? 'text-accent3'
              : provider.blockedPct >= 0.5
                ? 'text-accent4'
                : 'text-accent'
          }
        />
        <ProviderStat
          label="Reach"
          value={formatNumber(provider.last24hSends)}
          tone="text-text"
        />
      </div>
    </motion.div>
  );
}

function ProviderStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}): JSX.Element {
  return (
    <span className="flex flex-col rounded-lg border border-border-muted bg-surface/60 px-2 py-1 leading-tight">
      <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        {label}
      </span>
      <span className={`font-mono text-xs font-semibold tabular-nums ${tone}`}>
        {value}
      </span>
    </span>
  );
}

/**
 * Generic provider letter glyph — first letter of the provider name on a
 * tinted disc. Avoids needing a real logo while still being recognisable.
 */
function ProviderIcon({
  label,
  color,
}: {
  label: string;
  color: string;
}): JSX.Element {
  const letter = label.charAt(0).toUpperCase();
  return (
    <span
      className="grid h-8 w-8 place-items-center rounded-lg border font-mono text-sm font-bold"
      style={{
        background: `${color}1a`,
        borderColor: `${color}66`,
        color,
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel — selection-aware right column
// ---------------------------------------------------------------------------

function InspectorPanel({
  data,
  selected,
  onClose,
  onSelectAlert,
}: {
  data: AgencyReputationData;
  selected: AgencyReputationData['domains'][number] | null;
  onClose: () => void;
  onSelectAlert: (domain: string) => void;
}): JSX.Element {
  return (
    <div className="relative h-[640px] overflow-hidden rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl">
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <DomainInspector domain={selected} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
            className="flex h-full flex-col overflow-y-auto overscroll-contain"
          >
            <InspectorEmpty
              data={data}
              onSelectAlert={onSelectAlert}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Empty inspector — no domain selected. Shows the agency summary + the
 * recent alerts feed. Clicking a recent alert promotes that domain to the
 * selected state via onSelectAlert.
 */
function InspectorEmpty({
  data,
  onSelectAlert,
}: {
  data: AgencyReputationData;
  onSelectAlert: (domain: string) => void;
}): JSX.Element {
  const { summary, recentAlerts } = data;
  return (
    <div className="flex h-full flex-col">
      {/* Header — empty-state title */}
      <div className="border-b border-border-muted px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-accent2/30 bg-accent2/10 text-accent2">
            <Radar className="h-4 w-4" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-text">
              Agency vitals
            </span>
            <span className="text-[11px] text-text-dim">
              Click a blip to inspect a domain
            </span>
          </div>
        </div>
      </div>
      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4">
        <SummaryStat
          label="Overall"
          value={summary.overallScore.toString()}
          sub="/100"
          tone={
            summary.overallScore >= 80
              ? 'accent'
              : summary.overallScore >= 60
                ? 'accent4'
                : 'accent3'
          }
        />
        <SummaryStat
          label="7d trend"
          value={`${summary.trend7dDelta >= 0 ? '+' : ''}${summary.trend7dDelta.toFixed(1)}`}
          tone={summary.trend7dDelta >= 0 ? 'accent' : 'accent3'}
        />
        <SummaryStat
          label="Sends 24h"
          value={formatNumber(summary.totalSends24h)}
          tone="text"
        />
        <SummaryStat
          label="Bounce 24h"
          value={`${summary.bouncePct24h.toFixed(1)}%`}
          tone={
            summary.bouncePct24h >= 3
              ? 'accent3'
              : summary.bouncePct24h >= 1.5
                ? 'accent4'
                : 'accent'
          }
        />
      </div>
      {/* Domain distribution donut */}
      <div className="px-5 pb-3">
        <DomainDistribution summary={summary} />
      </div>
      {/* Recent alerts feed */}
      <div className="flex-1 border-t border-border-muted px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md border border-accent3/30 bg-accent3/10 text-accent3">
              <Siren className="h-3 w-3" />
            </span>
            <span className="text-sm font-semibold text-text">
              Recent alerts
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
            {recentAlerts.length} active
          </span>
        </div>
        <div className="space-y-2">
          {recentAlerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-muted bg-surface-2/40 px-4 py-6 text-center text-xs text-text-dim">
              No recent alerts.
            </div>
          ) : (
            recentAlerts.map((a, i) => (
              <RecentAlertRow
                key={a.id}
                alert={a}
                index={i}
                onSelect={() => onSelectAlert(a.domain)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: 'text' | 'accent' | 'accent3' | 'accent4';
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent3'
        ? 'text-accent3'
        : tone === 'accent4'
          ? 'text-accent4'
          : 'text-text';
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        {label}
      </span>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`font-mono text-xl font-semibold tabular-nums ${toneClass}`}>
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[10px] text-text-faint">{sub}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Compact horizontal "donut" — really a stacked horizontal bar with each
 * status taking its proportional width.
 */
function DomainDistribution({
  summary,
}: {
  summary: AgencyReputationData['summary'];
}): JSX.Element {
  const total =
    summary.domainsHealthy + summary.domainsWarming + summary.domainsAtRisk;
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-muted bg-surface-2/40 px-3 py-3 text-center text-[11px] text-text-dim">
        No domains yet.
      </div>
    );
  }
  const hPct = (summary.domainsHealthy / total) * 100;
  const wPct = (summary.domainsWarming / total) * 100;
  const aPct = (summary.domainsAtRisk / total) * 100;
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
          Domain mix
        </span>
        <span className="font-mono text-[10px] text-text-dim">
          {total} total
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface ring-1 ring-border-muted">
        <div className="flex h-full w-full">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${hPct}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
            className="bg-accent"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${wPct}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
            className="bg-accent4"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${aPct}%` }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.55 }}
            className="bg-accent3"
          />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          <span className="text-text-dim">Healthy</span>
          <span className="ml-auto font-mono font-semibold text-accent tabular-nums">
            {summary.domainsHealthy}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent4" aria-hidden />
          <span className="text-text-dim">Warming</span>
          <span className="ml-auto font-mono font-semibold text-accent4 tabular-nums">
            {summary.domainsWarming}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent3" aria-hidden />
          <span className="text-text-dim">At risk</span>
          <span className="ml-auto font-mono font-semibold text-accent3 tabular-nums">
            {summary.domainsAtRisk}
          </span>
        </span>
      </div>
    </div>
  );
}

function RecentAlertRow({
  alert,
  index,
  onSelect,
}: {
  alert: AgencyReputationData['recentAlerts'][number];
  index: number;
  onSelect: () => void;
}): JSX.Element {
  const Icon = ALERT_KIND_ICON[alert.kind];
  const sevClass = ALERT_SEVERITY_CLASS[alert.severity];
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.32,
        delay: 0.2 + index * 0.07,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-surface-2/80 ${sevClass}`}
    >
      <span
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${sevClass}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs font-semibold text-text">
            {alert.domain}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">
            · {ALERT_KIND_LABEL[alert.kind]}
          </span>
        </span>
        <span className="mt-0.5 text-[11px] text-text-dim line-clamp-2">
          {alert.message}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-text-faint">
          <Activity className="h-2.5 w-2.5" />
          {alert.ago}
        </span>
      </span>
    </motion.button>
  );
}

/**
 * Per-domain inspector — full detail card for the selected blip.
 *
 * Contents: header with domain + close button, large score readout + status
 * chip, DNS chips, inbox/spam gauge, 7-day sparkline (draws-in pathLength
 * 0→1), latest incident.
 */
function DomainInspector({
  domain,
  onClose,
}: {
  domain: AgencyReputationData['domains'][number];
  onClose: () => void;
}): JSX.Element {
  const status = domain.status;
  const statusColor = STATUS_HEX[status];
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border-muted px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-dim">
              {domain.subClientName}
            </span>
            <h2 className="mt-0.5 truncate font-mono text-base font-semibold text-text">
              {domain.domain}
            </h2>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${STATUS_RING_CLASS[status]}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: statusColor }}
                  aria-hidden
                />
                {STATUS_LABEL[status]}
              </span>
              <span className="font-mono text-[10px] text-text-dim">
                {domain.mailboxCount} mailbox
                {domain.mailboxCount === 1 ? '' : 'es'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border-muted bg-surface-2/60 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
            aria-label="Close inspector"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Score readout */}
      <div className="px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Reputation
            </span>
            <motion.span
              key={domain.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="font-mono text-4xl font-semibold tabular-nums"
              style={{ color: statusColor }}
            >
              {domain.reputationScore}
            </motion.span>
            <span className="text-[11px] text-text-faint">/ 100</span>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Range
            </span>
            <span className="font-mono text-xs text-text-dim">
              7d min:{' '}
              <span className="text-text">
                {Math.min(...domain.last7dScores)}
              </span>
            </span>
            <span className="font-mono text-xs text-text-dim">
              7d max:{' '}
              <span className="text-text">
                {Math.max(...domain.last7dScores)}
              </span>
            </span>
          </div>
        </div>
        {/* Score bar */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface ring-1 ring-border-muted">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${domain.reputationScore}%` }}
            transition={{
              duration: 0.9,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.25,
            }}
            className="h-full"
            style={{ background: statusColor }}
          />
        </div>
      </div>

      {/* DNS chips */}
      <div className="px-5 pb-1">
        <div className="mb-2 flex items-center gap-2">
          <Shield className="h-3.5 w-3.5 text-accent2" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Authentication
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DnsChip label="SPF" pass={domain.spfPass} />
          <DnsChip label="DKIM" pass={domain.dkimPass} />
          <DnsChip label="DMARC" pass={domain.dmarcPass} />
        </div>
      </div>

      {/* Inbox vs spam */}
      <div className="px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Inbox className="h-3.5 w-3.5 text-accent2" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Placement
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PlacementCell
            label="Inbox"
            value={domain.inboxRatePct}
            tone={
              domain.inboxRatePct >= 80
                ? 'accent'
                : domain.inboxRatePct >= 65
                  ? 'accent4'
                  : 'accent3'
            }
          />
          <PlacementCell
            label="Spam"
            value={domain.spamFolderPct}
            tone={
              domain.spamFolderPct >= 5
                ? 'accent3'
                : domain.spamFolderPct >= 2.5
                  ? 'accent4'
                  : 'accent'
            }
            inverse
          />
        </div>
      </div>

      {/* 7-day sparkline */}
      <div className="px-5 pb-4">
        <div className="mb-2 flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-accent2" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            7-day reputation
          </span>
        </div>
        <ScoreSparkline scores={domain.last7dScores} status={status} />
      </div>

      {/* Latest incident */}
      <div className="border-t border-border-muted px-5 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-accent4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            Latest incident
          </span>
        </div>
        <LastIncidentBlock
          ago={domain.lastIncidentAgo}
          kind={domain.lastIncidentKind}
        />
      </div>

      {/* CTA buttons */}
      <div className="mt-auto border-t border-border-muted px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Building2 className="h-3 w-3" />
            Open sub-client
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/60 px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Mail className="h-3 w-3" />
            Run diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

function DnsChip({
  label,
  pass,
}: {
  label: string;
  pass: boolean;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 ${
        pass
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      <span className="flex items-center gap-1.5">
        {pass ? (
          <ShieldCheck className="h-3.5 w-3.5" />
        ) : (
          <ShieldAlert className="h-3.5 w-3.5" />
        )}
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </span>
      <span className="font-mono text-[10px] font-semibold">
        {pass ? 'PASS' : 'FAIL'}
      </span>
    </span>
  );
}

function PlacementCell({
  label,
  value,
  tone,
  inverse,
}: {
  label: string;
  value: number;
  tone: 'accent' | 'accent3' | 'accent4';
  inverse?: boolean;
}): JSX.Element {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent3'
        ? 'text-accent3'
        : 'text-accent4';
  const barColor =
    tone === 'accent'
      ? HEX.accent
      : tone === 'accent3'
        ? HEX.accent3
        : HEX.accent4;
  // For inverse metrics (spam) we want the bar to fill PROPORTIONALLY to
  // how bad it is — but capped at 100. For inbox we just show the raw %.
  const barPct = inverse ? Math.min(value * 5, 100) : value;
  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
        {label}
      </span>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={`font-mono text-lg font-semibold tabular-nums ${toneClass}`}>
          {value.toFixed(1)}
        </span>
        <span className="font-mono text-[10px] text-text-faint">%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface ring-1 ring-border-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barPct}%` }}
          transition={{
            duration: 0.9,
            ease: [0.22, 1, 0.36, 1],
            delay: 0.35,
          }}
          className="h-full"
          style={{ background: barColor }}
        />
      </div>
    </div>
  );
}

/**
 * Hand-rolled SVG sparkline — points connected by a polyline, area fill
 * below the line, dot markers per day. `motion.path` for the line draws in
 * with `pathLength: 0 → 1`. Y axis is fixed 0..100 so the slope reads as
 * the score's actual movement.
 */
function ScoreSparkline({
  scores,
  status,
}: {
  scores: number[];
  status: DomainStatus;
}): JSX.Element {
  const W = 280;
  const H = 84;
  const PADX = 6;
  const PADY = 10;
  const color = STATUS_HEX[status];

  if (scores.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-dashed border-border-muted bg-surface-2/40 text-[10px] text-text-dim"
        style={{ height: H }}
      >
        No history yet.
      </div>
    );
  }

  const innerW = W - PADX * 2;
  const innerH = H - PADY * 2;
  const stepX = scores.length > 1 ? innerW / (scores.length - 1) : 0;

  const pts = scores.map((s, i) => {
    const x = PADX + i * stepX;
    const y = PADY + (1 - s / 100) * innerH;
    return { x, y, s };
  });
  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');
  const firstPt = pts[0];
  const lastPt = pts[pts.length - 1];
  // Falls back to safe coords if the array is empty (TS narrowing — already
  // returned above, but TS still needs the satisfies-style guards under
  // noUncheckedIndexedAccess).
  const areaPath =
    firstPt && lastPt
      ? `${linePath} L ${lastPt.x} ${H - PADY} L ${firstPt.x} ${H - PADY} Z`
      : '';

  return (
    <div className="rounded-xl border border-border-muted bg-surface-2/60 px-3 py-3">
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-text-dim">
        <span className="font-mono">D-7</span>
        <span className="font-mono">today</span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Seven-day reputation sparkline">
        <defs>
          <linearGradient id={`spark-grad-${status}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* baseline */}
        <line
          x1={PADX}
          y1={H - PADY}
          x2={W - PADX}
          y2={H - PADY}
          stroke={HEX.border}
          strokeWidth={0.8}
          strokeDasharray="2 4"
        />
        {/* area */}
        <motion.path
          d={areaPath}
          fill={`url(#spark-grad-${status})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        />
        {/* line */}
        <motion.path
          d={linePath}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: { duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 },
            opacity: { duration: 0.3, delay: 0.2 },
          }}
        />
        {/* dots */}
        {pts.map((p, i) => (
          <motion.circle
            key={`pt-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 3.4 : 2.2}
            fill={i === pts.length - 1 ? color : HEX.surface}
            stroke={color}
            strokeWidth={1.4}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.25,
              delay: 0.6 + i * 0.05,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-text-faint">
        <span>min {Math.min(...scores)}</span>
        <span>avg {Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}</span>
        <span>max {Math.max(...scores)}</span>
      </div>
    </div>
  );
}

function LastIncidentBlock({
  ago,
  kind,
}: {
  ago: string | null;
  kind: AlertKind | null;
}): JSX.Element {
  if (!ago || !kind) {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-3 text-xs text-text-dim">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          No incidents on record.
        </span>
      </div>
    );
  }
  const Icon = ALERT_KIND_ICON[kind];
  // Treat all kinds as 'warn' visually in this block — we don't carry the
  // severity per-incident on a domain, just the kind + when.
  return (
    <div className="rounded-xl border border-accent4/30 bg-accent4/10 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-accent4/40 bg-accent4/10 text-accent4">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-xs font-semibold text-text">
            {ALERT_KIND_LABEL[kind]}
          </span>
          <span className="mt-0.5 text-[11px] text-text-dim">
            Last detected {ago}
          </span>
        </div>
      </div>
    </div>
  );
}
