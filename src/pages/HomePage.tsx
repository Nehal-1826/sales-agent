import { useState } from 'react';
import { ApprovalQueue } from '../components/ApprovalQueue';
import { useAutopilotSummary } from '../components/AutopilotPill';
import { CycleButton } from '../components/CycleButton';
import { FitChip, LeadDrawer } from '../components/LeadDrawer';
import { EmptyState, LoadError, Skeleton, StaleNotice } from '../components/feedback';
import { IconCheck } from '../components/icons';
import { PageHeader } from '../components/ui';
import { getDrafts, getLeads, getSettings, getTemplates, isDemo } from '../lib/api';
import { greeting, plural, timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import { useWorkspaceStatus } from '../lib/status';
import type { Lead, SettingsSection } from '../lib/types';

/** HOME — what happened, what needs you, what to set up next. */
export function HomePage() {
  const status = useWorkspaceStatus();
  const leads = useAsync(getLeads, [status.cycleVersion], { keepStale: true });
  const drafts = useAsync(getDrafts, [status.cycleVersion], { keepStale: true });
  const [openLead, setOpenLead] = useState<Lead | null>(null);

  const leadList = leads.data ?? [];
  const goodFits = leadList.filter((l) => l.profiled !== false && l.score >= 65).length;
  const delivered = (drafts.data ?? []).filter((d) => d.status === 'Sent' && d.sentVia !== 'console').length;
  const waiting = (status.outreach?.drafts ?? 0) + (status.outreach?.failed ?? 0);
  const newest = [...leadList]
    .sort((a, b) => Date.parse(b.discoveredAt ?? '') - Date.parse(a.discoveredAt ?? '') || 0)
    .slice(0, 5);

  return (
    <div className="page">
      <PageHeader
        title={greeting()}
        subtitle="Here's what your sales assistant has been doing, and what needs you."
        actions={<CycleButton />}
      />

      <StatusHero />

      <div className="stat-row">
        <Stat label="Companies found" value={leads.data ? leadList.length : null} onClick={() => navigate('leads')} />
        <Stat label="Good fits" value={leads.data ? goodFits : null} note="fit score 65+" onClick={() => navigate('leads', 'board')} />
        <Stat
          label="Waiting for you"
          value={status.outreach ? waiting : null}
          highlight={waiting > 0}
          onClick={() => navigate('approvals')}
        />
        <Stat label="Emails delivered" value={drafts.data ? delivered : null} onClick={() => navigate('approvals')} />
      </div>

      {!isDemo() && <SetupChecklist />}

      <div className="home-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="section-title">Waiting for your approval</h2>
            <button className="link-btn" onClick={() => navigate('approvals')}>
              Open Approvals →
            </button>
          </div>
          <ApprovalQueue limit={3} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="section-title">Newest companies</h2>
            <button className="link-btn" onClick={() => navigate('leads')}>
              All leads →
            </button>
          </div>
          {leads.error && leads.data && <StaleNotice onRetry={() => void leads.reload()} />}
          {leads.loading ? (
            <Skeleton rows={5} height={36} />
          ) : leads.error && !leads.data ? (
            <LoadError message={leads.error} onRetry={() => void leads.reload()} />
          ) : newest.length === 0 ? (
            <EmptyState title="No companies yet" action={<CycleButton size="sm" />}>
              Start a search and your assistant will find businesses that match who you sell to.
            </EmptyState>
          ) : (
            <ul className="mini-leads">
              {newest.map((l) => (
                <li key={l.id}>
                  <button className="mini-lead" onClick={() => setOpenLead(l)}>
                    <span className="mini-lead-name">
                      <strong>{l.company}</strong>
                      <small>{[l.industry, l.country].filter(Boolean).join(' · ') || l.website}</small>
                    </span>
                    <FitChip lead={l} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {openLead && (
        <LeadDrawer
          lead={openLead}
          drafts={drafts.data ?? []}
          onClose={() => setOpenLead(null)}
          onChanged={() => {
            void drafts.reload();
            void status.refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusHero() {
  const { pipeline } = useWorkspaceStatus();
  const summary = useAutopilotSummary(isDemo());
  const last = pipeline?.lastRun;
  return (
    <section className={`status-hero tone-${summary.tone}`} aria-live="polite">
      <span className={`status-dot dot-${summary.tone}${summary.pulse ? ' dot-pulse' : ''}`} aria-hidden />
      <div className="status-hero-text">
        <strong>{summary.label}</strong>
        <span>{summary.detail}</span>
      </div>
      <div className="status-hero-last">
        {last ? (
          <>
            <span>Last search {timeAgo(last.finishedAt || last.at)}</span>
            <small>
              found {plural(last.leadsCreated, 'company', 'companies')} · wrote {plural(last.draftsCreated, 'email')}
            </small>
          </>
        ) : (
          <span className="dim">No searches yet</span>
        )}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('activity')}>
        Details
      </button>
    </section>
  );
}

function Stat({
  label,
  value,
  note,
  highlight = false,
  onClick,
}: {
  label: string;
  value: number | null;
  note?: string;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`stat-card${highlight ? ' highlight' : ''}`} onClick={onClick}>
      <span className="stat-value">{value ?? '–'}</span>
      <span className="stat-label">{label}</span>
      {note && <small className="stat-note">{note}</small>}
    </button>
  );
}

/** Getting-started list — disappears once everything is configured. */
function SetupChecklist() {
  const { outreach } = useWorkspaceStatus();
  const settings = useAsync(getSettings);
  const templates = useAsync(getTemplates);
  if (!settings.data || !templates.data || !outreach) return null;
  const s = settings.data;
  const items: { done: boolean; label: string; hint: string; section: SettingsSection }[] = [
    { done: !!s.company.name, label: 'Tell us about your business', hint: 'Name, website and what you sell', section: 'business' },
    {
      done: s.targeting.countries.length + s.targeting.cities.length + s.targeting.industries.length > 0,
      label: 'Choose who to find',
      hint: 'Places and kinds of businesses',
      section: 'targeting',
    },
    { done: outreach.smtpConfigured, label: 'Connect your email', hint: 'So approved emails are delivered', section: 'email' },
    { done: !!s.aiKey.apiKey, label: 'Add an AI key', hint: 'For research summaries and personal emails', section: 'advanced' },
    { done: templates.data.length > 0, label: 'Write your email template', hint: 'The base every email starts from', section: 'templates' },
  ];
  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return null;
  return (
    <section className="panel setup-list" aria-label="Finish setting up">
      <div className="panel-head">
        <h2 className="section-title">Finish setting up</h2>
        <span className="dim">
          {items.length - remaining.length} of {items.length} done
        </span>
      </div>
      <div className="progress" aria-hidden>
        <span style={{ width: `${((items.length - remaining.length) / items.length) * 100}%` }} />
      </div>
      <ul>
        {items.map((i) => (
          <li key={i.label} className={i.done ? 'done' : ''}>
            <span className="setup-check" aria-hidden>
              {i.done ? <IconCheck size={14} /> : null}
            </span>
            <span className="setup-text">
              <strong>{i.label}</strong>
              <small>{i.hint}</small>
            </span>
            {!i.done && (
              <button className="btn btn-sm" onClick={() => navigate('settings', i.section)}>
                Set up
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
