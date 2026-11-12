import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Lock,
  Trophy,
  TrendingUp,
  ArrowUpRight,
  ArrowLeft,
  Sparkles,
  UserPlus,
  Send,
  Upload,
  ChevronRight,
  LayoutGrid,
  Layers,
  BarChart3,
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

interface Lead {
  name: string;
  company: string;
  value: string;
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

const STAGE_TOTALS: StageMix = campaigns.reduce<StageMix>(
  (acc, c) => {
    for (const key of STAGE_ORDER) acc[key] += c.stages[key];
    return acc;
  },
  { new: 0, contacted: 0, replied: 0, interested: 0, won: 0, lost: 0 },
);

// A handful of sample cards per stage so an opened campaign's board looks real.
const BOARD_SAMPLE: Record<StageKey, readonly Lead[]> = {
  new: [
    { name: 'Ava Reyes', company: 'Northwind', value: '$2,400' },
    { name: 'Liam Chen', company: 'Brightly', value: '$1,800' },
  ],
  contacted: [
    { name: 'Noah Patel', company: 'Acme Co', value: '$5,200' },
    { name: 'Zoe Kim', company: 'Vertex', value: '$900' },
  ],
  replied: [{ name: 'Mara Diaz', company: 'Lumen', value: '$3,300' }],
  interested: [{ name: 'Ivan Petrov', company: 'Catalyst', value: '$6,800' }],
  won: [{ name: 'Mia Torres', company: 'Vela Labs', value: '$8,900' }],
  lost: [],
};

interface ActivityEvent {
  icon: typeof Trophy;
  label: string;
  meta: string;
  tone: string;
}

const ACTIVITY: readonly ActivityEvent[] = [
  { icon: Trophy, label: 'Mia Torres', meta: 'Won · $8,900', tone: 'var(--wp-success, #3ddc97)' },
  { icon: UserPlus, label: 'New lead: Ava Reyes', meta: 'Northwind', tone: 'var(--wp-accent, #F26522)' },
  { icon: Send, label: 'Sequence step sent', meta: 'to 6 leads', tone: 'var(--wp-accent-2, #FF8A4B)' },
];

const TILE_TRANSITION = { duration: 0.4, ease: 'easeOut' } as const;
const VIEW_TABS = [
  { key: 'board', label: 'Board', Icon: LayoutGrid },
  { key: 'sequences', label: 'Sequences', Icon: Layers },
  { key: 'analytics', label: 'Analytics', Icon: BarChart3 },
] as const;

function MiniStageBar({ stages }: { stages: StageMix }) {
  const total = STAGE_ORDER.reduce((sum, key) => sum + stages[key], 0);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border-muted/60">
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

// ───────────────────────────────────────────────────────────────────────────
// Board view — what opens when you click a campaign. Mirrors the live CRM:
// a back button, the Board | Sequences | Analytics toggle, and a 6-column
// Kanban with lead cards.
// ───────────────────────────────────────────────────────────────────────────
function BoardView({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const isActive = campaign.status === 'active';
  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4"
    >
      {/* Sub-header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface px-2.5 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-accent/40 hover:text-text"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
          Campaigns
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight text-text">
              {campaign.name}
            </h2>
            {!isActive ? (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-dim">
                {campaign.status}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-text-dim">
            {campaign.leads} leads · {campaign.won} won
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" leftIcon={<Upload className="h-4 w-4" />}>
            Import CSV
          </Button>
          <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />}>
            Add lead
          </Button>
        </div>
      </div>

      {/* Board | Sequences | Analytics toggle (Board active) */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-border-muted bg-surface p-1">
        {VIEW_TABS.map(({ key, label, Icon }) => {
          const tabActive = key === 'board';
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                tabActive ? 'text-text' : 'text-text-dim'
              }`}
              style={
                tabActive
                  ? {
                      background: 'color-mix(in srgb, var(--wp-accent, #F26522) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--wp-accent, #F26522) 40%, transparent)',
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" strokeWidth={2.2} />
              {label}
            </span>
          );
        })}
      </div>

      {/* Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
        {STAGE_ORDER.map((key) => {
          const count = campaign.stages[key];
          const cards = BOARD_SAMPLE[key];
          const hidden = Math.max(0, count - cards.length);
          return (
            <section
              key={key}
              className="flex w-[15.5rem] flex-none flex-col rounded-2xl border border-border-muted bg-surface-2/40"
            >
              <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  style={{ backgroundColor: STAGE_COLOR[key] }}
                />
                <span className="text-xs font-semibold tracking-tight text-text">
                  {STAGE_LABEL[key]}
                </span>
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-text-dim">
                  {count}
                </span>
              </header>
              <div className="flex min-h-[5rem] flex-1 flex-col gap-2 px-2.5 pb-3">
                {cards.map((lead) => (
                  <div
                    key={lead.name}
                    className="rounded-xl border border-border-muted bg-surface p-2.5"
                  >
                    <p className="truncate text-[11px] font-semibold text-text">{lead.name}</p>
                    <p className="truncate text-[10px] text-text-dim">{lead.company}</p>
                    <span
                      className="mt-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        color: STAGE_COLOR[key],
                        background: `color-mix(in srgb, ${STAGE_COLOR[key]} 14%, transparent)`,
                      }}
                    >
                      {lead.value}
                    </span>
                  </div>
                ))}
                {hidden > 0 ? (
                  <span className="px-1 py-1 text-[10px] text-text-faint">+{hidden} more</span>
                ) : null}
                {count === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-muted/70 py-6 text-center text-[11px] text-text-faint">
                    Drop leads here
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </motion.div>
  );
}

export function ProCrmB4Bento() {
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const stageTotalSum = STAGE_ORDER.reduce((sum, key) => sum + STAGE_TOTALS[key], 0);

  const active = campaigns.find((c) => c.name === openCampaign) ?? null;
  if (active) {
    return (
      <div className="space-y-5">
        <BoardView campaign={active} onBack={() => setOpenCampaign(null)} />
      </div>
    );
  }

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
          <p className="text-sm text-text-dim">Build your pipeline alongside a warmed-up inbox.</p>
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

      {/* Bento grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {/* (1) Won this quarter */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...TILE_TRANSITION, delay: 0.04 }}
          className="relative overflow-hidden rounded-3xl border border-accent/30 bg-surface p-6 sm:col-span-2 lg:col-span-4 lg:row-span-2"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent) 0%, transparent 55%)',
            }}
          />
          <div className="relative flex h-full flex-col justify-between gap-6">
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-faint">
                Won this quarter
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <div className="space-y-3">
              <div className="text-5xl font-semibold leading-none tracking-tight tabular-nums text-text">
                $41,300
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    color: 'var(--wp-success, #3ddc97)',
                    backgroundColor: 'color-mix(in srgb, var(--wp-success, #3ddc97) 16%, transparent)',
                  }}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  +18% vs last quarter
                </span>
                <span className="text-xs text-text-dim">3 campaigns · 86 total leads</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* (2) By stage */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...TILE_TRANSITION, delay: 0.1 }}
          className="flex flex-col gap-4 rounded-3xl border border-border-muted bg-surface p-5 sm:col-span-2 lg:col-span-2 lg:row-span-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text">By stage</span>
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-faint">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {stageTotalSum} leads
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border-muted/60">
            {STAGE_ORDER.map((key) => {
              const value = STAGE_TOTALS[key];
              if (value <= 0) return null;
              const pct = stageTotalSum > 0 ? (value / stageTotalSum) * 100 : 0;
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
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2.5">
            {STAGE_ORDER.map((key) => (
              <li key={key} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-text-dim">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: STAGE_COLOR[key] }}
                  />
                  {STAGE_LABEL[key]}
                </span>
                <span className="font-medium tabular-nums text-text">{STAGE_TOTALS[key]}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* (3-5) campaign tiles — click to open the board */}
        {campaigns.map((c, i) => {
          const isActive = c.status === 'active';
          return (
            <motion.button
              key={c.name}
              type="button"
              onClick={() => setOpenCampaign(c.name)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...TILE_TRANSITION, delay: 0.16 + i * 0.06 }}
              className="group flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface p-4 text-left transition-colors hover:border-accent/40 focus-visible:border-accent focus-visible:outline-none sm:col-span-1 lg:col-span-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1 text-sm font-medium text-text group-hover:text-accent">
                  {c.name}
                  <ChevronRight className="h-3.5 w-3.5 text-text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={
                    isActive
                      ? {
                          color: 'var(--wp-success, #3ddc97)',
                          backgroundColor: 'color-mix(in srgb, var(--wp-success, #3ddc97) 14%, transparent)',
                        }
                      : { color: '#9a9ab0', backgroundColor: 'rgba(154,154,176,0.12)' }
                  }
                >
                  {c.status}
                </span>
              </div>
              <div className="flex items-end justify-between">
                <span className="flex flex-col leading-tight">
                  <span className="text-lg font-semibold tabular-nums text-text">{c.leads}</span>
                  <span className="text-[10px] uppercase tracking-wide text-text-faint">leads</span>
                </span>
                <span className="flex flex-col items-end leading-tight">
                  <span className="text-base font-semibold tabular-nums text-accent">{c.won}</span>
                  <span className="text-[10px] uppercase tracking-wide text-text-faint">won</span>
                </span>
              </div>
              <MiniStageBar stages={c.stages} />
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-faint group-hover:text-accent">
                Open board
                <ChevronRight className="h-3 w-3" />
              </span>
            </motion.button>
          );
        })}

        {/* (6) Recent activity */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...TILE_TRANSITION, delay: 0.34 }}
          className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface p-5 sm:col-span-2 lg:col-span-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text">Recent activity</span>
            <ArrowUpRight className="h-4 w-4 text-text-faint" />
          </div>
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {ACTIVITY.map((event) => {
              const Icon = event.icon;
              return (
                <li
                  key={event.label}
                  className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-2.5"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      color: event.tone,
                      backgroundColor: `color-mix(in srgb, ${event.tone} 16%, transparent)`,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium text-text">{event.label}</span>
                    <span className="truncate text-[11px] text-text-dim">{event.meta}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </div>
  );
}

export default ProCrmB4Bento;
