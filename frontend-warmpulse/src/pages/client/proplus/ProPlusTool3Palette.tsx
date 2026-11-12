import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Eye,
  FileEdit,
  History,
  Pin,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * ProPlusTool3Palette — "Command Palette Launcher" (Pro Plus tier).
 *
 * A launcher-driven tools page in the Raycast / Cmd-K / Spotlight idiom.
 * Deliberately NOT a 3-pane IDE (ProPlusTool1Ide), NOT a lab/experiment
 * bench (ProPlusTool2Lab), NOT a centerpiece-card workbench (ProPlusTools /
 * ProTools), NOT a selector-strip + side launcher (ProTools), NOT a
 * comparison table (StarterTools), NOT a guided wizard / playbook (sibling
 * agents own those). The whole page is a command bar:
 *
 *   TOP    — an always-visible command palette: a big search input plus a
 *            live, genuinely fuzzy-filtered command list (run placement test,
 *            scan for spam, design a template, preview warmup, plus quick
 *            actions like "re-run last placement test" / "open last report").
 *            Arrow keys move a selected-row highlight that physically slides
 *            (layoutId), Enter runs the highlighted command, kbd hints shown.
 *   MIDDLE — a "Pinned" quick-tools row (chips) + a "Recent runs" gallery of
 *            past-run cards (status + timestamp); clicking a card reopens it.
 *   BOTTOM — a result surface that expands inline under AnimatePresence when a
 *            command is launched. The flagship is the Placement Tester
 *            (30 seed inboxes): pick a mailbox -> Run -> a real
 *            idle -> running -> done replay (progress bar + a 30-seed grid
 *            revealing seed-by-seed) -> per-provider Gmail/Outlook/Yahoo
 *            Inbox/Promotions/Spam breakdown + 30-seed heatmap. The finished
 *            run is prepended to "Recent runs".
 *
 * Fully standalone for the isolated preview harness: NO network / router /
 * query hooks, NO required props, inline MOCK. Renders ONLY page content with
 * explicit heights so the layout is stable in the harness.
 *
 * Colour: existing Tailwind tokens only. inbox -> accent, promotions ->
 * accent4, spam -> accent3.
 */

// ---------------------------------------------------------------------------
// Token-mirrored literals (for inline SVG / style props that cannot take a
// Tailwind class). Mirrors tailwind.config.ts exactly — no new colours.
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // inbox / healthy / primary
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

interface RecentRun {
  id: string;
  kind: 'placement' | 'spam' | 'template' | 'preview';
  title: string;
  mailbox: string;
  when: string;
  /** primary headline metric, e.g. "87% inbox" */
  metric: string;
  status: 'done' | 'warn' | 'fail';
}

interface ScannerSample {
  subject: string;
  score: number;
  verdict: string;
  flagged: Array<{ term: string; weight: number; reason: string }>;
}

/**
 * 15 Pro-Plus mailboxes (first one is the default placement target).
 */
const MOCK_MAILBOXES: Mailbox[] = [
  { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail' },
  { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook' },
  { id: 'mb-3', email: 'success@acme.io', provider: 'gmail' },
  { id: 'mb-4', email: 'hello@acme.co', provider: 'smtp' },
  { id: 'mb-5', email: 'demos@acme.io', provider: 'gmail' },
  { id: 'mb-6', email: 'partners@acme.io', provider: 'outlook' },
  { id: 'mb-7', email: 'growth@acme.co', provider: 'yahoo' },
  { id: 'mb-8', email: 'ops@acme.io', provider: 'smtp' },
  { id: 'mb-9', email: 'ceo@acme.io', provider: 'gmail' },
  { id: 'mb-10', email: 'billing@acme.co', provider: 'outlook' },
  { id: 'mb-11', email: 'support@acme.io', provider: 'gmail' },
  { id: 'mb-12', email: 'press@acme.co', provider: 'yahoo' },
  { id: 'mb-13', email: 'recruiting@acme.io', provider: 'outlook' },
  { id: 'mb-14', email: 'newsletter@acme.co', provider: 'smtp' },
  { id: 'mb-15', email: 'team@acme.io', provider: 'gmail' },
];

/**
 * Build the completed 30-seed run: 26 inbox / 3 promotions / 1 spam,
 * across Gmail (12) / Outlook (10) / Yahoo (8).
 *   Gmail   11 inbox / 1 promo / 0 spam
 *   Outlook  9 inbox / 0 promo / 1 spam
 *   Yahoo    6 inbox / 2 promo / 0 spam
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

const MOCK_RUN = buildRun();

const MOCK_RECENT: RecentRun[] = [
  {
    id: 'r-1',
    kind: 'placement',
    title: 'Inbox test',
    mailbox: 'founder@acme.io',
    when: 'Today, 14:08',
    metric: '87% inbox',
    status: 'done',
  },
  {
    id: 'r-2',
    kind: 'spam',
    title: 'Spam scan',
    mailbox: '“Quick sync re: Q3 roadmap”',
    when: 'Today, 11:24',
    metric: 'Score 2.4',
    status: 'done',
  },
  {
    id: 'r-3',
    kind: 'placement',
    title: 'Inbox test',
    mailbox: 'sales@acme.io',
    when: 'Yesterday, 16:40',
    metric: '74% inbox',
    status: 'warn',
  },
  {
    id: 'r-4',
    kind: 'preview',
    title: 'Warmup preview',
    mailbox: 'success@acme.io',
    when: 'Yesterday, 09:55',
    metric: '6 samples',
    status: 'done',
  },
  {
    id: 'r-5',
    kind: 'template',
    title: 'Template saved',
    mailbox: '“Re: intro call follow-up”',
    when: 'May 16, 18:02',
    metric: 'HTML + 3 variants',
    status: 'done',
  },
  {
    id: 'r-6',
    kind: 'placement',
    title: 'Inbox test',
    mailbox: 'demos@acme.io',
    when: 'May 15, 13:18',
    metric: '61% inbox',
    status: 'fail',
  },
];

const MOCK_SCAN: ScannerSample = {
  subject: 'Quick sync re: Q3 roadmap',
  score: 2.4,
  verdict: 'Likely to land in Inbox',
  flagged: [
    { term: 'FREE', weight: 1.1, reason: 'All-caps promotional trigger' },
    { term: '!!!', weight: 0.6, reason: 'Excessive punctuation' },
    { term: 'act now', weight: 0.7, reason: 'Urgency phrase' },
  ],
};

const MOCK_PREVIEW_SAMPLES: Array<{ from: string; subject: string; tag: string }> = [
  { from: 'priya@seed-net.io', subject: 'Re: intro call follow-up', tag: 'reply' },
  { from: 'dan@seed-net.io', subject: 'Thoughts on the proposal', tag: 'open' },
  { from: 'lee@seed-net.io', subject: 'Quick question on pricing', tag: 'star' },
  { from: 'mara@seed-net.io', subject: 'Re: timeline check-in', tag: 'reply' },
];

// ---------------------------------------------------------------------------
// Command model
// ---------------------------------------------------------------------------

type CommandKind = 'placement' | 'spam' | 'template' | 'preview' | 'quick';

interface Command {
  id: string;
  title: string;
  hint: string;
  /** group label shown in the palette */
  group: 'Tools' | 'Quick actions';
  kind: CommandKind;
  Icon: LucideIcon;
  /** which result surface to open */
  surface: 'placement' | 'spam' | 'template' | 'preview';
  /** extra search keywords for the fuzzy matcher */
  keywords: string;
  /** rendered as the kbd shortcut on the row */
  kbd: string;
}

const COMMANDS: Command[] = [
  {
    id: 'cmd-placement',
    title: 'Run inbox test',
    hint: '30 seed inboxes — Gmail / Outlook / Yahoo',
    group: 'Tools',
    kind: 'placement',
    Icon: Target,
    surface: 'placement',
    keywords: 'placement seed inbox spam deliverability probe inboxing',
    kbd: 'P',
  },
  {
    id: 'cmd-spam',
    title: 'Scan content for spam',
    hint: 'SpamAssassin-style content scoring',
    group: 'Tools',
    kind: 'spam',
    Icon: Wand2,
    surface: 'spam',
    keywords: 'spam scanner score triggers caps content subject body',
    kbd: 'S',
  },
  {
    id: 'cmd-template',
    title: 'Design a template',
    hint: 'Author & preview warmup messages',
    group: 'Tools',
    kind: 'template',
    Icon: FileEdit,
    surface: 'template',
    keywords: 'template designer author html plain variants compose message',
    kbd: 'T',
  },
  {
    id: 'cmd-preview',
    title: 'Preview warmup',
    hint: 'Sample thread messages — nothing is sent',
    group: 'Tools',
    kind: 'preview',
    Icon: Eye,
    surface: 'preview',
    keywords: 'preview warmup sample thread content factory dry run',
    kbd: 'W',
  },
  {
    id: 'cmd-rerun-placement',
    title: 'Re-run last inbox test',
    hint: 'founder@acme.io · 30 seeds',
    group: 'Quick actions',
    kind: 'quick',
    Icon: RotateCcw,
    surface: 'placement',
    keywords: 'rerun repeat again last placement founder retry',
    kbd: '⏎',
  },
  {
    id: 'cmd-open-report',
    title: 'Open last inbox-test report',
    hint: 'Today, 14:08 · 87% inbox',
    group: 'Quick actions',
    kind: 'quick',
    Icon: History,
    surface: 'placement',
    keywords: 'open last report results history recent placement view',
    kbd: '⏎',
  },
  {
    id: 'cmd-rescan',
    title: 'Re-scan last subject line',
    hint: '“Quick sync re: Q3 roadmap”',
    group: 'Quick actions',
    kind: 'quick',
    Icon: RotateCcw,
    surface: 'spam',
    keywords: 'rescan spam subject again last roadmap repeat',
    kbd: '⏎',
  },
  {
    id: 'cmd-preview-founder',
    title: 'Preview warmup for founder@acme.io',
    hint: 'Generate fresh sample thread',
    group: 'Quick actions',
    kind: 'quick',
    Icon: Eye,
    surface: 'preview',
    keywords: 'preview founder sample warmup quick generate',
    kbd: '⏎',
  },
  {
    id: 'cmd-pin-template',
    title: 'Open “Q3 roadmap” template',
    hint: 'HTML + 3 AI variants',
    group: 'Quick actions',
    kind: 'quick',
    Icon: FileEdit,
    surface: 'template',
    keywords: 'open template roadmap q3 saved html variants',
    kbd: '⏎',
  },
];

const PINNED_IDS = ['cmd-placement', 'cmd-spam', 'cmd-template', 'cmd-preview'];

// ---------------------------------------------------------------------------
// Fuzzy matcher — real subsequence scoring (case-insensitive). Returns null
// when the query is not a subsequence of the haystack; otherwise a score
// where lower is better (tighter / earlier matches rank higher).
// ---------------------------------------------------------------------------

function fuzzyScore(query: string, haystack: string): number | null {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const h = haystack.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevIdx = -1;
  let firstIdx = -1;
  for (let hi = 0; hi < h.length && qi < q.length; hi++) {
    if (h[hi] === q[qi]) {
      if (firstIdx === -1) firstIdx = hi;
      if (prevIdx !== -1) score += hi - prevIdx - 1; // gap penalty
      prevIdx = hi;
      qi += 1;
    }
  }
  if (qi < q.length) return null; // not all query chars matched in order
  return score + firstIdx; // earlier first hit ranks better
}

interface ScoredCommand {
  cmd: Command;
  score: number;
}

function filterCommands(query: string): ScoredCommand[] {
  const out: ScoredCommand[] = [];
  for (const cmd of COMMANDS) {
    const hay = `${cmd.title} ${cmd.hint} ${cmd.keywords}`;
    const s = fuzzyScore(query, hay);
    if (s !== null) out.push({ cmd, score: s });
  }
  // Stable-ish sort: better score first, then original declaration order.
  out.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return COMMANDS.indexOf(a.cmd) - COMMANDS.indexOf(b.cmd);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function sumBreakdown(b: ProviderBreakdown): number {
  return b.inbox + b.promotions + b.spam;
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

const STATUS_META: Record<
  RecentRun['status'],
  { dot: string; label: string; cls: string }
> = {
  done: { dot: C.accent, label: 'Done', cls: 'text-accent' },
  warn: { dot: C.accent4, label: 'Review', cls: 'text-accent4' },
  fail: { dot: C.accent3, label: 'Failed', cls: 'text-accent3' },
};

const KIND_ICON: Record<RecentRun['kind'], LucideIcon> = {
  placement: Target,
  spam: Wand2,
  template: FileEdit,
  preview: Eye,
};

type RunPhase = 'idle' | 'running' | 'done';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusTool3Palette(): JSX.Element {
  // --- palette state -------------------------------------------------------
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => filterCommands(deferredQuery), [deferredQuery]);

  // Keep the highlighted row valid as the filtered list shrinks/reorders.
  useEffect(() => {
    setSelectedIndex((i) => {
      if (results.length === 0) return 0;
      return Math.min(i, results.length - 1);
    });
  }, [results.length]);

  // --- result surface state ------------------------------------------------
  const [surface, setSurface] = useState<Command['surface'] | null>(null);
  const [activeCmdId, setActiveCmdId] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>(MOCK_RECENT);

  // --- placement run state -------------------------------------------------
  const [mailboxId, setMailboxId] = useState<string>(MOCK_MAILBOXES[0]!.id);
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [resolved, setResolved] = useState(0);
  const [openedFromRunId, setOpenedFromRunId] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const activeMailbox =
    MOCK_MAILBOXES.find((m) => m.id === mailboxId) ?? MOCK_MAILBOXES[0]!;

  const overall = useMemo(() => {
    const acc: ProviderBreakdown = { inbox: 0, promotions: 0, spam: 0 };
    for (const p of Object.keys(MOCK_RUN.byProvider) as Provider[]) {
      acc.inbox += MOCK_RUN.byProvider[p].inbox;
      acc.promotions += MOCK_RUN.byProvider[p].promotions;
      acc.spam += MOCK_RUN.byProvider[p].spam;
    }
    return acc;
  }, []);

  const progressPct = Math.round((resolved / MOCK_RUN.total) * 100);

  // --- launching a command -------------------------------------------------
  const openSurface = useCallback(
    (cmd: Command) => {
      setSurface(cmd.surface);
      setActiveCmdId(cmd.id);
      setOpenedFromRunId(null);
      if (cmd.surface === 'placement') {
        clearTimers();
        // "open last report" / "open report" quick actions land on the
        // finished result directly; everything else starts idle.
        if (cmd.id === 'cmd-open-report') {
          setPhase('done');
          setResolved(MOCK_RUN.total);
        } else if (cmd.id === 'cmd-rerun-placement') {
          // genuine replay
          startPlacement();
        } else {
          setPhase('idle');
          setResolved(0);
        }
      }
    },
    // startPlacement is stable enough for this preview harness
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearTimers],
  );

  const runSelected = useCallback(() => {
    const hit = results[selectedIndex]?.cmd;
    if (hit) openSurface(hit);
  }, [results, selectedIndex, openSurface]);

  const closeSurface = useCallback(() => {
    clearTimers();
    setSurface(null);
    setActiveCmdId(null);
    setPhase('idle');
    setResolved(0);
    setOpenedFromRunId(null);
  }, [clearTimers]);

  // --- placement replay (real idle -> running -> done) ---------------------
  function startPlacement() {
    clearTimers();
    setPhase('running');
    setResolved(0);
    let count = 0;
    const step = Math.max(1, Math.round(MOCK_RUN.total / 12));
    const tick = () => {
      count += step;
      if (count >= MOCK_RUN.total) {
        setResolved(MOCK_RUN.total);
        setPhase('done');
        // prepend a fresh recent-run card
        const inboxPct = pct(overall.inbox, MOCK_RUN.total);
        setRecent((prev) => [
          {
            id: `r-live-${Date.now()}`,
            kind: 'placement',
            title: 'Inbox test',
            mailbox: activeMailbox.email,
            when: 'Just now',
            metric: `${inboxPct}% inbox`,
            status: inboxPct >= 80 ? 'done' : inboxPct >= 50 ? 'warn' : 'fail',
          },
          ...prev,
        ]);
        return;
      }
      setResolved(count);
      const t = window.setTimeout(tick, 240);
      timers.current.push(t);
    };
    const t0 = window.setTimeout(tick, 340);
    timers.current.push(t0);
  }

  const resetPlacement = () => {
    clearTimers();
    setPhase('idle');
    setResolved(0);
  };

  // Click a recent-run card -> reopen its surface.
  const reopenRecent = (r: RecentRun) => {
    setSurface(r.kind);
    setActiveCmdId(null);
    setOpenedFromRunId(r.id);
    if (r.kind === 'placement') {
      clearTimers();
      setPhase('done');
      setResolved(MOCK_RUN.total);
    }
  };

  // --- palette keyboard handling ------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) =>
        results.length ? (i - 1 + results.length) % results.length : 0,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runSelected();
    } else if (e.key === 'Escape') {
      if (surface) {
        e.preventDefault();
        closeSurface();
      } else if (query) {
        e.preventDefault();
        setQuery('');
      }
    }
  };

  // Keep the highlighted row scrolled into view inside the list.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-row-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, results]);

  const pinned = PINNED_IDS.map(
    (id) => COMMANDS.find((c) => c.id === id)!,
  ).filter(Boolean);

  // Group the filtered results for section headers while keeping a single
  // flat index space (so arrow keys traverse everything).
  const grouped = useMemo(() => {
    const groups: Array<{ label: Command['group']; items: ScoredCommand[] }> =
      [];
    for (const sc of results) {
      let g = groups.find((x) => x.label === sc.cmd.group);
      if (!g) {
        g = { label: sc.cmd.group, items: [] };
        groups.push(g);
      }
      g.items.push(sc);
    }
    return groups;
  }, [results]);

  return (
    <div className="flex flex-col gap-5 text-text">
      {/* ---- Header ---- */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Command Launcher
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent3">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </span>
          </div>
          <p className="text-sm text-text-dim">
            Every inbox-delivery tool, one keystroke away. Type to filter, use
            arrow keys, press Enter to run.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-xs text-text-dim">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">Seed network</span>
          <span className="text-border-muted">·</span>
          <span>30 inboxes online</span>
        </div>
      </motion.header>

      {/* ---- Command palette ---- */}
      <motion.section
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface shadow-2xl"
      >
        {/* search input */}
        <div className="flex items-center gap-3 border-b border-border-muted px-4 py-3.5">
          <Search className="h-5 w-5 shrink-0 text-text-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search tools and quick actions…"
            aria-label="Command search"
            className="min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-dim focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden rounded-md border border-border-muted bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-dim sm:inline-block">
              Ctrl K
            </kbd>
          )}
        </div>

        {/* command list */}
        <div ref={listRef} className="max-h-[316px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center">
              <Search className="h-6 w-6 text-text-dim" />
              <p className="text-sm text-text-dim">
                No commands match{' '}
                <span className="font-medium text-text">“{query}”</span>
              </p>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-xs text-accent transition-opacity hover:opacity-80"
              >
                Clear search
              </button>
            </div>
          ) : (
            (() => {
              let flat = -1;
              return grouped.map((g) => (
                <div key={g.label} className="mb-1 last:mb-0">
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-dim">
                    {g.label}
                  </div>
                  <motion.div layout className="space-y-0.5">
                    <AnimatePresence initial={false}>
                      {g.items.map((sc) => {
                        flat += 1;
                        const idx = flat;
                        const active = idx === selectedIndex;
                        const Icon = sc.cmd.Icon;
                        const isOpen = activeCmdId === sc.cmd.id && !!surface;
                        return (
                          <motion.button
                            key={sc.cmd.id}
                            type="button"
                            layout
                            data-row-index={idx}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => openSurface(sc.cmd)}
                            className="relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                          >
                            {active ? (
                              <motion.span
                                layoutId="palette-highlight"
                                transition={{
                                  type: 'spring',
                                  stiffness: 520,
                                  damping: 38,
                                }}
                                className="absolute inset-0 rounded-xl border border-accent/30 bg-accent/10"
                              />
                            ) : null}
                            <span
                              className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                active
                                  ? 'border-accent/40 bg-accent/15 text-accent'
                                  : 'border-border-muted bg-surface-2 text-text-dim'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="relative z-10 min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-text">
                                  {sc.cmd.title}
                                </span>
                                {isOpen ? (
                                  <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                                    Open
                                  </span>
                                ) : null}
                              </span>
                              <span className="block truncate text-xs text-text-dim">
                                {sc.cmd.hint}
                              </span>
                            </span>
                            <span className="relative z-10 flex shrink-0 items-center gap-2">
                              {active ? (
                                <motion.span
                                  initial={{ opacity: 0, x: -4 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  className="hidden items-center gap-1 text-[11px] text-text-dim sm:flex"
                                >
                                  <CornerDownLeft className="h-3 w-3" />
                                  run
                                </motion.span>
                              ) : null}
                              <kbd
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                                  active
                                    ? 'border-accent/40 bg-accent/10 text-accent'
                                    : 'border-border-muted bg-surface-2 text-text-dim'
                                }`}
                              >
                                {sc.cmd.kbd}
                              </kbd>
                            </span>
                          </motion.button>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                </div>
              ));
            })()
          )}
        </div>

        {/* palette footer / legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-muted bg-surface-2/60 px-4 py-2.5 text-[11px] text-text-dim">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border-muted bg-surface px-1.5 py-0.5">
                ↑
              </kbd>
              <kbd className="rounded border border-border-muted bg-surface px-1.5 py-0.5">
                ↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border-muted bg-surface px-1.5 py-0.5">
                ⏎
              </kbd>
              run
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border-muted bg-surface px-1.5 py-0.5">
                esc
              </kbd>
              close
            </span>
          </span>
          <span>
            {results.length} of {COMMANDS.length} commands
          </span>
        </div>
      </motion.section>

      {/* ---- Pinned quick-tools row ---- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
          <Pin className="h-3.5 w-3.5" />
          Pinned
        </div>
        <div className="flex flex-wrap gap-2">
          {pinned.map((cmd, i) => {
            const Icon = cmd.Icon;
            const isOpen = activeCmdId === cmd.id && !!surface;
            return (
              <motion.button
                key={cmd.id}
                type="button"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, delay: 0.12 + i * 0.04 }}
                onClick={() => openSurface(cmd)}
                className={`group flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                  isOpen
                    ? 'border-accent/40 bg-accent/10 text-text'
                    : 'border-border-muted bg-surface text-text-dim hover:text-text'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md ${
                    isOpen
                      ? 'bg-accent/15 text-accent'
                      : 'bg-surface-2 text-text-dim group-hover:text-text'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="font-medium text-text">{cmd.title}</span>
                <ChevronRight className="h-3.5 w-3.5 text-text-dim transition-transform group-hover:translate-x-0.5" />
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* ---- Result surface (expands inline when a command is launched) ---- */}
      <AnimatePresence mode="wait">
        {surface ? (
          <motion.section
            key={surface}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-border-muted bg-surface">
              {/* surface header */}
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent4/10 text-accent4">
                    {surface === 'placement' ? (
                      <Target className="h-5 w-5" />
                    ) : surface === 'spam' ? (
                      <Wand2 className="h-5 w-5" />
                    ) : surface === 'template' ? (
                      <FileEdit className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-text">
                        {surface === 'placement'
                          ? 'Inbox Tester'
                          : surface === 'spam'
                            ? 'Spam Scanner'
                            : surface === 'template'
                              ? 'Template Designer'
                              : 'Warmup Preview'}
                      </h2>
                      {surface === 'placement' ? (
                        <span className="rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
                          Flagship
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-text-dim">
                      {surface === 'placement'
                        ? 'Probe 30 real seed inboxes across Gmail / Outlook / Yahoo.'
                        : surface === 'spam'
                          ? 'SpamAssassin-style content scoring with trigger reasons.'
                          : surface === 'template'
                            ? 'Author & preview the messages the engine sends.'
                            : 'Sample thread messages — nothing leaves your account.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeSurface}
                  className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs text-text-dim transition-colors hover:text-text"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              </header>

              {surface === 'placement' ? (
                <PlacementSurface
                  mailboxes={MOCK_MAILBOXES}
                  mailboxId={mailboxId}
                  setMailboxId={setMailboxId}
                  phase={phase}
                  resolved={resolved}
                  progressPct={progressPct}
                  overall={overall}
                  onRun={startPlacement}
                  onReset={resetPlacement}
                  fromRecent={openedFromRunId !== null}
                />
              ) : surface === 'spam' ? (
                <SpamSurface sample={MOCK_SCAN} />
              ) : surface === 'template' ? (
                <TemplateSurface />
              ) : (
                <PreviewSurface />
              )}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      {/* ---- Recent runs gallery ---- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.16 }}
        className="space-y-2.5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
            <History className="h-3.5 w-3.5" />
            Recent runs
          </div>
          <span className="text-xs text-text-dim">{recent.length} runs</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {recent.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              const st = STATUS_META[r.status];
              return (
                <motion.button
                  key={r.id}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.28, delay: 0.18 + i * 0.04 }}
                  onClick={() => reopenRecent(r)}
                  className="group flex flex-col gap-3 rounded-xl border border-border-muted bg-surface p-4 text-left transition-colors hover:border-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-text-dim group-hover:text-text">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span
                      className={`flex items-center gap-1.5 text-[11px] font-semibold ${st.cls}`}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: st.dot }}
                      />
                      {st.label}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text">
                      {r.title}
                    </p>
                    <p className="truncate text-xs text-text-dim">
                      {r.mailbox}
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t border-border-muted pt-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] text-text-dim">
                      <Clock className="h-3 w-3" />
                      {r.when}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-text">
                      {r.metric}
                      <ArrowRight className="h-3 w-3 text-text-dim transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result surfaces
// ---------------------------------------------------------------------------

function PlacementSurface({
  mailboxes,
  mailboxId,
  setMailboxId,
  phase,
  resolved,
  progressPct,
  overall,
  onRun,
  onReset,
  fromRecent,
}: {
  mailboxes: Mailbox[];
  mailboxId: string;
  setMailboxId: (id: string) => void;
  phase: RunPhase;
  resolved: number;
  progressPct: number;
  overall: ProviderBreakdown;
  onRun: () => void;
  onReset: () => void;
  fromRecent: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12">
      {/* run panel */}
      <div className="space-y-4 border-b border-border-muted p-5 lg:col-span-4 lg:border-b-0 lg:border-r">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-dim">
            Mailbox under test
          </label>
          <div className="max-h-[208px] space-y-1.5 overflow-y-auto pr-1">
            {mailboxes.map((m) => {
              const active = m.id === mailboxId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMailboxId(m.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? 'border-accent/40 bg-accent/10 text-text'
                      : 'border-border-muted bg-surface-2 text-text-dim hover:text-text'
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: providerDot(m.provider) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{m.email}</span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-dim">
                    {m.provider}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={phase === 'running'}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-bg shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {phase === 'running' ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-bg/30 border-t-bg" />
              Sending probes…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {phase === 'done' ? 'Run again' : 'Run inbox test'}
            </>
          )}
        </button>

        {phase !== 'idle' ? (
          <button
            type="button"
            onClick={onReset}
            className="flex w-full items-center justify-center gap-1.5 text-xs text-text-dim transition-colors hover:text-text"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        ) : null}

        <div className="rounded-lg border border-border-muted bg-surface-2 p-3 text-xs text-text-dim">
          {fromRecent
            ? 'Reopened from Recent runs — showing the stored 30-seed result. Run again for a fresh probe.'
            : 'Probes sent from the system seed network — Inbox vs Promotions vs Spam read back via IMAP within ~90s.'}
        </div>
      </div>

      {/* result / progress */}
      <div className="min-h-[300px] p-5 lg:col-span-8">
        <AnimatePresence mode="wait">
          {phase === 'idle' ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent4/10 text-accent4">
                <Target className="h-7 w-7" />
              </span>
              <p className="max-w-sm text-sm text-text-dim">
                Pick a mailbox and run an inbox test. Results break down
                Inbox / Promotions / Spam per provider with a live 30-seed
                heatmap.
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
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-text">
                  Waiting for landings…
                </span>
                <span className="tabular-nums text-text-dim">
                  {resolved} / {MOCK_RUN.total} reported
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
              <SeedGrid revealed={resolved} animate />
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
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  <span className="text-sm font-semibold text-text">
                    Inbox test complete
                  </span>
                  <span className="text-xs text-text-dim">
                    {MOCK_RUN.total} seeds
                  </span>
                </div>
                <span className="text-xs font-semibold text-accent">
                  {pct(overall.inbox, MOCK_RUN.total)}% inbox
                </span>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-text-dim">
                  Where emails land
                </div>
                <StackedBar
                  breakdown={overall}
                  total={MOCK_RUN.total}
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
                        {overall[b]} ({pct(overall[b], MOCK_RUN.total)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-text-dim">
                  By provider
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['gmail', 'outlook', 'yahoo'] as Provider[]).map((p) => (
                    <ProviderCard
                      key={p}
                      provider={p}
                      breakdown={MOCK_RUN.byProvider[p]}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-text-dim">
                  30-seed heatmap
                </div>
                <SeedGrid revealed={MOCK_RUN.total} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SeedGrid({
  revealed,
  animate,
}: {
  revealed: number;
  animate?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MOCK_RUN.seeds.map((s, i) => {
        const shown = i < revealed;
        const meta = BUCKET_META[s.bucket];
        return (
          <motion.span
            key={s.id}
            initial={animate ? { scale: 0.6, opacity: 0 } : false}
            animate={
              shown ? { scale: 1, opacity: 1 } : { scale: 0.85, opacity: 0.35 }
            }
            transition={{ duration: 0.25, delay: animate ? i * 0.015 : 0 }}
            className="flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-bold"
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
            title={`${BUCKET_META[b].label}: ${breakdown[b]} (${pct(
              breakdown[b],
              total,
            )}%)`}
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
    <div className="rounded-xl border border-border-muted bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">
          {PROVIDER_LABEL[provider]}
        </h4>
        <span className="text-xs text-text-dim">{total} seeds</span>
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

function SpamSurface({ sample }: { sample: ScannerSample }) {
  const tone =
    sample.score < 3 ? C.accent : sample.score < 6 ? C.accent4 : C.accent3;
  const toneClass =
    sample.score < 3
      ? 'text-accent'
      : sample.score < 6
        ? 'text-accent4'
        : 'text-accent3';
  const fillPct = Math.min(100, (sample.score / 10) * 100);

  return (
    <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-text-dim">
            Scanned subject
          </div>
          <div className="mt-0.5 text-sm font-medium text-text">
            {sample.subject}
          </div>
        </div>
        <div className="flex items-center gap-4">
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
                strokeDasharray={2 * Math.PI * 32}
                initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
                animate={{
                  strokeDashoffset: 2 * Math.PI * 32 * (1 - fillPct / 100),
                }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-xl font-semibold tabular-nums ${toneClass}`}
              >
                {sample.score}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-text-dim">
                / 10
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${toneClass}`}>
              {sample.verdict}
            </p>
            <p className="mt-0.5 text-xs text-text-dim">
              Lower is better. Below 5 generally lands in the inbox.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-text-dim">Flagged terms</div>
        {sample.flagged.map((f, i) => (
          <motion.div
            key={f.term}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: 0.1 + i * 0.06 }}
            className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5 text-xs"
          >
            <div className="min-w-0">
              <span className="font-semibold text-text">{f.term}</span>
              <span className="ml-2 text-text-dim">{f.reason}</span>
            </div>
            <span className="shrink-0 font-semibold text-accent3">
              +{f.weight}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TemplateSurface() {
  return (
    <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-border-muted bg-surface-2">
        <div className="flex items-center gap-2 border-b border-border-muted px-3.5 py-2.5 text-xs text-text-dim">
          <FileEdit className="h-3.5 w-3.5" />
          Quick sync re: Q3 roadmap
        </div>
        <div className="space-y-2 p-4 text-sm leading-relaxed text-text-dim">
          <p className="text-text">Hi {'{{first_name}}'},</p>
          <p>
            Wanted to circle back on the roadmap doc — the timeline looks
            solid. Got 15 minutes this week to walk through it?
          </p>
          <p>Thanks,</p>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="block h-3 w-28 rounded bg-border-muted"
          />
        </div>
      </div>
      <div className="space-y-3">
        <div className="text-xs font-medium text-text-dim">Output mode</div>
        <div className="flex flex-wrap gap-2">
          {['Plain', 'HTML', 'AI variants'].map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-3 py-1.5 text-xs ${
                i === 1
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2 text-text-dim'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="rounded-lg border border-border-muted bg-surface-2 p-3.5 text-xs text-text-dim">
          Saved templates feed the warmup content factory. The Q3 roadmap
          template currently has{' '}
          <span className="font-semibold text-text">3 AI variants</span>{' '}
          generated.
        </div>
        <div className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-muted bg-surface-2 text-sm font-medium text-text-dim">
          <FileEdit className="h-4 w-4" />
          Open full designer
        </div>
      </div>
    </div>
  );
}

function PreviewSurface() {
  const TAG_TONE: Record<string, string> = {
    reply: 'text-accent',
    open: 'text-accent2',
    star: 'text-accent4',
  };
  return (
    <div className="space-y-3 p-5">
      <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5 text-xs text-text-dim">
        <Eye className="h-3.5 w-3.5 text-accent2" />
        Generated by the live content factory — these are samples, nothing is
        sent.
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {MOCK_PREVIEW_SAMPLES.map((s, i) => (
          <motion.div
            key={s.from}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.08 + i * 0.06 }}
            className="rounded-lg border border-border-muted bg-surface-2 px-3.5 py-3"
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-xs text-text-dim">{s.from}</span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  TAG_TONE[s.tag] ?? 'text-text-dim'
                }`}
              >
                {s.tag}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-text">
              {s.subject}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default ProPlusTool3Palette;
