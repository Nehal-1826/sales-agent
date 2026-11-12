import { motion } from 'framer-motion';
import { Plus, Layers, Users, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type CampaignStatus = 'active' | 'paused';
type Campaign = { name: string; status: CampaignStatus; leads: number; won: string };

type StageKey = 'new' | 'contacted' | 'replied' | 'interested' | 'won' | 'lost';
type Lead = { name: string; company: string; value: string };
type Stage = { key: StageKey; label: string; leads: Lead[] };

const campaigns: Campaign[] = [
  { name: 'Q3 Cold Outreach', status: 'active', leads: 48, won: '$12,400' },
  { name: 'Product Launch', status: 'active', leads: 26, won: '$7,900' },
  { name: 'Enterprise ABM', status: 'paused', leads: 12, won: '$21,000' },
];

const ACTIVE_CAMPAIGN = 'Q3 Cold Outreach';

const stages: Stage[] = [
  {
    key: 'new',
    label: 'New',
    leads: [
      { name: 'Ava Reyes', company: 'Northwind', value: '$2,400' },
      { name: 'Liam Chen', company: 'Brightly', value: '$1,800' },
    ],
  },
  {
    key: 'contacted',
    label: 'Contacted',
    leads: [
      { name: 'Noah Patel', company: 'Acme Co', value: '$5,200' },
      { name: 'Zoe Kim', company: 'Vertex', value: '$900' },
    ],
  },
  {
    key: 'replied',
    label: 'Replied',
    leads: [{ name: 'Mara Diaz', company: 'Lumen', value: '$3,300' }],
  },
  {
    key: 'interested',
    label: 'Interested',
    leads: [{ name: 'Ivan Petrov', company: 'Catalyst', value: '$6,800' }],
  },
  {
    key: 'won',
    label: 'Won',
    leads: [{ name: 'Mia Torres', company: 'Vela Labs', value: '$8,900' }],
  },
  {
    key: 'lost',
    label: 'Lost',
    leads: [],
  },
];

// Stage colours expressed as raw CSS colour expressions so we can tint dots,
// chips, and borders consistently from one source of truth.
const STAGE_COLOR: Record<StageKey, string> = {
  new: 'var(--wp-text-faint, #6b6760)',
  contacted: 'color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)',
  replied: 'var(--wp-accent-2, #FF8A4B)',
  interested: 'var(--wp-accent, #F26522)',
  won: 'var(--wp-success, #3ddc97)',
  lost: 'var(--wp-danger, #ff5c7a)',
};

function dotStyle(key: StageKey) {
  return { backgroundColor: STAGE_COLOR[key] };
}

function valueChipStyle(key: StageKey) {
  const c = STAGE_COLOR[key];
  return {
    color: c,
    borderColor: `color-mix(in srgb, ${c} 40%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${c} 12%, transparent)`,
  };
}

export function ProCrmB3Pipeline() {
  return (
    <div className="space-y-5">
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">CRM</h1>
            <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/[0.10] px-2.5 py-0.5 text-xs font-semibold text-accent">
              Pro
            </span>
          </div>
          <p className="mt-1.5 text-sm text-text-dim">
            Build your pipeline alongside a warmed-up inbox.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-dim">
            <Layers className="h-3.5 w-3.5 text-text-faint" strokeWidth={2.2} />
            3 of 3 campaigns
          </span>
          <Button leftIcon={<Plus className="h-4 w-4" strokeWidth={2.4} />}>New campaign</Button>
        </div>
      </motion.header>

      {/* CAMPAIGN RAIL */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="rounded-2xl border border-border-muted bg-surface p-4"
      >
        <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
          {campaigns.map((c, i) => {
            const isActive = c.name === ACTIVE_CAMPAIGN;
            return (
              <motion.button
                key={c.name}
                type="button"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.1 + i * 0.07 }}
                className={`group flex min-w-[200px] shrink-0 flex-col gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-accent/60 bg-accent/[0.10]'
                    : 'border-border-muted bg-surface-2 hover:border-accent/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm font-semibold ${isActive ? 'text-text' : 'text-text-dim group-hover:text-text'}`}
                  >
                    {c.name}
                  </span>
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        c.status === 'active'
                          ? 'var(--wp-success, #3ddc97)'
                          : 'var(--wp-text-faint, #6b6760)',
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={isActive ? 'text-accent' : 'text-text-faint'}>
                    {c.leads} leads
                  </span>
                  <span className="capitalize text-text-faint">{c.status}</span>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* COMPACT SUMMARY LINE */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-muted pt-3 text-xs text-text-dim">
          <span>
            Campaigns <span className="font-semibold text-text">3</span>
          </span>
          <span className="text-text-faint">·</span>
          <span>
            Leads <span className="font-semibold text-text">86</span>
          </span>
          <span className="text-text-faint">·</span>
          <span>
            Won <span className="font-semibold text-accent">$41,300</span>
          </span>
        </div>
      </motion.section>

      {/* ACTIVE PIPELINE — MINI KANBAN */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="rounded-2xl border border-border-muted bg-surface p-4 md:p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" strokeWidth={2.2} />
            <h2 className="text-sm font-semibold text-text">{ACTIVE_CAMPAIGN}</h2>
            <span className="rounded-full border border-accent/30 bg-accent/[0.10] px-2 py-0.5 text-[11px] font-medium text-accent">
              Active
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-text-dim">
            <Trophy className="h-3.5 w-3.5 text-text-faint" strokeWidth={2.2} />
            <span className="font-semibold text-text">$12,400</span> won · 48 leads
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage, si) => (
            <motion.div
              key={stage.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + si * 0.06 }}
              className="flex flex-col rounded-xl border border-border-muted bg-bg/40 p-3"
            >
              {/* COLUMN HEADER */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={dotStyle(stage.key)}
                  />
                  <span className="text-xs font-semibold text-text">{stage.label}</span>
                </div>
                <span className="rounded-full border border-border-muted bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-dim">
                  {stage.leads.length}
                </span>
              </div>

              {/* LEAD CARDS */}
              <div className="flex flex-1 flex-col gap-2">
                {stage.leads.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-muted py-6 text-center text-[11px] text-text-faint">
                    Drop leads here
                  </div>
                ) : (
                  stage.leads.map((lead, li) => (
                    <motion.div
                      key={lead.name}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.28 + si * 0.06 + li * 0.05 }}
                      className="rounded-lg border border-border-muted bg-surface p-2.5 transition-colors hover:border-accent/30"
                    >
                      <p className="truncate text-xs font-medium text-text">{lead.name}</p>
                      <p className="truncate text-[11px] text-text-dim">{lead.company}</p>
                      <span
                        className="mt-1.5 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                        style={valueChipStyle(stage.key)}
                      >
                        {lead.value}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* FOOTER LINK */}
        <div className="mt-4 flex justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/crm">Open full board</Link>
          </Button>
        </div>
      </motion.section>
    </div>
  );
}

export default ProCrmB3Pipeline;
