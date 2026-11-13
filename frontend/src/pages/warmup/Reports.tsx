import { useMemo, useState } from 'react';
import { EmptyState, LoadError, Skeleton, StaleNotice, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  warmupDailyMetrics,
  warmupDashboardSummary,
  warmupMailboxStates,
  warmupPerMailboxReport,
  warmupPlacementTrend,
  type WarmupAnalyticsRange,
  type WarmupMailboxReportRow,
} from '../../lib/warmupApi';
import { downloadWarmupReportPdf } from '../../lib/warmupReport';
import { useChartTheme, warmthColor } from './chartTheme';

/** Range presets — the analytics routes take explicit from/to dates. */
const RANGES: Array<{ key: string; days: number; label: string }> = [
  { key: '7d', days: 7, label: 'Last 7 days' },
  { key: '30d', days: 30, label: 'Last 30 days' },
  { key: '90d', days: 90, label: 'Last 90 days' },
];

function rangeFor(days: number): WarmupAnalyticsRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** Workspace range totals for the summary cards. */
function totalsOf(rows: { emails_sent: number; opens: number; replies: number }[]) {
  return {
    sent: rows.reduce((a, r) => a + r.emails_sent, 0),
    opens: rows.reduce((a, r) => a + r.opens, 0),
    replies: rows.reduce((a, r) => a + r.replies, 0),
  };
}

/** Mean placement over the range (nulls when there is no signal). */
function meanPlacement(points: { inbox_pct: number; promotions_pct: number; spam_pct: number }[]) {
  if (points.length === 0) return { inbox: null as number | null, promotions: null as number | null, spam: null as number | null };
  const mean = (pick: (p: (typeof points)[number]) => number) =>
    Math.round(points.reduce((a, p) => a + pick(p), 0) / points.length);
  return {
    inbox: mean((p) => p.inbox_pct),
    promotions: mean((p) => p.promotions_pct),
    spam: mean((p) => p.spam_pct),
  };
}

/**
 * Reports tab of the Warmup section — the C8 port of the source reports
 * surface, scoped to what this backend serves: range analytics
 * (daily-metrics + placement-trend) rolled up into summary cards, a
 * per-mailbox warmup table, and a client-side jspdf export (lib/warmupReport).
 */
export function Reports() {
  const theme = useChartTheme();
  const [rangeKey, setRangeKey] = useState('30d');
  const preset = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const range = useMemo(() => rangeFor(preset.days), [preset.days]);

  // not range-scoped (live counters + warmth) — loads once, like the Overview tab
  const summary = useAsync(warmupDashboardSummary, []);
  // range-scoped — a new range is a different question, so useAsync resets
  const daily = useAsync(() => warmupDailyMetrics(range), [range]);
  const placementTrend = useAsync(() => warmupPlacementTrend(range), [range]);
  const rows = useAsync(async (): Promise<WarmupMailboxReportRow[]> => {
    const list = await warmupMailboxStates();
    return warmupPerMailboxReport(list.items, range);
  }, [range]);

  const totals = daily.data ? totalsOf(daily.data) : null;
  const placement = placementTrend.data ? meanPlacement(placementTrend.data) : null;

  const [exporting, setExporting] = useState(false);
  const onExport = () => {
    if (exporting || !summary.data || !rows.data || !totals) return;
    setExporting(true);
    try {
      downloadWarmupReportPdf({
        range,
        rangeLabel: preset.label,
        mailboxes: summary.data.total_mailboxes,
        activeMailboxes: summary.data.active_mailboxes,
        meanWarmth: summary.data.mean_warmth_score,
        warmthDelta: summary.data.warmth_delta_24h,
        sent: totals.sent,
        opens: totals.opens,
        replies: totals.replies,
        inboxPct: placement?.inbox ?? null,
        rows: rows.data,
      });
      toast.success('Warmup report PDF downloaded');
    } catch (e) {
      toast.error(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const reloadAll = () => {
    void summary.reload();
    void daily.reload();
    void placementTrend.reload();
    void rows.reload();
  };

  const openRate = totals && totals.sent > 0 ? Math.round((totals.opens / totals.sent) * 100) : null;
  const replyRate = totals && totals.sent > 0 ? Math.round((totals.replies / totals.sent) * 100) : null;
  const delta =
    summary.data !== null ? Math.round(summary.data.warmth_delta_24h * 10) / 10 : null;
  const hasInbox = placement !== null && placement.inbox !== null;

  const cards = [
    {
      label: 'Mean warmth',
      value: summary.data ? String(Math.round(summary.data.mean_warmth_score)) : '—',
      note: delta === null ? preset.label : `${delta >= 0 ? '+' : ''}${delta} vs yesterday`,
      highlight: true,
    },
    { label: 'Sent', value: totals ? totals.sent.toLocaleString() : '—', note: preset.label },
    {
      label: 'Opens',
      value: totals ? totals.opens.toLocaleString() : '—',
      note: openRate === null ? 'no sends in range' : `${openRate}% of sent`,
    },
    {
      label: 'Replies',
      value: totals ? totals.replies.toLocaleString() : '—',
      note: replyRate === null ? 'no sends in range' : `${replyRate}% of sent`,
    },
    {
      label: 'Inbox placement',
      value: hasInbox ? `${placement?.inbox}%` : '—',
      note: hasInbox
        ? `promotions ${placement?.promotions}% · spam ${placement?.spam}%`
        : 'no placement signal in range',
    },
    {
      label: 'Mailboxes',
      value: summary.data ? String(summary.data.total_mailboxes) : '—',
      note: summary.data ? `${summary.data.active_mailboxes} active` : preset.label,
    },
  ];

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Warmup report</h2>
            <p className="panel-note">
              Volume, engagement and placement — {preset.label.toLowerCase()} ({range.from} → {range.to}).
            </p>
          </div>
          <div className="warmup-report-actions">
            <div className="warmup-range-picker" role="group" aria-label="Report date range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={`warmup-range-btn${r.key === rangeKey ? ' active' : ''}`}
                  aria-pressed={r.key === rangeKey}
                  onClick={() => setRangeKey(r.key)}
                >
                  {r.days}d
                </button>
              ))}
            </div>
            <button
              className="btn"
              onClick={onExport}
              disabled={exporting || rows.loading || !rows.data || rows.data.length === 0}
            >
              {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {summary.loading && !summary.data ? (
          <Skeleton rows={2} height={64} />
        ) : summary.error && !summary.data ? (
          <LoadError message={summary.error} onRetry={() => void summary.reload()} />
        ) : (
          <div className="stat-row warmup-report-stats">
            {cards.map((c) => (
              <div key={c.label} className={`stat-card${c.highlight ? ' highlight' : ''}`}>
                <span className="stat-value">{c.value}</span>
                <span className="stat-label">{c.label}</span>
                <span className="stat-note">{c.note}</span>
              </div>
            ))}
          </div>
        )}
        {summary.error && summary.data && <StaleNotice onRetry={() => void summary.reload()} />}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Per-mailbox warmup</h2>
            <p className="panel-note">
              Warmth is current; sent / opens / replies and inbox placement are {preset.label.toLowerCase()} totals.
            </p>
          </div>
        </div>
        {rows.loading && !rows.data ? (
          <Skeleton rows={4} height={40} />
        ) : rows.error && !rows.data ? (
          <LoadError message={rows.error} onRetry={() => void rows.reload()} />
        ) : rows.data && rows.data.length === 0 ? (
          <EmptyState title="No mailboxes yet">
            Connect a mailbox and report rows appear here once warmup starts.
          </EmptyState>
        ) : rows.data ? (
          <div className="table-wrap">
            <table className="warmup-report-table">
              <thead>
                <tr>
                  <th scope="col">Mailbox</th>
                  <th scope="col" className="num">Warmth</th>
                  <th scope="col" className="num">Sent</th>
                  <th scope="col" className="num">Opens</th>
                  <th scope="col" className="num">Replies</th>
                  <th scope="col" className="num">Inbox %</th>
                </tr>
              </thead>
              <tbody>
                {rows.data.map((r) => (
                  <tr key={r.mailbox_id}>
                    <td className="warmup-report-mailbox" title={r.email_address}>{r.email_address}</td>
                    <td
                      className="num warmup-report-warmth"
                      style={theme ? { color: warmthColor(r.warmth_score, theme) } : undefined}
                    >
                      {Math.round(r.warmth_score)}
                    </td>
                    <td className="num">{r.sent.toLocaleString()}</td>
                    <td className="num">{r.opens.toLocaleString()}</td>
                    <td className="num">{r.replies.toLocaleString()}</td>
                    <td className="num">{r.inbox_pct === null ? '—' : `${r.inbox_pct}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total — {rows.data.length} mailboxes</th>
                  <td className="num">—</td>
                  <td className="num">{rows.data.reduce((a, r) => a + r.sent, 0).toLocaleString()}</td>
                  <td className="num">{rows.data.reduce((a, r) => a + r.opens, 0).toLocaleString()}</td>
                  <td className="num">{rows.data.reduce((a, r) => a + r.replies, 0).toLocaleString()}</td>
                  <td className="num">
                    {(() => {
                      const withPct = rows.data!.filter((r) => r.inbox_pct !== null);
                      return withPct.length === 0
                        ? '—'
                        : `${Math.round(withPct.reduce((a, r) => a + (r.inbox_pct ?? 0), 0) / withPct.length)}%`;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
        {rows.error && rows.data && <StaleNotice onRetry={reloadAll} />}
      </section>
    </>
  );
}
