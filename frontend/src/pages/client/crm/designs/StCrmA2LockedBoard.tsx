import { motion } from 'framer-motion';
import { ArrowRight, BarChart3, Kanban, Lock, Sparkles, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

/**
 * StCrmA2LockedBoard — "A2 · Locked Board" design candidate.
 *
 * A Starter-tier CRM upsell/paywall. Renders a realistic, decorative Kanban
 * board (the tease) frosted behind a glass gate, with a floating "Unlock the
 * CRM" card driving to /app/billing. Standalone, no props, no network.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

interface Lead {
  name: string;
  company: string;
  value: string;
}

interface Stage {
  key: string;
  label: string;
  /** CSS colour for the dot + value-chip tint. */
  tone: string;
  /** Whether the tone is a strong accent (chip gets a filled tint) vs muted. */
  strong: boolean;
  leads: Lead[];
}

const STAGES: Stage[] = [
  {
    key: 'new',
    label: 'New',
    tone: 'var(--wp-text-faint, #6b7280)',
    strong: false,
    leads: [
      { name: 'Priya Nair', company: 'Loomly', value: '$1.2k' },
      { name: 'Marcus Webb', company: 'Northwind', value: '$3.4k' },
      { name: 'Aisha Khan', company: 'Brightpath', value: '$900' },
    ],
  },
  {
    key: 'contacted',
    label: 'Contacted',
    tone: 'color-mix(in srgb, var(--wp-accent, #F26522) 55%, transparent)',
    strong: false,
    leads: [
      { name: 'David Cho', company: 'Apex Labs', value: '$2.1k' },
      { name: 'Lena Ortiz', company: 'Cedar & Co', value: '$1.8k' },
    ],
  },
  {
    key: 'replied',
    label: 'Replied',
    tone: 'var(--wp-accent-2, #FF8A4B)',
    strong: true,
    leads: [
      { name: 'Tom Becker', company: 'Vantage', value: '$4.6k' },
      { name: 'Sara Lund', company: 'Helix', value: '$2.9k' },
      { name: 'Owen Pratt', company: 'Granite', value: '$3.1k' },
    ],
  },
  {
    key: 'interested',
    label: 'Interested',
    tone: 'var(--wp-accent, #F26522)',
    strong: true,
    leads: [
      { name: 'Mira Bose', company: 'Quill', value: '$7.2k' },
      { name: 'Jonas Vik', company: 'Forge', value: '$5.0k' },
    ],
  },
  {
    key: 'won',
    label: 'Won',
    tone: 'var(--wp-success, #3ddc97)',
    strong: true,
    leads: [
      { name: 'Ella Frost', company: 'Summit', value: '$9.8k' },
      { name: 'Raj Mehta', company: 'Beacon', value: '$6.4k' },
    ],
  },
  {
    key: 'lost',
    label: 'Lost',
    tone: 'var(--wp-danger, #ff5c7a)',
    strong: false,
    leads: [{ name: 'Cole Hart', company: 'Drift', value: '$1.1k' }],
  },
];

const FEATURE_PILLS: string[] = ['Kanban', 'Sequences', 'Analytics', 'CSV & LinkedIn import'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeadCard({ lead, tone, strong }: { lead: Lead; tone: string; strong: boolean }) {
  return (
    <div className="rounded-xl border border-border-muted bg-bg/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-text">{lead.name}</span>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={
            strong
              ? { color: tone, background: `color-mix(in srgb, ${tone} 16%, transparent)` }
              : { color: 'var(--wp-text-dim, #9ca3af)', background: 'color-mix(in srgb, #ffffff 6%, transparent)' }
          }
        >
          {lead.value}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-text-dim">{lead.company}</p>
    </div>
  );
}

function StageColumn({ stage }: { stage: Stage }) {
  return (
    <div className="flex w-60 shrink-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.tone }} />
        <span className="text-sm font-semibold text-text">{stage.label}</span>
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-dim">
          {stage.leads.length}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {stage.leads.map((lead) => (
          <LeadCard key={lead.name} lead={lead} tone={stage.tone} strong={stage.strong} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function StCrmA2LockedBoard() {
  return (
    <div className="space-y-6">
      {/* Header strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-center gap-3"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          <Lock className="h-3.5 w-3.5" />
          Paid add-on
        </span>
        <h1 className="text-xl font-semibold text-text">Your pipeline, ready to unlock</h1>
      </motion.div>

      {/* Board + gate overlay */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="relative overflow-hidden rounded-2xl border border-border-muted bg-surface p-5"
      >
        {/* Decorative board (locked behind glass) */}
        <div
          aria-hidden
          className="pointer-events-none scale-[0.99] select-none opacity-60 blur-[2px]"
        >
          <div className="flex gap-5 overflow-hidden pb-1">
            {STAGES.map((stage) => (
              <StageColumn key={stage.key} stage={stage} />
            ))}
          </div>
        </div>

        {/* Gate overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center p-4"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--wp-bg, #0b0b0d) 78%, transparent), color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent))',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
            className="w-full max-w-md rounded-2xl border border-border-muted bg-surface p-7 text-center shadow-2xl"
            style={{ boxShadow: '0 24px 60px -20px color-mix(in srgb, var(--wp-accent, #F26522) 35%, transparent)' }}
          >
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'color-mix(in srgb, var(--wp-accent, #F26522) 18%, transparent)' }}
            >
              <Lock className="h-6 w-6 text-accent" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-text">Unlock the CRM</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-text-dim">
              CRM is a paid add-on for Starter — upgrade to start moving these deals.
            </p>

            <div className="mt-6">
              <Button asChild size="lg">
                <Link to="/app/billing">
                  Upgrade to add CRM
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {FEATURE_PILLS.map((pill, i) => (
                <span
                  key={pill}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-bg/50 px-2.5 py-1 text-[11px] font-medium text-text-dim"
                >
                  {i === 0 ? (
                    <Kanban className="h-3 w-3 text-accent" />
                  ) : i === 1 ? (
                    <Sparkles className="h-3 w-3 text-accent" />
                  ) : i === 2 ? (
                    <BarChart3 className="h-3 w-3 text-accent" />
                  ) : (
                    <Upload className="h-3 w-3 text-accent" />
                  )}
                  {pill}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Reassurance line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="flex flex-wrap items-center justify-center gap-3 text-xs text-text-faint"
      >
        <span>
          <span className="text-text-dim">Pro</span> 3 campaigns ·{' '}
          <span className="text-text-dim">Pro Plus</span> 10 ·{' '}
          <span className="text-text-dim">Agency</span> unlimited
        </span>
        <Button asChild size="sm" variant="ghost">
          <Link to="/app/billing">Compare plans</Link>
        </Button>
      </motion.div>
    </div>
  );
}

export default StCrmA2LockedBoard;
