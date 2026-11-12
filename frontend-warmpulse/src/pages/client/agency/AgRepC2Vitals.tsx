import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronRight,
  Clock,
  Globe,
  HeartPulse,
  Inbox,
  MailWarning,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Stethoscope,
  Waves,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgRepC2Vitals — Agency-tier REPUTATION surface, "Hospital Vitals Monitor"
 * candidate C2 of four.
 *
 * The agency owner manages a fleet of sub-clients, each with its own sending
 * domain(s). Reputation across the portfolio is the patient's vital signs —
 * if any one domain's inbox placement dips, that's a flatline alarm. The
 * canvas is laid out exactly like a hospital ECG/EKG bedside monitor:
 *
 *   - HEADER bar: agency name + region + a "PATIENT" identifier and a
 *     digital LCD-style overall reputation gauge reading.
 *   - MAIN CANVAS (lg:col-span-8): four vertically stacked TRACE LANES —
 *     Gmail (accent green), Outlook (accent2 cyan), Yahoo (accent4 yellow),
 *     and an aggregate (text-text). Each lane carries a continuously
 *     left-scrolling polyline whose right edge is a pulsing beat dot. To
 *     the right of every lane is a digital readout (current value + "BPM"
 *     equivalent — inbox placement % over a synthetic interval).
 *   - INSPECTOR PANEL (lg:col-span-4): the selected domain's deep card —
 *     domain, sub-client, status, DNS triad chips, last incident, recent
 *     alerts. Selecting another domain in the lane swaps inspector content.
 *   - VITALS STRIP (below): four large LCD-style readouts (Overall /
 *     Bounce % / Spam % / Sends today), each with a mini-sparkline and a
 *     flick animation when the digit updates.
 *
 * DISTINCT ANIMATION:
 *
 *   • Live left-scrolling traces — each trace's polyline `points` recomputes
 *     ~30fps via a rAF loop that shifts the phase, sliding the wave left.
 *     New synthetic data point lands at the right edge every sweep tick.
 *   • Beat pulse — the right-end dot scales 1 → 1.3 → 1 on a 1.5s loop,
 *     matched by an alarm bracket flash near the digital readout.
 *   • Alert flash — when a trace dips below threshold (inbox < 70%), the
 *     lane background flashes accent3 and an "!" icon appears.
 *   • Digital readouts — numeric values change with a typewriter / digit
 *     stagger (80ms per digit) when the underlying value moves.
 *   • VITALS strip — numbers FLICK (translateY spring) when they tick over.
 *
 * Aesthetic: clinical hospital monitor — green/cyan/yellow traces on dark,
 * LCD-numeric tabular numerals, a faint scanline overlay on the canvas,
 * a steady beep rhythm conveyed by the pulse dots. The traces are SVG
 * polylines hand-rolled (no chart library) so we can drive every pixel of
 * the scroll animation.
 *
 * STANDALONE for the preview harness: no imports from `@/features/*`, no
 * router, no query hooks, no required props. Prop-less mount falls back to
 * the inline MOCK; a parent that wants to drop in real data can pass
 * `data={...}` shaped as `AgencyReputationData`.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all 4 Agency reputation variants.
// Keep VERBATIM if any field shape changes — the four candidates must stay
// drop-in interchangeable.
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
// MOCK content — Northwind Agency / us-east-1.
// 8 domains; 5 healthy / 2 warming / 1 at-risk (Atlas Bio).
// 3 providers (Gmail / Outlook / Yahoo).
// 4 alerts mixed warn + critical.
// ---------------------------------------------------------------------------

const DOMAINS: AgencyReputationData['domains'] = [
  {
    id: 'd-helix',
    domain: 'helix.io',
    subClientId: 'sc-helix',
    subClientName: 'Helix Analytics',
    reputationScore: 89,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 22,
    inboxRatePct: 96.2,
    spamFolderPct: 1.8,
    last7dScores: [82, 84, 85, 86, 87, 88, 89],
    lastIncidentAgo: '3d ago',
    lastIncidentKind: 'bounce_spike',
  },
  {
    id: 'd-nimbus',
    domain: 'nimbuscloud.com',
    subClientId: 'sc-nimbus',
    subClientName: 'Nimbus Cloud',
    reputationScore: 86,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 18,
    inboxRatePct: 94.4,
    spamFolderPct: 2.1,
    last7dScores: [80, 81, 82, 83, 84, 85, 86],
    lastIncidentAgo: '5d ago',
    lastIncidentKind: 'peer_failed',
  },
  {
    id: 'd-orion',
    domain: 'orionsales.co',
    subClientId: 'sc-orion',
    subClientName: 'Orion Sales',
    reputationScore: 91,
    status: 'healthy',
    spfPass: true,
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 15,
    inboxRatePct: 97.6,
    spamFolderPct: 1.2,
    last7dScores: [85, 87, 88, 89, 90, 91, 91],
    lastIncidentAgo: null,
    lastIncidentKind: null,
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
    dmarcPass: false,
    mailboxCount: 12,
    inboxRatePct: 81.4,
    spamFolderPct: 4.1,
    last7dScores: [62, 64, 66, 68, 70, 71, 72],
    lastIncidentAgo: '6h ago',
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
    dkimPass: true,
    dmarcPass: true,
    mailboxCount: 10,
    inboxRatePct: 92.0,
    spamFolderPct: 2.6,
    last7dScores: [75, 77, 78, 79, 80, 81, 82],
    lastIncidentAgo: '2d ago',
    lastIncidentKind: 'bounce_spike',
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
    mailboxCount: 8,
    inboxRatePct: 93.1,
    spamFolderPct: 2.4,
    last7dScores: [78, 79, 80, 81, 82, 83, 84],
    lastIncidentAgo: '4d ago',
    lastIncidentKind: 'peer_failed',
  },
  {
    id: 'd-atlas',
    domain: 'atlas-bio.com',
    subClientId: 'sc-atlas',
    subClientName: 'Atlas Bio',
    reputationScore: 48,
    status: 'at_risk',
    spfPass: true,
    dkimPass: false,
    dmarcPass: false,
    mailboxCount: 6,
    inboxRatePct: 64.2,
    spamFolderPct: 11.8,
    last7dScores: [68, 66, 63, 60, 58, 54, 48],
    lastIncidentAgo: '38m ago',
    lastIncidentKind: 'bounce_spike',
  },
  {
    id: 'd-pixel',
    domain: 'pixelforge.app',
    subClientId: 'sc-pixel',
    subClientName: 'Pixel Forge',
    reputationScore: 65,
    status: 'warming',
    spfPass: true,
    dkimPass: true,
    dmarcPass: false,
    mailboxCount: 5,
    inboxRatePct: 78.6,
    spamFolderPct: 5.2,
    last7dScores: [55, 57, 59, 61, 62, 64, 65],
    lastIncidentAgo: '3h ago',
    lastIncidentKind: 'dns_break',
  },
];

const PROVIDERS: AgencyReputationData['providers'] = [
  {
    id: 'p-gmail',
    label: 'Gmail',
    inboxPct: 86.0,
    spamPct: 1.2,
    blockedPct: 0.4,
    last24hSends: 9840,
  },
  {
    id: 'p-outlook',
    label: 'Outlook',
    inboxPct: 79.0,
    spamPct: 2.8,
    blockedPct: 0.8,
    last24hSends: 3120,
  },
  {
    id: 'p-yahoo',
    label: 'Yahoo',
    inboxPct: 71.0,
    spamPct: 4.2,
    blockedPct: 1.4,
    last24hSends: 1860,
  },
];

const ALERTS: AgencyReputationData['recentAlerts'] = [
  {
    id: 'al-1',
    domain: 'atlas-bio.com',
    kind: 'bounce_spike',
    message: 'Bounce rate 7.4% on outreach@atlas-bio.com (24h)',
    ago: '38m ago',
    severity: 'critical',
  },
  {
    id: 'al-2',
    domain: 'atlas-bio.com',
    kind: 'dns_break',
    message: 'DKIM record removed from atlas-bio.com',
    ago: '1h ago',
    severity: 'critical',
  },
  {
    id: 'al-3',
    domain: 'vegaoutbound.io',
    kind: 'spam_complaint',
    message: '3 spam complaints on sales@vegaoutbound.io',
    ago: '6h ago',
    severity: 'warn',
  },
  {
    id: 'al-4',
    domain: 'pixelforge.app',
    kind: 'peer_failed',
    message: '2 peer inboxes deactivated in workspace pool',
    ago: '3h ago',
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
  recentAlerts: ALERTS,
};

// All-zero skeleton — what the live wrapper passes in before the API
// resolves. Same shape, so the lanes / inspector / vitals strip stay laid
// out and never reflow when data lands.
export const AGENCY_REPUTATION_SKELETON_C2: AgencyReputationData = {
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
// Theme + numeric helpers
// ---------------------------------------------------------------------------

// Hex token RGBs — tailwind.config.ts colors mirrored as concrete hex so
// inline SVG strokes / gradients can reference them without a CSS var
// lookup. Stay in sync with tailwind.config.ts.
const C = {
  // Token: `accent` resolves to the brand green/teal via CSS var. The
  // health green used across the app is rgb(242, 101, 34) — Gmail trace.
  accent: 'rgb(242, 101, 34)',
  // Cyan — Outlook trace.
  accent2: 'rgb(255, 138, 75)',
  // Red — Yahoo trace? No — accent3 = critical / alarm. Used for flash
  // backgrounds and the at-risk badge. Yahoo gets accent4 (yellow).
  accent3: 'rgb(255, 107, 74)',
  // Yellow — Yahoo trace.
  accent4: 'rgb(255, 213, 79)',
  // Aggregate trace uses base text colour (off-white).
  text: 'rgb(232, 232, 240)',
  textDim: 'rgb(136, 136, 160)',
  textFaint: 'rgb(90, 90, 114)',
  surface: 'rgb(18, 18, 26)',
  surface2: 'rgb(26, 26, 38)',
  borderMuted: 'rgb(42, 42, 58)',
  grid: 'rgb(34, 34, 50)',
  laneBg: 'rgb(12, 12, 22)',
} as const;

const STATUS_TEXT: Record<DomainStatus, string> = {
  healthy: 'text-accent',
  warming: 'text-accent4',
  at_risk: 'text-accent3',
};

const STATUS_DOT: Record<DomainStatus, string> = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
};

const STATUS_LABEL: Record<DomainStatus, string> = {
  healthy: 'STABLE',
  warming: 'WARMING',
  at_risk: 'CRITICAL',
};

const STATUS_RING: Record<DomainStatus, string> = {
  healthy: 'ring-accent/40',
  warming: 'ring-accent4/40',
  at_risk: 'ring-accent3/50',
};

// Border-colour tokens for the selected-domain chip — Tailwind needs the
// full literal class strings to JIT-compile them; never build these
// dynamically with backtick interpolation.
const STATUS_BORDER: Record<DomainStatus, string> = {
  healthy: 'border-accent/60',
  warming: 'border-accent4/60',
  at_risk: 'border-accent3/60',
};

const ALERT_LABEL: Record<AlertKind, string> = {
  bounce_spike: 'BOUNCE SPIKE',
  spam_complaint: 'SPAM COMPLAINT',
  dns_break: 'DNS BREAK',
  peer_failed: 'PEER FAILED',
};

const ALERT_ICON: Record<AlertKind, typeof MailWarning> = {
  bounce_spike: MailWarning,
  spam_complaint: ShieldX,
  dns_break: ShieldAlert,
  peer_failed: RadioTower,
};

// Trace lane vertical geometry (single lane = 110 high, scrolling area is
// inset by paddings).
const LANE_W = 720;
const LANE_H = 110;
const LANE_PAD_TOP = 12;
const LANE_PAD_BOTTOM = 14;
const LANE_PLOT_H = LANE_H - LANE_PAD_TOP - LANE_PAD_BOTTOM;
// Number of synthetic samples drawn on each trace per sweep (more = denser).
const SAMPLES = 64;
// Threshold below which a lane goes into ALARM flash (inbox % equivalent).
const ALARM_THRESHOLD = 70;

// Map an inbox-placement % (0–100) to a y coordinate inside the lane plot
// area (lower y = higher % at top).
function laneY(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  // Top of plot maps to 100%, bottom maps to 50% — that compresses the
  // visible band to the realistic operating range, like a real vitals
  // display that scales tightly to the patient's healthy window.
  const lo = 50;
  const hi = 100;
  const t = (clamped - lo) / (hi - lo);
  return LANE_PAD_TOP + (1 - t) * LANE_PLOT_H;
}

// Synthetic trace generator. Each provider lane gets a distinctive heartbeat
// signature (peaks + interbeat troughs) over `SAMPLES` points. `phase` shifts
// the wave to simulate scrolling. `baseline` is the lane's "healthy" %
// (anchored to the provider's current inbox %). `swing` is the peak-trough
// amplitude. `kind` picks the per-lane waveform variation.
type TraceKind = 'gmail' | 'outlook' | 'yahoo' | 'aggregate';

function traceWaveform(
  kind: TraceKind,
  baseline: number,
  swing: number,
  phase: number,
): number[] {
  const pts: number[] = [];
  const peakWidth = kind === 'aggregate' ? 0.18 : 0.12;
  // Beats per sweep — slightly different for each lane so the traces never
  // pulse in lock-step (looks more like four separate patients).
  const beats =
    kind === 'gmail' ? 5
      : kind === 'outlook' ? 4
        : kind === 'yahoo' ? 6
          : 3;
  for (let i = 0; i < SAMPLES; i += 1) {
    // Normalised position in the sweep, advanced by phase.
    const x = (i / SAMPLES + phase) % 1;
    // Position within the closest beat.
    const beatX = (x * beats) % 1;
    // Spike shape: a narrow positive lobe followed by a smaller negative
    // lobe — same general silhouette as a real QRS complex.
    let spike = 0;
    if (beatX < peakWidth) {
      const u = beatX / peakWidth;
      // Triangular peak.
      spike = (1 - Math.abs(u - 0.5) * 2) * swing;
    } else if (beatX < peakWidth + 0.06) {
      const u = (beatX - peakWidth) / 0.06;
      spike = -swing * 0.35 * Math.sin(u * Math.PI);
    }
    // Light noise to make the trace feel live.
    const noise = Math.sin(i * 0.7 + phase * 23) * 0.4;
    pts.push(baseline + spike + noise);
  }
  return pts;
}

function pointsToPolyline(values: number[], width: number): string {
  if (values.length === 0) return '';
  const step = width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = (i * step).toFixed(2);
      const y = laneY(v).toFixed(2);
      return `${x},${y}`;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// rAF scroll-phase hook — drives the left-scrolling traces.
// ---------------------------------------------------------------------------

/**
 * Returns a 0..1 number that advances continuously at the configured period
 * (in ms). Used as the `phase` arg to `traceWaveform` so the traces slide
 * leftward over time. The component re-renders on every animation frame
 * while mounted, which is intentional — the polylines need fresh `points`
 * every tick to scroll smoothly. We pause the loop when the tab is hidden
 * via `document.visibilityState` so we don't burn CPU off-screen.
 */
function useScrollPhase(periodMs: number = 30_000): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      if (document.visibilityState === 'visible') {
        const t = ((now - start) % periodMs) / periodMs;
        setPhase(t);
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [periodMs]);
  return phase;
}

// ---------------------------------------------------------------------------
// Animation presets
// ---------------------------------------------------------------------------

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

const flickSpring = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 26,
  mass: 0.7,
};

// ---------------------------------------------------------------------------
// Number formatting — terse, LCD-friendly. Tabular numerals via the
// `tabular-nums` class on every readout so digit width is fixed.
// ---------------------------------------------------------------------------

function fmtPct(n: number, decimals: number = 1): string {
  if (!Number.isFinite(n)) return '0.0%';
  return `${n.toFixed(decimals)}%`;
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return formatNumber(n);
}

function fmtScore(n: number): string {
  if (!Number.isFinite(n)) return '00';
  // LCD-style two-or-three digit padded score.
  return Math.round(n).toString().padStart(2, '0');
}

function fmtDelta(n: number): string {
  if (!Number.isFinite(n)) return '+0.0';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}`;
}

// ---------------------------------------------------------------------------
// AnimatedDigits — value flicks (translateY) when it changes. Used by the
// big VITALS readouts.
// ---------------------------------------------------------------------------

function AnimatedDigits({
  value,
  className,
}: {
  value: string;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex overflow-hidden tabular-nums ${className ?? ''}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {value.split('').map((ch, i) => (
          <motion.span
            // Pair index + char into the key so consecutive identical digits
            // at the same slot don't get re-mounted (their AnimatePresence
            // identity stays stable across renders).
            key={`${i}-${ch}`}
            initial={{ y: '0.9em', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-0.9em', opacity: 0 }}
            transition={flickSpring}
            className="inline-block"
          >
            {ch}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Typewriter — used for small status / digital-readout strings (the
// "BPM" labels next to lanes, lane peak/min numbers). Reveals characters in
// 80ms steps on value change. Less heavyweight than AnimatedDigits — no
// per-digit framer-motion.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lane card — one provider's vitals trace.
// ---------------------------------------------------------------------------

interface LaneSpec {
  id: string;
  label: string;
  kind: TraceKind;
  /** Tailwind text colour token for this lane's trace + readout */
  tone: 'accent' | 'accent2' | 'accent4' | 'text';
  /** Concrete colour string used for SVG strokes / fills */
  colorHex: string;
  /** Baseline % for the synthetic waveform (≈ provider's current inbox %) */
  baseline: number;
  /** Peak-trough amplitude */
  swing: number;
  /** Current digital readout — provider's inbox % */
  readout: number;
  /** Sub-label below the BPM equivalent — e.g. "24h SENDS · 9,840" */
  sub: string;
  /** Heart icon for the lane header */
  icon: typeof Activity;
  /** Whether this lane is in ALARM (below threshold) */
  alarm: boolean;
}

function LaneCard({
  spec,
  phase,
}: {
  spec: LaneSpec;
  phase: number;
}): JSX.Element {
  // The polyline points string — recomputed every frame for the slide.
  const wave = useMemo(
    () => traceWaveform(spec.kind, spec.baseline, spec.swing, phase),
    [spec.kind, spec.baseline, spec.swing, phase],
  );
  const points = pointsToPolyline(wave, LANE_W);
  // Beat dot position — last sample's y, x at the right edge.
  const lastY = laneY(wave[wave.length - 1] ?? spec.baseline);

  const toneClass =
    spec.tone === 'accent'
      ? 'text-accent'
      : spec.tone === 'accent2'
        ? 'text-accent2'
        : spec.tone === 'accent4'
          ? 'text-accent4'
          : 'text-text';

  // Per-lane: dim the lane bg unless it's in alarm. Alarm pulses accent3
  // overlay every 1.2s.
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border-muted bg-[rgb(12,12,22)] ${
        spec.alarm ? 'ring-1 ring-accent3/40' : ''
      }`}
    >
      {/* Alarm flash overlay — only mounted when in alarm state. */}
      {spec.alarm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.18, 0] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="pointer-events-none absolute inset-0 bg-accent3"
        />
      )}
      <div className="flex">
        {/* Lane header rail — provider name + icon + status */}
        <div className="flex w-44 shrink-0 flex-col justify-between border-r border-border-muted px-3 py-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <spec.icon className={`h-3.5 w-3.5 ${toneClass}`} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-dim">
                Lead {spec.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  spec.alarm ? 'bg-accent3' : 'bg-accent'
                }`}
              />
              <span
                className={`font-mono text-[10px] ${
                  spec.alarm ? 'text-accent3' : 'text-text-dim'
                }`}
              >
                {spec.alarm ? 'ALARM' : 'NORMAL'}
              </span>
            </div>
          </div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-text-faint">
            {spec.sub}
          </div>
        </div>

        {/* Trace plot — the scrolling polyline. */}
        <div className="relative flex-1">
          <svg
            viewBox={`0 0 ${LANE_W} ${LANE_H}`}
            preserveAspectRatio="none"
            className="block h-[110px] w-full"
            role="img"
            aria-label={`${spec.label} vitals trace`}
          >
            <defs>
              {/* Trace glow gradient — colour-fade above the line. */}
              <linearGradient
                id={`grad-${spec.id}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={spec.colorHex} stopOpacity="0.28" />
                <stop offset="100%" stopColor={spec.colorHex} stopOpacity="0" />
              </linearGradient>
              {/* Scanline gradient — horizontal sweep across the lane. */}
              <linearGradient
                id={`scan-${spec.id}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor={spec.colorHex} stopOpacity="0" />
                <stop
                  offset="50%"
                  stopColor={spec.colorHex}
                  stopOpacity="0.08"
                />
                <stop offset="100%" stopColor={spec.colorHex} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Faint horizontal grid lines — mimic a real ECG paper trace. */}
            {[25, 50, 75].map((p) => (
              <line
                key={p}
                x1={0}
                x2={LANE_W}
                y1={LANE_PAD_TOP + (LANE_PLOT_H * p) / 100}
                y2={LANE_PAD_TOP + (LANE_PLOT_H * p) / 100}
                stroke={C.grid}
                strokeDasharray="2 6"
                strokeWidth={1}
              />
            ))}

            {/* Vertical grid ticks — every ~10% of the width. */}
            {Array.from({ length: 11 }, (_, i) => (
              <line
                key={i}
                x1={(LANE_W * i) / 10}
                x2={(LANE_W * i) / 10}
                y1={LANE_PAD_TOP}
                y2={LANE_PAD_TOP + LANE_PLOT_H}
                stroke={C.grid}
                strokeWidth={0.6}
                opacity={0.5}
              />
            ))}

            {/* The trace polyline itself. */}
            <polyline
              points={points}
              fill="none"
              stroke={spec.colorHex}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 6px ${spec.colorHex}66)`,
              }}
            />
            {/* Filled glow under the trace — adds the colour wash. */}
            <polygon
              points={`0,${LANE_PAD_TOP + LANE_PLOT_H} ${points} ${LANE_W},${
                LANE_PAD_TOP + LANE_PLOT_H
              }`}
              fill={`url(#grad-${spec.id})`}
              opacity={0.7}
            />

            {/* Beat dot — scales 1 → 1.3 → 1, 1.5s loop. */}
            <motion.circle
              cx={LANE_W - 2}
              cy={lastY}
              r={3.2}
              fill={spec.colorHex}
              animate={{ r: [3.2, 4.6, 3.2], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{ filter: `drop-shadow(0 0 6px ${spec.colorHex})` }}
            />

            {/* Alarm "!" if below threshold — drawn near the right edge */}
            {spec.alarm && (
              <g>
                <motion.rect
                  x={LANE_W - 30}
                  y={LANE_PAD_TOP + 4}
                  width={20}
                  height={20}
                  rx={3}
                  fill={C.accent3}
                  opacity={0.85}
                  animate={{ opacity: [0.85, 0.4, 0.85] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <text
                  x={LANE_W - 20}
                  y={LANE_PAD_TOP + 19}
                  fill="white"
                  fontSize={14}
                  fontWeight={800}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                >
                  !
                </text>
              </g>
            )}
          </svg>

          {/* Top-left lane caption — peak ↑, trough ↓ */}
          <div className="pointer-events-none absolute left-3 top-1.5 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint">
            <span>
              <span className="text-text-dim">↑ peak</span>{' '}
              <span className={toneClass}>
                {fmtPct(Math.max(...wave), 0)}
              </span>
            </span>
            <span>
              <span className="text-text-dim">↓ min</span>{' '}
              <span className={toneClass}>
                {fmtPct(Math.min(...wave), 0)}
              </span>
            </span>
          </div>

          {/* Bottom-left timeline marker */}
          <div className="pointer-events-none absolute bottom-1 left-3 font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
            T-30s ── now
          </div>
        </div>

        {/* Right-side digital readout — current value + BPM equivalent */}
        <div className="flex w-28 shrink-0 flex-col items-end justify-center gap-0.5 border-l border-border-muted px-3 py-2.5">
          <div className={`font-mono text-[10px] uppercase tracking-[0.16em] ${toneClass}`}>
            INBOX
          </div>
          <div
            className={`font-mono text-2xl font-bold leading-none tabular-nums ${toneClass}`}
            style={{
              textShadow: `0 0 8px ${spec.colorHex}55`,
            }}
          >
            <AnimatedDigits value={fmtScore(spec.readout)} />
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
            {spec.kind === 'aggregate' ? 'AGG' : 'BPM EQ'}{' '}
            <span className={toneClass}>{Math.round(spec.readout * 1.2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector panel — selected domain detail.
// ---------------------------------------------------------------------------

interface InspectorProps {
  domain: AgencyReputationData['domains'][number] | null;
  alerts: AgencyReputationData['recentAlerts'];
}

function Inspector({ domain, alerts }: InspectorProps): JSX.Element {
  if (!domain) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-border-muted bg-surface p-6 text-center">
        <Stethoscope className="h-8 w-8 text-text-faint" />
        <div className="text-sm text-text-dim">
          No domain selected — pick one to inspect.
        </div>
      </div>
    );
  }

  const trace = domain.last7dScores;
  const minTrace = trace.length ? Math.min(...trace) : 0;
  const maxTrace = trace.length ? Math.max(...trace) : 100;
  const span = Math.max(1, maxTrace - minTrace);
  const traceW = 280;
  const traceH = 56;
  const tracePoints = trace
    .map((v, i) => {
      const x =
        trace.length === 1 ? traceW / 2 : (i / (trace.length - 1)) * traceW;
      const y = traceH - ((v - minTrace) / span) * traceH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const domainAlerts = alerts.filter((a) => a.domain === domain.domain);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={domain.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-border-muted bg-surface"
      >
        {/* Inspector header */}
        <div className="border-b border-border-muted p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[domain.status]}`}
                />
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.16em] ${STATUS_TEXT[domain.status]}`}
                >
                  {STATUS_LABEL[domain.status]}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
                  · DOMAIN
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-text-dim" />
                <h3 className="text-base font-semibold text-text">
                  {domain.domain}
                </h3>
              </div>
              <div className="text-xs text-text-dim">
                Sub-client:{' '}
                <span className="font-medium text-text">
                  {domain.subClientName}
                </span>
                <span className="ml-1.5 text-text-faint">· ID</span>{' '}
                <span className="font-mono text-text-faint">
                  {domain.subClientId}
                </span>
              </div>
            </div>
            <div
              className={`flex flex-col items-end rounded-md border border-border-muted bg-surface-2 px-2 py-1.5 ring-1 ${STATUS_RING[domain.status]}`}
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                REP
              </span>
              <span
                className={`font-mono text-xl font-bold leading-none ${STATUS_TEXT[domain.status]}`}
              >
                {fmtScore(domain.reputationScore)}
              </span>
            </div>
          </div>
        </div>

        {/* Vitals row — inbox / spam / mailboxes */}
        <div className="grid grid-cols-3 border-b border-border-muted">
          <InspectorMetric
            label="INBOX"
            value={fmtPct(domain.inboxRatePct, 1)}
            tone={domain.inboxRatePct >= 90 ? 'good' : domain.inboxRatePct >= 75 ? 'warn' : 'bad'}
          />
          <div className="border-l border-border-muted">
            <InspectorMetric
              label="SPAM"
              value={fmtPct(domain.spamFolderPct, 1)}
              tone={domain.spamFolderPct <= 3 ? 'good' : domain.spamFolderPct <= 6 ? 'warn' : 'bad'}
            />
          </div>
          <div className="border-l border-border-muted">
            <InspectorMetric
              label="BOXES"
              value={`${domain.mailboxCount}`}
              tone="info"
            />
          </div>
        </div>

        {/* DNS chips */}
        <div className="border-b border-border-muted p-4">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            <ShieldCheck className="h-3 w-3" />
            DNS AUTHENTICATION
          </div>
          <div className="flex flex-wrap gap-1.5">
            <DnsChip name="SPF" pass={domain.spfPass} />
            <DnsChip name="DKIM" pass={domain.dkimPass} />
            <DnsChip name="DMARC" pass={domain.dmarcPass} />
          </div>
        </div>

        {/* 7-day reputation trace */}
        <div className="border-b border-border-muted p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            <span className="flex items-center gap-1.5">
              <Waves className="h-3 w-3" /> 7-DAY REP TRACE
            </span>
            <span className="text-text-dim">
              MIN <span className="text-text">{fmtScore(minTrace)}</span> · MAX{' '}
              <span className="text-text">{fmtScore(maxTrace)}</span>
            </span>
          </div>
          <svg
            viewBox={`0 0 ${traceW} ${traceH}`}
            className="block h-[56px] w-full"
            preserveAspectRatio="none"
            aria-label="7-day reputation trace"
          >
            <defs>
              <linearGradient id={`insp-${domain.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={
                    domain.status === 'at_risk'
                      ? C.accent3
                      : domain.status === 'warming'
                        ? C.accent4
                        : C.accent
                  }
                  stopOpacity="0.4"
                />
                <stop
                  offset="100%"
                  stopColor={
                    domain.status === 'at_risk'
                      ? C.accent3
                      : domain.status === 'warming'
                        ? C.accent4
                        : C.accent
                  }
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            <polyline
              points={tracePoints}
              fill="none"
              stroke={
                domain.status === 'at_risk'
                  ? C.accent3
                  : domain.status === 'warming'
                    ? C.accent4
                    : C.accent
              }
              strokeWidth={1.6}
            />
            {trace.length > 0 && (
              <polygon
                points={`0,${traceH} ${tracePoints} ${traceW},${traceH}`}
                fill={`url(#insp-${domain.id})`}
              />
            )}
            {trace.map((v, i) => {
              const x =
                trace.length === 1
                  ? traceW / 2
                  : (i / (trace.length - 1)) * traceW;
              const y = traceH - ((v - minTrace) / span) * traceH;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={1.5}
                  fill={
                    domain.status === 'at_risk'
                      ? C.accent3
                      : domain.status === 'warming'
                        ? C.accent4
                        : C.accent
                  }
                />
              );
            })}
          </svg>
        </div>

        {/* Last incident */}
        <div className="border-b border-border-muted p-4">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            <Clock className="h-3 w-3" />
            LAST INCIDENT
          </div>
          {domain.lastIncidentAgo && domain.lastIncidentKind ? (
            <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-2.5">
              <div className="mt-0.5 rounded bg-bg p-1">
                {(() => {
                  const Icon = ALERT_ICON[domain.lastIncidentKind];
                  return <Icon className="h-3.5 w-3.5 text-accent3" />;
                })()}
              </div>
              <div className="flex-1 space-y-0.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent3">
                  {ALERT_LABEL[domain.lastIncidentKind]}
                </div>
                <div className="text-[11px] text-text-dim">
                  Detected {domain.lastIncidentAgo} · auto-quarantined
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-surface-2 p-2.5 text-[11px] text-text-dim">
              No incidents in the last 7 days. All vitals nominal.
            </div>
          )}
        </div>

        {/* Recent alerts for this domain */}
        <div className="flex-1 overflow-hidden p-4">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            <span className="flex items-center gap-1.5">
              <Bell className="h-3 w-3" />
              ALERT FEED · {domain.domain}
            </span>
            <span className="text-text-dim">{domainAlerts.length}</span>
          </div>
          {domainAlerts.length === 0 ? (
            <div className="rounded-lg bg-surface-2 p-2.5 text-[11px] text-text-dim">
              No active alerts on this domain.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {domainAlerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2 rounded-lg border border-border-muted bg-surface-2 p-2.5"
                >
                  <div className="mt-0.5">
                    {(() => {
                      const Icon = ALERT_ICON[a.kind];
                      return (
                        <Icon
                          className={`h-3.5 w-3.5 ${
                            a.severity === 'critical'
                              ? 'text-accent3'
                              : 'text-accent4'
                          }`}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div
                      className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                        a.severity === 'critical'
                          ? 'text-accent3'
                          : 'text-accent4'
                      }`}
                    >
                      {ALERT_LABEL[a.kind]} · {a.severity.toUpperCase()}
                    </div>
                    <div className="text-[11px] text-text-dim">{a.message}</div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
                      {a.ago}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Helpers for inspector
// ---------------------------------------------------------------------------

function InspectorMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
}): JSX.Element {
  const tcls =
    tone === 'good'
      ? 'text-accent'
      : tone === 'warn'
        ? 'text-accent4'
        : tone === 'bad'
          ? 'text-accent3'
          : 'text-text';
  return (
    <div className="flex flex-col items-center justify-center gap-1 p-3 text-center">
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-faint">
        {label}
      </span>
      <span className={`font-mono text-lg font-bold leading-none ${tcls}`}>
        {value}
      </span>
    </div>
  );
}

function DnsChip({ name, pass }: { name: string; pass: boolean }): JSX.Element {
  const cls = pass
    ? 'bg-accent/10 text-accent border-accent/30'
    : 'bg-accent3/10 text-accent3 border-accent3/30';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${cls}`}
    >
      {pass ? <ShieldCheck className="h-3 w-3" /> : <ShieldX className="h-3 w-3" />}
      {name} {pass ? 'OK' : 'FAIL'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// VITALS strip — 4 large LCD readouts with mini-sparklines.
// ---------------------------------------------------------------------------

interface VitalsCardProps {
  label: string;
  value: string;
  sub: string;
  tone: 'accent' | 'accent2' | 'accent3' | 'accent4' | 'text';
  icon: typeof Activity;
  spark: number[];
  unit?: string;
}

function VitalsCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  spark,
  unit,
}: VitalsCardProps): JSX.Element {
  const toneCls =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : tone === 'accent3'
          ? 'text-accent3'
          : tone === 'accent4'
            ? 'text-accent4'
            : 'text-text';
  const toneHex =
    tone === 'accent'
      ? C.accent
      : tone === 'accent2'
        ? C.accent2
        : tone === 'accent3'
          ? C.accent3
          : tone === 'accent4'
            ? C.accent4
            : C.text;

  const sparkW = 200;
  const sparkH = 28;
  const lo = spark.length ? Math.min(...spark) : 0;
  const hi = spark.length ? Math.max(...spark) : 1;
  const span = Math.max(1, hi - lo);
  const sparkPts = spark
    .map((v, i) => {
      const x =
        spark.length === 1 ? sparkW / 2 : (i / (spark.length - 1)) * sparkW;
      const y = sparkH - ((v - lo) / span) * sparkH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="relative overflow-hidden rounded-xl border border-border-muted bg-surface p-4">
      {/* Top-line label + icon */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            {label}
          </span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-faint">
          LCD
        </span>
      </div>

      {/* Big LCD value */}
      <div
        className={`mt-2 flex items-baseline gap-1.5 font-mono font-bold leading-none ${toneCls}`}
        style={{ textShadow: `0 0 10px ${toneHex}40` }}
      >
        <span className="text-4xl">
          <AnimatedDigits value={value} />
        </span>
        {unit && (
          <span className="text-base font-medium text-text-dim">{unit}</span>
        )}
      </div>

      {/* Sub-label */}
      <div className="mt-1.5 text-[11px] text-text-dim">{sub}</div>

      {/* Mini-sparkline */}
      <div className="mt-3">
        <svg
          viewBox={`0 0 ${sparkW} ${sparkH}`}
          preserveAspectRatio="none"
          className="block h-7 w-full"
          aria-label={`${label} sparkline`}
        >
          <defs>
            <linearGradient
              id={`spark-${label.replace(/\s+/g, '-').toLowerCase()}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={toneHex} stopOpacity="0.5" />
              <stop offset="100%" stopColor={toneHex} stopOpacity="0" />
            </linearGradient>
          </defs>
          {spark.length > 1 && (
            <>
              <polygon
                points={`0,${sparkH} ${sparkPts} ${sparkW},${sparkH}`}
                fill={`url(#spark-${label.replace(/\s+/g, '-').toLowerCase()})`}
              />
              <polyline
                points={sparkPts}
                fill="none"
                stroke={toneHex}
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
      </div>

      {/* Scanline overlay — faint horizontal sweep that travels every 4s. */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${toneHex}66, transparent)`,
        }}
        animate={{ x: ['-30%', '130%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain selector strip — clickable chips above the inspector. Lets you
// pick which domain the inspector shows without having to scroll the lanes.
// ---------------------------------------------------------------------------

function DomainStrip({
  domains,
  selectedId,
  onSelect,
}: {
  domains: AgencyReputationData['domains'];
  selectedId: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  // Keep the selected chip visible — useEffect scrolls the rail when the
  // selection changes (so clicking a domain in another lane / vitals card
  // doesn't leave the strip out of view).
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const chip = container.querySelector<HTMLButtonElement>(
      `[data-domain-id="${selectedId}"]`,
    );
    if (!chip) return;
    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [selectedId]);

  return (
    <div className="overflow-hidden rounded-xl border border-border-muted bg-surface">
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <HeartPulse className="h-3.5 w-3.5 text-accent" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            PATIENT REGISTRY · {domains.length} DOMAINS
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-faint">
          CLICK TO INSPECT
        </span>
      </div>
      <div
        ref={ref}
        className="flex gap-2 overflow-x-auto p-3"
        style={{ scrollbarWidth: 'thin' }}
      >
        {domains.map((d) => {
          const selected = d.id === selectedId;
          return (
            <button
              key={d.id}
              type="button"
              data-domain-id={d.id}
              onClick={() => onSelect(d.id)}
              className={`group flex shrink-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition ${
                selected
                  ? `${STATUS_BORDER[d.status]} bg-surface-2`
                  : 'border-border-muted bg-bg hover:bg-surface-2'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[d.status]}`}
                />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text">
                  {d.domain}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-text-dim">
                <span>{d.subClientName}</span>
                <span className="text-text-faint">·</span>
                <span className={`font-mono ${STATUS_TEXT[d.status]}`}>
                  REP {fmtScore(d.reputationScore)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider summary tiles — sit below VITALS, in the bottom row alongside
// the global alert log.
// ---------------------------------------------------------------------------

function ProviderTile({
  provider,
  tone,
}: {
  provider: AgencyReputationData['providers'][number];
  tone: 'accent' | 'accent2' | 'accent4';
}): JSX.Element {
  const toneCls =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent2'
        ? 'text-accent2'
        : 'text-accent4';
  const toneHex =
    tone === 'accent' ? C.accent : tone === 'accent2' ? C.accent2 : C.accent4;
  return (
    <div className="relative overflow-hidden rounded-lg border border-border-muted bg-surface p-3">
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${toneCls}`}>
          {provider.label}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
          24H · {fmtInt(provider.last24hSends)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
            INBOX
          </div>
          <div className={`mt-0.5 font-mono text-base font-bold leading-none ${toneCls}`}>
            {fmtPct(provider.inboxPct, 0)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
            SPAM
          </div>
          <div className="mt-0.5 font-mono text-base font-bold leading-none text-accent4">
            {fmtPct(provider.spamPct, 1)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-faint">
            BLOCK
          </div>
          <div className="mt-0.5 font-mono text-base font-bold leading-none text-accent3">
            {fmtPct(provider.blockedPct, 1)}
          </div>
        </div>
      </div>
      {/* Mini bar — inbox slice on a 100% bed */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded bg-surface-2">
        <div
          className="h-full"
          style={{
            width: `${provider.inboxPct.toFixed(1)}%`,
            background: toneHex,
            boxShadow: `0 0 6px ${toneHex}66`,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global alert log — chronological list of every active alert across all
// domains.
// ---------------------------------------------------------------------------

function AlertLog({
  alerts,
  onPickDomain,
  domainsById,
}: {
  alerts: AgencyReputationData['recentAlerts'];
  onPickDomain: (domainId: string) => void;
  domainsById: Map<string, AgencyReputationData['domains'][number]>;
}): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-border-muted bg-surface">
      <div className="flex items-center justify-between border-b border-border-muted px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-accent3" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            GLOBAL ALERT LOG
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-faint">
          {alerts.length} ACTIVE
        </span>
      </div>
      {alerts.length === 0 ? (
        <div className="p-6 text-center text-sm text-text-dim">
          All clear — no active alerts.
        </div>
      ) : (
        <ul className="divide-y divide-border-muted">
          {alerts.map((a, idx) => {
            // Find the domain by the alert's domain string (mock-only join).
            let matched: AgencyReputationData['domains'][number] | undefined;
            for (const d of domainsById.values()) {
              if (d.domain === a.domain) {
                matched = d;
                break;
              }
            }
            const Icon = ALERT_ICON[a.kind];
            return (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.04 * idx }}
                className="flex items-start gap-3 p-3"
              >
                <div className="mt-0.5 rounded bg-bg p-1.5">
                  <Icon
                    className={`h-3.5 w-3.5 ${
                      a.severity === 'critical' ? 'text-accent3' : 'text-accent4'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${
                        a.severity === 'critical'
                          ? 'text-accent3'
                          : 'text-accent4'
                      }`}
                    >
                      {ALERT_LABEL[a.kind]}
                    </span>
                    <span className="font-mono text-[10px] text-text-faint">
                      ·
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-dim">
                      {a.severity}
                    </span>
                  </div>
                  <div className="truncate text-[12px] text-text">
                    {a.message}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-text-faint">
                    <span className="font-mono uppercase tracking-[0.12em]">
                      {a.ago}
                    </span>
                    <span>·</span>
                    {matched ? (
                      <button
                        type="button"
                        onClick={() => onPickDomain(matched!.id)}
                        className="inline-flex items-center gap-0.5 font-mono uppercase tracking-[0.12em] text-text-dim hover:text-accent2"
                      >
                        {a.domain}
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="font-mono uppercase tracking-[0.12em]">
                        {a.domain}
                      </span>
                    )}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — agency name + region + PATIENT identifier + LCD overall gauge.
// ---------------------------------------------------------------------------

function Header({
  data,
  uptime,
}: {
  data: AgencyReputationData;
  uptime: string;
}): JSX.Element {
  const score = data.summary.overallScore;
  const tone = score >= 80 ? 'accent' : score >= 65 ? 'accent4' : 'accent3';
  const toneCls =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent4'
        ? 'text-accent4'
        : 'text-accent3';
  const toneHex =
    tone === 'accent' ? C.accent : tone === 'accent4' ? C.accent4 : C.accent3;

  const delta = data.summary.trend7dDelta;

  return (
    <motion.header
      {...fade(0)}
      className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        {/* Title block */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
            <HeartPulse className="h-3 w-3 text-accent3" />
            BEDSIDE VITALS · REPUTATION MONITOR
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {data.agency.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
            <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 font-mono uppercase tracking-[0.14em] text-text-dim">
              <Globe className="h-3 w-3" /> {data.agency.region}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 font-mono uppercase tracking-[0.14em] text-text-dim">
              PATIENT ID · NW-001
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 font-mono uppercase tracking-[0.14em] text-text-dim">
              <Clock className="h-3 w-3" /> UPTIME {uptime}
            </span>
          </div>
        </div>

        {/* LCD overall gauge */}
        <div
          className="flex items-center gap-3 rounded-xl border border-border-muted bg-bg px-4 py-3"
          style={{ boxShadow: `inset 0 0 18px ${toneHex}22` }}
        >
          {/* Pulse bracket — animated tick of a heart-rate alarm beep */}
          <div className="flex items-center justify-center">
            <motion.div
              className="flex h-9 w-9 items-center justify-center rounded-full"
              style={{ background: `${toneHex}1a`, boxShadow: `0 0 0 1px ${toneHex}44` }}
              animate={{ scale: [1, 1.12, 1], boxShadow: [`0 0 0 1px ${toneHex}44`, `0 0 0 6px ${toneHex}00`, `0 0 0 1px ${toneHex}44`] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <HeartPulse className={`h-4 w-4 ${toneCls}`} />
            </motion.div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-faint">
              OVERALL REP
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`font-mono text-4xl font-bold leading-none ${toneCls}`}
                style={{ textShadow: `0 0 12px ${toneHex}66` }}
              >
                <AnimatedDigits value={fmtScore(score)} />
              </span>
              <span className="font-mono text-xs text-text-dim">/ 100</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px]">
              <span
                className={`font-mono uppercase tracking-[0.12em] ${
                  delta >= 0 ? 'text-accent' : 'text-accent3'
                }`}
              >
                {fmtDelta(delta)}
              </span>
              <span className="text-text-faint">7-DAY</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status pill row — counts of healthy / warming / at-risk */}
      <div className="grid grid-cols-3 border-t border-border-muted">
        <HeaderCountTile
          label="STABLE"
          tone="accent"
          value={data.summary.domainsHealthy}
          icon={ShieldCheck}
        />
        <div className="border-l border-border-muted">
          <HeaderCountTile
            label="WARMING"
            tone="accent4"
            value={data.summary.domainsWarming}
            icon={Activity}
          />
        </div>
        <div className="border-l border-border-muted">
          <HeaderCountTile
            label="CRITICAL"
            tone="accent3"
            value={data.summary.domainsAtRisk}
            icon={AlertTriangle}
          />
        </div>
      </div>
    </motion.header>
  );
}

function HeaderCountTile({
  label,
  tone,
  value,
  icon: Icon,
}: {
  label: string;
  tone: 'accent' | 'accent4' | 'accent3';
  value: number;
  icon: typeof Activity;
}): JSX.Element {
  const toneCls =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'accent4'
        ? 'text-accent4'
        : 'text-accent3';
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
      </div>
      <span className={`font-mono text-xl font-bold leading-none ${toneCls}`}>
        <AnimatedDigits value={value.toString().padStart(2, '0')} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Synthetic "uptime" string — counts seconds since mount. The component
// stays mounted for the page lifetime, so the LCD shows uptime live.
// ---------------------------------------------------------------------------

function useUptime(): string {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      setSecs(Math.floor((performance.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Sparkline data — synthetic 24h trace per vital. Anchored to the metric's
// current value so the spark visually trails into it.
// ---------------------------------------------------------------------------

function buildSpark(
  current: number,
  variance: number,
  trendDir: 'up' | 'down' | 'flat',
  n: number = 24,
): number[] {
  const pts: number[] = [];
  const drift =
    trendDir === 'up' ? variance * 0.5 : trendDir === 'down' ? -variance * 0.5 : 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const v =
      current - drift + (drift * 2 * t) + Math.sin(i * 0.9) * variance * 0.3;
    pts.push(Math.max(0, v));
  }
  // Force the last point to equal the current value so the spark "lands" on
  // the LCD reading.
  pts[pts.length - 1] = current;
  return pts;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgRepC2Vitals({
  data,
}: { data?: AgencyReputationData } = {}): JSX.Element {
  // Prop-less in the :35001 design preview → MOCK; live wrapper passes
  // real workspace-derived data of the same shape.
  const d = data ?? MOCK;

  // The lane scroll phase — drives all four traces simultaneously.
  const phase = useScrollPhase(30_000);

  // Selected domain — defaults to the first at-risk if any, else the first
  // domain, else null (skeleton state).
  const initialSelected = useMemo(() => {
    if (d.domains.length === 0) return null;
    const atRisk = d.domains.find((x) => x.status === 'at_risk');
    return (atRisk ?? d.domains[0])!.id;
  }, [d.domains]);

  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(
    initialSelected,
  );

  // If the data prop changes shape (e.g. live wrapper swap from skeleton to
  // real), re-seed the selection.
  useEffect(() => {
    if (selectedDomainId == null && initialSelected) {
      setSelectedDomainId(initialSelected);
    }
  }, [initialSelected, selectedDomainId]);

  const domainsById = useMemo(() => {
    const m = new Map<string, AgencyReputationData['domains'][number]>();
    for (const dm of d.domains) m.set(dm.id, dm);
    return m;
  }, [d.domains]);

  const selectedDomain =
    selectedDomainId !== null ? (domainsById.get(selectedDomainId) ?? null) : null;

  const uptime = useUptime();

  // Build the four lane specs from the providers + the global aggregate.
  // Provider mapping: Gmail → accent, Outlook → accent2, Yahoo → accent4.
  // Aggregate → text. If a provider is absent (skeleton), the lane shows a
  // flat trace at 0 — still scrolls, still beat-pulses, just no signal.
  const lanes = useMemo<LaneSpec[]>(() => {
    const gmail = d.providers.find((p) => p.id === 'p-gmail');
    const outlook = d.providers.find((p) => p.id === 'p-outlook');
    const yahoo = d.providers.find((p) => p.id === 'p-yahoo');

    const aggregateInbox =
      d.providers.length > 0
        ? d.providers.reduce(
            (acc, p) => acc + p.inboxPct * p.last24hSends,
            0,
          ) /
          Math.max(
            1,
            d.providers.reduce((acc, p) => acc + p.last24hSends, 0),
          )
        : 0;

    const aggregateSends = d.providers.reduce(
      (acc, p) => acc + p.last24hSends,
      0,
    );

    const gmailReadout = gmail?.inboxPct ?? 0;
    const outlookReadout = outlook?.inboxPct ?? 0;
    const yahooReadout = yahoo?.inboxPct ?? 0;

    return [
      {
        id: 'lane-gmail',
        label: 'GMAIL',
        kind: 'gmail',
        tone: 'accent',
        colorHex: C.accent,
        baseline: gmailReadout || 60,
        swing: 14,
        readout: gmailReadout,
        sub: `24H SENDS · ${fmtInt(gmail?.last24hSends ?? 0)}`,
        icon: Inbox,
        alarm: gmailReadout > 0 && gmailReadout < ALARM_THRESHOLD,
      },
      {
        id: 'lane-outlook',
        label: 'OUTLOOK',
        kind: 'outlook',
        tone: 'accent2',
        colorHex: C.accent2,
        baseline: outlookReadout || 60,
        swing: 16,
        readout: outlookReadout,
        sub: `24H SENDS · ${fmtInt(outlook?.last24hSends ?? 0)}`,
        icon: Inbox,
        alarm: outlookReadout > 0 && outlookReadout < ALARM_THRESHOLD,
      },
      {
        id: 'lane-yahoo',
        label: 'YAHOO',
        kind: 'yahoo',
        tone: 'accent4',
        colorHex: C.accent4,
        baseline: yahooReadout || 60,
        swing: 18,
        readout: yahooReadout,
        sub: `24H SENDS · ${fmtInt(yahoo?.last24hSends ?? 0)}`,
        icon: Inbox,
        alarm: yahooReadout > 0 && yahooReadout < ALARM_THRESHOLD,
      },
      {
        id: 'lane-agg',
        label: 'AGGREGATE',
        kind: 'aggregate',
        tone: 'text',
        colorHex: C.text,
        baseline: aggregateInbox || 60,
        swing: 10,
        readout: aggregateInbox,
        sub: `FLEET SENDS · ${fmtInt(aggregateSends)}`,
        icon: Waves,
        alarm: aggregateInbox > 0 && aggregateInbox < ALARM_THRESHOLD,
      },
    ];
  }, [d.providers]);

  // Vitals strip data — sparklines synthesised from current values + trend
  // direction inferred from the 7d delta sign.
  const overallSpark = useMemo(
    () =>
      buildSpark(
        d.summary.overallScore,
        2.5,
        d.summary.trend7dDelta >= 0 ? 'up' : 'down',
      ),
    [d.summary.overallScore, d.summary.trend7dDelta],
  );
  const bounceSpark = useMemo(
    () => buildSpark(d.summary.bouncePct24h, 0.4, 'flat'),
    [d.summary.bouncePct24h],
  );
  const spamSpark = useMemo(
    () => buildSpark(d.summary.spamComplaintPct24h, 0.1, 'flat'),
    [d.summary.spamComplaintPct24h],
  );
  const sendsSpark = useMemo(
    () =>
      buildSpark(
        d.summary.totalSends24h,
        d.summary.totalSends24h * 0.06,
        'up',
      ),
    [d.summary.totalSends24h],
  );

  const isEmpty = d.domains.length === 0;

  return (
    <div className="space-y-5">
      {/* Patient + LCD overall gauge */}
      <Header data={d} uptime={uptime} />

      {/* Patient registry strip */}
      {!isEmpty && (
        <motion.div {...fade(0.05)}>
          <DomainStrip
            domains={d.domains}
            selectedId={selectedDomain?.id ?? ''}
            onSelect={setSelectedDomainId}
          />
        </motion.div>
      )}

      {/* Main canvas — 4 vital traces (lg:col-span-8) + inspector (lg:col-span-4) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* TRACE CANVAS */}
        <motion.section
          {...fade(0.1)}
          className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface lg:col-span-8"
        >
          <div className="flex items-center justify-between border-b border-border-muted px-5 py-3">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Live provider vitals
              </h3>
              <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-border-muted bg-bg px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-text-dim">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                STREAMING
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
              <span>SWEEP 30s</span>
              <span>·</span>
              <span>ALARM &lt; {ALARM_THRESHOLD}%</span>
            </div>
          </div>

          {/* Stacked lane cards — gap-2 keeps them readably separated. */}
          <div className="space-y-2 p-4">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-muted py-16 text-center">
                <Stethoscope className="h-8 w-8 text-text-faint" />
                <div className="text-sm text-text-dim">
                  No providers connected — vitals trace idle.
                </div>
              </div>
            ) : (
              lanes.map((spec) => (
                <LaneCard key={spec.id} spec={spec} phase={phase} />
              ))
            )}
          </div>

          {/* Footer caption — feels like a real monitor's status bar */}
          <div className="flex items-center justify-between border-t border-border-muted px-5 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-faint">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                GMAIL
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent2" />
                OUTLOOK
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent4" />
                YAHOO
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-text/70" />
                AGGREGATE
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-3 w-3" />
              <span>SIGNAL OK</span>
            </div>
          </div>
        </motion.section>

        {/* INSPECTOR */}
        <motion.section
          {...fade(0.15)}
          className="lg:col-span-4"
        >
          <Inspector domain={selectedDomain} alerts={d.recentAlerts} />
        </motion.section>
      </div>

      {/* VITALS STRIP — 4 large LCD readouts */}
      <motion.section
        {...fade(0.2)}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <VitalsCard
          label="OVERALL"
          value={fmtScore(d.summary.overallScore)}
          sub={`7-DAY ${fmtDelta(d.summary.trend7dDelta)}`}
          tone={
            d.summary.overallScore >= 80
              ? 'accent'
              : d.summary.overallScore >= 65
                ? 'accent4'
                : 'accent3'
          }
          icon={HeartPulse}
          spark={overallSpark}
          unit="/ 100"
        />
        <VitalsCard
          label="BOUNCE %"
          value={d.summary.bouncePct24h.toFixed(1)}
          sub="LAST 24H · FLEET-WIDE"
          tone={
            d.summary.bouncePct24h <= 2
              ? 'accent'
              : d.summary.bouncePct24h <= 4
                ? 'accent4'
                : 'accent3'
          }
          icon={MailWarning}
          spark={bounceSpark}
          unit="%"
        />
        <VitalsCard
          label="SPAM %"
          value={d.summary.spamComplaintPct24h.toFixed(2)}
          sub="COMPLAINT RATE · 24H"
          tone={
            d.summary.spamComplaintPct24h <= 0.5
              ? 'accent'
              : d.summary.spamComplaintPct24h <= 1
                ? 'accent4'
                : 'accent3'
          }
          icon={ShieldX}
          spark={spamSpark}
          unit="%"
        />
        <VitalsCard
          label="SENDS"
          value={fmtInt(d.summary.totalSends24h)}
          sub="WARMUP DELIVERIES · 24H"
          tone="accent2"
          icon={Inbox}
          spark={sendsSpark}
        />
      </motion.section>

      {/* PROVIDER TILES + GLOBAL ALERT LOG */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.section
          {...fade(0.25)}
          className="overflow-hidden rounded-2xl border border-border-muted bg-surface lg:col-span-5"
        >
          <div className="flex items-center justify-between border-b border-border-muted px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <RadioTower className="h-3.5 w-3.5 text-accent2" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-dim">
                PROVIDER PLACEMENT · 24H
              </span>
            </div>
            <span className="font-mono text-[10px] text-text-faint">
              3 ROUTES
            </span>
          </div>
          {d.providers.length === 0 ? (
            <div className="p-6 text-center text-sm text-text-dim">
              No provider data yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-3">
              {d.providers.map((p) => (
                <ProviderTile
                  key={p.id}
                  provider={p}
                  tone={
                    p.id === 'p-gmail'
                      ? 'accent'
                      : p.id === 'p-outlook'
                        ? 'accent2'
                        : 'accent4'
                  }
                />
              ))}
            </div>
          )}
          {/* Reading aid — what good / warn / bad bands mean */}
          <div className="border-t border-border-muted px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              INBOX ≥ 80%
            </span>
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent4" />
              WATCH 70–79%
            </span>
            <span className="mx-2">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent3" />
              CRITICAL &lt; 70%
            </span>
          </div>
        </motion.section>

        <motion.section
          {...fade(0.3)}
          className="lg:col-span-7"
        >
          <AlertLog
            alerts={d.recentAlerts}
            domainsById={domainsById}
            onPickDomain={(id) => setSelectedDomainId(id)}
          />
        </motion.section>
      </div>
    </div>
  );
}
