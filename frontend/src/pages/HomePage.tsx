import { useMemo, useState } from 'react';
import { AnimatedList } from '../components/AnimatedList';
import { ApprovalQueue } from '../components/ApprovalQueue';
import { useAutopilotSummary } from '../components/AutopilotPill';
import { CycleButton } from '../components/CycleButton';
import { FitChip, LeadDrawer } from '../components/LeadDrawer';
import { MagicBento, type MagicBentoItem } from '../components/MagicBento';
import { EmptyState, LoadError, Skeleton, StaleNotice } from '../components/feedback';
import { IconBuilding, IconCheck } from '../components/icons';
import { PageHeader } from '../components/ui';
import { getDrafts, getLeads, getSettings, getTemplates, isDemo } from '../lib/api';
import { greeting, plural, timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import { useWorkspaceStatus } from '../lib/status';
import type { Lead, SettingsSection } from '../lib/types';

/** HOME — Liquid-glass bento overview: status, KPIs, approvals, newest leads, checklist. */
export function HomePage() {
  const status = useWorkspaceStatus();
  const leads = useAsync(getLeads, [status.cycleVersion], { keepStale: true });
  const drafts = useAsync(getDrafts, [status.cycleVersion], { keepStale: true });
  const [openLead, setOpenLead] = useState<Lead | null>(null);

  const leadList = leads.data ?? [];
  const goodFits = leadList.filter((l) => l.profiled !== false && l.score >= 65).length;
  const delivered = (drafts.data ?? []).filter((d) => d.status === 'Sent' && d.sentVia !== 'console').length;
  const waiting = (status.outreach?.drafts ?? 0) + (status.outreach?.failed ?? 0);
  const newest = useMemo(
    () =>
      [...leadList]
        .sort((a, b) => Date.parse(b.discoveredAt ?? '') - Date.parse(a.discoveredAt ?? '') || 0)
        .slice(0, 5),
    [leadList],
  );

  const bentoItems: MagicBentoItem[] = [
    {
      id: 'status-hero',
      colSpan: 4,
      rowSpan: 1,
      className: 'bento-tile--flat',
      content: <StatusHero />,
    },
    {
      id: 'stat-companies',
      colSpan: 1,
      rowSpan: 1,
      onClick: () => navigate('leads'),
      className: 'stat-card bento-stat',
      title: 'Companies found',
      content: <StatBody label="Companies found" value={leads.data ? leadList.length : null} note="Total discovered" />,
    },
    {
      id: 'stat-good-fits',
      colSpan: 1,
      rowSpan: 1,
      onClick: () => navigate('leads', 'board'),
      className: 'stat-card bento-stat',
      title: 'Good fits',
      content: <StatBody label="Good fits" value={leads.data ? goodFits : null} note="fit score 65+" />,
    },
    {
      id: 'stat-waiting',
      colSpan: 1,
      rowSpan: 1,
      onClick: () => navigate('approvals'),
      className: `stat-card bento-stat${waiting > 0 ? ' highlight' : ''}`,
      title: 'Waiting for you',
      content: (
        <StatBody
          label="Waiting for you"
          value={status.outreach ? waiting : null}
          note={waiting > 0 ? 'Ready for review' : 'Queue clear'}
        />
      ),
    },
    {
      id: 'stat-delivered',
      colSpan: 1,
      rowSpan: 1,
      onClick: () => navigate('approvals'),
      className: 'stat-card bento-stat',
      title: 'Emails delivered',
      content: <StatBody label="Emails delivered" value={drafts.data ? delivered : null} note="Sent from mailboxes" />,
    },
    {
      id: 'approvals-panel',
      colSpan: 2,
      rowSpan: 2,
      className: 'bento-panel-card',
      content: (
        <>
          <div className="panel-head">
            <h2 className="section-title">Waiting for your approval</h2>
            <button className="link-btn" onClick={() => navigate('approvals')}>
              Open Approvals →
            </button>
          </div>
          <ApprovalQueue limit={3} />
        </>
      ),
    },
    {
      id: 'newest-leads-panel',
      colSpan: 2,
      rowSpan: 2,
      className: 'bento-panel-card',
      content: (
        <>
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
            <AnimatedList
              items={newest}
              asList
              listClassName="mini-leads"
              getItemKey={(l) => l.id}
              onItemSelect={(l) => setOpenLead(l)}
              animation="pop"
              theme="dark"
              frame={false}
              width="100%"
              maxHeight={360}
              gap={8}
              accentColor="var(--accent)"
              renderItem={(l) => (
                <>
                  <span className="animated-list__lead" aria-hidden="true">
                    <IconBuilding size={17} />
                  </span>
                  <span className="animated-list__text">
                    <span className="animated-list__title">{l.company}</span>
                    <span className="animated-list__description">
                      {[l.industry, l.country].filter(Boolean).join(' · ') || l.website}
                    </span>
                  </span>
                  <span className="animated-list__meta">
                    <FitChip lead={l} />
                  </span>
                </>
              )}
            />
          )}
        </>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title={greeting()}
        subtitle="Here's what your sales assistant has been doing, and what needs you."
        actions={<CycleButton />}
      />

      <MagicBento
        items={bentoItems}
        columns={4}
        rowHeight={112}
        flexibleRows
        gap={14}
        radius={18}
        theme="dark"
        glowColor="#fb923c"
        enableBorderGlow
        enableSpotlight
        enableTilt
        clickEffect
        textAutoHide={false}
      />

      {!isDemo() && <SetupChecklist />}

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
    <section className={`status-hero status-hero--bento tone-${summary.tone}`} aria-live="polite">
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

function StatBody({
  label,
  value,
  note,
}: {
  label: string;
  value: number | null;
  note?: string;
}) {
  return (
    <div className="stat-bento-body">
      <span className="stat-value">{value ?? '–'}</span>
      <span className="stat-label">{label}</span>
      {note && <small className="stat-note">{note}</small>}
    </div>
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
      <AnimatedList
        items={items}
        asList
        interactiveRows
        getItemKey={(i) => i.label}
        itemClassName={(i) => (i.done ? 'done' : '')}
        onItemSelect={(i) => {
          if (!i.done) navigate('settings', i.section);
        }}
        animation="slide"
        theme="dark"
        frame={false}
        width="100%"
        maxHeight="none"
        showGradients={false}
        gap={8}
        accentColor="var(--accent)"
        renderItem={(i) => (
          <>
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
          </>
        )}
      />
    </section>
  );
}
