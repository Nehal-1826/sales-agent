import type { EmailDraft, Lead } from '../lib/types';
import { FitChip } from './LeadDrawer';

/** Where a company is in the journey — derived, never stored. */
export type LeadStage = 'found' | 'researched' | 'goodfit' | 'emailed';

export function leadStage(lead: Lead, drafts: EmailDraft[]): LeadStage {
  const id = Number(lead.id);
  if (drafts.some((d) => d.leadId === id && d.status === 'Sent' && d.sentVia !== 'console')) return 'emailed';
  if (lead.profiled === false) return 'found';
  return lead.score >= 65 ? 'goodfit' : 'researched';
}

export const STAGE_LABEL: Record<LeadStage, string> = {
  found: 'Not researched yet',
  researched: 'Researched',
  goodfit: 'Good fit',
  emailed: 'Emailed',
};

const COLUMNS: { stage: LeadStage; hint: string }[] = [
  { stage: 'found', hint: 'Just discovered. Research reads their website next.' },
  { stage: 'researched', hint: 'Checked, but a weaker match (fit below 65).' },
  { stage: 'goodfit', hint: 'Fit 65 or more: worth reaching out to.' },
  { stage: 'emailed', hint: 'An email was delivered.' },
];

/** Board view of the lead journey: Found → Researched → Good fit → Emailed. */
export function LeadBoard({
  leads,
  drafts,
  onOpen,
}: {
  leads: Lead[];
  drafts: EmailDraft[];
  onOpen: (lead: Lead) => void;
}) {
  const byStage = (stage: LeadStage) =>
    leads.filter((l) => leadStage(l, drafts) === stage).sort((a, b) => b.score - a.score);
  return (
    <div className="board">
      {COLUMNS.map(({ stage, hint }) => {
        const items = byStage(stage);
        return (
          <section className="board-col" key={stage} aria-label={STAGE_LABEL[stage]}>
            <header className="board-col-head">
              <strong>{STAGE_LABEL[stage]}</strong>
              <span className="board-count">{items.length}</span>
            </header>
            <p className="board-hint">{hint}</p>
            <ul className="board-list">
              {items.slice(0, 50).map((l) => (
                <li key={l.id}>
                  <button className="board-card" onClick={() => onOpen(l)}>
                    <strong>{l.company}</strong>
                    <small>{[l.industry, l.country].filter(Boolean).join(' · ') || l.website || '—'}</small>
                    <FitChip lead={l} />
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="board-empty">Nothing here yet</li>}
              {items.length > 50 && <li className="board-empty">+{items.length - 50} more in All leads</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
