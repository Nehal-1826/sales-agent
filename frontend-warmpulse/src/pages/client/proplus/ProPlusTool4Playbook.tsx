import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Compass,
  FileEdit,
  History,
  Mail,
  Play,
  Rocket,
  RotateCcw,
  ScanLine,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/format';

/**
 * ProPlusTool4Playbook — "Guided Playbook / Wizard" (Pro Plus tier).
 *
 * Fully standalone for the isolated preview harness: NO network / router /
 * query / fetch hooks, NO required props, inline MOCK. Renders ONLY page
 * content (no nav / chrome).
 *
 * Deliberately NOT any sibling paradigm:
 *   - NOT a 3-pane developer IDE (ProPlusTool1Ide owns explorer/center/console).
 *   - NOT a science lab / experiment bench (ProPlusTool2Lab owns the assay
 *     bench, microplate, analog dials).
 *   - NOT a command-palette launcher (ProPlusTool3Palette owns the Cmd-K bar).
 *   - NOT a centerpiece-card workbench (ProPlusTools / ProTools).
 *   - NOT a comparison table (StarterTools), NOT the wired single-purpose
 *     forms (PlacementTester.tsx / SpamScanner.tsx).
 *
 * This page is a GOAL-DRIVEN PLAYBOOK WIZARD:
 *   LANDING — a row of playbook cards, each a goal ("Pre-flight a campaign",
 *             "Test inbox placement", "Audit content for spam", "Design &
 *             preview a warmup template"). Below them a "completed playbooks"
 *             history strip.
 *   WIZARD  — picking a playbook launches a guided multi-step flow under
 *             AnimatePresence: a LEFT vertical stepper (done / active /
 *             upcoming nodes + an overall progress %) and a CENTER panel
 *             showing the active step, with Back / Next controls.
 *
 * The flagship playbook is "Test inbox placement" -> the Placement Tester
 * (30 seed inboxes): Step 1 pick a mailbox -> Step 2 confirm the seed set ->
 * Step 3 "Running" (a real idle -> done replay: progress bar + a 30-seed
 * grid revealing seed-by-seed) -> Step 4 a results report (per-provider
 * Gmail/Outlook/Yahoo Inbox/Promotions/Spam + a 30-seed heatmap +
 * recommendations). Next / Back genuinely move steps; Step 3 genuinely
 * animates idle -> done before Next unlocks.
 *
 * Colour: existing Tailwind tokens only. inbox -> accent, promo -> accent4,
 * spam -> accent3, done/healthy -> accent.
 */

// ---------------------------------------------------------------------------
// Palette — token RGBs (mirrors components/charts/theme.ts). No new colours.
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // inbox / done / healthy
  accent3: 'rgb(255, 107, 74)', // spam / danger
  accent4: 'rgb(255, 213, 79)', // promotions / mid
} as const;

type Bucket = 'inbox' | 'promotions' | 'spam';

const BUCKET_META: Record<
  Bucket,
  { label: string; color: string; textClass: string }
> = {
  inbox: { label: 'Inbox', color: C.accent, textClass: 'text-accent' },
  promotions: {
    label: 'Promotions',
    color: C.accent4,
    textClass: 'text-accent4',
  },
  spam: { label: 'Spam', color: C.accent3, textClass: 'text-accent3' },
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

type PlaybookId = 'preflight' | 'placement' | 'spam' | 'template';

interface PlaybookStep {
  /** Stable key used for the stepper + AnimatePresence panel. */
  key: string;
  title: string;
  hint: string;
}

interface Playbook {
  id: PlaybookId;
  name: string;
  goal: string;
  blurb: string;
  Icon: LucideIcon;
  tone: string;
  toneClass: string;
  est: string;
  /** True for the flagship Pro Plus differentiator. */
  flagship?: boolean;
  steps: PlaybookStep[];
}

interface PbMailbox {
  id: string;
  email: string;
  provider: Provider | 'smtp';
  warmDay: number;
}

interface SeedCell {
  id: string;
  provider: Provider;
  bucket: Bucket;
}

interface ProviderBreakdown {
  inbox: number;
  promotions: number;
  spam: number;
}

interface PlacementResult {
  total: number;
  byProvider: Record<Provider, ProviderBreakdown>;
  seeds: SeedCell[];
  completedAt: string;
  recommendations: string[];
}

interface SpamSample {
  subject: string;
  score: number;
  verdict: string;
  flagged: Array<{ term: string; weight: number; reason: string }>;
}

interface HistoryRow {
  id: string;
  playbook: PlaybookId;
  playbookName: string;
  mailbox: string;
  when: string;
  headline: string;
  tone: 'good' | 'mid' | 'bad';
}

interface PlaybookData {
  playbooks: Playbook[];
  mailboxes: PbMailbox[];
  placement: PlacementResult;
  spam: SpamSample;
  history: HistoryRow[];
}

/**
 * Build the flagship 30-seed completed run:
 * ~26 inbox / 3 promotions / 1 spam, spread across
 * Gmail (12) / Outlook (10) / Yahoo (8).
 */
function buildPlacement(): PlacementResult {
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
      buckets: [
        ...Array<Bucket>(6).fill('inbox'),
        'promotions',
        'promotions',
      ],
    },
  ];

  const seeds: SeedCell[] = [];
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

  return {
    total: seeds.length,
    byProvider,
    seeds,
    completedAt: '2026-05-17T14:08:00Z',
    recommendations: [
      'Inbox delivery is strong (86.7%) — keep the current daily build-up untouched.',
      '1 Outlook seed landed in spam; warm Outlook 4–5 more days before scaling volume.',
      'Yahoo is tabbing into Promotions — vary subject lines and trim promotional phrasing.',
    ],
  };
}

const MOCK: PlaybookData = {
  playbooks: [
    {
      id: 'preflight',
      name: 'Pre-flight a campaign',
      goal: 'Ship-ready check before you press send',
      blurb:
        'Walk the full pre-launch checklist — domain auth, warmup health, content score and a placement probe — in one guided pass.',
      Icon: Rocket,
      tone: C.accent4,
      toneClass: 'text-accent4',
      est: '4 steps · ~3 min',
      steps: [
        { key: 'scope', title: 'Pick the sending mailbox', hint: 'Choose which connected mailbox the campaign sends from.' },
        { key: 'auth', title: 'Verify domain auth', hint: 'SPF / DKIM / DMARC must be green before launch.' },
        { key: 'health', title: 'Review warmup health', hint: 'Confirm the mailbox is warm enough for the planned volume.' },
        { key: 'go', title: 'Go / no-go summary', hint: 'A consolidated verdict with the blocking items called out.' },
      ],
    },
    {
      id: 'placement',
      name: 'Test where emails land',
      goal: 'See exactly where you land across 30 seeds',
      blurb:
        'Probe 30 real seed inboxes across Gmail, Outlook and Yahoo and get a per-provider Inbox / Promotions / Spam breakdown with fixes.',
      Icon: Target,
      tone: C.accent,
      toneClass: 'text-accent',
      est: '4 steps · ~90s',
      flagship: true,
      steps: [
        { key: 'mailbox', title: 'Pick the mailbox under test', hint: 'Where emails land is measured for one mailbox at a time.' },
        { key: 'seedset', title: 'Confirm the seed set', hint: 'Review the 30 seeds the probe will be delivered to.' },
        { key: 'run', title: 'Run the inbox probe', hint: '30 seeds report back seed-by-seed — this step finishes itself.' },
        { key: 'report', title: 'Read the inbox-test report', hint: 'Per-provider breakdown, the 30-seed heatmap and recommendations.' },
      ],
    },
    {
      id: 'spam',
      name: 'Audit content for spam',
      goal: 'Score a draft before it ever sends',
      blurb:
        'Paste a subject and body, run a SpamAssassin-style scan, and get the exact flagged triggers ranked by weight so you can fix them.',
      Icon: ScanLine,
      tone: C.accent3,
      toneClass: 'text-accent3',
      est: '3 steps · ~30s',
      steps: [
        { key: 'paste', title: 'Paste the draft', hint: 'Subject + body of the message you want to audit.' },
        { key: 'analyze', title: 'Analyze the content', hint: 'Score the draft against the spam-trigger ruleset.' },
        { key: 'fixes', title: 'Review the report', hint: 'Score, verdict and a ranked list of flagged terms to fix.' },
      ],
    },
    {
      id: 'template',
      name: 'Design & preview a warmup template',
      goal: 'Author a thread the engine will actually send',
      blurb:
        'Compose a warmup template, preview the rendered thread message, and confirm the variants the content factory will rotate.',
      Icon: FileEdit,
      tone: C.accent4,
      toneClass: 'text-accent4',
      est: '3 steps · ~2 min',
      steps: [
        { key: 'compose', title: 'Compose the template', hint: 'Pick a tone and the merge fields the template uses.' },
        { key: 'preview', title: 'Preview the rendered thread', hint: 'See exactly what a seed mailbox would receive.' },
        { key: 'confirm', title: 'Confirm & save', hint: 'Lock the template into the warmup content rotation.' },
      ],
    },
  ],
  mailboxes: [
    { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail', warmDay: 24 },
    { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook', warmDay: 18 },
    { id: 'mb-3', email: 'success@acme.io', provider: 'gmail', warmDay: 31 },
    { id: 'mb-4', email: 'hello@acme.co', provider: 'smtp', warmDay: 9 },
    { id: 'mb-5', email: 'partners@acme.io', provider: 'yahoo', warmDay: 12 },
  ],
  placement: buildPlacement(),
  spam: {
    subject: 'LAST CHANCE — claim your FREE upgrade now!!!',
    score: 5.8,
    verdict: 'Borderline — likely to tab into Promotions or Spam',
    flagged: [
      { term: 'FREE', weight: 1.4, reason: 'All-caps promotional trigger' },
      { term: 'LAST CHANCE', weight: 1.1, reason: 'High-pressure urgency phrase' },
      { term: '!!!', weight: 0.8, reason: 'Excessive punctuation' },
      { term: 'claim your', weight: 0.6, reason: 'Promotional call-to-action phrasing' },
    ],
  },
  history: [
    {
      id: 'h-1',
      playbook: 'placement',
      playbookName: 'Test where emails land',
      mailbox: 'founder@acme.io',
      when: 'May 14, 09:22',
      headline: '83.3% inbox · 6.7% spam · 30 seeds',
      tone: 'good',
    },
    {
      id: 'h-2',
      playbook: 'preflight',
      playbookName: 'Pre-flight a campaign',
      mailbox: 'sales@acme.io',
      when: 'May 11, 16:40',
      headline: 'Go — 1 advisory (Outlook warmup day 14)',
      tone: 'mid',
    },
    {
      id: 'h-3',
      playbook: 'spam',
      playbookName: 'Audit content for spam',
      mailbox: 'success@acme.io',
      when: 'May 9, 11:05',
      headline: 'Score 2.4 / 10 · clean — landed in inbox',
      tone: 'good',
    },
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

function providerDot(p: PbMailbox['provider']): string {
  return p === 'gmail'
    ? C.accent3
    : p === 'outlook'
      ? 'var(--wp-accent2)'
      : p === 'yahoo'
        ? C.accent4
        : 'var(--wp-text-dim)';
}

const HISTORY_TONE: Record<HistoryRow['tone'], string> = {
  good: 'text-accent',
  mid: 'text-accent4',
  bad: 'text-accent3',
};

type RunPhase = 'idle' | 'running' | 'done';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusTool4Playbook(): JSX.Element {
  const d = MOCK;

  // --- Wizard state (all real React state) ---
  const [activeId, setActiveId] = useState<PlaybookId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  // Per-playbook lightweight inputs:
  const [mailboxId, setMailboxId] = useState<string>(d.mailboxes[0]?.id ?? '');
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [resolved, setResolved] = useState(0);
  const tickRef = useRef<number | null>(null);

  const playbook = d.playbooks.find((p) => p.id === activeId) ?? null;
  const steps = playbook?.steps ?? [];
  const stepKey = steps[stepIndex]?.key ?? '';
  const progressPct =
    steps.length > 1
      ? Math.round((stepIndex / (steps.length - 1)) * 100)
      : 0;

  const clearTick = () => {
    if (tickRef.current !== null) {
      window.clearTimeout(tickRef.current);
      tickRef.current = null;
    }
  };

  const launch = (id: PlaybookId) => {
    clearTick();
    setActiveId(id);
    setStepIndex(0);
    setPhase('idle');
    setResolved(0);
  };

  const closeWizard = () => {
    clearTick();
    setActiveId(null);
    setStepIndex(0);
    setPhase('idle');
    setResolved(0);
  };

  // The flagship "run" step genuinely replays idle -> done.
  const startRun = () => {
    clearTick();
    setPhase('running');
    setResolved(0);
    const total = d.placement.total;
    let count = 0;
    const tick = () => {
      count += Math.max(1, Math.round(total / 14));
      if (count >= total) {
        setResolved(total);
        setPhase('done');
        tickRef.current = null;
        return;
      }
      setResolved(count);
      tickRef.current = window.setTimeout(tick, 240);
    };
    tickRef.current = window.setTimeout(tick, 340);
  };

  const replayRun = () => {
    setPhase('idle');
    setResolved(0);
    clearTick();
  };

  // Next is blocked on the flagship run step until the replay completes.
  const runStepBlocking =
    playbook?.id === 'placement' &&
    stepKey === 'run' &&
    phase !== 'done';

  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  const goNext = () => {
    if (runStepBlocking) return;
    if (isLast) {
      closeWizard();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    if (isFirst) return;
    clearTick();
    // Leaving the report back onto the run step resets the replay so it can
    // be watched again.
    if (playbook?.id === 'placement' && steps[stepIndex - 1]?.key === 'run') {
      setPhase('idle');
      setResolved(0);
    }
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const overall = useMemo(() => {
    const acc: ProviderBreakdown = { inbox: 0, promotions: 0, spam: 0 };
    for (const p of Object.keys(d.placement.byProvider) as Provider[]) {
      acc.inbox += d.placement.byProvider[p].inbox;
      acc.promotions += d.placement.byProvider[p].promotions;
      acc.spam += d.placement.byProvider[p].spam;
    }
    return acc;
  }, [d.placement.byProvider]);

  return (
    <div className="flex min-h-[760px] flex-col gap-5">
      {/* Header band */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Tool Playbooks
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Pick a goal — each tool is a guided, step-by-step playbook. The
            flagship: a 30-seed inbox test, walked one step at a
            time.
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

      <AnimatePresence mode="wait">
        {playbook === null ? (
          // ===================================================================
          // LANDING — playbook goal cards + completed-playbook history strip.
          // ===================================================================
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="flex flex-1 flex-col gap-5"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-dim">
              <Compass className="h-3.5 w-3.5" />
              Choose a playbook
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {d.playbooks.map((p, i) => {
                const PIcon = p.Icon;
                return (
                  <motion.button
                    key={p.id}
                    type="button"
                    onClick={() => launch(p.id)}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.34,
                      ease: 'easeOut',
                      delay: 0.05 + i * 0.07,
                    }}
                    whileHover={{ y: -4 }}
                    className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border-muted bg-surface p-5 text-left transition-colors hover:border-accent/40"
                  >
                    {p.flagship ? (
                      <span className="absolute right-4 top-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          <Sparkles className="h-2.5 w-2.5" />
                          Flagship
                        </span>
                      </span>
                    ) : null}

                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: `${p.tone}1a`, color: p.tone }}
                    >
                      <PIcon className="h-5 w-5" />
                    </span>

                    <div className="space-y-1">
                      <h2 className="text-base font-semibold text-text">
                        {p.name}
                      </h2>
                      <p className={`text-xs font-medium ${p.toneClass}`}>
                        {p.goal}
                      </p>
                    </div>

                    <p className="text-sm leading-relaxed text-text-dim">
                      {p.blurb}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-xs text-text-dim">{p.est}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                        Start playbook
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Completed-playbook history strip */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.34, ease: 'easeOut', delay: 0.34 }}
              className="rounded-xl border border-border-muted bg-surface"
            >
              <header className="flex items-center justify-between border-b border-border-muted px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-text-dim" />
                  <h3 className="text-sm font-semibold text-text">
                    Completed playbooks
                  </h3>
                </div>
                <span className="text-xs text-text-dim">
                  {d.history.length} runs
                </span>
              </header>
              <div className="divide-y divide-border-muted">
                {d.history.map((h, i) => (
                  <motion.div
                    key={h.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.28,
                      delay: 0.4 + i * 0.06,
                    }}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-text-dim">
                        <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">
                          {h.playbookName}
                        </p>
                        <p className="truncate text-xs text-text-dim">
                          {h.mailbox} · {h.when}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold ${HISTORY_TONE[h.tone]}`}
                    >
                      {h.headline}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        ) : (
          // ===================================================================
          // WIZARD — left vertical stepper + center step panel + Back/Next.
          // ===================================================================
          <motion.div
            key={`wizard-${playbook.id}`}
            initial={{ opacity: 0, scale: 0.985, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: -16 }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
            className="flex flex-1 flex-col gap-4"
          >
            {/* Wizard top bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface px-5 py-3.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeWizard}
                  className="flex items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:text-text"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All playbooks
                </button>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{
                    background: `${playbook.tone}1a`,
                    color: playbook.tone,
                  }}
                >
                  <playbook.Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-text">
                      {playbook.name}
                    </h2>
                    {playbook.flagship ? (
                      <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                        Pro Plus
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-text-dim">{playbook.goal}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-text-dim">
                  Step {stepIndex + 1} of {steps.length}
                </p>
                <p className="text-sm font-semibold text-accent">
                  {progressPct}% complete
                </p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              {/* LEFT — vertical stepper */}
              <div className="rounded-xl border border-border-muted bg-surface p-5">
                <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={false}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>

                <ol className="relative space-y-1">
                  {steps.map((s, i) => {
                    const state =
                      i < stepIndex
                        ? 'done'
                        : i === stepIndex
                          ? 'active'
                          : 'upcoming';
                    const isLastNode = i === steps.length - 1;
                    return (
                      <li key={s.key} className="relative flex gap-3 pb-3">
                        {/* connector line */}
                        {!isLastNode ? (
                          <span
                            aria-hidden
                            className="absolute left-[13px] top-7 h-[calc(100%-12px)] w-px"
                            style={{
                              background:
                                i < stepIndex
                                  ? C.accent
                                  : 'var(--wp-border-muted)',
                            }}
                          />
                        ) : null}

                        <motion.span
                          initial={false}
                          animate={{
                            backgroundColor:
                              state === 'upcoming'
                                ? 'var(--wp-surface-2)'
                                : C.accent,
                            borderColor:
                              state === 'upcoming'
                                ? 'var(--wp-border-muted)'
                                : C.accent,
                            scale: state === 'active' ? 1.08 : 1,
                          }}
                          transition={{ duration: 0.3 }}
                          className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                          style={{
                            color:
                              state === 'upcoming'
                                ? 'var(--wp-text-dim)'
                                : 'var(--wp-bg)',
                          }}
                        >
                          {state === 'done' ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          ) : (
                            i + 1
                          )}
                        </motion.span>

                        <div className="min-w-0 pt-0.5">
                          <p
                            className={`text-sm font-medium ${
                              state === 'upcoming'
                                ? 'text-text-dim'
                                : 'text-text'
                            }`}
                          >
                            {s.title}
                          </p>
                          {state === 'active' ? (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.25 }}
                              className="mt-0.5 text-xs leading-snug text-text-dim"
                            >
                              {s.hint}
                            </motion.p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* CENTER — active step panel */}
              <div className="flex min-h-[460px] flex-col rounded-xl border border-border-muted bg-surface">
                <div className="flex-1 overflow-hidden p-6">
                  <AnimatePresence mode="wait" custom={stepIndex}>
                    <motion.div
                      key={`${playbook.id}-${stepKey}`}
                      initial={{ opacity: 0, x: 28 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -28 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className="h-full"
                    >
                      <StepPanel
                        playbook={playbook}
                        stepKey={stepKey}
                        d={d}
                        mailboxId={mailboxId}
                        setMailboxId={setMailboxId}
                        phase={phase}
                        resolved={resolved}
                        startRun={startRun}
                        replayRun={replayRun}
                        overall={overall}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Back / Next controls */}
                <div className="flex items-center justify-between gap-3 border-t border-border-muted px-6 py-4">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={goBack}
                    disabled={isFirst}
                    leftIcon={<ArrowLeft className="h-4 w-4" />}
                  >
                    Back
                  </Button>

                  <div className="flex items-center gap-3">
                    {runStepBlocking ? (
                      <span className="text-xs text-text-dim">
                        Waiting for all 30 seeds to report…
                      </span>
                    ) : null}
                    <Button
                      size="md"
                      onClick={goNext}
                      disabled={runStepBlocking}
                      rightIcon={
                        isLast ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )
                      }
                    >
                      {isLast ? 'Finish playbook' : 'Next step'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step panel router
// ---------------------------------------------------------------------------

interface StepPanelProps {
  playbook: Playbook;
  stepKey: string;
  d: PlaybookData;
  mailboxId: string;
  setMailboxId: (id: string) => void;
  phase: RunPhase;
  resolved: number;
  startRun: () => void;
  replayRun: () => void;
  overall: ProviderBreakdown;
}

function StepPanel(props: StepPanelProps) {
  const { playbook, stepKey } = props;

  if (playbook.id === 'placement') return <PlacementSteps {...props} />;
  if (playbook.id === 'spam') return <SpamSteps {...props} />;
  if (playbook.id === 'preflight') return <PreflightSteps {...props} />;
  if (playbook.id === 'template') return <TemplateSteps {...props} />;

  return (
    <StepShell title="Step" subtitle={stepKey}>
      <p className="text-sm text-text-dim">Step content.</p>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Shared step chrome
// ---------------------------------------------------------------------------

function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-text">{title}</h3>
        <p className="mt-1 text-sm text-text-dim">{subtitle}</p>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function MailboxPicker({
  d,
  mailboxId,
  setMailboxId,
}: {
  d: PlaybookData;
  mailboxId: string;
  setMailboxId: (id: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {d.mailboxes.map((m) => {
        const active = m.id === mailboxId;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setMailboxId(m.id)}
            className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
              active
                ? 'border-accent/50 bg-accent/10'
                : 'border-border-muted bg-surface-2 hover:border-border-muted hover:bg-surface'
            }`}
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: providerDot(m.provider) }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">
                {m.email}
              </span>
              <span className="block text-xs text-text-dim">
                {m.provider.toUpperCase()} · warmup day {m.warmDay}
              </span>
            </span>
            <motion.span
              initial={false}
              animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-bg"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </motion.span>
          </button>
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
            title={`${BUCKET_META[b].label}: ${breakdown[b]} (${pct(breakdown[b], total)}%)`}
          />
        ) : null,
      )}
    </div>
  );
}

function SeedGrid({
  seeds,
  revealed,
  animate,
}: {
  seeds: SeedCell[];
  revealed: number;
  animate?: boolean;
}) {
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {seeds.map((s, i) => {
        const shown = i < revealed;
        const meta = BUCKET_META[s.bucket];
        return (
          <motion.span
            key={s.id}
            initial={animate ? { scale: 0.5, opacity: 0 } : false}
            animate={
              shown
                ? { scale: 1, opacity: 1 }
                : { scale: 0.82, opacity: 0.32 }
            }
            transition={{
              duration: 0.24,
              delay: animate ? i * 0.014 : 0,
            }}
            className="flex aspect-square items-center justify-center rounded-md border text-[10px] font-bold"
            style={{
              borderColor: shown ? meta.color : 'var(--wp-border-muted)',
              background: shown ? `${meta.color}24` : 'var(--wp-surface-2)',
              color: shown ? meta.color : 'var(--wp-text-dim)',
            }}
            title={`${PROVIDER_LABEL[s.provider]} · ${
              shown ? meta.label : 'pending'
            }`}
          >
            {shown ? meta.label.charAt(0) : '·'}
          </motion.span>
        );
      })}
    </div>
  );
}

function BucketLegend({
  breakdown,
  total,
}: {
  breakdown: ProviderBreakdown;
  total: number;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {BUCKET_ORDER.map((b) => (
        <div key={b} className="flex items-center gap-1.5 text-xs">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: BUCKET_META[b].color }}
          />
          <span className="text-text-dim">{BUCKET_META[b].label}</span>
          <span className={`font-semibold ${BUCKET_META[b].textClass}`}>
            {breakdown[b]} ({pct(breakdown[b], total)}%)
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flagship: Placement Tester playbook steps
// ---------------------------------------------------------------------------

function PlacementSteps(props: StepPanelProps) {
  const {
    stepKey,
    d,
    mailboxId,
    setMailboxId,
    phase,
    resolved,
    startRun,
    replayRun,
    overall,
  } = props;
  const mailbox = d.mailboxes.find((m) => m.id === mailboxId);
  const total = d.placement.total;

  if (stepKey === 'mailbox') {
    return (
      <StepShell
        title="Pick the mailbox under test"
        subtitle="Where emails land is measured one mailbox at a time. The probe sends from the system seed network to this address."
      >
        <MailboxPicker
          d={d}
          mailboxId={mailboxId}
          setMailboxId={setMailboxId}
        />
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border-muted bg-surface-2 p-3 text-xs text-text-dim">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>
            30 seed inboxes across Gmail (12), Outlook (10) and Yahoo (8)
            will report Inbox / Promotions / Spam back via IMAP within ~90
            seconds.
          </span>
        </div>
      </StepShell>
    );
  }

  if (stepKey === 'seedset') {
    return (
      <StepShell
        title="Confirm the seed set"
        subtitle={`These 30 seeds will receive the probe from ${mailbox?.email ?? 'the selected mailbox'}.`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(['gmail', 'outlook', 'yahoo'] as Provider[]).map((p) => {
            const count = sumBreakdown(d.placement.byProvider[p]);
            return (
              <div
                key={p}
                className="rounded-xl border border-border-muted bg-surface-2 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text">
                    {PROVIDER_LABEL[p]}
                  </span>
                  <span className="text-xs text-text-dim">
                    {count} seeds
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-6 gap-1">
                  {Array.from({ length: count }).map((_, i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.015 }}
                      className="aspect-square rounded-sm border border-border-muted bg-surface"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-xs text-text">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span>
            All 30 seeds are healthy and online. Press{' '}
            <span className="font-semibold">Next step</span> to run the
            probe.
          </span>
        </div>
      </StepShell>
    );
  }

  if (stepKey === 'run') {
    return (
      <StepShell
        title="Run the inbox probe"
        subtitle="The probe is delivered to all 30 seeds; each one reports back as soon as it lands. This step completes itself."
      >
        <AnimatePresence mode="wait">
          {phase === 'idle' ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center gap-4 text-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Target className="h-8 w-8" />
              </span>
              <p className="max-w-sm text-sm text-text-dim">
                Ready to probe 30 seeds for{' '}
                <span className="font-medium text-text">
                  {mailbox?.email}
                </span>
                . The seed grid fills in one cell at a time as results
                arrive.
              </p>
              <Button
                size="lg"
                onClick={startRun}
                leftIcon={<Play className="h-4 w-4" />}
              >
                Start inbox probe
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-text">
                  {phase === 'running' ? (
                    <>
                      <span className="relative inline-flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                      </span>
                      Waiting for landings…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      All seeds reported
                    </>
                  )}
                </span>
                <span className="tabular-nums text-text-dim">
                  {resolved} / {total} reported
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.round((resolved / total) * 100)}%`,
                  }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
              <SeedGrid
                seeds={d.placement.seeds}
                revealed={resolved}
                animate
              />
              {phase === 'done' ? (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-text">
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                    Probe complete — {pct(overall.inbox, total)}% inbox.
                    Continue to the report.
                  </span>
                  <button
                    type="button"
                    onClick={replayRun}
                    className="flex items-center gap-1.5 text-xs font-medium text-text-dim transition-colors hover:text-text"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Replay
                  </button>
                </motion.div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </StepShell>
    );
  }

  // stepKey === 'report'
  return (
    <StepShell
      title="Inbox-test report"
      subtitle={`${total} seeds · completed ${formatDateTime(d.placement.completedAt)}`}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-dim">
              Where emails land
            </span>
            <span className="text-xs font-semibold text-accent">
              {pct(overall.inbox, total)}% inbox
            </span>
          </div>
          <StackedBar breakdown={overall} total={total} height={20} />
          <div className="mt-3">
            <BucketLegend breakdown={overall} total={total} />
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-text-dim">
            By provider
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(['gmail', 'outlook', 'yahoo'] as Provider[]).map((p) => {
              const bd = d.placement.byProvider[p];
              const t = sumBreakdown(bd);
              return (
                <div
                  key={p}
                  className="rounded-xl border border-border-muted bg-surface-2 p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-text">
                      {PROVIDER_LABEL[p]}
                    </h4>
                    <span className="text-xs text-text-dim">
                      {t} seeds
                    </span>
                  </div>
                  <StackedBar
                    breakdown={bd}
                    total={Math.max(t, 1)}
                    height={10}
                  />
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    {BUCKET_ORDER.map((b) =>
                      bd[b] > 0 ? (
                        <span key={b} className={BUCKET_META[b].textClass}>
                          {BUCKET_META[b].label}{' '}
                          {pct(bd[b], Math.max(t, 1))}%
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-text-dim">
            30-seed heatmap
          </div>
          <SeedGrid seeds={d.placement.seeds} revealed={total} />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-dim">
            <ClipboardCheck className="h-3.5 w-3.5" />
            Recommendations
          </div>
          <ul className="space-y-2">
            {d.placement.recommendations.map((r, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.26, delay: 0.1 + i * 0.07 }}
                className="flex items-start gap-2 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5 text-sm text-text-dim"
              >
                <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>{r}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Spam audit playbook steps
// ---------------------------------------------------------------------------

function SpamSteps(props: StepPanelProps) {
  const { stepKey, d } = props;
  const s = d.spam;

  if (stepKey === 'paste') {
    return (
      <StepShell
        title="Paste the draft"
        subtitle="Drop in the subject and body you want to audit. Nothing is sent — the content is only scored."
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-dim">
              Subject
            </label>
            <div className="rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5 text-sm text-text">
              {s.subject}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-dim">
              Body
            </label>
            <div className="h-44 overflow-auto rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-text-dim">
              Hi there,
              <br />
              <br />
              This is your LAST CHANCE to claim your FREE upgrade — act now
              before it expires!!!
              <br />
              <br />
              Click here to redeem instantly.
              <br />
              <br />— The Team
            </div>
          </div>
        </div>
      </StepShell>
    );
  }

  if (stepKey === 'analyze') {
    return (
      <StepShell
        title="Analyze the content"
        subtitle="The draft is scored against the SpamAssassin-style trigger ruleset (spam words, caps, punctuation, risky phrasing)."
      >
        <div className="flex h-full flex-col items-center justify-center gap-5">
          <div className="relative h-28 w-28">
            <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke="var(--wp-border-muted)"
                strokeWidth="8"
              />
              <motion.circle
                cx="48"
                cy="48"
                r="40"
                fill="none"
                stroke={C.accent3}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40}
                initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                animate={{
                  strokeDashoffset:
                    2 * Math.PI * 40 * (1 - Math.min(1, s.score / 10)),
                }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums text-accent3">
                {s.score}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-text-dim">
                / 10
              </span>
            </div>
          </div>
          <p className="text-center text-sm font-semibold text-accent3">
            {s.verdict}
          </p>
          <p className="max-w-sm text-center text-xs text-text-dim">
            Lower is better — anything under 5 generally lands in the inbox.
            Continue for the ranked list of what to fix.
          </p>
        </div>
      </StepShell>
    );
  }

  // stepKey === 'fixes'
  return (
    <StepShell
      title="Audit report"
      subtitle={`Score ${s.score} / 10 — ${s.verdict}.`}
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-text-dim">
          Flagged terms ({s.flagged.length}) — highest weight first
        </div>
        {[...s.flagged]
          .sort((a, b) => b.weight - a.weight)
          .map((f, i) => (
            <motion.div
              key={f.term}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, delay: 0.08 + i * 0.06 }}
              className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <span className="text-sm font-semibold text-text">
                  {f.term}
                </span>
                <span className="ml-2 text-xs text-text-dim">
                  {f.reason}
                </span>
              </div>
              <span className="shrink-0 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-xs font-semibold text-accent3">
                +{f.weight}
              </span>
            </motion.div>
          ))}
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5 text-xs text-text-dim">
          <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent4" />
          <span>
            Removing the all-caps words and trimming punctuation would drop
            this draft below the inbox threshold.
          </span>
        </div>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Pre-flight playbook steps
// ---------------------------------------------------------------------------

function PreflightSteps(props: StepPanelProps) {
  const { stepKey, d, mailboxId, setMailboxId } = props;
  const mailbox = d.mailboxes.find((m) => m.id === mailboxId);

  if (stepKey === 'scope') {
    return (
      <StepShell
        title="Pick the sending mailbox"
        subtitle="The pre-flight check runs against the mailbox this campaign will send from."
      >
        <MailboxPicker
          d={d}
          mailboxId={mailboxId}
          setMailboxId={setMailboxId}
        />
      </StepShell>
    );
  }

  if (stepKey === 'auth') {
    const records = [
      { k: 'SPF', ok: true, detail: 'v=spf1 include:_spf.acme.io ~all' },
      { k: 'DKIM', ok: true, detail: 'selector wp1 · 2048-bit key found' },
      { k: 'DMARC', ok: true, detail: 'p=quarantine · rua reporting on' },
    ];
    return (
      <StepShell
        title="Verify domain auth"
        subtitle={`SPF, DKIM and DMARC for ${mailbox?.email ?? 'the selected mailbox'}.`}
      >
        <div className="space-y-2.5">
          {records.map((r, i) => (
            <motion.div
              key={r.k}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: i * 0.08 }}
              className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-text">{r.k}</p>
                  <p className="font-mono text-xs text-text-dim">
                    {r.detail}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-accent">
                Valid
              </span>
            </motion.div>
          ))}
        </div>
      </StepShell>
    );
  }

  if (stepKey === 'health') {
    const day = mailbox?.warmDay ?? 0;
    const target = day >= 29 ? 50 : day >= 22 ? 50 : day >= 15 ? 35 : 20;
    return (
      <StepShell
        title="Review warmup health"
        subtitle={`${mailbox?.email ?? 'Mailbox'} is on warmup day ${day}.`}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border-muted bg-surface-2 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-dim">Warmup day</span>
              <span className="font-semibold text-text">{day} / 28+</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (day / 30) * 100)}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
            <p className="mt-2 text-xs text-text-dim">
              Current safe daily send target:{' '}
              <span className="font-semibold text-text">
                {target} emails/day
              </span>
            </p>
          </div>
          <div
            className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
              day >= 21
                ? 'border-accent/30 bg-accent/10 text-text'
                : 'border-accent4/30 bg-accent4/10 text-text'
            }`}
          >
            {day >= 21 ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            ) : (
              <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent4" />
            )}
            <span>
              {day >= 21
                ? 'Mailbox is sufficiently warm for a standard campaign volume.'
                : `Warm ${21 - day} more days before scaling past ${target} emails/day.`}
            </span>
          </div>
        </div>
      </StepShell>
    );
  }

  // stepKey === 'go'
  const day = mailbox?.warmDay ?? 0;
  const checks = [
    { label: 'Domain authentication (SPF / DKIM / DMARC)', ok: true },
    { label: 'Mailbox connected & sending', ok: true },
    {
      label: `Warmup maturity (day ${day})`,
      ok: day >= 21,
    },
    { label: 'Content audited for spam triggers', ok: true },
  ];
  const allGo = checks.every((c) => c.ok);
  return (
    <StepShell
      title="Go / no-go summary"
      subtitle="A consolidated pre-launch verdict for this campaign."
    >
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className={`flex items-center gap-3 rounded-xl border px-4 py-4 ${
            allGo
              ? 'border-accent/30 bg-accent/10'
              : 'border-accent4/30 bg-accent4/10'
          }`}
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full ${
              allGo
                ? 'bg-accent/20 text-accent'
                : 'bg-accent4/20 text-accent4'
            }`}
          >
            {allGo ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Target className="h-5 w-5" />
            )}
          </span>
          <div>
            <p className="text-base font-semibold text-text">
              {allGo ? 'Cleared for launch' : 'Launch with one advisory'}
            </p>
            <p className="text-xs text-text-dim">
              {allGo
                ? 'All pre-flight checks passed.'
                : 'One non-blocking item — review before scaling volume.'}
            </p>
          </div>
        </motion.div>
        <div className="space-y-2">
          {checks.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.24, delay: 0.1 + i * 0.06 }}
              className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5"
            >
              <span className="text-sm text-text">{c.label}</span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  c.ok
                    ? 'bg-accent/15 text-accent'
                    : 'bg-accent4/15 text-accent4'
                }`}
              >
                {c.ok ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : (
                  <span className="text-[10px] font-bold">!</span>
                )}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------
// Template designer playbook steps
// ---------------------------------------------------------------------------

function TemplateSteps(props: StepPanelProps) {
  const { stepKey } = props;

  if (stepKey === 'compose') {
    const tones = ['Casual check-in', 'Quick question', 'Follow-up'];
    const fields = ['{{first_name}}', '{{company}}', '{{topic}}'];
    return (
      <StepShell
        title="Compose the template"
        subtitle="Pick a conversational tone and the merge fields the warmup thread will use."
      >
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-medium text-text-dim">
              Tone
            </div>
            <div className="flex flex-wrap gap-2">
              {tones.map((t, i) => (
                <span
                  key={t}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    i === 0
                      ? 'border-accent/40 bg-accent/10 text-accent'
                      : 'border-border-muted bg-surface-2 text-text-dim'
                  }`}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-text-dim">
              Merge fields
            </div>
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <span
                  key={f}
                  className="rounded-md border border-border-muted bg-surface-2 px-2.5 py-1 font-mono text-xs text-text-dim"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-text-dim">
              Draft
            </div>
            <div className="rounded-lg border border-border-muted bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-text-dim">
              <p className="text-text">Hi {'{{first_name}}'},</p>
              <p className="mt-2">
                Wanted to circle back on the {'{{topic}}'} doc — the
                timeline at {'{{company}}'} looks solid. Got 15 minutes
                this week to walk through it?
              </p>
              <p className="mt-2">Thanks</p>
            </div>
          </div>
        </div>
      </StepShell>
    );
  }

  if (stepKey === 'preview') {
    return (
      <StepShell
        title="Preview the rendered thread"
        subtitle="This is exactly what a seed mailbox receives — merge fields resolved, nothing sent."
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="overflow-hidden rounded-xl border border-border-muted bg-surface-2"
        >
          <div className="flex items-center gap-2 border-b border-border-muted px-4 py-3 text-xs text-text-dim">
            <Mail className="h-3.5 w-3.5" />
            <span className="font-medium text-text">
              Quick sync re: Q3 roadmap
            </span>
          </div>
          <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-text-dim">
            <p>
              <span className="text-text-dim">From:</span>{' '}
              priya@seed-net.io
            </p>
            <p className="text-text">Hi Jordan,</p>
            <p>
              Wanted to circle back on the Q3 roadmap doc — the timeline at
              Acme looks solid. Got 15 minutes this week to walk through
              it?
            </p>
            <p>Thanks,</p>
            <p>Priya</p>
          </div>
        </motion.div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3.5 py-2.5 text-xs text-text-dim">
          <FileEdit className="h-3.5 w-3.5 text-accent4" />
          The live content factory rotates 4 AI variants of this thread.
        </div>
      </StepShell>
    );
  }

  // stepKey === 'confirm'
  return (
    <StepShell
      title="Confirm & save"
      subtitle="Lock this template into the warmup content rotation."
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent"
        >
          <CheckCircle2 className="h-8 w-8" />
        </motion.span>
        <p className="text-base font-semibold text-text">
          Template ready
        </p>
        <p className="max-w-sm text-sm text-text-dim">
          Saving adds this thread to the content factory rotation for all
          mailboxes in this workspace. Press{' '}
          <span className="font-semibold">Finish playbook</span> to confirm.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {['Plain', 'HTML', '4 AI variants'].map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-3 py-1 text-xs ${
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
    </StepShell>
  );
}

export default ProPlusTool4Playbook;
