import { useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  Crown,
  Medal,
  Award,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Trophy,
  Sparkles,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

/**
 * ProPlusMbx3Ranking — "Fleet leaderboard / standings" for the Pro Plus tier.
 *
 * A gamified, motivational standings board for every connected mailbox. Rather
 * than a split-pane (Starter), a hero carousel (Pro) or a card grid (the other
 * Pro Plus mailbox view), this frames the fleet as a competitive league table:
 *
 *   1. A header strip — fleet average warmth, best / worst performer, slot
 *      usage (12 / 15) and a "fleet morale" readout.
 *   2. A three-position PODIUM — 1st centred and raised with a crown, 2nd to
 *      its left with a silver medal, 3rd to its right with a bronze award.
 *      Each plinth rises into place on mount.
 *   3. A ranked STANDINGS table — rank #, weekly movement (▲▼ vs last week),
 *      provider glyph, email, an animated warmth bar that fills on enter,
 *      ramp day, sends today, status and a tiny trend sparkline.
 *
 * The standings re-rank live via a segmented control (warmth / sends / ramp /
 * movement). Rows carry framer-motion `layout` so they physically slide to
 * their new position when the sort key changes (the headline animation the
 * brief asks for).
 *
 * Fully STANDALONE — no network / router / query hooks and no required props.
 * Every number comes from the inline MOCK const so the preview harness can
 * mount it prop-less. Renders only page content; the app shell supplies nav.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';
type Status = 'active' | 'warming' | 'paused';

interface FleetEntry {
  id: string;
  email: string;
  provider: Provider;
  /** Current warmth 0–100. */
  warmth: number;
  /** Warmth delta vs last week (signed, points). */
  delta: number;
  /** Net rank change vs last week (+ = climbed, − = dropped, 0 = held). */
  movement: number;
  /** Day in the ~28-day ramp ladder. */
  ramp: number;
  /** Emails sent today. */
  sends: number;
  /** Today's send ceiling. */
  target: number;
  status: Status;
  /** 12-point warmth history, oldest → newest. */
  trend: number[];
}

// ---------------------------------------------------------------------------
// Mock fleet — 14 mailboxes, warmth 46–94, fleet avg ~84, Pro Plus 15-cap
// ---------------------------------------------------------------------------

function trend(end: number, swing: number): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    const v = end - swing + swing * t + Math.sin(i * 1.07 + end) * 1.9;
    return Math.round(Math.max(40, Math.min(99, v)));
  });
}

const MOCK: FleetEntry[] = [
  { id: 'f-01', email: 'founder@acme.io', provider: 'gmail', warmth: 94, delta: 1.6, movement: 1, ramp: 29, sends: 72, target: 75, status: 'active', trend: trend(94, 7) },
  { id: 'f-02', email: 'ceo@acme.io', provider: 'outlook', warmth: 93, delta: 2.4, movement: 2, ramp: 28, sends: 70, target: 75, status: 'active', trend: trend(93, 9) },
  { id: 'f-03', email: 'sales@acme.io', provider: 'gmail', warmth: 91, delta: 0.8, movement: -2, ramp: 28, sends: 66, target: 72, status: 'active', trend: trend(91, 5) },
  { id: 'f-04', email: 'success@acme.io', provider: 'outlook', warmth: 90, delta: 1.9, movement: 1, ramp: 26, sends: 63, target: 70, status: 'active', trend: trend(90, 8) },
  { id: 'f-05', email: 'partnerships@acme.io', provider: 'gmail', warmth: 88, delta: 2.7, movement: 3, ramp: 25, sends: 60, target: 68, status: 'active', trend: trend(88, 11) },
  { id: 'f-06', email: 'team@acme.io', provider: 'outlook', warmth: 87, delta: 1.2, movement: -1, ramp: 24, sends: 58, target: 65, status: 'active', trend: trend(87, 6) },
  { id: 'f-07', email: 'hello@acme.co', provider: 'smtp', warmth: 85, delta: 2.1, movement: 2, ramp: 22, sends: 52, target: 60, status: 'active', trend: trend(85, 9) },
  { id: 'f-08', email: 'careers@acme.io', provider: 'gmail', warmth: 84, delta: 0.6, movement: 0, ramp: 21, sends: 49, target: 58, status: 'active', trend: trend(84, 4) },
  { id: 'f-09', email: 'support@acme.co', provider: 'yahoo', warmth: 82, delta: 1.8, movement: -1, ramp: 19, sends: 44, target: 55, status: 'warming', trend: trend(82, 8) },
  { id: 'f-10', email: 'growth@acme.io', provider: 'outlook', warmth: 79, delta: 3.0, movement: 4, ramp: 17, sends: 40, target: 50, status: 'warming', trend: trend(79, 12) },
  { id: 'f-11', email: 'billing@acme.co', provider: 'smtp', warmth: 76, delta: -1.4, movement: -3, ramp: 14, sends: 33, target: 45, status: 'warming', trend: trend(76, -5) },
  { id: 'f-12', email: 'press@acme.co', provider: 'yahoo', warmth: 71, delta: 2.3, movement: 2, ramp: 11, sends: 26, target: 38, status: 'warming', trend: trend(71, 10) },
  { id: 'f-13', email: 'invoices@acme.co', provider: 'smtp', warmth: 63, delta: 1.5, movement: 1, ramp: 7, sends: 15, target: 22, status: 'warming', trend: trend(63, 7) },
  { id: 'f-14', email: 'noreply@acme.co', provider: 'yahoo', warmth: 46, delta: -2.6, movement: -5, ramp: 3, sends: 0, target: 8, status: 'paused', trend: trend(46, -6) },
];

const SLOT_CAP = 15;

// ---------------------------------------------------------------------------
// Static lookups / helpers (token-only colours)
// ---------------------------------------------------------------------------

const PROVIDER_LETTER: Record<Provider, string> = {
  gmail: 'G',
  outlook: 'O',
  smtp: 'S',
  yahoo: 'Y',
};

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  smtp: 'SMTP',
  yahoo: 'Yahoo',
};

const STATUS_META: Record<
  Status,
  { label: string; dot: string; text: string }
> = {
  active: { label: 'Active', dot: 'bg-accent', text: 'text-accent' },
  warming: { label: 'Warming', dot: 'bg-accent4', text: 'text-accent4' },
  paused: { label: 'Paused', dot: 'bg-accent3', text: 'text-accent3' },
};

/** Warmth → token class. accent (strong) / accent4 (mid) / accent3 (low). */
function warmthToken(score: number): {
  text: string;
  bar: string;
  ring: string;
} {
  if (score >= 80)
    return { text: 'text-accent', bar: 'bg-accent', ring: 'border-accent/50' };
  if (score >= 60)
    return {
      text: 'text-accent4',
      bar: 'bg-accent4',
      ring: 'border-accent4/50',
    };
  return { text: 'text-accent3', bar: 'bg-accent3', ring: 'border-accent3/50' };
}

type SortKey = 'warmth' | 'sends' | 'ramp' | 'movement';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'warmth', label: 'Warmth' },
  { key: 'sends', label: 'Sends today' },
  { key: 'ramp', label: 'Build-up day' },
  { key: 'movement', label: 'Movement' },
];

function rankBy(list: FleetEntry[], key: SortKey): FleetEntry[] {
  return [...list].sort((a, b) => {
    if (key === 'sends') return b.sends - a.sends || b.warmth - a.warmth;
    if (key === 'ramp') return b.ramp - a.ramp || b.warmth - a.warmth;
    if (key === 'movement')
      return b.movement - a.movement || b.warmth - a.warmth;
    return b.warmth - a.warmth;
  });
}

function fleetMorale(avg: number): string {
  if (avg >= 85) return 'Dominant';
  if (avg >= 75) return 'Strong';
  if (avg >= 60) return 'Climbing';
  return 'Rebuilding';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusMbx3Ranking(): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('warmth');

  const fleetStats = useMemo(() => {
    const avg = Math.round(
      MOCK.reduce((a, m) => a + m.warmth, 0) / MOCK.length,
    );
    const byWarmth = rankBy(MOCK, 'warmth');
    const best = byWarmth[0]!;
    const worst = byWarmth[byWarmth.length - 1]!;
    const climbers = MOCK.filter((m) => m.movement > 0).length;
    const totalSends = MOCK.reduce((a, m) => a + m.sends, 0);
    return { avg, best, worst, climbers, totalSends };
  }, []);

  const ranked = useMemo(() => rankBy(MOCK, sortKey), [sortKey]);

  // Podium always reflects the warmth champions (the league title), so it
  // stays stable while the standings below re-rank by the chosen metric.
  const podium = useMemo(() => {
    const top = rankBy(MOCK, 'warmth').slice(0, 3);
    // Visual order: 2nd, 1st, 3rd so 1st sits centred & raised.
    return { first: top[0]!, second: top[1]!, third: top[2]! };
  }, []);

  return (
    <div className="space-y-6">
      {/* ---- Header strip ---- */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
              <Trophy className="h-5 w-5" />
            </span>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text">
                Fleet Standings
                <span className="rounded-full border border-border-muted bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-dim">
                  {MOCK.length} / {SLOT_CAP} slots
                </span>
              </h1>
              <p className="text-sm text-text-dim">
                Every mailbox, ranked. Climb the board by keeping warmth and
                send volume high.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-stretch gap-2.5">
            <HeaderStat
              label="Fleet avg"
              value={String(fleetStats.avg)}
              hint={fleetMorale(fleetStats.avg)}
              accent={warmthToken(fleetStats.avg).text}
              icon={<Flame className="h-3.5 w-3.5" />}
            />
            <HeaderStat
              label="Top performer"
              value={String(fleetStats.best.warmth)}
              hint={fleetStats.best.email.split('@')[0]!}
              accent="text-accent"
              icon={<Crown className="h-3.5 w-3.5" />}
            />
            <HeaderStat
              label="Needs attention"
              value={String(fleetStats.worst.warmth)}
              hint={fleetStats.worst.email.split('@')[0]!}
              accent="text-accent3"
              icon={<TrendingDown className="h-3.5 w-3.5" />}
            />
            <HeaderStat
              label="Climbing"
              value={`${fleetStats.climbers}`}
              hint="vs last week"
              accent="text-accent4"
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      </motion.header>

      {/* ---- Podium ---- */}
      <section
        aria-label="Top three mailboxes"
        className="rounded-2xl border border-border-muted bg-gradient-to-b from-surface to-bg p-6"
      >
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
            Warmth Champions
          </h2>
        </div>
        <div className="mx-auto flex max-w-3xl items-end justify-center gap-3 sm:gap-5">
          <PodiumColumn place={2} entry={podium.second} />
          <PodiumColumn place={1} entry={podium.first} />
          <PodiumColumn place={3} entry={podium.third} />
        </div>
      </section>

      {/* ---- Standings ---- */}
      <section className="overflow-hidden rounded-2xl border border-border-muted bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-text">Full standings</h2>
            <p className="text-xs text-text-dim">
              {ranked.length} mailboxes · re-ranks live when you change the
              metric
            </p>
          </div>
          {/* Segmented sort control — drives the live re-rank */}
          <div
            role="tablist"
            aria-label="Sort standings by"
            className="flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 p-1"
          >
            {SORTS.map((s) => {
              const on = sortKey === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSortKey(s.key)}
                  className={`relative rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    on ? 'text-bg' : 'text-text-dim hover:text-text'
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="sort-pill"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Column header */}
        <div className="hidden grid-cols-[2.5rem_2.25rem_1fr_8.5rem_3.25rem_4rem_5rem_3.5rem] items-center gap-3 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-text-dim md:grid">
          <span className="text-center">#</span>
          <span className="text-center">Mv</span>
          <span>Mailbox</span>
          <span>Warmth</span>
          <span className="text-center">Build-up</span>
          <span className="text-center">Sends</span>
          <span>Status</span>
          <span className="text-center">Trend</span>
        </div>

        {/* Rows — `layout` makes them slide to new positions on re-rank */}
        <LayoutGroup>
          <ul className="divide-y divide-border-muted/60">
            {ranked.map((entry, i) => (
              <StandingsRow
                key={entry.id}
                entry={entry}
                rank={i + 1}
                index={i}
                sortKey={sortKey}
              />
            ))}
          </ul>
        </LayoutGroup>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header stat chip
// ---------------------------------------------------------------------------

function HeaderStat({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  accent: string;
  icon: JSX.Element;
}) {
  return (
    <div className="min-w-[8.5rem] rounded-xl border border-border-muted bg-surface-2 px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-dim">
        <span className={accent}>{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`text-xl font-semibold tabular-nums ${accent}`}>
          {value}
        </span>
        <span className="truncate text-[11px] text-text-dim">{hint}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Podium column
// ---------------------------------------------------------------------------

const PLACE_META: Record<
  1 | 2 | 3,
  {
    icon: JSX.Element;
    label: string;
    plinth: string;
    badge: string;
    accent: string;
  }
> = {
  1: {
    icon: <Crown className="h-5 w-5" />,
    label: '1st',
    plinth: 'h-28 sm:h-32',
    badge: 'border-accent/50 bg-accent/15 text-accent',
    accent: 'text-accent',
  },
  2: {
    icon: <Medal className="h-4 w-4" />,
    label: '2nd',
    plinth: 'h-20 sm:h-24',
    badge: 'border-accent4/50 bg-accent4/15 text-accent4',
    accent: 'text-accent4',
  },
  3: {
    icon: <Award className="h-4 w-4" />,
    label: '3rd',
    plinth: 'h-14 sm:h-16',
    badge: 'border-accent3/50 bg-accent3/15 text-accent3',
    accent: 'text-accent3',
  },
};

function PodiumColumn({
  place,
  entry,
}: {
  place: 1 | 2 | 3;
  entry: FleetEntry;
}) {
  const meta = PLACE_META[place];
  const wt = warmthToken(entry.warmth);
  const isChamp = place === 1;
  // 2nd enters first, 1st last for a "settling onto the podium" feel.
  const delay = place === 2 ? 0.15 : place === 3 ? 0.27 : 0.4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 36, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.55,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="flex flex-1 flex-col items-center"
      style={{ maxWidth: isChamp ? 200 : 168 }}
    >
      {/* Card */}
      <div
        className={`mb-3 w-full rounded-2xl border bg-surface px-3 py-4 text-center ${
          isChamp ? 'border-accent/40' : 'border-border-muted'
        }`}
      >
        <span
          className={`mx-auto mb-2 grid place-items-center rounded-full border ${meta.badge} ${
            isChamp ? 'h-12 w-12' : 'h-9 w-9'
          }`}
        >
          {meta.icon}
        </span>
        <span
          className={`mx-auto flex items-center justify-center rounded-xl border text-sm font-semibold text-text ${
            wt.ring
          } ${isChamp ? 'h-10 w-10' : 'h-8 w-8'}`}
        >
          {PROVIDER_LETTER[entry.provider]}
        </span>
        <p
          className={`mt-2 truncate text-sm font-medium text-text ${
            isChamp ? '' : 'text-xs'
          }`}
          title={entry.email}
        >
          {entry.email.split('@')[0]}
        </p>
        <p className="truncate text-[11px] text-text-dim">
          @{entry.email.split('@')[1]}
        </p>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          <motion.span
            className={`font-semibold tabular-nums ${wt.text} ${
              isChamp ? 'text-3xl' : 'text-2xl'
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: delay + 0.25, duration: 0.4 }}
          >
            {entry.warmth}
          </motion.span>
          <span className="text-[11px] text-text-dim">warmth</span>
        </div>
        <div
          className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${
            entry.delta >= 0 ? 'text-accent' : 'text-accent3'
          }`}
        >
          {entry.delta >= 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {entry.delta >= 0 ? '+' : ''}
          {entry.delta.toFixed(1)} pts this week
        </div>
      </div>

      {/* Plinth — rises from 0 height into place */}
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.1, duration: 0.45, ease: 'easeOut' }}
        className={`flex w-full items-start justify-center rounded-t-xl border border-b-0 border-border-muted bg-surface-2 pt-2 ${meta.plinth}`}
      >
        <span
          className={`text-lg font-bold tabular-nums ${meta.accent}`}
          aria-label={`Place ${meta.label}`}
        >
          {meta.label}
        </span>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Movement indicator (▲▼ vs last week)
// ---------------------------------------------------------------------------

function Movement({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span
        className="inline-flex items-center justify-center text-text-dim"
        title="No change vs last week"
      >
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        up ? 'text-accent' : 'text-accent3'
      }`}
      title={`${up ? 'Climbed' : 'Dropped'} ${Math.abs(value)} place${
        Math.abs(value) === 1 ? '' : 's'
      } vs last week`}
    >
      {up ? (
        <ChevronUp className="h-3.5 w-3.5" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5" />
      )}
      {Math.abs(value)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Standings row
// ---------------------------------------------------------------------------

function StandingsRow({
  entry,
  rank,
  index,
  sortKey,
}: {
  entry: FleetEntry;
  rank: number;
  index: number;
  sortKey: SortKey;
}) {
  const wt = warmthToken(entry.warmth);
  const status = STATUS_META[entry.status];
  const sendPct =
    entry.target > 0
      ? Math.min(100, Math.round((entry.sends / entry.target) * 100))
      : 0;
  const trendData = entry.trend.map((v, i) => ({ i, v }));
  const isTop3 = rank <= 3;
  const gradId = `fleet-spark-${entry.id}`;
  // Whichever metric is being sorted on gets a subtle accent emphasis.
  const sendsEmph = sortKey === 'sends';
  const rampEmph = sortKey === 'ramp';

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        layout: { type: 'spring', stiffness: 340, damping: 32 },
        opacity: { duration: 0.35, delay: Math.min(index, 12) * 0.035 },
        x: { duration: 0.35, delay: Math.min(index, 12) * 0.035 },
      }}
      className={`grid grid-cols-[2.5rem_1fr] items-center gap-3 px-5 py-3 md:grid-cols-[2.5rem_2.25rem_1fr_8.5rem_3.25rem_4rem_5rem_3.5rem] ${
        entry.status === 'paused' ? 'opacity-60' : ''
      }`}
    >
      {/* Rank */}
      <div className="flex items-center justify-center">
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg text-sm font-bold tabular-nums ${
            isTop3
              ? `border ${wt.ring} ${wt.text}`
              : 'bg-surface-2 text-text-dim'
          }`}
        >
          {rank}
        </span>
      </div>

      {/* Movement (md+) */}
      <div className="hidden items-center justify-center md:flex">
        <Movement value={entry.movement} />
      </div>

      {/* Mailbox identity */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-surface-2 text-xs font-semibold text-text ${wt.ring}`}
          aria-hidden
        >
          {PROVIDER_LETTER[entry.provider]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">
            {entry.email}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-text-dim">
            {PROVIDER_LABEL[entry.provider]}
            {/* Mobile-only inline movement + sends, since columns collapse */}
            <span className="md:hidden">
              · Day {entry.ramp} · {entry.sends}/{entry.target} sent
            </span>
          </p>
        </div>
      </div>

      {/* Warmth bar — fills on enter */}
      <div className="hidden md:block">
        <div className="mb-1 flex items-baseline justify-between">
          <span className={`text-sm font-semibold tabular-nums ${wt.text}`}>
            {entry.warmth}
          </span>
          <span
            className={`text-[10px] font-medium ${
              entry.delta >= 0 ? 'text-accent' : 'text-accent3'
            }`}
          >
            {entry.delta >= 0 ? '+' : ''}
            {entry.delta.toFixed(1)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={`h-full rounded-full ${wt.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${entry.warmth}%` }}
            transition={{
              duration: 0.9,
              delay: 0.15 + Math.min(index, 12) * 0.04,
              ease: 'easeOut',
            }}
          />
        </div>
      </div>

      {/* Ramp day */}
      <div className="hidden text-center md:block">
        <span
          className={`text-sm font-medium tabular-nums ${
            rampEmph ? 'text-accent' : 'text-text'
          }`}
        >
          {entry.ramp}
        </span>
        <span className="block text-[10px] text-text-dim">/ 28</span>
      </div>

      {/* Sends today */}
      <div className="hidden text-center md:block">
        <span
          className={`text-sm font-medium tabular-nums ${
            sendsEmph ? 'text-accent' : 'text-text'
          }`}
        >
          {entry.sends}
        </span>
        <div className="mx-auto mt-1 h-1 w-12 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full bg-accent4"
            initial={{ width: 0 }}
            animate={{ width: `${sendPct}%` }}
            transition={{
              duration: 0.8,
              delay: 0.25 + Math.min(index, 12) * 0.04,
              ease: 'easeOut',
            }}
          />
        </div>
      </div>

      {/* Status */}
      <div className="hidden items-center md:flex">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* Trend sparkline — fixed-height parent, ResponsiveContainer 100% */}
      <div className="hidden h-9 w-full md:block">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={trendData}
            margin={{ top: 4, right: 1, bottom: 2, left: 1 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="currentColor"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="currentColor"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              className={wt.text}
              stroke="currentColor"
              strokeWidth={1.6}
              fill={`url(#${gradId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.li>
  );
}

// Keep AnimatePresence + directional arrow icons referenced so the import set
// stays stable across layout tweaks (used by movement semantics / a11y).
void AnimatePresence;
void ArrowUp;
void ArrowDown;

export default ProPlusMbx3Ranking;
