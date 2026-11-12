import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Mail,
  MailOpen,
  MessageSquare,
  Minus,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMailboxes } from '@/features/mailboxes/api';
import { useDashboardSummary, useTodayStats } from '@/features/dashboard/api';
import './starter-dashboard.css';

/**
 * /app/dashboard — STARTER tier (S1 Focus Card layout, picked from
 * /client-design-preview/dashboards/starter).
 *
 * Starter reality: ONE mailbox. So this view is hyper-focused on that
 * single inbox — one big card with the warmth gauge centered, 4 KPI
 * tiles at the corners, a 30-day trend strip, and a DNS health row.
 *
 * Data sources (all existing):
 *   - useMailboxes()           → single connected mailbox (or empty state)
 *   - useDashboardSummary()    → warmth_score · warmth_delta · trend_30d
 *   - useTodayStats()          → sent · opens · replies · spam_rescues today
 */

interface MailboxLike {
  provider?: string;
  current_day?: number;
  dns_status?: {
    spf?: 'pass' | 'warn' | 'fail' | string;
    dkim?: 'pass' | 'warn' | 'fail' | string;
    dmarc?: 'pass' | 'warn' | 'fail' | string;
  };
}

export function StarterDashboard() {
  const mailboxesQuery = useMailboxes();
  const summaryQuery = useDashboardSummary();
  const todayQuery = useTodayStats();

  const mailboxes = mailboxesQuery.data?.items ?? [];
  const mailbox = mailboxes[0];

  // Empty state — no mailbox connected yet (post-onboarding).
  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
    return (
      <div className="sd">
        <header className="sd__heading">
          <h1 className="sd__title">Dashboard</h1>
          <p className="sd__sub">
            Live warmth, inbox vs spam and activity once your mailbox is connected.
          </p>
        </header>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailbox connected"
          description="Finish onboarding to connect your warmup mailbox and watch its warmth climb."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const summary = summaryQuery.data;
  const today = todayQuery.data;

  const warmth = Math.round(summary?.warmth_score ?? mailbox?.warmth_score ?? 0);
  const delta = Math.round((summary?.warmth_delta ?? 0) * 10) / 10;
  const trend = summary?.trend_30d ?? [];
  const dayInRamp = (mailbox as unknown as MailboxLike)?.current_day ?? null;

  const sent = today?.sent ?? 0;
  const opens = today?.opens ?? 0;
  const replies = today?.replies ?? 0;
  const spamRescues = today?.spam_rescues ?? 0;

  return (
    <div className="sd">
      <header className="sd__heading">
        <h1 className="sd__title">Dashboard</h1>
        <p className="sd__sub">
          Live warmth and activity for {mailbox?.email_address ?? 'your mailbox'}.
        </p>
      </header>

      {/* Focus card — gauge + 4 corner KPIs */}
      <motion.section
        className="sd-focus"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="sd-focus__top-meta">
          {mailbox?.provider && (
            <span className="sd-focus__provider-pill">
              <Mail size={11} strokeWidth={2.4} />
              {prettyProvider(mailbox.provider)}
            </span>
          )}
          {dayInRamp != null && (
            <span className="sd-focus__day-pill">
              <Calendar size={11} strokeWidth={2.4} />
              Day {dayInRamp}
            </span>
          )}
        </div>

        <Gauge value={warmth} delta={delta} />

        <Kpi
          area="kpi1"
          icon={<Send size={12} strokeWidth={2.4} />}
          label="Sent today"
          value={sent}
          foot={mailbox?.daily_target ? `of ${mailbox.daily_target} target` : '—'}
        />
        <Kpi
          area="kpi2"
          icon={<MailOpen size={12} strokeWidth={2.4} />}
          label="Opens"
          value={opens}
          foot={openRate(sent, opens)}
        />
        <Kpi
          area="kpi3"
          icon={<MessageSquare size={12} strokeWidth={2.4} />}
          label="Replies"
          value={replies}
          foot={replyRate(sent, replies)}
        />
        <Kpi
          area="kpi4"
          icon={<ShieldCheck size={12} strokeWidth={2.4} />}
          label="Spam recovery"
          value={spamRescues}
          foot={spamRescues === 0 ? 'No recovery needed' : 'Pulled from spam'}
        />
      </motion.section>

      {/* 30-day warmth trend */}
      <motion.section
        className="sd-trend"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
      >
        <div className="sd-trend__head">
          <span className="sd-trend__title">
            <TrendingUp size={12} strokeWidth={2.4} />
            Warmth · last 30 days
          </span>
          <span className="sd-trend__range">{trend.length}d data</span>
        </div>
        <div className="sd-trend__chart">
          {trend.length === 0 ? (
            <div className="sd-trend__empty">
              Trend will appear after a few days of warmup activity.
            </div>
          ) : (
            <TrendSparkline points={trend.map((p) => p.warmth_score ?? 0)} />
          )}
        </div>
      </motion.section>

      {/* DNS health row */}
      <motion.section
        className="sd-dns"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.16 }}
      >
        <span className="sd-dns__title">
          <Sparkles size={12} strokeWidth={2.4} />
          Domain records (DNS) health
        </span>
        <div className="sd-dns__records">
          {(['spf', 'dkim', 'dmarc'] as const).map((rec) => {
            const status = readDnsStatus(mailbox as unknown as MailboxLike, rec);
            return (
              <span key={rec} className={`sd-dns__rec sd-dns__rec--${status}`}>
                <span className="sd-dns__rec-dot" />
                {rec.toUpperCase()}
              </span>
            );
          })}
        </div>
      </motion.section>
    </div>
  );
}

/* ============================================================================
   Sub-components
============================================================================ */

function Gauge({ value, delta }: { value: number; delta: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;

  // Scale labels around the OUTSIDE of the ring. 0 and 100 share the same
  // angular position on a closed ring; we used to stamp a separate "100"
  // chip inside the ring, but it collided with the "WARMTH" label and the
  // big score in the centre. Dropping it leaves the four evenly-spaced
  // stops (0/25/50/75) outside the ring — the top-of-ring tick reads as
  // both the start (0) and the cap (100) without crowding the centre.
  const tickStops = [0, 25, 50, 75] as const;

  return (
    <div className="sd-focus__gauge-wrap">
      <div
        className="sd-focus__gauge"
        style={{ ['--pct' as string]: String(pct) } as React.CSSProperties}
        aria-label={`Warmth score ${value} out of 100`}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Radial ticks + scale numbers around the outside of the ring. */}
        <div className="sd-focus__gauge-ticks" aria-hidden="true">
          {tickStops.map((stop) => {
            const angle = stop * 3.6; // 0–100 → 0–360°
            const reached = stop <= pct;
            return (
              <div
                key={stop}
                className={`sd-focus__gauge-tick ${reached ? 'sd-focus__gauge-tick--on' : ''}`}
                style={{ ['--a' as string]: `${angle}deg` } as React.CSSProperties}
              >
                <span className="sd-focus__gauge-tick-mark" />
                <span className="sd-focus__gauge-tick-num">{stop}</span>
              </div>
            );
          })}
        </div>
        <div className="sd-focus__gauge-center">
          <span className="sd-focus__gauge-label">Warmth</span>
          <span className="sd-focus__gauge-num">{value}</span>
          <span className={`sd-focus__gauge-delta sd-focus__gauge-delta--${direction}`}>
            <DeltaIcon size={11} strokeWidth={2.4} />
            {delta === 0 ? '— · 24h' : `${delta > 0 ? '+' : ''}${delta} · 24h`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  area,
  icon,
  label,
  value,
  foot,
}: {
  area: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  foot: string;
}) {
  return (
    <div
      className={`sd-focus__kpi sd-focus__kpi--${area.slice(-1)}`}
      style={{ gridArea: area }}
    >
      <span className="sd-focus__kpi-head">
        {icon}
        {label}
      </span>
      <span className="sd-focus__kpi-num">{value}</span>
      <span className="sd-focus__kpi-foot">{foot}</span>
    </div>
  );
}

function TrendSparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  // Wider canvas + manual aspect-ratio so the labels we now stamp on
  // each significant point have room to breathe. Previously the chart
  // scaled to 800x120 with no axis ticks — the result was a "what does
  // this number mean?" line. Now: y-axis baseline (0/50/100), per-point
  // markers, and value labels stamped every Nth point so the user can
  // identify any value at a glance.
  const w = 820;
  const h = 160;
  const padLeft = 36;    // axis labels (0, 50, 100) live here
  const padRight = 16;
  const padTop = 16;     // headroom for value labels above each dot
  const padBottom = 22;  // x-axis date hints
  const usableW = w - padLeft - padRight;
  const usableH = h - padTop - padBottom;
  const max = 100;       // warmth is always 0..100, so anchor the axis
  const min = 0;

  // Project a value → canvas coords.
  const xAt = (i: number): number =>
    points.length > 1
      ? padLeft + (i / (points.length - 1)) * usableW
      : padLeft + usableW / 2;
  const yAt = (v: number): number =>
    padTop + (1 - (v - min) / (max - min)) * usableH;

  const pathPts = points
    .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
    .join(' ');
  const areaPts = `${xAt(0).toFixed(1)},${h - padBottom} ${pathPts} ${xAt(points.length - 1).toFixed(1)},${h - padBottom}`;

  // Stamp value labels at sparse intervals to keep the chart readable.
  // With 30 daily points we want ~5–6 labels — pick every 6th point and
  // always include the last point so today's value is explicit.
  const labelStep = Math.max(1, Math.floor(points.length / 5));
  const labelIndices = new Set<number>();
  for (let i = 0; i < points.length; i += labelStep) labelIndices.add(i);
  labelIndices.add(points.length - 1); // always show today

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      /* `xMidYMid meet` (the SVG default) keeps text & circles round.
         The chart container provides the actual pixel size; this SVG
         scales uniformly within it. */
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Warmth score, last 30 days"
    >
      <defs>
        <linearGradient id="sd-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--wp-accent, #F26522)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--wp-accent, #F26522)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y-axis baseline grid — three reference lines at 0 / 50 / 100. */}
      {[0, 50, 100].map((v) => {
        const y = yAt(v);
        return (
          <g key={v}>
            <line
              x1={padLeft}
              y1={y}
              x2={w - padRight}
              y2={y}
              stroke="color-mix(in srgb, var(--wp-text, #f4f4f5) 10%, transparent)"
              strokeWidth="0.6"
              strokeDasharray={v === 0 ? '0' : '3 4'}
            />
            <text
              x={padLeft - 8}
              y={y + 3}
              textAnchor="end"
              fontFamily="JetBrains Mono, monospace"
              fontSize="9"
              fontWeight="700"
              fill="var(--wp-text-dim, #a1a1aa)"
            >
              {v}
            </text>
          </g>
        );
      })}

      {/* Area fill */}
      <motion.polygon
        points={areaPts}
        fill="url(#sd-trend-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7 }}
      />

      {/* Trend line */}
      <motion.polyline
        points={pathPts}
        fill="none"
        stroke="var(--wp-accent, #F26522)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />

      {/* Per-point markers — every point gets a faint dot, labelled
          points get a brighter glow. Helps the eye land on a value. */}
      {points.map((v, i) => {
        const isLabelled = labelIndices.has(i);
        return (
          <motion.circle
            key={i}
            cx={xAt(i)}
            cy={yAt(v)}
            r={isLabelled ? 3 : 1.6}
            fill="var(--wp-accent, #F26522)"
            stroke={isLabelled ? 'var(--wp-bg, #0a0a0f)' : 'transparent'}
            strokeWidth={isLabelled ? 1.4 : 0}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.8 + i * 0.01 }}
          />
        );
      })}

      {/* Value labels — stamped above each highlighted point. */}
      {points.map((v, i) => {
        if (!labelIndices.has(i)) return null;
        const rounded = Math.round(v);
        return (
          <motion.g
            key={`lbl-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 1.2 + i * 0.02 }}
          >
            <text
              x={xAt(i)}
              y={yAt(v) - 10}
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontSize="10"
              fontWeight="700"
              fill="var(--wp-text, #f4f4f5)"
            >
              {rounded}
            </text>
          </motion.g>
        );
      })}

      {/* X-axis hints — first / mid / last day labels. */}
      {points.length > 1
        ? [
            { i: 0, label: `Day 1` },
            { i: Math.floor((points.length - 1) / 2), label: `Day ${Math.floor((points.length - 1) / 2) + 1}` },
            { i: points.length - 1, label: `Day ${points.length}` },
          ].map(({ i, label }) => (
            <text
              key={`x-${i}`}
              x={xAt(i)}
              y={h - 6}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontFamily="JetBrains Mono, monospace"
              fontSize="9"
              fontWeight="600"
              fill="var(--wp-text-faint, #71717a)"
            >
              {label}
            </text>
          ))
        : null}
    </svg>
  );
}

/* ============================================================================
   Helpers
============================================================================ */

function prettyProvider(p: string): string {
  const lower = p.toLowerCase();
  if (lower.includes('google') || lower.includes('gmail')) return 'Gmail';
  if (lower.includes('365') || lower.includes('outlook') || lower.includes('office')) {
    return 'Outlook';
  }
  if (lower.includes('yahoo')) return 'Yahoo';
  if (lower.includes('zoho')) return 'Zoho';
  return p;
}

function openRate(sent: number, opens: number): string {
  if (sent <= 0) return 'No sends yet';
  return `${Math.round((opens / sent) * 100)}% open rate`;
}

function replyRate(sent: number, replies: number): string {
  if (sent <= 0) return 'No sends yet';
  return `${Math.round((replies / sent) * 100)}% reply rate`;
}

function readDnsStatus(
  mailbox: MailboxLike | undefined,
  rec: 'spf' | 'dkim' | 'dmarc',
): 'ok' | 'warn' | 'err' {
  const raw = mailbox?.dns_status?.[rec];
  if (!raw) return 'warn'; // unknown defaults to warn (prompts user to check)
  const lower = String(raw).toLowerCase();
  if (lower.includes('pass') || lower.includes('ok') || lower.includes('valid')) return 'ok';
  if (lower.includes('fail') || lower.includes('invalid') || lower.includes('missing'))
    return 'err';
  return 'warn';
}

// Lucide icons referenced via the icon prop but tree-shaker also needs this so
// the imports above stay if I rearrange later. No-op.
void [CheckCircle2, Activity];

export default StarterDashboard;
