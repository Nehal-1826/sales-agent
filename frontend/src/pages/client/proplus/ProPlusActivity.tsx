import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Inbox,
  Mail,
  MailOpen,
  Reply as ReplyIcon,
  ShieldAlert,
  Sparkles,
  Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { StackedBarChartWp } from '@/components/charts/recharts/StackedBarChartWp';
import { chartTheme } from '@/components/charts/theme';

/**
 * ProPlusActivity — STANDALONE Pro-Plus-tier "live warmup activity" section
 * for the isolated preview harness.
 *
 * Renders ONLY page content (heading + body). No router / query / fetch — all
 * data is the inline `MOCK` const below. The shell + sidebar are supplied by
 * the harness.
 *
 * Layout (top → bottom):
 *   1. Header band — title + Pro Plus badge + live "peer network" chip
 *   2. Pulse strip — 4 rolling-24h counters (sent / opens / replies / rescues)
 *   3. 24h aggregate — stacked bar by action type, hourly buckets
 *   4. Filter bar — mailbox / action / direction visual toggles (local state)
 *   5. Live timeline feed — icon-coded events with a subtle "live" pulse
 *
 * Scaled for a busy 15-mailbox account: ~40 timeline events over 48h.
 */

// ---------------------------------------------------------------------------
// Data shapes — mirror features/activity/types.ts
// ---------------------------------------------------------------------------

type ActivityAction =
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescued';

type Direction = 'outbound' | 'inbound';

interface HourBucket extends Record<string, unknown> {
  /** Short label like "08:00" for the hour start. */
  label: string;
  sent: number;
  opened: number;
  replied: number;
  starred: number;
  spam_rescued: number;
}

interface TimelineEvent {
  id: string;
  /** ISO timestamp. */
  ts: string;
  mailbox_email: string;
  peer_email: string;
  action: ActivityAction;
  direction: Direction;
  subject: string;
}

interface ProPlusActivityMock {
  pulse: { sent: number; opens: number; replies: number; rescues: number };
  activeCount: number;
  mailboxCount: number;
  mailboxes: string[];
  buckets: HourBucket[];
  events: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro Plus numbers (15 mailboxes, busy account)
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-17T14:30:00');

const MAILBOXES = [
  'founder@acme.io',
  'sales@acme.io',
  'success@acme.io',
  'growth@acme.io',
  'partnerships@acme.co',
  'hello@acme.co',
];

const PEERS = [
  'mara.holt@brightlane.net',
  'devon.pace@meridianloop.com',
  'priya.nair@northcove.io',
  'liam.frost@cedarpeak.co',
  'noor.aziz@harborline.net',
  'theo.vance@quillstack.com',
  'aria.bose@lumenfield.io',
  'kai.romero@driftwave.co',
];

const SUBJECTS = [
  'Re: Q3 rollout timeline',
  'Quick follow-up on the proposal',
  'Notes from yesterday',
  'Re: pricing for the enterprise tier',
  'Intro — warm handoff',
  'Re: contract redlines',
  'Checking in before the demo',
  'Re: onboarding checklist',
  'Recap + next steps',
  'Re: integration questions',
];

/** Build 24 hourly buckets ending at the anchor hour. Realistic taper. */
function buildBuckets(): HourBucket[] {
  return Array.from({ length: 24 }, (_, i) => {
    const hoursAgo = 23 - i;
    const d = new Date(ANCHOR);
    d.setHours(d.getHours() - hoursAgo, 0, 0, 0);
    const hour = d.getHours();
    // Daytime ramp: quiet overnight, peak mid-morning + afternoon.
    const daylight =
      hour >= 7 && hour <= 20
        ? 0.55 + 0.45 * Math.sin(((hour - 7) / 13) * Math.PI)
        : 0.12;
    const base = Math.round(9 * daylight + Math.sin(i * 1.7) * 1.5);
    const sent = Math.max(0, base + 2);
    const opened = Math.max(0, Math.round(sent * 0.72));
    const replied = Math.max(0, Math.round(sent * 0.28));
    const starred = Math.max(0, Math.round(sent * 0.14));
    const spam_rescued = hour % 6 === 0 && daylight > 0.4 ? 1 : 0;
    return {
      label: `${String(hour).padStart(2, '0')}:00`,
      sent,
      opened,
      replied,
      starred,
      spam_rescued,
    };
  });
}

/** Deterministic ~40-event feed over the last 48h (newest first). */
function buildEvents(): TimelineEvent[] {
  const ACTIONS: ActivityAction[] = [
    'sent',
    'sent',
    'opened',
    'opened',
    'replied',
    'starred',
    'spam_rescued',
  ];
  const out: TimelineEvent[] = [];
  let cursor = 0; // minutes-ago accumulator
  for (let i = 0; i < 42; i++) {
    cursor += 18 + ((i * 37) % 55); // 18–72 min between events
    const d = new Date(ANCHOR);
    d.setMinutes(d.getMinutes() - cursor);
    const action = ACTIONS[i % ACTIONS.length]!;
    // `sent` is outbound (user → peer); engagement is inbound (peer → user).
    const direction: Direction = action === 'sent' ? 'outbound' : 'inbound';
    out.push({
      id: `evt-${i}`,
      ts: d.toISOString(),
      mailbox_email: MAILBOXES[i % MAILBOXES.length]!,
      peer_email: PEERS[(i * 3) % PEERS.length]!,
      action,
      direction,
      subject: SUBJECTS[(i * 7) % SUBJECTS.length]!,
    });
  }
  return out;
}

const MOCK: ProPlusActivityMock = {
  pulse: { sent: 168, opens: 121, replies: 47, rescues: 6 },
  activeCount: 14,
  mailboxCount: 15,
  mailboxes: MAILBOXES,
  buckets: buildBuckets(),
  events: buildEvents(),
};

// ---------------------------------------------------------------------------
// Action metadata
// ---------------------------------------------------------------------------

const ACTION_META: Record<
  ActivityAction,
  { label: string; Icon: typeof Mail; color: string; tone: string }
> = {
  sent: {
    label: 'Sent',
    Icon: Mail,
    color: chartTheme.colors.secondary,
    tone: 'text-accent',
  },
  opened: {
    label: 'Opened',
    Icon: MailOpen,
    color: chartTheme.colors.primary,
    tone: 'text-accent',
  },
  replied: {
    label: 'Replied',
    Icon: ReplyIcon,
    color: chartTheme.colors.warning,
    tone: 'text-accent4',
  },
  starred: {
    label: 'Starred',
    Icon: Star,
    color: chartTheme.palette[4]!,
    tone: 'text-accent',
  },
  spam_rescued: {
    label: 'Rescued',
    Icon: ShieldAlert,
    color: chartTheme.colors.danger,
    tone: 'text-accent3',
  },
};

const ALL_ACTIONS: ActivityAction[] = [
  'sent',
  'opened',
  'replied',
  'starred',
  'spam_rescued',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relTime(iso: string): string {
  const d = new Date(iso);
  const ms = ANCHOR.getTime() - d.getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function shortName(email: string): string {
  return email.split('@')[0] ?? email;
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusActivity(): JSX.Element {
  const d = MOCK;

  const [mailboxFilter, setMailboxFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<ActivityAction | 'all'>(
    'all',
  );
  const [directionFilter, setDirectionFilter] = useState<Direction | 'all'>(
    'all',
  );

  const filtered = useMemo<TimelineEvent[]>(() => {
    return d.events.filter((e) => {
      if (mailboxFilter !== 'all' && e.mailbox_email !== mailboxFilter)
        return false;
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (directionFilter !== 'all' && e.direction !== directionFilter)
        return false;
      return true;
    });
  }, [d.events, mailboxFilter, actionFilter, directionFilter]);

  return (
    <div className="space-y-5">
      {/* Header band */}
      <motion.header
        {...fade(0)}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Live warmup activity
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Real-time helper-network activity across {d.mailboxCount} mailboxes —
            sends, opens, replies, stars and spam recovery.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">
            {d.activeCount}/{d.mailboxCount} warming
          </span>
          <span className="text-border-muted">·</span>
          <span>helper network live</span>
        </div>
      </motion.header>

      {/* Pulse strip — rolling 24h */}
      <motion.div
        {...fade(0.05)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <PulseTile
          label="Sent · 24h"
          value={d.pulse.sent}
          Icon={Mail}
          color={chartTheme.colors.secondary}
          delay={0.08}
        />
        <PulseTile
          label="Opens · 24h"
          value={d.pulse.opens}
          Icon={MailOpen}
          color={chartTheme.colors.primary}
          delay={0.12}
        />
        <PulseTile
          label="Replies · 24h"
          value={d.pulse.replies}
          Icon={ReplyIcon}
          color={chartTheme.colors.warning}
          delay={0.16}
        />
        <PulseTile
          label="Rescues · 24h"
          value={d.pulse.rescues}
          Icon={ShieldAlert}
          color={chartTheme.colors.danger}
          delay={0.2}
        />
      </motion.div>

      {/* 24h aggregate stacked bar */}
      <motion.div {...fade(0.12)}>
        <ChartContainer
          title="Last 24 hours by action type"
          subtitle="Hourly buckets aggregated across all 15 mailboxes."
          actions={
            <span className="flex items-center gap-1.5 rounded-full border border-border-muted px-2.5 py-1 text-xs text-text-dim">
              <Activity className="h-3 w-3 text-accent" />
              24h
            </span>
          }
          height={320}
        >
          <StackedBarChartWp<HourBucket>
            data={d.buckets}
            xKey="label"
            series={[
              {
                key: 'sent',
                name: 'Sent',
                color: chartTheme.colors.secondary,
              },
              {
                key: 'opened',
                name: 'Opened',
                color: chartTheme.colors.primary,
              },
              {
                key: 'replied',
                name: 'Replied',
                color: chartTheme.colors.warning,
              },
              {
                key: 'starred',
                name: 'Starred',
                color: chartTheme.palette[4]!,
              },
              {
                key: 'spam_rescued',
                name: 'Spam recovery',
                color: chartTheme.colors.danger,
              },
            ]}
            height={280}
          />
        </ChartContainer>
      </motion.div>

      {/* Filter bar + timeline feed */}
      <motion.div {...fade(0.18)}>
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border-muted p-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-text">
                  Activity timeline
                </h3>
                <p className="text-xs text-text-dim">
                  Live feed — newest first. {filtered.length} of{' '}
                  {d.events.length} events shown.
                </p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-text-dim">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                live
              </span>
            </div>

            {/* Mailbox filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs uppercase tracking-wider text-text-dim">
                Mailbox
              </span>
              <FilterPill
                label="All"
                active={mailboxFilter === 'all'}
                onClick={() => setMailboxFilter('all')}
              />
              {d.mailboxes.map((m) => (
                <FilterPill
                  key={m}
                  label={shortName(m)}
                  active={mailboxFilter === m}
                  onClick={() => setMailboxFilter(m)}
                />
              ))}
            </div>

            {/* Action + direction filters */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs uppercase tracking-wider text-text-dim">
                  Action
                </span>
                <FilterPill
                  label="All"
                  active={actionFilter === 'all'}
                  onClick={() => setActionFilter('all')}
                />
                {ALL_ACTIONS.map((a) => (
                  <FilterPill
                    key={a}
                    label={ACTION_META[a].label}
                    active={actionFilter === a}
                    onClick={() => setActionFilter(a)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs uppercase tracking-wider text-text-dim">
                  Direction
                </span>
                <FilterPill
                  label="All"
                  active={directionFilter === 'all'}
                  onClick={() => setDirectionFilter('all')}
                />
                <FilterPill
                  label="Outbound"
                  active={directionFilter === 'outbound'}
                  onClick={() => setDirectionFilter('outbound')}
                />
                <FilterPill
                  label="Inbound"
                  active={directionFilter === 'inbound'}
                  onClick={() => setDirectionFilter('inbound')}
                />
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-3 sm:p-5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-text-dim">
                <Inbox className="h-5 w-5 opacity-60" />
                No events match these filters.
              </div>
            ) : (
              <ul className="space-y-1">
                {filtered.map((evt, i) => (
                  <TimelineRow key={evt.id} evt={evt} index={i} />
                ))}
              </ul>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PulseTile({
  label,
  value,
  Icon,
  color,
  delay,
}: {
  label: string;
  value: number;
  Icon: typeof Mail;
  color: string;
  delay: number;
}) {
  return (
    <Card className="h-full" noShimmer>
      <div className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-dim">
          <span className="truncate">{label}</span>
          <span style={{ color }}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <motion.p
          className="text-2xl font-semibold tabular-nums leading-none text-text"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay }}
        >
          {value}
        </motion.p>
        <div className="mt-auto h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, 35 + (value % 60))}%` }}
            transition={{ duration: 0.9, ease: 'easeOut', delay }}
          />
        </div>
      </div>
    </Card>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition-colors'
          : 'rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim transition-colors hover:text-text'
      }
    >
      {label}
    </button>
  );
}

function TimelineRow({ evt, index }: { evt: TimelineEvent; index: number }) {
  const meta = ACTION_META[evt.action];
  const { Icon } = meta;
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 14) * 0.03 }}
      className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-surface-2"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
          color: meta.color,
        }}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm text-text">
          <span className="font-medium">{shortName(evt.mailbox_email)}</span>
          <span className={`text-xs ${meta.tone}`}>{meta.label}</span>
          <span className="text-text-dim">
            {evt.direction === 'outbound' ? '→' : '←'}
          </span>
          <span className="truncate text-text-dim">
            {shortName(evt.peer_email)}
          </span>
        </p>
        <p className="truncate text-xs text-text-dim">"{evt.subject}"</p>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-text-dim">
        {relTime(evt.ts)}
      </span>
    </motion.li>
  );
}

export default ProPlusActivity;
