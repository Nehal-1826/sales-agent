import { motion } from 'framer-motion';
import {
  Plus,
  Megaphone,
  Users,
  DollarSign,
  PieChart,
  ArrowUpRight,
  Lock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

type StageKey = 'new' | 'contacted' | 'replied' | 'interested' | 'won' | 'lost';

interface StageMeta {
  key: StageKey;
  label: string;
  color: string;
}

interface Campaign {
  name: string;
  status: 'active' | 'paused';
  leads: number;
  won: string;
  stages: Record<StageKey, number>;
}

const STAGES: StageMeta[] = [
  { key: 'new', label: 'New', color: 'var(--wp-text-faint, #6b6b78)' },
  { key: 'contacted', label: 'Contacted', color: 'color-mix(in srgb, var(--wp-accent, #F26522) 55%, #6b6b78)' },
  { key: 'replied', label: 'Replied', color: 'var(--wp-accent-2, #FF8A4B)' },
  { key: 'interested', label: 'Interested', color: 'var(--wp-accent, #F26522)' },
  { key: 'won', label: 'Won', color: 'var(--wp-success, #3ddc97)' },
  { key: 'lost', label: 'Lost', color: 'var(--wp-danger, #ff5c7a)' },
];

const CAMPAIGNS: Campaign[] = [
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

const TOTAL_STAGES: Record<StageKey, number> = STAGES.reduce(
  (acc, stage) => {
    acc[stage.key] = CAMPAIGNS.reduce((sum, c) => sum + c.stages[stage.key], 0);
    return acc;
  },
  { new: 0, contacted: 0, replied: 0, interested: 0, won: 0, lost: 0 },
);

const TOTAL_STAGE_COUNT: number = STAGES.reduce((sum, s) => sum + TOTAL_STAGES[s.key], 0);

interface KpiTile {
  label: string;
  value: string;
  icon: typeof Megaphone;
}

const KPIS: KpiTile[] = [
  { label: 'Campaigns', value: '3', icon: Megaphone },
  { label: 'Total leads', value: '86', icon: Users },
  { label: 'Won value', value: '$41,300', icon: DollarSign },
];

function StageBar({ stages, total }: { stages: Record<StageKey, number>; total: number }) {
  const sum: number = total > 0 ? total : 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border-muted/60">
      {STAGES.map((stage) => {
        const count: number = stages[stage.key];
        if (count === 0) return null;
        const pct: number = (count / sum) * 100;
        return (
          <motion.div
            key={stage.key}
            title={`${stage.label}: ${count}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ backgroundColor: stage.color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

export function ProCrmB1Cockpit() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">CRM</h1>
            <span className="rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
              Pro
            </span>
          </div>
          <p className="text-sm text-text-dim">Build your pipeline alongside a warmed-up inbox.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-3 py-1 text-xs font-medium text-text">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              3 of 3 campaigns
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-text-faint">
              <Lock className="h-3.5 w-3.5" strokeWidth={2.2} />
              Cap reached — upgrade for more
            </span>
          </div>
        </div>
        <Button asChild size="md">
          <Link to="/app/crm/new">
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            New campaign
          </Link>
        </Button>
      </motion.div>

      {/* KPI cockpit strip */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={kpi.label}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              className="rounded-2xl border border-border-muted bg-surface p-4"
            >
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-dim">
                <Icon className="h-4 w-4 text-accent" strokeWidth={2.2} />
                {kpi.label}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-text">{kpi.value}</p>
            </motion.div>
          );
        })}

        {/* By-stage distribution mini-bar */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-border-muted bg-surface p-4"
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-dim">
            <PieChart className="h-4 w-4 text-accent" strokeWidth={2.2} />
            By stage
          </div>
          <div className="mt-3">
            <StageBar stages={TOTAL_STAGES} total={TOTAL_STAGE_COUNT} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {STAGES.map((stage) => (
              <span key={stage.key} className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: stage.color }} />
                {stage.label}
                <span className="tabular-nums text-text-faint">{TOTAL_STAGES[stage.key]}</span>
              </span>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Campaign cards */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.2 } } }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {CAMPAIGNS.map((campaign) => {
          const isActive: boolean = campaign.status === 'active';
          return (
            <motion.div
              key={campaign.name}
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              className="group flex flex-col gap-4 rounded-2xl border border-border-muted bg-surface p-5 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold leading-snug text-text">{campaign.name}</h3>
                <span
                  className={
                    isActive
                      ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent'
                      : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-faint'
                  }
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: isActive ? 'var(--wp-accent, #F26522)' : 'var(--wp-text-faint, #6b6b78)' }}
                  />
                  {isActive ? 'Active' : 'Paused'}
                </span>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-text-faint">Leads</p>
                  <p className="text-xl font-semibold tabular-nums text-text">{campaign.leads}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-text-faint">Won</p>
                  <p className="text-xl font-semibold tabular-nums text-accent">{campaign.won}</p>
                </div>
              </div>

              <StageBar stages={campaign.stages} total={campaign.leads} />

              <Link
                to="/app/crm"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-text-dim transition-colors group-hover:text-accent"
              >
                Open
                <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

export default ProCrmB1Cockpit;
