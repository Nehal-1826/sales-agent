import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Eye,
  FileEdit,
  Gauge,
  Mail,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/format';

/**
 * ProPlusTools — "Tools Workbench" (Pro Plus tier).
 *
 * Fully standalone for the isolated preview harness: NO network / router /
 * query hooks, NO required props, inline MOCK. Renders ONLY page content.
 *
 * A 4-tool workbench. The headline Pro Plus tool — the **Placement Tester
 * (30 seed inboxes)** — is the visual centerpiece: a run panel (mailbox
 * picker + "Run placement test" CTA), an animated in-progress state that
 * resolves into per-provider Inbox/Promotions/Spam results with a 30-seed
 * grid heatmap, and a run-history list.
 *
 * The other three tools (Spam Scanner, Template Designer, Warmup Preview)
 * are compact interactive cards below.
 *
 * Colour: existing Tailwind tokens only.
 */

// ---------------------------------------------------------------------------
// Palette — mirrors components/charts/theme.ts (token RGBs, no new colours).
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // inbox / healthy
  accent2: 'rgb(255, 138, 75)', // info
  accent3: 'rgb(255, 107, 74)', // spam / danger
  accent4: 'rgb(255, 213, 79)', // promotions / mid
} as const;

type Bucket = 'inbox' | 'promotions' | 'spam';

const BUCKET_META: Record<
  Bucket,
  { label: string; color: string; textClass: string }
> = {
  inbox: { label: 'Inbox', color: C.accent, textClass: 'text-accent' },
  promotions: { label: 'Promotions', color: C.accent4, textClass: 'text-accent4' },
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
  completedAt: string;
}

interface HistoryItem {
  id: string;
  when: string;
  mailbox: string;
  inboxPct: number;
  spamPct: number;
  seeds: number;
}

interface ScannerResult {
  score: number;
  verdict: string;
  flagged: Array<{ term: string; weight: number; reason: string }>;
}

interface ProPlusToolsData {
  mailboxes: Mailbox[];
  run: PlacementRun;
  history: HistoryItem[];
  scanner: ScannerResult;
}

/**
 * Build the 30-seed completed run: ~26 inbox / 3 promotions / 1 spam,
 * spread across Gmail (12) / Outlook (10) / Yahoo (8).
 */
function buildRun(): PlacementRun {
  const layout: Array<{ provider: Provider; buckets: Bucket[] }> = [
    {
      provider: 'gmail',
      buckets: [
        ...Array<Bucket>(11).fill('inbox'),
        'promotions',
      ],
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

  return {
    total: seeds.length,
    byProvider,
    seeds,
    completedAt: '2026-05-17T14:08:00Z',
  };
}

const MOCK: ProPlusToolsData = {
  mailboxes: [
    { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail' },
    { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook' },
    { id: 'mb-3', email: 'success@acme.io', provider: 'gmail' },
    { id: 'mb-4', email: 'hello@acme.co', provider: 'smtp' },
  ],
  run: buildRun(),
  history: [
    {
      id: 'h-1',
      when: 'May 14, 09:22',
      mailbox: 'founder@acme.io',
      inboxPct: 83.3,
      spamPct: 6.7,
      seeds: 30,
    },
    {
      id: 'h-2',
      when: 'May 9, 16:40',
      mailbox: 'sales@acme.io',
      inboxPct: 76.7,
      spamPct: 10.0,
      seeds: 30,
    },
  ],
  scanner: {
    score: 2.4,
    verdict: 'Likely to land in Inbox',
    flagged: [
      { term: 'FREE', weight: 1.1, reason: 'All-caps promotional trigger' },
      { term: '!!!', weight: 0.6, reason: 'Excessive punctuation' },
      { term: 'act now', weight: 0.7, reason: 'Urgency phrase' },
    ],
  },
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
        : 'var(--wp-text-dim)';
}

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

type RunPhase = 'idle' | 'running' | 'done';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusTools(): JSX.Element {
  const d = MOCK;
  const [selected, setSelected] = useState<string>(d.mailboxes[0]?.id ?? '');
  const [phase, setPhase] = useState<RunPhase>('done');
  const [resolved, setResolved] = useState<number>(d.run.total);

  // Simulated run — purely local, no timers persisted; deterministic visual.
  const startRun = () => {
    setPhase('running');
    setResolved(0);
    let count = 0;
    const tick = () => {
      count += Math.max(1, Math.round(d.run.total / 12));
      if (count >= d.run.total) {
        setResolved(d.run.total);
        setPhase('done');
        return;
      }
      setResolved(count);
      window.setTimeout(tick, 280);
    };
    window.setTimeout(tick, 360);
  };

  const resetRun = () => {
    setPhase('idle');
    setResolved(0);
  };

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
              Tools Workbench
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Inbox-delivery tooling — inbox testing across 30 live seeds,
            content scoring, template authoring and warmup preview.
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

      {/* Inbox Test — the centerpiece */}
      <motion.div {...fade(0.06)}>
        <Card noShimmer>
          <CardContent className="p-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent4/10 text-accent4">
                  <Target className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-text">
                      Inbox Tester
                    </h2>
                    <span className="rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
                      Pro Plus
                    </span>
                  </div>
                  <p className="text-xs text-text-dim">
                    Probe 30 real seed inboxes across Gmail / Outlook / Yahoo
                    and see exactly where you land.
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs text-text-dim">
                <CheckCircle2 className="h-3 w-3 text-accent" />
                30 seeds healthy
              </span>
            </header>

            <div className="grid grid-cols-1 gap-0 lg:grid-cols-12">
              {/* Run panel */}
              <div className="space-y-4 border-b border-border-muted p-5 lg:col-span-4 lg:border-b-0 lg:border-r">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-text-dim">
                    Mailbox under test
                  </label>
                  <div className="space-y-1.5">
                    {d.mailboxes.map((m) => {
                      const active = m.id === selected;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelected(m.id)}
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
                          <span className="min-w-0 flex-1 truncate">
                            {m.email}
                          </span>
                          <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-dim">
                            {m.provider}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full"
                  onClick={startRun}
                  disabled={phase === 'running'}
                  isLoading={phase === 'running'}
                  leftIcon={phase !== 'running' ? <Play className="h-4 w-4" /> : undefined}
                >
                  {phase === 'running' ? 'Sending probes…' : 'Run inbox test'}
                </Button>

                {phase !== 'idle' ? (
                  <button
                    type="button"
                    onClick={resetRun}
                    className="flex w-full items-center justify-center gap-1.5 text-xs text-text-dim transition-colors hover:text-text"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                ) : null}

                <div className="rounded-lg border border-border-muted bg-surface-2 p-3 text-xs text-text-dim">
                  Probes are sent from the system seed network — Inbox vs
                  Promotions vs Spam is read back from each seed mailbox via
                  IMAP within ~90s.
                </div>
              </div>

              {/* Results / progress */}
              <div className="p-5 lg:col-span-8">
                <AnimatePresence mode="wait">
                  {phase === 'running' ? (
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
                  ) : phase === 'done' ? (
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
                            {d.run.total} seeds ·{' '}
                            {formatDateTime(d.run.completedAt)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-accent">
                          {pct(overall.inbox, d.run.total)}% inbox
                        </span>
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-medium text-text-dim">
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
                                {overall[b]} ({pct(overall[b], d.run.total)}%)
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
                        <div className="mb-2 text-xs font-medium text-text-dim">
                          30-seed heatmap
                        </div>
                        <SeedGrid seeds={d.run.seeds} revealed={d.run.total} />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent4/10 text-accent4">
                        <Target className="h-7 w-7" />
                      </span>
                      <p className="max-w-sm text-sm text-text-dim">
                        Pick a mailbox and run an inbox test. Results break
                        down Inbox / Promotions / Spam per provider with a live
                        30-seed heatmap.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Run history */}
      <motion.div {...fade(0.12)}>
        <Card noShimmer>
          <CardContent className="p-0">
            <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
              <h3 className="text-sm font-semibold text-text">
                Recent inbox tests
              </h3>
              <span className="text-xs text-text-dim">
                {d.history.length} runs
              </span>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-muted text-xs uppercase tracking-wide text-text-dim">
                    <th className="px-5 py-2.5 text-left font-medium">When</th>
                    <th className="px-5 py-2.5 text-left font-medium">
                      Mailbox
                    </th>
                    <th className="px-5 py-2.5 text-right font-medium">Seeds</th>
                    <th className="px-5 py-2.5 text-right font-medium">Inbox</th>
                    <th className="px-5 py-2.5 text-right font-medium">Spam</th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.map((h, i) => (
                    <motion.tr
                      key={h.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: 0.14 + i * 0.05 }}
                      className="border-b border-border-muted last:border-0"
                    >
                      <td className="px-5 py-3 text-text-dim">{h.when}</td>
                      <td className="px-5 py-3 text-text">{h.mailbox}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-text-dim">
                        {h.seeds}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-accent">
                        {h.inboxPct}%
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-accent3">
                        {h.spamPct}%
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Supporting tools */}
      <motion.div {...fade(0.18)} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SpamScannerCard result={d.scanner} />
        <TemplateDesignerCard />
        <WarmupPreviewCard />
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
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
    <div className="rounded-xl border border-border-muted bg-surface-2 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">
          {PROVIDER_LABEL[provider]}
        </h4>
        <span className="text-xs text-text-dim">{total} seeds</span>
      </div>
      <StackedBar
        breakdown={breakdown}
        total={Math.max(total, 1)}
        height={10}
      />
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
    <div className="flex flex-wrap gap-1.5">
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
                : { scale: 0.85, opacity: 0.35 }
            }
            transition={{ duration: 0.25, delay: animate ? i * 0.015 : 0 }}
            className="flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-bold"
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

function ToolHeader({
  Icon,
  name,
  desc,
  tone,
}: {
  Icon: LucideIcon;
  name: string;
  desc: string;
  tone: string;
}) {
  return (
    <header className="flex items-start gap-3">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: `${tone}1a`, color: tone }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-text">{name}</h3>
        <p className="text-xs text-text-dim">{desc}</p>
      </div>
    </header>
  );
}

function SpamScannerCard({ result }: { result: ScannerResult }) {
  const tone =
    result.score < 3 ? C.accent : result.score < 6 ? C.accent4 : C.accent3;
  const toneClass =
    result.score < 3
      ? 'text-accent'
      : result.score < 6
        ? 'text-accent4'
        : 'text-accent3';
  // Gauge fill 0–10 mapped to 0–100%.
  const fillPct = Math.min(100, (result.score / 10) * 100);

  return (
    <Card noShimmer className="h-full">
      <CardContent className="space-y-4 p-5">
        <ToolHeader
          Icon={Wand2}
          name="Spam Scanner"
          desc="SpamAssassin-style content scoring"
          tone={C.accent3}
        />
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke="var(--wp-border-muted)"
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
              <span className={`text-lg font-semibold tabular-nums ${toneClass}`}>
                {result.score}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-text-dim">
                / 10
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${toneClass}`}>
              {result.verdict}
            </p>
            <p className="mt-0.5 text-xs text-text-dim">
              Lower is better. Below 5 generally lands in the inbox.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-text-dim">
            Flagged terms
          </div>
          {result.flagged.map((f, i) => (
            <motion.div
              key={f.term}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: 0.2 + i * 0.05 }}
              className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs"
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
      </CardContent>
    </Card>
  );
}

function TemplateDesignerCard() {
  return (
    <Card noShimmer className="h-full">
      <CardContent className="space-y-4 p-5">
        <ToolHeader
          Icon={FileEdit}
          name="Template Designer"
          desc="Author & preview warmup messages"
          tone={C.accent}
        />
        <div className="overflow-hidden rounded-lg border border-border-muted bg-surface-2">
          <div className="flex items-center gap-2 border-b border-border-muted px-3 py-2 text-xs text-text-dim">
            <Mail className="h-3 w-3" />
            Quick sync re: Q3 roadmap
          </div>
          <div className="space-y-2 p-3 text-xs leading-relaxed text-text-dim">
            <p className="text-text">Hi {'{{first_name}}'},</p>
            <p>
              Wanted to circle back on the roadmap doc — the timeline looks
              solid. Got 15 minutes this week to walk through it?
            </p>
            <p>Thanks,</p>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="block h-3 w-24 rounded bg-border-muted"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Plain', 'HTML', 'AI variants'].map((t, i) => (
            <span
              key={t}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                i === 0
                  ? 'border-accent/30 bg-accent/10 text-accent'
                  : 'border-border-muted bg-surface-2 text-text-dim'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
        <Button variant="secondary" size="sm" className="w-full">
          Open designer
        </Button>
      </CardContent>
    </Card>
  );
}

function WarmupPreviewCard() {
  const samples = [
    { from: 'priya@seed-net.io', subject: 'Re: intro call follow-up', tag: 'reply' },
    { from: 'dan@seed-net.io', subject: 'Thoughts on the proposal', tag: 'open' },
    { from: 'lee@seed-net.io', subject: 'Quick question on pricing', tag: 'star' },
  ];
  const TAG_TONE: Record<string, string> = {
    reply: 'text-accent',
    open: 'text-accent2',
    star: 'text-accent4',
  };
  return (
    <Card noShimmer className="h-full">
      <CardContent className="space-y-4 p-5">
        <ToolHeader
          Icon={Eye}
          name="Warmup Preview"
          desc="Sample messages — nothing is sent"
          tone={C.accent2}
        />
        <div className="space-y-2">
          {samples.map((s, i) => (
            <motion.div
              key={s.from}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.22 + i * 0.06 }}
              className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-xs text-text-dim">
                  {s.from}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${TAG_TONE[s.tag]}`}
                >
                  {s.tag}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-text">
                {s.subject}
              </p>
            </motion.div>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs text-text-dim">
          <Gauge className="h-3.5 w-3.5 text-accent2" />
          Generated by the live content factory
        </div>
        <Button variant="secondary" size="sm" className="w-full">
          Preview a mailbox
        </Button>
      </CardContent>
    </Card>
  );
}

export default ProPlusTools;
