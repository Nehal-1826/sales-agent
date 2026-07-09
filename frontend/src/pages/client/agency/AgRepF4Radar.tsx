import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationFrame } from 'framer-motion';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Antenna,
  Bell,
  Binoculars,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Globe,
  Headphones,
  Inbox,
  Mail,
  Radar,
  Radio,
  ScanLine,
  ServerCrash,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Signal,
  Siren,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Triangle,
  Waves,
  XCircle,
  Zap,
} from 'lucide-react';

import type { AgencyReputationData } from '@/pages/client/agency/AgRepC4Forecast';
import { formatNumber } from '@/lib/format';

/**
 * AgRepF4Radar — Agency-tier Reputation, design candidate "F4", "Sonar Scope".
 *
 * Military / air-traffic-control SONAR SCOPE for the agency reputation
 * surface. Each sub-client domain is a CONTACT BLIP on a circular scope;
 * a continuous SWEEP ARM rotates around the scope every 5s and illuminates
 * blips as it passes. Forward-looking by metaphor — the sweep is "scanning
 * ahead." Distinct from sibling C1 Radar in that this candidate adopts a
 * heavier tactical OPERATOR chrome (call-sign header band, threat-level
 * pill, contact-count summary), a richer RIGHT-SIDE "Contact details" rail
 * with auth flags + inbox bar, and a bottom 3-column "Tactical readout"
 * tier (Sweep cycle log / Inbound contact alerts / Sector status).
 *
 * Stage anatomy (top → bottom):
 *
 *   1. OPERATOR HEADER BAND — call sign, sector designation, operator
 *      on-duty timer, contact roll-up ("8 contacts · 1 unknown · 0
 *      hostile"), and a THREAT-LEVEL PILL (CLEAR / ELEVATED / CRITICAL).
 *
 *   2. MAIN RADAR SCOPE — a large central circular SVG canvas (~520px on
 *      desktop) with concentric guide rings, crosshairs, compass bearing
 *      labels, a CONTINUOUSLY ROTATING SWEEP ARM (fading conic trail), and
 *      contact blips positioned by deterministic-angle (hash → degrees)
 *      and reputation-score → radius (high score = near centre = friendly;
 *      low score = outer ring = hostile). Blip shape encodes status
 *      (filled circle = healthy, ring outline = warming, filled square =
 *      at-risk). When the sweep arm passes within ~15° of a blip, the
 *      blip pulses bright; at-risk blips additionally flash on a slow 1s
 *      cycle.
 *
 *   3. RIGHT PANEL — "Contact details" rail (~340px). Track header
 *      ("Tracking 1 of 8" / placeholder), domain name + sub-client,
 *      reputation score reading, SPF/DKIM/DMARC pass flags as 3 square
 *      indicators, mailbox count, an inbox-rate horizontal mini-bar, and
 *      a footer threat assessment pill (friendly / neutral / hostile).
 *
 *   4. BOTTOM TACTICAL READOUT — 3 columns: SWEEP CYCLE LOG (running list
 *      of "Contacts swept" events, mono font, "T+14:23 → helix... 84 rep
 *      friendly"); THREAT ALERTS ("Inbound contact alerts", severity
 *      codes W-1 / W-2 / C-1 / C-2); SECTOR STATUS (providers as sector
 *      readiness — "Gmail sector: GREEN (94% inbox)" etc).
 *
 * Visual identity: dark scope background, glowing orange sweep arm,
 * monospace tactical readouts, square corner UI chrome, military
 * abbreviation language. Tokens only — `var(--wp-accent)`,
 * `var(--wp-warning)`, `var(--wp-success)`, `var(--wp-danger)` and the
 * `bg-surface` / `bg-surface-2` / `border-border-muted` / `text-text` /
 * `text-text-dim` / `text-text-faint` Tailwind utilities.
 *
 * Fully STANDALONE — no router, query hooks, or required props. Inline
 * MOCK supplies every field so the design preview harness mounts it
 * prop-less. The future adapter passes `data` once the live aggregate
 * endpoint exists.
 */

// ---------------------------------------------------------------------------
// Re-export shared types so consumers can import them from this file too.
// ---------------------------------------------------------------------------

type DomainStatus = 'healthy' | 'warming' | 'at_risk';
type AlertSeverity = 'warn' | 'critical';
type AlertKind = 'bounce_spike' | 'spam_complaint' | 'dns_break' | 'peer_failed';

type ThreatLevel = 'CLEAR' | 'ELEVATED' | 'CRITICAL';

// ---------------------------------------------------------------------------
// MOCK — Northwind Agency portfolio (matches brief; mirrors C4 mock)
// ---------------------------------------------------------------------------

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
  domains: [
    {
      id: 'helix-outbound-com',
      domain: 'send.helix.io',
      subClientId: 'helix',
      subClientName: 'Helix Outbound',
      reputationScore: 91,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 12,
      inboxRatePct: 96.1,
      spamFolderPct: 1.2,
      last7dScores: [84, 86, 88, 89, 89, 90, 91],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'nimbus-reach-com',
      domain: 'mail.nimbusreach.com',
      subClientId: 'nimbus',
      subClientName: 'Nimbus Reach',
      reputationScore: 88,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 9,
      inboxRatePct: 94.4,
      spamFolderPct: 1.6,
      last7dScores: [82, 83, 85, 86, 87, 88, 88],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'orion-mail-co',
      domain: 'out.orionmail.co',
      subClientId: 'orion',
      subClientName: 'Orion Mail',
      reputationScore: 84,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 7,
      inboxRatePct: 92.0,
      spamFolderPct: 1.9,
      last7dScores: [80, 81, 82, 83, 83, 84, 84],
      lastIncidentAgo: '2d ago',
      lastIncidentKind: 'peer_failed',
    },
    {
      id: 'vega-sends-com',
      domain: 'sx.vegasends.com',
      subClientId: 'vega',
      subClientName: 'Vega Sends',
      reputationScore: 82,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: false,
      mailboxCount: 6,
      inboxRatePct: 90.2,
      spamFolderPct: 2.1,
      last7dScores: [78, 79, 80, 80, 81, 82, 82],
      lastIncidentAgo: '5d ago',
      lastIncidentKind: 'dns_break',
    },
    {
      id: 'quasar-studio-com',
      domain: 'send.quasarstudio.com',
      subClientId: 'quasar',
      subClientName: 'Quasar Studio',
      reputationScore: 80,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 5,
      inboxRatePct: 89.0,
      spamFolderPct: 2.4,
      last7dScores: [76, 77, 78, 78, 79, 80, 80],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'lyra-pipeline-io',
      domain: 'mx.lyrapipeline.io',
      subClientId: 'lyra',
      subClientName: 'Lyra Pipeline',
      reputationScore: 71,
      status: 'warming',
      spfPass: true,
      dkimPass: true,
      dmarcPass: false,
      mailboxCount: 4,
      inboxRatePct: 81.6,
      spamFolderPct: 3.4,
      last7dScores: [62, 64, 66, 67, 68, 70, 71],
      lastIncidentAgo: '14h ago',
      lastIncidentKind: 'bounce_spike',
    },
    {
      id: 'pixel-drop-co',
      domain: 'out.pixeldrop.co',
      subClientId: 'pixel',
      subClientName: 'Pixel Drop',
      reputationScore: 64,
      status: 'warming',
      spfPass: true,
      dkimPass: false,
      dmarcPass: false,
      mailboxCount: 3,
      inboxRatePct: 74.3,
      spamFolderPct: 4.7,
      last7dScores: [54, 56, 58, 60, 61, 63, 64],
      lastIncidentAgo: '6h ago',
      lastIncidentKind: 'spam_complaint',
    },
    {
      id: 'atlas-bio-co',
      domain: 'send.atlasbio.co',
      subClientId: 'atlas',
      subClientName: 'Atlas Bio',
      reputationScore: 42,
      status: 'at_risk',
      spfPass: false,
      dkimPass: false,
      dmarcPass: false,
      mailboxCount: 4,
      inboxRatePct: 51.2,
      spamFolderPct: 12.6,
      last7dScores: [58, 56, 53, 50, 47, 44, 42],
      lastIncidentAgo: '38m ago',
      lastIncidentKind: 'bounce_spike',
    },
  ],
  providers: [
    {
      id: 'gmail',
      label: 'Gmail',
      inboxPct: 93.1,
      spamPct: 1.7,
      blockedPct: 0.4,
      last24hSends: 8420,
    },
    {
      id: 'outlook',
      label: 'Outlook',
      inboxPct: 89.4,
      spamPct: 2.6,
      blockedPct: 0.8,
      last24hSends: 4310,
    },
    {
      id: 'yahoo',
      label: 'Yahoo',
      inboxPct: 84.7,
      spamPct: 3.1,
      blockedPct: 1.2,
      last24hSends: 2090,
    },
  ],
  recentAlerts: [
    {
      id: 'al-1',
      domain: 'send.atlasbio.co',
      kind: 'bounce_spike',
      message: 'Bounce rate climbed to 14.2% in the last hour.',
      ago: '38m ago',
      severity: 'critical',
    },
    {
      id: 'al-2',
      domain: 'out.pixeldrop.co',
      kind: 'spam_complaint',
      message: 'Two spam complaints recorded against Gmail recipients.',
      ago: '6h ago',
      severity: 'warn',
    },
    {
      id: 'al-3',
      domain: 'mx.lyrapipeline.io',
      kind: 'bounce_spike',
      message: 'Lyra warmup bounces ticked above 4% threshold.',
      ago: '14h ago',
      severity: 'warn',
    },
    {
      id: 'al-4',
      domain: 'sx.vegasends.com',
      kind: 'dns_break',
      message: 'DMARC record missing on apex; child domains unaffected.',
      ago: '5d ago',
      severity: 'warn',
    },
  ],
};

// ---------------------------------------------------------------------------
// Tokens & geometry
// ---------------------------------------------------------------------------

/**
 * Token map — pulls from the global `--wp-*` CSS variables so the orange
 * theme stays unified with the rest of the agency surfaces. Inline SVG
 * `stroke` / `fill` props can't accept Tailwind class names, so this map
 * carries the raw `var(--…)` strings.
 */
const TOK = {
  accent: 'var(--wp-accent, #F26522)',
  accent2: 'var(--wp-accent-2, #FF8A4B)',
  accentHover: 'var(--wp-accent-hover, #FF7B38)',
  success: 'var(--wp-success, #3ddc97)',
  warning: 'var(--wp-warning, #ffb454)',
  danger: 'var(--wp-danger, #ff5c7a)',
  surface: 'var(--wp-surface, #0a0a0f)',
  surface2: 'var(--wp-surface-2, #12121a)',
  border: 'var(--wp-border, #2a2a3a)',
  text: 'var(--wp-text, #e8e8f0)',
  textDim: 'var(--wp-text-dim, #8888a0)',
  textFaint: 'var(--wp-text-faint, #5a5a72)',
} as const;

/**
 * Radar scope viewBox geometry. The SVG is rendered into a 1000x1000 box
 * and then CSS-scaled to fit the actual element size.
 */
const VB = 1000;
const CX = VB / 2;
const CY = VB / 2;
/** Distance from centre to outer ring (where blips live). */
const SCOPE_RADIUS = 440;
/** Bracket of concentric rings used as the visual graticule. */
const RING_FRACTIONS = [0.28, 0.5, 0.74, 1.0] as const;
/** Width of the sweep arm wedge in degrees. */
const SWEEP_WIDTH_DEG = 60;
/** Sweep arm period in seconds — one full revolution. */
const SWEEP_PERIOD_S = 5.2;
/** Angle proximity (degrees) under which the sweep "illuminates" a blip. */
const SWEEP_ILLUM_DEG = 22;
/** Compass labels around the scope edge. */
const COMPASS_LABELS: Array<{ angle: number; label: string }> = [
  { angle: 0, label: 'N' },
  { angle: 45, label: '045' },
  { angle: 90, label: 'E' },
  { angle: 135, label: '135' },
  { angle: 180, label: 'S' },
  { angle: 225, label: '225' },
  { angle: 270, label: 'W' },
  { angle: 315, label: '315' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => formatNumber(n);

const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/**
 * Stable string hash → 0..2^31 integer. Used to derive a deterministic
 * angle for each domain so the scope layout doesn't reshuffle on rerender.
 */
function hashCode(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Map a 0..100 reputation score to a viewBox-space radius. Higher score
 * sits closer to centre (friendly contact); lower score is pushed toward
 * the outer ring (unknown / hostile). The output range is [60,
 * SCOPE_RADIUS - 30] so blips never overlap the dead-centre cross or
 * spill past the outer ring.
 */
function scoreToRadius(score: number): number {
  const s = clamp(score, 0, 100);
  // Invert: 100 → small radius (close to centre), 0 → max radius (edge).
  const t = 1 - s / 100;
  const minR = 60;
  const maxR = SCOPE_RADIUS - 30;
  return minR + t * (maxR - minR);
}

/**
 * Derive a deterministic angle in degrees for a domain. Hash the id (so
 * the same domain always lands in the same slot), modulo 360. Adds a
 * status-based offset so that healthy domains tend to cluster in the
 * northern half, warming in the east, at-risk in the south — gives the
 * scope an immediately legible "danger is far / bottom" reading.
 */
function deriveAngleDeg(domain: AgencyReputationData['domains'][number]): number {
  const base = hashCode(domain.id) % 360;
  // Status weighting: pull healthy toward 270..90 (top arc), at-risk
  // toward 90..270 (bottom arc), warming roughly to the east/west sides.
  const offset =
    domain.status === 'healthy' ? -45 : domain.status === 'at_risk' ? 135 : 60;
  return (base + offset + 360) % 360;
}

/** Convert polar (deg, r) → cartesian (x, y) in viewBox space. */
function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  // SVG angle 0 = right (east). For compass legibility we treat 0 = north
  // (up) and rotate clockwise.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

/**
 * Absolute angular distance in degrees between two angles, accounting for
 * wrap at 360 → 0. Used to detect when the sweep arm is "passing" a blip.
 */
function angleDelta(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Status-based threat level for the global header pill. CRITICAL once any
 * at-risk domain exists; ELEVATED if any warming; otherwise CLEAR. Mirrors
 * the radio-operator language used in air-traffic scope tooling.
 */
function deriveThreatLevel(data: AgencyReputationData): ThreatLevel {
  if (data.summary.domainsAtRisk > 0) return 'CRITICAL';
  if (data.summary.domainsWarming > 0) return 'ELEVATED';
  return 'CLEAR';
}

/** "Contact classification" string for a single domain. */
function classify(status: DomainStatus): 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE' {
  if (status === 'healthy') return 'FRIENDLY';
  if (status === 'warming') return 'NEUTRAL';
  return 'HOSTILE';
}

/** Sector readiness color tier for provider stats. */
function sectorTier(inboxPct: number): {
  label: 'GREEN' | 'AMBER' | 'RED';
  tok: string;
  text: string;
  ring: string;
} {
  if (inboxPct >= 92) {
    return {
      label: 'GREEN',
      tok: TOK.success,
      text: 'text-[color:var(--wp-success,#3ddc97)]',
      ring: 'ring-[color:var(--wp-success,#3ddc97)]/35',
    };
  }
  if (inboxPct >= 85) {
    return {
      label: 'AMBER',
      tok: TOK.warning,
      text: 'text-[color:var(--wp-warning,#ffb454)]',
      ring: 'ring-[color:var(--wp-warning,#ffb454)]/35',
    };
  }
  return {
    label: 'RED',
    tok: TOK.danger,
    text: 'text-[color:var(--wp-danger,#ff5c7a)]',
    ring: 'ring-[color:var(--wp-danger,#ff5c7a)]/35',
  };
}

const ALERT_KIND_LABEL: Record<AlertKind, string> = {
  bounce_spike: 'BOUNCE SURGE',
  spam_complaint: 'COMPLAINT',
  dns_break: 'DNS FAULT',
  peer_failed: 'PEER LOST',
};

const ALERT_KIND_CODE: Record<AlertKind, string> = {
  bounce_spike: 'BSG',
  spam_complaint: 'SPC',
  dns_break: 'DNS',
  peer_failed: 'PEE',
};

const ALERT_KIND_ICON: Record<AlertKind, typeof AlertTriangle> = {
  bounce_spike: TrendingUp,
  spam_complaint: Siren,
  dns_break: ServerCrash,
  peer_failed: ShieldX,
};

/** Severity code: W-1 (warn lite), W-2 (warn), C-1 (critical), C-2 (max). */
function severityCode(s: AlertSeverity, recencyMin: number): string {
  if (s === 'critical') {
    return recencyMin < 60 ? 'C-2' : 'C-1';
  }
  return recencyMin < 60 ? 'W-2' : 'W-1';
}

/** Rough "minutes ago" extraction from an ago string. */
function parseAgoToMinutes(ago: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d)/i.exec(ago);
  if (!m) return 9999;
  const n = parseFloat(m[1] ?? '0');
  const u = (m[2] ?? '').toLowerCase();
  if (u === 'm') return n;
  if (u === 'h') return n * 60;
  if (u === 'd') return n * 60 * 24;
  return 9999;
}

// ---------------------------------------------------------------------------
// Placed blip type
// ---------------------------------------------------------------------------

interface PlacedBlip {
  domain: AgencyReputationData['domains'][number];
  angleDeg: number;
  radius: number;
  x: number;
  y: number;
  /** Visual radius (px in viewBox space) — scales mildly with mailbox count. */
  size: number;
}

function placeBlips(data: AgencyReputationData): PlacedBlip[] {
  if (data.domains.length === 0) return [];
  const maxMb = Math.max(...data.domains.map((d) => d.mailboxCount), 1);
  return data.domains.map((domain) => {
    const angleDeg = deriveAngleDeg(domain);
    const radius = scoreToRadius(domain.reputationScore);
    const { x, y } = polarToXY(angleDeg, radius);
    const size = 14 + (domain.mailboxCount / maxMb) * 10;
    return { domain, angleDeg, radius, x, y, size };
  });
}

// ---------------------------------------------------------------------------
// Sweep cycle log — synthesised running list of "contacts swept" events
// ---------------------------------------------------------------------------

interface SweepLogEntry {
  id: string;
  timeLabel: string;
  domain: string;
  classification: 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE';
  reputation: number;
  status: DomainStatus;
}

/**
 * Synthesise a static "sweep cycle log" deterministically from the domain
 * list. The log shows the last few sweeps that have just been written by
 * the operator; ordering is reverse-chronological with a stable T+ offset.
 */
function buildSweepLog(blips: PlacedBlip[]): SweepLogEntry[] {
  if (blips.length === 0) return [];
  // Repeat the blip list ~2x to give a longer log.
  const sequence: PlacedBlip[] = [...blips, ...blips].slice(0, 14);
  const baseSec = 14 * 60 + 32; // 14m 32s
  return sequence.map((b, idx) => {
    const tSec = Math.max(0, baseSec - idx * 28);
    const m = Math.floor(tSec / 60);
    const s = tSec % 60;
    const timeLabel = `T+${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`;
    return {
      id: `${b.domain.id}-${idx}`,
      timeLabel,
      domain: b.domain.domain,
      classification: classify(b.domain.status),
      reputation: b.domain.reputationScore,
      status: b.domain.status,
    };
  });
}

// ---------------------------------------------------------------------------
// Operator on-duty timer hook (ticks every second; resets each mount).
// ---------------------------------------------------------------------------

function useDutyTimer(initialSec = 0): string {
  const [sec, setSec] = useState<number>(initialSec);
  useEffect(() => {
    const id = window.setInterval(() => setSec((p) => p + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

// ---------------------------------------------------------------------------
// Component — main page
// ---------------------------------------------------------------------------

export function AgRepF4Radar(
  { data }: { data?: AgencyReputationData } = {},
): JSX.Element {
  const d = data ?? MOCK;
  const blips = useMemo(() => placeBlips(d), [d]);
  const threat = useMemo(() => deriveThreatLevel(d), [d]);
  const sweepLog = useMemo(() => buildSweepLog(blips), [blips]);

  // Sweep arm angle, normalised 0..360 (degrees). Driven by useAnimationFrame
  // so the blip-pulse calc can react to it without forcing a relayout.
  const [sweepAngle, setSweepAngle] = useState<number>(0);
  const sweepStartRef = useRef<number | null>(null);

  useAnimationFrame((t) => {
    if (sweepStartRef.current === null) sweepStartRef.current = t;
    const elapsedMs = t - sweepStartRef.current;
    const periodMs = SWEEP_PERIOD_S * 1000;
    const phase = (elapsedMs % periodMs) / periodMs; // 0..1
    setSweepAngle(phase * 360);
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Auto-select the highest-risk contact on mount so the contact-details
  // panel reads as "tracking 1 of 8" rather than empty out of the gate.
  useEffect(() => {
    if (selectedId !== null) return;
    if (blips.length === 0) return;
    // Find the first at-risk; fall back to the lowest-score contact.
    const atRisk = blips.find((b) => b.domain.status === 'at_risk');
    if (atRisk) {
      setSelectedId(atRisk.domain.id);
      return;
    }
    const lowest = [...blips].sort(
      (a, b) => a.domain.reputationScore - b.domain.reputationScore,
    )[0];
    if (lowest) setSelectedId(lowest.domain.id);
  }, [blips, selectedId]);

  const selectedBlip = useMemo(
    () => blips.find((b) => b.domain.id === selectedId) ?? null,
    [blips, selectedId],
  );

  return (
    <div className="space-y-4 lg:space-y-5">
      <OperatorHeaderBand data={d} threat={threat} />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut', delay: 0.08 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      >
        {/* Left: main scope */}
        <div className="relative space-y-4 lg:col-span-8">
          <ScopeStage
            blips={blips}
            sweepAngle={sweepAngle}
            selectedId={selectedId}
            onSelect={setSelectedId}
            agencyName={d.agency.name}
            threat={threat}
          />
        </div>

        {/* Right: contact details rail */}
        <div className="lg:col-span-4">
          <ContactDetailsPanel
            selected={selectedBlip}
            total={blips.length}
            onClear={() => setSelectedId(null)}
          />
        </div>
      </motion.div>

      {/* Bottom: 3-column tactical readout */}
      <TacticalReadoutTier
        sweepLog={sweepLog}
        alerts={d.recentAlerts}
        providers={d.providers}
        onSelectAlert={(domain) => {
          const match = blips.find((b) => b.domain.domain === domain);
          if (match) setSelectedId(match.domain.id);
        }}
      />
    </div>
  );
}

export default AgRepF4Radar;

// ---------------------------------------------------------------------------
// OperatorHeaderBand — call sign, sector, on-duty timer, threat pill
// ---------------------------------------------------------------------------

function OperatorHeaderBand({
  data,
  threat,
}: {
  data: AgencyReputationData;
  threat: ThreatLevel;
}): JSX.Element {
  const totalDomains =
    data.summary.domainsHealthy +
    data.summary.domainsWarming +
    data.summary.domainsAtRisk;
  const unknownCount = data.summary.domainsWarming;
  const hostileCount = data.summary.domainsAtRisk;
  const onDuty = useDutyTimer();
  // Call-sign convention: agency name (uppercased, spaces collapsed) + "SCOPE"
  // + a CTRL-A / CTRL-B / etc letter derived from region. Stable and friendly.
  const callSign = useMemo(() => {
    const trimmed = data.agency.name.toUpperCase().replace(/\s+/g, ' ').trim();
    const letter = String.fromCharCode(
      65 + (hashCode(data.agency.region) % 4),
    );
    return `${trimmed} SCOPE`.concat(` · CTRL-${letter}`);
  }, [data.agency.name, data.agency.region]);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/70 backdrop-blur-xl"
      style={{
        boxShadow:
          '0 12px 32px -16px rgba(242,101,34,0.18), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Decorative scan-line overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, var(--wp-accent,#F26522) 3px, var(--wp-accent,#F26522) 4px)',
          maskImage:
            'linear-gradient(to right, transparent 0%, black 40%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, black 40%, transparent 100%)',
        }}
      />
      <div className="relative grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-12">
        {/* Left: call sign + sector */}
        <div className="flex items-center gap-4 lg:col-span-5">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <Radar className="h-7 w-7" />
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-xl border border-accent/40"
              animate={{ opacity: [0.6, 0.15, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          </span>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-text-faint">
                Station call sign
              </p>
              <span
                className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.24em]"
                style={{
                  borderColor: 'color-mix(in srgb, var(--wp-accent) 35%, transparent)',
                  color: TOK.accent,
                  backgroundColor:
                    'color-mix(in srgb, var(--wp-accent) 10%, transparent)',
                }}
              >
                <Signal className="h-2.5 w-2.5" />
                LIVE
              </span>
            </div>
            <h1 className="truncate font-mono text-lg font-semibold tracking-[0.12em] text-text">
              {callSign}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-text-faint">
              <span className="inline-flex items-center gap-1 rounded-sm border border-border-muted bg-surface-2/60 px-1.5 py-0.5 font-mono uppercase tracking-[0.22em]">
                <Compass className="h-2.5 w-2.5" />
                SECTOR {data.agency.region.toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1 rounded-sm border border-border-muted bg-surface-2/60 px-1.5 py-0.5 font-mono uppercase tracking-[0.22em]">
                <Headphones className="h-2.5 w-2.5" />
                OPERATOR ON DUTY · {onDuty}
              </span>
            </div>
          </div>
        </div>

        {/* Middle: contact roll-up */}
        <div className="flex flex-wrap items-center justify-center gap-2 lg:col-span-4">
          <ContactRollupChip
            count={totalDomains}
            label="contacts"
            icon={Target}
            tone="accent"
          />
          <ContactRollupChip
            count={unknownCount}
            label="unknown"
            icon={Eye}
            tone="warning"
          />
          <ContactRollupChip
            count={hostileCount}
            label="hostile"
            icon={AlertOctagon}
            tone="danger"
          />
        </div>

        {/* Right: threat-level pill + 24h vitals */}
        <div className="flex flex-wrap items-center justify-end gap-2 lg:col-span-3">
          <ThreatLevelPill level={threat} />
          <VitalChipTactical
            icon={Mail}
            label="24H SENDS"
            value={fmtInt(data.summary.totalSends24h)}
            tone="text"
          />
        </div>
      </div>

      {/* Lower band: KPI bar */}
      <div className="relative grid grid-cols-2 gap-px border-t border-border-muted bg-border-muted/60 lg:grid-cols-4">
        <KpiTile
          icon={Gauge}
          label="OVERALL"
          value={`${data.summary.overallScore.toString().padStart(2, '0')}`}
          unit="rep"
          delta={data.summary.trend7dDelta}
          tone="accent"
        />
        <KpiTile
          icon={TrendingDown}
          label="BOUNCE 24H"
          value={fmtPct(data.summary.bouncePct24h, 1)}
          unit=""
          delta={-0.4}
          tone={
            data.summary.bouncePct24h >= 3
              ? 'danger'
              : data.summary.bouncePct24h >= 1.5
                ? 'warning'
                : 'accent'
          }
        />
        <KpiTile
          icon={Siren}
          label="SPAM 24H"
          value={fmtPct(data.summary.spamComplaintPct24h, 2)}
          unit=""
          delta={-0.1}
          tone={
            data.summary.spamComplaintPct24h >= 0.6
              ? 'danger'
              : data.summary.spamComplaintPct24h >= 0.3
                ? 'warning'
                : 'accent'
          }
        />
        <KpiTile
          icon={Activity}
          label="HEALTH"
          value={`${data.summary.domainsHealthy}/${
            data.summary.domainsHealthy +
            data.summary.domainsWarming +
            data.summary.domainsAtRisk
          }`}
          unit="ok"
          delta={null}
          tone="accent"
        />
      </div>
    </motion.header>
  );
}

function ContactRollupChip({
  count,
  label,
  icon: Icon,
  tone,
}: {
  count: number;
  label: string;
  icon: typeof Target;
  tone: 'accent' | 'warning' | 'danger';
}): JSX.Element {
  const tokColor =
    tone === 'accent'
      ? TOK.accent
      : tone === 'warning'
        ? TOK.warning
        : TOK.danger;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border bg-surface-2/70 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em]"
      style={{
        borderColor: 'color-mix(in srgb, ' + tokColor + ' 30%, transparent)',
        color: tokColor,
      }}
    >
      <Icon className="h-3 w-3" />
      <span className="text-base font-semibold leading-none tabular-nums">
        {count.toString().padStart(2, '0')}
      </span>
      <span className="text-text-dim">{label}</span>
    </span>
  );
}

function ThreatLevelPill({ level }: { level: ThreatLevel }): JSX.Element {
  const config = {
    CLEAR: { tok: TOK.success, label: 'CLEAR', icon: ShieldCheck },
    ELEVATED: { tok: TOK.warning, label: 'ELEVATED', icon: ShieldAlert },
    CRITICAL: { tok: TOK.danger, label: 'CRITICAL', icon: ShieldX },
  }[level];
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-2 overflow-hidden rounded-md border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.28em]"
      style={{
        borderColor: 'color-mix(in srgb, ' + config.tok + ' 40%, transparent)',
        color: config.tok,
        backgroundColor: 'color-mix(in srgb, ' + config.tok + ' 12%, transparent)',
        boxShadow: '0 0 16px -4px ' + config.tok,
      }}
    >
      <motion.span
        animate={{ opacity: level === 'CLEAR' ? 1 : [0.55, 1, 0.55] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="inline-flex items-center gap-1.5"
      >
        <Icon className="h-3.5 w-3.5" />
        THREAT {config.label}
      </motion.span>
    </span>
  );
}

function VitalChipTactical({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  tone: 'text' | 'accent' | 'warning' | 'danger';
}): JSX.Element {
  const tokColor =
    tone === 'accent'
      ? TOK.accent
      : tone === 'warning'
        ? TOK.warning
        : tone === 'danger'
          ? TOK.danger
          : TOK.text;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border border-border-muted bg-surface-2/60 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em]"
      style={{ color: TOK.textDim }}
    >
      <Icon className="h-3 w-3" />
      {label}
      <span
        className="font-semibold tabular-nums"
        style={{ color: tokColor }}
      >
        {value}
      </span>
    </span>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  unit: string;
  delta: number | null;
  tone: 'accent' | 'warning' | 'danger';
}): JSX.Element {
  const tokColor =
    tone === 'accent'
      ? TOK.accent
      : tone === 'warning'
        ? TOK.warning
        : TOK.danger;
  const deltaSign = delta === null ? null : delta >= 0 ? '+' : '';
  return (
    <div className="flex items-center justify-between gap-3 bg-surface/70 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 place-items-center rounded-md border"
          style={{
            borderColor:
              'color-mix(in srgb, ' + tokColor + ' 30%, transparent)',
            color: tokColor,
            backgroundColor:
              'color-mix(in srgb, ' + tokColor + ' 10%, transparent)',
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="space-y-0.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
            {label}
          </p>
          <p className="font-mono text-base font-semibold tabular-nums text-text">
            {value}{' '}
            {unit ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-text-dim">
                {unit}
              </span>
            ) : null}
          </p>
        </div>
      </div>
      {delta !== null ? (
        <span
          className="font-mono text-[10px] tabular-nums"
          style={{
            color:
              delta > 0
                ? TOK.success
                : delta < 0
                  ? TOK.danger
                  : TOK.textDim,
          }}
        >
          {deltaSign}
          {delta.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScopeStage — the big circular SVG canvas
// ---------------------------------------------------------------------------

function ScopeStage({
  blips,
  sweepAngle,
  selectedId,
  onSelect,
  agencyName,
  threat,
}: {
  blips: PlacedBlip[];
  sweepAngle: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  agencyName: string;
  threat: ThreatLevel;
}): JSX.Element {
  // Hovered blip — separate from selected so quick mouse-overs preview details
  // without locking the rail.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface/80 px-4 py-4 backdrop-blur-xl lg:px-6 lg:py-6"
      style={{
        boxShadow:
          '0 22px 60px -36px rgba(242,101,34,0.30), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <ScopeChromeHeader agencyName={agencyName} threat={threat} />

      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[560px]">
        <ScopeBackdrop />
        <ScopeSvg
          blips={blips}
          sweepAngle={sweepAngle}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={onSelect}
          onHover={setHoveredId}
        />
        <ScopeTooltip
          blips={blips}
          activeId={hoveredId ?? selectedId}
        />
      </div>

      <ScopeChromeFooter blips={blips} sweepAngle={sweepAngle} />
    </motion.div>
  );
}

function ScopeChromeHeader({
  agencyName,
  threat,
}: {
  agencyName: string;
  threat: ThreatLevel;
}): JSX.Element {
  const threatToken =
    threat === 'CLEAR'
      ? TOK.success
      : threat === 'ELEVATED'
        ? TOK.warning
        : TOK.danger;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-text-faint">
          SCOPE
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
          {agencyName.toUpperCase()} · TACTICAL DISPLAY
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        <span className="inline-flex items-center gap-1 rounded-sm border border-border-muted bg-surface-2/60 px-1.5 py-0.5">
          <ScanLine className="h-2.5 w-2.5" />
          SWEEP {SWEEP_PERIOD_S.toFixed(1)}s
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5"
          style={{
            borderColor: 'color-mix(in srgb, ' + threatToken + ' 35%, transparent)',
            color: threatToken,
            backgroundColor: 'color-mix(in srgb, ' + threatToken + ' 10%, transparent)',
          }}
        >
          <Antenna className="h-2.5 w-2.5" />
          GAIN HIGH
        </span>
      </div>
    </div>
  );
}

function ScopeChromeFooter({
  blips,
  sweepAngle,
}: {
  blips: PlacedBlip[];
  sweepAngle: number;
}): JSX.Element {
  // Compute how many blips are "illuminated" right now.
  const illuminated = blips.filter(
    (b) => angleDelta(sweepAngle, b.angleDeg) <= SWEEP_ILLUM_DEG,
  ).length;

  // Compass heading text from the current sweep angle.
  const heading =
    sweepAngle < 22.5 || sweepAngle >= 337.5
      ? 'N'
      : sweepAngle < 67.5
        ? 'NE'
        : sweepAngle < 112.5
          ? 'E'
          : sweepAngle < 157.5
            ? 'SE'
            : sweepAngle < 202.5
              ? 'S'
              : sweepAngle < 247.5
                ? 'SW'
                : sweepAngle < 292.5
                  ? 'W'
                  : 'NW';

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint sm:grid-cols-4">
      <div className="flex items-center gap-1.5 rounded-sm border border-border-muted bg-surface-2/40 px-2 py-1.5">
        <Compass className="h-2.5 w-2.5" />
        BEARING
        <span className="ml-auto font-semibold tabular-nums text-text">
          {Math.round(sweepAngle).toString().padStart(3, '0')}° {heading}
        </span>
      </div>
      <div className="flex items-center gap-1.5 rounded-sm border border-border-muted bg-surface-2/40 px-2 py-1.5">
        <Target className="h-2.5 w-2.5" />
        ILLUM
        <span className="ml-auto font-semibold tabular-nums text-text">
          {illuminated.toString().padStart(2, '0')}/{blips.length}
        </span>
      </div>
      <div className="flex items-center gap-1.5 rounded-sm border border-border-muted bg-surface-2/40 px-2 py-1.5">
        <Radio className="h-2.5 w-2.5" />
        FREQ
        <span className="ml-auto font-semibold tabular-nums text-text">
          243.0 MHz
        </span>
      </div>
      <div className="flex items-center gap-1.5 rounded-sm border border-border-muted bg-surface-2/40 px-2 py-1.5">
        <Waves className="h-2.5 w-2.5" />
        PRF
        <span className="ml-auto font-semibold tabular-nums text-text">
          900 Hz
        </span>
      </div>
    </div>
  );
}

/**
 * Dark scope backdrop — a radial vignette + faint phosphor noise sitting
 * behind the SVG layer. Purely decorative; pointer-events disabled.
 */
function ScopeBackdrop(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      {/* Radial vignette — dark centre, edge tinted accent */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(8,8,12,0.95) 0%, rgba(12,12,18,0.85) 45%, rgba(22,12,8,0.78) 80%, rgba(40,18,8,0.55) 100%)',
        }}
      />
      {/* Phosphor noise */}
      <div
        className="absolute inset-0 rounded-full opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, var(--wp-accent,#F26522) 2px, var(--wp-accent,#F26522) 3px)',
        }}
      />
      {/* Glow ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow:
            'inset 0 0 60px -12px color-mix(in srgb, var(--wp-accent) 30%, transparent)',
        }}
      />
    </div>
  );
}

/** The main SVG containing rings, crosshairs, sweep, compass, blips. */
function ScopeSvg({
  blips,
  sweepAngle,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  blips: PlacedBlip[];
  sweepAngle: number;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}): JSX.Element {
  // The sweep arm renders as a wedge with a fading trail. We build it with
  // an SVG path: from the centre to the radius along the leading edge,
  // arcing to the trailing edge over SWEEP_WIDTH_DEG, then back to centre.
  const sweepPath = useMemo(() => {
    const leadingDeg = sweepAngle;
    const trailingDeg = sweepAngle - SWEEP_WIDTH_DEG;
    const lead = polarToXY(leadingDeg, SCOPE_RADIUS);
    const trail = polarToXY(trailingDeg, SCOPE_RADIUS);
    // Large-arc-flag 0 because the wedge is < 180°.
    return `M ${CX} ${CY} L ${lead.x.toFixed(2)} ${lead.y.toFixed(2)} A ${SCOPE_RADIUS} ${SCOPE_RADIUS} 0 0 0 ${trail.x.toFixed(2)} ${trail.y.toFixed(2)} Z`;
  }, [sweepAngle]);

  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="absolute inset-0 h-full w-full"
      role="img"
      aria-label="Reputation radar scope"
    >
      <defs>
        {/* Sweep wedge gradient: opaque at the leading edge, transparent
            at the trailing edge. Approximated with a linear gradient since
            SVG-native conic isn't widely supported as <linearGradient>. */}
        <radialGradient id="f4-sweep-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={TOK.accent} stopOpacity={0.45} />
          <stop offset="60%" stopColor={TOK.accent} stopOpacity={0.18} />
          <stop offset="100%" stopColor={TOK.accent} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="f4-sweep-fade" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stopColor={TOK.accent} stopOpacity={0.6} />
          <stop offset="100%" stopColor={TOK.accent} stopOpacity={0} />
        </linearGradient>
        <filter id="f4-blip-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="f4-sweep-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>

      <ScopeRings />
      <ScopeCrosshairs />
      <ScopeCompass />

      {/* Sweep arm */}
      <g style={{ mixBlendMode: 'screen' }} filter="url(#f4-sweep-glow)">
        <path d={sweepPath} fill="url(#f4-sweep-gradient)" opacity={0.85} />
      </g>
      {/* Leading edge line — bright orange stroke for legibility */}
      <line
        x1={CX}
        y1={CY}
        x2={polarToXY(sweepAngle, SCOPE_RADIUS).x}
        y2={polarToXY(sweepAngle, SCOPE_RADIUS).y}
        stroke={TOK.accent}
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* Centre cross marker — agency identity */}
      <g>
        <circle cx={CX} cy={CY} r={22} fill="none" stroke={TOK.accent} strokeWidth={1.5} opacity={0.6} />
        <circle cx={CX} cy={CY} r={4} fill={TOK.accent} />
        <line x1={CX - 28} y1={CY} x2={CX - 12} y2={CY} stroke={TOK.accent} strokeWidth={1.2} opacity={0.55} />
        <line x1={CX + 12} y1={CY} x2={CX + 28} y2={CY} stroke={TOK.accent} strokeWidth={1.2} opacity={0.55} />
        <line x1={CX} y1={CY - 28} x2={CX} y2={CY - 12} stroke={TOK.accent} strokeWidth={1.2} opacity={0.55} />
        <line x1={CX} y1={CY + 12} x2={CX} y2={CY + 28} stroke={TOK.accent} strokeWidth={1.2} opacity={0.55} />
      </g>

      {/* Blips */}
      {blips.map((b) => {
        const isSelected = b.domain.id === selectedId;
        const isHovered = b.domain.id === hoveredId;
        const delta = angleDelta(sweepAngle, b.angleDeg);
        const illum = clamp(1 - delta / SWEEP_ILLUM_DEG, 0, 1);
        return (
          <BlipMarker
            key={b.domain.id}
            blip={b}
            illumination={illum}
            isSelected={isSelected}
            isHovered={isHovered}
            onSelect={() => onSelect(isSelected ? null : b.domain.id)}
            onHover={(h) => onHover(h ? b.domain.id : null)}
          />
        );
      })}
    </svg>
  );
}

function ScopeRings(): JSX.Element {
  return (
    <g>
      {RING_FRACTIONS.map((f, i) => (
        <circle
          key={i}
          cx={CX}
          cy={CY}
          r={SCOPE_RADIUS * f}
          fill="none"
          stroke={TOK.accent}
          strokeWidth={1}
          strokeDasharray="3 6"
          opacity={i === RING_FRACTIONS.length - 1 ? 0.5 : 0.3}
        />
      ))}
      {/* Range labels on the rings (3, 6, 9, 12 nm) */}
      {RING_FRACTIONS.map((f, i) => (
        <text
          key={`lbl-${i}`}
          x={CX + 6}
          y={CY - SCOPE_RADIUS * f - 4}
          fontSize={14}
          fontFamily="monospace"
          fill={TOK.textFaint}
          opacity={0.7}
        >
          {((i + 1) * 3).toString().padStart(2, '0')}NM
        </text>
      ))}
    </g>
  );
}

function ScopeCrosshairs(): JSX.Element {
  return (
    <g stroke={TOK.accent} strokeWidth={0.8} opacity={0.22}>
      <line x1={CX} y1={CY - SCOPE_RADIUS} x2={CX} y2={CY + SCOPE_RADIUS} />
      <line x1={CX - SCOPE_RADIUS} y1={CY} x2={CX + SCOPE_RADIUS} y2={CY} />
      {/* Diagonals */}
      <line
        x1={CX - SCOPE_RADIUS * 0.707}
        y1={CY - SCOPE_RADIUS * 0.707}
        x2={CX + SCOPE_RADIUS * 0.707}
        y2={CY + SCOPE_RADIUS * 0.707}
        opacity={0.12}
      />
      <line
        x1={CX + SCOPE_RADIUS * 0.707}
        y1={CY - SCOPE_RADIUS * 0.707}
        x2={CX - SCOPE_RADIUS * 0.707}
        y2={CY + SCOPE_RADIUS * 0.707}
        opacity={0.12}
      />
    </g>
  );
}

function ScopeCompass(): JSX.Element {
  return (
    <g>
      {/* Tick marks every 15° */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = i * 15;
        const outer = polarToXY(angle, SCOPE_RADIUS + 4);
        const inner = polarToXY(angle, SCOPE_RADIUS - (i % 2 === 0 ? 18 : 9));
        return (
          <line
            key={i}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={TOK.accent}
            strokeWidth={i % 2 === 0 ? 1.4 : 0.9}
            opacity={i % 2 === 0 ? 0.55 : 0.3}
          />
        );
      })}
      {/* Labels */}
      {COMPASS_LABELS.map((c) => {
        const pos = polarToXY(c.angle, SCOPE_RADIUS + 26);
        const isCardinal = c.label.length === 1;
        return (
          <text
            key={c.label}
            x={pos.x}
            y={pos.y}
            fontSize={isCardinal ? 26 : 14}
            fontFamily="monospace"
            fontWeight={isCardinal ? 700 : 500}
            fill={isCardinal ? TOK.accent : TOK.textDim}
            opacity={isCardinal ? 0.95 : 0.7}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {c.label}
          </text>
        );
      })}
    </g>
  );
}

/**
 * BlipMarker — a single contact on the scope. Shape encodes status:
 *   filled circle = healthy
 *   ring outline  = warming
 *   filled square = at-risk
 * It pulses brighter when the sweep arm sweeps past, and at-risk blips
 * additionally flash on a slow independent cycle.
 */
function BlipMarker({
  blip,
  illumination,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: {
  blip: PlacedBlip;
  illumination: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
}): JSX.Element {
  const tokColor =
    blip.domain.status === 'healthy'
      ? TOK.accent
      : blip.domain.status === 'warming'
        ? TOK.warning
        : TOK.danger;

  // Final opacity = base + sweep-illum + hovered/selected boost.
  const baseOp =
    blip.domain.status === 'at_risk'
      ? 0.85
      : blip.domain.status === 'warming'
        ? 0.78
        : 0.7;
  const opacity = clamp(
    baseOp + illumination * 0.4 + (isHovered || isSelected ? 0.15 : 0),
    0,
    1,
  );

  // Square for at-risk, ring for warming, filled circle for healthy.
  const renderShape = () => {
    if (blip.domain.status === 'at_risk') {
      const sz = blip.size * 1.6;
      return (
        <rect
          x={blip.x - sz / 2}
          y={blip.y - sz / 2}
          width={sz}
          height={sz}
          fill={tokColor}
          opacity={opacity}
        />
      );
    }
    if (blip.domain.status === 'warming') {
      return (
        <>
          <circle
            cx={blip.x}
            cy={blip.y}
            r={blip.size}
            fill="none"
            stroke={tokColor}
            strokeWidth={3}
            opacity={opacity}
          />
          <circle cx={blip.x} cy={blip.y} r={3.5} fill={tokColor} opacity={opacity} />
        </>
      );
    }
    return (
      <circle cx={blip.x} cy={blip.y} r={blip.size} fill={tokColor} opacity={opacity} />
    );
  };

  return (
    <motion.g
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      aria-label={`Contact ${blip.domain.domain}, ${blip.domain.status}, reputation ${blip.domain.reputationScore}`}
      animate={
        blip.domain.status === 'at_risk'
          ? { opacity: [0.55, 1, 0.55] }
          : undefined
      }
      transition={
        blip.domain.status === 'at_risk'
          ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
    >
      {/* Outer "illumination" pulse when the sweep is close */}
      {illumination > 0.05 ? (
        <circle
          cx={blip.x}
          cy={blip.y}
          r={blip.size * (2.2 + illumination * 1.6)}
          fill="none"
          stroke={tokColor}
          strokeWidth={1}
          opacity={0.32 * illumination}
          filter="url(#f4-blip-glow)"
        />
      ) : null}
      {/* Selected ring marker */}
      {isSelected ? (
        <>
          <circle
            cx={blip.x}
            cy={blip.y}
            r={blip.size * 2.4}
            fill="none"
            stroke={TOK.accent}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.85}
          />
          <motion.circle
            cx={blip.x}
            cy={blip.y}
            r={blip.size * 3.4}
            fill="none"
            stroke={TOK.accent}
            strokeWidth={0.8}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0.4, 0.05, 0.4], scale: [0.95, 1.1, 0.95] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      ) : null}
      {/* Hover ring marker */}
      {isHovered && !isSelected ? (
        <circle
          cx={blip.x}
          cy={blip.y}
          r={blip.size * 2.0}
          fill="none"
          stroke={tokColor}
          strokeWidth={1.2}
          opacity={0.6}
        />
      ) : null}
      {/* Crosshair tick on the blip — adds tactical polish */}
      <line
        x1={blip.x - blip.size - 4}
        y1={blip.y}
        x2={blip.x - blip.size - 1}
        y2={blip.y}
        stroke={tokColor}
        strokeWidth={1}
        opacity={0.6}
      />
      <line
        x1={blip.x + blip.size + 1}
        y1={blip.y}
        x2={blip.x + blip.size + 4}
        y2={blip.y}
        stroke={tokColor}
        strokeWidth={1}
        opacity={0.6}
      />
      {renderShape()}
      {/* Domain glyph label — only shown on hover/select to avoid clutter */}
      {isHovered || isSelected ? (
        <text
          x={blip.x}
          y={blip.y - blip.size - 12}
          fontSize={16}
          fontFamily="monospace"
          fill={TOK.text}
          textAnchor="middle"
          opacity={0.92}
        >
          {blip.domain.subClientName.toUpperCase()}
        </text>
      ) : null}
    </motion.g>
  );
}

/**
 * Floating tooltip layered above the SVG. Uses the active blip (hovered
 * preferred over selected) and positions itself at an offset from the
 * blip in scope-percentage space.
 */
function ScopeTooltip({
  blips,
  activeId,
}: {
  blips: PlacedBlip[];
  activeId: string | null;
}): JSX.Element {
  const active = blips.find((b) => b.domain.id === activeId) ?? null;
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          key={active.domain.id}
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 4 }}
          transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border-muted bg-surface/90 px-3 py-2 backdrop-blur-xl"
          style={{
            left: `${(active.x / VB) * 100}%`,
            top: `${(active.y / VB) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 18px))',
            boxShadow:
              '0 12px 32px -16px rgba(242,101,34,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="grid h-5 w-5 place-items-center rounded-sm"
              style={{
                backgroundColor:
                  active.domain.status === 'healthy'
                    ? TOK.accent
                    : active.domain.status === 'warming'
                      ? TOK.warning
                      : TOK.danger,
                color: TOK.surface,
              }}
            >
              <Crosshair className="h-3 w-3" />
            </span>
            <p className="font-mono text-[11px] font-semibold tracking-[0.1em] text-text">
              {active.domain.domain}
            </p>
          </div>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-text-faint">
            {classify(active.domain.status)} · REP{' '}
            <span className="text-text">{active.domain.reputationScore}</span> ·{' '}
            {active.domain.mailboxCount} MBX
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// ContactDetailsPanel — right-side rail
// ---------------------------------------------------------------------------

function ContactDetailsPanel({
  selected,
  total,
  onClear,
}: {
  selected: PlacedBlip | null;
  total: number;
  onClear: () => void;
}): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.16 }}
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur-xl"
      style={{
        boxShadow:
          '0 18px 50px -28px rgba(242,101,34,0.18), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <ContactDetailsHeader
        selected={selected}
        total={total}
        onClear={onClear}
      />
      <div className="relative flex-1">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.domain.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="space-y-4 px-4 py-4"
            >
              <ContactIdentity blip={selected} />
              <ContactReputationReading domain={selected.domain} />
              <ContactAuthFlags domain={selected.domain} />
              <ContactMailboxRow domain={selected.domain} />
              <ContactInboxBar domain={selected.domain} />
              <ContactIncidentRow domain={selected.domain} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
            >
              <span className="grid h-12 w-12 place-items-center rounded-full border border-dashed border-border-muted bg-surface-2/40 text-text-faint">
                <Binoculars className="h-6 w-6" />
              </span>
              <div className="space-y-1">
                <p className="font-mono text-xs uppercase tracking-[0.26em] text-text-dim">
                  No track designated
                </p>
                <p className="text-xs text-text-faint">
                  Select a contact on the scope to begin tracking.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ContactThreatFooter selected={selected} />
    </motion.section>
  );
}

function ContactDetailsHeader({
  selected,
  total,
  onClear,
}: {
  selected: PlacedBlip | null;
  total: number;
  onClear: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-muted bg-surface-2/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md border border-border-muted bg-surface/70 text-accent">
          <Crosshair className="h-3.5 w-3.5" />
        </span>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
            Contact details
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-dim">
            {selected
              ? `Tracking 1 of ${total.toString().padStart(2, '0')}`
              : `Tracking 00 of ${total.toString().padStart(2, '0')}`}
          </p>
        </div>
      </div>
      {selected ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-sm border border-border-muted bg-surface/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] text-text-dim transition hover:border-accent/40 hover:text-text"
        >
          <XCircle className="h-3 w-3" /> CLEAR
        </button>
      ) : null}
    </div>
  );
}

function ContactIdentity({ blip }: { blip: PlacedBlip }): JSX.Element {
  const cls = classify(blip.domain.status);
  const tokColor =
    blip.domain.status === 'healthy'
      ? TOK.accent
      : blip.domain.status === 'warming'
        ? TOK.warning
        : TOK.danger;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
          Contact ID
        </p>
        <p className="truncate font-mono text-base font-semibold tracking-[0.05em] text-text">
          {blip.domain.domain}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-text-dim">
          <Building2 className="h-3 w-3" />
          {blip.domain.subClientName}
        </p>
      </div>
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.22em]"
        style={{
          borderColor: 'color-mix(in srgb, ' + tokColor + ' 35%, transparent)',
          color: tokColor,
          backgroundColor:
            'color-mix(in srgb, ' + tokColor + ' 12%, transparent)',
        }}
      >
        <Triangle className="h-2.5 w-2.5" />
        {cls}
      </span>
    </div>
  );
}

function ContactReputationReading({
  domain,
}: {
  domain: AgencyReputationData['domains'][number];
}): JSX.Element {
  const tokColor =
    domain.reputationScore >= 80
      ? TOK.accent
      : domain.reputationScore >= 60
        ? TOK.warning
        : TOK.danger;
  // 7-day mini bar chart from last7dScores; tokColor for the latest bar.
  const max = Math.max(...domain.last7dScores, 1);
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
            Reputation reading
          </p>
          <p
            className="mt-1 font-mono text-3xl font-semibold leading-none tabular-nums"
            style={{ color: tokColor }}
          >
            {domain.reputationScore}
            <span className="ml-1 text-xs text-text-faint">/100</span>
          </p>
        </div>
        <div className="flex h-10 items-end gap-0.5">
          {domain.last7dScores.map((s, i) => {
            const h = (s / max) * 40;
            const isLast = i === domain.last7dScores.length - 1;
            return (
              <motion.div
                key={i}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.4,
                  delay: 0.05 * i,
                  ease: 'easeOut',
                }}
                className="w-1.5 origin-bottom rounded-[1px]"
                style={{
                  height: `${h}px`,
                  backgroundColor: isLast ? tokColor : TOK.textFaint,
                  opacity: isLast ? 1 : 0.55,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        <span>7-DAY TRACE</span>
        <span className="text-text-dim">
          PEAK {Math.max(...domain.last7dScores)}
        </span>
      </div>
    </div>
  );
}

function ContactAuthFlags({
  domain,
}: {
  domain: AgencyReputationData['domains'][number];
}): JSX.Element {
  const flags: Array<{
    label: string;
    pass: boolean;
    key: 'SPF' | 'DKIM' | 'DMARC';
  }> = [
    { label: 'SPF', pass: domain.spfPass, key: 'SPF' },
    { label: 'DKIM', pass: domain.dkimPass, key: 'DKIM' },
    { label: 'DMARC', pass: domain.dmarcPass, key: 'DMARC' },
  ];
  return (
    <div className="space-y-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-text-faint">
        IFF · Authentication flags
      </p>
      <div className="grid grid-cols-3 gap-2">
        {flags.map((f) => {
          const tok = f.pass ? TOK.success : TOK.danger;
          const Icon = f.pass ? CheckCircle2 : XCircle;
          return (
            <div
              key={f.key}
              className="flex flex-col items-start gap-1 rounded-md border bg-surface-2/40 px-2 py-2"
              style={{
                borderColor:
                  'color-mix(in srgb, ' + tok + ' 30%, transparent)',
              }}
            >
              <div className="flex items-center gap-1">
                <span
                  className="grid h-4 w-4 place-items-center rounded-sm"
                  style={{ color: tok }}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <p
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: tok }}
                >
                  {f.label}
                </p>
              </div>
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
                {f.pass ? 'OK · VERIFIED' : 'FAIL · BREACH'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContactMailboxRow({
  domain,
}: {
  domain: AgencyReputationData['domains'][number];
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
      <div className="flex items-center justify-between gap-2 rounded-md border border-border-muted bg-surface-2/40 px-2 py-2">
        <span className="inline-flex items-center gap-1.5">
          <Inbox className="h-3 w-3" />
          MAILBOXES
        </span>
        <span className="font-semibold tabular-nums text-text">
          {domain.mailboxCount.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border-muted bg-surface-2/40 px-2 py-2">
        <span className="inline-flex items-center gap-1.5">
          <Flame className="h-3 w-3" />
          SPAM %
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{
            color:
              domain.spamFolderPct >= 5
                ? TOK.danger
                : domain.spamFolderPct >= 2.5
                  ? TOK.warning
                  : TOK.accent,
          }}
        >
          {fmtPct(domain.spamFolderPct, 1)}
        </span>
      </div>
    </div>
  );
}

function ContactInboxBar({
  domain,
}: {
  domain: AgencyReputationData['domains'][number];
}): JSX.Element {
  const inboxPct = clamp(domain.inboxRatePct, 0, 100);
  const tokColor =
    inboxPct >= 90 ? TOK.accent : inboxPct >= 75 ? TOK.warning : TOK.danger;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        <span className="inline-flex items-center gap-1.5">
          <Activity className="h-3 w-3" />
          INBOX RATE
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: tokColor }}
        >
          {fmtPct(inboxPct, 1)}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full border border-border-muted bg-surface-2/50">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${inboxPct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{
            backgroundColor: tokColor,
            boxShadow: '0 0 12px ' + tokColor,
          }}
        />
        {/* Tick marks at 50/75/90 */}
        {[50, 75, 90].map((t) => (
          <span
            key={t}
            className="absolute top-0 h-full w-px"
            style={{
              left: `${t}%`,
              backgroundColor: 'color-mix(in srgb, ' + TOK.text + ' 35%, transparent)',
              opacity: 0.3,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[8px] uppercase tracking-[0.22em] text-text-faint">
        <span>0</span>
        <span>50</span>
        <span>75</span>
        <span>90</span>
        <span>100</span>
      </div>
    </div>
  );
}

function ContactIncidentRow({
  domain,
}: {
  domain: AgencyReputationData['domains'][number];
}): JSX.Element {
  if (!domain.lastIncidentAgo || !domain.lastIncidentKind) {
    return (
      <div className="rounded-md border border-dashed border-border-muted bg-surface-2/30 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        NO INCIDENTS · CLEAR LOG
      </div>
    );
  }
  const Icon = ALERT_KIND_ICON[domain.lastIncidentKind];
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border bg-surface-2/40 px-3 py-2"
      style={{
        borderColor: 'color-mix(in srgb, ' + TOK.warning + ' 28%, transparent)',
      }}
    >
      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-text-dim">
        <Icon className="h-3 w-3" />
        LAST INCIDENT · {ALERT_KIND_LABEL[domain.lastIncidentKind]}
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.22em] tabular-nums"
        style={{ color: TOK.warning }}
      >
        {domain.lastIncidentAgo}
      </span>
    </div>
  );
}

function ContactThreatFooter({
  selected,
}: {
  selected: PlacedBlip | null;
}): JSX.Element {
  const status = selected?.domain.status ?? 'healthy';
  const cls = selected ? classify(status) : 'STANDBY';
  const tokColor = !selected
    ? TOK.textDim
    : status === 'healthy'
      ? TOK.success
      : status === 'warming'
        ? TOK.warning
        : TOK.danger;
  const Icon = !selected
    ? Bell
    : status === 'healthy'
      ? ShieldCheck
      : status === 'warming'
        ? ShieldAlert
        : ShieldX;
  return (
    <div className="border-t border-border-muted bg-surface-2/50 px-4 py-3">
      <div
        className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.24em]"
        style={{
          borderColor:
            'color-mix(in srgb, ' + tokColor + ' 35%, transparent)',
          backgroundColor:
            'color-mix(in srgb, ' + tokColor + ' 8%, transparent)',
          color: tokColor,
        }}
      >
        <span className="inline-flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          THREAT ASSESSMENT
        </span>
        <span className="font-semibold">{cls}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TacticalReadoutTier — 3-column bottom row
// ---------------------------------------------------------------------------

function TacticalReadoutTier({
  sweepLog,
  alerts,
  providers,
  onSelectAlert,
}: {
  sweepLog: SweepLogEntry[];
  alerts: AgencyReputationData['recentAlerts'];
  providers: AgencyReputationData['providers'];
  onSelectAlert: (domain: string) => void;
}): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: 'easeOut', delay: 0.24 }}
      className="grid grid-cols-1 gap-4 lg:grid-cols-3"
    >
      <SweepCycleLog entries={sweepLog} />
      <ThreatAlertsColumn alerts={alerts} onSelect={onSelectAlert} />
      <SectorStatusColumn providers={providers} />
    </motion.section>
  );
}

function SweepCycleLog({ entries }: { entries: SweepLogEntry[] }): JSX.Element {
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur-xl"
      style={{
        boxShadow:
          '0 12px 32px -16px rgba(242,101,34,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <ReadoutHeader
        icon={ScanLine}
        title="Sweep cycle log"
        subtitle="Contacts swept · last revolution"
      />
      <div className="flex-1 space-y-1 px-3 py-3">
        {entries.length === 0 ? (
          <EmptyReadout label="No sweeps recorded" icon={Radar} />
        ) : (
          entries.map((e, idx) => (
            <SweepLogRow key={e.id} entry={e} index={idx} />
          ))
        )}
      </div>
      <div className="border-t border-border-muted bg-surface-2/40 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.24em] text-text-faint">
        <div className="flex items-center justify-between">
          <span>LOG · BUFFER 14</span>
          <span className="inline-flex items-center gap-1 text-text-dim">
            <Timer className="h-2.5 w-2.5" />
            ROLLING
          </span>
        </div>
      </div>
    </div>
  );
}

function SweepLogRow({
  entry,
  index,
}: {
  entry: SweepLogEntry;
  index: number;
}): JSX.Element {
  const tokColor =
    entry.classification === 'FRIENDLY'
      ? TOK.accent
      : entry.classification === 'NEUTRAL'
        ? TOK.warning
        : TOK.danger;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="grid grid-cols-12 items-center gap-2 rounded-sm border border-border-muted/60 bg-surface-2/40 px-2 py-1.5 font-mono text-[10px]"
    >
      <span className="col-span-3 uppercase tracking-[0.18em] text-text-faint">
        {entry.timeLabel}
      </span>
      <span className="col-span-5 truncate text-text">{entry.domain}</span>
      <span
        className="col-span-3 inline-flex items-center gap-1 uppercase tracking-[0.18em]"
        style={{ color: tokColor }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: tokColor, boxShadow: '0 0 6px ' + tokColor }}
        />
        {entry.classification}
      </span>
      <span className="col-span-1 text-right tabular-nums text-text-dim">
        {entry.reputation.toString().padStart(2, '0')}
      </span>
    </motion.div>
  );
}

function ThreatAlertsColumn({
  alerts,
  onSelect,
}: {
  alerts: AgencyReputationData['recentAlerts'];
  onSelect: (domain: string) => void;
}): JSX.Element {
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur-xl"
      style={{
        boxShadow:
          '0 12px 32px -16px rgba(255,92,122,0.18), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <ReadoutHeader
        icon={Siren}
        title="Inbound contact alerts"
        subtitle={`${alerts.length.toString().padStart(2, '0')} active · ${criticalCount.toString().padStart(2, '0')} critical`}
        tone="danger"
      />
      <div className="flex-1 space-y-2 px-3 py-3">
        {alerts.length === 0 ? (
          <EmptyReadout label="No active alerts" icon={ShieldCheck} />
        ) : (
          alerts.map((a, idx) => (
            <AlertRow
              key={a.id}
              alert={a}
              index={idx}
              onSelect={() => onSelect(a.domain)}
            />
          ))
        )}
      </div>
      <div className="border-t border-border-muted bg-surface-2/40 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.24em] text-text-faint">
        <div className="flex items-center justify-between">
          <span>SEVERITY CODES · W-1 / W-2 / C-1 / C-2</span>
          <span className="inline-flex items-center gap-1 text-text-dim">
            <Bell className="h-2.5 w-2.5" />
            LIVE
          </span>
        </div>
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  index,
  onSelect,
}: {
  alert: AgencyReputationData['recentAlerts'][number];
  index: number;
  onSelect: () => void;
}): JSX.Element {
  const Icon = ALERT_KIND_ICON[alert.kind];
  const recencyMin = parseAgoToMinutes(alert.ago);
  const code = severityCode(alert.severity, recencyMin);
  const isCritical = alert.severity === 'critical';
  const tokColor = isCritical ? TOK.danger : TOK.warning;
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.32, delay: index * 0.06 }}
      className="group w-full overflow-hidden rounded-md border bg-surface-2/40 px-3 py-2 text-left transition hover:bg-surface-2/70"
      style={{
        borderColor: 'color-mix(in srgb, ' + tokColor + ' 30%, transparent)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <motion.span
            className="grid h-7 w-7 place-items-center rounded-md"
            style={{
              backgroundColor:
                'color-mix(in srgb, ' + tokColor + ' 14%, transparent)',
              color: tokColor,
            }}
            animate={
              isCritical ? { scale: [1, 1.07, 1] } : undefined
            }
            transition={
              isCritical
                ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' }
                : undefined
            }
          >
            <Icon className="h-3.5 w-3.5" />
          </motion.span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-[0.22em] text-text">
              <span
                className="rounded-sm px-1 py-px text-[9px] font-bold tracking-[0.18em]"
                style={{
                  backgroundColor:
                    'color-mix(in srgb, ' + tokColor + ' 18%, transparent)',
                  color: tokColor,
                }}
              >
                {code}
              </span>
              {ALERT_KIND_LABEL[alert.kind]}
              <span className="text-text-dim">·</span>
              <span className="text-text-dim">
                {ALERT_KIND_CODE[alert.kind]}
              </span>
            </p>
            <p className="mt-0.5 truncate text-[10px] text-text-dim">
              {alert.domain}
            </p>
          </div>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
          {alert.ago}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-text-dim">
        {alert.message}
      </p>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
        <span className="inline-flex items-center gap-1 text-text-dim">
          <ChevronRight className="h-2.5 w-2.5" />
          TRACK CONTACT
        </span>
        <span style={{ color: tokColor }}>
          {isCritical ? 'PRIORITY' : 'STANDARD'}
        </span>
      </div>
    </motion.button>
  );
}

function SectorStatusColumn({
  providers,
}: {
  providers: AgencyReputationData['providers'];
}): JSX.Element {
  const overall =
    providers.length === 0
      ? 0
      : providers.reduce((acc, p) => acc + p.inboxPct, 0) / providers.length;
  const overallTier = sectorTier(overall);
  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border-muted bg-surface/80 backdrop-blur-xl"
      style={{
        boxShadow:
          '0 12px 32px -16px rgba(242,101,34,0.16), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <ReadoutHeader
        icon={Globe}
        title="Sector status"
        subtitle="Provider readiness · live"
      />
      <div className="flex-1 space-y-2.5 px-3 py-3">
        {providers.length === 0 ? (
          <EmptyReadout label="No sector data" icon={Antenna} />
        ) : (
          providers.map((p, idx) => (
            <SectorRow key={p.id} provider={p} index={idx} />
          ))
        )}
      </div>
      <div className="border-t border-border-muted bg-surface-2/40 px-3 py-2">
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.24em] text-text-faint">
          <span>AGGREGATE READINESS</span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: overallTier.tok }}
          >
            {overallTier.label} · {fmtPct(overall, 1)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SectorRow({
  provider,
  index,
}: {
  provider: AgencyReputationData['providers'][number];
  index: number;
}): JSX.Element {
  const tier = sectorTier(provider.inboxPct);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.07 }}
      className="rounded-md border border-border-muted bg-surface-2/40 px-3 py-2.5"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-md ring-1"
            style={{
              backgroundColor:
                'color-mix(in srgb, ' + tier.tok + ' 14%, transparent)',
              color: tier.tok,
            }}
          >
            <Mail className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-text">
              {provider.label.toUpperCase()} SECTOR
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
              {fmtInt(provider.last24hSends)} sends · 24h
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em]"
          style={{
            borderColor: 'color-mix(in srgb, ' + tier.tok + ' 35%, transparent)',
            color: tier.tok,
            backgroundColor:
              'color-mix(in srgb, ' + tier.tok + ' 12%, transparent)',
          }}
        >
          <Signal className="h-2.5 w-2.5" />
          {tier.label}
        </span>
      </div>
      <div className="mt-2.5">
        <SectorBar
          inbox={provider.inboxPct}
          spam={provider.spamPct}
          blocked={provider.blockedPct}
          tokColor={tier.tok}
        />
        <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint">
          <span className="inline-flex items-center gap-1">
            <Inbox className="h-2.5 w-2.5" />
            INBOX{' '}
            <span style={{ color: tier.tok }} className="ml-auto tabular-nums">
              {fmtPct(provider.inboxPct, 1)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Flame className="h-2.5 w-2.5" />
            SPAM
            <span
              className="ml-auto tabular-nums"
              style={{ color: TOK.warning }}
            >
              {fmtPct(provider.spamPct, 1)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Shield className="h-2.5 w-2.5" />
            BLK
            <span
              className="ml-auto tabular-nums"
              style={{ color: TOK.danger }}
            >
              {fmtPct(provider.blockedPct, 1)}
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function SectorBar({
  inbox,
  spam,
  blocked,
  tokColor,
}: {
  inbox: number;
  spam: number;
  blocked: number;
  tokColor: string;
}): JSX.Element {
  // Normalise to 100%
  const total = Math.max(inbox + spam + blocked, 0.001);
  const inboxPct = (inbox / total) * 100;
  const spamPct = (spam / total) * 100;
  const blockedPct = (blocked / total) * 100;
  return (
    <div className="relative h-2 overflow-hidden rounded-sm border border-border-muted bg-surface/60">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${inboxPct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="absolute left-0 top-0 h-full"
        style={{ backgroundColor: tokColor, boxShadow: '0 0 10px ' + tokColor }}
      />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${spamPct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.06 }}
        className="absolute top-0 h-full"
        style={{ left: `${inboxPct}%`, backgroundColor: TOK.warning }}
      />
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${blockedPct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.12 }}
        className="absolute top-0 h-full"
        style={{
          left: `${inboxPct + spamPct}%`,
          backgroundColor: TOK.danger,
        }}
      />
    </div>
  );
}

function ReadoutHeader({
  icon: Icon,
  title,
  subtitle,
  tone = 'accent',
}: {
  icon: typeof ScanLine;
  title: string;
  subtitle: string;
  tone?: 'accent' | 'danger';
}): JSX.Element {
  const tokColor = tone === 'danger' ? TOK.danger : TOK.accent;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-muted bg-surface-2/40 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-8 w-8 place-items-center rounded-md border"
          style={{
            borderColor:
              'color-mix(in srgb, ' + tokColor + ' 30%, transparent)',
            color: tokColor,
            backgroundColor:
              'color-mix(in srgb, ' + tokColor + ' 10%, transparent)',
          }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: tokColor }}
          >
            {title}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
            {subtitle}
          </p>
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1 rounded-sm border border-border-muted bg-surface/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-text-faint"
      >
        <Zap className="h-2.5 w-2.5" />
        LIVE
      </span>
    </div>
  );
}

function EmptyReadout({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof Radar;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-muted bg-surface-2/30 px-4 py-6 text-center">
      <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-border-muted text-text-faint">
        <Icon className="h-4 w-4" />
      </span>
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-faint">
        {label}
      </p>
    </div>
  );
}
