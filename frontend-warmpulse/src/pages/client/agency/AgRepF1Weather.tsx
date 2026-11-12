import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudOff,
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Flame,
  Globe2,
  Hourglass,
  Mail,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  SunMedium,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Wind,
  Zap,
} from 'lucide-react';

import type { AgencyReputationData } from '@/pages/client/agency/AgRepC4Forecast';
import { formatNumber } from '@/lib/format';

/**
 * AgRepF1Weather — Agency-tier REPUTATION surface "F1 Weather Forecast".
 *
 * `/app/reputation` for Agency-tier operators rendered as a 7-day deliverability
 * weather forecast. The user reads it like tomorrow's weather:
 *
 *   - Sunny       (rep >= 80)            healthy
 *   - Partly      (70–79)                light overcast
 *   - Cloudy      (60–69)                warming
 *   - Rainy       (50–59)                warming, watch the bounces
 *   - Stormy      (< 50)                 at-risk, severe weather warning
 *
 * Anatomy (top → bottom):
 *   1. Header strip — agency name, region, local-time + last-updated chip and a
 *      tiny sun/cloud condition glyph.
 *   2. "Today's forecast" hero — full-width card with a temperature-style
 *      overall score that counts up on mount, a condition label, three mini
 *      stats (24h sends / bounce / spam), an animated sunset → night gradient
 *      and an animated sun-with-cloud SVG illustration top-right.
 *   3. 7-day forecast strip — seven day tiles fade-in left → right (80ms
 *      stagger). Each tile shows weather icon, projected score, hi/lo range
 *      and a precipitation %. "Today" is highlighted with an orange ring.
 *   4. Domain conditions table — one row per domain (the "city forecast").
 *      Each shows current temperature, condition word, a 7-day temperature
 *      sparkline and a status pill. Rows hover-glow.
 *   5. Storm watch strip — alert cards from `recentAlerts`. Severity
 *      'critical' = lightning bolt + danger color and pulses; 'warn' =
 *      cloud-rain + warning color.
 *
 * Fully STANDALONE — no network, router, query hooks or required props.
 * Tailwind tokens (`accent`, `accent3`, `accent4`, `surface`, etc.) plus
 * inline `var(--wp-*)` reads only. Lucide icons + framer-motion only.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => formatNumber(n);

const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

type WeatherKey = 'sunny' | 'partly' | 'cloudy' | 'rainy' | 'stormy' | 'fog';

interface WeatherDescriptor {
  key: WeatherKey;
  label: string;
  blurb: string;
  Icon: typeof Sun;
}

function classifyWeather(score: number): WeatherDescriptor {
  if (score <= 0) {
    return { key: 'fog', label: 'No data', blurb: 'Awaiting first signal.', Icon: CloudOff };
  }
  if (score >= 80) {
    return { key: 'sunny', label: 'Sunny', blurb: 'Clear deliverability skies.', Icon: Sun };
  }
  if (score >= 70) {
    return {
      key: 'partly',
      label: 'Partly cloudy',
      blurb: 'Mostly clear, light deliverability winds.',
      Icon: SunMedium,
    };
  }
  if (score >= 60) {
    return { key: 'cloudy', label: 'Cloudy', blurb: 'Overcast, monitor warm-up cadence.', Icon: Cloud };
  }
  if (score >= 50) {
    return { key: 'rainy', label: 'Rainy', blurb: 'Light showers on the warm path.', Icon: CloudRain };
  }
  return { key: 'stormy', label: 'Stormy', blurb: 'Severe weather — mitigations advised.', Icon: CloudLightning };
}

const TEMP_TONE: Record<WeatherKey, string> = {
  sunny: 'text-accent',
  partly: 'text-accent4',
  cloudy: 'text-text-dim',
  rainy: 'text-accent4',
  stormy: 'text-accent3',
  fog: 'text-text-faint',
};

const STATUS_LABEL: Record<'healthy' | 'warming' | 'at_risk', string> = {
  healthy: 'Healthy',
  warming: 'Warming',
  at_risk: 'At-risk',
};

const STATUS_TONE: Record<'healthy' | 'warming' | 'at_risk', { text: string; bg: string; border: string }> = {
  healthy: { text: 'text-accent', bg: 'bg-accent/12', border: 'border-accent/35' },
  warming: { text: 'text-accent4', bg: 'bg-accent4/12', border: 'border-accent4/35' },
  at_risk: { text: 'text-accent3', bg: 'bg-accent3/12', border: 'border-accent3/35' },
};

// Convert AlertKind → display copy
const ALERT_TITLE: Record<string, string> = {
  bounce_spike: 'Bounce squall',
  spam_complaint: 'Spam cell',
  dns_break: 'Auth fog bank',
  peer_failed: 'Peer drought',
};

const ALERT_BLURB: Record<string, string> = {
  bounce_spike: 'Hard bounce wind shear above threshold.',
  spam_complaint: 'Complaint cluster forming over recipients.',
  dns_break: 'SPF / DKIM / DMARC reading low visibility.',
  peer_failed: 'Peer-inbox supply pressure dropping.',
};

// ---------------------------------------------------------------------------
// MOCK — Northwind Agency portfolio, 8 domains across 4 sub-clients
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
      id: 'helix-send-io',
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
      id: 'helix-reach-io',
      domain: 'reach.helix.io',
      subClientId: 'helix',
      subClientName: 'Helix Outbound',
      reputationScore: 88,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 8,
      inboxRatePct: 94.0,
      spamFolderPct: 1.5,
      last7dScores: [82, 83, 85, 86, 87, 88, 88],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'nimbus-reach-com',
      domain: 'mail.nimbusreach.com',
      subClientId: 'nimbus',
      subClientName: 'Nimbus Reach',
      reputationScore: 86,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 9,
      inboxRatePct: 93.2,
      spamFolderPct: 1.6,
      last7dScores: [80, 81, 83, 84, 85, 86, 86],
      lastIncidentAgo: null,
      lastIncidentKind: null,
    },
    {
      id: 'orion-mail-co',
      domain: 'out.orionmail.co',
      subClientId: 'orion',
      subClientName: 'Orion Mail',
      reputationScore: 82,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: true,
      mailboxCount: 7,
      inboxRatePct: 91.4,
      spamFolderPct: 1.9,
      last7dScores: [78, 79, 80, 81, 82, 82, 82],
      lastIncidentAgo: '2d ago',
      lastIncidentKind: 'peer_failed',
    },
    {
      id: 'orion-news-co',
      domain: 'news.orionmail.co',
      subClientId: 'orion',
      subClientName: 'Orion Mail',
      reputationScore: 80,
      status: 'healthy',
      spfPass: true,
      dkimPass: true,
      dmarcPass: false,
      mailboxCount: 6,
      inboxRatePct: 89.0,
      spamFolderPct: 2.2,
      last7dScores: [76, 77, 78, 78, 79, 80, 80],
      lastIncidentAgo: '5d ago',
      lastIncidentKind: 'dns_break',
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
    { id: 'gmail', label: 'Gmail', inboxPct: 93.1, spamPct: 1.7, blockedPct: 0.4, last24hSends: 8420 },
    { id: 'outlook', label: 'Outlook', inboxPct: 89.4, spamPct: 2.6, blockedPct: 0.8, last24hSends: 4310 },
    { id: 'yahoo', label: 'Yahoo', inboxPct: 84.7, spamPct: 3.1, blockedPct: 1.2, last24hSends: 2090 },
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
      domain: 'news.orionmail.co',
      kind: 'dns_break',
      message: 'DMARC record missing on apex; child domains unaffected.',
      ago: '5d ago',
      severity: 'warn',
    },
  ],
};

// ---------------------------------------------------------------------------
// 7-day projection — uses summary.trend7dDelta and per-domain last7dScores
// ---------------------------------------------------------------------------

interface ForecastDay {
  dayLabel: string;
  fullDayLabel: string;
  score: number;
  hi: number;
  lo: number;
  hiDomain: string;
  loDomain: string;
  precipPct: number;
  weather: WeatherDescriptor;
  isToday: boolean;
}

const DAY_LABELS: Array<{ short: string; full: string }> = [
  { short: 'Today', full: 'Today' },
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
];

function buildForecast(d: AgencyReputationData): ForecastDay[] {
  const domains = d.domains;
  if (domains.length === 0) {
    return DAY_LABELS.map((lab, i) => ({
      dayLabel: lab.short,
      fullDayLabel: lab.full,
      score: 0,
      hi: 0,
      lo: 0,
      hiDomain: '—',
      loDomain: '—',
      precipPct: 0,
      weather: classifyWeather(0),
      isToday: i === 0,
    }));
  }

  // averaged "today" score = current overall
  const todayScore = d.summary.overallScore;
  // Use 7d delta to seed forward drift; clamp so wild deltas don't break the strip
  const delta = clamp(d.summary.trend7dDelta, -8, 8);
  const stepDrift = delta / 7;

  return DAY_LABELS.map((lab, i) => {
    // Slight sinusoidal flutter so the line isn't perfectly straight
    const flutter = Math.sin(i * 0.85) * 1.4;
    const score = Math.round(clamp(todayScore + stepDrift * i + flutter, 0, 100));

    // hi / lo across domain portfolio for that projected day
    let hi = -Infinity;
    let lo = Infinity;
    let hiDomain = domains[0]?.domain ?? '';
    let loDomain = domains[0]?.domain ?? '';
    for (const dom of domains) {
      const arr = dom.last7dScores;
      const base = arr[Math.min(i, arr.length - 1)] ?? dom.reputationScore;
      const proj = clamp(base + stepDrift * i + flutter, 0, 100);
      if (proj > hi) {
        hi = proj;
        hiDomain = dom.domain;
      }
      if (proj < lo) {
        lo = proj;
        loDomain = dom.domain;
      }
    }

    // Precipitation = chance of an incident: scales with the share of warming +
    // at-risk domains, plus alert pressure.
    const risky = d.summary.domainsWarming + d.summary.domainsAtRisk * 2;
    const total = Math.max(1, domains.length);
    const precipBase = (risky / total) * 60;
    const alertBoost = Math.min(20, d.recentAlerts.length * 4);
    const precipPct = Math.round(clamp(precipBase + alertBoost - i * 2, 0, 95));

    return {
      dayLabel: lab.short,
      fullDayLabel: lab.full,
      score,
      hi: Math.round(hi),
      lo: Math.round(lo),
      hiDomain,
      loDomain,
      precipPct,
      weather: classifyWeather(score),
      isToday: i === 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Count-up motion primitive
// ---------------------------------------------------------------------------

interface CountUpProps {
  to: number;
  decimals?: number;
  duration?: number;
  className?: string;
}

function CountUp({ to, decimals = 0, duration = 1.4, className }: CountUpProps): JSX.Element {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const rounded = useTransform(spring, (v) =>
    decimals === 0 ? Math.round(v).toString() : v.toFixed(decimals),
  );
  // Trigger the animation once on mount
  useMemo(() => {
    mv.set(to);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <motion.span className={className}>{rounded}</motion.span>;
}

// ---------------------------------------------------------------------------
// Animated sun + cloud SVG used in the hero
// ---------------------------------------------------------------------------

function HeroSkyArt({ band }: { band: WeatherKey }): JSX.Element {
  // Pick condition-driven visual flavor.
  const showStorm = band === 'stormy';
  const showRain = band === 'rainy' || band === 'stormy';
  const showCloud = band !== 'sunny' && band !== 'fog';
  const showSun = band === 'sunny' || band === 'partly' || band === 'cloudy';

  return (
    <div className="pointer-events-none relative h-[200px] w-[220px]" aria-hidden>
      {/* radial sun glow */}
      {showSun ? (
        <motion.div
          className="absolute"
          style={{
            top: 18,
            right: 38,
            width: 120,
            height: 120,
            borderRadius: '50%',
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--wp-accent) 60%, transparent), transparent 70%)',
            filter: 'blur(6px)',
          }}
          animate={{ opacity: [0.55, 0.85, 0.55] }}
          transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      ) : null}
      {/* sun disc with slow rotation */}
      {showSun ? (
        <motion.div
          className="absolute"
          style={{ top: 38, right: 60 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
        >
          <Sun size={80} strokeWidth={1.4} style={{ color: 'var(--wp-accent)' }} />
        </motion.div>
      ) : null}
      {/* drifting cloud */}
      {showCloud ? (
        <motion.div
          className="absolute"
          style={{ top: showSun ? 70 : 50, left: 6 }}
          animate={{ x: [0, 14, 0], y: [0, -3, 0] }}
          transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
        >
          <Cloud
            size={showSun ? 88 : 120}
            strokeWidth={1.3}
            style={{ color: 'color-mix(in srgb, var(--wp-text-faint) 80%, white)' }}
          />
        </motion.div>
      ) : null}
      {/* falling rain droplets */}
      {showRain ? (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={`rd-${i}`}
              className="absolute"
              style={{
                top: 130,
                left: 22 + i * 18,
                width: 2,
                height: 12,
                borderRadius: 999,
                background: 'var(--wp-warning, #ffb454)',
                opacity: 0.65,
              }}
              animate={{ y: [0, 26, 26], opacity: [0, 0.8, 0] }}
              transition={{
                duration: 1.2,
                ease: 'easeIn',
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </>
      ) : null}
      {/* lightning flash */}
      {showStorm ? (
        <motion.div
          className="absolute"
          style={{ top: 60, right: 78 }}
          animate={{ opacity: [0.1, 1, 0.2, 0.9, 0.1] }}
          transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
        >
          <Zap size={42} strokeWidth={1.6} style={{ color: 'var(--wp-danger, #ff5c7a)' }} />
        </motion.div>
      ) : null}
      {/* fog wisps */}
      {band === 'fog' ? (
        <motion.div
          className="absolute"
          style={{ top: 80, left: 10 }}
          animate={{ x: [0, 14, 0], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 5.4, ease: 'easeInOut', repeat: Infinity }}
        >
          <CloudOff size={88} strokeWidth={1.3} style={{ color: 'var(--wp-text-faint)' }} />
        </motion.div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeatherHeroCard — "Today's forecast" full-width card
// ---------------------------------------------------------------------------

interface WeatherHeroCardProps {
  d: AgencyReputationData;
}

function WeatherHeroCard({ d }: WeatherHeroCardProps): JSX.Element {
  const s = d.summary;
  const weather = classifyWeather(s.overallScore);
  const trendUp = s.trend7dDelta >= 0;
  // Hero gradient scales with score range. Higher = warmer orange; lower = duskier.
  const heroGradient = useMemo(() => {
    const score = s.overallScore;
    if (score >= 80) {
      return 'linear-gradient(135deg, color-mix(in srgb, var(--wp-accent) 22%, var(--wp-surface)) 0%, color-mix(in srgb, var(--wp-accent-2, #FF8A4B) 18%, var(--wp-surface)) 50%, var(--wp-surface) 100%)';
    }
    if (score >= 60) {
      return 'linear-gradient(135deg, color-mix(in srgb, var(--wp-accent) 16%, var(--wp-surface)) 0%, color-mix(in srgb, var(--wp-warning, #ffb454) 12%, var(--wp-surface)) 55%, var(--wp-surface) 100%)';
    }
    return 'linear-gradient(135deg, color-mix(in srgb, var(--wp-danger, #ff5c7a) 14%, var(--wp-surface)) 0%, color-mix(in srgb, var(--wp-accent) 10%, var(--wp-surface)) 60%, var(--wp-surface) 100%)';
  }, [s.overallScore]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-3xl border border-border-muted"
      style={{ background: heroGradient }}
    >
      {/* Animated star field on darker hero variants */}
      <div className="pointer-events-none absolute inset-0">
        <AnimatePresence>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <motion.div
              key={`star-${i}`}
              className="absolute h-0.5 w-0.5 rounded-full"
              style={{
                background: 'var(--wp-text)',
                opacity: 0.18,
                top: `${10 + i * 9}%`,
                left: `${52 + ((i * 7) % 40)}%`,
              }}
              animate={{ opacity: [0.05, 0.3, 0.05] }}
              transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Faint vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--wp-accent) 14%, transparent), transparent 60%)',
        }}
      />

      <div className="relative grid grid-cols-1 gap-6 p-6 md:grid-cols-[1fr_220px] md:p-7">
        <div className="flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-dim">
              <Sunrise size={12} strokeWidth={2} style={{ color: 'var(--wp-accent)' }} />
              Today's forecast
              <span className="mx-1 text-text-faint">·</span>
              {d.agency.region}
            </div>
            <div className="mt-3 flex items-end gap-3">
              <div className="font-mono text-[88px] leading-none tracking-tight text-text md:text-[112px]">
                <CountUp to={s.overallScore} duration={1.4} />
                <span className="ml-0.5 align-top text-[40px] text-text-dim md:text-[56px]">°</span>
              </div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
                {trendUp ? (
                  <ArrowUp size={11} strokeWidth={2.4} className="text-accent" />
                ) : (
                  <ArrowDown size={11} strokeWidth={2.4} className="text-accent3" />
                )}
                <span className={trendUp ? 'text-accent' : 'text-accent3'}>
                  {trendUp ? '+' : ''}
                  {s.trend7dDelta.toFixed(1)}°
                </span>
                <span className="text-text-faint">7d</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <weather.Icon size={20} strokeWidth={1.8} className={TEMP_TONE[weather.key]} />
              <div className="text-[16px] font-medium text-text md:text-[18px]">{weather.label}</div>
              <span className="text-text-faint">·</span>
              <div className="text-[13px] text-text-dim md:text-[14px]">{weather.blurb}</div>
            </div>
          </div>

          {/* Three mini stats */}
          <div className="grid grid-cols-3 gap-3">
            <HeroMiniStat
              label="24h sends"
              value={fmtInt(s.totalSends24h)}
              Icon={Mail}
              tone="default"
              caption="Across all stations"
            />
            <HeroMiniStat
              label="Bounce rate"
              value={fmtPct(s.bouncePct24h, 1)}
              Icon={Droplets}
              tone={s.bouncePct24h > 4 ? 'danger' : s.bouncePct24h > 2 ? 'warn' : 'default'}
              caption="Sub-bounce ratio"
            />
            <HeroMiniStat
              label="Spam complaints"
              value={fmtPct(s.spamComplaintPct24h, 2)}
              Icon={Wind}
              tone={s.spamComplaintPct24h > 1 ? 'danger' : s.spamComplaintPct24h > 0.3 ? 'warn' : 'default'}
              caption="Complaint speed"
            />
          </div>
        </div>

        <div className="relative flex justify-end">
          <HeroSkyArt band={weather.key} />
        </div>
      </div>
    </motion.section>
  );
}

interface HeroMiniStatProps {
  label: string;
  value: string;
  Icon: typeof Mail;
  tone: 'default' | 'warn' | 'danger';
  caption: string;
}

function HeroMiniStat({ label, value, Icon, tone, caption }: HeroMiniStatProps): JSX.Element {
  const toneText =
    tone === 'danger' ? 'text-accent3' : tone === 'warn' ? 'text-accent4' : 'text-text';
  const toneRing =
    tone === 'danger'
      ? 'ring-accent3/30'
      : tone === 'warn'
        ? 'ring-accent4/30'
        : 'ring-border-muted';
  return (
    <div
      className={`rounded-2xl border border-border-muted bg-surface/70 px-3 py-3 backdrop-blur ring-1 ${toneRing}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-text-dim">
        <Icon size={11} strokeWidth={2} className={toneText} />
        {label}
      </div>
      <div className={`mt-1.5 text-[20px] font-semibold ${toneText}`}>{value}</div>
      <div className="mt-0.5 text-[10.5px] text-text-faint">{caption}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ForecastDayTile — tile in the 7-day strip
// ---------------------------------------------------------------------------

interface ForecastDayTileProps {
  day: ForecastDay;
  index: number;
  onHover: (d: ForecastDay | null) => void;
  active: boolean;
}

function ForecastDayTile({ day, index, onHover, active }: ForecastDayTileProps): JSX.Element {
  const { weather, isToday } = day;
  const WIcon = weather.Icon;
  return (
    <motion.button
      type="button"
      onMouseEnter={() => onHover(day)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(day)}
      onBlur={() => onHover(null)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay: 0.05 + index * 0.08, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className={`relative flex min-w-[120px] flex-col items-center gap-2 rounded-2xl border bg-surface px-3 py-3 text-left transition-shadow ${
        isToday
          ? 'border-accent/45 ring-2 ring-accent/40'
          : active
            ? 'border-accent/30'
            : 'border-border-muted'
      }`}
      style={{
        boxShadow: isToday
          ? '0 8px 28px color-mix(in srgb, var(--wp-accent) 22%, transparent)'
          : undefined,
      }}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
            isToday ? 'text-accent' : 'text-text-dim'
          }`}
        >
          {day.dayLabel}
        </span>
        {isToday ? (
          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">
            Now
          </span>
        ) : null}
      </div>

      {/* Animated weather icon */}
      <div className="my-1 flex h-12 w-12 items-center justify-center">
        <motion.div
          animate={
            weather.key === 'sunny'
              ? { rotate: [0, 360] }
              : weather.key === 'partly'
                ? { x: [0, 4, 0] }
                : weather.key === 'rainy'
                  ? { y: [0, 2, 0] }
                  : weather.key === 'stormy'
                    ? { opacity: [0.8, 1, 0.8] }
                    : { opacity: [0.8, 1, 0.8] }
          }
          transition={{
            duration: weather.key === 'sunny' ? 18 : 2.6,
            ease: weather.key === 'sunny' ? 'linear' : 'easeInOut',
            repeat: Infinity,
          }}
        >
          <WIcon size={32} strokeWidth={1.5} className={TEMP_TONE[weather.key]} />
        </motion.div>
      </div>

      {/* Projected score */}
      <div className="text-center">
        <div className={`font-mono text-[26px] leading-none tracking-tight ${TEMP_TONE[weather.key]}`}>
          {day.score}
          <span className="text-[14px] text-text-dim">°</span>
        </div>
        <div className="mt-1 text-[10px] text-text-faint">{weather.label}</div>
      </div>

      {/* Hi / lo range */}
      <div className="mt-1 grid w-full grid-cols-2 gap-1 text-center">
        <div className="rounded-md bg-surface-2 px-1.5 py-1">
          <div className="flex items-center justify-center gap-1 text-[8.5px] uppercase tracking-[0.12em] text-text-faint">
            <ArrowUp size={9} strokeWidth={2.6} className="text-accent" />
            Hi
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-text">{day.hi}°</div>
        </div>
        <div className="rounded-md bg-surface-2 px-1.5 py-1">
          <div className="flex items-center justify-center gap-1 text-[8.5px] uppercase tracking-[0.12em] text-text-faint">
            <ArrowDown size={9} strokeWidth={2.6} className="text-accent3" />
            Lo
          </div>
          <div className="mt-0.5 font-mono text-[12px] text-text">{day.lo}°</div>
        </div>
      </div>

      {/* Precip % */}
      <div className="mt-1 flex w-full items-center justify-between rounded-md bg-surface-2 px-2 py-1">
        <div className="flex items-center gap-1 text-[9.5px] uppercase tracking-[0.14em] text-text-faint">
          <Umbrella size={9} strokeWidth={2} className="text-accent4" />
          Storms
        </div>
        <div className="font-mono text-[11px] text-text">{day.precipPct}%</div>
      </div>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// ForecastDetailsCard — hover detail beneath the strip
// ---------------------------------------------------------------------------

interface ForecastDetailsCardProps {
  day: ForecastDay | null;
  fallback: ForecastDay;
}

function ForecastDetailsCard({ day, fallback }: ForecastDetailsCardProps): JSX.Element {
  const shown = day ?? fallback;
  const WIcon = shown.weather.Icon;
  return (
    <motion.div
      key={shown.dayLabel}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border-muted bg-surface-2 p-2">
            <WIcon size={20} strokeWidth={1.6} className={TEMP_TONE[shown.weather.key]} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-text-dim">
              {shown.fullDayLabel}
              {shown.isToday ? (
                <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] text-accent">
                  Live
                </span>
              ) : null}
            </div>
            <div className="text-[15px] font-semibold text-text">
              {shown.weather.label}{' '}
              <span className="text-text-faint">· projected {shown.score}°</span>
            </div>
            <div className="mt-0.5 text-[12px] text-text-dim">{shown.weather.blurb}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DetailChip
            Icon={ArrowUp}
            label="Best"
            value={`${shown.hi}°`}
            sub={shown.hiDomain}
            tone="accent"
          />
          <DetailChip
            Icon={ArrowDown}
            label="Worst"
            value={`${shown.lo}°`}
            sub={shown.loDomain}
            tone="accent3"
          />
          <DetailChip
            Icon={Umbrella}
            label="Storms"
            value={`${shown.precipPct}%`}
            sub="chance of incident"
            tone="accent4"
          />
        </div>
      </div>
    </motion.div>
  );
}

interface DetailChipProps {
  Icon: typeof ArrowUp;
  label: string;
  value: string;
  sub: string;
  tone: 'accent' | 'accent3' | 'accent4';
}

function DetailChip({ Icon, label, value, sub, tone }: DetailChipProps): JSX.Element {
  const toneText = tone === 'accent' ? 'text-accent' : tone === 'accent3' ? 'text-accent3' : 'text-accent4';
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border-muted bg-surface-2 px-2.5 py-1.5">
      <Icon size={12} strokeWidth={2.2} className={toneText} />
      <div className="flex flex-col leading-tight">
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-text-faint">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className={`font-mono text-[13px] ${toneText}`}>{value}</span>
          <span className="max-w-[180px] truncate text-[11px] text-text-dim">{sub}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — small temperature trend line
// ---------------------------------------------------------------------------

interface SparklineProps {
  values: number[];
  status: 'healthy' | 'warming' | 'at_risk';
  width?: number;
  height?: number;
}

function Sparkline({ values, status, width = 96, height = 28 }: SparklineProps): JSX.Element {
  if (values.length === 0) {
    return <div className="text-[10px] text-text-faint">—</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return [x, y] as const;
  });
  const linePath = pts
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');
  const areaPath = `${linePath} L ${pts[pts.length - 1]?.[0] ?? 0} ${height - 1} L ${pts[0]?.[0] ?? 0} ${
    height - 1
  } Z`;
  const stroke =
    status === 'healthy'
      ? 'var(--wp-accent)'
      : status === 'warming'
        ? 'var(--wp-warning, #ffb454)'
        : 'var(--wp-danger, #ff5c7a)';
  const lastPt = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={`sl-grad-${status}-${width}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sl-grad-${status}-${width})`} />
      <motion.path
        d={linePath}
        stroke={stroke}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      {lastPt ? (
        <>
          <circle cx={lastPt[0]} cy={lastPt[1]} r={2.4} fill={stroke} />
          <circle cx={lastPt[0]} cy={lastPt[1]} r={5} fill={stroke} opacity={0.18} />
        </>
      ) : null}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// DomainConditionsRow — one domain row in the city forecast table
// ---------------------------------------------------------------------------

interface DomainRowProps {
  d: AgencyReputationData['domains'][number];
  index: number;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}

function DomainConditionsRow({ d, index, highlighted, onHover }: DomainRowProps): JSX.Element {
  const weather = classifyWeather(d.reputationScore);
  const WIcon = weather.Icon;
  const tone = STATUS_TONE[d.status];

  // delta over last 7d for trend chip
  const last = d.last7dScores[d.last7dScores.length - 1] ?? d.reputationScore;
  const first = d.last7dScores[0] ?? d.reputationScore;
  const delta = last - first;
  const trendUp = delta >= 0;

  // DNS auth count
  const dnsPasses = (d.spfPass ? 1 : 0) + (d.dkimPass ? 1 : 0) + (d.dmarcPass ? 1 : 0);

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.04 + index * 0.05, ease: 'easeOut' }}
      onMouseEnter={() => onHover(d.id)}
      onMouseLeave={() => onHover(null)}
      className={`group transition-colors ${
        highlighted ? 'bg-surface-2/80' : 'hover:bg-surface-2/60'
      }`}
      style={
        highlighted
          ? {
              boxShadow:
                'inset 0 0 0 1px color-mix(in srgb, var(--wp-accent) 32%, transparent), 0 0 22px color-mix(in srgb, var(--wp-accent) 16%, transparent)',
            }
          : undefined
      }
    >
      {/* City (domain) */}
      <td className="py-3 pl-4 pr-3 align-middle">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl border ${tone.bg} ${tone.border}`}
          >
            <MapPin size={14} strokeWidth={1.8} className={tone.text} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-text">{d.domain}</div>
            <div className="truncate text-[11px] text-text-dim">
              {d.subClientName}
              <span className="mx-1.5 text-text-faint">·</span>
              {d.mailboxCount} mailbox{d.mailboxCount === 1 ? '' : 'es'}
            </div>
          </div>
        </div>
      </td>

      {/* Condition */}
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-2">
          <motion.div
            animate={
              weather.key === 'sunny'
                ? { rotate: [0, 360] }
                : weather.key === 'partly'
                  ? { x: [0, 3, 0] }
                  : weather.key === 'rainy'
                    ? { y: [0, 2, 0] }
                    : weather.key === 'stormy'
                      ? { opacity: [0.7, 1, 0.7] }
                      : {}
            }
            transition={{
              duration: weather.key === 'sunny' ? 22 : 2.6,
              ease: weather.key === 'sunny' ? 'linear' : 'easeInOut',
              repeat: Infinity,
            }}
          >
            <WIcon size={18} strokeWidth={1.6} className={TEMP_TONE[weather.key]} />
          </motion.div>
          <span className={`text-[12.5px] font-medium ${TEMP_TONE[weather.key]}`}>
            {weather.label}
          </span>
        </div>
      </td>

      {/* Temp */}
      <td className="px-3 py-3 align-middle">
        <div className="flex items-baseline gap-1">
          <span className={`font-mono text-[22px] leading-none ${TEMP_TONE[weather.key]}`}>
            {d.reputationScore}
          </span>
          <span className="text-[14px] text-text-dim">°</span>
        </div>
        <div className="mt-1 flex items-center gap-1">
          {trendUp ? (
            <ArrowUp size={10} strokeWidth={2.4} className="text-accent" />
          ) : (
            <ArrowDown size={10} strokeWidth={2.4} className="text-accent3" />
          )}
          <span
            className={`font-mono text-[10.5px] ${trendUp ? 'text-accent' : 'text-accent3'}`}
          >
            {trendUp ? '+' : ''}
            {delta.toFixed(0)}° 7d
          </span>
        </div>
      </td>

      {/* Sparkline */}
      <td className="hidden px-3 py-3 align-middle md:table-cell">
        <Sparkline values={d.last7dScores} status={d.status} width={108} height={32} />
      </td>

      {/* DNS auth */}
      <td className="hidden px-3 py-3 align-middle lg:table-cell">
        <div className="flex items-center gap-1.5">
          <AuthDot label="SPF" pass={d.spfPass} />
          <AuthDot label="DKIM" pass={d.dkimPass} />
          <AuthDot label="DMARC" pass={d.dmarcPass} />
          <span className="ml-1 font-mono text-[10.5px] text-text-faint">{dnsPasses}/3</span>
        </div>
      </td>

      {/* Inbox / spam mini */}
      <td className="hidden px-3 py-3 align-middle xl:table-cell">
        <div className="flex flex-col gap-1 leading-tight">
          <div className="flex items-center gap-1.5 text-[10.5px] text-text-dim">
            <Eye size={10} strokeWidth={2} className="text-accent" />
            Inbox{' '}
            <span className="font-mono text-text">{fmtPct(d.inboxRatePct, 1)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-text-dim">
            <ShieldAlert size={10} strokeWidth={2} className="text-accent3" />
            Spam{' '}
            <span className="font-mono text-text">{fmtPct(d.spamFolderPct, 1)}</span>
          </div>
        </div>
      </td>

      {/* Status pill */}
      <td className="px-3 py-3 pr-4 align-middle">
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${tone.bg} ${tone.border} ${tone.text}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.bg.replace('/12', '')}`} />
            {STATUS_LABEL[d.status]}
          </span>
          {d.lastIncidentAgo ? (
            <span className="text-[10px] text-text-faint">
              Last incident {d.lastIncidentAgo}
            </span>
          ) : (
            <span className="text-[10px] text-text-faint">No recent advisories</span>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

function AuthDot({ label, pass }: { label: string; pass: boolean }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.12em] ${
        pass
          ? 'border-accent/30 bg-accent/10 text-accent'
          : 'border-accent3/30 bg-accent3/10 text-accent3'
      }`}
    >
      <span
        className={`h-1 w-1 rounded-full ${pass ? 'bg-accent' : 'bg-accent3'}`}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// StormWatchStrip — horizontal alert cards
// ---------------------------------------------------------------------------

interface StormWatchStripProps {
  alerts: AgencyReputationData['recentAlerts'];
}

function StormWatchStrip({ alerts }: StormWatchStripProps): JSX.Element {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-4 py-8 text-center">
        <div className="flex flex-col items-center gap-2 text-text-faint">
          <Sun size={22} strokeWidth={1.6} className="text-accent" />
          <span className="text-[12.5px]">
            Storm tracker is quiet. All advisories cleared.
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {alerts.map((a, i) => (
        <StormWatchCard key={a.id} alert={a} index={i} />
      ))}
    </div>
  );
}

function StormWatchCard({
  alert,
  index,
}: {
  alert: AgencyReputationData['recentAlerts'][number];
  index: number;
}): JSX.Element {
  const isCritical = alert.severity === 'critical';
  const Icon = isCritical ? Zap : CloudRain;
  const tone = isCritical ? 'text-accent3' : 'text-accent4';
  const border = isCritical ? 'border-accent3/40' : 'border-accent4/35';
  const bg = isCritical
    ? 'bg-gradient-to-br from-[color-mix(in_srgb,var(--wp-danger,#ff5c7a)_22%,var(--wp-surface))] to-surface'
    : 'bg-gradient-to-br from-[color-mix(in_srgb,var(--wp-warning,#ffb454)_15%,var(--wp-surface))] to-surface';
  const title = ALERT_TITLE[alert.kind] ?? 'Advisory';
  const blurb = ALERT_BLURB[alert.kind] ?? '';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: index * 0.07, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-2xl border p-3.5 ${border} ${bg}`}
    >
      {isCritical ? (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            boxShadow: '0 0 0 0 color-mix(in srgb, var(--wp-danger, #ff5c7a) 60%, transparent)',
          }}
          animate={{
            boxShadow: [
              '0 0 0 0 color-mix(in srgb, var(--wp-danger, #ff5c7a) 50%, transparent)',
              '0 0 0 8px color-mix(in srgb, var(--wp-danger, #ff5c7a) 0%, transparent)',
              '0 0 0 0 color-mix(in srgb, var(--wp-danger, #ff5c7a) 0%, transparent)',
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
        />
      ) : null}

      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${border} bg-surface/60`}
        >
          <motion.div
            animate={
              isCritical
                ? { rotate: [0, -8, 8, 0], opacity: [0.85, 1, 0.85] }
                : { y: [0, 2, 0] }
            }
            transition={{ duration: isCritical ? 1.8 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon size={20} strokeWidth={1.8} className={tone} />
          </motion.div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={`text-[12.5px] font-semibold ${tone}`}>{title}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ${
                  isCritical ? 'bg-accent3/20 text-accent3' : 'bg-accent4/20 text-accent4'
                }`}
              >
                {isCritical ? 'Critical' : 'Watch'}
              </span>
            </div>
            <span className="font-mono text-[10px] text-text-faint">{alert.ago}</span>
          </div>
          <div className="mt-1 truncate text-[11.5px] text-text-dim">{alert.domain}</div>
          <div className="mt-1.5 line-clamp-2 text-[12px] text-text">{alert.message}</div>
          <div className="mt-1 text-[10.5px] text-text-faint">{blurb}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Header strip — agency identity + local time
// ---------------------------------------------------------------------------

interface HeaderStripProps {
  d: AgencyReputationData;
  localTime: string;
  updatedAgo: string;
}

function HeaderStrip({ d, localTime, updatedAgo }: HeaderStripProps): JSX.Element {
  const weather = classifyWeather(d.summary.overallScore);
  const WIcon = weather.Icon;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-muted pb-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-faint">
          <Compass size={12} strokeWidth={2} />
          Reputation forecast
        </div>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight text-text">
          {d.agency.name}{' '}
          <span className="text-text-faint">·</span>{' '}
          <span className="text-[16px] font-normal text-text-dim">weather report</span>
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-text-dim">
          <span className="inline-flex items-center gap-1">
            <Globe2 size={12} strokeWidth={2} className="text-text-dim" />
            {d.agency.region}
          </span>
          <span className="text-text-faint">·</span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} strokeWidth={2} className="text-text-dim" />
            Local time {localTime}
          </span>
          <span className="text-text-faint">·</span>
          <span className="inline-flex items-center gap-1">
            <RefreshCw size={11} strokeWidth={2} className="text-text-dim" />
            Updated {updatedAgo}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-[11px] uppercase tracking-wider ${TEMP_TONE[weather.key]}`}
        >
          <WIcon size={13} strokeWidth={1.8} />
          {weather.label}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-bg hover:opacity-90"
        >
          <ArrowUpRight size={12} strokeWidth={2.4} />
          Forecast report
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Domain conditions table wrapper
// ---------------------------------------------------------------------------

type DomainSortKey = 'temp' | 'condition' | 'name' | 'trend';

interface DomainConditionsTableProps {
  d: AgencyReputationData;
}

function DomainConditionsTable({ d }: DomainConditionsTableProps): JSX.Element {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [sort, setSort] = useState<DomainSortKey>('temp');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState<'all' | 'healthy' | 'warming' | 'at_risk'>('all');

  const filteredAndSorted = useMemo(() => {
    let arr = [...d.domains];
    if (filter !== 'all') {
      arr = arr.filter((dom) => dom.status === filter);
    }
    arr.sort((a, b) => {
      let av = 0;
      let bv = 0;
      switch (sort) {
        case 'temp':
          av = a.reputationScore;
          bv = b.reputationScore;
          break;
        case 'condition':
          av = classifyWeather(a.reputationScore).key.length;
          bv = classifyWeather(b.reputationScore).key.length;
          break;
        case 'name':
          return direction === 'asc'
            ? a.domain.localeCompare(b.domain)
            : b.domain.localeCompare(a.domain);
        case 'trend': {
          const ad = (a.last7dScores[a.last7dScores.length - 1] ?? 0) - (a.last7dScores[0] ?? 0);
          const bd = (b.last7dScores[b.last7dScores.length - 1] ?? 0) - (b.last7dScores[0] ?? 0);
          av = ad;
          bv = bd;
          break;
        }
      }
      return direction === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [d.domains, sort, direction, filter]);

  const toggleSort = (k: DomainSortKey) => {
    if (sort === k) {
      setDirection((p) => (p === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(k);
      setDirection('desc');
    }
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
          <Thermometer size={12} strokeWidth={2} className="text-accent" />
          City forecast
          <span className="text-text-faint">·</span>
          <span className="text-text-faint">{filteredAndSorted.length} domains</span>
        </div>
        <FilterToggleRow filter={filter} setFilter={setFilter} d={d} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border-muted bg-surface-2 text-[10px] uppercase tracking-[0.14em] text-text-faint">
                <SortableTh
                  label="City"
                  active={sort === 'name'}
                  direction={direction}
                  onClick={() => toggleSort('name')}
                  className="pl-4"
                />
                <SortableTh
                  label="Condition"
                  active={sort === 'condition'}
                  direction={direction}
                  onClick={() => toggleSort('condition')}
                />
                <SortableTh
                  label="Temp"
                  active={sort === 'temp'}
                  direction={direction}
                  onClick={() => toggleSort('temp')}
                />
                <th className="hidden px-3 py-2.5 md:table-cell">7-day</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">DNS</th>
                <th className="hidden px-3 py-2.5 xl:table-cell">Inbox / spam</th>
                <SortableTh
                  label="Status"
                  active={sort === 'trend'}
                  direction={direction}
                  onClick={() => toggleSort('trend')}
                  className="pr-4 text-right"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {filteredAndSorted.map((dom, i) => (
                <DomainConditionsRow
                  key={dom.id}
                  d={dom}
                  index={i}
                  highlighted={hoverId === dom.id}
                  onHover={setHoverId}
                />
              ))}
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[12px] text-text-faint">
                    No domains match the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

interface FilterToggleRowProps {
  filter: 'all' | 'healthy' | 'warming' | 'at_risk';
  setFilter: (f: 'all' | 'healthy' | 'warming' | 'at_risk') => void;
  d: AgencyReputationData;
}

function FilterToggleRow({ filter, setFilter, d }: FilterToggleRowProps): JSX.Element {
  const options: Array<{ k: 'all' | 'healthy' | 'warming' | 'at_risk'; label: string; count: number }> = [
    { k: 'all', label: 'All', count: d.domains.length },
    { k: 'healthy', label: 'Sunny', count: d.summary.domainsHealthy },
    { k: 'warming', label: 'Cloudy', count: d.summary.domainsWarming },
    { k: 'at_risk', label: 'Stormy', count: d.summary.domainsAtRisk },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => setFilter(o.k)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
            filter === o.k
              ? 'border-accent/45 bg-accent/15 text-accent'
              : 'border-border-muted bg-surface text-text-dim hover:text-text'
          }`}
        >
          {o.label}
          <span className="font-mono text-text-faint">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

interface SortableThProps {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
  className?: string;
}

function SortableTh({ label, active, direction, onClick, className }: SortableThProps): JSX.Element {
  return (
    <th className={`px-3 py-2.5 ${className ?? ''}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-text ${
          active ? 'text-accent' : 'text-text-faint'
        }`}
      >
        {label}
        {active ? (
          direction === 'asc' ? (
            <ArrowUp size={10} strokeWidth={2.4} />
          ) : (
            <ArrowDown size={10} strokeWidth={2.4} />
          )
        ) : null}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Forecast strip wrapper
// ---------------------------------------------------------------------------

interface ForecastStripProps {
  days: ForecastDay[];
}

function ForecastStrip({ days }: ForecastStripProps): JSX.Element {
  const [hover, setHover] = useState<ForecastDay | null>(null);
  const today = days[0] ?? null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
          <CalendarDays size={12} strokeWidth={2} className="text-accent" />
          7-day outlook
          <span className="text-text-faint">·</span>
          <span className="text-text-faint">projected from 7-day trend</span>
        </div>
        <div className="hidden items-center gap-3 text-[10.5px] text-text-faint md:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Sunny
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent4" />
            Cloudy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent3" />
            Stormy
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2.5">
          {days.map((dy, i) => (
            <ForecastDayTile
              key={dy.dayLabel}
              day={dy}
              index={i}
              active={hover?.dayLabel === dy.dayLabel}
              onHover={setHover}
            />
          ))}
        </div>
      </div>

      {today ? (
        <div className="mt-3">
          <ForecastDetailsCard day={hover} fallback={today} />
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Climate strip — quick provider readout under the forecast strip
// ---------------------------------------------------------------------------

interface ClimateStripProps {
  providers: AgencyReputationData['providers'];
}

function ClimateStrip({ providers }: ClimateStripProps): JSX.Element {
  if (providers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-4 py-6 text-center text-[12px] text-text-faint">
        No provider mix yet.
      </div>
    );
  }
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
        <Wind size={12} strokeWidth={2} className="text-accent" />
        Provider climates
        <span className="text-text-faint">·</span>
        <span className="text-text-faint">24h inbox vs spam vs blocked</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((p, i) => (
          <ClimateCard key={p.id} provider={p} index={i} />
        ))}
      </div>
    </section>
  );
}

function ClimateCard({
  provider,
  index,
}: {
  provider: AgencyReputationData['providers'][number];
  index: number;
}): JSX.Element {
  const inbox = clamp(provider.inboxPct, 0, 100);
  const spam = clamp(provider.spamPct, 0, 100);
  const blocked = clamp(provider.blockedPct, 0, 100);
  const Icon = inbox >= 92 ? Sun : inbox >= 85 ? SunMedium : Cloud;
  const tone = inbox >= 92 ? 'text-accent' : inbox >= 85 ? 'text-accent4' : 'text-accent3';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.08, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-border-muted bg-surface-2 p-1.5">
            <Icon size={16} strokeWidth={1.6} className={tone} />
          </div>
          <div>
            <div className="text-[13.5px] font-semibold text-text">{provider.label}</div>
            <div className="text-[10.5px] uppercase tracking-[0.14em] text-text-faint">
              {fmtInt(provider.last24hSends)} sends 24h
            </div>
          </div>
        </div>
        <div className={`font-mono text-[20px] ${tone}`}>{fmtPct(inbox, 1)}</div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: `${inbox}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.05 + index * 0.08 }}
        />
        <motion.div
          className="h-full"
          style={{ background: 'var(--wp-warning, #ffb454)' }}
          initial={{ width: 0 }}
          animate={{ width: `${spam}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 + index * 0.08 }}
        />
        <motion.div
          className="h-full bg-accent3"
          initial={{ width: 0 }}
          animate={{ width: `${blocked}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 + index * 0.08 }}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10.5px] text-text-dim">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Inbox <span className="ml-1 font-mono text-text">{fmtPct(inbox, 1)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent4" />
          Spam <span className="ml-1 font-mono text-text">{fmtPct(spam, 1)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-accent3" />
          Block <span className="ml-1 font-mono text-text">{fmtPct(blocked, 1)}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Legend ribbon — explains weather → score mapping at the foot of the page
// ---------------------------------------------------------------------------

interface LegendItem {
  Icon: typeof Sun;
  label: string;
  band: string;
  tone: string;
  desc: string;
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    Icon: Sun,
    label: 'Sunny',
    band: '≥ 80°',
    tone: 'text-accent',
    desc: 'Strong inbox placement, full reputation.',
  },
  {
    Icon: SunMedium,
    label: 'Partly cloudy',
    band: '70–79°',
    tone: 'text-accent4',
    desc: 'Mostly clear with light overcast.',
  },
  {
    Icon: Cloud,
    label: 'Cloudy',
    band: '60–69°',
    tone: 'text-text-dim',
    desc: 'Warming — watch DNS auth & cadence.',
  },
  {
    Icon: CloudRain,
    label: 'Rainy',
    band: '50–59°',
    tone: 'text-accent4',
    desc: 'Soft bounce shower, throttle replies up.',
  },
  {
    Icon: CloudLightning,
    label: 'Stormy',
    band: '< 50°',
    tone: 'text-accent3',
    desc: 'Severe weather warning — mitigations now.',
  },
];

function WeatherLegend(): JSX.Element {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
        <Sparkles size={12} strokeWidth={2} className="text-accent" />
        Legend
        <span className="text-text-faint">·</span>
        <span className="text-text-faint">how we translate reputation into weather</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {LEGEND_ITEMS.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.04 + i * 0.05, ease: 'easeOut' }}
            className="flex items-start gap-2 rounded-2xl border border-border-muted bg-surface p-3"
          >
            <div className="rounded-lg border border-border-muted bg-surface-2 p-1.5">
              <item.Icon size={16} strokeWidth={1.6} className={item.tone} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-[12.5px] font-semibold ${item.tone}`}>{item.label}</span>
                <span className="font-mono text-[10.5px] text-text-faint">{item.band}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-text-dim leading-snug">{item.desc}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-client mini cards — short context strip under hero
// ---------------------------------------------------------------------------

interface SubClientGroup {
  id: string;
  name: string;
  domains: AgencyReputationData['domains'];
  avg: number;
  status: 'healthy' | 'warming' | 'at_risk';
}

function groupBySubClient(d: AgencyReputationData): SubClientGroup[] {
  const map = new Map<string, SubClientGroup>();
  for (const dom of d.domains) {
    const ex = map.get(dom.subClientId);
    if (ex) {
      ex.domains.push(dom);
    } else {
      map.set(dom.subClientId, {
        id: dom.subClientId,
        name: dom.subClientName,
        domains: [dom],
        avg: 0,
        status: 'healthy',
      });
    }
  }
  for (const g of map.values()) {
    const total = g.domains.reduce((sum, dd) => sum + dd.reputationScore, 0);
    g.avg = g.domains.length ? Math.round(total / g.domains.length) : 0;
    const worst = g.domains.reduce<'healthy' | 'warming' | 'at_risk'>((acc, dd) => {
      if (acc === 'at_risk' || dd.status === 'at_risk') return 'at_risk';
      if (acc === 'warming' || dd.status === 'warming') return 'warming';
      return 'healthy';
    }, 'healthy');
    g.status = worst;
  }
  return Array.from(map.values()).sort((a, b) => b.avg - a.avg);
}

function SubClientStrip({ d }: { d: AgencyReputationData }): JSX.Element {
  const groups = useMemo(() => groupBySubClient(d), [d]);
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-4 py-6 text-center text-[12px] text-text-faint">
        No sub-clients yet.
      </div>
    );
  }
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
        <Hourglass size={12} strokeWidth={2} className="text-accent" />
        Sub-client cities
        <span className="text-text-faint">·</span>
        <span className="text-text-faint">{groups.length} portfolios</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((g, i) => (
          <SubClientCard key={g.id} group={g} index={i} />
        ))}
      </div>
    </section>
  );
}

function SubClientCard({ group, index }: { group: SubClientGroup; index: number }): JSX.Element {
  const weather = classifyWeather(group.avg);
  const WIcon = weather.Icon;
  const tone = STATUS_TONE[group.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: index * 0.07, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className={`rounded-2xl border ${tone.border} ${tone.bg} p-3.5`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.16em] text-text-dim">
            {group.name}
          </div>
          <div className={`mt-0.5 text-[20px] font-semibold leading-none ${TEMP_TONE[weather.key]}`}>
            {group.avg}
            <span className="text-[12px] text-text-dim">°</span>
          </div>
        </div>
        <motion.div
          animate={
            weather.key === 'sunny'
              ? { rotate: [0, 360] }
              : { y: [0, 2, 0] }
          }
          transition={{
            duration: weather.key === 'sunny' ? 22 : 2.6,
            ease: weather.key === 'sunny' ? 'linear' : 'easeInOut',
            repeat: Infinity,
          }}
          className="rounded-xl border border-border-muted bg-surface/60 p-1.5"
        >
          <WIcon size={16} strokeWidth={1.6} className={TEMP_TONE[weather.key]} />
        </motion.div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10.5px] text-text-dim">
        <span>{group.domains.length} domain{group.domains.length === 1 ? '' : 's'}</span>
        <span className={`font-semibold uppercase tracking-[0.14em] ${tone.text}`}>
          {STATUS_LABEL[group.status]}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-1">
        {group.domains.slice(0, 6).map((dom) => {
          const last7 = dom.last7dScores[dom.last7dScores.length - 1] ?? dom.reputationScore;
          const heightPct = clamp((last7 / 100) * 100, 6, 100);
          const stroke =
            dom.status === 'healthy'
              ? 'var(--wp-accent)'
              : dom.status === 'warming'
                ? 'var(--wp-warning, #ffb454)'
                : 'var(--wp-danger, #ff5c7a)';
          return (
            <div
              key={dom.id}
              className="flex-1 rounded-sm"
              style={{
                background: stroke,
                opacity: 0.65,
                height: `${heightPct * 0.32}px`,
                minHeight: 4,
              }}
              title={`${dom.domain}: ${last7}°`}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function AgRepF1Weather({
  data,
}: { data?: AgencyReputationData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const forecast = useMemo(() => buildForecast(d), [d]);

  // Local time + updated-ago are baked into a stable mock so the surface reads
  // deterministically. A production hook would consume the agency's tz +
  // engine heartbeat row.
  const localTime = '09:14';
  const updatedAgo = '14m ago';

  const hasDomains = d.domains.length > 0;

  return (
    <div className="space-y-7 px-1 pb-12">
      <HeaderStrip d={d} localTime={localTime} updatedAgo={updatedAgo} />

      <WeatherHeroCard d={d} />

      <ForecastStrip days={forecast} />

      {hasDomains ? <SubClientStrip d={d} /> : null}

      <DomainConditionsTable d={d} />

      <ClimateStrip providers={d.providers} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-text-dim">
            <BellRing size={12} strokeWidth={2} className="text-accent3" />
            Storm watch
            <span className="text-text-faint">·</span>
            <span className="text-text-faint">recent advisories</span>
          </div>
          <div className="hidden items-center gap-3 text-[10.5px] text-text-faint md:flex">
            <span className="inline-flex items-center gap-1.5">
              <Zap size={11} strokeWidth={2.4} className="text-accent3" />
              Critical
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CloudRain size={11} strokeWidth={2.4} className="text-accent4" />
              Watch
            </span>
          </div>
        </div>
        <StormWatchStrip alerts={d.recentAlerts} />
      </section>

      {/* Heat index summary band, mirrors C4 for visual continuity */}
      <section className="rounded-2xl border border-border-muted bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={14} strokeWidth={1.9} className="text-accent" />
            <div className="text-[12.5px] font-semibold text-text">Heat index</div>
            <span className="text-text-faint">·</span>
            <div className="text-[11.5px] text-text-dim">
              Operational pressure across the agency portfolio
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PortfolioCountChip
              tone="healthy"
              label="Sunny"
              value={d.summary.domainsHealthy}
              Icon={Sun}
            />
            <PortfolioCountChip
              tone="warming"
              label="Cloudy"
              value={d.summary.domainsWarming}
              Icon={Cloud}
            />
            <PortfolioCountChip
              tone="at_risk"
              label="Stormy"
              value={d.summary.domainsAtRisk}
              Icon={CloudLightning}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <SummaryLine
            Icon={Flame}
            label="Storm cells"
            value={
              d.summary.domainsAtRisk > 0
                ? `${d.summary.domainsAtRisk} active`
                : 'None active'
            }
            blurb={
              d.summary.domainsAtRisk > 0
                ? 'Open the warning to triage.'
                : 'Continue normal cadence.'
            }
            tone={d.summary.domainsAtRisk > 0 ? 'at_risk' : 'healthy'}
          />
          <SummaryLine
            Icon={CloudDrizzle}
            label="Bounce drizzle"
            value={fmtPct(d.summary.bouncePct24h, 1)}
            blurb={
              d.summary.bouncePct24h > 3
                ? 'Above safe ceiling.'
                : 'Within tolerated range.'
            }
            tone={
              d.summary.bouncePct24h > 4
                ? 'at_risk'
                : d.summary.bouncePct24h > 2
                  ? 'warming'
                  : 'healthy'
            }
          />
          <SummaryLine
            Icon={Wind}
            label="Spam wind"
            value={fmtPct(d.summary.spamComplaintPct24h, 2)}
            blurb={
              d.summary.spamComplaintPct24h > 0.5
                ? 'Trend up — review subject lines.'
                : 'Calm complaint pressure.'
            }
            tone={
              d.summary.spamComplaintPct24h > 1
                ? 'at_risk'
                : d.summary.spamComplaintPct24h > 0.3
                  ? 'warming'
                  : 'healthy'
            }
          />
        </div>
      </section>

      <WeatherLegend />

      {/* Footer sunset strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border-muted bg-surface px-4 py-3 text-[11px] text-text-dim">
        <div className="flex items-center gap-2">
          <Sunset size={13} strokeWidth={1.8} className="text-accent" />
          <span>
            Next forecast refresh in <span className="font-mono text-text">14m</span>.
          </span>
        </div>
        <div className="flex items-center gap-2 text-text-faint">
          Sunrise 06:42 · Sunset 19:48 · Forecast powered by the warmup engine.
        </div>
      </div>
    </div>
  );
}

interface PortfolioCountChipProps {
  tone: 'healthy' | 'warming' | 'at_risk';
  label: string;
  value: number;
  Icon: typeof Sun;
}

function PortfolioCountChip({ tone, label, value, Icon }: PortfolioCountChipProps): JSX.Element {
  const ton = STATUS_TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${ton.bg} ${ton.border} ${ton.text}`}
    >
      <Icon size={12} strokeWidth={2} />
      {label}
      <span className="font-mono">{value}</span>
    </span>
  );
}

interface SummaryLineProps {
  Icon: typeof Flame;
  label: string;
  value: string;
  blurb: string;
  tone: 'healthy' | 'warming' | 'at_risk';
}

function SummaryLine({ Icon, label, value, blurb, tone }: SummaryLineProps): JSX.Element {
  const ton = STATUS_TONE[tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl border ${ton.border} ${ton.bg} px-3 py-2.5`}>
      <Icon size={16} strokeWidth={1.8} className={ton.text} />
      <div className="flex-1 leading-tight">
        <div className="text-[10.5px] uppercase tracking-[0.14em] text-text-dim">{label}</div>
        <div className={`font-mono text-[15px] ${ton.text}`}>{value}</div>
        <div className="mt-0.5 text-[11px] text-text-dim">{blurb}</div>
      </div>
    </div>
  );
}

export default AgRepF1Weather;
