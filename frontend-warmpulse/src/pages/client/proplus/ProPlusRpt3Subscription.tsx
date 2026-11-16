import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Mail,
  Pause,
  Play,
  Plus,
  Radio,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';

/**
 * ProPlusRpt3Subscription — "Report Subscription Manager" Pro-Plus design.
 *
 * Reports reframed as managed email subscriptions / newsletter digests. The
 * page is a SUBSCRIPTION DASHBOARD, not a config+preview split, magazine,
 * block canvas, cover strip, or archive timeline:
 *
 *   ┌── summary band: active digests · next send (live) · recipients ──┐
 *   ┌── [+ New subscription] composer (AnimatePresence expand) ────────┐
 *   ┌── subscription cards grid ───────────────────────────────────────┐
 *   │  each card = a recurring digest:                                  │
 *   │   cadence (daily/weekly/monthly · day · time) · format pill       │
 *   │   recipient chips · last-sent status · LIVE "next send in 2d 4h"  │
 *   │   send-history sparkline (recharts area) · Pause/Resume/Edit/Send │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * STANDALONE: prop-less, inline MOCK only — no network / router / query.
 * The harness supplies shell + sidebar; this renders page content only.
 *
 * Real state (useReducer): pause/resume flips status + freezes countdown;
 * "Send now" pushes a fresh point onto the sparkline, sets status=sending
 * then sent, and resets nextSend to one cadence ahead; delete removes the
 * card; the composer (useState) adds a new subscription card. A real
 * setInterval ticks `now` every second so every countdown counts down for
 * real; the interval is cleared on unmount.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Cadence = 'daily' | 'weekly' | 'monthly';
type Format = 'pdf' | 'csv';
type SubStatus = 'active' | 'paused' | 'sending' | 'failed';
type Content = 'warmth' | 'engagement' | 'placement' | 'full';

interface Mailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
}

interface Subscription {
  id: string;
  name: string;
  content: Content;
  cadence: Cadence;
  /** 0–6 (Mon–Sun) for weekly, 1–28 for monthly, unused for daily. */
  cadenceDetail: number;
  /** "08:00" send time, local. */
  sendTime: string;
  format: Format;
  recipients: string[];
  /** All mailboxes vs a named scope. */
  scopeLabel: string;
  status: SubStatus;
  /** Epoch ms of last successful send (or null if never). */
  lastSentAt: number | null;
  lastSentResult: 'ok' | 'failed' | null;
  /** Epoch ms of the next scheduled send. */
  nextSendAt: number;
  /** Recent send volumes — drives the sparkline. */
  history: number[];
  /** Lifetime sends. */
  totalSent: number;
}

// ---------------------------------------------------------------------------
// Static meta
// ---------------------------------------------------------------------------

const CONTENT_META: Record<
  Content,
  { label: string; blurb: string; Icon: LucideIcon }
> = {
  warmth: { label: 'Warmth', blurb: 'Sender-trust build-up & warmth trend', Icon: Sparkles },
  engagement: { label: 'Opens & replies', blurb: 'Opens, replies & depth', Icon: Radio },
  placement: { label: 'Where emails land', blurb: 'Inbox vs Promo vs Spam', Icon: BellRing },
  full: { label: 'Full digest', blurb: 'Everything in one PDF', Icon: FileText },
};

const FORMAT_META: Record<Format, { label: string; Icon: LucideIcon }> = {
  pdf: { label: 'PDF', Icon: FileText },
  csv: { label: 'CSV', Icon: FileSpreadsheet },
};

const STATUS_META: Record<
  SubStatus,
  { label: string; badge: 'green' | 'yellow' | 'orange' | 'blue'; dot: string }
> = {
  active: { label: 'Active', badge: 'green', dot: 'bg-accent' },
  paused: { label: 'Paused', badge: 'yellow', dot: 'bg-accent4' },
  sending: { label: 'Sending…', badge: 'blue', dot: 'bg-accent2' },
  failed: { label: 'Last send failed', badge: 'orange', dot: 'bg-accent3' },
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PROVIDER_LETTER: Record<Mailbox['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

// 15 Pro-Plus mailboxes (scope chooser source).
const MOCK_MAILBOXES: Mailbox[] = [
  { id: 'mb-01', email: 'founder@acme.io', provider: 'gmail' },
  { id: 'mb-02', email: 'sales@acme.io', provider: 'outlook' },
  { id: 'mb-03', email: 'success@acme.io', provider: 'gmail' },
  { id: 'mb-04', email: 'hello@acme.co', provider: 'smtp' },
  { id: 'mb-05', email: 'team@acme.co', provider: 'yahoo' },
  { id: 'mb-06', email: 'growth@acme.io', provider: 'gmail' },
  { id: 'mb-07', email: 'partners@acme.io', provider: 'outlook' },
  { id: 'mb-08', email: 'press@acme.co', provider: 'gmail' },
  { id: 'mb-09', email: 'careers@acme.io', provider: 'smtp' },
  { id: 'mb-10', email: 'billing@acme.co', provider: 'outlook' },
  { id: 'mb-11', email: 'support@acme.io', provider: 'gmail' },
  { id: 'mb-12', email: 'demo@acme.io', provider: 'yahoo' },
  { id: 'mb-13', email: 'events@acme.co', provider: 'gmail' },
  { id: 'mb-14', email: 'product@acme.io', provider: 'outlook' },
  { id: 'mb-15', email: 'no-reply@acme.co', provider: 'smtp' },
];

// Fixed "now" anchor so the standalone harness renders deterministically on
// first paint; the live interval advances a separate `tick` offset.
const ANCHOR = new Date('2026-05-18T09:12:00Z').getTime();
const HOUR = 3_600_000;
const DAY = 86_400_000;

function makeSubs(): Subscription[] {
  return [
    {
      id: 'sub-1',
      name: 'Weekly Warmth Digest',
      content: 'warmth',
      cadence: 'weekly',
      cadenceDetail: 0, // Monday
      sendTime: '08:00',
      format: 'pdf',
      recipients: ['founder@acme.io', 'ops@acme.io'],
      scopeLabel: 'All 15 mailboxes',
      status: 'active',
      lastSentAt: ANCHOR - 2 * DAY - 3 * HOUR,
      lastSentResult: 'ok',
      nextSendAt: ANCHOR + 2 * DAY + 4 * HOUR + 41 * 60_000,
      history: [12, 14, 13, 15, 17, 16, 18, 19, 18, 20, 21, 22],
      totalSent: 41,
    },
    {
      id: 'sub-2',
      name: 'Monthly Exec Summary',
      content: 'full',
      cadence: 'monthly',
      cadenceDetail: 1, // 1st
      sendTime: '07:30',
      format: 'pdf',
      recipients: ['founder@acme.io'],
      scopeLabel: 'All 15 mailboxes',
      status: 'active',
      lastSentAt: ANCHOR - 17 * DAY,
      lastSentResult: 'ok',
      nextSendAt: ANCHOR + 13 * DAY + 22 * HOUR + 18 * 60_000,
      history: [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
      totalSent: 9,
    },
    {
      id: 'sub-3',
      name: 'Daily Inbox-landing Alert',
      content: 'placement',
      cadence: 'daily',
      cadenceDetail: 0,
      sendTime: '06:00',
      format: 'csv',
      recipients: ['deliverability@acme.io', 'founder@acme.io', 'ops@acme.io'],
      scopeLabel: 'Gmail mailboxes (8)',
      status: 'active',
      lastSentAt: ANCHOR - 3 * HOUR - 12 * 60_000,
      lastSentResult: 'ok',
      nextSendAt: ANCHOR + 20 * HOUR + 48 * 60_000,
      history: [44, 41, 47, 45, 43, 46, 48, 42, 45, 47, 49, 46],
      totalSent: 312,
    },
    {
      id: 'sub-4',
      name: 'Sales Pod Opens & Replies',
      content: 'engagement',
      cadence: 'weekly',
      cadenceDetail: 4, // Friday
      sendTime: '16:00',
      format: 'csv',
      recipients: ['sales-lead@acme.io'],
      scopeLabel: 'Sales pod (4)',
      status: 'paused',
      lastSentAt: ANCHOR - 9 * DAY,
      lastSentResult: 'ok',
      nextSendAt: ANCHOR + 4 * DAY + 6 * HOUR,
      history: [22, 24, 21, 25, 23, 0, 0, 0, 0, 0, 0, 0],
      totalSent: 64,
    },
    {
      id: 'sub-5',
      name: 'Investor Warmth Snapshot',
      content: 'warmth',
      cadence: 'monthly',
      cadenceDetail: 15,
      sendTime: '09:00',
      format: 'pdf',
      recipients: ['board@acme.io', 'founder@acme.io'],
      scopeLabel: 'Founder mailboxes (2)',
      status: 'failed',
      lastSentAt: ANCHOR - 3 * DAY,
      lastSentResult: 'failed',
      nextSendAt: ANCHOR + 12 * DAY + 5 * HOUR + 30 * 60_000,
      history: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11],
      totalSent: 11,
    },
    {
      id: 'sub-6',
      name: 'Partners Inbox Health',
      content: 'placement',
      cadence: 'weekly',
      cadenceDetail: 2, // Wednesday
      sendTime: '10:00',
      format: 'pdf',
      recipients: ['partnerships@acme.io'],
      scopeLabel: 'Partner mailboxes (3)',
      status: 'active',
      lastSentAt: ANCHOR - 5 * DAY - 1 * HOUR,
      lastSentResult: 'ok',
      nextSendAt: ANCHOR + 1 * DAY + 50 * 60_000,
      history: [9, 10, 11, 10, 12, 13, 12, 14, 13, 15, 14, 16],
      totalSent: 58,
    },
  ];
}

// ---------------------------------------------------------------------------
// Reducer — the subscription model lives here
// ---------------------------------------------------------------------------

type Action =
  | { type: 'pause'; id: string }
  | { type: 'resume'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'sendNow'; id: string; at: number }
  | { type: 'markSent'; id: string; at: number }
  | { type: 'add'; sub: Subscription };

/** Cadence → ms until the next occurrence (approximate, deterministic). */
function cadenceSpan(c: Cadence): number {
  if (c === 'daily') return DAY;
  if (c === 'weekly') return 7 * DAY;
  return 30 * DAY;
}

function reducer(state: Subscription[], action: Action): Subscription[] {
  switch (action.type) {
    case 'pause':
      return state.map((s) =>
        s.id === action.id ? { ...s, status: 'paused' as const } : s,
      );
    case 'resume':
      return state.map((s) =>
        s.id === action.id
          ? {
              ...s,
              status: 'active' as const,
              // Resuming re-anchors the next send one cadence out.
              nextSendAt: action.id
                ? Date.now() + cadenceSpan(s.cadence)
                : s.nextSendAt,
            }
          : s,
      );
    case 'delete':
      return state.filter((s) => s.id !== action.id);
    case 'sendNow':
      return state.map((s) =>
        s.id === action.id ? { ...s, status: 'sending' as const } : s,
      );
    case 'markSent':
      return state.map((s) => {
        if (s.id !== action.id) return s;
        const nextHist = [...s.history.slice(1), Math.round(s.history.at(-1) ?? 10)];
        return {
          ...s,
          status: 'active' as const,
          lastSentAt: action.at,
          lastSentResult: 'ok' as const,
          nextSendAt: action.at + cadenceSpan(s.cadence),
          history: nextHist,
          totalSent: s.totalSent + 1,
        };
      });
    case 'add':
      return [action.sub, ...state];
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function fmtCountdown(ms: number): { value: string; unit: string }[] {
  if (ms <= 0) return [{ value: 'now', unit: '' }];
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  if (d > 0)
    return [
      { value: String(d), unit: 'd' },
      { value: String(h), unit: 'h' },
      { value: String(m), unit: 'm' },
    ];
  if (h > 0)
    return [
      { value: String(h), unit: 'h' },
      { value: String(m), unit: 'm' },
      { value: String(s), unit: 's' },
    ];
  return [
    { value: String(m), unit: 'm' },
    { value: String(s), unit: 's' },
  ];
}

function fmtRel(ms: number | null, now: number): string {
  if (ms == null) return 'never';
  const diff = now - ms;
  if (diff < 0) return 'scheduled';
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'moments ago';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function cadenceLabel(s: Subscription): string {
  if (s.cadence === 'daily') return `Every day · ${s.sendTime}`;
  if (s.cadence === 'weekly')
    return `Weekly · ${DAY_NAMES[s.cadenceDetail] ?? 'Mon'} · ${s.sendTime}`;
  const n = s.cadenceDetail;
  const ord = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  return `Monthly · ${ord} · ${s.sendTime}`;
}

// ---------------------------------------------------------------------------
// Animation presets
// ---------------------------------------------------------------------------

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRpt3Subscription(): JSX.Element {
  const [subs, dispatch] = useReducer(reducer, undefined, makeSubs);

  // Live clock — a real interval drives every countdown. Cleared on unmount.
  const [now, setNow] = useState<number>(ANCHOR);
  useEffect(() => {
    const id = window.setInterval(() => {
      // Advance from real wall-clock delta so the harness preview ticks for
      // real, anchored to the deterministic ANCHOR for first paint.
      setNow((prev) => prev + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Pending "send now" timers so we can cancel them if the card unmounts.
  const sendTimers = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const timers = sendTimers.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const handleSendNow = (id: string) => {
    dispatch({ type: 'sendNow', id, at: now });
    const t = window.setTimeout(() => {
      dispatch({ type: 'markSent', id, at: Date.now() });
      sendTimers.current.delete(id);
    }, 1400);
    sendTimers.current.set(id, t);
  };

  const [composerOpen, setComposerOpen] = useState(false);

  // Derived header summary.
  const summary = useMemo(() => {
    const active = subs.filter((s) => s.status === 'active' || s.status === 'sending');
    const recipientSet = new Set<string>();
    subs.forEach((s) => s.recipients.forEach((r) => recipientSet.add(r)));
    const upcoming = active
      .map((s) => s.nextSendAt)
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0];
    return {
      activeCount: active.length,
      total: subs.length,
      recipients: recipientSet.size,
      nextIn: upcoming != null ? upcoming - now : null,
      sentThisMonth: subs.reduce((acc, s) => acc + Math.min(s.totalSent, 99), 0),
    };
  }, [subs, now]);

  const nextChunks = summary.nextIn != null ? fmtCountdown(summary.nextIn) : null;

  return (
    <div className="space-y-5">
      {/* ── Header summary band ────────────────────────────────────────── */}
      <motion.header {...fade(0)} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                Report subscriptions
              </h1>
              <Badge variant="orange">
                <Sparkles className="h-3 w-3" />
                Pro Plus
              </Badge>
            </div>
            <p className="text-sm text-text-dim">
              Recurring digests delivered to inboxes on a schedule — like
              managing newsletters, not generating one-offs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90"
          >
            <Plus
              className={`h-4 w-4 transition-transform duration-300 ${composerOpen ? 'rotate-45' : ''}`}
            />
            New subscription
          </button>
        </div>

        {/* Summary stat strip */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-muted bg-border-muted sm:grid-cols-4">
          <SummaryStat
            Icon={Radio}
            label="Active digests"
            value={`${summary.activeCount}`}
            sub={`of ${summary.total} total`}
            tone="text-accent"
          />
          <div className="flex flex-col gap-1 bg-surface px-4 py-3.5">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
              <CalendarClock className="h-3.5 w-3.5 text-accent2" />
              Next send
            </span>
            {nextChunks ? (
              <span className="flex items-baseline gap-1">
                {nextChunks.map((c, i) => (
                  <span key={i} className="flex items-baseline">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={`${c.unit}-${c.value}`}
                        initial={{ y: -10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 10, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-lg font-semibold tabular-nums text-text"
                      >
                        {c.value}
                      </motion.span>
                    </AnimatePresence>
                    <span className="ml-0.5 mr-1.5 text-xs text-text-dim">
                      {c.unit}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-lg font-semibold text-text-dim">—</span>
            )}
          </div>
          <SummaryStat
            Icon={Users}
            label="Recipients"
            value={`${summary.recipients}`}
            sub="unique inboxes"
            tone="text-accent4"
          />
          <SummaryStat
            Icon={Send}
            label="Lifetime sends"
            value={`${summary.sentThisMonth}`}
            sub="across all digests"
            tone="text-accent2"
          />
        </div>
      </motion.header>

      {/* ── New subscription composer (expand) ─────────────────────────── */}
      <AnimatePresence initial={false}>
        {composerOpen ? (
          <motion.div
            key="composer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <Composer
              onClose={() => setComposerOpen(false)}
              onCreate={(sub) => {
                dispatch({ type: 'add', sub });
                setComposerOpen(false);
              }}
              baseNow={now}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── Subscription cards grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {subs.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
              transition={{ duration: 0.38, ease: 'easeOut', delay: 0.04 + i * 0.05 }}
            >
              <SubscriptionCard
                sub={s}
                now={now}
                onPause={() => dispatch({ type: 'pause', id: s.id })}
                onResume={() => dispatch({ type: 'resume', id: s.id })}
                onDelete={() => dispatch({ type: 'delete', id: s.id })}
                onSendNow={() => handleSendNow(s.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {subs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-muted bg-surface/40 px-6 py-14 text-center"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-text-dim">
            <Mail className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text">No subscriptions</p>
            <p className="text-xs text-text-dim">
              Create a recurring digest so reports arrive without lifting a finger.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition-colors hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            New subscription
          </button>
        </motion.div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary stat cell
// ---------------------------------------------------------------------------

function SummaryStat({
  Icon,
  label,
  value,
  sub,
  tone,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums text-text">{value}</span>
        <span className="text-xs text-text-dim">{sub}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscription card
// ---------------------------------------------------------------------------

function SubscriptionCard({
  sub,
  now,
  onPause,
  onResume,
  onDelete,
  onSendNow,
}: {
  sub: Subscription;
  now: number;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onSendNow: () => void;
}) {
  const content = CONTENT_META[sub.content];
  const fmt = FORMAT_META[sub.format];
  const st = STATUS_META[sub.status];
  const ContentIcon = content.Icon;
  const FmtIcon = fmt.Icon;

  const paused = sub.status === 'paused';
  const sending = sub.status === 'sending';
  const countdown =
    paused || sub.nextSendAt <= now
      ? null
      : fmtCountdown(sub.nextSendAt - now);

  const chartData = useMemo(
    () => sub.history.map((v, i) => ({ i, v })),
    [sub.history],
  );

  return (
    <Card className="h-full" noShimmer>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        {/* Top: identity + status */}
        <div className="flex items-start gap-3">
          <span
            className={`grid h-11 w-11 flex-none place-items-center rounded-xl bg-surface-2 ${
              sub.status === 'failed'
                ? 'text-accent3'
                : paused
                  ? 'text-accent4'
                  : 'text-accent'
            }`}
          >
            <ContentIcon className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-text">
                {sub.name}
              </h3>
            </div>
            <p className="mt-0.5 truncate text-xs text-text-dim">
              {content.blurb} · {sub.scopeLabel}
            </p>
          </div>
          <span className="flex flex-none items-center gap-1.5">
            <span className="relative inline-flex h-2 w-2">
              {sub.status === 'active' || sending ? (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${st.dot} opacity-70`}
                />
              ) : null}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${st.dot}`}
              />
            </span>
            <Badge variant={st.badge}>{st.label}</Badge>
          </span>
        </div>

        {/* Cadence + format + recipients */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
            <CalendarClock className="h-4 w-4 flex-none text-accent2" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text">
                {cadenceLabel(sub)}
              </span>
              <span className="block text-[11px] text-text-dim">sending pace</span>
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2">
            <FmtIcon className="h-4 w-4 flex-none text-accent4" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text">
                {fmt.label} attachment
              </span>
              <span className="block text-[11px] text-text-dim">
                {content.label} content
              </span>
            </span>
          </div>
        </div>

        {/* Recipient chips */}
        <div className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-text-dim">
            <Users className="h-3 w-3" />
            Delivered to {sub.recipients.length}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sub.recipients.map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2/60 py-1 pl-1 pr-2.5 text-[11px] text-text-dim"
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-accent/15 text-[9px] font-bold text-accent">
                  {r[0]?.toUpperCase() ?? '?'}
                </span>
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* Send history sparkline + last/next */}
        <div className="rounded-xl border border-border-muted bg-surface-2/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-dim">
              Send history
            </span>
            <span className="font-mono text-[11px] text-text-dim">
              {sub.totalSent} lifetime
            </span>
          </div>
          <div className="h-16 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`spark-${sub.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
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
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
                  contentStyle={{
                    background: '#12121a',
                    border: '1px solid #2a2a3a',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#e8e8f0',
                  }}
                  labelFormatter={() => 'send'}
                  formatter={(v: number) => [v, 'emails']}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="currentColor"
                  strokeWidth={2}
                  fill={`url(#spark-${sub.id})`}
                  isAnimationActive
                  animationDuration={650}
                  className={
                    sub.status === 'failed'
                      ? 'text-accent3'
                      : paused
                        ? 'text-accent4'
                        : 'text-accent'
                  }
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border-muted pt-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-text-dim">
              {sub.lastSentResult === 'failed' ? (
                <X className="h-3 w-3 text-accent3" />
              ) : (
                <CheckCircle2 className="h-3 w-3 text-accent" />
              )}
              Last sent {fmtRel(sub.lastSentAt, now)}
            </span>
            <span className="flex items-center gap-1.5">
              {countdown ? (
                <>
                  <span className="text-text-dim">Next in</span>
                  <span className="flex items-baseline gap-0.5 font-mono font-semibold text-text">
                    {countdown.map((c, i) => (
                      <span key={i} className="flex items-baseline">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={`${c.unit}-${c.value}`}
                            initial={{ y: -8, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 8, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="tabular-nums"
                          >
                            {c.value}
                          </motion.span>
                        </AnimatePresence>
                        <span className="mr-1 text-text-dim">{c.unit}</span>
                      </span>
                    ))}
                  </span>
                </>
              ) : paused ? (
                <span className="text-accent4">Paused — no upcoming send</span>
              ) : (
                <span className="text-accent2">Sending now…</span>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 pt-1">
          {paused ? (
            <button
              type="button"
              onClick={onResume}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={onPause}
              disabled={sending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2/70 disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={onSendNow}
            disabled={sending}
            className="relative inline-flex flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed"
          >
            <AnimatePresence>
              {sending ? (
                <motion.span
                  key="pulse"
                  className="absolute inset-0 bg-accent2/40"
                  initial={{ scale: 0, opacity: 0.7 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                />
              ) : null}
            </AnimatePresence>
            {sending ? (
              <Zap className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sending ? 'Sending' : 'Send now'}
          </button>
          <button
            type="button"
            aria-label="Edit subscription"
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:bg-surface-2/70 hover:text-text"
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete subscription"
            className="grid h-[34px] w-[34px] flex-none place-items-center rounded-lg border border-border-muted bg-surface-2 text-text-dim transition-colors hover:border-accent3/40 hover:bg-accent3/10 hover:text-accent3"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Composer — adds a new subscription card
// ---------------------------------------------------------------------------

let composerSeq = 0;

function Composer({
  onClose,
  onCreate,
  baseNow,
}: {
  onClose: () => void;
  onCreate: (sub: Subscription) => void;
  baseNow: number;
}) {
  const [name, setName] = useState('');
  const [content, setContent] = useState<Content>('warmth');
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [weekday, setWeekday] = useState(0);
  const [sendTime, setSendTime] = useState('08:00');
  const [format, setFormat] = useState<Format>('pdf');
  const [recipientsRaw, setRecipientsRaw] = useState('founder@acme.io');
  const [scopeAll, setScopeAll] = useState(true);
  const [pickedMb, setPickedMb] = useState<Set<string>>(() => new Set());

  const recipients = recipientsRaw
    .split(/[,\s]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const valid =
    name.trim().length > 0 &&
    recipients.length > 0 &&
    recipients.every((r) => r.includes('@'));

  const togglePicked = (id: string) =>
    setPickedMb((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    if (!valid) return;
    composerSeq += 1;
    const span =
      cadence === 'daily' ? DAY : cadence === 'weekly' ? 7 * DAY : 30 * DAY;
    const scopeLabel = scopeAll
      ? `All ${MOCK_MAILBOXES.length} mailboxes`
      : `${pickedMb.size || 1} selected mailbox${pickedMb.size === 1 ? '' : 'es'}`;
    onCreate({
      id: `sub-new-${composerSeq}`,
      name: name.trim(),
      content,
      cadence,
      cadenceDetail: cadence === 'weekly' ? weekday : cadence === 'monthly' ? 1 : 0,
      sendTime,
      format,
      recipients,
      scopeLabel,
      status: 'active',
      lastSentAt: null,
      lastSentResult: null,
      nextSendAt: baseNow + span,
      history: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      totalSent: 0,
    });
  };

  return (
    <Card noShimmer className="border-accent/30">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-text">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent">
              <Plus className="h-4 w-4" />
            </span>
            New subscription
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close composer"
            className="grid h-7 w-7 place-items-center rounded-lg text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Name */}
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
              Digest name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly Warmth Digest"
              className="w-full rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
            />
          </label>

          {/* Recipients */}
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
              Recipients (comma-separated)
            </span>
            <input
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="ceo@acme.com, ops@acme.com"
              className="w-full rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {/* Content type */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
            Content
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(CONTENT_META) as Content[]).map((c) => {
              const m = CONTENT_META[c];
              const CIcon = m.Icon;
              const active = content === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setContent(c)}
                  className={`flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-border-muted bg-surface-2/40 hover:bg-surface-2'
                  }`}
                >
                  <CIcon
                    className={`h-4 w-4 ${active ? 'text-accent' : 'text-text-dim'}`}
                  />
                  <span
                    className={`text-xs font-semibold ${active ? 'text-text' : 'text-text-dim'}`}
                  >
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cadence + format row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
              Sending pace
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(['daily', 'weekly', 'monthly'] as Cadence[]).map((c) => {
                const active = cadence === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCadence(c)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-text'
                        : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <AnimatePresence mode="wait">
              {cadence === 'weekly' ? (
                <motion.div
                  key="weekday"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-wrap gap-1.5 overflow-hidden pt-1"
                >
                  {DAY_NAMES.map((d, idx) => {
                    const active = weekday === idx;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setWeekday(idx)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-text-dim">
              Send time &amp; format
            </span>
            <div className="flex gap-2">
              <input
                type="time"
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="w-32 rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
              <div className="flex flex-1 gap-2">
                {(['pdf', 'csv'] as Format[]).map((f) => {
                  const m = FORMAT_META[f];
                  const FIcon = m.Icon;
                  const active = format === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-accent bg-accent/10 text-text'
                          : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                      }`}
                    >
                      <FIcon className="h-3.5 w-3.5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Mailbox scope */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-text-dim">
              <Users className="h-3.5 w-3.5" />
              Mailbox scope
            </span>
            <button
              type="button"
              onClick={() => setScopeAll((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent/80"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${scopeAll ? '' : 'rotate-180'}`}
              />
              {scopeAll ? `All ${MOCK_MAILBOXES.length} mailboxes` : 'Pick specific'}
            </button>
          </div>
          <AnimatePresence initial={false}>
            {!scopeAll ? (
              <motion.div
                key="mb-picker"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
                className="flex flex-wrap gap-1.5 overflow-hidden"
              >
                {MOCK_MAILBOXES.map((m) => {
                  const picked = pickedMb.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => togglePicked(m.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] transition-colors ${
                        picked
                          ? 'border-accent bg-accent/10 text-text'
                          : 'border-border-muted bg-surface-2/40 text-text-dim hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold ${
                          picked ? 'bg-accent text-bg' : 'bg-surface text-text-dim'
                        }`}
                      >
                        {PROVIDER_LETTER[m.provider]}
                      </span>
                      {m.email.split('@')[0]}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-4">
          <p className="text-xs text-text-dim">
            {valid
              ? `Delivers ${CONTENT_META[content].label} ${FORMAT_META[format].label} to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}, ${cadence}.`
              : 'Add a name and at least one valid recipient email.'}
          </p>
          <div className="flex flex-none gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border-muted bg-surface-2 px-4 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!valid}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <BellRing className="h-3.5 w-3.5" />
              Create subscription
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ProPlusRpt3Subscription;
