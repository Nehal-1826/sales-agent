import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Plus,
  ChevronRight,
  Lock,
  Users,
  Layers,
  Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

type StageKey = 'new' | 'contacted' | 'replied' | 'interested' | 'won' | 'lost';

type StageMix = Record<StageKey, number>;

interface Campaign {
  name: string;
  status: 'active' | 'paused';
  leads: number;
  won: string;
  stages: StageMix;
}

const STAGE_ORDER: readonly StageKey[] = [
  'new',
  'contacted',
  'replied',
  'interested',
  'won',
  'lost',
] as const;

const STAGE_LABEL: Record<StageKey, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  won: 'Won',
  lost: 'Lost',
};

// Stage colours per brief: orange-forward with success/danger poles.
const STAGE_COLOR: Record<StageKey, string> = {
  new: '#5a5a72',
  contacted: 'color-mix(in srgb, var(--wp-accent, #F26522) 55%, #5a5a72)',
  replied: 'var(--wp-accent-2, #FF8A4B)',
  interested: 'var(--wp-accent, #F26522)',
  won: 'var(--wp-success, #3ddc97)',
  lost: 'var(--wp-danger, #ff5c7a)',
};

const campaigns: readonly Campaign[] = [
  {
    name: 'Q3 Cold Outreach',
    status: 'active',
    leads: 48,
    won: '$12,400',
    stages: { new: 18, contacted: 12, replied: 8, interested: 6, won: 3, lost: 1 },
  },
  {
    name: 'Product Launch',
    status: 'active',
    leads: 26,
    won: '$7,900',
    stages: { new: 6, contacted: 7, replied: 5, interested: 4, won: 2, lost: 2 },
  },
  {
    name: 'Enterprise ABM',
    status: 'paused',
    leads: 12,
    won: '$21,000',
    stages: { new: 3, contacted: 2, replied: 2, interested: 3, won: 2, lost: 0 },
  },
];

interface SummaryStat {
  label: string;
  value: string;
  icon: typeof Users;
}

const SUMMARY_STATS: readonly SummaryStat[] = [
  { label: 'Campaigns', value: '3', icon: Layers },
  { label: 'Total leads', value: '86', icon: Users },
  { label: 'Won', value: '$41,300', icon: Trophy },
];

function StageBar({ stages }: { stages: StageMix }) {
  const total = STAGE_ORDER.reduce((sum, key) => sum + stages[key], 0);
  return (
    <div className="flex h-2 w-full min-w-[120px] overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border-muted/60">
      {STAGE_ORDER.map((key) => {
        const value = stages[key];
        if (value <= 0) return null;
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
          <span
            key={key}
            title={`${STAGE_LABEL[key]}: ${value}`}
            style={{ width: `${pct}%`, backgroundColor: STAGE_COLOR[key] }}
            className="h-full"
          />
        );
      })}
    </div>
  );
}

export function ProCrmB2Ledger() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">CRM</h1>
            <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent ring-1 ring-inset ring-accent/30">
              Pro
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Build your pipeline alongside a warmed-up inbox.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            title="Cap reached — upgrade for more"
            className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-xs font-medium text-text-dim"
          >
            <Lock className="h-3.5 w-3.5 text-accent" />
            3 of 3 campaigns
          </div>
          <Button variant="primary" size="md" leftIcon={<Plus className="h-4 w-4" />}>
            New campaign
          </Button>
        </div>
      </motion.header>

      {/* Summary band */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
        className="flex flex-wrap items-stretch gap-x-8 gap-y-4 rounded-2xl border border-border-muted bg-surface px-5 py-4"
      >
        {SUMMARY_STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex flex-col leading-tight">
                <span className="text-lg font-semibold tabular-nums text-text">
                  {stat.value}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-text-faint">
                  {stat.label}
                </span>
              </span>
            </div>
          );
        })}
      </motion.div>

      {/* Ledger table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-muted text-left text-[11px] uppercase tracking-wider text-text-faint">
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 text-right font-medium">Leads</th>
                <th className="px-5 py-3 font-medium">Stage mix</th>
                <th className="px-5 py-3 text-right font-medium">Won value</th>
                <th className="px-5 py-3 text-right font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr
                  key={c.name}
                  className={`group border-b border-border-muted/60 transition-colors last:border-b-0 hover:bg-surface-2/60 ${
                    i % 2 === 1 ? 'bg-surface-2/30' : ''
                  }`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            c.status === 'active'
                              ? 'var(--wp-success, #3ddc97)'
                              : '#5a5a72',
                        }}
                      />
                      <div className="flex flex-col leading-tight">
                        <span className="font-medium text-text">{c.name}</span>
                        <span className="text-[11px] capitalize text-text-faint">
                          {c.status}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-medium tabular-nums text-text">
                    {c.leads}
                  </td>
                  <td className="px-5 py-4">
                    <StageBar stages={c.stages} />
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-text">
                    {c.won}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-text-dim hover:text-accent"
                    >
                      <Link to="/app/crm">
                        Open
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-muted bg-surface-2/20 px-5 py-3">
          {STAGE_ORDER.map((key) => (
            <span key={key} className="flex items-center gap-1.5 text-[11px] text-text-dim">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: STAGE_COLOR[key] }}
              />
              {STAGE_LABEL[key]}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default ProCrmB2Ledger;
