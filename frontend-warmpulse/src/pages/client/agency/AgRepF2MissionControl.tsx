import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Compass,
  Crosshair,
  Cpu,
  Flag,
  Gauge,
  Globe2,
  Layers,
  Mail,
  Minus,
  Navigation,
  Orbit,
  Power,
  Radar,
  Radio,
  Rocket,
  Satellite,
  Shield,
  ShieldAlert,
  Signal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Triangle,
  Wifi,
  Wrench,
} from 'lucide-react';

import type { AgencyReputationData } from '@/pages/client/agency/AgRepC4Forecast';
import { formatNumber } from '@/lib/format';

/**
 * AgRepF2MissionControl — Agency Reputation candidate F2, "Mission Control
 * Countdown". A NASA-style flight director console: dark surfaces, mono
 * numbers, sprung gauge needles, a live T-MINUS countdown that ticks each
 * second, and a big trajectory plot whose right half is a projected
 * forecast with a confidence band and pinned risk diamonds.
 *
 * Layout (top → bottom):
 *   1. MISSION HEADER — agency name + region as "Launch site"; MET clock
 *      + T-MINUS countdown driven by a real setInterval.
 *   2. FLIGHT HUD — three telemetry tiles: altitude indicator (overall
 *      score, sprung needle), flight angle (7d trend as pitch), vehicle
 *      health (3-segment proportional bar of healthy/warming/at_risk).
 *   3. TRAJECTORY CHART — full-width historical solid + projected dashed
 *      with confidence band, red-diamond risk markers, "DECISION POINT
 *      — T-04h" callout, crosshair-on-hover tooltip.
 *   4. PROVIDER STRIP — Gmail / Outlook / Yahoo as payload cells.
 *   5. TELEMETRY FEED — three columns: vehicle status list, anomaly log
 *      (console-style timestamps + severity-coded glow), crew advisory.
 *   6. MISSION BAND — read-only PROCEED / ABORT signal buttons + a
 *      compact telemetry strip (sends, bounce, spam, heading).
 *
 * STANDALONE: derives every value from `data` or the inline MOCK.
 * Distinct from siblings C1 radar / C2 vitals / C3 periodic / C4 weather:
 * F2 is the flight-deck countdown HUD.
 */

// ---------------------------------------------------------------------------
// Data shape — re-exported from AgRepC4Forecast as the canonical Agency
// Reputation contract. We only TYPE-import to avoid a runtime dep edge.
// ---------------------------------------------------------------------------

type DomainStatus = 'healthy' | 'warming' | 'at_risk';
type AlertSeverity = 'warn' | 'critical';
type AlertKind = 'bounce_spike' | 'spam_complaint' | 'dns_break' | 'peer_failed';

// ---------------------------------------------------------------------------
// MOCK — Northwind Agency portfolio (compact tuple builder, expanded below).
// ---------------------------------------------------------------------------

// Each tuple: [id, domain, subClientId, subClientName, rep, status,
//   spf, dkim, dmarc, mailboxes, inboxPct, spamFolderPct,
//   last7dScores, lastIncidentAgo, lastIncidentKind]
type DomainTuple = readonly [
  string, string, string, string, number, DomainStatus,
  boolean, boolean, boolean, number, number, number,
  number[], string | null, AlertKind | null,
];

const DOMAIN_TUPLES: DomainTuple[] = [
  ['helix-outbound-com', 'send.helix.io', 'helix', 'Helix Outbound', 91, 'healthy', true, true, true, 12, 96.1, 1.2, [84, 86, 88, 89, 89, 90, 91], null, null],
  ['nimbus-reach-com', 'mail.nimbusreach.com', 'nimbus', 'Nimbus Reach', 88, 'healthy', true, true, true, 9, 94.4, 1.6, [82, 83, 85, 86, 87, 88, 88], null, null],
  ['orion-mail-co', 'out.orionmail.co', 'orion', 'Orion Mail', 84, 'healthy', true, true, true, 7, 92.0, 1.9, [80, 81, 82, 83, 83, 84, 84], '2d ago', 'peer_failed'],
  ['vega-sends-com', 'sx.vegasends.com', 'vega', 'Vega Sends', 82, 'healthy', true, true, false, 6, 90.2, 2.1, [78, 79, 80, 80, 81, 82, 82], '5d ago', 'dns_break'],
  ['quasar-studio-com', 'send.quasarstudio.com', 'quasar', 'Quasar Studio', 80, 'healthy', true, true, true, 5, 89.0, 2.4, [76, 77, 78, 78, 79, 80, 80], null, null],
  ['lyra-pipeline-io', 'mx.lyrapipeline.io', 'lyra', 'Lyra Pipeline', 71, 'warming', true, true, false, 4, 81.6, 3.4, [62, 64, 66, 67, 68, 70, 71], '14h ago', 'bounce_spike'],
  ['pixel-drop-co', 'out.pixeldrop.co', 'pixel', 'Pixel Drop', 64, 'warming', true, false, false, 3, 74.3, 4.7, [54, 56, 58, 60, 61, 63, 64], '6h ago', 'spam_complaint'],
  ['atlas-bio-co', 'send.atlasbio.co', 'atlas', 'Atlas Bio', 42, 'at_risk', false, false, false, 4, 51.2, 12.6, [58, 56, 53, 50, 47, 44, 42], '38m ago', 'bounce_spike'],
];

const PROVIDER_TUPLES: ReadonlyArray<readonly [string, string, number, number, number, number]> = [
  ['gmail', 'Gmail', 93.1, 1.7, 0.4, 8420],
  ['outlook', 'Outlook', 89.4, 2.6, 0.8, 4310],
  ['yahoo', 'Yahoo', 84.7, 3.1, 1.2, 2090],
];

type AlertTuple = readonly [string, string, AlertKind, string, string, AlertSeverity];
const ALERT_TUPLES: AlertTuple[] = [
  ['al-1', 'send.atlasbio.co', 'bounce_spike', 'Bounce rate climbed to 14.2% in the last hour.', '38m ago', 'critical'],
  ['al-2', 'out.pixeldrop.co', 'spam_complaint', 'Two spam complaints recorded against Gmail recipients.', '6h ago', 'warn'],
  ['al-3', 'mx.lyrapipeline.io', 'bounce_spike', 'Lyra warmup bounces ticked above 4% threshold.', '14h ago', 'warn'],
  ['al-4', 'sx.vegasends.com', 'dns_break', 'DMARC record missing on apex; child domains unaffected.', '5d ago', 'warn'],
];

const MOCK: AgencyReputationData = {
  agency: { name: 'Northwind Agency', region: 'us-east-1' },
  summary: {
    overallScore: 78, trend7dDelta: 2.4,
    domainsHealthy: 5, domainsWarming: 2, domainsAtRisk: 1,
    totalSends24h: 14820, bouncePct24h: 1.8, spamComplaintPct24h: 0.4,
  },
  domains: DOMAIN_TUPLES.map((t) => ({
    id: t[0], domain: t[1], subClientId: t[2], subClientName: t[3],
    reputationScore: t[4], status: t[5],
    spfPass: t[6], dkimPass: t[7], dmarcPass: t[8],
    mailboxCount: t[9], inboxRatePct: t[10], spamFolderPct: t[11],
    last7dScores: t[12], lastIncidentAgo: t[13], lastIncidentKind: t[14],
  })),
  providers: PROVIDER_TUPLES.map((t) => ({
    id: t[0], label: t[1], inboxPct: t[2], spamPct: t[3], blockedPct: t[4], last24hSends: t[5],
  })),
  recentAlerts: ALERT_TUPLES.map((t) => ({
    id: t[0], domain: t[1], kind: t[2], message: t[3], ago: t[4], severity: t[5],
  })),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

const fmtInt = (n: number): string => formatNumber(n);

const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/** Format seconds into Dd HH:MM as an MET (mission elapsed time) display. */
function fmtMET(totalSeconds: number): { days: number; hours: number; minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const rem1 = s - days * 86400;
  const hours = Math.floor(rem1 / 3600);
  const rem2 = rem1 - hours * 3600;
  const minutes = Math.floor(rem2 / 60);
  const seconds = rem2 - minutes * 60;
  return { days, hours, minutes, seconds };
}

/** Format seconds remaining into Th HH:MM:SS for the T-minus clock. */
function fmtTMinus(totalSeconds: number): { hours: number; minutes: number; seconds: number; expired: boolean } {
  if (totalSeconds <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
  const s = Math.floor(totalSeconds);
  const hours = Math.floor(s / 3600);
  const rem = s - hours * 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem - minutes * 60;
  return { hours, minutes, seconds, expired: false };
}

/** Convert a 0..100 score into a status band. */
const scoreBand = (s: number): DomainStatus | 'inactive' => {
  if (s <= 0) return 'inactive';
  if (s >= 80) return 'healthy';
  if (s >= 60) return 'warming';
  return 'at_risk';
};

/** Map a DomainStatus → flight-status code we display in the vehicle list. */
const STATUS_CODE: Record<DomainStatus, string> = {
  healthy: 'NOMINAL',
  warming: 'DEGRADED',
  at_risk: 'FAILURE',
};

const TONE_TEXT = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
  inactive: 'text-text-faint',
} as const;

const TONE_BG = {
  healthy: 'bg-accent/15',
  warming: 'bg-accent4/15',
  at_risk: 'bg-accent3/15',
  inactive: 'bg-surface-2',
} as const;

const TONE_DOT = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
  inactive: 'bg-text-faint',
} as const;

/** Map an alert kind to a flight-deck callsign label and short icon. */
const ALERT_LABEL: Record<AlertKind, string> = {
  bounce_spike: 'ANOMALY-A',
  spam_complaint: 'ANOMALY-B',
  dns_break: 'ANOMALY-C',
  peer_failed: 'ANOMALY-D',
};

const ALERT_ICON: Record<AlertKind, typeof AlertTriangle> = {
  bounce_spike: AlertOctagon,
  spam_complaint: ShieldAlert,
  dns_break: Wifi,
  peer_failed: Power,
};

const ALERT_SHORT: Record<AlertKind, string> = {
  bounce_spike: 'BOUNCE',
  spam_complaint: 'SPAM',
  dns_break: 'AUTH',
  peer_failed: 'PEER',
};

// ---------------------------------------------------------------------------
// Trajectory time-series synthesis
// ---------------------------------------------------------------------------

interface TrajectoryPoint {
  /** Day offset from today. Negative = past, 0 = now, positive = future. */
  offset: number;
  /** Reputation score 0..100. */
  score: number;
  /** Confidence band (only meaningful for projected points). */
  lower?: number;
  upper?: number;
  /** ISO-ish label rendered on the X axis. */
  label: string;
}

interface RiskEvent {
  /** Offset in days (positive = future). */
  offset: number;
  label: string;
  detail: string;
  severity: AlertSeverity;
  domain: string;
}

const PAST_DAYS = 7;
const FUTURE_DAYS = 7;

const HISTORY_LABELS = ['D-7', 'D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'D-1', 'NOW'];
const FUTURE_LABELS = ['D+1', 'D+2', 'D+3', 'D+4', 'D+5', 'D+6', 'D+7'];

/**
 * Build a 14-day trajectory series from the supplied domains. We average
 * last7dScores element-wise for the historical leg, then extrapolate using
 * the trailing slope plus a faint sinusoidal modulation that gives the
 * forecast curve a believable wobble.
 */
function buildTrajectory(
  domains: AgencyReputationData['domains'],
  overall: number,
  trendDelta: number
): { history: TrajectoryPoint[]; future: TrajectoryPoint[] } {
  if (domains.length === 0) {
    const history: TrajectoryPoint[] = HISTORY_LABELS.map((label, i) => ({
      offset: -PAST_DAYS + i,
      score: 0,
      label,
    }));
    const future: TrajectoryPoint[] = FUTURE_LABELS.map((label, i) => ({
      offset: i + 1,
      score: 0,
      lower: 0,
      upper: 0,
      label,
    }));
    return { history, future };
  }

  const days = PAST_DAYS;
  const avgs: number[] = Array.from({ length: days }, (_, idx) => {
    let total = 0;
    let count = 0;
    for (const d of domains) {
      const v = d.last7dScores[Math.min(idx, d.last7dScores.length - 1)];
      if (typeof v === 'number') {
        total += v;
        count += 1;
      }
    }
    return count > 0 ? total / count : 0;
  });

  const history: TrajectoryPoint[] = avgs.map((score, i) => ({
    offset: -days + i,
    score: Math.round(score),
    label: HISTORY_LABELS[i] ?? `D-${days - i}`,
  }));
  history.push({
    offset: 0,
    score: Math.round(overall),
    label: 'NOW',
  });

  const last = avgs[avgs.length - 1] ?? overall;
  const first = avgs[0] ?? overall;
  const slope = (last - first) / Math.max(1, days - 1);
  const drift = trendDelta * 0.4;

  const future: TrajectoryPoint[] = FUTURE_LABELS.map((label, i) => {
    const base = last + (slope + drift * 0.05) * (i + 1) + Math.sin(i * 0.8) * 1.2;
    const score = clamp(Math.round(base), 0, 100);
    const widen = 2.5 + i * 1.4;
    return {
      offset: i + 1,
      score,
      lower: clamp(score - widen, 0, 100),
      upper: clamp(score + widen, 0, 100),
      label,
    };
  });

  return { history, future };
}

/** Derive risk events on the future side by inspecting recent alerts +
 *  warming/at-risk domains. The MOST critical sits at +1 (T-04h decision
 *  point); the next two land at +3 and +5. */
function buildRiskEvents(data: AgencyReputationData): RiskEvent[] {
  const critical = data.recentAlerts
    .filter((a) => a.severity === 'critical')
    .slice(0, 1);
  const warning = data.recentAlerts.filter((a) => a.severity !== 'critical').slice(0, 2);

  const events: RiskEvent[] = [];

  for (const a of critical) {
    events.push({
      offset: 1,
      label: ALERT_LABEL[a.kind],
      detail: `${a.domain} — ${a.message}`,
      severity: 'critical',
      domain: a.domain,
    });
  }
  warning.forEach((a, idx) => {
    events.push({
      offset: 3 + idx * 2,
      label: ALERT_LABEL[a.kind],
      detail: `${a.domain} — ${a.message}`,
      severity: 'warn',
      domain: a.domain,
    });
  });

  return events;
}

/** Build the 3 crew advisories: derived from data, not random. */
interface CrewAdvisory {
  id: string;
  title: string;
  body: string;
  severity: AlertSeverity;
  Icon: typeof AlertTriangle;
}

function buildCrewAdvisories(data: AgencyReputationData): CrewAdvisory[] {
  const advisories: CrewAdvisory[] = [];

  // 1. Pause anything in at_risk with a critical incident.
  const failing = data.domains.find(
    (d) => d.status === 'at_risk' && d.lastIncidentKind === 'bounce_spike'
  );
  if (failing) {
    advisories.push({
      id: 'adv-pause',
      title: `Pause ${failing.subClientName} sends`,
      body: `${failing.domain} is in FAILURE (rep ${failing.reputationScore}). Halt outbound and investigate the bounce vector.`,
      severity: 'critical',
      Icon: Ban,
    });
  }

  // 2. Investigate DNS break / authentication issues.
  const dnsBreak = data.domains.find(
    (d) => d.lastIncidentKind === 'dns_break' || !d.dmarcPass || !d.spfPass
  );
  if (dnsBreak) {
    advisories.push({
      id: 'adv-dns',
      title: `Verify DNS auth — ${dnsBreak.domain}`,
      body: `Rotate DKIM key + re-publish DMARC record. ${
        dnsBreak.spfPass ? '' : 'SPF '
      }${dnsBreak.dkimPass ? '' : 'DKIM '}${dnsBreak.dmarcPass ? '' : 'DMARC '}check needed.`,
      severity: 'warn',
      Icon: Wrench,
    });
  }

  // 3. Throttle warming domain with spam complaints.
  const spamming = data.domains.find(
    (d) => d.status === 'warming' && d.lastIncidentKind === 'spam_complaint'
  );
  if (spamming) {
    advisories.push({
      id: 'adv-throttle',
      title: `Throttle ${spamming.subClientName}`,
      body: `Reduce daily target by 30% and pause aggressive list segments until spam complaints subside.`,
      severity: 'warn',
      Icon: Shield,
    });
  }

  // Pad to 3 with proactive advisories if we don't have enough findings.
  if (advisories.length < 3) {
    const topHealthy = data.domains.find((d) => d.status === 'healthy');
    if (topHealthy && advisories.length < 3) {
      advisories.push({
        id: 'adv-monitor',
        title: 'Maintain current trajectory',
        body: `${topHealthy.subClientName} is nominal at rep ${topHealthy.reputationScore}. Continue daily ramp; no action required.`,
        severity: 'warn',
        Icon: CheckCircle2,
      });
    }
  }
  if (advisories.length < 3) {
    advisories.push({
      id: 'adv-watch',
      title: 'Monitor provider mix',
      body: `Gmail ${fmtPct(data.providers[0]?.inboxPct ?? 0)} inbox / Outlook ${fmtPct(
        data.providers[1]?.inboxPct ?? 0
      )}. Yahoo lagging — keep volume steady.`,
      severity: 'warn',
      Icon: Compass,
    });
  }

  return advisories.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Mission-clock hook — drives MET (elapsed) + T-minus (countdown).
// ---------------------------------------------------------------------------

/**
 * MET starts at 14d 06:23:00 (mocked launch). T-minus starts at 04:23:11
 * and counts down. When T-minus hits zero, it reloads to the next event
 * window (15:30:00 → next decision). Real setInterval, cleared on unmount.
 */
function useMissionClocks(): { met: number; tminus: number } {
  // Anchor MET in seconds. Bumped each second.
  const metStart = useRef<number>(14 * 86400 + 6 * 3600 + 23 * 60);
  const tStart = useRef<number>(4 * 3600 + 23 * 60 + 11);
  const [met, setMet] = useState(metStart.current);
  const [tminus, setTminus] = useState(tStart.current);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMet((m) => m + 1);
      setTminus((t) => {
        if (t <= 1) {
          // Loop to a fresh window so the visual never freezes.
          return 15 * 3600 + 30 * 60;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { met, tminus };
}

// ---------------------------------------------------------------------------
// COUNTDOWN DIGIT — monospace block with a subtle flicker on tick over.
// ---------------------------------------------------------------------------

interface CountdownDigitsProps {
  value: number;
  digits?: 1 | 2 | 3;
  glow?: boolean;
}

function CountdownDigits({ value, digits = 2, glow = false }: CountdownDigitsProps): JSX.Element {
  const text = value.toString().padStart(digits, '0');
  return (
    <motion.span
      key={text}
      initial={{ opacity: 0.55, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={`font-mono tabular-nums ${glow ? 'text-accent' : 'text-text'}`}
      style={
        glow
          ? { textShadow: '0 0 12px rgba(242,101,34,0.55), 0 0 2px rgba(255,138,75,0.6)' }
          : undefined
      }
    >
      {text}
    </motion.span>
  );
}

interface MissionClockProps {
  label: string;
  met: number;
  variant?: 'met';
}

function MetClock({ label, met }: MissionClockProps): JSX.Element {
  const { days, hours, minutes, seconds } = fmtMET(met);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-text-faint">
        <Orbit size={10} strokeWidth={2.2} />
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 font-mono text-base font-semibold leading-none text-text">
        <span className="tabular-nums">{pad2(days)}</span>
        <span className="text-[10px] text-text-faint">d</span>
        <CountdownDigits value={hours} digits={2} />
        <span className="text-text-faint">:</span>
        <CountdownDigits value={minutes} digits={2} />
        <span className="text-text-faint">:</span>
        <CountdownDigits value={seconds} digits={2} />
      </div>
    </div>
  );
}

interface TMinusClockProps {
  label: string;
  tminus: number;
}

function TMinusClock({ label, tminus }: TMinusClockProps): JSX.Element {
  const { hours, minutes, seconds, expired } = fmtTMinus(tminus);
  // Pulse the colon every other second for "live" feedback.
  const flicker = seconds % 2 === 0;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-accent">
        <Target size={10} strokeWidth={2.4} />
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 font-mono text-xl font-semibold leading-none">
        <span className="text-accent">T-</span>
        <CountdownDigits value={hours} digits={2} glow />
        <span
          className="text-accent transition-opacity"
          style={{ opacity: flicker ? 1 : 0.25 }}
        >
          :
        </span>
        <CountdownDigits value={minutes} digits={2} glow />
        <span
          className="text-accent transition-opacity"
          style={{ opacity: flicker ? 1 : 0.25 }}
        >
          :
        </span>
        <CountdownDigits value={seconds} digits={2} glow />
        {expired ? <span className="ml-1 text-[10px] text-accent3">EXPIRED</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MISSION HEADER BAR
// ---------------------------------------------------------------------------

interface MissionHeaderProps {
  agencyName: string;
  region: string;
  met: number;
  tminus: number;
}

function MissionHeader({ agencyName, region, met, tminus }: MissionHeaderProps): JSX.Element {
  return (
    <header
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface px-6 py-4"
      style={{
        background:
          'linear-gradient(135deg, rgba(242,101,34,0.06) 0%, transparent 35%, rgba(18,18,26,0.96) 100%)',
      }}
    >
      {/* Background grid lines for cockpit texture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(242,101,34,0.05) 0px, rgba(242,101,34,0.05) 1px, transparent 1px, transparent 80px), repeating-linear-gradient(0deg, rgba(242,101,34,0.04) 0px, rgba(242,101,34,0.04) 1px, transparent 1px, transparent 40px)',
        }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/40 bg-accent/15"
            style={{ boxShadow: '0 0 24px rgba(242,101,34,0.18)' }}
          >
            <Rocket size={22} className="text-accent" strokeWidth={1.8} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-text-faint">
              <Radio size={10} strokeWidth={2.2} />
              MISSION CONTROL · FLIGHT DIRECTOR CHANNEL
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-3">
              <div className="text-xl font-semibold text-text">{agencyName}</div>
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-text-dim">
                <Globe2 size={11} strokeWidth={2} />
                LAUNCH SITE · {region}
              </div>
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-accent">
                <Signal size={11} strokeWidth={2.2} />
                TELEMETRY LIVE
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <MetClock label="MET · ELAPSED" met={met} />
          <div
            aria-hidden
            className="hidden h-10 w-px bg-border-muted sm:block"
          />
          <TMinusClock label="T-MINUS · NEXT EVENT" tminus={tminus} />
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// ALTITUDE GAUGE — sprung needle for the overall score panel.
// ---------------------------------------------------------------------------

interface AltitudeGaugeProps {
  value: number;
  projected: number;
}

function AltitudeGauge({ value, projected }: AltitudeGaugeProps): JSX.Element {
  // Map 0..100 → -100°..+100° sweep.
  const target = (clamp(value, 0, 100) - 50) * 2;
  const angle = useMotionValue(-100);
  const spring = useSpring(angle, { stiffness: 70, damping: 16, mass: 1 });

  useEffect(() => {
    angle.set(target);
  }, [target, angle]);

  // Compose the rotation string at the rendered time.
  const needleRot = useTransform(spring, (v) => `${v}deg`);

  const projAngle = (clamp(projected, 0, 100) - 50) * 2;

  // Tick marks every 10°.
  const ticks = useMemo(() => {
    return Array.from({ length: 11 }, (_, i) => {
      const t = -100 + i * 20;
      const isMajor = i % 2 === 0;
      const rad = (t * Math.PI) / 180;
      const inner = isMajor ? 56 : 62;
      const outer = 72;
      return {
        x1: 110 + Math.sin(rad) * inner,
        y1: 110 - Math.cos(rad) * inner,
        x2: 110 + Math.sin(rad) * outer,
        y2: 110 - Math.cos(rad) * outer,
        major: isMajor,
        label: String(i * 10),
        labelX: 110 + Math.sin(rad) * 46,
        labelY: 110 - Math.cos(rad) * 46 + 3,
      };
    });
  }, []);

  return (
    <div className="relative flex w-full flex-col items-center">
      <svg viewBox="0 0 220 130" className="w-full max-w-[320px]" role="img" aria-label="Altitude indicator">
        <defs>
          <linearGradient id="alt-arc" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(255,150,112,0.85)" />
            <stop offset="0.5" stopColor="rgba(255,213,79,0.9)" />
            <stop offset="1" stopColor="rgba(242,101,34,0.95)" />
          </linearGradient>
          <radialGradient id="alt-hub" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(242,101,34,0.85)" />
            <stop offset="1" stopColor="rgba(242,101,34,0.15)" />
          </radialGradient>
        </defs>
        {/* Outer track + active arc */}
        <path d="M22 110 A88 88 0 0 1 198 110" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={20} strokeLinecap="round" />
        <path d="M22 110 A88 88 0 0 1 198 110" fill="none" stroke="url(#alt-arc)" strokeWidth={12} strokeLinecap="round" opacity={0.85} />
        {/* Ticks */}
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? 'rgba(232,232,240,0.6)' : 'rgba(136,136,160,0.4)'}
            strokeWidth={t.major ? 2 : 1} />
        ))}
        {/* Major-tick labels */}
        {ticks.filter((t) => t.major).map((t, i) => (
          <text key={`lbl-${i}`} x={t.labelX} y={t.labelY}
            fontFamily="JetBrains Mono, monospace" fontSize="9"
            fill="rgba(136,136,160,0.7)" textAnchor="middle">{t.label}</text>
        ))}
        {/* Projected (ghost) needle */}
        <line x1={110} y1={110}
          x2={110 + Math.sin((projAngle * Math.PI) / 180) * 70}
          y2={110 - Math.cos((projAngle * Math.PI) / 180) * 70}
          stroke="rgba(255,180,84,0.45)" strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />
        {/* Sprung needle */}
        <motion.line x1={110} y1={110} x2={110} y2={40}
          stroke="rgb(242,101,34)" strokeWidth={3} strokeLinecap="round"
          style={{ originX: '110px', originY: '110px', rotate: needleRot }} />
        {/* Hub */}
        <circle cx={110} cy={110} r={9} fill="url(#alt-hub)" />
        <circle cx={110} cy={110} r={4} fill="rgb(242,101,34)" />
      </svg>
      <div className="-mt-3 flex flex-col items-center">
        <div className="font-mono text-3xl font-semibold leading-none text-text">
          {Math.round(value)}
          <span className="ml-0.5 text-base text-text-dim">/100</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-text-faint">
          <Gauge size={10} strokeWidth={2.4} />
          PROJ {Math.round(projected)} · 24H AHEAD
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FLIGHT ANGLE — telemetry-stable panel mid-tile.
// ---------------------------------------------------------------------------

interface FlightAngleProps {
  delta: number;
}

function FlightAngle({ delta }: FlightAngleProps): JSX.Element {
  // Slope is delta * a multiplier so visually we get a clean angle.
  const slope = clamp(delta * 3.4, -42, 42);
  const angle = useMotionValue(0);
  const spring = useSpring(angle, { stiffness: 80, damping: 18, mass: 1 });
  useEffect(() => {
    angle.set(slope);
  }, [slope, angle]);

  const climbing = delta > 0.5;
  const descending = delta < -0.5;
  const stateLabel = climbing ? 'ASCENT' : descending ? 'DESCENT' : 'LEVEL';
  const stateTone = climbing ? 'text-accent' : descending ? 'text-accent3' : 'text-accent4';
  const Arrow = climbing ? TrendingUp : descending ? TrendingDown : Minus;

  return (
    <div className="relative flex w-full items-center gap-5">
      <svg viewBox="0 0 160 110" className="w-full max-w-[200px]" role="img" aria-label="Flight angle">
        <defs>
          <linearGradient id="flight-trail" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(242,101,34,0)" />
            <stop offset="1" stopColor="rgba(242,101,34,0.85)" />
          </linearGradient>
        </defs>
        {/* Horizon */}
        <line
          x1={10}
          y1={70}
          x2={150}
          y2={70}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        {/* Reference cone */}
        <path
          d="M30 70 L90 70 L90 60"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />
        {/* Climb trail */}
        <motion.line
          x1={30}
          y1={70}
          x2={140}
          y2={70}
          stroke="url(#flight-trail)"
          strokeWidth={3}
          strokeLinecap="round"
          style={{
            originX: '30px',
            originY: '70px',
            rotate: useTransform(spring, (v) => `${-v}deg`),
          }}
        />
        {/* Vehicle marker */}
        <motion.g style={{ originX: '30px', originY: '70px', rotate: useTransform(spring, (v) => `${-v}deg`) }}>
          <polygon
            points="138,67 148,70 138,73"
            fill="rgb(242,101,34)"
            stroke="rgba(255,138,75,0.8)"
            strokeWidth={1}
          />
        </motion.g>
        {/* Origin marker */}
        <circle cx={30} cy={70} r={3} fill="rgb(232,232,240)" />
        <circle cx={30} cy={70} r={6} fill="none" stroke="rgba(136,136,160,0.5)" />
      </svg>
      <div className="flex flex-col">
        <div className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] ${stateTone}`}>
          <Arrow size={10} strokeWidth={2.4} />
          {stateLabel}
        </div>
        <div className="font-mono text-2xl font-semibold leading-none text-text">
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)}
          <span className="text-base text-text-dim">°</span>
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-text-faint">
          PITCH · 7D AVG
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VEHICLE HEALTH SEGMENTS — 3-segment proportional bar.
// ---------------------------------------------------------------------------

interface VehicleHealthProps {
  healthy: number;
  warming: number;
  atRisk: number;
}

function VehicleHealth({ healthy, warming, atRisk }: VehicleHealthProps): JSX.Element {
  const total = Math.max(1, healthy + warming + atRisk);
  const hPct = (healthy / total) * 100;
  const wPct = (warming / total) * 100;
  const rPct = (atRisk / total) * 100;
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-text-faint">
            <Layers size={10} strokeWidth={2.4} />
            SUBSYSTEMS · {total} TOTAL
          </div>
          <div className="mt-0.5 font-mono text-2xl font-semibold leading-none text-text">
            {healthy}
            <span className="text-base text-text-dim"> / {total}</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-text-faint">
            NOMINAL CHANNELS
          </div>
        </div>
        <div className="hidden flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-wider md:flex">
          <span className="text-accent">{healthy} OK</span>
          <span className="text-accent4">{warming} DEG</span>
          <span className="text-accent3">{atRisk} FAIL</span>
        </div>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-border-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${hPct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 bg-accent"
          style={{ boxShadow: '0 0 18px rgba(242,101,34,0.55)' }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${wPct}%` }}
          transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
          className="absolute inset-y-0 bg-accent4"
          style={{ left: `${hPct}%`, boxShadow: '0 0 16px rgba(255,213,79,0.4)' }}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${rPct}%` }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="absolute inset-y-0 bg-accent3"
          style={{ left: `${hPct + wPct}%`, boxShadow: '0 0 14px rgba(255,150,112,0.4)' }}
        />
        {/* Tick overlay every 25%. */}
        <div className="pointer-events-none absolute inset-0 flex">
          {[0.25, 0.5, 0.75].map((p) => (
            <div
              key={p}
              className="absolute top-0 h-full w-px bg-border-muted/70"
              style={{ left: `${p * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-faint">
        <span>00%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD PANEL FRAME — shared chrome around each top telemetry tile.
// ---------------------------------------------------------------------------

interface HudPanelProps {
  title: string;
  subtitle: string;
  status: 'NOMINAL' | 'STABLE' | 'WATCH';
  tone: 'healthy' | 'warming' | 'at_risk';
  Icon: typeof Gauge;
  children: React.ReactNode;
  delayMs?: number;
}

function HudPanel({ title, subtitle, status, tone, Icon, children, delayMs = 0 }: HudPanelProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: delayMs / 1000, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface p-5"
      style={{
        background:
          'linear-gradient(180deg, rgba(26,26,38,0.95) 0%, rgba(18,18,26,1) 100%)',
      }}
    >
      {/* Corner accent brackets */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-4 w-4 border-l border-t border-accent/40"
      />
      <span
        aria-hidden
        className="absolute right-0 top-0 h-4 w-4 border-r border-t border-accent/40"
      />
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-4 w-4 border-b border-l border-accent/40"
      />
      <span
        aria-hidden
        className="absolute bottom-0 right-0 h-4 w-4 border-b border-r border-accent/40"
      />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-md ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}>
            <Icon size={16} strokeWidth={1.8} />
          </div>
          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
              {subtitle}
            </div>
            <div className="text-sm font-semibold text-text">{title}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
        >
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {status}
        </span>
      </div>
      <div className="flex items-center justify-center pt-1">{children}</div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TRAJECTORY CHART — historical solid + projected dashed + confidence band.
// ---------------------------------------------------------------------------

interface TrajectoryChartProps {
  history: TrajectoryPoint[];
  future: TrajectoryPoint[];
  risks: RiskEvent[];
}

interface ChartCoord {
  point: TrajectoryPoint;
  cx: number;
  cy: number;
}

interface HoverState {
  x: number;
  y: number;
  point: TrajectoryPoint;
  isFuture: boolean;
}

function TrajectoryChart({ history, future, risks }: TrajectoryChartProps): JSX.Element {
  const padding = { left: 56, right: 24, top: 28, bottom: 36 };
  const viewW = 900;
  const viewH = 360;
  const innerW = viewW - padding.left - padding.right;
  const innerH = viewH - padding.top - padding.bottom;

  const totalDays = PAST_DAYS + 1 + FUTURE_DAYS; // history (-7..0) + future (1..7)
  const stepX = innerW / (totalDays - 1);

  const mapY = (score: number): number => padding.top + innerH * (1 - clamp(score, 0, 100) / 100);
  const mapX = (offset: number): number => padding.left + ((offset + PAST_DAYS) * stepX);

  const historyCoords: ChartCoord[] = history.map((p) => ({
    point: p,
    cx: mapX(p.offset),
    cy: mapY(p.score),
  }));
  const futureCoords: ChartCoord[] = future.map((p) => ({
    point: p,
    cx: mapX(p.offset),
    cy: mapY(p.score),
  }));

  const historyD = historyCoords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.cx.toFixed(2)} ${c.cy.toFixed(2)}`)
    .join(' ');

  // Future line connects from the last history point.
  const lastHist = historyCoords[historyCoords.length - 1];
  const futureD = lastHist
    ? `M ${lastHist.cx.toFixed(2)} ${lastHist.cy.toFixed(2)} ` +
      futureCoords.map((c) => `L ${c.cx.toFixed(2)} ${c.cy.toFixed(2)}`).join(' ')
    : '';

  // Confidence band — upper polyline then lower polyline reversed.
  const bandUpper = futureCoords.map((c) => ({
    cx: c.cx,
    cy: mapY(c.point.upper ?? c.point.score),
  }));
  const bandLower = futureCoords.map((c) => ({
    cx: c.cx,
    cy: mapY(c.point.lower ?? c.point.score),
  }));
  const bandD = lastHist
    ? [
        `M ${lastHist.cx.toFixed(2)} ${lastHist.cy.toFixed(2)}`,
        ...bandUpper.map((p) => `L ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`),
        ...[...bandLower].reverse().map((p) => `L ${p.cx.toFixed(2)} ${p.cy.toFixed(2)}`),
        `L ${lastHist.cx.toFixed(2)} ${lastHist.cy.toFixed(2)}`,
        'Z',
      ].join(' ')
    : '';

  const allCoords = [...historyCoords, ...futureCoords];

  // Hover handling.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    const svgX = ratioX * viewW;
    const svgY = ratioY * viewH;
    // Find the nearest data point by x.
    let nearest: ChartCoord | null = null;
    let bestDist = Infinity;
    for (const c of allCoords) {
      const d = Math.abs(c.cx - svgX);
      if (d < bestDist) {
        bestDist = d;
        nearest = c;
      }
    }
    if (nearest) {
      const isFuture = nearest.point.offset > 0;
      setHover({ x: nearest.cx, y: nearest.cy, point: nearest.point, isFuture });
    }
    void svgY;
  };
  const handleMouseLeave = (): void => setHover(null);

  // Tooltip in screen units uses the same SVG → percent conversion.
  const tooltipLeft = hover ? (hover.x / viewW) * 100 : 0;
  const tooltipTop = hover ? (hover.y / viewH) * 100 : 0;
  const tooltipTransform = hover
    ? hover.x > viewW * 0.7
      ? 'translate(-110%, -120%)'
      : 'translate(8%, -120%)'
    : '';

  // Grid lines.
  const yGrid = [0, 20, 40, 60, 80, 100];

  // Pin the next critical risk for the "DECISION POINT" callout.
  const nextRisk = risks.find((r) => r.severity === 'critical') ?? risks[0] ?? null;
  const riskCoord = nextRisk
    ? futureCoords.find((c) => c.point.offset === nextRisk.offset) ?? null
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface"
      style={{
        background:
          'radial-gradient(circle at 80% 0%, rgba(242,101,34,0.08), transparent 50%), linear-gradient(180deg, rgba(26,26,38,0.96), rgba(18,18,26,1) 80%)',
      }}
    >
      {/* Header chrome */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/15">
            <Activity size={16} className="text-accent" strokeWidth={1.9} />
          </div>
          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
              TRAJECTORY · 7D RETROGRADE → 7D PROGRADE
            </div>
            <div className="text-sm font-semibold text-text">
              Reputation flight profile
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-accent" />
            HIST
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, rgb(255,213,79) 0, rgb(255,213,79) 3px, transparent 3px, transparent 6px)',
              }}
            />
            PROJ
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rotate-45 bg-accent3" />
            RISK
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Crosshair size={11} strokeWidth={2} className="text-text-dim" />
            CROSSHAIR
          </span>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="block w-full"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
          role="img"
          aria-label="Reputation trajectory chart"
        >
          <defs>
            <linearGradient id="conf-band" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgba(255,138,75,0.3)" />
              <stop offset="1" stopColor="rgba(242,101,34,0.05)" />
            </linearGradient>
            <linearGradient id="hist-stroke" x1="0" x2="1">
              <stop offset="0" stopColor="rgba(255,138,75,0.65)" />
              <stop offset="1" stopColor="rgba(242,101,34,1)" />
            </linearGradient>
            <linearGradient id="hist-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgba(242,101,34,0.22)" />
              <stop offset="1" stopColor="rgba(242,101,34,0)" />
            </linearGradient>
          </defs>

          {/* Horizontal grid + axis labels */}
          {yGrid.map((y) => {
            const cy = mapY(y);
            const major = y === 80 || y === 60;
            return (
              <g key={`g-${y}`}>
                <line x1={padding.left} x2={viewW - padding.right} y1={cy} y2={cy}
                  stroke={major ? 'rgba(255,213,79,0.18)' : 'rgba(136,136,160,0.12)'}
                  strokeWidth={major ? 1 : 0.6}
                  strokeDasharray={major ? undefined : '3 6'} />
                <text x={padding.left - 8} y={cy + 4} fontFamily="JetBrains Mono, monospace"
                  fontSize="10" fill="rgba(136,136,160,0.65)" textAnchor="end">{y}</text>
              </g>
            );
          })}

          {/* Vertical grid lines per day */}
          {allCoords.map((c, i) => (
            <line key={`vg-${i}`} x1={c.cx} x2={c.cx} y1={padding.top} y2={viewH - padding.bottom}
              stroke="rgba(136,136,160,0.08)" strokeWidth={0.6} strokeDasharray="2 6" />
          ))}

          {/* "NOW" vertical line + label */}
          {lastHist ? (
            <g>
              <line x1={lastHist.cx} x2={lastHist.cx} y1={padding.top} y2={viewH - padding.bottom}
                stroke="rgba(242,101,34,0.55)" strokeWidth={1.4} />
              <rect x={lastHist.cx - 16} y={padding.top - 18} width={32} height={16} rx={3}
                fill="rgba(242,101,34,0.18)" stroke="rgba(242,101,34,0.6)" strokeWidth={1} />
              <text x={lastHist.cx} y={padding.top - 6} fontFamily="JetBrains Mono, monospace"
                fontSize="9" fontWeight={600} fill="rgb(242,101,34)" textAnchor="middle">NOW</text>
            </g>
          ) : null}

          {/* X axis labels */}
          {allCoords.map((c, i) => (
            <text key={`xl-${i}`} x={c.cx} y={viewH - padding.bottom + 16}
              fontFamily="JetBrains Mono, monospace" fontSize="9"
              fill={c.point.offset === 0 ? 'rgb(242,101,34)' : 'rgba(136,136,160,0.75)'}
              textAnchor="middle">{c.point.label}</text>
          ))}

          {/* Confidence band on future */}
          {bandD ? <path d={bandD} fill="url(#conf-band)" stroke="none" /> : null}

          {/* Historical area fill */}
          {historyD ? (
            <path
              d={`${historyD} L ${historyCoords[historyCoords.length - 1]?.cx ?? 0} ${viewH - padding.bottom} L ${historyCoords[0]?.cx ?? 0} ${viewH - padding.bottom} Z`}
              fill="url(#hist-fill)" stroke="none"
            />
          ) : null}

          {/* Historical line — pathLength 0 → 1 over 1.6s */}
          {historyD ? (
            <motion.path d={historyD} fill="none" stroke="url(#hist-stroke)"
              strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0.2 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.6, ease: 'easeOut' }} />
          ) : null}

          {/* Future projected line (dashed) */}
          {futureD ? (
            <motion.path d={futureD} fill="none" stroke="rgb(255,213,79)"
              strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ duration: 1.6, delay: 0.6, ease: 'easeOut' }} />
          ) : null}

          {/* History data points */}
          {historyCoords.map((c, i) => (
            <motion.circle key={`hp-${i}`} cx={c.cx} cy={c.cy} r={3}
              fill="rgb(242,101,34)" stroke="rgba(255,255,255,0.15)" strokeWidth={1}
              initial={{ opacity: 0, r: 0 }} animate={{ opacity: 1, r: 3 }}
              transition={{ duration: 0.3, delay: 0.05 * i + 0.4, ease: 'easeOut' }} />
          ))}

          {/* Future data points */}
          {futureCoords.map((c, i) => (
            <motion.circle key={`fp-${i}`} cx={c.cx} cy={c.cy} r={3}
              fill="rgba(18,18,26,1)" stroke="rgb(255,213,79)" strokeWidth={1.8}
              initial={{ opacity: 0, r: 0 }} animate={{ opacity: 1, r: 3 }}
              transition={{ duration: 0.3, delay: 0.05 * i + 1.0, ease: 'easeOut' }} />
          ))}

          {/* Risk diamonds */}
          {risks.map((r, i) => {
            const c = futureCoords.find((fc) => fc.point.offset === r.offset);
            if (!c) return null;
            const isCrit = r.severity === 'critical';
            return (
              <motion.g
                key={`risk-${i}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.32, delay: 1.4 + i * 0.12, ease: 'easeOut' }}
              >
                <polygon
                  points={`${c.cx},${c.cy - 8} ${c.cx + 8},${c.cy} ${c.cx},${c.cy + 8} ${c.cx - 8},${c.cy}`}
                  fill={isCrit ? 'rgb(255,150,112)' : 'rgb(255,213,79)'}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1.2}
                />
                {isCrit ? (
                  <motion.polygon
                    points={`${c.cx},${c.cy - 14} ${c.cx + 14},${c.cy} ${c.cx},${c.cy + 14} ${c.cx - 14},${c.cy}`}
                    fill="none"
                    stroke="rgb(255,150,112)"
                    strokeWidth={1}
                    animate={{ opacity: [0.7, 0, 0.7] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : null}
              </motion.g>
            );
          })}

          {/* DECISION POINT callout */}
          {riskCoord && nextRisk ? (
            <motion.g initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 1.8 }}>
              <line x1={riskCoord.cx + 18} y1={riskCoord.cy - 8}
                x2={riskCoord.cx + 90} y2={riskCoord.cy - 56}
                stroke="rgba(255,150,112,0.7)" strokeWidth={1.2} strokeDasharray="3 3" />
              <rect x={riskCoord.cx + 86} y={riskCoord.cy - 86} width={186} height={42}
                rx={6} fill="rgba(20,20,30,0.92)" stroke="rgba(255,150,112,0.6)" strokeWidth={1} />
              <text x={riskCoord.cx + 96} y={riskCoord.cy - 68}
                fontFamily="JetBrains Mono, monospace" fontSize="10" fontWeight={700}
                fill="rgb(255,150,112)">DECISION POINT · T-04h</text>
              <text x={riskCoord.cx + 96} y={riskCoord.cy - 54}
                fontFamily="Outfit, system-ui, sans-serif" fontSize="10"
                fill="rgba(232,232,240,0.85)">
                {nextRisk.label} · {nextRisk.domain.slice(0, 22)}
              </text>
            </motion.g>
          ) : null}

          {/* Crosshair on hover */}
          {hover ? (
            <g>
              <line x1={hover.x} x2={hover.x} y1={padding.top} y2={viewH - padding.bottom}
                stroke="rgba(255,213,79,0.55)" strokeWidth={1} strokeDasharray="3 4" />
              <line x1={padding.left} x2={viewW - padding.right} y1={hover.y} y2={hover.y}
                stroke="rgba(255,213,79,0.4)" strokeWidth={1} strokeDasharray="3 4" />
              <circle cx={hover.x} cy={hover.y} r={6}
                fill="rgba(242,101,34,0.18)" stroke="rgb(242,101,34)" strokeWidth={1.5} />
            </g>
          ) : null}
        </svg>

        {/* HTML tooltip */}
        {hover ? (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border-muted bg-surface px-3 py-2 text-[11px] shadow-xl"
            style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%`, transform: tooltipTransform }}
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {hover.isFuture ? 'PROJECTED' : 'OBSERVED'} · {hover.point.label}
            </div>
            <div className="font-mono text-base font-semibold text-text">
              {hover.point.score}<span className="text-xs text-text-dim"> / 100</span>
            </div>
            {hover.isFuture && hover.point.lower != null && hover.point.upper != null ? (
              <div className="font-mono text-[10px] text-text-dim">
                ±{Math.round((hover.point.upper - hover.point.lower) / 2)} CI
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Bottom telemetry strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-border-muted bg-border-muted/70 md:grid-cols-4">
        <TrajectoryStat label="MIN · OBS" value={Math.min(...history.map((h) => h.score)).toString()} hint="Past 7 days" />
        <TrajectoryStat label="MAX · OBS" value={Math.max(...history.map((h) => h.score)).toString()} hint="Past 7 days" />
        <TrajectoryStat label="PROJ · 7D" value={future[future.length - 1]?.score.toString() ?? '—'} hint="End-of-week target" />
        <TrajectoryStat label="RISK EVENTS" value={risks.length.toString()}
          hint={risks.length > 0 ? `Next ${risks[0]?.label ?? ''}` : 'None pinned'}
          tone={risks.some((r) => r.severity === 'critical') ? 'critical' : risks.length > 0 ? 'warn' : 'ok'} />
      </div>
    </motion.div>
  );
}

interface TrajectoryStatProps {
  label: string;
  value: string;
  hint: string;
  tone?: 'critical' | 'warn' | 'ok';
}

function TrajectoryStat({ label, value, hint, tone = 'ok' }: TrajectoryStatProps): JSX.Element {
  const valueClass =
    tone === 'critical'
      ? 'text-accent3'
      : tone === 'warn'
        ? 'text-accent4'
        : 'text-text';
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-faint">{label}</div>
      <div className={`font-mono text-lg font-semibold leading-none ${valueClass}`}>
        {value}
      </div>
      <div className="text-[10px] text-text-faint">{hint}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VEHICLE STATUS LIST — column 1 of the telemetry feed.
// ---------------------------------------------------------------------------

interface VehicleStatusListProps {
  domains: AgencyReputationData['domains'];
}

function VehicleStatusList({ domains }: VehicleStatusListProps): JSX.Element {
  return (
    <div
      className="flex h-full flex-col rounded-2xl border border-border-muted bg-surface"
      style={{
        background:
          'linear-gradient(180deg, rgba(26,26,38,0.95), rgba(18,18,26,1) 80%)',
      }}
    >
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 text-accent">
            <Cpu size={14} strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
              VEHICLE STATUS
            </div>
            <div className="text-sm font-semibold text-text">Subsystem channels</div>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
          {domains.length} CH
        </span>
      </div>
      <div className="flex-1 divide-y divide-border-muted/60">
        {domains.map((d, i) => (
          <VehicleStatusRow key={d.id} d={d} index={i} />
        ))}
      </div>
    </div>
  );
}

interface VehicleStatusRowProps {
  d: AgencyReputationData['domains'][number];
  index: number;
}

function VehicleStatusRow({ d, index }: VehicleStatusRowProps): JSX.Element {
  const tone = d.status;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.04 * index + 0.2, ease: 'easeOut' }}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60"
    >
      {/* Status pip */}
      <div className="flex w-16 flex-col items-start">
        <span className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}>
          {tone === 'healthy' ? (
            <CircleDot size={9} strokeWidth={2.4} />
          ) : tone === 'warming' ? (
            <Triangle size={9} strokeWidth={2.4} />
          ) : (
            <AlertOctagon size={9} strokeWidth={2.4} />
          )}
          {STATUS_CODE[tone]}
        </span>
        <span className="mt-1 font-mono text-[10px] text-text-faint">
          CH-{(index + 1).toString().padStart(2, '0')}
        </span>
      </div>
      {/* Domain */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 truncate">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          <span className="truncate text-[12px] font-medium text-text">{d.subClientName}</span>
        </div>
        <span className="truncate font-mono text-[10px] text-text-dim">{d.domain}</span>
      </div>
      {/* Inbox rate bar */}
      <div className="w-28 shrink-0">
        <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-text-faint">
          <span>INBOX</span>
          <span className={TONE_TEXT[tone]}>{fmtPct(d.inboxRatePct, 1)}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-border-muted/70">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${clamp(d.inboxRatePct, 0, 100)}%` }}
            transition={{ duration: 0.6, delay: 0.04 * index + 0.4, ease: 'easeOut' }}
            className={`h-full ${TONE_DOT[tone]}`}
          />
        </div>
      </div>
      {/* Rep score badge */}
      <div className="w-10 shrink-0 text-right">
        <div className={`font-mono text-sm font-semibold ${TONE_TEXT[tone]}`}>
          {d.reputationScore}
        </div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-text-faint">REP</div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ANOMALY LOG — column 2 of the telemetry feed.
// ---------------------------------------------------------------------------

interface AnomalyLogProps {
  alerts: AgencyReputationData['recentAlerts'];
}

function AnomalyLog({ alerts }: AnomalyLogProps): JSX.Element {
  return (
    <div
      className="flex h-full flex-col rounded-2xl border border-border-muted bg-surface"
      style={{
        background:
          'linear-gradient(180deg, rgba(26,26,38,0.95), rgba(18,18,26,1) 80%)',
      }}
    >
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent3/15 text-accent3">
            <AlertTriangle size={14} strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
              ANOMALY LOG
            </div>
            <div className="text-sm font-semibold text-text">Incident traffic</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-accent3">
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent3"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          LIVE
        </span>
      </div>
      <div className="flex-1 overflow-hidden p-3">
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          {alerts.map((a, i) => (
            <AnomalyLogRow key={a.id} alert={a} index={i} />
          ))}
          {alerts.length === 0 ? (
            <div className="rounded-md border border-border-muted bg-surface-2 px-3 py-4 text-center text-text-faint">
              NO ANOMALIES IN BUFFER
            </div>
          ) : (
            <AnomalyLogTrailer />
          )}
        </div>
      </div>
    </div>
  );
}

interface AnomalyLogRowProps {
  alert: AgencyReputationData['recentAlerts'][number];
  index: number;
}

function AnomalyLogRow({ alert, index }: AnomalyLogRowProps): JSX.Element {
  const isCrit = alert.severity === 'critical';
  const tone = isCrit ? 'text-accent3' : 'text-accent4';
  const bg = isCrit ? 'bg-accent3/10' : 'bg-accent4/10';
  const bd = isCrit ? 'border-accent3/40' : 'border-accent4/35';
  const Icon = ALERT_ICON[alert.kind];

  // Generate a fake "T+HH:MM:SS" timestamp using the index so logs feel real.
  const stampHours = (index * 3 + 6).toString().padStart(2, '0');
  const stampMins = ((index * 17 + 4) % 60).toString().padStart(2, '0');
  const stampSecs = ((index * 41 + 22) % 60).toString().padStart(2, '0');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.08 * index + 0.3, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-md border ${bd} ${bg} px-2.5 py-2`}
      style={
        isCrit
          ? { boxShadow: '0 0 12px rgba(255,150,112,0.16), inset 0 0 0 1px rgba(255,150,112,0.18)' }
          : undefined
      }
    >
      {isCrit ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -left-2 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-accent3"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg} ${tone}`}>
          <Icon size={11} strokeWidth={2.2} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className={`font-bold ${tone}`}>{ALERT_LABEL[alert.kind]}</span>
            <span className="text-[10px] uppercase tracking-wider text-text-faint">
              [{ALERT_SHORT[alert.kind]}]
            </span>
            <span className="text-text-dim">·</span>
            <span className="truncate text-text-dim">{alert.domain}</span>
          </div>
          <div className="line-clamp-2 text-[10.5px] leading-snug text-text-dim">
            {alert.message}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-faint">
            <span>T+{stampHours}:{stampMins}:{stampSecs}</span>
            <span>·</span>
            <span>{alert.ago}</span>
            <span>·</span>
            <span className={`uppercase tracking-wider ${tone}`}>
              SEV {isCrit ? '01' : '02'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function AnomalyLogTrailer(): JSX.Element {
  // A muted scrollback marker line at the bottom of the log; gives the
  // "console buffer" feel.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.9 }}
      className="mt-1 flex items-center gap-2 px-1 text-[10px] text-text-faint"
    >
      <span className="inline-block h-px flex-1 bg-border-muted" />
      <span className="font-mono uppercase tracking-wider">END BUFFER</span>
      <span className="inline-block h-px flex-1 bg-border-muted" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CREW ADVISORY — column 3 of the telemetry feed.
// ---------------------------------------------------------------------------

interface CrewAdvisoryListProps {
  advisories: CrewAdvisory[];
}

function CrewAdvisoryList({ advisories }: CrewAdvisoryListProps): JSX.Element {
  return (
    <div
      className="flex h-full flex-col rounded-2xl border border-border-muted bg-surface"
      style={{
        background:
          'linear-gradient(180deg, rgba(26,26,38,0.95), rgba(18,18,26,1) 80%)',
      }}
    >
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent4/15 text-accent4">
            <Sparkles size={14} strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
              CREW ADVISORY
            </div>
            <div className="text-sm font-semibold text-text">Flight director queue</div>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
          TOP {advisories.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-3">
        {advisories.map((a, i) => (
          <CrewAdvisoryCard key={a.id} advisory={a} index={i} />
        ))}
        {advisories.length === 0 ? (
          <div className="rounded-md border border-border-muted bg-surface-2 px-3 py-4 text-center font-mono text-[11px] uppercase tracking-wider text-text-faint">
            QUEUE EMPTY · STAND BY
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface CrewAdvisoryCardProps {
  advisory: CrewAdvisory;
  index: number;
}

function CrewAdvisoryCard({ advisory, index }: CrewAdvisoryCardProps): JSX.Element {
  const isCrit = advisory.severity === 'critical';
  const tone = isCrit ? 'accent3' : 'accent4';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 * index + 0.35, ease: 'easeOut' }}
      className={`group relative overflow-hidden rounded-xl border ${
        isCrit ? 'border-accent3/40 bg-accent3/8' : 'border-accent4/30 bg-accent4/8'
      } px-3 py-2.5`}
      style={
        isCrit
          ? { boxShadow: 'inset 0 0 0 1px rgba(255,150,112,0.18)' }
          : undefined
      }
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isCrit ? 'bg-accent3/20 text-accent3' : 'bg-accent4/20 text-accent4'
          }`}
        >
          <advisory.Icon size={16} strokeWidth={1.9} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] font-semibold text-text">{advisory.title}</span>
            <span
              className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${
                isCrit ? 'text-accent3' : 'text-accent4'
              }`}
            >
              PRIO {pad2(index + 1)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-text-dim">{advisory.body}</p>
          <div className="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
            <ChevronRight size={11} strokeWidth={2.2} />
            <span>READ-OUT · ACK REQUIRED</span>
          </div>
        </div>
      </div>
      <span
        aria-hidden
        className={`pointer-events-none absolute -right-2 -top-2 h-12 w-12 rounded-full ${
          isCrit ? 'bg-accent3/10' : 'bg-accent4/10'
        }`}
      />
      {/* gradient-only accent — `tone` controls the bg/border via boolean above */}
      <span aria-hidden className="hidden" data-tone={tone} />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MISSION ABORT/PROCEED BAND — bottom signal strip.
// ---------------------------------------------------------------------------

interface MissionBandProps {
  overall: number;
  atRisk: number;
  totalSends24h: number;
  bouncePct: number;
  spamPct: number;
}

function MissionBand({ overall, atRisk, totalSends24h, bouncePct, spamPct }: MissionBandProps): JSX.Element {
  const proceedActive = overall >= 70;
  const abortActive = atRisk > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
      className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_2fr_1fr]"
    >
      <MissionButton
        kind="proceed"
        active={proceedActive}
        title="MISSION PROCEED"
        legend="OVERALL ≥ 70 · TRAJECTORY NOMINAL"
      />
      <MissionTelemetryStrip
        totalSends24h={totalSends24h}
        bouncePct={bouncePct}
        spamPct={spamPct}
        overall={overall}
      />
      <MissionButton
        kind="abort"
        active={abortActive}
        title="ABORT — INVESTIGATE"
        legend={abortActive ? `${atRisk} CHANNEL(S) IN FAILURE` : 'NO FAILURE CHANNELS'}
      />
    </motion.div>
  );
}

interface MissionButtonProps {
  kind: 'proceed' | 'abort';
  active: boolean;
  title: string;
  legend: string;
}

function MissionButton({ kind, active, title, legend }: MissionButtonProps): JSX.Element {
  const isProceed = kind === 'proceed';
  const bg = active ? (isProceed ? 'bg-accent/15 border-accent/55' : 'bg-accent3/15 border-accent3/55') : 'bg-surface-2 border-border-muted';
  const text = active ? (isProceed ? 'text-accent' : 'text-accent3') : 'text-text-faint';
  const dotColor = active ? (isProceed ? 'bg-accent' : 'bg-accent3') : 'bg-text-faint';
  const cornerBd = active ? (isProceed ? 'border-accent/70' : 'border-accent3/70') : 'border-border-muted';
  const glowRgba = isProceed ? '242,101,34' : '255,150,112';
  return (
    <div
      aria-disabled
      className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border-2 ${bg} px-5 py-4`}
      style={active ? { boxShadow: `0 0 28px rgba(${glowRgba},0.28), inset 0 0 0 1px rgba(${glowRgba},0.25)` } : undefined}
    >
      <span aria-hidden className={`absolute left-2 top-2 h-3 w-3 border-l-2 border-t-2 ${cornerBd}`} />
      <span aria-hidden className={`absolute right-2 top-2 h-3 w-3 border-r-2 border-t-2 ${cornerBd}`} />
      <span aria-hidden className={`absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 ${cornerBd}`} />
      <span aria-hidden className={`absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 ${cornerBd}`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${active ? (isProceed ? 'bg-accent/25' : 'bg-accent3/25') : 'bg-surface'} ${text}`}>
          {isProceed ? <Rocket size={22} strokeWidth={2} /> : <AlertOctagon size={22} strokeWidth={2} />}
        </div>
        <div className="flex flex-col">
          <div className={`font-mono text-lg font-bold tracking-[0.05em] ${text}`}>{title}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-faint">{legend}</div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <motion.span
          className={`inline-block h-3 w-3 rounded-full ${dotColor}`}
          animate={active ? { scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: 0.4 }}
          transition={{ duration: 1.8, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
          style={active ? { boxShadow: `0 0 12px rgba(${glowRgba},0.7)` } : undefined}
        />
        <span className={`font-mono text-[10px] uppercase tracking-wider ${text}`}>
          {active ? 'ARMED' : 'IDLE'}
        </span>
      </div>
    </div>
  );
}

interface MissionTelemetryStripProps {
  totalSends24h: number;
  bouncePct: number;
  spamPct: number;
  overall: number;
}

function MissionTelemetryStrip({ totalSends24h, bouncePct, spamPct, overall }: MissionTelemetryStripProps): JSX.Element {
  const bounceTone = bouncePct > 3 ? 'critical' : bouncePct > 1.5 ? 'warn' : 'ok';
  const spamTone = spamPct > 0.5 ? 'critical' : spamPct > 0.2 ? 'warn' : 'ok';
  return (
    <div
      className="relative grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border-muted bg-border-muted/70 md:grid-cols-4"
      style={{ background: 'linear-gradient(90deg, rgba(26,26,38,0.95), rgba(20,20,30,1))' }}
    >
      <MissionTelemetryCell Icon={Mail} label="SENDS 24H" value={fmtInt(totalSends24h)} />
      <MissionTelemetryCell Icon={ArrowDownRight} label="BOUNCE %" value={fmtPct(bouncePct, 2)} tone={bounceTone} />
      <MissionTelemetryCell Icon={ShieldAlert} label="SPAM %" value={fmtPct(spamPct, 2)} tone={spamTone} />
      <MissionTelemetryCell Icon={Navigation} label="HEADING" value={`${overall.toString().padStart(2, '0')}°N`} />
    </div>
  );
}

interface MissionTelemetryCellProps {
  Icon: typeof Mail;
  label: string;
  value: string;
  tone?: 'critical' | 'warn' | 'ok';
}

function MissionTelemetryCell({ Icon, label, value, tone = 'ok' }: MissionTelemetryCellProps): JSX.Element {
  const valueClass =
    tone === 'critical' ? 'text-accent3' : tone === 'warn' ? 'text-accent4' : 'text-text';
  return (
    <div className="flex items-center gap-3 bg-surface px-4 py-3.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim">
        <Icon size={15} strokeWidth={1.8} />
      </div>
      <div className="flex flex-col">
        <div className="text-[10px] uppercase tracking-[0.18em] text-text-faint">{label}</div>
        <div className={`font-mono text-lg font-semibold leading-none ${valueClass}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROVIDER STRIP — small ticker strip between trajectory and telemetry feed.
// ---------------------------------------------------------------------------

interface ProviderStripProps {
  providers: AgencyReputationData['providers'];
}

const PROVIDER_NAME: Record<string, string> = {
  gmail: 'GMAIL · PAYLOAD A',
  outlook: 'OUTLOOK · PAYLOAD B',
  yahoo: 'YAHOO · PAYLOAD C',
};

function ProviderStrip({ providers }: ProviderStripProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 }}
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      {providers.map((p, i) => (
        <ProviderCellMC key={p.id} provider={p} index={i} />
      ))}
    </motion.div>
  );
}

interface ProviderCellMCProps {
  provider: AgencyReputationData['providers'][number];
  index: number;
}

function ProviderCellMC({ provider, index }: ProviderCellMCProps): JSX.Element {
  const tone: DomainStatus =
    provider.inboxPct >= 92 ? 'healthy' : provider.inboxPct >= 85 ? 'warming' : 'at_risk';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: 0.05 * index + 0.12, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface px-4 py-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(26,26,38,0.95), rgba(18,18,26,1) 80%)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim">
            <Satellite size={15} strokeWidth={1.9} />
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
              {PROVIDER_NAME[provider.id] ?? provider.label.toUpperCase()}
            </div>
            <div className="text-sm font-semibold text-text">{provider.label}</div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
          {STATUS_CODE[tone]}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <ProviderCellStat label="INBOX" value={fmtPct(provider.inboxPct)} tone="ok" />
        <ProviderCellStat label="SPAM" value={fmtPct(provider.spamPct)} tone="warn" />
        <ProviderCellStat label="BLK" value={fmtPct(provider.blockedPct)} tone="critical" />
        <ProviderCellStat label="24H" value={fmtInt(provider.last24hSends)} tone="ok" mono />
      </div>
    </motion.div>
  );
}

interface ProviderCellStatProps {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'critical';
  mono?: boolean;
}

function ProviderCellStat({ label, value, tone, mono = false }: ProviderCellStatProps): JSX.Element {
  const valueClass =
    tone === 'critical' ? 'text-accent3' : tone === 'warn' ? 'text-accent4' : 'text-accent';
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-text-faint">{label}</div>
      <div className={`mt-0.5 font-mono text-xs font-semibold ${mono ? 'text-text' : valueClass}`}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROOT COMPONENT
// ---------------------------------------------------------------------------

export function AgRepF2MissionControl({
  data,
}: { data?: AgencyReputationData } = {}): JSX.Element {
  const d = data ?? MOCK;

  const { met, tminus } = useMissionClocks();

  const { history, future } = useMemo(
    () => buildTrajectory(d.domains, d.summary.overallScore, d.summary.trend7dDelta),
    [d.domains, d.summary.overallScore, d.summary.trend7dDelta]
  );

  const risks = useMemo(() => buildRiskEvents(d), [d]);
  const advisories = useMemo(() => buildCrewAdvisories(d), [d]);

  const projected7d = future[future.length - 1]?.score ?? d.summary.overallScore;

  // Overall band determines proceed/abort state for the mission band.
  const overallBand = scoreBand(d.summary.overallScore);
  const trendBand: DomainStatus =
    d.summary.trend7dDelta >= 1 ? 'healthy' : d.summary.trend7dDelta <= -1 ? 'at_risk' : 'warming';
  const fleetBand: DomainStatus =
    d.summary.domainsAtRisk > 0
      ? 'at_risk'
      : d.summary.domainsWarming > 0
        ? 'warming'
        : 'healthy';

  return (
    <div
      className="min-h-screen w-full bg-bg px-4 pb-12 pt-6 text-text md:px-6"
      style={{
        background:
          'radial-gradient(circle at 0% 0%, rgba(242,101,34,0.05), transparent 35%), radial-gradient(circle at 100% 100%, rgba(255,150,112,0.04), transparent 30%), #0a0a0f',
      }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5">
        {/* 1. MISSION HEADER */}
        <MissionHeader
          agencyName={d.agency.name}
          region={d.agency.region}
          met={met}
          tminus={tminus}
        />

        {/* 2. FLIGHT HUD — three top tiles */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <HudPanel
            title="Trajectory nominal"
            subtitle="ALTITUDE INDICATOR"
            status={overallBand === 'healthy' ? 'NOMINAL' : overallBand === 'warming' ? 'WATCH' : 'WATCH'}
            tone={overallBand === 'inactive' ? 'warming' : overallBand}
            Icon={Gauge}
            delayMs={50}
          >
            <AltitudeGauge value={d.summary.overallScore} projected={projected7d} />
          </HudPanel>
          <HudPanel
            title="Telemetry stable"
            subtitle="FLIGHT ANGLE"
            status={
              trendBand === 'healthy' ? 'STABLE' : trendBand === 'warming' ? 'WATCH' : 'WATCH'
            }
            tone={trendBand}
            Icon={Compass}
            delayMs={120}
          >
            <FlightAngle delta={d.summary.trend7dDelta} />
          </HudPanel>
          <HudPanel
            title="Vehicle health"
            subtitle="SUBSYSTEM CENSUS"
            status={fleetBand === 'healthy' ? 'NOMINAL' : 'WATCH'}
            tone={fleetBand}
            Icon={Layers}
            delayMs={200}
          >
            <VehicleHealth
              healthy={d.summary.domainsHealthy}
              warming={d.summary.domainsWarming}
              atRisk={d.summary.domainsAtRisk}
            />
          </HudPanel>
        </div>

        {/* 3. TRAJECTORY CHART */}
        <TrajectoryChart history={history} future={future} risks={risks} />

        {/* PROVIDER STRIP between chart and telemetry feed */}
        <ProviderStrip providers={d.providers} />

        {/* 4. TELEMETRY FEED — three columns */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <VehicleStatusList domains={d.domains} />
          <AnomalyLog alerts={d.recentAlerts} />
          <CrewAdvisoryList advisories={advisories} />
        </div>

        {/* 5. MISSION BAND */}
        <MissionBand
          overall={d.summary.overallScore}
          atRisk={d.summary.domainsAtRisk}
          totalSends24h={d.summary.totalSends24h}
          bouncePct={d.summary.bouncePct24h}
          spamPct={d.summary.spamComplaintPct24h}
        />

        {/* Footer slug — mission identifier */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
            <Radar size={11} strokeWidth={2.2} className="text-accent" />
            MISSION ID · NW-{d.agency.region.toUpperCase()}-2026
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-text-faint">
            <span className="inline-flex items-center gap-1">
              <Flag size={11} strokeWidth={2} className="text-accent3" />
              CONSOLE: FLIGHT DIRECTOR
            </span>
            <span className="inline-flex items-center gap-1">
              <Activity size={11} strokeWidth={2} className="text-accent" />
              REFRESH: 1.000 HZ
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight size={11} strokeWidth={2} className="text-accent4" />
              SOURCE: warmup_logs · daily_metrics · peer_actions
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgRepF2MissionControl;
