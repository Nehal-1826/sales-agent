import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Filter,
  Mail,
  MailOpen,
  Pause,
  Play,
  Reply as ReplyIcon,
  ShieldAlert,
  Star,
  TerminalSquare,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * ProPlusAct1Terminal — STANDALONE Pro-Plus "Warmup Activity" section, built
 * as a LIVE TERMINAL STREAM for the isolated preview harness.
 *
 * Deliberately a different paradigm from the other three activity layouts:
 *   - StarterActivity → today strip + 7-day SVG stacked bar + drilldown list
 *   - ProActivity     → Slack-style channel rail + message feed
 *   - ProPlusActivity → pulse tiles + recharts bar + icon-avatar timeline
 *
 * This one is a `tail -f`-style CONSOLE. A monospace log panel where newest
 * lines append at the BOTTOM and the view auto-scrolls down (unless paused),
 * each line color-coded by action. No cards, no charts, no avatars, no
 * channel rail — it should FEEL like watching a live log scroll, not reading
 * a feed of cards.
 *
 *   ┌─ control bar ── action chips · mailbox select · pause · throughput ─┐
 *   ├──────────────────────────────────┬──────────────────────────────────┤
 *   │  LOG STREAM (mono, scroll-to-    │  ROLLING COUNTS gutter            │
 *   │  bottom, framer entrance per ln) │  (per-action tallies, live)       │
 *   │  [hh:mm:ss] SENT  mbx → peer "s" │                                   │
 *   │  ● live  blinking cursor ────────┴───────────────────────────────────┤
 *
 * Fully prop-less and offline: an inline MOCK seed (~40 lines) plus a
 * deterministic generator that appends a fresh line every ~1.6s via
 * setInterval (cleared on unmount). The in-memory log is capped at 200 lines.
 * Pro Plus framing: 15 mailboxes across the peer-inbox network.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Action = 'SENT' | 'OPENED' | 'REPLIED' | 'STARRED' | 'SPAM_RESCUE';

interface LogLine {
  /** Monotonic id — also drives framer-motion keying. */
  seq: number;
  /** Epoch ms (so we can format a wall clock + relative age). */
  at: number;
  mailbox: string;
  peer: string;
  action: Action;
  subject: string;
}

// ---------------------------------------------------------------------------
// Static dictionaries (Pro Plus = 15 mailboxes, peer network)
// ---------------------------------------------------------------------------

const MAILBOXES = [
  'founder@acme.io',
  'sales@acme.io',
  'success@acme.io',
  'growth@acme.io',
  'partnerships@acme.io',
  'hello@acme.co',
  'support@acme.co',
  'billing@acme.co',
  'team@northwind.dev',
  'ops@northwind.dev',
  'newsletter@northwind.dev',
  'founder@brightloop.app',
  'sales@brightloop.app',
  'hello@brightloop.app',
  'desk@brightloop.app',
] as const;

const PEERS = [
  'peer_4821',
  'peer_1907',
  'peer_3344',
  'peer_2218',
  'peer_5560',
  'peer_8093',
  'peer_6471',
  'peer_7102',
  'peer_0934',
  'peer_5677',
  'peer_2850',
  'peer_3961',
] as const;

const SUBJECTS = [
  'Re: intro',
  'Re: Q3 rollout timeline',
  'Quick follow-up',
  'Notes from yesterday',
  'Re: pricing tier',
  'warm handoff',
  'Re: contract redlines',
  'Checking in before the demo',
  'Recap + next steps',
  'Re: integration questions',
  'Re: onboarding checklist',
  'Thread: partnership',
] as const;

// Weighted action stream — sends dominate, rescues are rare.
const ACTION_STREAM: Action[] = [
  'SENT',
  'SENT',
  'SENT',
  'OPENED',
  'OPENED',
  'OPENED',
  'REPLIED',
  'STARRED',
  'SENT',
  'OPENED',
  'REPLIED',
  'SPAM_RESCUE',
];

const ACTION_META: Record<
  Action,
  { Icon: typeof Mail; tone: string; bar: string; dot: string; pad: string }
> = {
  // tone: text color · bar: gutter meter bg · dot: status dot bg
  SENT: {
    Icon: Mail,
    tone: 'text-accent2',
    bar: 'bg-accent2',
    dot: 'bg-accent2',
    pad: 'SENT       ',
  },
  OPENED: {
    Icon: MailOpen,
    tone: 'text-accent',
    bar: 'bg-accent',
    dot: 'bg-accent',
    pad: 'OPENED     ',
  },
  REPLIED: {
    Icon: ReplyIcon,
    tone: 'text-accent4',
    bar: 'bg-accent4',
    dot: 'bg-accent4',
    pad: 'REPLIED    ',
  },
  STARRED: {
    Icon: Star,
    tone: 'text-accent4',
    bar: 'bg-accent4',
    dot: 'bg-accent4',
    pad: 'STARRED    ',
  },
  SPAM_RESCUE: {
    Icon: ShieldAlert,
    tone: 'text-accent3',
    bar: 'bg-accent3',
    dot: 'bg-accent3',
    pad: 'SPAM_RESCUE',
  },
};

const ALL_ACTIONS: Action[] = [
  'SENT',
  'OPENED',
  'REPLIED',
  'STARRED',
  'SPAM_RESCUE',
];

const MAX_LINES = 200;
const TICK_MS = 1600;

// ---------------------------------------------------------------------------
// Deterministic generator — no Math.random, so the seed + the live stream are
// reproducible. `seq` is the only entropy source.
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[], seq: number, salt: number): T {
  // Cheap LCG-ish hash so consecutive seqs don't land on the same index.
  const h = (seq * 2654435761 + salt * 40503) >>> 0;
  return arr[h % arr.length] as T;
}

function makeLine(seq: number, at: number): LogLine {
  const action = ACTION_STREAM[seq % ACTION_STREAM.length] as Action;
  return {
    seq,
    at,
    mailbox: pick(MAILBOXES, seq, 11),
    peer: pick(PEERS, seq, 29),
    action,
    subject: pick(SUBJECTS, seq, 53),
  };
}

/** ~40-line seed ending "now", spaced 25–115s apart walking backwards. */
function buildSeed(now: number): LogLine[] {
  const COUNT = 42;
  const lines: LogLine[] = [];
  let cursorMs = now;
  for (let i = 0; i < COUNT; i++) {
    const seq = COUNT - 1 - i; // oldest gets the lowest seq
    cursorMs -= (25 + ((seq * 37) % 90)) * 1000;
    lines.push(makeLine(seq, cursorMs));
  }
  // buildSeed walked newest→oldest; flip so index order == chronological.
  return lines.reverse();
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function shortMbx(email: string): string {
  return email.split('@')[0] ?? email;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusAct1Terminal(): JSX.Element {
  // Single fixed origin so SSR/first paint is stable; the live ticker advances
  // wall-clock from here.
  const originRef = useRef<number>(Date.now());

  const [lines, setLines] = useState<LogLine[]>(() =>
    buildSeed(originRef.current),
  );
  const seqRef = useRef<number>(
    lines.length ? (lines[lines.length - 1]!.seq ?? 0) + 1 : 0,
  );

  // Filters + autoscroll state.
  const [muted, setMuted] = useState<Set<Action>>(() => new Set());
  const [mailboxFilter, setMailboxFilter] = useState<string>('all');
  const [paused, setPaused] = useState(false);

  // Throughput readout (events/hr) — derived from the last 5 min of arrivals.
  const [eventsTotal, setEventsTotal] = useState<number>(lines.length);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // ---- Live ticker: append one fresh line every TICK_MS ----
  useEffect(() => {
    const id = window.setInterval(() => {
      const seq = seqRef.current++;
      const next = makeLine(seq, Date.now());
      setLines((prev) => {
        const grown = [...prev, next];
        // Cap memory — keep only the most-recent MAX_LINES.
        return grown.length > MAX_LINES
          ? grown.slice(grown.length - MAX_LINES)
          : grown;
      });
      setEventsTotal((n) => n + 1);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ---- Auto-scroll to bottom on new lines unless paused ----
  const filtered = useMemo<LogLine[]>(() => {
    return lines.filter((l) => {
      if (muted.has(l.action)) return false;
      if (mailboxFilter !== 'all' && l.mailbox !== mailboxFilter) return false;
      return true;
    });
  }, [lines, muted, mailboxFilter]);

  useEffect(() => {
    if (paused) return;
    const el = scrollRef.current;
    if (!el) return;
    // Defer so the new row has laid out before we measure scrollHeight.
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [filtered.length, paused]);

  const toggleAction = useCallback((a: Action) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }, []);

  const jumpToLive = useCallback(() => {
    setPaused(false);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  // ---- Derived readouts ----
  const perAction = useMemo(() => {
    const tally: Record<Action, number> = {
      SENT: 0,
      OPENED: 0,
      REPLIED: 0,
      STARRED: 0,
      SPAM_RESCUE: 0,
    };
    for (const l of lines) tally[l.action] += 1;
    return tally;
  }, [lines]);

  const throughput = useMemo(() => {
    // Events seen in the last 5 minutes, extrapolated to an hourly rate.
    const cutoff = Date.now() - 5 * 60_000;
    const recent = lines.filter((l) => l.at >= cutoff).length;
    return Math.round(recent * 12);
  }, [lines, eventsTotal]);

  const peakAction = (Object.keys(perAction) as Action[]).reduce((a, b) =>
    perAction[a] >= perAction[b] ? a : b,
  );
  const peakCount = perAction[peakAction] || 1;

  return (
    <div className="space-y-4">
      {/* ── Heading ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
              <TerminalSquare className="h-4 w-4" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Warmup Activity
            </h1>
            <span className="rounded-full border border-accent3/30 bg-accent3/10 px-2.5 py-0.5 text-xs font-semibold text-accent3">
              Pro Plus
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Live helper-network event stream — tailing {MAILBOXES.length}{' '}
            mailboxes. Newest events append at the bottom.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 font-mono text-xs text-text-dim">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent2 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent2" />
          </span>
          <span className="font-semibold text-text">
            {formatNumber(throughput)}
          </span>
          <span>events/hr</span>
        </div>
      </div>

      {/* ── Terminal shell ──────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border-muted bg-bg">
        {/* Title bar — traffic dots + path + window controls */}
        <div className="flex items-center gap-3 border-b border-border-muted bg-surface px-4 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-accent3/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent4/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent2/70" />
          </div>
          <span className="font-mono text-xs text-text-dim">
            warmpulse@peernet:~$ tail -f warmup.log
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-xs">
            <span className="relative inline-flex h-2 w-2">
              {paused ? (
                <span className="inline-flex h-2 w-2 rounded-full bg-text-dim" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent2 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent2" />
                </>
              )}
            </span>
            <span className={paused ? 'text-text-dim' : 'text-accent2'}>
              {paused ? 'paused' : 'live'}
            </span>
          </span>
        </div>

        {/* Control bar — filter chips · mailbox select · pause */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border-muted bg-surface/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 flex items-center gap-1 font-mono text-[0.7rem] uppercase tracking-wider text-text-dim">
              <Filter className="h-3 w-3" />
              filter
            </span>
            {ALL_ACTIONS.map((a) => {
              const on = !muted.has(a);
              const meta = ACTION_META[a];
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAction(a)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.7rem] transition-colors ${
                    on
                      ? 'border-border-muted bg-surface-2 text-text'
                      : 'border-transparent bg-transparent text-text-dim line-through opacity-60 hover:opacity-100'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      on ? meta.dot : 'bg-text-dim'
                    }`}
                    aria-hidden
                  />
                  {a}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="ppt-mbx"
              className="font-mono text-[0.7rem] uppercase tracking-wider text-text-dim"
            >
              mbx
            </label>
            <select
              id="ppt-mbx"
              value={mailboxFilter}
              onChange={(e) => setMailboxFilter(e.target.value)}
              className="rounded-md border border-border-muted bg-surface-2 px-2 py-1 font-mono text-xs text-text focus:border-accent/50 focus:outline-none"
            >
              <option value="all">all ({MAILBOXES.length})</option>
              {MAILBOXES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
              paused
                ? 'border-accent2/40 bg-accent2/10 text-accent2'
                : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
            }`}
          >
            {paused ? (
              <>
                <Play className="h-3 w-3" />
                resume
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" />
                pause
              </>
            )}
          </button>
        </div>

        {/* Body — log stream + rolling-counts gutter */}
        <div className="flex">
          {/* LOG STREAM */}
          <div className="relative min-w-0 flex-1">
            <div
              ref={scrollRef}
              className="h-[clamp(420px,58vh,640px)] overflow-y-auto px-4 py-3 font-mono text-[0.78rem] leading-relaxed"
            >
              {filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-text-dim">
                  <span className="font-mono text-xs">
                    -- no matching events --
                  </span>
                  <span className="font-mono text-[0.7rem]">
                    every action type or this mailbox is filtered out
                  </span>
                </div>
              ) : (
                <ul className="space-y-0.5">
                  <AnimatePresence initial={false}>
                    {filtered.map((l) => (
                      <LogRow key={l.seq} line={l} />
                    ))}
                  </AnimatePresence>

                  {/* Blinking prompt cursor — the "tail is live" affordance */}
                  <li className="flex items-center gap-2 pt-1 text-text-dim">
                    <span className="select-none text-accent2">
                      warmpulse@peernet
                    </span>
                    <span className="select-none">$</span>
                    {paused ? (
                      <span className="text-text-dim">
                        autoscroll paused — {filtered.length} lines buffered
                      </span>
                    ) : (
                      <motion.span
                        className="inline-block h-3.5 w-2 bg-accent2"
                        animate={{ opacity: [1, 1, 0, 0] }}
                        transition={{
                          duration: 1.1,
                          repeat: Infinity,
                          ease: 'linear',
                          times: [0, 0.5, 0.5, 1],
                        }}
                        aria-hidden
                      />
                    )}
                  </li>
                </ul>
              )}
            </div>

            {/* Jump-to-live pill — only while paused */}
            <AnimatePresence>
              {paused && (
                <motion.button
                  type="button"
                  onClick={jumpToLive}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-accent2/40 bg-accent2/15 px-3 py-1 font-mono text-xs font-medium text-accent2 shadow-lg backdrop-blur"
                >
                  <ChevronDown className="h-3 w-3" />
                  jump to live
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* ROLLING COUNTS GUTTER */}
          <aside className="hidden w-52 shrink-0 border-l border-border-muted bg-surface/40 p-4 lg:block">
            <p className="mb-3 font-mono text-[0.7rem] uppercase tracking-wider text-text-dim">
              rolling counts
            </p>
            <ul className="space-y-3">
              {ALL_ACTIONS.map((a) => {
                const meta = ACTION_META[a];
                const count = perAction[a];
                const muteOn = muted.has(a);
                return (
                  <li key={a} className={muteOn ? 'opacity-40' : ''}>
                    <div className="mb-1 flex items-center justify-between font-mono text-[0.7rem]">
                      <span
                        className={`flex items-center gap-1.5 ${meta.tone}`}
                      >
                        <meta.Icon className="h-3 w-3" />
                        {a}
                      </span>
                      <span className="tabular-nums text-text">{count}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                      <motion.div
                        className={`h-full rounded-full ${meta.bar}`}
                        animate={{
                          width: `${Math.max(
                            4,
                            Math.round((count / peakCount) * 100),
                          )}%`,
                        }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 space-y-1.5 border-t border-border-muted pt-4 font-mono text-[0.7rem] text-text-dim">
              <div className="flex items-center justify-between">
                <span>buffer</span>
                <span className="tabular-nums text-text">
                  {lines.length}/{MAX_LINES}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>shown</span>
                <span className="tabular-nums text-text">
                  {filtered.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>total seen</span>
                <span className="tabular-nums text-text">{eventsTotal}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single streamed log line
// ---------------------------------------------------------------------------

function LogRow({ line }: { line: LogLine }): JSX.Element {
  const meta = ACTION_META[line.action];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10, backgroundColor: 'rgba(242, 101, 34,0.10)' }}
      animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(242, 101, 34,0)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="flex items-baseline gap-2 whitespace-pre rounded px-1.5 py-0.5"
    >
      <span className="shrink-0 text-text-dim">[{clock(line.at)}]</span>
      <span className={`shrink-0 font-semibold ${meta.tone}`}>{meta.pad}</span>
      <span className="shrink-0 text-text">{shortMbx(line.mailbox)}</span>
      <span className="shrink-0 text-text-dim">{'->'}</span>
      <span className="shrink-0 text-accent">{line.peer}</span>
      <span className="truncate text-text-dim">"{line.subject}"</span>
    </motion.li>
  );
}

export default ProPlusAct1Terminal;
