import { useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { PageHeader } from '../../components/ui';
import { EmptyState, LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  downloadCsv,
  getPlanMix,
  getPlatformAnalyticsOverview,
  getSendVolumeSeries,
  getSignupSeries,
  getTopClients,
  getWarmthBins,
} from '../../lib/platformAdmin';
import type { SignupRatePoint, VolumePoint } from '../../lib/platformAdmin';
import { useChartTheme, formatDayTick } from '../warmup/chartTheme';
import type { ChartTheme } from '../warmup/chartTheme';

/**
 * Platform admin · analytics cockpit (H2 port of the WarmPulse A1 cockpit).
 * Mission-control grid over the FastAPI platform-analytics routes via
 * lib/platformAdmin: KPI chips from the overview, dual-axis sends+signups
 * area chart, plan-mix donut, warmth histogram, MRR-by-plan bars, peer-pool
 * health gauge and a top-workspaces table (three top-clients fetches merged
 * by user, exactly like the reference page).
 *
 * The 7d/30d/90d toggle drives the from/to window of both series routes.
 * Charts use ApexCharts (this app has no recharts) themed from the live CSS
 * tokens, mirroring the warmup dashboard charts.
 */

type RangeId = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<RangeId, 7 | 30 | 90> = { '7d': 7, '30d': 30, '90d': 90 };

const nf = new Intl.NumberFormat();
const usd = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** Warm palette for plan slices — accent ramp, no purple/blue (brand rule). */
function planColor(i: number, t: ChartTheme): string {
  const ramp = [t.accent, t.warn, t.danger];
  return ramp[i % ramp.length] ?? t.accent;
}

/* ---------------- charts ---------------- */

function TrendChart({
  volume,
  signups,
  theme,
}: {
  volume: VolumePoint[];
  signups: SignupRatePoint[];
  theme: ChartTheme;
}) {
  const byDate = new Map(signups.map((s) => [s.date, s.signups]));
  const categories = volume.map((v) => v.date);
  const options: ApexOptions = {
    chart: { type: 'area', animations: { enabled: false }, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: theme.fontFamily, foreColor: theme.text2 },
    colors: [theme.accent, theme.success],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.02 } },
    grid: { borderColor: theme.border, strokeDashArray: 3, padding: { left: 4, right: 4, top: 4 } },
    xaxis: {
      categories,
      tickAmount: Math.min(8, categories.length),
      labels: { formatter: (v: string) => formatDayTick(v), style: { colors: [theme.text2], fontSize: '11px' }, hideOverlappingLabels: true },
      axisBorder: { color: theme.border },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: [
      { title: { text: 'Sends', style: { color: theme.text2 } }, labels: { style: { colors: [theme.text2], fontSize: '11px' } } },
      { opposite: true, title: { text: 'Signups', style: { color: theme.text2 } }, labels: { style: { colors: [theme.text2], fontSize: '11px' } } },
    ],
    tooltip: { x: { formatter: (v: number) => formatDayTick(String(v)) } },
    legend: { labels: { colors: theme.text2 } },
    states: { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } },
  };
  const series: ApexOptions['series'] = [
    { name: 'Sends', data: volume.map((v) => v.sent) },
    { name: 'Signups', data: volume.map((v) => byDate.get(v.date) ?? 0) },
  ];
  return <Chart options={options} series={series} type="area" height={240} width="100%" />;
}

function PlanDonut({ rows, theme }: { rows: Array<{ plan: string; count: number }>; theme: ChartTheme }) {
  const options: ApexOptions = {
    chart: { type: 'donut', animations: { enabled: false }, fontFamily: theme.fontFamily },
    labels: rows.map((r) => r.plan),
    colors: rows.map((_, i) => planColor(i, theme)),
    legend: { show: false },
    stroke: { colors: [theme.panel] },
    plotOptions: { pie: { donut: { size: '62%' } } },
    dataLabels: { enabled: false },
    tooltip: { y: { formatter: (v: number) => `${nf.format(v)} workspaces` } },
  };
  return <Chart options={options} series={rows.map((r) => r.count)} type="donut" height={200} width="100%" />;
}

function WarmthHistogram({ bins, theme }: { bins: Array<{ bin: string; count: number }>; theme: ChartTheme }) {
  const options: ApexOptions = {
    chart: { type: 'bar', animations: { enabled: false }, toolbar: { show: false }, fontFamily: theme.fontFamily, foreColor: theme.text2 },
    colors: bins.map((_, i) => {
      const pct = bins.length > 1 ? i / (bins.length - 1) : 0.5;
      return pct < 0.3 ? theme.danger : pct < 0.5 ? theme.warn : theme.success;
    }),
    plotOptions: { bar: { borderRadius: 4, columnWidth: '70%' } },
    dataLabels: { enabled: false },
    grid: { borderColor: theme.border, strokeDashArray: 3 },
    xaxis: { categories: bins.map((b) => b.bin), labels: { style: { colors: [theme.text2], fontSize: '10px' } }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: [theme.text2], fontSize: '11px' } } },
    tooltip: { y: { formatter: (v: number) => `${nf.format(v)} mailboxes` } },
    states: { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } },
  };
  const series: ApexOptions['series'] = [{ name: 'Mailboxes', data: bins.map((b) => b.count) }];
  return <Chart options={options} series={series} type="bar" height={200} width="100%" />;
}

function MrrBars({ rows, theme }: { rows: Array<{ plan: string; mrr: number }>; theme: ChartTheme }) {
  const options: ApexOptions = {
    chart: { type: 'bar', animations: { enabled: false }, toolbar: { show: false }, fontFamily: theme.fontFamily, foreColor: theme.text2 },
    colors: rows.map((_, i) => planColor(i, theme)),
    plotOptions: { bar: { borderRadius: 4, columnWidth: '50%', distributed: true } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: theme.border, strokeDashArray: 3 },
    xaxis: { categories: rows.map((r) => r.plan), labels: { style: { colors: [theme.text2], fontSize: '11px' } }, axisTicks: { show: false } },
    yaxis: { labels: { formatter: (v: number) => usd(v), style: { colors: [theme.text2], fontSize: '11px' } } },
    tooltip: { y: { formatter: (v: number) => usd(v) } },
    states: { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } },
  };
  const series: ApexOptions['series'] = [{ name: 'MRR', data: rows.map((r) => r.mrr) }];
  return <Chart options={options} series={series} type="bar" height={200} width="100%" />;
}

/* ---------------- top workspaces (three fetches merged by user) ---------------- */

interface TopClientBoardRow {
  user_id: string;
  email: string;
  plan: string;
  send_volume: number;
  avg_warmth: number;
  mailbox_count: number;
}

async function loadTopClients(): Promise<TopClientBoardRow[]> {
  const [vol, warmth, mailboxes] = await Promise.all([
    getTopClients('send_volume'),
    getTopClients('warmth'),
    getTopClients('mailboxes'),
  ]);
  const warmthBy = new Map(warmth.map((r) => [r.user_id, r.metric_value ?? 0]));
  const mailboxBy = new Map(mailboxes.map((r) => [r.user_id, r.metric_value ?? 0]));
  return vol
    .map((r) => ({
      user_id: r.user_id,
      email: r.email,
      plan: r.plan_name ?? '—',
      send_volume: r.metric_value ?? 0,
      avg_warmth: warmthBy.get(r.user_id) ?? 0,
      mailbox_count: mailboxBy.get(r.user_id) ?? 0,
    }))
    .sort((a, b) => b.send_volume - a.send_volume)
    .slice(0, 15);
}

/* ---------------- page ---------------- */

export function PlatformAnalyticsPage() {
  const [range, setRange] = useState<RangeId>('30d');
  const days = RANGE_DAYS[range];
  const theme = useChartTheme();

  const overview = useAsync(getPlatformAnalyticsOverview);
  const volume = useAsync(() => getSendVolumeSeries(days), [days], { keepStale: true });
  const signups = useAsync(() => getSignupSeries(days), [days], { keepStale: true });
  const planDist = useAsync(getPlanMix);
  const warmth = useAsync(getWarmthBins);
  const topClients = useAsync(loadTopClients);

  const totalSends = useMemo(() => (volume.data ?? []).reduce((s, p) => s + p.sent, 0), [volume.data]);
  const totalSignups = useMemo(() => (signups.data ?? []).reduce((s, p) => s + p.signups, 0), [signups.data]);

  const trend = volume.data ?? [];
  const signupByDate = new Map((signups.data ?? []).map((s) => [s.date, s.signups]));

  const planSlices = useMemo(
    () => (planDist.data ?? []).filter((p) => p.count > 0).sort((a, b) => b.count - a.count),
    [planDist.data],
  );
  const planTotal = planSlices.reduce((s, p) => s + p.count, 0);
  const planMrr = useMemo(() => planSlices.filter((p) => (p.mrr ?? 0) > 0).map((p) => ({ plan: p.plan, mrr: p.mrr ?? 0 })), [planSlices]);

  const clients = topClients.data ?? [];
  const peerHealth = overview.data?.peer_pool_health_pct ?? 0;

  function exportTrend() {
    downloadCsv(
      `platform-analytics-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Date', 'Sends', 'Signups'],
      trend.map((v) => [v.date, v.sent, signupByDate.get(v.date) ?? 0]),
    );
  }

  return (
    <>
      <PageHeader
        title="Platform analytics"
        subtitle="Sends, signups, plan mix, mailbox warmth and peer-pool health across every workspace."
        actions={
          <>
            <div className="pf-filters" role="group" aria-label="Time range" style={{ marginBottom: 0 }}>
              {(['7d', '30d', '90d'] as RangeId[]).map((r) => (
                <button
                  key={r}
                  className={`btn btn-sm${range === r ? ' btn-primary' : ''}`}
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                >
                  {r}
                </button>
              ))}
            </div>
            <button className="btn btn-sm" onClick={exportTrend} disabled={trend.length === 0}>
              Export CSV
            </button>
          </>
        }
      />

      {/* KPI chips */}
      {overview.error && <LoadError message={overview.error} onRetry={() => void overview.reload()} />}
      {overview.loading && !overview.data && <Skeleton rows={4} />}
      {overview.data && (
        <div className="pf-kpis">
          <div className="panel pf-kpi"><small>Sends today</small><strong>{nf.format(overview.data.sends_today)}</strong><small>{nf.format(overview.data.sends_7d)} last 7 days</small></div>
          <div className="panel pf-kpi"><small>Active mailboxes</small><strong>{nf.format(overview.data.active_mailboxes)}</strong><small>of {nf.format(overview.data.total_mailboxes)} total</small></div>
          <div className="panel pf-kpi"><small>Signups ({range})</small><strong>{nf.format(totalSignups)}</strong><small>{nf.format(overview.data.total_users)} users total</small></div>
          <div className="panel pf-kpi"><small>MRR</small><strong>{usd(overview.data.mrr_usd)}</strong><small>subscription run rate</small></div>
          <div className="panel pf-kpi"><small>Peer pool health</small><strong>{peerHealth}%</strong><small>{overview.data.active_peer_inboxes}/{overview.data.total_peer_inboxes} peers active</small></div>
        </div>
      )}

      {/* sends + signups trend */}
      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <h2 className="pf-h2" style={{ margin: 0 }}>Sends &amp; signups over time</h2>
          <span className="chip chip-accent">{nf.format(totalSends)} sends · {range}</span>
        </div>
        {(volume.error || signups.error) && (
          <LoadError message={volume.error ?? signups.error ?? ''} onRetry={() => { void volume.reload(); void signups.reload(); }} />
        )}
        {(volume.loading || signups.loading) && !trend.length && <Skeleton rows={4} />}
        {trend.length === 0 && !volume.loading && !signups.loading && !volume.error && !signups.error && (
          <EmptyState title="No send data in this window" />
        )}
        {trend.length > 0 && theme && <TrendChart volume={trend} signups={signups.data ?? []} theme={theme} />}
      </section>

      <div className="pf-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {/* plan mix donut */}
        <section className="panel">
          <div className="panel-head"><h2 className="pf-h2" style={{ margin: 0 }}>Plan distribution</h2></div>
          {planDist.error && <LoadError message={planDist.error} onRetry={() => void planDist.reload()} />}
          {planDist.loading && !planDist.data && <Skeleton rows={3} />}
          {planDist.data && planSlices.length === 0 && <EmptyState title="No plan data yet" />}
          {planDist.data && planSlices.length > 0 && (
            <>
              {theme && <PlanDonut rows={planSlices.map((p) => ({ plan: p.plan, count: p.count }))} theme={theme} />}
              <ul className="pf-hbars" aria-label="Workspaces per plan">
                {planSlices.map((p) => (
                  <li key={p.plan}>
                    <span>{p.plan}</span>
                    <span className="pf-hbar-track" aria-hidden><span style={{ width: `${planTotal > 0 ? (p.count / planTotal) * 100 : 0}%` }} /></span>
                    <strong>{p.count}</strong>
                  </li>
                ))}
              </ul>
              <small style={{ color: 'var(--text-2)' }}>{planTotal} total workspaces</small>
            </>
          )}
        </section>

        {/* warmth histogram */}
        <section className="panel">
          <div className="panel-head"><h2 className="pf-h2" style={{ margin: 0 }}>Warmth distribution</h2></div>
          {warmth.error && <LoadError message={warmth.error} onRetry={() => void warmth.reload()} />}
          {warmth.loading && !warmth.data && <Skeleton rows={3} />}
          {warmth.data && warmth.data.length === 0 && <EmptyState title="No warmth data yet" />}
          {warmth.data && warmth.data.length > 0 && theme && <WarmthHistogram bins={warmth.data} theme={theme} />}
        </section>

        {/* MRR by plan */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="pf-h2" style={{ margin: 0 }}>MRR by plan</h2>
            <span className="chip chip-accent">{usd(overview.data?.mrr_usd ?? 0)}</span>
          </div>
          {planDist.loading && !planDist.data && <Skeleton rows={3} />}
          {planDist.data && planMrr.length === 0 && <EmptyState title="No per-plan MRR data yet" />}
          {planMrr.length > 0 && theme && <MrrBars rows={planMrr} theme={theme} />}
        </section>

        {/* peer pool health gauge */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="pf-h2" style={{ margin: 0 }}>Peer pool health</h2>
            <span
              className="chip"
              style={{
                background: peerHealth >= 80 ? 'var(--success-soft)' : peerHealth >= 60 ? 'var(--warn-soft)' : 'var(--danger-soft)',
                color: peerHealth >= 80 ? 'var(--success-ink)' : peerHealth >= 60 ? 'var(--warn-ink)' : 'var(--danger-ink)',
              }}
            >
              {peerHealth >= 80 ? 'Healthy' : peerHealth >= 60 ? 'Degraded' : 'At risk'}
            </span>
          </div>
          {overview.data && (
            <div style={{ display: 'grid', gap: 12 }}>
              <span className="pf-hbar-track" style={{ height: 12 }} aria-hidden>
                <span
                  style={{
                    width: `${Math.min(100, Math.max(0, peerHealth))}%`,
                    background: peerHealth >= 80 ? 'var(--success)' : peerHealth >= 60 ? 'var(--warn)' : 'var(--danger)',
                  }}
                />
              </span>
              <div style={{ textAlign: 'center' }}>
                <strong style={{ fontSize: 40, lineHeight: 1 }}>{Math.round(peerHealth)}%</strong>
                <small style={{ display: 'block', color: 'var(--text-2)', marginTop: 6 }}>of peer test accounts healthy</small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { label: 'Active peers', value: nf.format(overview.data.active_peer_inboxes) },
                  { label: 'Total peers', value: nf.format(overview.data.total_peer_inboxes) },
                  { label: 'Users', value: nf.format(overview.data.total_users) },
                ].map((m) => (
                  <div key={m.label} style={{ flex: 1, textAlign: 'center', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '6px 8px' }}>
                    <strong style={{ display: 'block' }}>{m.value}</strong>
                    <small style={{ color: 'var(--text-2)' }}>{m.label}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* top workspaces */}
      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">
          <h2 className="pf-h2" style={{ margin: 0 }}>Top workspaces by volume</h2>
          <small>send volume · mailbox warmth · mailbox count</small>
        </div>
        {topClients.error && <LoadError message={topClients.error} onRetry={() => void topClients.reload()} />}
        {topClients.loading && !topClients.data && <Skeleton rows={4} />}
        {topClients.data && clients.length === 0 && <EmptyState title="No workspace data yet" />}
        {topClients.data && clients.length > 0 && (
          <div className="table-wrap pf-table">
            <table className="leads-table">
              <thead>
                <tr><th>#</th><th>Workspace</th><th>Plan</th><th>Mailboxes</th><th>Sends</th><th>Avg warmth</th><th>Health</th></tr>
              </thead>
              <tbody>
                {clients.map((row, i) => {
                  const health = row.avg_warmth >= 80 ? 'healthy' : row.avg_warmth >= 50 ? 'watch' : 'risk';
                  return (
                    <tr key={row.user_id}>
                      <td>{i + 1}</td>
                      <td>{row.email}</td>
                      <td>{row.plan}</td>
                      <td>{nf.format(row.mailbox_count)}</td>
                      <td>{nf.format(row.send_volume)}</td>
                      <td>{row.avg_warmth.toFixed(1)}</td>
                      <td>
                        <span
                          className={`chip chip-${health === 'healthy' ? 'success' : health === 'watch' ? 'warn' : 'error'}`}
                          style={health === 'risk' ? { background: 'var(--danger-soft)', color: 'var(--danger-ink)' } : undefined}
                        >
                          {health === 'healthy' ? 'Healthy' : health === 'watch' ? 'Watch' : 'At risk'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default PlatformAnalyticsPage;
