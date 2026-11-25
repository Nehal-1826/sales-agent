import { useState } from 'react';
import { PageHeader } from '../components/ui';
import { EmptyState, LoadError, Skeleton, StaleNotice } from '../components/feedback';
import LatticeLoader from '../components/reactbits/LatticeLoader';
import { useAsync } from '../lib/hooks';
import { isImpersonating } from '../lib/impersonation';
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
  DnsWizard,
  EnrollMailbox,
  MailboxRows,
  PlacementDonut,
  Reports,
  Reputation,
  TodayStats,
  WarmthChart,
  WarmthHero,
  useChartTheme,
} from './warmup';

type WarmupView = 'overview' | 'dns' | 'reports' | 'reputation';

/**
 * WARMUP — the real mailbox-warmup dashboard, ported from the WarmPulse
 * client. Data comes from the FastAPI backend through the Django bridge
 * (lib/warmupApi). One manual Refresh refreshes every section; there is no
 * polling by design. The DNS tab is the onboarding wizard (domain → SPF /
 * DKIM / DMARC status cards + records-to-publish guidance); the Reports tab
 * is the C8 port — range rollups + per-mailbox table + jspdf export; the
 * Reputation tab is the C9 port — score banner, spam rate, placement and
 * provider trends, per-domain blocklist checks.
 */
export function WarmupPage() {
  const [view, setView] = useState<WarmupView>('overview');
  const theme = useChartTheme();
  const health = useAsync(warmupHealth, []);
  const summary = useAsync(warmupDashboardSummary, []);
  const today = useAsync(warmupTodayStats, []);
  const mailboxes = useAsync(warmupMailboxStates, []);
  const alerts = useAsync(warmupAlerts, []);
  const activity = useAsync(() => warmupActivity(20), []);

  const sections = [summary, today, mailboxes, alerts, activity];
  const busy = sections.some((s) => s.loading);

  // useAsync.reload() never re-sets `loading` (it keeps old data on screen),
  // so the manual refresh tracks its own in-flight state for the busy label.
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = () => {
    setRefreshing(true);
    void Promise.allSettled(sections.map((s) => s.reload())).finally(() => setRefreshing(false));
  };

  // after a pause/resume/enroll/delete the rows and the summary counters
  // (active mailboxes, today stats) both go stale — reload them together
  const refreshMailboxData = () => {
    void mailboxes.reload();
    void summary.reload();
    void today.reload();
  };

  const [enrollOpen, setEnrollOpen] = useState(false);

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
        {/* No length/loading guard here: useAsync's reload never re-sets
            loading, so guarding on either hides the empty-history panel
            ("Warmth history builds up day by day") once the first load
            finishes with zero points. */}
        {summary.data && theme && (
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
            <button className="btn btn-sm" onClick={() => setEnrollOpen(true)}>
              Add mailbox
            </button>
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
            <MailboxRows mailboxes={mailboxes.data.items} theme={theme} onChanged={refreshMailboxData} />
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

  // Inside the "enter as user" tab the warmup side is closed on the server
  // (the bridge token is one of the refused paths, and lib/warmupApi asks it
  // for nothing): one plain sentence, and no dashboard and no tabs to click.
  // After every hook above — this page is never the warmup page in that tab.
  if (isImpersonating()) {
    return (
      <div className="page">
        <PageHeader title="Warmup" />
        <section className="panel warmup-status probing" role="status">
          Warmup is not available while you are inside as another user.
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Warmup"
        subtitle="Mailbox warmup network — warmth, inbox placement and live events across your mailboxes."
        actions={
          <button className="btn" onClick={refreshAll} disabled={busy || refreshing || health.data === false}>
            Refresh{refreshing ? 'ing…' : ''}
          </button>
        }
      />
      <div className="subtabs compact" role="tablist">
        <button
          role="tab"
          aria-selected={view === 'overview'}
          className={`subtab${view === 'overview' ? ' active' : ''}`}
          onClick={() => setView('overview')}
        >
          Overview
        </button>
        <button
          role="tab"
          aria-selected={view === 'dns'}
          className={`subtab${view === 'dns' ? ' active' : ''}`}
          onClick={() => setView('dns')}
        >
          DNS / Deliverability
        </button>
        <button
          role="tab"
          aria-selected={view === 'reports'}
          className={`subtab${view === 'reports' ? ' active' : ''}`}
          onClick={() => setView('reports')}
        >
          Reports
        </button>
        <button
          role="tab"
          aria-selected={view === 'reputation'}
          className={`subtab${view === 'reputation' ? ' active' : ''}`}
          onClick={() => setView('reputation')}
        >
          Reputation
        </button>
      </div>
      {view === 'dns' && health.data === true ? (
        <DnsWizard />
      ) : view === 'reports' && health.data === true ? (
        <Reports />
      ) : view === 'reputation' && health.data === true ? (
        <Reputation />
      ) : (
        body
      )}
      {enrollOpen && (
        <EnrollMailbox onClose={() => setEnrollOpen(false)} onEnrolled={refreshMailboxData} />
      )}
    </div>
  );
}
