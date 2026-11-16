import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Inbox,
  Mail,
  MailOpen,
  Reply,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAnalyticsDashboardSummary } from '@/features/analytics/api';
import { useMailboxes } from '@/features/mailboxes/api';
import type { Mailbox, MailboxProvider, MailboxStatus } from '@/features/mailboxes/types';
// TODO: lift pro-analytics.css into pages/client/analytics/ in a follow-up.
import '@/pages/client-design-preview/pro-analytics/pro-analytics.css';

/**
 * /app/analytics for Pro tier — N1 KPI Dashboard with real data.
 *
 * Data strategy: the aggregate `/workspace/analytics/dashboard/summary`
 * endpoint may return zero rows for a fresh workspace (no DailyMetric
 * rollups yet). `useAnalyticsDashboardSummary` already derives a
 * synthetic summary from the mailbox list in that case, so the KPI
 * grid and trend chart always show meaningful numbers as soon as one
 * mailbox is connected. When no mailboxes exist at all we fall through
 * to a friendly empty-state CTA.
 */
export function ProAnalytics() {
  const summaryQuery = useAnalyticsDashboardSummary();
  const mailboxesQuery = useMailboxes();
  const summary = summaryQuery.data;
  const mailboxes = mailboxesQuery.data?.items ?? [];

  // Empty state: no mailboxes (and we've finished loading).
  if (!mailboxesQuery.isLoading && mailboxes.length === 0) {
    return (
      <div className="n1">
        <section
          style={{
            margin: '40px auto',
            maxWidth: 480,
            padding: '36px 28px',
            borderRadius: 14,
            background: 'var(--wp-surface)',
            border: '1px solid var(--wp-border)',
            textAlign: 'center',
            display: 'grid',
            gap: 14,
            placeItems: 'center',
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 12,
              background: 'rgba(242, 101, 34, 0.12)',
              color: '#FF9670',
            }}
          >
            <Mail size={20} strokeWidth={2.2} />
          </span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--wp-text-strong)',
              }}
            >
              No analytics yet
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 13,
                color: 'var(--wp-text-faint)',
                lineHeight: 1.5,
              }}
            >
              Connect a mailbox to start warming up. KPIs, trends, and per-mailbox
              comparisons will appear here as warmup data lands.
            </p>
          </div>
          <Button asChild variant="primary">
            <Link to="/onboarding">Connect a mailbox</Link>
          </Button>
        </section>
      </div>
    );
  }

  const sentToday = summary?.sent_today ?? 0;
  const opensToday = summary?.opens_today ?? 0;
  const repliesToday = summary?.replies_today ?? 0;
  const spamRescuedToday = summary?.spam_rescues_today ?? 0;
  // Prefer aggregate summary when present; otherwise compute mean from mailbox warmth.
  const meanFromMailboxes =
    mailboxes.length > 0
      ? Math.round(
          mailboxes.reduce((acc, m) => acc + (Number(m.warmth_score) || 0), 0) /
            mailboxes.length,
        )
      : 0;
  const avgWarmth = (summary?.warmth_score ?? 0) || meanFromMailboxes;
  const mailboxCount = mailboxes.length;
  const activeCount = mailboxes.filter((m) => m.warmup_status === 'active').length;

  const openRate = sentToday > 0 ? Math.round((opensToday / sentToday) * 100) : 0;
  const replyRate = sentToday > 0 ? Math.round((repliesToday / sentToday) * 100) : 0;
  const inboxPct = summary?.placement.inbox_pct ?? 0;
  const spamPct = summary?.placement.spam_pct ?? 0;

  const kpis: Array<{
    label: string;
    value: string;
    tone: string;
    Icon: typeof Mail;
    delta: number;
    deltaLbl: string;
  }> = [
    { label: 'Avg warmth',      value: `${avgWarmth}`,                    tone: 'violet-soft', Icon: Sparkles,      delta: summary?.warmth_delta ?? 0, deltaLbl: 'wk' },
    { label: 'Sent today',      value: `${sentToday}`,                    tone: 'violet-soft', Icon: Mail,          delta: 0,                          deltaLbl: '' },
    { label: 'Open rate',       value: `${openRate}%`,                    tone: 'success',     Icon: MailOpen,      delta: 0,                          deltaLbl: '' },
    { label: 'Reply rate',      value: `${replyRate}%`,                   tone: 'warning',     Icon: Reply,         delta: 0,                          deltaLbl: '' },
    { label: 'Where emails land', value: `${Math.round(inboxPct)}%`,        tone: 'success',     Icon: Inbox,         delta: 0,                          deltaLbl: '' },
    { label: 'Spam %',          value: `${Math.round(spamPct * 10) / 10}%`, tone: 'success',   Icon: TrendingDown,  delta: 0,                          deltaLbl: '' },
    { label: 'Spam recovered',    value: `${spamRescuedToday}`,             tone: 'danger',      Icon: ShieldAlert,   delta: 0,                          deltaLbl: '' },
    { label: 'Mailboxes',       value: `${activeCount}/${mailboxCount}`,  tone: 'violet',      Icon: BarChart3,     delta: 0,                          deltaLbl: '' },
  ];

  // Trend priority:
  //   1. Aggregate summary's 30-day series (real DailyMetric history).
  //   2. Average of per-mailbox warmth sparklines.
  //   3. Synthesised warmup curve from current warmth + days into ramp.
  const realTrend = summary?.trend_30d ?? [];
  const sparkAvg = avgSparkline(mailboxes);
  const trendData: number[] =
    realTrend.length > 1
      ? realTrend.map((p) => Math.round(p.warmth_score))
      : sparkAvg.length > 1
        ? sparkAvg
        : synthesizeWarmupCurve(mailboxes);

  return (
    <div className="n1">
      {/* KPI grid */}
      <section className="n1__kpis">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.03 }}
            className={`n1__kpi n1__kpi--${k.tone}`}
          >
            <span className={`n1__kpi-icon n1__kpi-icon--${k.tone}`}>
              <k.Icon size={13} strokeWidth={2.4} />
            </span>
            <span className="n1__kpi-label">{k.label}</span>
            <span className="n1__kpi-value">
              {summaryQuery.isLoading ? '—' : k.value}
            </span>
            {k.delta !== 0 && (
              <span
                className={`n1__kpi-delta n1__kpi-delta--${k.delta > 0 ? 'up' : 'down'}`}
              >
                {k.delta > 0 ? (
                  <ArrowUpRight size={10} strokeWidth={2.6} />
                ) : (
                  <ArrowDownRight size={10} strokeWidth={2.6} />
                )}
                {Math.abs(k.delta)}
                {k.deltaLbl}
              </span>
            )}
          </motion.div>
        ))}
      </section>

      {/* Big trend chart */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="n1__chart"
      >
        <header className="n1-panel-head">
          <div>
            <span className="n1-panel-eyebrow">
              <TrendingUp size={11} strokeWidth={2.4} />
              {trendData.length}-day trend
            </span>
            <h3 className="n1-panel-title">Workspace warmth (avg across mailboxes)</h3>
          </div>
          <div className="n1__chart-legend">
            <span className="n1__legend-item">
              <span className="n1__legend-dot n1__legend-dot--accent" />
              Avg warmth
            </span>
          </div>
        </header>
        <TrendChart data={trendData} />
      </motion.section>

      {/* Per-mailbox comparison */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="n1__compare"
      >
        <header className="n1-panel-head">
          <span className="n1-panel-eyebrow">Per-mailbox</span>
          <h3 className="n1-panel-title">
            Comparison · {mailboxCount} mailbox{mailboxCount === 1 ? '' : 'es'}
          </h3>
        </header>
        <div className="n1__compare-table">
          <div className="n1__compare-th">
            <span>Mailbox</span>
            <span>Warmth</span>
            <span>Trend</span>
            <span>Sent today</span>
            <span>Target</span>
            <span>Day</span>
            <span>Status</span>
          </div>
          {mailboxesQuery.isLoading && mailboxes.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--wp-text-faint)', fontSize: 12 }}>
              Loading mailboxes…
            </div>
          ) : (
            mailboxes.map((m, i) => {
              const w = m.warmth_score ?? 0;
              const tone = toneFor(m);
              const spark = m.warmth_sparkline ?? [];
              const status = STATUS_LABEL[m.warmup_status];
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.25 + i * 0.03 }}
                  className="n1__compare-row"
                >
                  <span className="n1__compare-mb">
                    <ProviderSwatch provider={m.provider} size={22} />
                    <span>{m.email_address.split('@')[0]}</span>
                  </span>
                  <span className="n1__compare-warmth">
                    <span
                      className={`n1__compare-warmth-bar n1__compare-warmth-bar--${tone}`}
                      style={{ width: `${w}%` }}
                    />
                    <strong>{w}</strong>
                  </span>
                  <MiniSpark data={spark} tone={tone} width={80} height={20} />
                  <span className="n1__compare-num">
                    {m.sent_today ?? 0}
                    <span className="n1__compare-dim">/{m.daily_target}</span>
                  </span>
                  <span className="n1__compare-num">{m.daily_target}</span>
                  <span className="n1__compare-num">
                    {m.current_day}
                    <span className="n1__compare-dim">/30</span>
                  </span>
                  <span className={`n1__compare-status n1__compare-status--${tone}`}>
                    {status}
                  </span>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function toneFor(m: Mailbox): 'success' | 'warning' | 'danger' {
  if (m.warmup_status === 'paused') return 'danger';
  if ((m.warmth_score ?? 0) >= 80) return 'success';
  return 'warning';
}

const STATUS_LABEL: Record<MailboxStatus, string> = {
  active: 'Active',
  pending: 'Warming',
  paused: 'Paused',
  completed: 'Done',
};

function avgSparkline(mailboxes: Mailbox[]): number[] {
  const sparks = mailboxes
    .map((m) => m.warmth_sparkline)
    .filter((s): s is number[] => Array.isArray(s) && s.length > 0);
  if (sparks.length === 0) return [];
  const len = Math.min(...sparks.map((s) => s.length));
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const s of sparks) sum += s[i]!;
    out.push(Math.round(sum / sparks.length));
  }
  return out;
}

/**
 * Synthesise a 30-point warmup curve when no real history is available.
 *
 * Walks each mailbox backwards from its current warmth to a Day-1 baseline
 * using its `current_day` counter, then averages across mailboxes per point.
 * The result is intentionally smooth — not a fake "data plot", just a
 * representative ramp that won't mislead users about variance.
 */
function synthesizeWarmupCurve(mailboxes: Mailbox[]): number[] {
  if (mailboxes.length === 0) return [];
  const POINTS = 30;
  const out: number[] = [];
  for (let i = 0; i < POINTS; i++) {
    let sum = 0;
    for (const m of mailboxes) {
      const w = Number(m.warmth_score) || 0;
      const dayNow = Math.max(1, Number(m.current_day) || 1);
      const dayThen = Math.max(0, dayNow - (POINTS - 1 - i));
      const synth = dayNow === 0 ? w : (w * dayThen) / dayNow;
      sum += synth;
    }
    out.push(Math.max(0, Math.min(100, Math.round(sum / mailboxes.length))));
  }
  return out;
}

function ProviderSwatch({
  provider,
  size = 26,
}: {
  provider: MailboxProvider;
  size?: number;
}) {
  const letter =
    provider === 'gmail'
      ? 'G'
      : provider === 'outlook'
      ? 'O'
      : provider === 'yahoo'
      ? 'Y'
      : 'S';
  return (
    <span
      className={`mb-provider mb-provider--${provider}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}

function MiniSpark({
  data,
  tone,
  width = 70,
  height = 22,
}: {
  data: number[];
  tone: 'success' | 'warning' | 'danger';
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <span style={{ fontSize: 10, color: 'var(--wp-text-faint)' }}>—</span>
    );
  }
  const PAD = 1;
  const max = 100,
    min = 0;
  const step = (width - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: PAD + i * step,
    y: height - PAD - ((v - min) / (max - min)) * (height - PAD * 2),
  }));
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const colorMap = { success: '#3ddc97', warning: '#ffb454', danger: '#ff5c7a' };
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <path
        d={path}
        fill="none"
        stroke={colorMap[tone]}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendChart({ data }: { data: number[] }) {
  if (data.length < 2) {
    return (
      <div
        style={{
          height: 220,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--wp-text-faint)',
          fontSize: 12,
        }}
      >
        Not enough warmth history yet — check back after a few days of warmup.
      </div>
    );
  }
  const W = 800,
    H = 220,
    PAD = 24;
  const step = (W - PAD * 2) / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: PAD + i * step,
    y: H - PAD - (v / 100) * (H - PAD * 2),
  }));
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1]!;
  const first = pts[0]!;
  const area = `${path} L ${last.x} ${H - PAD} L ${first.x} ${H - PAD} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="n1__chart-svg"
    >
      <defs>
        <linearGradient id="pro-n1-grad-violet" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F26522" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#F26522" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD - p * (H - PAD * 2)}
          y2={H - PAD - p * (H - PAD * 2)}
          stroke="#1f1f1f"
          strokeDasharray="3 6"
        />
      ))}
      <path d={area} fill="url(#pro-n1-grad-violet)" />
      <path
        d={path}
        fill="none"
        stroke="#FF9670"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={3} fill="#FF9670" />
    </svg>
  );
}

export default ProAnalytics;
