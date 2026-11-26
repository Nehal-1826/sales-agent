import { useMemo, useState } from 'react';
import { CycleButton } from '../components/CycleButton';
import { GlideSelect } from '../components/GlideSelect';
import { LeadGateNote } from '../components/LeadGateNote';
import { LeadBoard, STAGE_LABEL, leadStage } from '../components/LeadBoard';
import { FitChip, LeadDrawer } from '../components/LeadDrawer';
import { ReportPanel } from '../components/ReportPanel';
import { VoicePill, useVoiceDictation } from '../components/VoicePill';
import { EmptyState, LoadError, Skeleton, StaleNotice, toast } from '../components/feedback';
import { PageHeader } from '../components/ui';
import { downloadLeadsCsv, getDrafts, getLeads, isDemo } from '../lib/api';
import { fmtNumber } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { navigate } from '../lib/router';
import { useWorkspaceStatus } from '../lib/status';
import type { Lead, LeadsTab } from '../lib/types';

const TABS: { key: LeadsTab; label: string }[] = [
  { key: 'all', label: 'All leads' },
  { key: 'board', label: 'Board' },
  { key: 'reports', label: 'Reports' },
];

type SortKey = 'newest' | 'fit' | 'name' | 'contact' | 'nowebsite';
type ContactFilter = 'any' | 'email' | 'phone' | 'none';

/** LEADS — every company found, as a searchable list, a journey board, and reports. */
export function LeadsPage({ tab: rawTab }: { tab: string }) {
  const tab: LeadsTab = TABS.some((t) => t.key === rawTab) ? (rawTab as LeadsTab) : 'all';
  const status = useWorkspaceStatus();
  const leads = useAsync(getLeads, [status.cycleVersion], { keepStale: true });
  const drafts = useAsync(getDrafts, [status.cycleVersion], { keepStale: true });
  const [open, setOpen] = useState<Lead | null>(null);

  const exportCsv = async () => {
    const res = await downloadLeadsCsv();
    if (!res.ok) toast.error(res.error);
  };

  return (
    <div className="page">
      <PageHeader
        title="Leads"
        subtitle="Every company your assistant has found. Click one to see what it learned."
        actions={
          <>
            <button className="btn" onClick={() => void exportCsv()} disabled={isDemo()}>
              Download CSV
            </button>
            <CycleButton />
          </>
        }
      />

      <LeadGateNote />

      <nav className="subtabs" aria-label="Leads views">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`subtab${tab === t.key ? ' active' : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => navigate('leads', t.key === 'all' ? '' : t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== 'reports' && leads.error && leads.data && <StaleNotice onRetry={() => void leads.reload()} />}

      {tab === 'reports' ? (
        <ReportPanel />
      ) : leads.loading ? (
        <section className="panel">
          <Skeleton rows={6} height={40} />
        </section>
      ) : leads.error && !leads.data ? (
        <LoadError message={leads.error} onRetry={() => void leads.reload()} />
      ) : (leads.data ?? []).length === 0 ? (
        <section className="panel">
          <EmptyState title="No companies yet" action={<CycleButton />}>
            Start a search and your assistant will find businesses that match who you sell to. Change who it looks
            for in Settings → Who to find.
          </EmptyState>
        </section>
      ) : tab === 'board' ? (
        <LeadBoard leads={leads.data ?? []} drafts={drafts.data ?? []} onOpen={setOpen} />
      ) : (
        <LeadTable leads={leads.data ?? []} onOpen={setOpen} drafts={drafts.data ?? []} />
      )}

      {open && (
        <LeadDrawer
          lead={open}
          drafts={drafts.data ?? []}
          onClose={() => setOpen(null)}
          onChanged={() => {
            void drafts.reload();
            void status.refresh();
          }}
        />
      )}
    </div>
  );
}

function LeadTable({
  leads,
  drafts,
  onOpen,
}: {
  leads: Lead[];
  drafts: Parameters<typeof leadStage>[1];
  onOpen: (l: Lead) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [minFit, setMinFit] = useState(0);
  const [contact, setContact] = useState<ContactFilter>('any');
  const voice = useVoiceDictation({ value: query, onChange: setQuery });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = leads.filter((l) => {
      // placeholder scores of unresearched leads never count as a fit
      if (minFit > 0 && (l.profiled === false || l.score < minFit)) return false;
      if (contact === 'email' && !l.contactEmail) return false;
      if (contact === 'phone' && !l.contactPhone) return false;
      if (contact === 'none' && (l.contactEmail || l.contactPhone)) return false;
      if (!q) return true;
      return [l.company, l.industry, l.website, l.country, l.state, l.description]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
    const newest = (l: Lead) => Date.parse(l.discoveredAt ?? '') || 0;
    out.sort((a, b) => {
      switch (sort) {
        case 'fit':
          return b.score - a.score;
        case 'name':
          return a.company.localeCompare(b.company);
        case 'contact':
          return Number(!!b.contactEmail) - Number(!!a.contactEmail) || b.score - a.score;
        case 'nowebsite':
          // companies WITHOUT a website first — they need one built
          return Number(a.hasWebsite) - Number(b.hasWebsite) || b.score - a.score;
        default:
          return newest(b) - newest(a);
      }
    });
    return out;
  }, [leads, query, sort, minFit, contact]);

  return (
    <section className="panel">
      <div className="toolbar leads-toolbar">
        <label className="sr-only" htmlFor="lead-search">
          Search leads
        </label>
        <div className="search-voice-wrap">
          <input
            id="lead-search"
            type="search"
            value={query}
            placeholder="Search name, industry, place…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <VoicePill
            size={28}
            mode="toggle"
            ariaLabel="Voice search leads"
            onStart={voice.onStart}
            onStop={voice.onStop}
          />
        </div>
        <label className="sr-only" htmlFor="lead-fit">
          Minimum fit
        </label>
        <GlideSelect
          id="lead-fit"
          ariaLabel="Minimum fit"
          value={String(minFit)}
          onChange={(v) => setMinFit(Number(v))}
          menuWidth={190}
          options={[
            { value: '0', label: 'Any fit' },
            { value: '65', label: 'Good fits', tag: '65+' },
            { value: '80', label: 'Strong fits', tag: '80+' },
          ]}
        />
        <label className="sr-only" htmlFor="lead-contact">
          Contact details
        </label>
        <GlideSelect
          id="lead-contact"
          ariaLabel="Contact details"
          value={contact}
          onChange={(v) => setContact(v as ContactFilter)}
          menuWidth={184}
          options={[
            { value: 'any', label: 'Any contact' },
            { value: 'email', label: 'Has email' },
            { value: 'phone', label: 'Has phone' },
            { value: 'none', label: 'No contact yet' },
          ]}
        />
        <label className="sr-only" htmlFor="lead-sort">
          Sort
        </label>
        <GlideSelect
          id="lead-sort"
          ariaLabel="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          menuWidth={196}
          align="right"
          options={[
            { value: 'newest', label: 'Newest first' },
            { value: 'fit', label: 'Best fit first' },
            { value: 'name', label: 'Name A→Z' },
            { value: 'contact', label: 'Has email first' },
            { value: 'nowebsite', label: 'No website first' },
          ]}
        />
        <span className="toolbar-count">
          {fmtNumber(rows.length)} of {fmtNumber(leads.length)}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No leads match these filters">Try clearing the search or picking “Any fit”.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Fit</th>
                <th scope="col">Industry</th>
                <th scope="col">Location</th>
                <th scope="col">Contact</th>
                <th scope="col">Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} onClick={() => onOpen(l)}>
                  <td data-label="Company">
                    <button className="row-link" onClick={(e) => (e.stopPropagation(), onOpen(l))}>
                      {l.company}
                    </button>
                    <small className="d-block dim">{l.website || 'No website'}</small>
                  </td>
                  <td data-label="Fit">
                    <FitChip lead={l} showScore />
                  </td>
                  <td data-label="Industry">{l.industry || '—'}</td>
                  <td data-label="Location">{[l.state, l.country].filter(Boolean).join(', ') || '—'}</td>
                  <td data-label="Contact">
                    {l.contactEmail || l.contactPhone ? (
                      <span className="contact-cell">
                        {l.contactEmail && <span className="mono">{l.contactEmail}</span>}
                        {l.contactPhone && <span className="mono dim">{l.contactPhone}</span>}
                      </span>
                    ) : (
                      <span className="dim">Not found yet</span>
                    )}
                  </td>
                  <td data-label="Stage">{STAGE_LABEL[leadStage(l, drafts)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
