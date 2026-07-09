import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Inbox,
  Loader2,
  MailOpen,
  PieChart,
  RefreshCcw,
  Reply as ReplyIcon,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useMailboxes } from '@/features/mailboxes/api';
import {
  useAnalyticsDashboardSummary,
  useDailyMetrics,
} from '@/features/analytics/api';
import type {
  AnalyticsCommonParams,
  DailyMetricRow,
  DashboardSummary,
} from '@/features/analytics/types';
import './starter-analytics.css';

/**
 * /app/analytics — STARTER tier (N3 Tile Grid).
 *
 * Layout:
 *   ┌─ Header + date range chips ──────────┐
 *   ├──────────────┬───────────────────────┤
 *   │ Warmth trend │  Daily volume         │
 *   ├──────────────┼───────────────────────┤
 *   │ Placement    │  Engagement rates     │
 *   └──────────────┴───────────────────────┘
 *
 * Data:
 *   - useDailyMetrics({ from, to, granularity:'day' })  → tiles 1, 2, 4
 *   - useAnalyticsDashboardSummary()                    → tile 3 (placement)
 *
 * Starter is single-mailbox so we lock the mailbox filter and only expose
 * a date range (7d / 14d / 30d).
 */

type RangePreset = '7d' | '14d' | '30d';

const PRESETS: Array<{ key: RangePreset; label: string; days: number }> = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '14d', label: '14 days', days: 14 },
  { key: '30d', label: '30 days', days: 30 },
];

export function StarterAnalytics() {
  const mailboxesQuery = useMailboxes();
  const mailbox = mailboxesQuery.data?.items?.[0];

  const [preset, setPreset] = useState<RangePreset>('30d');
  const days = PRESETS.find((p) => p.key === preset)?.days ?? 30;

  const params = useMemo<AnalyticsCommonParams>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    return {
      mailbox_id: mailbox?.id,
      from: isoDate(from),
      to: isoDate(to),
      granularity: 'day',
    };
  }, [mailbox?.id, days]);

  const daily = useDailyMetrics(params);
  const summary = useAnalyticsDashboardSummary();

  const rows: DailyMetricRow[] = daily.data ?? [];
  const sum: DashboardSummary | undefined = summary.data;

  const isRefreshing = daily.isFetching || summary.isFetching;

  return (
    <div className="an">
      <header className="an__head">
        <div>
          <h1 className="an__title">Analytics</h1>
          <p className="an__sub">
            {mailbox
              ? `Pulse for ${mailbox.email_address} over the last ${days} days.`
              : `Pulse over the last ${days} days.`}
          </p>
        </div>
        <div className="an__head-actions">
          <div className="an__range" role="tablist">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={preset === p.key}
                className={`an__range-chip ${preset === p.key ? 'an__range-chip--active' : ''}`}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              daily.refetch();
              summary.refetch();
            }}
            disabled={isRefreshing}
            leftIcon={
              isRefreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )
            }
          >
            Refresh
          </Button>
        </div>
      </header>

      <div className="an-grid">
        <WarmthTrendTile rows={rows} loading={daily.isLoading} />
        <VolumeTile rows={rows} loading={daily.isLoading} />
        <PlacementTile summary={sum} loading={summary.isLoading} />
        <EngagementTile rows={rows} loading={daily.isLoading} />
      </div>
    </div>
  );
}

/* ============================================================================
   Tile 1 — Warmth trend (sparkline line chart)
============================================================================ */
function WarmthTrendTile({ rows, loading }: { rows: DailyMetricRow[]; loading: boolean }) {
  const series = rows.map((r) => Math.round(r.warmth_score ?? 0));
  const last = series.length > 0 ? series[series.length - 1] : 0;
  const first = series.length > 0 ? series[0] : 0;
  const delta = (last ?? 0) - (first ?? 0);
  const trend: 'up' | 'down' | 'flat' = delta > 1 ? 'up' : delta < -1 ? 'down' : 'flat';

  return (
    <TileShell
      title="Warmth trend"
      Icon={Sparkles}
      tone="violet"
      stat={`${last ?? 0}`}
      statSuffix="/100"
      footer={
        <span className={`an-tile__delta an-tile__delta--${trend}`}>
          {trend === 'up' && <TrendingUp size={11} strokeWidth={2.4} />}
          {trend === 'down' && <TrendingDown size={11} strokeWidth={2.4} />}
          {trend === 'flat' && '·'}
          {trend === 'flat'
            ? 'Steady'
            : `${delta > 0 ? '+' : ''}${delta} pts vs start of range`}
        </span>
      }
      loading={loading}
      empty={series.length === 0}
    >
      <Sparkline data={series} tone="violet" />
    </TileShell>
  );
}

/* ============================================================================
   Tile 2 — Daily volume (vertical bars)
============================================================================ */
function VolumeTile({ rows, loading }: { rows: DailyMetricRow[]; loading: boolean }) {
  const series = rows.map((r) => Number(r.sent ?? 0));
  const total = series.reduce((a, b) => a + b, 0);
  const avg = series.length > 0 ? Math.round(total / series.length) : 0;
  const peak = series.length > 0 ? Math.max(...series) : 0;

  return (
    <TileShell
      title="Daily volume"
      Icon={BarChart3}
      tone="cyan"
      stat={total.toString()}
      statSuffix="sent"
      footer={
        <span className="an-tile__foot-row">
          <span>
            <span className="an-tile__foot-num">{avg}</span>
            <span className="an-tile__foot-label">avg/day</span>
          </span>
          <span>
            <span className="an-tile__foot-num">{peak}</span>
            <span className="an-tile__foot-label">peak</span>
          </span>
        </span>
      }
      loading={loading}
      empty={series.length === 0}
    >
      <VerticalBars data={series} tone="cyan" />
    </TileShell>
  );
}

/* ============================================================================
   Tile 3 — Placement (donut: inbox / promotions / spam)
============================================================================ */
function PlacementTile({
  summary,
  loading,
}: {
  summary: DashboardSummary | undefined;
  loading: boolean;
}) {
  const inbox = summary?.placement?.inbox_pct ?? 0;
  const promo = summary?.placement?.promotions_pct ?? 0;
  const spam = summary?.placement?.spam_pct ?? 0;
  const hasData = inbox + promo + spam > 0;

  return (
    <TileShell
      title="Where emails land"
      Icon={PieChart}
      tone="green"
      stat={`${Math.round(inbox)}%`}
      statSuffix="inbox"
      footer={
        <span className="an-tile__legend">
          <LegendLine swatch="green" label="Inbox" value={Math.round(inbox)} />
          <LegendLine swatch="yellow" label="Promotions" value={Math.round(promo)} />
          <LegendLine swatch="red" label="Spam" value={Math.round(spam)} />
        </span>
      }
      loading={loading}
      empty={!hasData}
    >
      <Donut inbox={inbox} promo={promo} spam={spam} />
    </TileShell>
  );
}

/* ============================================================================
   Tile 4 — Engagement rates (horizontal progress bars)
============================================================================ */
function EngagementTile({
  rows,
  loading,
}: {
  rows: DailyMetricRow[];
  loading: boolean;
}) {
  // Aggregate the window: rate = total events / total sent.
  const totals = rows.reduce(
    (acc, r) => {
      acc.sent += Number(r.sent ?? 0);
      acc.opened += Number(r.opened ?? 0);
      acc.replied += Number(r.replied ?? 0);
      acc.starred += Number(r.starred ?? 0);
      acc.rescued += Number(r.spam_rescued ?? 0);
      return acc;
    },
    { sent: 0, opened: 0, replied: 0, starred: 0, rescued: 0 },
  );

  const safe = (num: number) => (totals.sent > 0 ? (num / totals.sent) * 100 : 0);
  const rates = [
    { label: 'Open rate', tone: 'green', Icon: MailOpen, pct: safe(totals.opened) },
    { label: 'Reply rate', tone: 'yellow', Icon: ReplyIcon, pct: safe(totals.replied) },
    { label: 'Star rate', tone: 'violet', Icon: Star, pct: safe(totals.starred) },
    { label: 'Spam recovery', tone: 'red', Icon: ShieldAlert, pct: safe(totals.rescued) },
  ];

  return (
    <TileShell
      title="Opens & replies"
      Icon={Activity}
      tone="yellow"
      stat={`${Math.round(safe(totals.opened))}%`}
      statSuffix="open rate"
      footer={
        <span className="an-tile__foot-label">
          Across {totals.sent} sends in the window
        </span>
      }
      loading={loading}
      empty={totals.sent === 0}
    >
      <div className="an-rate__bars">
        {rates.map((r) => {
          const Icon = r.Icon;
          return (
            <div key={r.label} className="an-rate__row">
              <span className="an-rate__head">
                <span className={`an-rate__icon an-rate__icon--${r.tone}`}>
                  <Icon size={11} strokeWidth={2.4} />
                </span>
                {r.label}
              </span>
              <div className="an-rate__track">
                <motion.div
                  className={`an-rate__fill an-rate__fill--${r.tone}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, r.pct)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <span className="an-rate__val">{r.pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </TileShell>
  );
}

/* ============================================================================
   Tile shell — shared title/stat/footer/empty/loading frame
============================================================================ */
function TileShell({
  title,
  Icon,
  tone,
  stat,
  statSuffix,
  footer,
  loading,
  empty,
  children,
}: {
  title: string;
  Icon: typeof Sparkles;
  tone: 'violet' | 'cyan' | 'green' | 'yellow';
  stat: string;
  statSuffix?: string;
  footer: React.ReactNode;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className={`an-tile an-tile--${tone}`}
    >
      <header className="an-tile__head">
        <span className="an-tile__title">
          <span className={`an-tile__title-icon an-tile__title-icon--${tone}`}>
            <Icon size={12} strokeWidth={2.4} />
          </span>
          {title}
        </span>
        <span className="an-tile__stat">
          {stat}
          {statSuffix && <span className="an-tile__stat-suffix">{statSuffix}</span>}
        </span>
      </header>

      <div className="an-tile__body">
        {loading ? (
          <div className="an-tile__empty">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading…</span>
          </div>
        ) : empty ? (
          <div className="an-tile__empty">
            <Inbox size={16} strokeWidth={2} style={{ opacity: 0.6 }} />
            <span>No data yet — first metrics land after Day 1.</span>
          </div>
        ) : (
          children
        )}
      </div>

      <footer className="an-tile__foot">{footer}</footer>
    </motion.section>
  );
}

/* ============================================================================
   Sparkline — SVG line with gradient fill
============================================================================ */
const TONE_COLORS: Record<string, string> = {
  violet: 'rgb(255, 150, 112)',
  cyan: 'rgb(255, 138, 75)',
  green: 'rgb(242, 101, 34)',
  yellow: 'rgb(255, 213, 79)',
  red: 'rgb(255, 107, 74)',
};

function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  const W = 320;
  const H = 80;
  const PAD = 6;
  if (data.length === 0) return null;
  const max = Math.max(100, ...data); // warmth is 0..100 but be defensive
  const min = Math.min(0, ...data);
  const range = Math.max(1, max - min);
  const step = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return { x, y };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${path} L ${pts[pts.length - 1]!.x.toFixed(1)} ${H - PAD} L ${pts[0]!.x.toFixed(1)} ${H - PAD} Z`;
  const color = TONE_COLORS[tone] ?? TONE_COLORS.violet!;
  const gradientId = `an-spark-${tone}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="an-spark">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      {pts.length > 0 && (
        <circle
          cx={pts[pts.length - 1]!.x}
          cy={pts[pts.length - 1]!.y}
          r={3}
          fill={color}
          stroke="rgb(18, 18, 26)"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}

/* ============================================================================
   Vertical bars — small column chart for daily volume
============================================================================ */
function VerticalBars({ data, tone }: { data: number[]; tone: string }) {
  const W = 320;
  const H = 80;
  const PAD = 4;
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const gap = data.length > 14 ? 1 : 2;
  const barW = (W - PAD * 2 - gap * (data.length - 1)) / data.length;
  const color = TONE_COLORS[tone] ?? TONE_COLORS.cyan!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="an-bars-svg">
      {data.map((v, i) => {
        const h = (v / max) * (H - PAD * 2);
        const x = PAD + i * (barW + gap);
        const y = H - PAD - h;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={Math.max(2, h)}
            rx={Math.min(2, barW / 2)}
            fill={color}
            opacity={0.85}
          >
            <title>{v}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/* ============================================================================
   Donut — inbox / promotions / spam (SVG arc segments)
============================================================================ */
function Donut({
  inbox,
  promo,
  spam,
}: {
  inbox: number;
  promo: number;
  spam: number;
}) {
  const total = Math.max(0.001, inbox + promo + spam);
  const slices = [
    { value: inbox / total, color: TONE_COLORS.green! },
    { value: promo / total, color: TONE_COLORS.yellow! },
    { value: spam / total, color: TONE_COLORS.red! },
  ];
  const R = 30;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <svg viewBox="0 0 80 80" className="an-donut">
      <circle cx={40} cy={40} r={R} fill="none" stroke="rgb(42, 42, 58)" strokeWidth={10} />
      {slices.map((s, i) => {
        const len = s.value * C;
        const dasharray = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
        const dashoffset = -offset;
        offset += len;
        return (
          <circle
            key={i}
            cx={40}
            cy={40}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={10}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 40 40)"
            strokeLinecap="butt"
          />
        );
      })}
      <text
        x={40}
        y={40}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fontWeight={700}
        fontFamily="Outfit, system-ui, sans-serif"
        fill="rgb(232, 232, 240)"
      >
        {Math.round(inbox)}
      </text>
      <text
        x={40}
        y={52}
        textAnchor="middle"
        fontSize={7}
        fontFamily="Outfit, system-ui, sans-serif"
        fill="rgb(136, 136, 160)"
        letterSpacing="0.08em"
      >
        INBOX%
      </text>
    </svg>
  );
}

/* ============================================================================
   Legend line for the placement tile
============================================================================ */
function LegendLine({
  swatch,
  label,
  value,
}: {
  swatch: 'green' | 'yellow' | 'red';
  label: string;
  value: number;
}) {
  return (
    <span className="an-legend-line">
      <span className={`an-legend-dot an-legend-dot--${swatch}`} />
      <span className="an-legend-label">{label}</span>
      <span className="an-legend-val">{value}%</span>
    </span>
  );
}

/* ============================================================================
   Helpers
============================================================================ */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default StarterAnalytics;
