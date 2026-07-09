import { motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { formatDate } from '@/lib/format';

/**
 * ProDashEditorial — Pro-tier dashboard, "Editorial / Minimal-luxe" variant.
 *
 * Standalone review build: renders entirely from the inline MOCK below — no
 * network, router, or data hooks. The differentiation from the Starter focus
 * card is *restraint*, not density: one oversized warmth number, a quiet
 * one-line narrative, a single full-bleed warmth area, then a hairline-ruled
 * mailbox table and a minimal activity timeline. Fewer boxes, more craft.
 *
 * Layout (top → bottom, every section divided by a single hairline):
 *   1. Eyebrow + oversized warmth figure + one-line trend narrative
 *   2. Three quiet inline stats (today's sends, reply rate, inbox placement)
 *   3. ONE full-bleed 30-day warmth area chart (the only chart)
 *   4. Tabular mailbox list — columns, no card chrome
 *   5. Minimal recent-activity timeline (left dot rail, relative time)
 */

// ---------------------------------------------------------------------------
// Data shape
// ---------------------------------------------------------------------------

interface EditorialMailbox {
  id: string;
  email: string;
  provider: 'Gmail' | 'Outlook' | 'Yahoo' | 'SMTP';
  warmth: number;
  delta: number;
  day: number;
  sentToday: number;
  dailyTarget: number;
}

interface EditorialActivity {
  id: string;
  ts: string;
  mailbox: string;
  peer: string;
  action: 'sent' | 'opened' | 'replied' | 'starred' | 'rescued';
}

interface EditorialData {
  warmth: number;
  warmthDelta: number;
  narrative: string;
  sentToday: number;
  sendTarget: number;
  replyRate: number;
  inboxPlacement: number;
  trend30d: Array<{ date: string; warmth: number }>;
  mailboxes: EditorialMailbox[];
  activity: EditorialActivity[];
}

// ---------------------------------------------------------------------------
// Mock data — realistic Pro-tier numbers for the preview harness
// ---------------------------------------------------------------------------

function buildTrend(): Array<{ date: string; warmth: number }> {
  const today = new Date('2026-05-17');
  // Smooth ramp 71 → 82 with a gentle settle — reads like a real curve.
  return Array.from({ length: 30 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const base = 71 + (i / 29) * 11;
    const wobble = Math.sin(i * 0.7) * 1.4 + Math.sin(i * 0.21) * 0.8;
    return {
      date: d.toISOString().slice(0, 10),
      warmth: Math.round(Math.max(0, Math.min(100, base + wobble)) * 10) / 10,
    };
  });
}

function tsAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const MOCK: EditorialData = {
  warmth: 82,
  warmthDelta: 1.4,
  narrative: 'Up 11 points over 30 days · 94% landing in inbox',
  sentToday: 108,
  sendTarget: 130,
  replyRate: 29,
  inboxPlacement: 94,
  trend30d: buildTrend(),
  mailboxes: [
    {
      id: 'mb-1',
      email: 'founder@acme.io',
      provider: 'Gmail',
      warmth: 88,
      delta: 1.6,
      day: 27,
      sentToday: 44,
      dailyTarget: 50,
    },
    {
      id: 'mb-2',
      email: 'sales@acme.io',
      provider: 'Outlook',
      warmth: 84,
      delta: 2.2,
      day: 21,
      sentToday: 38,
      dailyTarget: 45,
    },
    {
      id: 'mb-3',
      email: 'hello@acme.co',
      provider: 'SMTP',
      warmth: 79,
      delta: 0.4,
      day: 16,
      sentToday: 18,
      dailyTarget: 25,
    },
    {
      id: 'mb-4',
      email: 'team@acme.dev',
      provider: 'Yahoo',
      warmth: 77,
      delta: -0.9,
      day: 11,
      sentToday: 8,
      dailyTarget: 15,
    },
  ],
  activity: [
    { id: 'a1', ts: tsAgo(2), mailbox: 'founder@acme.io', peer: 'maria.k@peernet.io', action: 'replied' },
    { id: 'a2', ts: tsAgo(6), mailbox: 'sales@acme.io', peer: 'devon@peernet.io', action: 'opened' },
    { id: 'a3', ts: tsAgo(13), mailbox: 'hello@acme.co', peer: 'aria.s@peernet.io', action: 'rescued' },
    { id: 'a4', ts: tsAgo(21), mailbox: 'founder@acme.io', peer: 'liam@peernet.io', action: 'starred' },
    { id: 'a5', ts: tsAgo(34), mailbox: 'team@acme.dev', peer: 'noah.r@peernet.io', action: 'sent' },
    { id: 'a6', ts: tsAgo(52), mailbox: 'sales@acme.io', peer: 'emma@peernet.io', action: 'replied' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

const ACTION_VERB: Record<EditorialActivity['action'], string> = {
  sent: 'sent warmup mail to',
  opened: 'was opened by',
  replied: 'received a reply from',
  starred: 'was starred by',
  rescued: 'was recovered from spam by',
};

function DeltaTag({ value, suffix }: { value: number; suffix?: string }) {
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const tone =
    value > 0 ? 'text-accent' : value < 0 ? 'text-accent3' : 'text-text-faint';
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${tone}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      {value > 0 ? '+' : ''}
      {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProDashEditorial({ data }: { data?: EditorialData }) {
  const d = data ?? MOCK;
  const sendPct = Math.min(
    100,
    Math.round((d.sentToday / Math.max(1, d.sendTarget)) * 100),
  );
  const sorted = [...d.mailboxes].sort((a, b) => b.warmth - a.warmth);

  const fade = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: 'easeOut' as const, delay },
  });

  return (
    <div className="mx-auto max-w-5xl px-1 pb-4">
      {/* 1 — Editorial headline: eyebrow + oversized figure + narrative */}
      <motion.section {...fade(0)} className="pt-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-faint">
          Workspace warmth · {d.mailboxes.length} mailboxes
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
          <h1 className="font-mono text-[88px] font-semibold leading-[0.85] tracking-tight tabular-nums text-text sm:text-[116px]">
            {Math.round(d.warmth)}
            <span className="ml-1 align-top text-2xl font-normal text-text-faint sm:text-3xl">
              /100
            </span>
          </h1>
          <div className="mb-2 space-y-1.5">
            <p className="flex items-center gap-2 text-sm">
              <DeltaTag value={d.warmthDelta} suffix=" pts" />
              <span className="text-text-dim">in the last 24 hours</span>
            </p>
            <p className="max-w-md text-[15px] leading-relaxed text-text-dim">
              {d.narrative}. Sender trust is compounding — hold the sending pace steady to
              keep the curve climbing.
            </p>
          </div>
        </div>
      </motion.section>

      {/* hairline */}
      <div className="my-8 border-t border-border-muted" />

      {/* 2 — Three quiet inline stats */}
      <motion.section
        {...fade(0.08)}
        className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border-muted bg-border-muted sm:grid-cols-3"
      >
        <Stat
          label="Sent today"
          value={`${d.sentToday}`}
          foot={`of ${d.sendTarget} target · ${sendPct}%`}
        />
        <Stat
          label="Reply rate"
          value={`${d.replyRate}%`}
          foot="across the helper network"
        />
        <Stat
          label="Inbox vs spam"
          value={`${d.inboxPlacement}%`}
          foot="primary inbox, not spam"
        />
      </motion.section>

      {/* hairline */}
      <div className="my-8 border-t border-border-muted" />

      {/* 3 — The one hero chart: full-bleed 30-day warmth area */}
      <motion.section {...fade(0.14)}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium tracking-wide text-text">
            Warmth trajectory
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            Last 30 days
          </span>
        </div>
        <div className="mt-5 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={d.trend30d}
              margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
            >
              <defs>
                <linearGradient id="ed-warmth" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--wp-accent, #F26522)"
                    stopOpacity={0.34}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--wp-accent, #F26522)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) =>
                  formatDate(new Date(String(v)))
                }
                tick={{ fill: '#5a5a72', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={48}
                dy={8}
              />
              <YAxis
                domain={[60, 95]}
                tick={{ fill: '#5a5a72', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickCount={5}
              />
              <Tooltip
                cursor={{ stroke: '#2a2a3a', strokeWidth: 1 }}
                contentStyle={{
                  background: '#12121a',
                  border: '1px solid #2a2a3a',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#e8e8f0',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                }}
                labelFormatter={(v: string) =>
                  formatDate(new Date(String(v)))
                }
                formatter={(v: number) => [`${v} warmth`, '']}
                separator=""
              />
              <Area
                type="monotone"
                dataKey="warmth"
                stroke="var(--wp-accent, #F26522)"
                strokeWidth={2.25}
                fill="url(#ed-warmth)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: 'var(--wp-accent, #F26522)',
                  stroke: '#0a0a0f',
                  strokeWidth: 2,
                }}
                animationDuration={1100}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.section>

      {/* hairline */}
      <div className="my-8 border-t border-border-muted" />

      {/* 4 — Tabular mailbox list (no card chrome — columns + hairlines) */}
      <motion.section {...fade(0.2)}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium tracking-wide text-text">
            Mailboxes
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            Sorted by warmth
          </span>
        </div>
        <div className="mt-5">
          <div className="grid grid-cols-[1.8fr_0.8fr_0.8fr_1fr] gap-4 pb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-text-faint">
            <span>Mailbox</span>
            <span className="text-right">Warmth</span>
            <span className="hidden text-right sm:block">Day</span>
            <span className="text-right">Sent / target</span>
          </div>
          <ul>
            {sorted.map((m, i) => (
              <motion.li
                key={m.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.35, delay: 0.24 + i * 0.05 }}
                className="grid grid-cols-[1.8fr_0.8fr_0.8fr_1fr] items-center gap-4 border-t border-border-muted py-4 transition-colors hover:bg-surface/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-text">{m.email}</p>
                  <p className="mt-0.5 text-xs text-text-faint">
                    {m.provider}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-lg tabular-nums text-text">
                    {m.warmth}
                  </span>
                  <span className="ml-2 text-xs">
                    <DeltaTag value={m.delta} />
                  </span>
                </div>
                <div className="hidden text-right text-sm tabular-nums text-text-dim sm:block">
                  {m.day}
                </div>
                <div className="text-right">
                  <span className="font-mono text-sm tabular-nums text-text-dim">
                    {m.sentToday}
                    <span className="text-text-faint"> / {m.dailyTarget}</span>
                  </span>
                  <div className="mt-1.5 ml-auto h-px w-full max-w-[88px] bg-border-muted">
                    <div
                      className="h-px bg-accent"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (m.sentToday / Math.max(1, m.dailyTarget)) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.section>

      {/* hairline */}
      <div className="my-8 border-t border-border-muted" />

      {/* 5 — Minimal recent-activity timeline */}
      <motion.section {...fade(0.26)}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium tracking-wide text-text">
            Recent activity
          </h2>
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            Live
          </span>
        </div>
        <ol className="mt-6 space-y-0">
          {d.activity.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + i * 0.04 }}
              className="relative flex gap-5 pb-7 pl-1 last:pb-0"
            >
              {/* dot rail */}
              <div className="relative flex flex-col items-center">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent ring-4 ring-accent/10" />
                {i < d.activity.length - 1 && (
                  <span className="absolute top-3.5 h-full w-px bg-border-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-[15px] leading-snug text-text-dim">
                  <span className="font-medium text-text">
                    {e.mailbox.split('@')[0]}
                  </span>{' '}
                  {ACTION_VERB[e.action]}{' '}
                  <span className="text-text">{e.peer}</span>
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-text-faint">
                  {relTime(e.ts)}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </motion.section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  foot,
}: {
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <div className="bg-bg px-6 py-7">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-faint">
        {label}
      </p>
      <p className="mt-3 font-mono text-4xl font-semibold leading-none tabular-nums text-text">
        {value}
      </p>
      <p className="mt-3 text-[13px] text-text-dim">{foot}</p>
    </div>
  );
}

export default ProDashEditorial;
