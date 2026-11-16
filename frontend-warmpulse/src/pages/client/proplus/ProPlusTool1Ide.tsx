import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Circle,
  Eye,
  FileEdit,
  FlaskConical,
  Inbox,
  Mail,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  SquareTerminal,
  Target,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

/**
 * ProPlusTool1Ide — "Tool IDE / devtools" (Pro Plus tier).
 *
 * A functional 3-pane developer-tools IDE for the WarmPulse warmup toolset.
 * Deliberately NOT a card workbench (ProTools / ProPlusTools), NOT a lab /
 * experiment bench, NOT a command palette, NOT a guided wizard. It is laid
 * out like an IDE: an explorer rail on the LEFT, the active tool's working
 * surface in the CENTER, and a streaming run console/inspector on the RIGHT.
 *
 *   LEFT   — tool explorer rail. 4 selectable tools, active highlighted,
 *            mono "open file" affordances + a status footer.
 *   CENTER — the active tool's workspace (inputs + one big primary action).
 *            Flagship = Placement Tester (30 seed inboxes): a mailbox picker
 *            and "Run placement test" that genuinely replays an
 *            idle → running → done animation via real React state
 *            (progress bar + a 30-seed grid revealing seed-by-seed), then
 *            shows the per-provider Gmail/Outlook/Yahoo Inbox/Promotions/Spam
 *            breakdown + the 30-seed heatmap.
 *   RIGHT  — a devtools console with two tabs (Output | History). Output
 *            streams the run log line-by-line; History stacks prior runs.
 *
 * Selecting another tool swaps CENTER + RIGHT under AnimatePresence
 * (Spam Scanner: paste → score gauge; Template Designer: live preview;
 * Warmup Preview: sample messages).
 *
 * Fully standalone for the isolated preview harness: NO network / router /
 * query hooks, NO required props, inline MOCK. Renders ONLY page content
 * with explicit heights so the 3-pane layout is stable in the harness.
 *
 * Colour: existing Tailwind tokens only. inbox → accent, promotions →
 * accent4, spam → accent3.
 */

// ---------------------------------------------------------------------------
// Token-mirrored literals (for inline SVG / style props that can't take a
// Tailwind class). Mirrors tailwind.config.ts exactly — no new colours.
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // inbox / healthy
  accent2: 'rgb(255, 138, 75)', // info
  accent3: 'rgb(255, 107, 74)', // spam / danger
  accent4: 'rgb(255, 213, 79)', // promotions / mid
  surface2: '#1a1a26',
  borderMuted: '#2a2a3a',
  textDim: '#8888a0',
} as const;

type Bucket = 'inbox' | 'promotions' | 'spam';

const BUCKET_META: Record<
  Bucket,
  { label: string; short: string; color: string; textClass: string }
> = {
  inbox: { label: 'Inbox', short: 'I', color: C.accent, textClass: 'text-accent' },
  promotions: {
    label: 'Promotions',
    short: 'P',
    color: C.accent4,
    textClass: 'text-accent4',
  },
  spam: { label: 'Spam', short: 'S', color: C.accent3, textClass: 'text-accent3' },
};

const BUCKET_ORDER: Bucket[] = ['inbox', 'promotions', 'spam'];

type Provider = 'gmail' | 'outlook' | 'yahoo';

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type ToolId = 'placement' | 'spam' | 'template' | 'preview';

interface ToolDef {
  id: ToolId;
  name: string;
  file: string;
  blurb: string;
  Icon: LucideIcon;
  flagship?: boolean;
}

interface Mailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
}

interface ProviderBreakdown {
  inbox: number;
  promotions: number;
  spam: number;
}

interface Seed {
  id: string;
  provider: Provider;
  bucket: Bucket;
}

interface PlacementRun {
  total: number;
  byProvider: Record<Provider, ProviderBreakdown>;
  seeds: Seed[];
}

interface HistoryRow {
  id: string;
  tool: string;
  target: string;
  when: string;
  result: string;
  ok: boolean;
}

interface ScannerSample {
  subject: string;
  body: string;
  score: number;
  verdict: string;
  flagged: Array<{ term: string; weight: number; reason: string }>;
}

interface PreviewSample {
  from: string;
  subject: string;
  tag: 'reply' | 'open' | 'star';
}

interface IdeData {
  tools: ToolDef[];
  mailboxes: Mailbox[];
  run: PlacementRun;
  history: HistoryRow[];
  scanner: ScannerSample;
  previews: PreviewSample[];
}

/**
 * Build the completed 30-seed run: ~26 inbox / 3 promotions / 1 spam,
 * spread across Gmail (12) / Outlook (10) / Yahoo (8).
 */
function buildRun(): PlacementRun {
  const layout: Array<{ provider: Provider; buckets: Bucket[] }> = [
    {
      provider: 'gmail',
      buckets: [...Array<Bucket>(11).fill('inbox'), 'promotions'],
    },
    {
      provider: 'outlook',
      buckets: [...Array<Bucket>(9).fill('inbox'), 'spam'],
    },
    {
      provider: 'yahoo',
      buckets: [...Array<Bucket>(6).fill('inbox'), 'promotions', 'promotions'],
    },
  ];

  const seeds: Seed[] = [];
  const byProvider: Record<Provider, ProviderBreakdown> = {
    gmail: { inbox: 0, promotions: 0, spam: 0 },
    outlook: { inbox: 0, promotions: 0, spam: 0 },
    yahoo: { inbox: 0, promotions: 0, spam: 0 },
  };
  let n = 0;
  for (const grp of layout) {
    for (const b of grp.buckets) {
      seeds.push({ id: `seed-${n++}`, provider: grp.provider, bucket: b });
      byProvider[grp.provider][b] += 1;
    }
  }
  return { total: seeds.length, byProvider, seeds };
}

const MOCK: IdeData = {
  tools: [
    {
      id: 'placement',
      name: 'Inbox Tester',
      file: 'placement-tester.run',
      blurb: '30 seed inboxes · Gmail / Outlook / Yahoo',
      Icon: Target,
      flagship: true,
    },
    {
      id: 'spam',
      name: 'Spam Scanner',
      file: 'spam-scanner.eval',
      blurb: 'SpamAssassin-style content scoring',
      Icon: ScanLine,
    },
    {
      id: 'template',
      name: 'Template Designer',
      file: 'template-designer.draft',
      blurb: 'Author & preview warmup messages',
      Icon: FileEdit,
    },
    {
      id: 'preview',
      name: 'Warmup Preview',
      file: 'warmup-preview.sample',
      blurb: 'Sample messages — nothing is sent',
      Icon: Eye,
    },
  ],
  mailboxes: [
    { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail' },
    { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook' },
    { id: 'mb-3', email: 'success@acme.io', provider: 'gmail' },
    { id: 'mb-4', email: 'hello@acme.co', provider: 'smtp' },
    { id: 'mb-5', email: 'growth@acme.io', provider: 'outlook' },
    { id: 'mb-6', email: 'ar@acme.io', provider: 'yahoo' },
    { id: 'mb-7', email: 'partners@acme.co', provider: 'gmail' },
    { id: 'mb-8', email: 'support@acme.io', provider: 'smtp' },
    { id: 'mb-9', email: 'ceo@acme.io', provider: 'gmail' },
    { id: 'mb-10', email: 'demos@acme.co', provider: 'outlook' },
    { id: 'mb-11', email: 'billing@acme.io', provider: 'yahoo' },
    { id: 'mb-12', email: 'team@acme.co', provider: 'gmail' },
    { id: 'mb-13', email: 'hi@acme.io', provider: 'smtp' },
    { id: 'mb-14', email: 'press@acme.co', provider: 'outlook' },
    { id: 'mb-15', email: 'careers@acme.io', provider: 'gmail' },
  ],
  run: buildRun(),
  history: [
    {
      id: 'h-1',
      tool: 'Inbox Tester',
      target: 'founder@acme.io',
      when: 'May 17, 14:08',
      result: '26 inbox · 3 promo · 1 spam',
      ok: true,
    },
    {
      id: 'h-2',
      tool: 'Inbox Tester',
      target: 'sales@acme.io',
      when: 'May 14, 09:22',
      result: '25 inbox · 3 promo · 2 spam',
      ok: true,
    },
    {
      id: 'h-3',
      tool: 'Spam Scanner',
      target: 'Q3 roadmap draft',
      when: 'May 12, 16:40',
      result: 'score 2.4 / 10',
      ok: true,
    },
  ],
  scanner: {
    subject: 'Quick sync re: Q3 roadmap',
    body: "Hi {{first_name}}, wanted to circle back on the roadmap doc — the timeline looks solid. Got 15 minutes this week to walk through it? It's a FREE call, act now!!!",
    score: 2.4,
    verdict: 'Likely to land in Inbox',
    flagged: [
      { term: 'FREE', weight: 1.1, reason: 'All-caps promotional trigger' },
      { term: '!!!', weight: 0.6, reason: 'Excessive punctuation' },
      { term: 'act now', weight: 0.7, reason: 'Urgency phrase' },
    ],
  },
  previews: [
    { from: 'priya@seed-net.io', subject: 'Re: intro call follow-up', tag: 'reply' },
    { from: 'dan@seed-net.io', subject: 'Thoughts on the proposal', tag: 'open' },
    { from: 'lee@seed-net.io', subject: 'Quick question on pricing', tag: 'star' },
    { from: 'mara@seed-net.io', subject: 'Re: scheduling next week', tag: 'reply' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumBreakdown(b: ProviderBreakdown): number {
  return b.inbox + b.promotions + b.spam;
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function providerDot(p: Mailbox['provider']): string {
  return p === 'gmail'
    ? C.accent3
    : p === 'outlook'
      ? C.accent2
      : p === 'yahoo'
        ? C.accent4
        : C.textDim;
}

type RunPhase = 'idle' | 'running' | 'done';

interface ConsoleLine {
  id: number;
  kind: 'info' | 'ok' | 'warn' | 'cmd';
  text: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusTool1Ide(): JSX.Element {
  const d = MOCK;

  const [activeTool, setActiveTool] = useState<ToolId>('placement');
  const [selectedMb, setSelectedMb] = useState<string>(d.mailboxes[0]?.id ?? '');
  const [phase, setPhase] = useState<RunPhase>('done');
  const [resolved, setResolved] = useState<number>(d.run.total);
  const [rightTab, setRightTab] = useState<'output' | 'history'>('output');
  const [lines, setLines] = useState<ConsoleLine[]>([
    { id: 0, kind: 'cmd', text: '$ placement-tester run --mailbox founder@acme.io' },
    { id: 1, kind: 'info', text: 'dispatching probes to 30 seed inboxes…' },
    { id: 2, kind: 'ok', text: '30/30 landings reported · 26 inbox · 3 promo · 1 spam' },
    { id: 3, kind: 'ok', text: 'run complete · exit 0' },
  ]);
  const [history, setHistory] = useState<HistoryRow[]>(d.history);

  const timers = useRef<number[]>([]);
  const lineSeq = useRef<number>(100);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const pushLine = useCallback((kind: ConsoleLine['kind'], text: string) => {
    setLines((prev) => [...prev, { id: lineSeq.current++, kind, text }]);
  }, []);

  const activeMailbox = useMemo(
    () => d.mailboxes.find((m) => m.id === selectedMb) ?? d.mailboxes[0]!,
    [d.mailboxes, selectedMb],
  );

  // Genuine idle → running → done replay driven by real state + timers.
  const startRun = useCallback(() => {
    clearTimers();
    setRightTab('output');
    setPhase('running');
    setResolved(0);
    setLines([
      {
        id: lineSeq.current++,
        kind: 'cmd',
        text: `$ placement-tester run --mailbox ${activeMailbox.email}`,
      },
      { id: lineSeq.current++, kind: 'info', text: 'warming 30 seed inboxes…' },
    ]);

    const total = d.run.total;
    const step = Math.max(1, Math.round(total / 12));
    let count = 0;

    const tick = () => {
      count = Math.min(total, count + step);
      setResolved(count);
      pushLine('info', `landing ${count}/${total} reported`);
      if (count >= total) {
        const t2 = window.setTimeout(() => {
          setPhase('done');
          pushLine('ok', '30/30 landings reported · 26 inbox · 3 promo · 1 spam');
          pushLine('ok', 'run complete · exit 0');
          setHistory((prev) => [
            {
              id: `h-live-${Date.now()}`,
              tool: 'Inbox Tester',
              target: activeMailbox.email,
              when: 'just now',
              result: '26 inbox · 3 promo · 1 spam',
              ok: true,
            },
            ...prev,
          ]);
        }, 360);
        timers.current.push(t2);
        return;
      }
      const t = window.setTimeout(tick, 260);
      timers.current.push(t);
    };
    const t0 = window.setTimeout(tick, 420);
    timers.current.push(t0);
  }, [activeMailbox.email, clearTimers, d.run.total, pushLine]);

  const resetRun = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setResolved(0);
    setLines([
      { id: lineSeq.current++, kind: 'info', text: 'console cleared · awaiting run' },
    ]);
  }, [clearTimers]);

  const overall = useMemo(() => {
    const acc: ProviderBreakdown = { inbox: 0, promotions: 0, spam: 0 };
    for (const p of Object.keys(d.run.byProvider) as Provider[]) {
      acc.inbox += d.run.byProvider[p].inbox;
      acc.promotions += d.run.byProvider[p].promotions;
      acc.spam += d.run.byProvider[p].spam;
    }
    return acc;
  }, [d.run.byProvider]);

  const progressPct = Math.round((resolved / d.run.total) * 100);
  const tool = d.tools.find((t) => t.id === activeTool) ?? d.tools[0]!;

  return (
    <div className="flex h-[760px] flex-col overflow-hidden rounded-xl border border-border-muted bg-bg font-sans">
      {/* IDE title bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex items-center justify-between border-b border-border-muted bg-surface px-4 py-2.5"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/10 text-accent">
            <SquareTerminal className="h-4 w-4" />
          </span>
          <span className="font-mono text-[13px] font-semibold text-text">
            warmpulse <span className="text-text-dim">/</span> tools.ide
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-accent3">
            <Sparkles className="h-3 w-3" />
            Pro Plus
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-text-dim">
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            seed-net: 30 online
          </span>
          <span className="hidden text-border-muted sm:inline">|</span>
          <span>{d.mailboxes.length} mailboxes</span>
        </div>
      </motion.div>

      {/* 3-pane body */}
      {/* The 248px + 340px fixed side rails can't fit beside the editor in
          ~320px; on phones the IDE scrolls horizontally inside this wrapper at
          a usable min-width instead of overflowing the page. ≥lg is unchanged. */}
      <div className="min-h-0 flex-1 overflow-x-auto lg:overflow-visible">
      <div className="flex h-full min-w-[60rem] lg:min-w-0">
        {/* LEFT — tool explorer rail */}
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.05 }}
          className="flex w-[248px] shrink-0 flex-col border-r border-border-muted bg-surface"
        >
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-dim">
              Explorer
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {d.tools.length} tools
            </span>
          </div>
          <div className="flex-1 space-y-0.5 px-2">
            {d.tools.map((t) => {
              const active = t.id === activeTool;
              const TIcon = t.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTool(t.id)}
                  aria-pressed={active}
                  className={`group flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-transparent hover:border-border-muted hover:bg-surface-2'
                  }`}
                >
                  <ChevronRight
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform ${
                      active ? 'rotate-90 text-accent' : 'text-text-dim'
                    }`}
                  />
                  <TIcon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      active ? 'text-accent' : 'text-text-dim'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`truncate text-[13px] font-medium ${
                          active ? 'text-text' : 'text-text-dim group-hover:text-text'
                        }`}
                      >
                        {t.name}
                      </span>
                      {t.flagship ? (
                        <span className="shrink-0 rounded-sm bg-accent3/15 px-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-accent3">
                          flag
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-text-dim">
                      {t.file}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-border-muted px-3 py-2.5">
            <div className="flex items-center gap-2 font-mono text-[10px] text-text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="truncate">
                {phase === 'running'
                  ? 'placement-tester · running'
                  : `${tool.file} · ready`}
              </span>
            </div>
          </div>
        </motion.aside>

        {/* CENTER — active tool workspace */}
        <motion.main
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
          className="flex min-w-0 flex-1 flex-col bg-bg"
        >
          {/* Editor tab strip */}
          <div className="flex items-center gap-1 border-b border-border-muted bg-surface px-3">
            <div className="flex items-center gap-2 border-b-2 border-accent px-3 py-2.5">
              <tool.Icon className="h-3.5 w-3.5 text-accent" />
              <span className="font-mono text-[12px] text-text">{tool.file}</span>
            </div>
            <span className="px-2 font-mono text-[11px] text-text-dim">
              {tool.blurb}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <AnimatePresence mode="wait">
              {activeTool === 'placement' ? (
                <motion.div
                  key="ws-placement"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="space-y-5"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent4/10 text-accent4">
                      <Target className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-text">
                        Inbox Tester
                      </h2>
                      <p className="text-sm text-text-dim">
                        Probe{' '}
                        <span className="font-semibold text-accent4">
                          30 real seed inboxes
                        </span>{' '}
                        across Gmail / Outlook / Yahoo and see exactly where you
                        land.
                      </p>
                    </div>
                  </div>

                  {/* Inputs row */}
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div className="space-y-1.5">
                      <label className="font-mono text-[11px] uppercase tracking-wide text-text-dim">
                        Mailbox under test
                      </label>
                      <div className="grid max-h-[132px] grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-border-muted bg-surface p-1.5 sm:grid-cols-2">
                        {d.mailboxes.map((m) => {
                          const active = m.id === selectedMb;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedMb(m.id)}
                              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                                active
                                  ? 'border-accent/40 bg-accent/10 text-text'
                                  : 'border-transparent text-text-dim hover:bg-surface-2 hover:text-text'
                              }`}
                            >
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ background: providerDot(m.provider) }}
                              />
                              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                                {m.email}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col justify-end gap-2">
                      <button
                        type="button"
                        onClick={startRun}
                        disabled={phase === 'running'}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {phase === 'running' ? (
                          <>
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: 'linear',
                              }}
                              className="inline-flex"
                            >
                              <Circle className="h-4 w-4" />
                            </motion.span>
                            Sending probes…
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Run inbox test
                          </>
                        )}
                      </button>
                      {phase !== 'idle' ? (
                        <button
                          type="button"
                          onClick={resetRun}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-4 text-xs text-text-dim transition-colors hover:text-text"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Reset
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Run surface */}
                  <div className="rounded-lg border border-border-muted bg-surface p-4">
                    <AnimatePresence mode="wait">
                      {phase === 'idle' ? (
                        <motion.div
                          key="idle"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex h-[300px] flex-col items-center justify-center gap-3 text-center"
                        >
                          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent4/10 text-accent4">
                            <Target className="h-7 w-7" />
                          </span>
                          <p className="max-w-sm text-sm text-text-dim">
                            Pick a mailbox and run an inbox test. Results
                            break down Inbox / Promotions / Spam per provider
                            with a live 30-seed heatmap.
                          </p>
                        </motion.div>
                      ) : phase === 'running' ? (
                        <motion.div
                          key="running"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="space-y-4"
                        >
                          <div className="flex items-center justify-between font-mono text-[13px]">
                            <span className="text-text">
                              Waiting for landings…
                            </span>
                            <span className="tabular-nums text-text-dim">
                              {resolved} / {d.run.total} reported
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                            <motion.div
                              className="h-full rounded-full bg-accent"
                              initial={{ width: 0 }}
                              animate={{ width: `${progressPct}%` }}
                              transition={{ duration: 0.3, ease: 'easeOut' }}
                            />
                          </div>
                          <SeedGrid
                            seeds={d.run.seeds}
                            revealed={resolved}
                            animate
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="done"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="space-y-5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[13px] font-semibold text-accent">
                              inbox test complete · {d.run.total} seeds
                            </span>
                            <span className="text-xs font-semibold text-accent">
                              {pct(overall.inbox, d.run.total)}% inbox
                            </span>
                          </div>

                          <div>
                            <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-text-dim">
                              Where emails land
                            </div>
                            <StackedBar
                              breakdown={overall}
                              total={d.run.total}
                              height={20}
                            />
                            <div className="mt-3 flex flex-wrap gap-4">
                              {BUCKET_ORDER.map((b) => (
                                <div
                                  key={b}
                                  className="flex items-center gap-1.5 text-xs"
                                >
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{ background: BUCKET_META[b].color }}
                                  />
                                  <span className="text-text-dim">
                                    {BUCKET_META[b].label}
                                  </span>
                                  <span
                                    className={`font-semibold ${BUCKET_META[b].textClass}`}
                                  >
                                    {overall[b]} (
                                    {pct(overall[b], d.run.total)}%)
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-text-dim">
                              By provider
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              {(['gmail', 'outlook', 'yahoo'] as Provider[]).map(
                                (p) => (
                                  <ProviderCard
                                    key={p}
                                    provider={p}
                                    breakdown={d.run.byProvider[p]}
                                  />
                                ),
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="mb-2 font-mono text-[11px] uppercase tracking-wide text-text-dim">
                              30-seed heatmap
                            </div>
                            <SeedGrid
                              seeds={d.run.seeds}
                              revealed={d.run.total}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : activeTool === 'spam' ? (
                <motion.div
                  key="ws-spam"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  <SpamWorkspace sample={d.scanner} />
                </motion.div>
              ) : activeTool === 'template' ? (
                <motion.div
                  key="ws-template"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  <TemplateWorkspace />
                </motion.div>
              ) : (
                <motion.div
                  key="ws-preview"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  <PreviewWorkspace samples={d.previews} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.main>

        {/* RIGHT — run console / inspector */}
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 }}
          className="flex w-[340px] shrink-0 flex-col border-l border-border-muted bg-surface"
        >
          <div className="flex items-center border-b border-border-muted">
            {(['output', 'history'] as const).map((tab) => {
              const active = rightTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRightTab(tab)}
                  className={`relative flex items-center gap-1.5 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                    active ? 'text-text' : 'text-text-dim hover:text-text'
                  }`}
                >
                  {tab === 'output' ? (
                    <Terminal className="h-3.5 w-3.5" />
                  ) : (
                    <FlaskConical className="h-3.5 w-3.5" />
                  )}
                  {tab}
                  {active ? (
                    <motion.span
                      layoutId="right-tab-underline"
                      className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {rightTab === 'output' ? (
                <motion.div
                  key="tab-output"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1 p-3 font-mono text-[11px] leading-relaxed"
                >
                  {lines.map((l) => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-2"
                    >
                      <span className="select-none text-border-muted">
                        {String(l.id % 1000).padStart(3, '0')}
                      </span>
                      <span
                        className={
                          l.kind === 'ok'
                            ? 'text-accent'
                            : l.kind === 'warn'
                              ? 'text-accent3'
                              : l.kind === 'cmd'
                                ? 'text-accent2'
                                : 'text-text-dim'
                        }
                      >
                        {l.text}
                      </span>
                    </motion.div>
                  ))}
                  {phase === 'running' ? (
                    <motion.span
                      animate={{ opacity: [1, 0.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="ml-7 inline-block h-3 w-2 bg-accent align-middle"
                    />
                  ) : null}
                </motion.div>
              ) : (
                <motion.div
                  key="tab-history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2 p-3"
                >
                  {history.map((h, i) => (
                    <motion.div
                      key={h.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.24, delay: i * 0.05 }}
                      className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-semibold text-text">
                          {h.tool}
                        </span>
                        <span
                          className={`font-mono text-[10px] ${
                            h.ok ? 'text-accent' : 'text-accent3'
                          }`}
                        >
                          {h.ok ? 'exit 0' : 'exit 1'}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-text-dim">
                        {h.target}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[11px] text-text">
                          {h.result}
                        </span>
                        <span className="font-mono text-[10px] text-text-dim">
                          {h.when}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-border-muted px-3 py-2 font-mono text-[10px] text-text-dim">
            {rightTab === 'output'
              ? `${lines.length} lines · ${phase}`
              : `${history.length} runs logged`}
          </div>
        </motion.aside>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function StackedBar({
  breakdown,
  total,
  height,
}: {
  breakdown: ProviderBreakdown;
  total: number;
  height: number;
}) {
  return (
    <div
      className="flex w-full overflow-hidden rounded-full border border-border-muted bg-surface-2"
      style={{ height }}
      role="img"
      aria-label="Where emails land distribution"
    >
      {BUCKET_ORDER.map((b) =>
        breakdown[b] > 0 ? (
          <motion.div
            key={b}
            initial={{ width: 0 }}
            animate={{ width: `${pct(breakdown[b], total)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ backgroundColor: BUCKET_META[b].color }}
            title={`${BUCKET_META[b].label}: ${breakdown[b]} (${pct(breakdown[b], total)}%)`}
          />
        ) : null,
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  breakdown,
}: {
  provider: Provider;
  breakdown: ProviderBreakdown;
}) {
  const total = sumBreakdown(breakdown);
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-text">
          {PROVIDER_LABEL[provider]}
        </h4>
        <span className="font-mono text-[10px] text-text-dim">
          {total} seeds
        </span>
      </div>
      <StackedBar breakdown={breakdown} total={Math.max(total, 1)} height={10} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {BUCKET_ORDER.map((b) =>
          breakdown[b] > 0 ? (
            <span key={b} className={BUCKET_META[b].textClass}>
              {BUCKET_META[b].label} {pct(breakdown[b], Math.max(total, 1))}%
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function SeedGrid({
  seeds,
  revealed,
  animate,
}: {
  seeds: Seed[];
  revealed: number;
  animate?: boolean;
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }}
    >
      {seeds.map((s, i) => {
        const shown = i < revealed;
        const meta = BUCKET_META[s.bucket];
        return (
          <motion.span
            key={s.id}
            initial={animate ? { scale: 0.6, opacity: 0 } : false}
            animate={
              shown
                ? { scale: 1, opacity: 1 }
                : { scale: 0.85, opacity: 0.3 }
            }
            transition={{ duration: 0.25, delay: animate ? i * 0.018 : 0 }}
            className="flex aspect-square items-center justify-center rounded-md border text-[10px] font-bold"
            style={{
              borderColor: shown ? meta.color : C.borderMuted,
              background: shown ? `${meta.color}24` : C.surface2,
              color: shown ? meta.color : C.textDim,
            }}
            title={`${PROVIDER_LABEL[s.provider]} · ${
              shown ? meta.label : 'pending'
            }`}
          >
            {shown ? meta.short : '·'}
          </motion.span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Other tool workspaces (swapped into CENTER)
// ---------------------------------------------------------------------------

function SpamWorkspace({ sample }: { sample: ScannerSample }) {
  const tone =
    sample.score < 3 ? C.accent : sample.score < 6 ? C.accent4 : C.accent3;
  const toneClass =
    sample.score < 3
      ? 'text-accent'
      : sample.score < 6
        ? 'text-accent4'
        : 'text-accent3';
  const fillPct = Math.min(100, (sample.score / 10) * 100);
  const circ = 2 * Math.PI * 32;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent3/10 text-accent3">
          <ScanLine className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-text">Spam Scanner</h2>
          <p className="text-sm text-text-dim">
            Paste a subject and body — SpamAssassin-style scoring with trigger
            explanations.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border-muted bg-surface">
        <div className="border-b border-border-muted px-3 py-2 font-mono text-[12px] text-text">
          {sample.subject}
        </div>
        <p className="p-3 text-[13px] leading-relaxed text-text-dim">
          {sample.body}
        </p>
      </div>

      <div className="flex items-center gap-5 rounded-lg border border-border-muted bg-surface p-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke={C.borderMuted}
              strokeWidth="7"
            />
            <motion.circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke={tone}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: circ * (1 - fillPct / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`text-xl font-semibold tabular-nums ${toneClass}`}
            >
              {sample.score}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-text-dim">
              / 10
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <p className={`text-base font-semibold ${toneClass}`}>
            {sample.verdict}
          </p>
          <p className="mt-1 text-xs text-text-dim">
            Lower is better. Below 5 generally lands in the inbox.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="font-mono text-[11px] uppercase tracking-wide text-text-dim">
          Flagged terms
        </div>
        {sample.flagged.map((f, i) => (
          <motion.div
            key={f.term}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: 0.1 + i * 0.05 }}
            className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs"
          >
            <div className="min-w-0">
              <span className="font-mono font-semibold text-text">
                {f.term}
              </span>
              <span className="ml-2 text-text-dim">{f.reason}</span>
            </div>
            <span className="shrink-0 font-mono font-semibold text-accent3">
              +{f.weight}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TemplateWorkspace() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <FileEdit className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-text">
            Template Designer
          </h2>
          <p className="text-sm text-text-dim">
            Author warmup messages and preview them exactly as a recipient
            sees them.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border-muted bg-surface">
          <div className="flex items-center gap-2 border-b border-border-muted px-3 py-2 font-mono text-[11px] text-text-dim">
            <FileEdit className="h-3 w-3" />
            source
          </div>
          <pre className="overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-text-dim">
            {`Subject: Quick sync re: Q3 roadmap

Hi {{first_name}},

Wanted to circle back on the roadmap
doc — the timeline looks solid. Got
15 minutes this week to walk through
it?

Thanks,
{{sender_name}}`}
          </pre>
        </div>

        <div className="rounded-lg border border-border-muted bg-surface">
          <div className="flex items-center gap-2 border-b border-border-muted px-3 py-2 font-mono text-[11px] text-text-dim">
            <Eye className="h-3 w-3" />
            preview
          </div>
          <div className="space-y-2 p-3 text-[13px] leading-relaxed">
            <div className="flex items-center gap-2 text-text-dim">
              <Mail className="h-3.5 w-3.5" />
              Quick sync re: Q3 roadmap
            </div>
            <p className="text-text">Hi Dana,</p>
            <p className="text-text-dim">
              Wanted to circle back on the roadmap doc — the timeline looks
              solid. Got 15 minutes this week to walk through it?
            </p>
            <p className="text-text-dim">Thanks,</p>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="block h-3 w-24 rounded bg-border-muted"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {['Plain', 'HTML', 'AI variants'].map((t, i) => (
          <span
            key={t}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] ${
              i === 0
                ? 'border-accent/30 bg-accent/10 text-accent'
                : 'border-border-muted bg-surface-2 text-text-dim'
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function PreviewWorkspace({ samples }: { samples: PreviewSample[] }) {
  const TAG_TONE: Record<PreviewSample['tag'], string> = {
    reply: 'text-accent',
    open: 'text-accent2',
    star: 'text-accent4',
  };
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent2/10 text-accent2">
          <Eye className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-text">Warmup Preview</h2>
          <p className="text-sm text-text-dim">
            Sample messages the engine would send. Nothing leaves your
            mailbox.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {samples.map((s, i) => (
          <motion.div
            key={s.from}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.06 }}
            className="rounded-lg border border-border-muted bg-surface px-3 py-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="truncate font-mono text-[12px] text-text-dim">
                {s.from}
              </span>
              <span
                className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${TAG_TONE[s.tag]}`}
              >
                {s.tag}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[14px] font-medium text-text">
              {s.subject}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 font-mono text-[11px] text-text-dim">
        <Inbox className="h-3.5 w-3.5 text-accent2" />
        generated by the live content factory
      </div>
    </div>
  );
}

export default ProPlusTool1Ide;
