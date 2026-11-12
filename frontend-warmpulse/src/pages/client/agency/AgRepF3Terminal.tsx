import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock,
  Flame,
  Globe,
  Hash,
  LineChart,
  Newspaper,
  Radio,
  Shield,
  Signal,
  Star,
  TrendingDown,
  TrendingUp,
  Volume2,
  Zap,
} from 'lucide-react';
import type { AgencyReputationData } from '@/pages/client/agency/AgRepC4Forecast';
import { formatNumber } from '@/lib/format';

/**
 * AgRepF3Terminal — Agency-tier REPUTATION surface #F3, "Bloomberg Terminal".
 *
 * /app/reputation for Agency-tier operators rendered as a financial terminal:
 * each sub-client domain is a "ticker symbol" trading on a deliverability
 * exchange. Reputation moves like a stock price; alerts are market news.
 * Highly information-dense, monospace, orange-on-black.
 *
 * Layout anatomy (top → bottom):
 *   1. TERMINAL HEADER BAND — agency as exchange, current index value styled
 *      like a stock price ("NDX 78.42 · +2.4 (+3.16%)"), market status dot,
 *      live 8-character HH:MM:SS timestamp ticking once a second.
 *   2. INDEX CHART STRIP — full-width candlestick chart of overall reputation
 *      across the last 30 periods (derived synthetic OHLC), volume bars
 *      below, period buttons "1D|5D|1M|7D|ALL", crosshair on hover with
 *      OHLC + volume tooltip.
 *   3. WATCHLIST — left rail of 8 sub-client tickers as stocks (ticker, last
 *      price, change, %change, volume mini, up/down arrow). At-risk rows
 *      flash on a 2s pulse loop.
 *   4. TOP MOVERS + LOSERS — middle column; top 3 gainers vs bottom 3 losers.
 *   5. NEWS FEED — right rail; recentAlerts as Bloomberg news headlines with
 *      severity badges, mono right-aligned timestamps, gentle vertical
 *      scroll animation.
 *   6. FOOTER STATUS BAR — providers row styled as FX rates ("GMAIL / SPF:
 *      94.2% · DKIM: 98.1% · INBOX: 91.4%").
 *
 * Distinct from sibling Reputation candidates: this is a TRADING TERMINAL.
 * NOT a weather forecast, NOT a radar map, NOT a hospital monitor, NOT a
 * periodic table. The visual metaphor is candlesticks + tickers + news wire.
 *
 * Fully STANDALONE — accepts `data?: AgencyReputationData`, falls back to
 * the inline Northwind MOCK so the preview harness can mount it prop-less.
 * Renders only page content; the shell supplies sidebar / chrome. Uses ONLY
 * the Shailog orange palette via CSS vars; never hardcodes violet, blue,
 * teal, etc. green / red appear ONLY as price up / price down semantics.
 */

// ---------------------------------------------------------------------------
// Local re-declarations (mirror AgRepC4Forecast so we are self-contained)
// ---------------------------------------------------------------------------

type DomainStatus = 'healthy' | 'warming' | 'at_risk';
type AlertKind = 'bounce_spike' | 'spam_complaint' | 'dns_break' | 'peer_failed';

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
    { id: 'helix-outbound-com', domain: 'send.helix.io', subClientId: 'helix', subClientName: 'Helix Outbound', reputationScore: 91, status: 'healthy', spfPass: true, dkimPass: true, dmarcPass: true, mailboxCount: 12, inboxRatePct: 96.1, spamFolderPct: 1.2, last7dScores: [84, 86, 88, 89, 89, 90, 91], lastIncidentAgo: null, lastIncidentKind: null },
    { id: 'nimbus-reach-com', domain: 'mail.nimbusreach.com', subClientId: 'nimbus', subClientName: 'Nimbus Reach', reputationScore: 88, status: 'healthy', spfPass: true, dkimPass: true, dmarcPass: true, mailboxCount: 9, inboxRatePct: 94.4, spamFolderPct: 1.6, last7dScores: [82, 83, 85, 86, 87, 88, 88], lastIncidentAgo: null, lastIncidentKind: null },
    { id: 'orion-mail-co', domain: 'out.orionmail.co', subClientId: 'orion', subClientName: 'Orion Mail', reputationScore: 84, status: 'healthy', spfPass: true, dkimPass: true, dmarcPass: true, mailboxCount: 7, inboxRatePct: 92.0, spamFolderPct: 1.9, last7dScores: [80, 81, 82, 83, 83, 84, 84], lastIncidentAgo: '2d ago', lastIncidentKind: 'peer_failed' },
    { id: 'vega-sends-com', domain: 'sx.vegasends.com', subClientId: 'vega', subClientName: 'Vega Sends', reputationScore: 82, status: 'healthy', spfPass: true, dkimPass: true, dmarcPass: false, mailboxCount: 6, inboxRatePct: 90.2, spamFolderPct: 2.1, last7dScores: [78, 79, 80, 80, 81, 82, 82], lastIncidentAgo: '5d ago', lastIncidentKind: 'dns_break' },
    { id: 'quasar-studio-com', domain: 'send.quasarstudio.com', subClientId: 'quasar', subClientName: 'Quasar Studio', reputationScore: 80, status: 'healthy', spfPass: true, dkimPass: true, dmarcPass: true, mailboxCount: 5, inboxRatePct: 89.0, spamFolderPct: 2.4, last7dScores: [76, 77, 78, 78, 79, 80, 80], lastIncidentAgo: null, lastIncidentKind: null },
    { id: 'lyra-pipeline-io', domain: 'mx.lyrapipeline.io', subClientId: 'lyra', subClientName: 'Lyra Pipeline', reputationScore: 71, status: 'warming', spfPass: true, dkimPass: true, dmarcPass: false, mailboxCount: 4, inboxRatePct: 81.6, spamFolderPct: 3.4, last7dScores: [62, 64, 66, 67, 68, 70, 71], lastIncidentAgo: '14h ago', lastIncidentKind: 'bounce_spike' },
    { id: 'pixel-drop-co', domain: 'out.pixeldrop.co', subClientId: 'pixel', subClientName: 'Pixel Drop', reputationScore: 64, status: 'warming', spfPass: true, dkimPass: false, dmarcPass: false, mailboxCount: 3, inboxRatePct: 74.3, spamFolderPct: 4.7, last7dScores: [54, 56, 58, 60, 61, 63, 64], lastIncidentAgo: '6h ago', lastIncidentKind: 'spam_complaint' },
    { id: 'atlas-bio-co', domain: 'send.atlasbio.co', subClientId: 'atlas', subClientName: 'Atlas Bio', reputationScore: 42, status: 'at_risk', spfPass: false, dkimPass: false, dmarcPass: false, mailboxCount: 4, inboxRatePct: 51.2, spamFolderPct: 12.6, last7dScores: [58, 56, 53, 50, 47, 44, 42], lastIncidentAgo: '38m ago', lastIncidentKind: 'bounce_spike' },
  ],
  providers: [
    { id: 'gmail', label: 'Gmail', inboxPct: 93.1, spamPct: 1.7, blockedPct: 0.4, last24hSends: 8420 },
    { id: 'outlook', label: 'Outlook', inboxPct: 89.4, spamPct: 2.6, blockedPct: 0.8, last24hSends: 4310 },
    { id: 'yahoo', label: 'Yahoo', inboxPct: 84.7, spamPct: 3.1, blockedPct: 1.2, last24hSends: 2090 },
  ],
  recentAlerts: [
    { id: 'al-1', domain: 'send.atlasbio.co', kind: 'bounce_spike', message: 'Bounce rate climbed to 14.2% in the last hour.', ago: '38m ago', severity: 'critical' },
    { id: 'al-2', domain: 'out.pixeldrop.co', kind: 'spam_complaint', message: 'Two spam complaints recorded against Gmail recipients.', ago: '6h ago', severity: 'warn' },
    { id: 'al-3', domain: 'mx.lyrapipeline.io', kind: 'bounce_spike', message: 'Lyra warmup bounces ticked above 4% threshold.', ago: '14h ago', severity: 'warn' },
    { id: 'al-4', domain: 'sx.vegasends.com', kind: 'dns_break', message: 'DMARC record missing on apex; child domains unaffected.', ago: '5d ago', severity: 'warn' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => formatNumber(n);
const fmtPct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;
const fmtPrice = (n: number): string => n.toFixed(2);
const fmtSigned = (n: number, digits = 2): string => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

// Derive a 4-character ticker symbol from a domain prefix.
function deriveTicker(domain: string): string {
  // e.g. "send.helix.io" → "HELX"; "out.pixeldrop.co" → "PXDR"
  const raw = domain.replace(/^(send|mail|out|sx|mx)\./i, '').split('.')[0] ?? domain;
  const letters = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length === 0) return 'XXXX';
  if (letters.length <= 4) return letters.padEnd(4, 'X');
  // pick first letter + 3 consonants for density
  const first = letters[0];
  const consonants = letters
    .slice(1)
    .split('')
    .filter((c) => !'AEIOU'.includes(c));
  const picked = (first + consonants.join('')).padEnd(4, 'X').slice(0, 4);
  return picked;
}

function deriveIndexCode(agencyName: string): string {
  // Northwind Agency → "NDX"; Acme → "ADX"
  const words = agencyName.split(/\s+/);
  const first = words[0]?.[0]?.toUpperCase() ?? 'A';
  return `${first}DX`;
}

// Synthetic OHLC bar derived from a single score + neighbors and a small noise.
// Deterministic by index so renders match.
interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  label: string;
  ts: number;
}

function pseudoNoise(seed: number): number {
  // small deterministic pseudo-random in [-1, 1]
  const s = Math.sin(seed * 9301.0 + 49297.0) * 233280.0;
  return s - Math.floor(s) - 0.5;
}

function buildCandles(
  domains: AgencyReputationData['domains'],
  summary: AgencyReputationData['summary'],
): Candle[] {
  // Build 30 synthetic OHLC bars. Start from oldest average (overall - delta),
  // end at current overall. Each bar adds noise & range based on at_risk count.
  const target = summary.overallScore;
  const startAvg = clamp(target - summary.trend7dDelta * 3, 35, 99);
  const volatility = 1.3 + summary.domainsAtRisk * 0.4;
  const baseVol = Math.max(80, summary.totalSends24h / 30);
  const candles: Candle[] = [];
  const periods = 30;
  for (let i = 0; i < periods; i++) {
    const t = i / (periods - 1);
    const drift = startAvg + (target - startAvg) * t;
    const noiseOpen = pseudoNoise(i * 3.1) * volatility;
    const noiseClose = pseudoNoise(i * 3.1 + 1.7) * volatility;
    const open = clamp(drift + noiseOpen, 25, 99);
    const close = clamp(drift + noiseClose + (t > 0.7 ? 0.4 : 0), 25, 99);
    const wickHi = Math.abs(pseudoNoise(i * 5.3)) * (volatility + 0.6);
    const wickLo = Math.abs(pseudoNoise(i * 5.3 + 2.1)) * (volatility + 0.4);
    const high = clamp(Math.max(open, close) + wickHi, 25, 99.5);
    const low = clamp(Math.min(open, close) - wickLo, 24, 99.5);
    const v = baseVol * (0.6 + Math.abs(pseudoNoise(i * 1.9)) * 0.8);
    void domains; // referenced via summary, kept for signature parity
    candles.push({
      open,
      high,
      low,
      close,
      volume: Math.round(v),
      label: `T-${periods - 1 - i}`,
      ts: i,
    });
  }
  return candles;
}

interface Mover {
  id: string;
  ticker: string;
  domain: string;
  subClientName: string;
  price: number;
  delta: number;
  pct: number;
}

function buildMovers(domains: AgencyReputationData['domains']): {
  top: Mover[];
  bottom: Mover[];
} {
  const moves: Mover[] = domains.map((d) => {
    const firstScore = d.last7dScores[0] ?? d.reputationScore;
    const last = d.last7dScores[d.last7dScores.length - 1] ?? d.reputationScore;
    const delta = last - firstScore;
    const pct = firstScore > 0 ? (delta / firstScore) * 100 : 0;
    return {
      id: d.id,
      ticker: deriveTicker(d.domain),
      domain: d.domain,
      subClientName: d.subClientName,
      price: d.reputationScore,
      delta,
      pct,
    };
  });
  const sorted = [...moves].sort((a, b) => b.delta - a.delta);
  return {
    top: sorted.slice(0, 3),
    bottom: sorted.slice(-3).reverse(),
  };
}

// Map AlertKind → ticker-tape category code, with a wire-style prefix.
const ALERT_PREFIX: Record<AlertKind, string> = {
  bounce_spike: 'BREAKING',
  spam_complaint: 'ALERT',
  dns_break: 'NOTICE',
  peer_failed: 'NOTICE',
};

const ALERT_CATEGORY: Record<AlertKind, string> = {
  bounce_spike: 'BOUNCE',
  spam_complaint: 'COMPLAINT',
  dns_break: 'AUTH',
  peer_failed: 'PEER',
};

// ---------------------------------------------------------------------------
// Sub-component: TickingClock
// ---------------------------------------------------------------------------

function TickingClock(): JSX.Element {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return (
    <span
      className="font-mono text-[12px] tracking-[0.18em]"
      style={{
        color: 'var(--wp-accent-2)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {hh}:{mm}:{ss} UTC
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: TerminalHeader
// ---------------------------------------------------------------------------

function TerminalHeader({
  data,
  indexCode,
}: {
  data: AgencyReputationData;
  indexCode: string;
}): JSX.Element {
  const overall = data.summary.overallScore;
  const delta = data.summary.trend7dDelta;
  const pct = overall - delta > 0 ? (delta / (overall - delta)) * 100 : 0;
  const isUp = delta >= 0;

  // Market status: green dot = open (>=70), orange = volatile (50-69), red = at risk
  const marketStatus: 'open' | 'volatile' | 'at_risk' =
    overall >= 70 ? 'open' : overall >= 50 ? 'volatile' : 'at_risk';

  const STATUS_LABEL: Record<typeof marketStatus, string> = {
    open: 'MARKET OPEN',
    volatile: 'VOLATILE',
    at_risk: 'AT RISK',
  };
  const STATUS_DOT_COLOR: Record<typeof marketStatus, string> = {
    open: 'var(--wp-success)',
    volatile: 'var(--wp-warning)',
    at_risk: 'var(--wp-danger)',
  };

  return (
    <div
      className="relative overflow-hidden rounded-md"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--wp-accent) 7%, var(--wp-surface)) 0%, var(--wp-surface) 100%)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 24%, transparent)',
      }}
    >
      {/* Subtle scanline grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, var(--wp-text) 3px, var(--wp-text) 4px)',
        }}
      />
      <div className="relative flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        {/* LEFT: Exchange name + ticker + region + market status */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded"
              style={{
                background: 'color-mix(in srgb, var(--wp-accent) 18%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 36%, transparent)',
              }}
            >
              <Radio size={14} style={{ color: 'var(--wp-accent)' }} />
            </div>
            <div className="flex flex-col leading-tight">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.28em]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                {data.agency.name.toUpperCase()} DELIVERABILITY EXCHANGE
              </span>
              <span
                className="font-mono text-[15px] font-semibold tracking-[0.18em]"
                style={{ color: 'var(--wp-accent)' }}
              >
                {indexCode} · {data.agency.region.toUpperCase()}
              </span>
            </div>
          </div>

          <div
            className="h-7 w-px"
            style={{ background: 'color-mix(in srgb, var(--wp-accent) 22%, transparent)' }}
          />

          <div className="flex items-center gap-2">
            <motion.span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: STATUS_DOT_COLOR[marketStatus],
                boxShadow: `0 0 8px ${STATUS_DOT_COLOR[marketStatus]}`,
              }}
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span
              className="font-mono text-[11px] tracking-[0.22em]"
              style={{ color: STATUS_DOT_COLOR[marketStatus] }}
            >
              {STATUS_LABEL[marketStatus]}
            </span>
          </div>
        </div>

        {/* RIGHT: Index value, delta, timestamp */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-mono text-[11px] uppercase tracking-[0.22em]"
              style={{ color: 'var(--wp-text-dim)' }}
            >
              {indexCode}
            </span>
            <span
              className="font-mono text-[26px] font-bold tracking-tight"
              style={{
                color: 'var(--wp-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtPrice(overall)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isUp ? (
              <ArrowUp size={14} style={{ color: 'var(--wp-success)' }} />
            ) : (
              <ArrowDown size={14} style={{ color: 'var(--wp-danger)' }} />
            )}
            <span
              className="font-mono text-[14px] font-semibold"
              style={{
                color: isUp ? 'var(--wp-success)' : 'var(--wp-danger)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtSigned(delta)} ({fmtSigned(pct)}%)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock size={11} style={{ color: 'var(--wp-text-faint)' }} />
            <TickingClock />
          </div>
        </div>
      </div>

      {/* Bottom ticker tape — micro stats */}
      <div
        className="relative flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t px-4 py-1.5"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 4%, transparent)',
        }}
      >
        <MicroStat label="LISTED" value={String(data.domains.length).padStart(2, '0')} />
        <MicroStat label="ACTIVE" value={String(data.summary.domainsHealthy).padStart(2, '0')} />
        <MicroStat
          label="VOLATILE"
          value={String(data.summary.domainsWarming).padStart(2, '0')}
          tone="warning"
        />
        <MicroStat
          label="HALTED"
          value={String(data.summary.domainsAtRisk).padStart(2, '0')}
          tone="danger"
        />
        <MicroStat label="24H VOL" value={fmtInt(data.summary.totalSends24h)} />
        <MicroStat label="BOUNCE" value={fmtPct(data.summary.bouncePct24h)} tone="warning" />
        <MicroStat label="COMPLAINT" value={fmtPct(data.summary.spamComplaintPct24h)} tone="warning" />
      </div>
    </div>
  );
}

function MicroStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
}): JSX.Element {
  const colorMap = {
    neutral: 'var(--wp-text)',
    warning: 'var(--wp-warning)',
    danger: 'var(--wp-danger)',
    success: 'var(--wp-success)',
  } as const;
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="font-mono text-[9px] uppercase tracking-[0.22em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[12px] font-semibold"
        style={{
          color: colorMap[tone],
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: CandlestickChart
// ---------------------------------------------------------------------------

interface CrosshairPos {
  x: number;
  y: number;
  candleIdx: number;
}

function CandlestickChart({ candles }: { candles: Candle[] }): JSX.Element {
  const [period, setPeriod] = useState<'1D' | '5D' | '1M' | '7D' | 'ALL'>('1M');
  const [hover, setHover] = useState<CrosshairPos | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const minLow = Math.min(...candles.map((c) => c.low));
  const maxHigh = Math.max(...candles.map((c) => c.high));
  const pad = 2;
  const yMin = Math.max(0, minLow - pad);
  const yMax = Math.min(100, maxHigh + pad);
  const range = yMax - yMin;

  const maxVol = Math.max(...candles.map((c) => c.volume));

  // SVG coords: 800 × 320 viewBox. 0..280 candles, 280..320 volume strip.
  const W = 800;
  const H = 320;
  const PLOT_H = 240;
  const VOL_H = 60;
  const VOL_Y = PLOT_H + 8;
  const candleW = W / candles.length;

  const yFor = (v: number): number => PLOT_H - ((v - yMin) / range) * PLOT_H;
  const volYFor = (v: number): number => VOL_H - (v / maxVol) * (VOL_H - 4);

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const xRel = ((e.clientX - rect.left) / rect.width) * W;
      const yRel = ((e.clientY - rect.top) / rect.height) * H;
      const idx = clamp(Math.floor(xRel / candleW), 0, candles.length - 1);
      setHover({ x: xRel, y: yRel, candleIdx: idx });
    },
    [candleW, candles.length],
  );

  const handleLeave = useCallback(() => setHover(null), []);

  const hoveredCandle = hover ? candles[hover.candleIdx] : null;

  // Gridlines at 4 horizontal levels
  const gridLevels = [yMin, yMin + range * 0.25, yMin + range * 0.5, yMin + range * 0.75, yMax];

  return (
    <div
      className="relative overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 18%, transparent)',
      }}
    >
      {/* Chart top bar */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <LineChart size={14} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Index Chart · OHLC · 30 Periods
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(['1D', '5D', '1M', '7D', 'ALL'] as const).map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors"
                style={{
                  color: active ? 'var(--wp-surface)' : 'var(--wp-text-dim)',
                  background: active ? 'var(--wp-accent)' : 'transparent',
                  border: `1px solid color-mix(in srgb, var(--wp-accent) ${active ? 60 : 18}%, transparent)`,
                  borderRadius: 3,
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart body */}
      <div className="relative px-3 py-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-[320px] w-full"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        >
          {/* Background grid */}
          {gridLevels.map((lvl, i) => (
            <g key={`grid-${i}`}>
              <line
                x1={0}
                x2={W}
                y1={yFor(lvl)}
                y2={yFor(lvl)}
                stroke="color-mix(in srgb, var(--wp-text) 8%, transparent)"
                strokeWidth={0.5}
                strokeDasharray="4 4"
              />
              <text
                x={W - 2}
                y={yFor(lvl) - 2}
                textAnchor="end"
                fontSize={9}
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                fill="color-mix(in srgb, var(--wp-text) 40%, transparent)"
              >
                {lvl.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Volume baseline */}
          <line
            x1={0}
            x2={W}
            y1={VOL_Y + VOL_H}
            y2={VOL_Y + VOL_H}
            stroke="color-mix(in srgb, var(--wp-accent) 22%, transparent)"
            strokeWidth={0.6}
          />
          <text
            x={4}
            y={VOL_Y + 10}
            fontSize={8}
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fill="color-mix(in srgb, var(--wp-text) 40%, transparent)"
          >
            VOL
          </text>

          {/* Candles + volume bars */}
          {candles.map((c, i) => {
            const cx = i * candleW + candleW / 2;
            const bodyW = Math.max(2, candleW * 0.6);
            const isUp = c.close >= c.open;
            const color = isUp ? 'var(--wp-success)' : 'var(--wp-danger)';
            const wickTop = yFor(c.high);
            const wickBot = yFor(c.low);
            const bodyTop = yFor(Math.max(c.open, c.close));
            const bodyBot = yFor(Math.min(c.open, c.close));
            const bodyH = Math.max(1, bodyBot - bodyTop);
            return (
              <motion.g
                key={`candle-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02, duration: 0.25 }}
              >
                {/* Wick */}
                <line
                  x1={cx}
                  x2={cx}
                  y1={wickTop}
                  y2={wickBot}
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.85}
                />
                {/* Body */}
                <rect
                  x={cx - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={bodyH}
                  fill={isUp ? color : color}
                  opacity={isUp ? 0.85 : 0.9}
                  stroke={color}
                  strokeWidth={0.6}
                />
                {/* Volume bar */}
                <rect
                  x={cx - bodyW / 2}
                  y={VOL_Y + volYFor(c.volume)}
                  width={bodyW}
                  height={VOL_H - volYFor(c.volume)}
                  fill={color}
                  opacity={0.4}
                />
              </motion.g>
            );
          })}

          {/* Crosshair */}
          {hover && hoveredCandle && (
            <g pointerEvents="none">
              <line
                x1={hover.candleIdx * candleW + candleW / 2}
                x2={hover.candleIdx * candleW + candleW / 2}
                y1={0}
                y2={H}
                stroke="var(--wp-accent)"
                strokeWidth={0.6}
                strokeDasharray="3 3"
                opacity={0.7}
              />
              <line
                x1={0}
                x2={W}
                y1={hover.y}
                y2={hover.y}
                stroke="var(--wp-accent)"
                strokeWidth={0.6}
                strokeDasharray="3 3"
                opacity={0.5}
              />
            </g>
          )}
        </svg>

        {/* Tooltip overlay */}
        <AnimatePresence>
          {hover && hoveredCandle && (
            <motion.div
              key="tooltip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="pointer-events-none absolute"
              style={{
                left: `${(hover.x / W) * 100}%`,
                top: 10,
                transform: 'translateX(8px)',
                background: 'color-mix(in srgb, var(--wp-surface) 92%, transparent)',
                border: '1px solid color-mix(in srgb, var(--wp-accent) 40%, transparent)',
                borderRadius: 4,
                padding: '6px 10px',
                minWidth: 160,
              }}
            >
              <div
                className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--wp-accent)' }}
              >
                {hoveredCandle.label} · OHLC
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                <TooltipRow label="O" value={fmtPrice(hoveredCandle.open)} />
                <TooltipRow label="H" value={fmtPrice(hoveredCandle.high)} tone="success" />
                <TooltipRow label="L" value={fmtPrice(hoveredCandle.low)} tone="danger" />
                <TooltipRow label="C" value={fmtPrice(hoveredCandle.close)} />
              </div>
              <div
                className="mt-1 border-t pt-1"
                style={{ borderColor: 'color-mix(in srgb, var(--wp-accent) 18%, transparent)' }}
              >
                <TooltipRow label="VOL" value={fmtInt(hoveredCandle.volume)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TooltipRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}): JSX.Element {
  const color =
    tone === 'success'
      ? 'var(--wp-success)'
      : tone === 'danger'
        ? 'var(--wp-danger)'
        : 'var(--wp-text)';
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="font-mono text-[9px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[11px] font-semibold"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Watchlist
// ---------------------------------------------------------------------------

interface WatchlistRow {
  id: string;
  ticker: string;
  domain: string;
  subClientName: string;
  price: number;
  delta: number;
  pct: number;
  volume: number;
  status: DomainStatus;
}

function Watchlist({
  domains,
  selectedId,
  onSelect,
}: {
  domains: AgencyReputationData['domains'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const rows: WatchlistRow[] = useMemo(
    () =>
      domains.map((d) => {
        const firstScore = d.last7dScores[0] ?? d.reputationScore;
        const last = d.last7dScores[d.last7dScores.length - 1] ?? d.reputationScore;
        const delta = last - firstScore;
        const pct = firstScore > 0 ? (delta / firstScore) * 100 : 0;
        return {
          id: d.id,
          ticker: deriveTicker(d.domain),
          domain: d.domain,
          subClientName: d.subClientName,
          price: d.reputationScore,
          delta,
          pct,
          volume: d.mailboxCount,
          status: d.status,
        };
      }),
    [domains],
  );

  const maxVol = Math.max(...rows.map((r) => r.volume), 1);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 18%, transparent)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <Star size={13} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Watchlist · {rows.length} symbols
          </span>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          LIVE
        </span>
      </div>

      {/* Column headers */}
      <div
        className="grid items-center gap-1 border-b px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em]"
        style={{
          color: 'var(--wp-text-faint)',
          borderColor: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)',
          gridTemplateColumns: '46px 1fr 48px 56px',
        }}
      >
        <span>SYMBOL</span>
        <span>LAST</span>
        <span className="text-right">CHG%</span>
        <span className="text-right">VOL</span>
      </div>

      <div className="flex flex-col overflow-y-auto">
        {rows.map((r, idx) => {
          const isUp = r.delta >= 0;
          const isAtRisk = r.status === 'at_risk';
          const isSelected = selectedId === r.id;
          const upColor = 'var(--wp-success)';
          const downColor = 'var(--wp-danger)';
          const volRatio = clamp(r.volume / maxVol, 0.05, 1);

          return (
            <motion.button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className="relative grid items-center gap-1 px-3 py-2 text-left transition-colors"
              style={{
                gridTemplateColumns: '46px 1fr 48px 56px',
                background: isSelected
                  ? 'color-mix(in srgb, var(--wp-accent) 10%, transparent)'
                  : idx % 2 === 0
                    ? 'transparent'
                    : 'color-mix(in srgb, var(--wp-text) 2%, transparent)',
                borderLeft: isSelected
                  ? '2px solid var(--wp-accent)'
                  : '2px solid transparent',
              }}
              animate={
                isAtRisk
                  ? { opacity: [1, 0.7, 1] }
                  : { opacity: 1 }
              }
              transition={
                isAtRisk
                  ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }
              }
              whileHover={{
                backgroundColor: 'color-mix(in srgb, var(--wp-accent) 8%, transparent)',
              }}
            >
              {/* Ticker symbol */}
              <div className="flex flex-col leading-none">
                <span
                  className="font-mono text-[12px] font-bold tracking-[0.06em]"
                  style={{
                    color: isAtRisk ? 'var(--wp-danger)' : 'var(--wp-accent)',
                  }}
                >
                  {r.ticker}
                </span>
                {isAtRisk && (
                  <span
                    className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[8px] uppercase tracking-[0.15em]"
                    style={{ color: 'var(--wp-danger)' }}
                  >
                    <CircleAlert size={7} />
                    HALT
                  </span>
                )}
              </div>

              {/* Last price + tiny name */}
              <div className="flex flex-col leading-tight">
                <span
                  className="font-mono text-[13px] font-semibold"
                  style={{
                    color: 'var(--wp-text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtPrice(r.price)}
                </span>
                <span
                  className="truncate font-mono text-[9px] uppercase tracking-[0.12em]"
                  style={{ color: 'var(--wp-text-faint)' }}
                >
                  {r.subClientName}
                </span>
              </div>

              {/* Change % */}
              <div className="flex items-center justify-end gap-0.5">
                {isUp ? (
                  <ArrowUp size={9} style={{ color: upColor }} />
                ) : (
                  <ArrowDown size={9} style={{ color: downColor }} />
                )}
                <span
                  className="font-mono text-[11px] font-semibold"
                  style={{
                    color: isUp ? upColor : downColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtSigned(r.pct, 1)}%
                </span>
              </div>

              {/* Volume bar mini */}
              <div className="flex items-center justify-end gap-1">
                <div
                  className="relative h-[14px] w-[36px] overflow-hidden rounded-sm"
                  style={{ background: 'color-mix(in srgb, var(--wp-text) 6%, transparent)' }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${volRatio * 100}%` }}
                    transition={{ duration: 0.4, delay: idx * 0.04 }}
                    className="h-full"
                    style={{
                      background: `linear-gradient(90deg, var(--wp-accent) 0%, var(--wp-accent-2) 100%)`,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <span
                  className="font-mono text-[9px]"
                  style={{
                    color: 'var(--wp-text-dim)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {r.volume}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div
        className="border-t px-3 py-1.5"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          Click to load symbol details
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: MoversPanel (top movers + losers)
// ---------------------------------------------------------------------------

function MoversPanel({ domains }: { domains: AgencyReputationData['domains'] }): JSX.Element {
  const { top, bottom } = useMemo(() => buildMovers(domains), [domains]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 18%, transparent)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={13} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Market Movers · 7D
          </span>
        </div>
      </div>

      {/* Top movers */}
      <MoversSection title="Top Movers" icon="up" rows={top} />

      {/* Divider */}
      <div
        className="h-px"
        style={{ background: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)' }}
      />

      {/* Top losers */}
      <MoversSection title="Top Losers" icon="down" rows={bottom} />

      {/* Footer micro stat */}
      <div
        className="mt-auto border-t px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center justify-between">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            Spread
          </span>
          <span
            className="font-mono text-[11px] font-semibold"
            style={{
              color: 'var(--wp-accent-2)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {top[0] && bottom[0]
              ? fmtSigned(top[0].delta - bottom[0].delta)
              : '0.00'}
          </span>
        </div>
      </div>
    </div>
  );
}

function MoversSection({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: 'up' | 'down';
  rows: Mover[];
}): JSX.Element {
  const isUp = icon === 'up';
  const accentColor = isUp ? 'var(--wp-success)' : 'var(--wp-danger)';
  const Glyph = isUp ? TrendingUp : TrendingDown;
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Glyph size={11} style={{ color: accentColor }} />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.22em]"
            style={{ color: accentColor }}
          >
            {title}
          </span>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {isUp ? '▲' : '▼'} {rows.length}
        </span>
      </div>

      {rows.map((r, idx) => {
        const sign = r.delta >= 0;
        const color = sign ? 'var(--wp-success)' : 'var(--wp-danger)';
        return (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, x: isUp ? -6 : 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.06, duration: 0.25 }}
            className="grid items-center gap-2 px-3 py-1.5"
            style={{ gridTemplateColumns: '48px 1fr 64px' }}
          >
            <span
              className="font-mono text-[11px] font-bold"
              style={{ color: 'var(--wp-accent)' }}
            >
              {r.ticker}
            </span>
            <span
              className="truncate font-mono text-[10px]"
              style={{
                color: 'var(--wp-text-dim)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtPrice(r.price)}
            </span>
            <div className="flex items-center justify-end gap-0.5">
              {sign ? (
                <ArrowUp size={9} style={{ color }} />
              ) : (
                <ArrowDown size={9} style={{ color }} />
              )}
              <span
                className="font-mono text-[11px] font-semibold"
                style={{ color, fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtSigned(r.delta, 1)}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: NewsFeed
// ---------------------------------------------------------------------------

function NewsFeed({
  alerts,
  domains,
}: {
  alerts: AgencyReputationData['recentAlerts'];
  domains: AgencyReputationData['domains'];
}): JSX.Element {
  // We will scroll the inner list up and back on a 6.4s cycle to mimic a
  // Bloomberg news ticker. The ScrollY is in CSS pixels, but we keep the
  // list shorter than the container to keep things tidy.

  // Build ticker info for each alert
  const tickerForDomain: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of domains) {
      m[d.domain] = deriveTicker(d.domain);
    }
    return m;
  }, [domains]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 18%, transparent)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <Newspaper size={13} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Newswire · Deliverability
          </span>
        </div>
        <motion.div
          className="flex items-center gap-1"
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: 'var(--wp-accent)',
              boxShadow: '0 0 6px var(--wp-accent)',
            }}
          />
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-accent)' }}
          >
            LIVE
          </span>
        </motion.div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* Scrolling feed */}
        <motion.div
          className="flex flex-col"
          animate={{ y: [0, 0, -22, -22, 0] }}
          transition={{
            duration: 6.4,
            times: [0, 0.45, 0.55, 0.95, 1],
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {alerts.map((a, i) => (
            <NewsItem
              key={a.id}
              alert={a}
              idx={i}
              ticker={tickerForDomain[a.domain] ?? 'XXXX'}
            />
          ))}

          {/* Append a few synthesized trailing entries so the loop never feels empty */}
          <SyntheticFiller index={0} />
          <SyntheticFiller index={1} />
        </motion.div>
      </div>

      {/* Footer */}
      <div
        className="border-t px-3 py-1.5"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {alerts.length} headlines · auto-refresh
        </span>
      </div>
    </div>
  );
}

function NewsItem({
  alert,
  idx,
  ticker,
}: {
  alert: AgencyReputationData['recentAlerts'][number];
  idx: number;
  ticker: string;
}): JSX.Element {
  const isCritical = alert.severity === 'critical';
  const severityColor = isCritical ? 'var(--wp-danger)' : 'var(--wp-warning)';
  const prefix = ALERT_PREFIX[alert.kind];
  const category = ALERT_CATEGORY[alert.kind];

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.08, duration: 0.3 }}
      className="border-b px-3 py-2"
      style={{
        borderColor: 'color-mix(in srgb, var(--wp-accent) 8%, transparent)',
        background: isCritical
          ? 'color-mix(in srgb, var(--wp-danger) 4%, transparent)'
          : 'transparent',
      }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <motion.span
            className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em]"
            style={{
              background: `color-mix(in srgb, ${severityColor} 18%, transparent)`,
              color: severityColor,
              border: `1px solid color-mix(in srgb, ${severityColor} 38%, transparent)`,
            }}
            animate={
              isCritical
                ? { opacity: [1, 0.55, 1] }
                : { opacity: 1 }
            }
            transition={
              isCritical
                ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.2 }
            }
          >
            {isCritical && <Zap size={8} />}
            {prefix}
          </motion.span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            {category}
          </span>
        </div>
        <span
          className="shrink-0 font-mono text-[9px] tracking-[0.1em]"
          style={{
            color: 'var(--wp-text-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {alert.ago.toUpperCase()}
        </span>
      </div>

      <div className="flex items-start gap-1.5">
        <span
          className="mt-px font-mono text-[10px] font-bold"
          style={{ color: 'var(--wp-accent)' }}
        >
          {ticker}
        </span>
        <span
          className="font-mono text-[10px] leading-snug"
          style={{ color: 'var(--wp-text)' }}
        >
          — {alert.message}
        </span>
      </div>
    </motion.div>
  );
}

function SyntheticFiller({ index }: { index: number }): JSX.Element {
  const items: Array<{ prefix: string; cat: string; msg: string; ticker: string; ago: string }> = [
    {
      prefix: 'NOTICE',
      cat: 'SYSTEM',
      msg: 'Peer rotation completed across 3 pools; reputations resampled.',
      ticker: 'SYSX',
      ago: '12m ago',
    },
    {
      prefix: 'ALERT',
      cat: 'AUTH',
      msg: 'DKIM key rotated for VEGA; signatures verifying within 5 min window.',
      ticker: 'VEGA',
      ago: '21m ago',
    },
  ];
  const item = items[index % items.length]!;
  return (
    <div
      className="border-b px-3 py-2"
      style={{ borderColor: 'color-mix(in srgb, var(--wp-accent) 8%, transparent)' }}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em]"
            style={{
              background: 'color-mix(in srgb, var(--wp-text-dim) 10%, transparent)',
              color: 'var(--wp-text-dim)',
              border: '1px solid color-mix(in srgb, var(--wp-text-dim) 28%, transparent)',
            }}
          >
            {item.prefix}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            {item.cat}
          </span>
        </div>
        <span
          className="shrink-0 font-mono text-[9px] tracking-[0.1em]"
          style={{
            color: 'var(--wp-text-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {item.ago.toUpperCase()}
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <span
          className="mt-px font-mono text-[10px] font-bold"
          style={{ color: 'var(--wp-accent)' }}
        >
          {item.ticker}
        </span>
        <span
          className="font-mono text-[10px] leading-snug"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          — {item.msg}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SymbolDetail (selected ticker quick stats)
// ---------------------------------------------------------------------------

function SymbolDetail({
  domain,
}: {
  domain: AgencyReputationData['domains'][number] | null;
}): JSX.Element {
  if (!domain) {
    return (
      <div
        className="flex items-center justify-center rounded-md px-4 py-6"
        style={{
          background: 'var(--wp-surface)',
          border: '1px solid color-mix(in srgb, var(--wp-accent) 14%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <Hash size={12} style={{ color: 'var(--wp-text-faint)' }} />
          <span
            className="font-mono text-[10px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            Select a symbol from the watchlist to inspect
          </span>
        </div>
      </div>
    );
  }

  const ticker = deriveTicker(domain.domain);
  const firstScore = domain.last7dScores[0] ?? domain.reputationScore;
  const last = domain.last7dScores[domain.last7dScores.length - 1] ?? domain.reputationScore;
  const delta = last - firstScore;
  const pct = firstScore > 0 ? (delta / firstScore) * 100 : 0;
  const isUp = delta >= 0;
  const upColor = isUp ? 'var(--wp-success)' : 'var(--wp-danger)';

  return (
    <motion.div
      key={domain.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 22%, transparent)',
      }}
    >
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 4%, transparent)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded font-mono text-[11px] font-bold"
            style={{
              background: 'color-mix(in srgb, var(--wp-accent) 16%, transparent)',
              border: '1px solid color-mix(in srgb, var(--wp-accent) 32%, transparent)',
              color: 'var(--wp-accent)',
            }}
          >
            {ticker.slice(0, 2)}
          </div>
          <div className="flex flex-col leading-tight">
            <div className="flex items-baseline gap-2">
              <span
                className="font-mono text-[14px] font-bold tracking-[0.06em]"
                style={{ color: 'var(--wp-accent)' }}
              >
                {ticker}
              </span>
              <span
                className="font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ color: 'var(--wp-text-dim)' }}
              >
                {domain.subClientName}
              </span>
            </div>
            <span
              className="font-mono text-[10px]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              {domain.domain}
            </span>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex flex-col items-end leading-none">
            <span
              className="font-mono text-[22px] font-bold"
              style={{
                color: 'var(--wp-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtPrice(domain.reputationScore)}
            </span>
            <span
              className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              LAST
            </span>
          </div>
          <div className="flex flex-col items-end leading-none">
            <div className="flex items-center gap-1">
              {isUp ? (
                <ArrowUp size={11} style={{ color: upColor }} />
              ) : (
                <ArrowDown size={11} style={{ color: upColor }} />
              )}
              <span
                className="font-mono text-[13px] font-semibold"
                style={{ color: upColor, fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtSigned(delta, 2)} ({fmtSigned(pct, 2)}%)
              </span>
            </div>
            <span
              className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: 'var(--wp-text-faint)' }}
            >
              7D CHG
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', background: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)' }}>
        <SymbolStat label="MBX" value={String(domain.mailboxCount)} />
        <SymbolStat
          label="INBOX"
          value={fmtPct(domain.inboxRatePct)}
          tone={domain.inboxRatePct >= 85 ? 'success' : domain.inboxRatePct >= 70 ? 'warning' : 'danger'}
        />
        <SymbolStat
          label="SPAM"
          value={fmtPct(domain.spamFolderPct)}
          tone={domain.spamFolderPct <= 2 ? 'success' : domain.spamFolderPct <= 5 ? 'warning' : 'danger'}
        />
        <SymbolStat
          label="SPF"
          value={domain.spfPass ? 'OK' : 'FAIL'}
          tone={domain.spfPass ? 'success' : 'danger'}
        />
        <SymbolStat
          label="DKIM"
          value={domain.dkimPass ? 'OK' : 'FAIL'}
          tone={domain.dkimPass ? 'success' : 'danger'}
        />
        <SymbolStat
          label="DMARC"
          value={domain.dmarcPass ? 'OK' : 'FAIL'}
          tone={domain.dmarcPass ? 'success' : 'danger'}
        />
      </div>
    </motion.div>
  );
}

function SymbolStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}): JSX.Element {
  const colorMap = {
    neutral: 'var(--wp-text)',
    success: 'var(--wp-success)',
    warning: 'var(--wp-warning)',
    danger: 'var(--wp-danger)',
  } as const;
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2"
      style={{ background: 'var(--wp-surface)' }}
    >
      <span
        className="font-mono text-[9px] uppercase tracking-[0.22em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[13px] font-semibold"
        style={{
          color: colorMap[tone],
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: ProviderFxBar (footer)
// ---------------------------------------------------------------------------

function ProviderFxBar({
  providers,
}: {
  providers: AgencyReputationData['providers'];
}): JSX.Element {
  return (
    <div
      className="overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 18%, transparent)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <Globe size={13} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Provider FX · Realtime
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Signal size={11} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            {providers.length} pairs
          </span>
        </div>
      </div>

      <div
        className="grid divide-x"
        style={{
          gridTemplateColumns: `repeat(${Math.max(providers.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {providers.map((p, idx) => (
          <ProviderFxRow key={p.id} provider={p} idx={idx} />
        ))}
      </div>
    </div>
  );
}

function ProviderFxRow({
  provider,
  idx,
}: {
  provider: AgencyReputationData['providers'][number];
  idx: number;
}): JSX.Element {
  // Derive spf/dkim from inboxPct as a proxy (real metric varies; deterministic).
  const spf = clamp(provider.inboxPct + 1.1, 0, 100);
  const dkim = clamp(provider.inboxPct + 4.7, 0, 100);
  const inbox = provider.inboxPct;
  const isHealthy = inbox >= 90;
  const inboxColor = inbox >= 90 ? 'var(--wp-success)' : inbox >= 80 ? 'var(--wp-warning)' : 'var(--wp-danger)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: idx * 0.08, duration: 0.25 }}
      className="relative flex flex-col gap-1.5 px-4 py-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[12px] font-bold uppercase tracking-[0.16em]"
            style={{ color: 'var(--wp-accent)' }}
          >
            {provider.label.toUpperCase()}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            / DLV
          </span>
        </div>
        <motion.span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: inboxColor,
            boxShadow: `0 0 5px ${inboxColor}`,
          }}
          animate={{ opacity: [1, 0.6, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <FxStat label="SPF" value={fmtPct(spf)} />
        <FxStat label="DKIM" value={fmtPct(dkim)} />
        <FxStat label="INBOX" value={fmtPct(inbox)} tone={isHealthy ? 'success' : 'warning'} />
        <FxStat label="SPAM" value={fmtPct(provider.spamPct)} tone="danger" />
        <FxStat label="BLK" value={fmtPct(provider.blockedPct)} tone="warning" />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          24H VOL
        </span>
        <span
          className="font-mono text-[11px] font-semibold"
          style={{
            color: 'var(--wp-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtInt(provider.last24hSends)}
        </span>
      </div>
    </motion.div>
  );
}

function FxStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}): JSX.Element {
  const colorMap = {
    neutral: 'var(--wp-text)',
    success: 'var(--wp-success)',
    warning: 'var(--wp-warning)',
    danger: 'var(--wp-danger)',
  } as const;
  return (
    <div className="flex items-baseline gap-1">
      <span
        className="font-mono text-[8px] uppercase tracking-[0.22em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[10px] font-semibold"
        style={{
          color: colorMap[tone],
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: HotkeysBar (decorative footer status bar)
// ---------------------------------------------------------------------------

function HotkeysBar(): JSX.Element {
  const items: Array<{ key: string; label: string }> = [
    { key: 'F1', label: 'Help' },
    { key: 'F2', label: 'Quote' },
    { key: 'F3', label: 'Chart' },
    { key: 'F4', label: 'News' },
    { key: 'F5', label: 'Alerts' },
    { key: 'F6', label: 'Movers' },
    { key: 'F7', label: 'Export' },
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-1.5"
      style={{
        background: 'color-mix(in srgb, var(--wp-accent) 4%, var(--wp-surface))',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 16%, transparent)',
      }}
    >
      <span
        className="font-mono text-[9px] uppercase tracking-[0.22em]"
        style={{ color: 'var(--wp-text-faint)' }}
      >
        Hotkeys
      </span>
      {items.map((it) => (
        <div key={it.key} className="flex items-baseline gap-1">
          <span
            className="rounded px-1 py-px font-mono text-[9px] font-semibold tracking-[0.12em]"
            style={{
              color: 'var(--wp-accent)',
              border: '1px solid color-mix(in srgb, var(--wp-accent) 30%, transparent)',
              background: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)',
            }}
          >
            {it.key}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            {it.label}
          </span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        <Bell size={10} style={{ color: 'var(--wp-accent)' }} />
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-dim)' }}
        >
          NOTIFY ON
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

export function AgRepF3Terminal({ data }: { data?: AgencyReputationData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const indexCode = useMemo(() => deriveIndexCode(d.agency.name), [d.agency.name]);
  const candles = useMemo(() => buildCandles(d.domains, d.summary), [d.domains, d.summary]);

  // Default-select the first at_risk domain, else the first domain.
  const initialId = useMemo(() => {
    const risky = d.domains.find((x) => x.status === 'at_risk');
    return risky?.id ?? d.domains[0]?.id ?? null;
  }, [d.domains]);

  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const selectedDomain = useMemo(
    () => d.domains.find((x) => x.id === selectedId) ?? null,
    [d.domains, selectedId],
  );

  // Reset selectedId when the data prop changes (so harness can swap MOCK → real)
  useEffect(() => {
    setSelectedId(initialId);
  }, [initialId]);

  // The whole page area: full-bleed black-ish terminal canvas.
  return (
    <div
      className="relative flex w-full flex-col gap-3 p-3 sm:p-4"
      style={{
        background: 'var(--wp-surface)',
        color: 'var(--wp-text)',
        minHeight: '100%',
      }}
    >
      {/* Background — subtle dotted grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: `
            radial-gradient(color-mix(in srgb, var(--wp-text) 60%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative z-10 flex flex-col gap-3">
        {/* 1. Header */}
        <TerminalHeader data={d} indexCode={indexCode} />

        {/* 2. Index chart strip */}
        <CandlestickChart candles={candles} />

        {/* 3. Symbol detail (driven by selectedId) */}
        <SymbolDetail domain={selectedDomain} />

        {/* 4. Main 3-column grid: Watchlist + Movers + Newsfeed */}
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)_minmax(280px,360px)]">
          <div className="min-h-[480px]">
            <Watchlist
              domains={d.domains}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <div className="flex min-h-[480px] flex-col gap-3">
            <MoversPanel domains={d.domains} />
            <PortfolioSummaryStrip data={d} />
          </div>
          <div className="min-h-[480px]">
            <NewsFeed alerts={d.recentAlerts} domains={d.domains} />
          </div>
        </div>

        {/* 5. Provider FX bar (footer) */}
        <ProviderFxBar providers={d.providers} />

        {/* 6. Hotkeys decorative status bar */}
        <HotkeysBar />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: PortfolioSummaryStrip — fills the middle column under Movers
// ---------------------------------------------------------------------------

function PortfolioSummaryStrip({ data }: { data: AgencyReputationData }): JSX.Element {
  const { summary, domains } = data;
  const sparkSrc = useMemo(() => {
    // Average each day position
    if (domains.length === 0) return [0, 0, 0, 0, 0, 0, 0];
    const days = 7;
    return Array.from({ length: days }, (_, idx) => {
      let total = 0;
      let count = 0;
      for (const dom of domains) {
        const v = dom.last7dScores[idx];
        if (typeof v === 'number') {
          total += v;
          count += 1;
        }
      }
      return count > 0 ? total / count : 0;
    });
  }, [domains]);

  const minVal = Math.min(...sparkSrc);
  const maxVal = Math.max(...sparkSrc);
  const range = Math.max(1, maxVal - minVal);
  const isUp = summary.trend7dDelta >= 0;
  const sparkColor = isUp ? 'var(--wp-success)' : 'var(--wp-danger)';

  return (
    <div
      className="overflow-hidden rounded-md"
      style={{
        background: 'var(--wp-surface)',
        border: '1px solid color-mix(in srgb, var(--wp-accent) 18%, transparent)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 14%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <Activity size={13} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Portfolio Snapshot · 7D
          </span>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {domains.length} positions
        </span>
      </div>

      <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', background: 'color-mix(in srgb, var(--wp-accent) 10%, transparent)' }}>
        <BigStat
          label="HEALTHY"
          value={String(summary.domainsHealthy).padStart(2, '0')}
          tone="success"
          icon={<CheckCircle2 size={11} />}
        />
        <BigStat
          label="WARMING"
          value={String(summary.domainsWarming).padStart(2, '0')}
          tone="warning"
          icon={<Flame size={11} />}
        />
        <BigStat
          label="AT RISK"
          value={String(summary.domainsAtRisk).padStart(2, '0')}
          tone="danger"
          icon={<AlertTriangle size={11} />}
        />
        <BigStat
          label="VOL/24H"
          value={fmtInt(summary.totalSends24h)}
          tone="neutral"
          icon={<Volume2 size={11} />}
        />
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex flex-col leading-tight">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            Aggregate 7D
          </span>
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: sparkColor, fontVariantNumeric: 'tabular-nums' }}
          >
            {fmtSigned(summary.trend7dDelta, 2)}
          </span>
        </div>
        <div className="relative h-[36px] flex-1">
          <svg
            viewBox="0 0 280 36"
            preserveAspectRatio="none"
            className="block h-full w-full"
          >
            {/* baseline */}
            <line
              x1={0}
              y1={18}
              x2={280}
              y2={18}
              stroke="color-mix(in srgb, var(--wp-text) 10%, transparent)"
              strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            {/* polyline */}
            <polyline
              fill="none"
              stroke={sparkColor}
              strokeWidth={1.5}
              points={sparkSrc
                .map((v, i) => {
                  const x = (i / (sparkSrc.length - 1)) * 280;
                  const y = 32 - ((v - minVal) / range) * 28;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            {/* dots */}
            {sparkSrc.map((v, i) => {
              const x = (i / (sparkSrc.length - 1)) * 280;
              const y = 32 - ((v - minVal) / range) * 28;
              return (
                <circle key={i} cx={x} cy={y} r={1.6} fill={sparkColor} />
              );
            })}
          </svg>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-faint)' }}
          >
            INDEX
          </span>
          <span
            className="font-mono text-[12px] font-bold"
            style={{
              color: 'var(--wp-accent)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fmtPrice(summary.overallScore)}
          </span>
        </div>
      </div>

      <div
        className="flex items-center justify-between border-t px-3 py-1.5"
        style={{
          borderColor: 'color-mix(in srgb, var(--wp-accent) 12%, transparent)',
          background: 'color-mix(in srgb, var(--wp-accent) 3%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <Shield size={10} style={{ color: 'var(--wp-accent)' }} />
          <span
            className="font-mono text-[9px] uppercase tracking-[0.22em]"
            style={{ color: 'var(--wp-text-dim)' }}
          >
            Bounce {fmtPct(summary.bouncePct24h)} · Complaint {fmtPct(summary.spamComplaintPct24h)}
          </span>
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          AUTO-REFRESH 15S
        </span>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  icon: JSX.Element;
}): JSX.Element {
  const colorMap = {
    neutral: 'var(--wp-text)',
    success: 'var(--wp-success)',
    warning: 'var(--wp-warning)',
    danger: 'var(--wp-danger)',
  } as const;
  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2.5"
      style={{ background: 'var(--wp-surface)' }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color: colorMap[tone] }}>{icon}</span>
        <span
          className="font-mono text-[9px] uppercase tracking-[0.22em]"
          style={{ color: 'var(--wp-text-faint)' }}
        >
          {label}
        </span>
      </div>
      <span
        className="font-mono text-[18px] font-bold"
        style={{
          color: colorMap[tone],
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default AgRepF3Terminal;
