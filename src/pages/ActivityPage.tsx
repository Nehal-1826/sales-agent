import { useAutopilotSummary } from '../components/AutopilotPill';
import { CycleButton } from '../components/CycleButton';
import { EmptyState, LoadError, Skeleton, StaleNotice } from '../components/feedback';
import { IconBot, IconInbox, IconPen, IconSearch } from '../components/icons';
import type { IconProps } from '../components/icons';
import { PageHeader } from '../components/ui';
import { getDrafts, getLeads, getPipelineRuns, isDemo } from '../lib/api';
import { plural, timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import { useWorkspaceStatus } from '../lib/status';
import type { PipelineRunRecord } from '../lib/types';

/** ACTIVITY — what the assistant does on each search, and what it did lately. */
export function ActivityPage() {
  const status = useWorkspaceStatus();
  const summary = useAutopilotSummary(isDemo());
  const leads = useAsync(getLeads, [status.cycleVersion], { keepStale: true });
  const drafts = useAsync(getDrafts, [status.cycleVersion], { keepStale: true });
  const runs = useAsync(getPipelineRuns, [status.cycleVersion], { keepStale: true });

  const leadList = leads.data ?? [];
  const researched = leadList.filter((l) => l.profiled !== false).length;
  const written = (drafts.data ?? []).length;
  const waiting = (status.outreach?.drafts ?? 0) + (status.outreach?.failed ?? 0);
  const running = !!status.pipeline?.cycleRunning;

  const steps: { icon: (p: IconProps) => JSX.Element; title: string; text: string; count: string; onClick?: () => void }[] = [
    {
      icon: IconSearch,
      title: 'Find companies',
      text: 'Searches the web and Google Maps for businesses that match who you sell to.',
      count: plural(leadList.length, 'company', 'companies'),
      onClick: () => navigate('leads'),
    },
    {
      icon: IconBot,
      title: 'Research',
      text: 'Reads each website, finds contact details and scores how good a fit it is.',
      count: `${researched} researched`,
      onClick: () => navigate('leads', 'board'),
    },
    {
      icon: IconPen,
      title: 'Write emails',
      text: 'Writes a personal first email from your template for every reachable good fit.',
      count: plural(written, 'email'),
    },
    {
      icon: IconInbox,
      title: 'You approve',
      text: 'Nothing is sent until you say yes. Approved emails go out from your mailbox.',
      count: `${waiting} waiting`,
      onClick: () => navigate('approvals'),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Activity"
        subtitle="How your assistant works, and everything it did on recent searches."
        actions={<CycleButton />}
      />

      <section className={`status-hero tone-${summary.tone}`}>
        <span className={`status-dot dot-${summary.tone}${summary.pulse ? ' dot-pulse' : ''}`} aria-hidden />
        <div className="status-hero-text">
          <strong>{summary.label}</strong>
          <span>{summary.detail}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('settings', 'schedule')}>
          Change schedule
        </button>
      </section>

      <ol className={`steps${running ? ' running' : ''}`} aria-label="How each search works">
        {steps.map((s, i) => (
          <li key={s.title} className="step">
            <span className="step-num" aria-hidden>
              {i + 1}
            </span>
            <span className="step-icon" aria-hidden>
              <s.icon size={18} />
            </span>
            <strong>{s.title}</strong>
            <p>{s.text}</p>
            {s.onClick ? (
              <button className="step-count link-btn" onClick={s.onClick}>
                {s.count} →
              </button>
            ) : (
              <span className="step-count">{s.count}</span>
            )}
          </li>
        ))}
      </ol>

      <section className="panel">
        <div className="panel-head">
          <h2 className="section-title">Recent searches</h2>
        </div>
        {runs.error && runs.data && <StaleNotice onRetry={() => void runs.reload()} />}
        {runs.loading ? (
          <Skeleton rows={4} height={44} />
        ) : runs.error && !runs.data ? (
          <LoadError message={runs.error} onRetry={() => void runs.reload()} />
        ) : (runs.data ?? []).length === 0 ? (
          <EmptyState title="No searches yet" action={<CycleButton size="sm" />}>
            Run your first search to see what the assistant finds.
          </EmptyState>
        ) : (
          <ul className="run-list">
            {(runs.data ?? []).map((r, i) => (
              <RunItem key={r.id} run={r} defaultOpen={i === 0} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const TRIGGER_LABEL = (t: string) =>
  t === 'scheduler' ? 'Autopilot' : t.startsWith('chat') ? 'Assistant chat' : t === 'manual' ? 'You' : t === 'seed' ? 'Setup' : t;

function RunItem({ run, defaultOpen }: { run: PipelineRunRecord; defaultOpen: boolean }) {
  const minutes = Math.max(1, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 60000));
  return (
    <li className="run-item">
      <details open={defaultOpen}>
        <summary>
          <span className="run-when">
            <strong>{timeAgo(run.startedAt)}</strong>
            <small>
              started by {TRIGGER_LABEL(run.triggeredBy)} · took {plural(minutes, 'minute')}
            </small>
          </span>
          <span className="run-stats">
            <span>
              <strong>{run.leadsCreated}</strong> found
            </span>
            <span>
              <strong>{run.potentialsCreated}</strong> good fits
            </span>
            <span>
              <strong>{run.draftsCreated}</strong> emails
            </span>
          </span>
        </summary>
        {run.notes.length > 0 ? (
          <ul className="run-notes">
            {run.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="dim">No details were recorded for this search.</p>
        )}
      </details>
    </li>
  );
}
