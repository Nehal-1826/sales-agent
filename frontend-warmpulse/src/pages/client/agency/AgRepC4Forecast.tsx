import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Cloud,
  CloudFog,
  CloudLightning,
  Compass,
  Droplets,
  Eye,
  Flame,
  Gauge,
  Globe,
  Mail,
  ShieldCheck,
  Snowflake,
  Sun,
  Thermometer,
  Tornado,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { toast } from '@/components/ui/AppToast';
import { exportRowsToCsv, exportStamp, type CsvColumn } from '@/lib/exportCsv';

/**
 * AgRepC4Forecast — Agency-tier REPUTATION surface #4, "Weather Forecast".
 *
 * /app/reputation for Agency-tier operators. Their portfolio of sub-client
 * domains is rendered as a meteorological dashboard: each sub-client domain
 * becomes a WEATHER CARD whose icon + "temperature" + "humidity" + "wind"
 * fields encode reputation health, bounce %, and spam %.
 *
 * Mapping:
 *   - Sunny       (Sun)            healthy  (rep >= 80)
 *   - Partly      (Cloud + Sun)    warming  (60–79)
 *   - Stormy      (CloudLightning) at_risk  (< 60)
 *   - Foggy       (CloudFog)       inactive
 *
 * Stage anatomy (top → bottom):
 *   1. AGENCY BAROMETER — a half-dial gauge whose needle spring-animates to
 *      `summary.overallScore` and wobbles ±1° once settled. The chrome ring
 *      shows healthy / warming / at-risk arcs in token colors. A small
 *      pressure label ("Pressure rising" / "Pressure falling") reflects
 *      `trend7dDelta`. Beside it sit three KPI tiles (Total sends 24h,
 *      Bounce %, Spam %), each iconified as a weather metric.
 *   2. 7-DAY FORECAST STRIP — a horizontal lane of seven day-cards. Each
 *      shows a tiny weather icon + projected score number + a thin sparkline
 *      bar tinted by score band. Days fade-in left → right with a 100ms
 *      stagger; hover surfaces a precise tooltip.
 *   3. REGIONAL WEATHER STRIP — one card per provider (Gmail Tropical /
 *      Outlook Temperate / Yahoo Arctic). Climate iconography per provider
 *      and stats (Inbox / Spam / Blocked / 24h sends) as little "weather
 *      readings".
 *   4. WEATHER CARD GRID — the main board: one card per portfolio domain.
 *      Big animated weather icon, big temperature reading, humidity (bounce)
 *      + wind (spam), DNS auth pills, last incident chip. Storm cards have
 *      animated falling RAIN DROPS and a periodic thunder-flash. Hover lifts
 *      the card ±6px and scales the icon 1.1×.
 *   5. SEVERE-WEATHER ALERTS RAIL — right column: incidents as named
 *      WARNINGS (Tornado / Storm Watch / Flood Alert / Fog Advisory) mapped
 *      from AlertKind, with severity-pulsed badges. Each alert slides in
 *      from the right with an 80ms stagger; criticals pulse.
 *
 * Distinct from sibling Reputation candidates: this is a METEOROLOGY
 * dashboard. NOT a radar, NOT a hospital monitor, NOT a periodic table,
 * NOT a node-link graph. The visual metaphors are barometer dial + animated
 * cloud / sun / lightning iconography + rainfall.
 *
 * Fully STANDALONE — no network, router, query hooks, or required props.
 * Every value comes from the inline MOCK so the preview harness can mount
 * it prop-less. Renders only page content; the shell supplies sidebar /
 * chrome. Tailwind tokens only; no new colors; lucide-react icons only.
 */

// ---------------------------------------------------------------------------
// Data shapes — SHARED across all four Agency reputation variants
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
// SKELETON — empty-state mock for the harness
// ---------------------------------------------------------------------------

export const AGENCY_REPUTATION_SKELETON_C4: AgencyReputationData = {
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
// MOCK — Northwind Agency portfolio (matches brief)
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
      message: 'Failure rate climbed to 14.2% in the last hour.',
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
      message: 'Lyra warmup failed deliveries ticked above 4% threshold.',
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
// Helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => formatNumber(n);

const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

const scoreBand = (s: number): 'healthy' | 'warming' | 'at_risk' | 'inactive' => {
  if (s <= 0) return 'inactive';
  if (s >= 80) return 'healthy';
  if (s >= 60) return 'warming';
  return 'at_risk';
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

const TONE_BORDER = {
  healthy: 'border-accent/35',
  warming: 'border-accent4/35',
  at_risk: 'border-accent3/35',
  inactive: 'border-border-muted',
} as const;

const TONE_RING = {
  healthy: 'ring-accent/30',
  warming: 'ring-accent4/30',
  at_risk: 'ring-accent3/30',
  inactive: 'ring-border-muted',
} as const;

const TONE_DOT = {
  healthy: 'bg-accent',
  warming: 'bg-accent4',
  at_risk: 'bg-accent3',
  inactive: 'bg-text-faint',
} as const;

const STATUS_LABEL: Record<DomainStatus, string> = {
  healthy: 'Sunny',
  warming: 'Partly cloudy',
  at_risk: 'Stormy',
};

const STATUS_DESC: Record<DomainStatus, string> = {
  healthy: 'Clear skies, full inbox delivery.',
  warming: 'Mixed conditions, watch the wind.',
  at_risk: 'Storm cell, mitigations advised.',
};

// Map AlertKind → meteorological warning name
const ALERT_LABEL: Record<AlertKind, string> = {
  bounce_spike: 'Tornado Warning',
  spam_complaint: 'Storm Watch',
  dns_break: 'Fog Advisory',
  peer_failed: 'Flood Alert',
};

const ALERT_DESC: Record<AlertKind, string> = {
  bounce_spike: 'Sudden failed-delivery vortex',
  spam_complaint: 'Convective spam cell',
  dns_break: 'Authentication fogbank',
  peer_failed: 'Helper reservoir overflow',
};

const ALERT_ICON: Record<AlertKind, typeof Tornado> = {
  bounce_spike: Tornado,
  spam_complaint: CloudLightning,
  dns_break: CloudFog,
  peer_failed: Waves,
};

// Map provider id → climate metaphor + icon
const PROVIDER_CLIMATE: Record<string, { label: string; icon: typeof Sun; hint: string }> = {
  gmail: { label: 'Tropical', icon: Sun, hint: 'Warm and stable' },
  outlook: { label: 'Temperate', icon: Cloud, hint: 'Mild with occasional fronts' },
  yahoo: { label: 'Arctic', icon: Snowflake, hint: 'Cool, low traffic, careful winds' },
};

// ---------------------------------------------------------------------------
// 7-DAY FORECAST extrapolation
// ---------------------------------------------------------------------------

interface ForecastDay {
  dayLabel: string;
  score: number;
  band: 'healthy' | 'warming' | 'at_risk' | 'inactive';
  icon: 'sun' | 'partly' | 'storm' | 'fog';
}

const DAY_LABELS: string[] = ['Today', 'Tomorrow', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function bandToIcon(band: ReturnType<typeof scoreBand>): ForecastDay['icon'] {
  if (band === 'healthy') return 'sun';
  if (band === 'warming') return 'partly';
  if (band === 'at_risk') return 'storm';
  return 'fog';
}

function buildForecast(domains: AgencyReputationData['domains']): ForecastDay[] {
  // Average each day position across all domain last7dScores, then extrapolate
  // a smooth 7-day forecast lane that drifts with `trend7dDelta`.
  if (domains.length === 0) {
    return DAY_LABELS.map((label) => ({
      dayLabel: label,
      score: 0,
      band: 'inactive' as const,
      icon: 'fog' as const,
    }));
  }
  const days = 7;
  const avgs: number[] = Array.from({ length: days }, (_, idx) => {
    let total = 0;
    let count = 0;
    for (const d of domains) {
      const arr = d.last7dScores;
      if (arr.length === 0) continue;
      const v = arr[Math.min(idx, arr.length - 1)];
      if (typeof v === 'number') {
        total += v;
        count += 1;
      }
    }
    return count > 0 ? total / count : 0;
  });
  const last = avgs[avgs.length - 1] ?? 0;
  const first = avgs[0] ?? 0;
  const slope = (last - first) / Math.max(1, days - 1);
  // Project forward by reusing the slope but with light gentle drift
  return Array.from({ length: days }, (_, i) => {
    const projected = clamp(last + slope * (i + 1) + Math.sin(i * 0.7) * 1.1, 0, 100);
    const score = Math.round(projected);
    const band = scoreBand(score);
    return {
      dayLabel: DAY_LABELS[i] ?? `+${i}`,
      score,
      band,
      icon: bandToIcon(band),
    };
  });
}

// ---------------------------------------------------------------------------
// Animated weather icons — reusable visual primitives
// ---------------------------------------------------------------------------

interface WeatherIconProps {
  status: DomainStatus | 'inactive';
  size?: number;
  className?: string;
}

function SunnyIcon({ size = 64, className }: { size?: number; className?: string }): JSX.Element {
  // Sun with slowly rotating rays. Token color: accent4 (warm yellow).
  return (
    <motion.div
      className={`relative ${className ?? ''}`}
      style={{ width: size, height: size }}
      animate={{ rotate: 360 }}
      transition={{ duration: 22, ease: 'linear', repeat: Infinity }}
    >
      <Sun
        size={size}
        className="text-accent4"
        strokeWidth={1.4}
        absoluteStrokeWidth
      />
    </motion.div>
  );
}

function PartlyIcon({ size = 64, className }: { size?: number; className?: string }): JSX.Element {
  // Cloud drifting horizontally in front of a static sun glow.
  return (
    <div
      className={`relative ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute"
        style={{ top: size * 0.05, right: size * 0.05 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
      >
        <Sun size={size * 0.65} className="text-accent4/70" strokeWidth={1.4} />
      </motion.div>
      <motion.div
        className="absolute"
        style={{ top: size * 0.32, left: 0 }}
        animate={{ x: [0, size * 0.18, 0] }}
        transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
      >
        <Cloud size={size * 0.78} className="text-text-dim" strokeWidth={1.4} />
      </motion.div>
    </div>
  );
}

function StormyIcon({ size = 64, className }: { size?: number; className?: string }): JSX.Element {
  // Dark cloud + periodic lightning flash glow.
  return (
    <div
      className={`relative ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: '0 0 30px 4px rgba(255, 213, 79, 0.45)',
          opacity: 0,
        }}
        animate={{ opacity: [0, 0.9, 0, 0, 0, 0] }}
        transition={{ duration: 3.6, ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.div
        className="absolute"
        style={{ top: size * 0.1, left: size * 0.08 }}
        animate={{ x: [0, size * 0.06, 0, -size * 0.04, 0] }}
        transition={{ duration: 5, ease: 'easeInOut', repeat: Infinity }}
      >
        <CloudLightning size={size * 0.86} className="text-accent3" strokeWidth={1.4} />
      </motion.div>
    </div>
  );
}

function FoggyIcon({ size = 64, className }: { size?: number; className?: string }): JSX.Element {
  return (
    <div
      className={`relative ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 4.6, ease: 'easeInOut', repeat: Infinity }}
      >
        <CloudFog size={size * 0.82} className="text-text-dim" strokeWidth={1.4} />
      </motion.div>
    </div>
  );
}

function WeatherIcon({ status, size = 64, className }: WeatherIconProps): JSX.Element {
  if (status === 'healthy') return <SunnyIcon size={size} className={className} />;
  if (status === 'warming') return <PartlyIcon size={size} className={className} />;
  if (status === 'at_risk') return <StormyIcon size={size} className={className} />;
  return <FoggyIcon size={size} className={className} />;
}

// ---------------------------------------------------------------------------
// Rainfall overlay — fixed-grid descending raindrops with stagger
// ---------------------------------------------------------------------------

interface RainfallProps {
  active: boolean;
  density?: number;
}

function Rainfall({ active, density = 14 }: RainfallProps): JSX.Element | null {
  // We render even when inactive to keep DOM stable on hover; opacity toggles.
  const drops = useMemo(() => {
    return Array.from({ length: density }, (_, i) => {
      const left = (i / density) * 100 + ((i * 37) % 11) * 0.6;
      const delay = (i * 0.13) % 1.8;
      const duration = 1.1 + ((i * 7) % 9) * 0.05;
      return { left, delay, duration, id: i };
    });
  }, [density]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      style={{ opacity: active ? 1 : 0, transition: 'opacity 240ms ease' }}
    >
      {drops.map((d) => (
        <motion.span
          key={d.id}
          className="absolute h-3 w-px bg-accent3/55"
          style={{ left: `${d.left}%`, top: '-10%' }}
          animate={{ y: ['0%', '120%'] }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barometer — animated half-dial gauge with spring needle + ±1° wobble
// ---------------------------------------------------------------------------

interface BarometerProps {
  value: number;
  trendDelta: number;
}

function Barometer({ value, trendDelta }: BarometerProps): JSX.Element {
  // The dial sweeps from -110° (low) → +110° (high), so a value of 50 sits at 0°.
  // We compute the resting angle, then add a tiny continuous wobble.
  const target = ((clamp(value, 0, 100) - 50) / 50) * 110;
  const angle = useMotionValue(-110);
  const spring = useSpring(angle, { stiffness: 60, damping: 14, mass: 1 });
  const [wobble, setWobble] = useState(0);

  useEffect(() => {
    angle.set(target);
  }, [target, angle]);

  useEffect(() => {
    let mounted = true;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      if (!mounted) return;
      const t = (performance.now() - start) / 1000;
      setWobble(Math.sin(t * 0.8) * 1.0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const rising = trendDelta > 0;
  const falling = trendDelta < 0;
  const pressureLabel = rising
    ? 'Pressure rising'
    : falling
      ? 'Pressure falling'
      : 'Pressure steady';

  return (
    <div className="relative flex w-full max-w-xs flex-col items-center">
      <svg viewBox="0 0 220 140" className="w-full" role="img" aria-label="Agency barometer">
        {/* Outer ring shadow */}
        <defs>
          <linearGradient id="dial-track" x1="0" x2="1">
            <stop offset="0" stopColor="rgba(255,107,74,0.6)" />
            <stop offset="0.4" stopColor="rgba(255,213,79,0.65)" />
            <stop offset="1" stopColor="rgba(242, 101, 34,0.75)" />
          </linearGradient>
        </defs>
        {/* Background half-disc */}
        <path
          d="M20 120 A90 90 0 0 1 200 120"
          fill="none"
          stroke="rgb(42,42,58)"
          strokeWidth={18}
          strokeLinecap="round"
        />
        {/* Gradient arc */}
        <path
          d="M20 120 A90 90 0 0 1 200 120"
          fill="none"
          stroke="url(#dial-track)"
          strokeWidth={12}
          strokeLinecap="round"
          opacity={0.85}
        />
        {/* Tick marks */}
        {Array.from({ length: 11 }, (_, i) => {
          const a = (-110 + (i * 220) / 10) * (Math.PI / 180);
          const inner = 70;
          const outer = 84;
          const cx = 110 + Math.sin(a) * inner;
          const cy = 120 - Math.cos(a) * inner;
          const ex = 110 + Math.sin(a) * outer;
          const ey = 120 - Math.cos(a) * outer;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={ex}
              y2={ey}
              stroke="rgb(120,120,140)"
              strokeWidth={i % 5 === 0 ? 2 : 1}
            />
          );
        })}
        {/* Center hub */}
        <circle cx={110} cy={120} r={6} fill="rgb(120,120,140)" />
        {/* Animated needle */}
        <motion.line
          x1={110}
          y1={120}
          x2={110}
          y2={42}
          stroke="rgb(242, 101, 34)"
          strokeWidth={3}
          strokeLinecap="round"
          style={{
            originX: '110px',
            originY: '120px',
            rotate: spring,
          }}
        />
        {/* Wobble overlay — translucent ghost line */}
        <line
          x1={110}
          y1={120}
          x2={110 + Math.sin((target + wobble) * (Math.PI / 180)) * 78}
          y2={120 - Math.cos((target + wobble) * (Math.PI / 180)) * 78}
          stroke="rgba(242, 101, 34,0.18)"
          strokeWidth={6}
          strokeLinecap="round"
        />
      </svg>
      <div className="-mt-6 flex flex-col items-center">
        <div className="font-mono text-4xl font-semibold text-text">
          {Math.round(value)}
          <span className="text-base text-text-dim">°</span>
        </div>
        <div className="mt-0.5 text-[11px] uppercase tracking-wider text-text-dim">
          {pressureLabel}
        </div>
        <div
          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
            rising ? 'bg-accent/15 text-accent' : falling ? 'bg-accent3/15 text-accent3' : 'bg-surface-2 text-text-dim'
          }`}
        >
          {rising ? (
            <ArrowUp size={11} strokeWidth={2.2} />
          ) : falling ? (
            <ArrowDown size={11} strokeWidth={2.2} />
          ) : (
            <Activity size={11} strokeWidth={2.2} />
          )}
          {trendDelta > 0 ? '+' : ''}
          {trendDelta.toFixed(1)} pts / 7d
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forecast Day Cell
// ---------------------------------------------------------------------------

interface ForecastDayCellProps {
  day: ForecastDay;
  index: number;
}

function ForecastDayCell({ day, index }: ForecastDayCellProps): JSX.Element {
  const tone = day.band;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.1, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className={`group relative flex min-w-[112px] flex-col items-center gap-1 rounded-2xl border ${TONE_BORDER[tone]} ${TONE_BG[tone]} px-3 py-3`}
      title={`${day.dayLabel}: forecast ${day.score}° (${STATUS_LABEL[(tone === 'inactive' ? 'warming' : tone) as DomainStatus]})`}
    >
      <div className="text-[11px] uppercase tracking-wider text-text-dim">{day.dayLabel}</div>
      <div className="my-1">
        {day.icon === 'sun' ? (
          <SunnyIcon size={28} />
        ) : day.icon === 'partly' ? (
          <PartlyIcon size={28} />
        ) : day.icon === 'storm' ? (
          <StormyIcon size={28} />
        ) : (
          <FoggyIcon size={28} />
        )}
      </div>
      <div className={`font-mono text-lg font-semibold ${TONE_TEXT[tone]}`}>
        {day.score}
        <span className="text-xs text-text-dim">°</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className={`h-full ${
            tone === 'healthy'
              ? 'bg-accent'
              : tone === 'warming'
                ? 'bg-accent4'
                : tone === 'at_risk'
                  ? 'bg-accent3'
                  : 'bg-text-faint'
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${clamp(day.score, 0, 100)}%` }}
          transition={{ duration: 0.6, delay: index * 0.1 + 0.15, ease: 'easeOut' }}
        />
      </div>
      {/* Hover tooltip pop */}
      <div className="pointer-events-none absolute -bottom-1 translate-y-full whitespace-nowrap rounded-lg border border-border-muted bg-surface px-2 py-1 text-[10px] text-text-dim opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        Projected {day.score}/100
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// KPI Tile (used near barometer + summary chips)
// ---------------------------------------------------------------------------

interface WeatherKpiProps {
  label: string;
  value: string;
  Icon: typeof Thermometer;
  hint?: string;
  tone?: 'healthy' | 'warming' | 'at_risk' | 'inactive';
}

function WeatherKpi({ label, value, Icon, hint, tone = 'healthy' }: WeatherKpiProps): JSX.Element {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-border-muted bg-surface px-4 py-3`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${TONE_BG[tone]}`}>
        <Icon size={18} className={TONE_TEXT[tone]} strokeWidth={1.8} />
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="text-[11px] uppercase tracking-wider text-text-dim">{label}</div>
        <div className="font-mono text-lg font-semibold text-text">{value}</div>
        {hint != null ? <div className="text-[11px] text-text-faint">{hint}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider Strip Card
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  p: AgencyReputationData['providers'][number];
  index: number;
}

function ProviderCard({ p, index }: ProviderCardProps): JSX.Element {
  const climate = PROVIDER_CLIMATE[p.id] ?? { label: 'Region', icon: Compass, hint: '' };
  const Icon = climate.icon;
  const tone: 'healthy' | 'warming' | 'at_risk' =
    p.inboxPct >= 92 ? 'healthy' : p.inboxPct >= 85 ? 'warming' : 'at_risk';
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, delay: 0.05 + index * 0.07, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="flex-1 rounded-2xl border border-border-muted bg-surface p-4"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${TONE_BG[tone]} ${TONE_BORDER[tone]} border`}
          >
            <Icon size={22} className={TONE_TEXT[tone]} strokeWidth={1.6} />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">
              {p.label} <span className="text-text-faint">·</span>{' '}
              <span className="text-text-dim">{climate.label}</span>
            </div>
            <div className="text-[11px] text-text-faint">{climate.hint}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
        >
          {tone === 'healthy' ? 'Clear' : tone === 'warming' ? 'Hazy' : 'Stormy'}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border border-border-muted bg-surface-2 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Inbox</div>
          <div className="font-mono text-sm font-semibold text-accent">
            {fmtPct(p.inboxPct)}
          </div>
        </div>
        <div className="rounded-xl border border-border-muted bg-surface-2 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Spam</div>
          <div className="font-mono text-sm font-semibold text-accent4">
            {fmtPct(p.spamPct)}
          </div>
        </div>
        <div className="rounded-xl border border-border-muted bg-surface-2 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">Blocked</div>
          <div className="font-mono text-sm font-semibold text-accent3">
            {fmtPct(p.blockedPct)}
          </div>
        </div>
        <div className="rounded-xl border border-border-muted bg-surface-2 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-faint">24h</div>
          <div className="font-mono text-sm font-semibold text-text">
            {fmtInt(p.last24hSends)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DNS Auth Pill (used inside each domain card)
// ---------------------------------------------------------------------------

interface DnsPillProps {
  label: string;
  ok: boolean;
}

function DnsPill({ label, ok }: DnsPillProps): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        ok ? 'bg-accent/15 text-accent' : 'bg-accent3/15 text-accent3'
      }`}
    >
      <span className={`inline-block h-1 w-1 rounded-full ${ok ? 'bg-accent' : 'bg-accent3'}`} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Domain Weather Card — the centerpiece of the grid
// ---------------------------------------------------------------------------

interface DomainCardProps {
  d: AgencyReputationData['domains'][number];
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

function DomainCard({ d, index, selected, onSelect }: DomainCardProps): JSX.Element {
  const tone = d.status;
  const isStorm = tone === 'at_risk';
  const isPartly = tone === 'warming';
  const isSunny = tone === 'healthy';

  const last7Last = d.last7dScores[d.last7dScores.length - 1] ?? d.reputationScore;
  const last7First = d.last7dScores[0] ?? d.reputationScore;
  const delta7 = last7Last - last7First;
  const incidentKind = d.lastIncidentKind;
  const IncidentIcon = incidentKind != null ? ALERT_ICON[incidentKind] : null;

  // Hover flag toggles the rain density + icon scale.
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(d.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 + index * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -6 }}
      className={`group relative overflow-hidden rounded-2xl border bg-surface text-left transition-shadow ${
        selected
          ? `${TONE_BORDER[tone]} ring-2 ${TONE_RING[tone]} shadow-xl`
          : 'border-border-muted shadow-sm hover:shadow-lg'
      }`}
      aria-pressed={selected}
      aria-label={`Weather card for ${d.subClientName} ${d.domain}: ${STATUS_LABEL[tone]}`}
    >
      {/* Storm rain layer */}
      {isStorm ? <Rainfall active={true} density={hovered ? 22 : 14} /> : null}

      {/* Background hue wash */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${
          isSunny
            ? 'bg-gradient-to-br from-accent4/10 via-transparent to-transparent'
            : isPartly
              ? 'bg-gradient-to-br from-accent4/10 via-transparent to-text-dim/5'
              : isStorm
                ? 'bg-gradient-to-br from-accent3/15 via-transparent to-text-dim/10'
                : ''
        }`}
      />

      <div className="relative z-10 p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Globe size={12} className="text-text-faint" strokeWidth={2} />
              <div className="truncate text-[12px] font-semibold text-text">
                {d.domain}
              </div>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-text-dim">
              {d.subClientName}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}
          >
            {STATUS_LABEL[tone]}
          </span>
        </div>

        {/* Icon + temperature */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <motion.div
            animate={{ scale: hovered ? 1.1 : 1 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
          >
            <WeatherIcon status={tone} size={68} />
          </motion.div>
          <div className="text-right">
            <div className={`font-mono text-4xl font-semibold leading-none ${TONE_TEXT[tone]}`}>
              {d.reputationScore}
              <span className="text-lg text-text-dim">°</span>
            </div>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-text-dim">
              {delta7 >= 0 ? (
                <ArrowUp size={10} strokeWidth={2.2} className="text-accent" />
              ) : (
                <ArrowDown size={10} strokeWidth={2.2} className="text-accent3" />
              )}
              {delta7 >= 0 ? '+' : ''}
              {delta7} / 7d
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mt-3 text-[11px] text-text-dim">{STATUS_DESC[tone]}</div>

        {/* Weather metrics — "humidity" + "wind" */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border-muted bg-surface-2 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
              <Droplets size={10} strokeWidth={2} />
              Humidity
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <div className="font-mono text-sm font-semibold text-text">
                {fmtPct(100 - d.inboxRatePct - d.spamFolderPct, 1)}
              </div>
              <div className="text-[10px] text-text-faint">failed</div>
            </div>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
              <Wind size={10} strokeWidth={2} />
              Wind
            </div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <div className="font-mono text-sm font-semibold text-text">
                {fmtPct(d.spamFolderPct, 1)}
              </div>
              <div className="text-[10px] text-text-faint">spam</div>
            </div>
          </div>
        </div>

        {/* Inbox visibility + mailboxes */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border-muted bg-surface-2 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
              <Eye size={10} strokeWidth={2} />
              Visibility
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-accent">
              {fmtPct(d.inboxRatePct, 1)}
            </div>
          </div>
          <div className="rounded-xl border border-border-muted bg-surface-2 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-text-faint">
              <Mail size={10} strokeWidth={2} />
              Stations
            </div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-text">
              {d.mailboxCount}
            </div>
          </div>
        </div>

        {/* DNS pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <DnsPill label="SPF" ok={d.spfPass} />
          <DnsPill label="DKIM" ok={d.dkimPass} />
          <DnsPill label="DMARC" ok={d.dmarcPass} />
        </div>

        {/* Incident chip */}
        {d.lastIncidentAgo != null && incidentKind != null && IncidentIcon != null ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2 px-2.5 py-2">
            <IncidentIcon size={14} className={TONE_TEXT[tone]} strokeWidth={1.8} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="truncate text-[11px] font-medium text-text">
                {ALERT_LABEL[incidentKind]}
              </div>
              <div className="text-[10px] text-text-faint">
                {ALERT_DESC[incidentKind]} · {d.lastIncidentAgo}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2 px-2.5 py-2">
            <ShieldCheck size={14} className="text-accent" strokeWidth={1.8} />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="truncate text-[11px] font-medium text-text">No advisories</div>
              <div className="text-[10px] text-text-faint">Clear skies last 7 days</div>
            </div>
          </div>
        )}
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Severe-Weather Alerts rail
// ---------------------------------------------------------------------------

interface AlertItemProps {
  alert: AgencyReputationData['recentAlerts'][number];
  index: number;
}

function AlertItem({ alert, index }: AlertItemProps): JSX.Element {
  const Icon = ALERT_ICON[alert.kind];
  const tone: 'warming' | 'at_risk' = alert.severity === 'critical' ? 'at_risk' : 'warming';
  const isCritical = alert.severity === 'critical';
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.36, delay: index * 0.08, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-2xl border ${TONE_BORDER[tone]} ${TONE_BG[tone]} p-3`}
    >
      {/* Pulse aura for critical alerts */}
      {isCritical ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ boxShadow: '0 0 0 0 rgba(255,107,74,0.55)' }}
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(255,107,74,0.45)',
              '0 0 0 8px rgba(255,107,74,0)',
              '0 0 0 0 rgba(255,107,74,0)',
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        />
      ) : null}
      <div className="relative flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE_BG[tone]} ${TONE_BORDER[tone]} border`}
        >
          <Icon size={18} className={TONE_TEXT[tone]} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={`text-[11px] font-bold uppercase tracking-wider ${TONE_TEXT[tone]}`}>
              {ALERT_LABEL[alert.kind]}
            </div>
            {isCritical ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent3/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent3">
                <Zap size={9} strokeWidth={2.4} />
                Critical
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent4/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-accent4">
                Watch
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[11px] font-medium text-text">
            <Globe size={10} strokeWidth={2} className="mr-1 inline -translate-y-px text-text-faint" />
            {alert.domain}
          </div>
          <div className="mt-1 text-[11px] leading-snug text-text-dim">{alert.message}</div>
          <div className="mt-2 text-[10px] uppercase tracking-wider text-text-faint">
            {alert.ago}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Selected-domain inspector strip (shown below the grid when one is picked)
// ---------------------------------------------------------------------------

interface InspectorProps {
  d: AgencyReputationData['domains'][number] | null;
  onClose: () => void;
}

function Inspector({ d, onClose }: InspectorProps): JSX.Element {
  return (
    <AnimatePresence mode="wait">
      {d != null ? (
        <motion.div
          key={d.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="rounded-2xl border border-border-muted bg-surface p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <WeatherIcon status={d.status} size={72} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold text-text">{d.domain}</div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONE_BG[d.status]} ${TONE_TEXT[d.status]}`}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-text-dim">{d.subClientName}</div>
                <div className="mt-2 max-w-md text-[12px] text-text-dim">
                  {STATUS_DESC[d.status]}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-[11px] uppercase tracking-wider text-text-dim hover:text-text"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border-muted bg-surface-2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-faint">Temperature</div>
              <div className={`font-mono text-xl font-semibold ${TONE_TEXT[d.status]}`}>
                {d.reputationScore}
                <span className="text-base text-text-dim">°</span>
              </div>
            </div>
            <div className="rounded-xl border border-border-muted bg-surface-2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-faint">Visibility</div>
              <div className="font-mono text-xl font-semibold text-accent">
                {fmtPct(d.inboxRatePct, 1)}
              </div>
            </div>
            <div className="rounded-xl border border-border-muted bg-surface-2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-faint">Spam wind</div>
              <div className="font-mono text-xl font-semibold text-accent4">
                {fmtPct(d.spamFolderPct, 1)}
              </div>
            </div>
            <div className="rounded-xl border border-border-muted bg-surface-2 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-faint">Stations</div>
              <div className="font-mono text-xl font-semibold text-text">{d.mailboxCount}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DnsPill label="SPF" ok={d.spfPass} />
            <DnsPill label="DKIM" ok={d.dkimPass} />
            <DnsPill label="DMARC" ok={d.dmarcPass} />
          </div>
          <div className="mt-4 grid grid-cols-7 gap-2">
            {d.last7dScores.map((s, i) => {
              const band = scoreBand(s);
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className={`text-[10px] uppercase tracking-wider ${TONE_TEXT[band]}`}>
                    D{i + 1}
                  </div>
                  <div className="h-16 w-full overflow-hidden rounded-md border border-border-muted bg-surface">
                    <motion.div
                      className={`mt-auto h-full origin-bottom ${
                        band === 'healthy'
                          ? 'bg-accent'
                          : band === 'warming'
                            ? 'bg-accent4'
                            : 'bg-accent3'
                      }`}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: s / 100 }}
                      transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                    />
                  </div>
                  <div className={`font-mono text-xs ${TONE_TEXT[band]}`}>{s}</div>
                </div>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Almanac strip — climatology row: each domain as a wind-rose tile
// ---------------------------------------------------------------------------

interface AlmanacTileProps {
  d: AgencyReputationData['domains'][number];
  index: number;
  active: boolean;
  onSelect: (id: string) => void;
}

function AlmanacTile({ d, index, active, onSelect }: AlmanacTileProps): JSX.Element {
  // Tiny radial "wind rose" of last7dScores: each segment fans outward sized
  // to the score, tinted by band. Lightweight SVG, no chart library.
  const segments = 7;
  const radius = 22;
  const tone = d.status;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(d.id)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: 0.04 + index * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className={`flex w-[140px] shrink-0 flex-col items-center gap-2 rounded-2xl border bg-surface px-3 py-3 text-left transition-shadow ${
        active
          ? `${TONE_BORDER[tone]} shadow-lg ring-1 ${TONE_RING[tone]}`
          : 'border-border-muted hover:shadow-md'
      }`}
      aria-label={`Almanac tile for ${d.domain}`}
    >
      <div className="self-start text-[10px] uppercase tracking-wider text-text-faint">
        Almanac
      </div>
      <svg viewBox="0 0 60 60" className="w-16">
        <circle cx={30} cy={30} r={radius} fill="none" stroke="rgb(42,42,58)" strokeWidth={1} />
        <circle cx={30} cy={30} r={radius * 0.66} fill="none" stroke="rgb(42,42,58)" strokeWidth={0.5} />
        <circle cx={30} cy={30} r={radius * 0.33} fill="none" stroke="rgb(42,42,58)" strokeWidth={0.5} />
        {d.last7dScores.map((s, i) => {
          const a = (i / segments) * Math.PI * 2 - Math.PI / 2;
          const len = (clamp(s, 0, 100) / 100) * radius;
          const x = 30 + Math.cos(a) * len;
          const y = 30 + Math.sin(a) * len;
          const band = scoreBand(s);
          const stroke =
            band === 'healthy'
              ? 'rgb(242, 101, 34)'
              : band === 'warming'
                ? 'rgb(255,213,79)'
                : 'rgb(255,107,74)';
          return (
            <motion.line
              key={i}
              x1={30}
              y1={30}
              x2={x}
              y2={y}
              stroke={stroke}
              strokeWidth={2.4}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.04, ease: 'easeOut' }}
            />
          );
        })}
        <circle cx={30} cy={30} r={2.2} fill="rgb(120,120,140)" />
      </svg>
      <div className="w-full truncate text-center text-[11px] font-medium text-text">
        {d.subClientName}
      </div>
      <div className={`font-mono text-sm font-semibold ${TONE_TEXT[tone]}`}>
        {d.reputationScore}
        <span className="text-[10px] text-text-dim">°</span>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Pressure key — legend strip with reference temperature bands
// ---------------------------------------------------------------------------

interface PressureBand {
  label: string;
  range: string;
  description: string;
  tone: 'healthy' | 'warming' | 'at_risk' | 'inactive';
  Icon: typeof Sun;
}

const PRESSURE_KEY: PressureBand[] = [
  {
    label: 'High pressure',
    range: '80–100',
    description: 'Clear skies, mostly inbox',
    tone: 'healthy',
    Icon: Sun,
  },
  {
    label: 'Mixed pressure',
    range: '60–79',
    description: 'Watch wind, monitor sending pace',
    tone: 'warming',
    Icon: Cloud,
  },
  {
    label: 'Low pressure',
    range: '< 60',
    description: 'Storm risk, slow down and review',
    tone: 'at_risk',
    Icon: CloudLightning,
  },
  {
    label: 'Calm zone',
    range: 'inactive',
    description: 'No signal, awaiting traffic',
    tone: 'inactive',
    Icon: CloudFog,
  },
];

function PressureLegend(): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PRESSURE_KEY.map((band, i) => (
        <motion.div
          key={band.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.06, ease: 'easeOut' }}
          className={`flex items-start gap-2 rounded-2xl border ${TONE_BORDER[band.tone]} ${TONE_BG[band.tone]} px-3 py-2`}
        >
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface`}>
            <band.Icon size={14} className={TONE_TEXT[band.tone]} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className={`text-[11px] font-semibold ${TONE_TEXT[band.tone]}`}>
                {band.label}
              </span>
              <span className="font-mono text-[10px] text-text-faint">{band.range}</span>
            </div>
            <div className="text-[10px] text-text-dim leading-snug">{band.description}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Advisory ribbon — bottom-of-page summary marquee
// ---------------------------------------------------------------------------

interface AdvisoryItem {
  id: string;
  text: string;
  icon: typeof Sun;
  tone: 'healthy' | 'warming' | 'at_risk' | 'inactive';
}

function buildAdvisories(
  summary: AgencyReputationData['summary'],
  alertCount: number,
): AdvisoryItem[] {
  const out: AdvisoryItem[] = [];
  out.push({
    id: 'a-sends',
    text: `${fmtInt(summary.totalSends24h)} sends in last 24h`,
    icon: Mail,
    tone: 'healthy',
  });
  out.push({
    id: 'a-pressure',
    text: `Pressure ${summary.trend7dDelta >= 0 ? 'rising' : 'falling'} ${Math.abs(
      summary.trend7dDelta,
    ).toFixed(1)} pts / 7d`,
    icon: summary.trend7dDelta >= 0 ? ArrowUp : ArrowDown,
    tone: summary.trend7dDelta >= 0 ? 'healthy' : 'at_risk',
  });
  out.push({
    id: 'a-bounce',
    text: `Failed-delivery humidity at ${fmtPct(summary.bouncePct24h, 1)}`,
    icon: Droplets,
    tone:
      summary.bouncePct24h > 4
        ? 'at_risk'
        : summary.bouncePct24h > 2
          ? 'warming'
          : 'healthy',
  });
  out.push({
    id: 'a-spam',
    text: `Spam wind at ${fmtPct(summary.spamComplaintPct24h, 2)}`,
    icon: Wind,
    tone:
      summary.spamComplaintPct24h > 1
        ? 'at_risk'
        : summary.spamComplaintPct24h > 0.3
          ? 'warming'
          : 'healthy',
  });
  if (alertCount > 0) {
    out.push({
      id: 'a-alerts',
      text: `${alertCount} active advisor${alertCount === 1 ? 'y' : 'ies'}`,
      icon: AlertTriangle,
      tone: 'warming',
    });
  }
  return out;
}

function AdvisoryRibbon({ items }: { items: AdvisoryItem[] }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it, i) => (
        <motion.div
          key={it.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.32, delay: i * 0.06, ease: 'easeOut' }}
          className={`inline-flex items-center gap-1.5 rounded-full border ${TONE_BORDER[it.tone]} ${TONE_BG[it.tone]} px-2.5 py-1 text-[11px]`}
        >
          <it.icon size={11} className={TONE_TEXT[it.tone]} strokeWidth={2} />
          <span className="text-text">{it.text}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function AgRepC4Forecast({
  data,
}: { data?: AgencyReputationData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  const forecast = useMemo(() => buildForecast(d.domains), [d.domains]);

  const selectedDomain = useMemo(
    () => d.domains.find((dd) => dd.id === selectedDomainId) ?? null,
    [d.domains, selectedDomainId],
  );

  const counts = d.summary;
  const overallBand = scoreBand(counts.overallScore);

  const handleSelect = (id: string): void => {
    setSelectedDomainId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6 px-1 pb-12">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-faint">
            <Gauge size={12} strokeWidth={2} />
            <span>Sender trust forecast</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-text">
            {d.agency.name}{' '}
            <span className="text-text-faint">·</span>{' '}
            <span className="text-base font-normal text-text-dim">weather map</span>
          </h1>
          <p className="mt-1 text-sm text-text-dim">
            Live inbox-delivery weather across {d.domains.length} sub-client domains in{' '}
            {d.agency.region}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-dim">
            <Compass size={12} strokeWidth={2} />
            {d.agency.region}
          </div>
          <button
            type="button"
            onClick={() => {
              const columns: CsvColumn<AgencyReputationData['domains'][number]>[] = [
                { header: 'Domain', value: (r) => r.domain },
                { header: 'Sub-client', value: (r) => r.subClientName },
                { header: 'Trust score', value: (r) => r.reputationScore },
                { header: 'Status', value: (r) => r.status },
                { header: 'Inbox rate %', value: (r) => r.inboxRatePct },
                { header: 'Spam folder %', value: (r) => r.spamFolderPct },
                { header: 'Mailboxes', value: (r) => r.mailboxCount },
                { header: 'SPF', value: (r) => (r.spfPass ? 'pass' : 'fail') },
                { header: 'DKIM', value: (r) => (r.dkimPass ? 'pass' : 'fail') },
                { header: 'DMARC', value: (r) => (r.dmarcPass ? 'pass' : 'fail') },
                { header: 'Last incident', value: (r) => r.lastIncidentAgo ?? 'none' },
              ];
              const count = exportRowsToCsv(
                `reputation-forecast-${exportStamp()}`,
                d.domains,
                columns,
              );
              toast.success(`Exported ${count} domain${count === 1 ? '' : 's'}`);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-bg hover:opacity-90"
          >
            <ArrowUpRight size={12} strokeWidth={2.4} />
            Forecast report
          </button>
        </div>
      </div>

      {/* Barometer + KPIs */}
      <section className="rounded-3xl border border-border-muted bg-surface p-5">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <div className="flex flex-col items-center justify-center">
            <div className="text-[11px] uppercase tracking-wider text-text-dim">Agency barometer</div>
            <Barometer value={counts.overallScore} trendDelta={counts.trend7dDelta} />
            <div className="mt-3 flex items-center gap-2 text-[11px] text-text-dim">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[overallBand]}`} />
              {STATUS_LABEL[(overallBand === 'inactive' ? 'warming' : overallBand) as DomainStatus]} conditions across portfolio
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <WeatherKpi
              label="Total sends 24h"
              value={fmtInt(counts.totalSends24h)}
              Icon={Mail}
              tone="healthy"
              hint="Across all stations"
            />
            <WeatherKpi
              label="Failed-delivery humidity"
              value={fmtPct(counts.bouncePct24h, 1)}
              Icon={Droplets}
              tone={counts.bouncePct24h > 4 ? 'at_risk' : counts.bouncePct24h > 2 ? 'warming' : 'healthy'}
              hint="Failed-delivery ratio"
            />
            <WeatherKpi
              label="Spam wind"
              value={fmtPct(counts.spamComplaintPct24h, 2)}
              Icon={Wind}
              tone={counts.spamComplaintPct24h > 1 ? 'at_risk' : counts.spamComplaintPct24h > 0.3 ? 'warming' : 'healthy'}
              hint="Complaint speed"
            />
            <WeatherKpi
              label="Sunny domains"
              value={`${counts.domainsHealthy}`}
              Icon={Sun}
              tone="healthy"
            />
            <WeatherKpi
              label="Partly cloudy"
              value={`${counts.domainsWarming}`}
              Icon={Cloud}
              tone="warming"
            />
            <WeatherKpi
              label="Storm cells"
              value={`${counts.domainsAtRisk}`}
              Icon={CloudLightning}
              tone="at_risk"
            />
          </div>
        </div>
      </section>

      {/* 7-day forecast strip */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
            <Thermometer size={12} strokeWidth={2} />
            7-day forecast
          </div>
          <div className="text-[11px] text-text-faint">
            Projected sender-trust drift from 7-day domain trends
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {forecast.map((day, i) => (
              <ForecastDayCell key={`${day.dayLabel}-${i}`} day={day} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Regional climate / providers */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
          <Globe size={12} strokeWidth={2} />
          Regional climate
        </div>
        <div className="flex flex-col gap-3 lg:flex-row">
          {d.providers.map((p, i) => (
            <ProviderCard key={p.id} p={p} index={i} />
          ))}
          {d.providers.length === 0 ? (
            <div className="flex-1 rounded-2xl border border-dashed border-border-muted bg-surface-2 px-4 py-8 text-center text-[12px] text-text-faint">
              No provider data yet
            </div>
          ) : null}
        </div>
      </section>

      {/* Weather grid + alerts rail */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
              <Sun size={12} strokeWidth={2} />
              Portfolio weather
            </div>
            <div className="flex items-center gap-3 text-[11px] text-text-faint">
              <span className="inline-flex items-center gap-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT.healthy}`} />
                Sunny
              </span>
              <span className="inline-flex items-center gap-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT.warming}`} />
                Partly cloudy
              </span>
              <span className="inline-flex items-center gap-1">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT.at_risk}`} />
                Stormy
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {d.domains.map((dom, i) => (
              <DomainCard
                key={dom.id}
                d={dom}
                index={i}
                selected={selectedDomainId === dom.id}
                onSelect={handleSelect}
              />
            ))}
            {d.domains.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-border-muted bg-surface-2 px-4 py-12 text-center text-[12px] text-text-faint">
                Add a sub-client domain to start tracking the weather.
              </div>
            ) : null}
          </div>
        </div>
        <aside>
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
            <AlertTriangle size={12} strokeWidth={2} />
            Severe weather alerts
          </div>
          <div className="space-y-2">
            {d.recentAlerts.map((a, i) => (
              <AlertItem key={a.id} alert={a} index={i} />
            ))}
            {d.recentAlerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border-muted bg-surface-2 px-3 py-8 text-center text-[12px] text-text-faint">
                No advisories. Skies clear.
              </div>
            ) : null}
          </div>
          <div className="mt-3 rounded-2xl border border-border-muted bg-surface p-3 text-[11px] text-text-dim">
            <div className="flex items-center gap-2 text-text">
              <Flame size={12} className="text-accent3" strokeWidth={2} />
              <span className="font-semibold">Heat index</span>
            </div>
            <p className="mt-1 leading-snug">
              {d.summary.domainsAtRisk > 0
                ? `${d.summary.domainsAtRisk} storm cell${
                    d.summary.domainsAtRisk === 1 ? '' : 's'
                  } in your portfolio — open the warning to triage.`
                : 'No active storm cells. Continue normal pace.'}
            </p>
          </div>
        </aside>
      </section>

      {/* Inspector — visible once a card is picked */}
      <Inspector d={selectedDomain} onClose={() => setSelectedDomainId(null)} />

      {/* Almanac — wind-rose strip across all domains, scrolls horizontally */}
      {d.domains.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
              <Compass size={12} strokeWidth={2} />
              Domain almanac
            </div>
            <div className="text-[11px] text-text-faint">
              7-day wind rose · click to focus a domain
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2">
              {d.domains.map((dom, i) => (
                <AlmanacTile
                  key={dom.id}
                  d={dom}
                  index={i}
                  active={selectedDomainId === dom.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Pressure legend */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
            <Gauge size={12} strokeWidth={2} />
            Pressure key
          </div>
          <div className="text-[11px] text-text-faint">
            Reference bands used by the barometer + forecast strip
          </div>
        </div>
        <PressureLegend />
      </section>

      {/* Advisory ribbon — compact summary chips */}
      <section className="rounded-3xl border border-border-muted bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
            <Activity size={12} strokeWidth={2} />
            Advisory channel
          </div>
          <div className="text-[11px] text-text-faint">
            Updated continuously from the warmup engine
          </div>
        </div>
        <AdvisoryRibbon items={buildAdvisories(d.summary, d.recentAlerts.length)} />
      </section>
    </div>
  );
}

export default AgRepC4Forecast;
