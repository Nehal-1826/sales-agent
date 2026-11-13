import { PageHeader } from '../components/ui';
import { EmptyState, LoadError, Skeleton, StaleNotice } from '../components/feedback';
import LatticeLoader from '../components/reactbits/LatticeLoader';
import { useAsync } from '../lib/hooks';
import {
  warmupActivity,
  warmupAlerts,
  warmupDashboardSummary,
  warmupHealth,
  warmupMailboxStates,
  warmupTodayStats,
} from '../lib/warmupApi';
import {
  ActivityFeed,
  AlertsStack,
  MailboxRows,
  PlacementDonut,
  TodayStats,
  WarmthChart,
  WarmthHero,
  useChartTheme,
} from './warmup';

/**
 * WARMUP — the real mailbox-warmup dashboard, ported from the WarmPulse
 * client. Data comes from the FastAPI backend through the Django bridge
 * (lib/warmupApi). One manual Refresh refreshes every section; there is no
 * polling by design.
 */
export function WarmupPage() {
  const theme = useChartTheme();
  const health = useAsync(warmupHealth, []);
  const summary = useAsync(warmupDashboardSummary, []);
  const today = useAsync(warmupTodayStats, []);
  const mailboxes = useAsync(warmupMailboxStates, []);
  const alerts = useAsync(warmupAlerts, []);
  const activity = useAsync(() => warmupActivity(20), []);

  const sections = [summary, today, mailboxes, alerts, activity];
  const busy = sections.some((s) => s.loading);

  const refreshAll = () => {
    for (const s of sections) void s.reload();
  };

  // ---- gate on the FastAPI backend before anything else ----
  let body: React.ReactNode;
  if (health.loading && health.data !== false) {
    body = (
      <section className="panel warmup-loader-panel">
        <LatticeLoader label="Checking warmup backend…" cellSize={7} color="var(--accent)" showTimer={false} />
      </section>
    );
  } else if (health.data === false) {
    body = (
      <section className="panel warmup-status down">
        Warmup backend: not reachable (start backend-warmup on :8001)
      </section>
    );
  } else {
    body = (
      <>
        {/* ---- hero row: warmth gauge + today's counters ---- */}
        {summary.loading && !summary.data ? (
          <section className="panel warmup-loader-panel">
            <LatticeLoader label="Loading warmup dashboard…" cellSize={7} color="var(--accent)" showTimer={false} />
          </section>
        ) : summary.error && !summary.data ? (
          <LoadError message={summary.error} onRetry={() => void summary.reload()} />
        ) : summary.data && theme ? (
          <div className="warmup-hero-row">
            <section className="panel warmup-hero-panel">
              <WarmthHero summary={summary.data} theme={theme} />
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2 className="section-title">Today</h2>
              </div>
              {(() => {
                // prefer the dedicated today-stats endpoint; the summary
                // embeds the same counters, so it covers a section failure
                const stats = today.data ?? summary.data!.today;
                if (today.loading && !today.data) return <Skeleton rows={2} height={56} />;
                if (today.error && !today.data)
                  return <LoadError message={today.error} onRetry={() => void today.reload()} />;
                return <TodayStats stats={stats} />;
              })()}
              {today.error && today.data && <StaleNotice onRetry={() => void today.reload()} />}
            </section>
          </div>
        ) : null}
        {summary.error && summary.data && <StaleNotice onRetry={() => void summary.reload()} />}

        {/* ---- 30-day warmth trend ---- */}
        {summary.data && theme && (summary.data.warmth_30d.length > 0 || summary.loading) && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="section-title">Warmth trend (30 days)</h2>
                <p className="panel-note">Daily mean warmth across all active mailboxes.</p>
              </div>
            </div>
            {summary.data.warmth_30d.length === 0 ? (
              <div className="warmup-chart-empty">Warmth history builds up day by day — check back tomorrow.</div>
            ) : (
              <WarmthChart points={summary.data.warmth_30d} theme={theme} />
            )}
          </section>
        )}

        {/* ---- placement donut + alerts stack ---- */}
        <div className="warmup-two-col">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="section-title">Inbox placement</h2>
                <p className="panel-note">Where warmup mail is landing right now.</p>
              </div>
            </div>
            {summary.data && theme ? (
              <PlacementDonut split={summary.data.placement_split} theme={theme} />
            ) : (
              <Skeleton rows={3} height={52} />
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h2 className="section-title">Alerts</h2>
                <p className="panel-note">Issues to resolve for best deliverability.</p>
              </div>
              {alerts.data && alerts.data.unread > 0 && (
                <span className="chip chip-warmup-unread">{alerts.data.unread} unread</span>
              )}
            </div>
            {alerts.loading && !alerts.data ? (
              <Skeleton rows={2} height={48} />
            ) : alerts.error && !alerts.data ? (
              <LoadError message={alerts.error} onRetry={() => void alerts.reload()} />
            ) : alerts.data ? (
              <AlertsStack alerts={alerts.data} />
            ) : null}
            {alerts.error && alerts.data && <StaleNotice onRetry={() => void alerts.reload()} />}
          </section>
        </div>

        {/* ---- mailbox rows ---- */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="section-title">Mailboxes</h2>
              <p className="panel-note">
                {mailboxes.data ? `${mailboxes.data.total} in this workspace` : 'Warmth per mailbox, latest day.'}
              </p>
            </div>
          </div>
          {mailboxes.loading && !mailboxes.data ? (
            <Skeleton rows={3} height={48} />
          ) : mailboxes.error && !mailboxes.data ? (
            <LoadError message={mailboxes.error} onRetry={() => void mailboxes.reload()} />
          ) : mailboxes.data && mailboxes.data.items.length === 0 ? (
            <EmptyState title="No mailboxes yet">
              Connect a mailbox and the warmup network starts building its reputation.
            </EmptyState>
          ) : mailboxes.data && theme ? (
            <MailboxRows mailboxes={mailboxes.data.items} theme={theme} />
          ) : null}
          {mailboxes.error && mailboxes.data && <StaleNotice onRetry={() => void mailboxes.reload()} />}
        </section>

        {/* ---- activity feed ---- */}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="section-title">Live activity</h2>
              <p className="panel-note">Last 20 warmup events.</p>
            </div>
          </div>
          {activity.loading && !activity.data ? (
            <Skeleton rows={6} height={36} />
          ) : activity.error && !activity.data ? (
            <LoadError message={activity.error} onRetry={() => void activity.reload()} />
          ) : activity.data ? (
            <ActivityFeed items={activity.data.items} />
          ) : null}
          {activity.error && activity.data && <StaleNotice onRetry={() => void activity.reload()} />}
        </section>
      </>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Warmup"
        subtitle="Mailbox warmup network — warmth, inbox placement and live events across your mailboxes."
        actions={
          <button className="btn" onClick={refreshAll} disabled={busy || health.data === false}>
            Refresh{busy ? 'ing…' : ''}
          </button>
        }
      />
      {body}
    </div>
  );
}
