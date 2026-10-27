import { useState } from 'react';
import { draftLeadEmail } from '../lib/api';
import { navigate } from '../lib/router';
import type { EmailDraft, Lead } from '../lib/types';
import { DraftStatusChip } from './draftUtils';
import { toast } from './feedback';
import { Drawer } from './overlay';
import { Chip } from './ui';

export function fitTone(score: number): 'success' | 'accent' | 'neutral' {
  return score >= 80 ? 'success' : score >= 65 ? 'accent' : 'neutral';
}

export function fitLabel(score: number): string {
  return score >= 80 ? 'Strong fit' : score >= 65 ? 'Good fit' : 'Possible fit';
}

/** Fit badge — an unresearched lead's score is only a placeholder, so say so. */
export function FitChip({ lead, showScore = false }: { lead: Lead; showScore?: boolean }) {
  if (lead.profiled === false) return <Chip tone="neutral">Not checked yet</Chip>;
  return (
    <Chip tone={fitTone(lead.score)}>
      {fitLabel(lead.score)}
      {showScore ? ` · ${lead.score}` : ''}
    </Chip>
  );
}

function siteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

/** Everything known about one company, plus "write an email" for it. */
export function LeadDrawer({
  lead,
  drafts = [],
  onClose,
  onChanged,
}: {
  lead: Lead;
  drafts?: EmailDraft[];
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const mine = drafts.filter((d) => d.leadId === Number(lead.id));
  const waiting = mine.some((d) => d.status === 'Draft' || d.status === 'Approved');
  const researched = lead.profiled !== false;

  const writeEmail = async () => {
    setBusy(true);
    const res = await draftLeadEmail(lead.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (!res.data.ok) return toast.info(res.data.detail || 'An email for this company is already waiting.');
    toast.success(`Email for ${lead.company} written. It's waiting in Approvals.`);
    onChanged?.();
  };

  return (
    <Drawer
      title={lead.company}
      subtitle={[lead.industry, [lead.state, lead.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
      onClose={onClose}
      footer={
        waiting ? (
          <button className="btn btn-primary" onClick={() => navigate('approvals')}>
            Review the waiting email
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => void writeEmail()} disabled={busy}>
            {busy ? 'Writing…' : 'Write an email'}
          </button>
        )
      }
    >
      <div className="lead-facts">
        <div className="lead-fact">
          <span className="field-label">Fit</span>
          <span>
            <FitChip lead={lead} showScore />
          </span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Website</span>
          {lead.website ? (
            <a href={siteUrl(lead.website)} target="_blank" rel="noreferrer noopener">
              {lead.website}
            </a>
          ) : (
            <span className="dim">No website</span>
          )}
        </div>
        <div className="lead-fact">
          <span className="field-label">Email</span>
          {lead.contactEmail ? <span className="mono">{lead.contactEmail}</span> : <span className="dim">Not found yet</span>}
        </div>
        <div className="lead-fact">
          <span className="field-label">Phone</span>
          {lead.contactPhone ? <span className="mono">{lead.contactPhone}</span> : <span className="dim">Not found yet</span>}
        </div>
      </div>

      <section className="drawer-section">
        <h3 className="section-title">About</h3>
        {researched ? (
          <p>{lead.description || 'No summary was written for this company.'}</p>
        ) : (
          <p className="dim">Not researched yet. The next search will read their website and fill this in.</p>
        )}
      </section>

      {lead.findings.length > 0 && (
        <section className="drawer-section">
          <h3 className="section-title">What we noticed</h3>
          <ul className="finding-list">
            {lead.findings.slice(0, 6).map((f, i) => (
              <li key={i}>
                <strong>{f.issue}</strong>
                <span>{f.recommendation}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="drawer-section">
        <h3 className="section-title">Emails</h3>
        {mine.length === 0 ? (
          <p className="dim">No email written for this company yet.</p>
        ) : (
          <ul className="drawer-drafts">
            {mine.map((d) => (
              <li key={d.id}>
                <DraftStatusChip draft={d} />
                <span>{d.subject}</span>
                <small className="dim">{d.lastActivity}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="drawer-footnote dim">Found {lead.discovered} · {lead.source}</p>
    </Drawer>
  );
}
