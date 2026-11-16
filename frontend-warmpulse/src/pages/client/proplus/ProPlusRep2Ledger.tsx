import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpenCheck,
  Globe,
  Mail,
  Minus,
  Plus,
  Radio,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import { formatDate } from '@/lib/format';

/**
 * ProPlusRep2Ledger — "Trust Ledger" (Pro Plus reputation differentiator).
 *
 * An accounting-register take on sender reputation: trust is a running
 * BALANCE, and every reputation event is a double-entry-style line — a
 * credit (+) or a debit (−) posted against that balance. The centrepiece
 * is a chronological ledger table, NOT a card dashboard, NOT a NOC ops /
 * status board, NOT a node-link signal map, NOT an audit checklist
 * (sibling agents own those shapes).
 *
 * Standalone for the isolated preview harness: NO network / router / query
 * hooks, NO required props, inline MOCK. Renders ONLY page content — the
 * harness supplies the shell + sidebar.
 *
 * Page layout (top → bottom):
 *   1. Header band — title, Pro Plus chip, "books open" live pill
 *   2. Trust Balance hero — big balance count-up + tier word + balance
 *      trend area sparkline + "this period: +N"
 *   3. Period summary band — total credits / total debits / net /
 *      biggest single swing (all reduced from the entries)
 *   4. Per-source subtotal breakdown — DNS / Postmaster / SNDS / Blacklist
 *      net contribution bars (reduced from the entries by source)
 *   5. The ledger register — chronological table, each row a credit or
 *      debit with [Date · Event · Source · Impact ±pts · Running balance].
 *      Running balance is folded forward from an opening balance.
 *
 * Postmaster + SNDS entries are tagged as LIVE-FED (the Pro Plus unlock):
 * those source pills carry a pulsing link dot; DNS / Blacklist are probed.
 *
 * Accounting integrity: running balance, period totals and per-source
 * subtotals are all computed from the raw entries via real reduce — the
 * closing balance equals openingBalance + Σ(delta). Nothing is hardcoded.
 *
 * Colour: existing Tailwind tokens only. credit → accent, debit → accent3,
 * neutral / scaffolding → accent4. Recharts pulls the same RGBs the token
 * palette uses so the sparkline stays on-palette.
 */

// ---------------------------------------------------------------------------
// Palette — token RGBs (mirrors tailwind.config.ts; no new colours).
// ---------------------------------------------------------------------------

const C = {
  credit: 'rgb(242, 101, 34)', // text-accent  — credit / gain
  debit: 'rgb(255, 107, 74)', // text-accent3 — debit / loss
  neutral: 'rgb(255, 213, 79)', // text-accent4 — neutral / scaffold
  muted: 'rgb(136, 136, 160)',
  grid: 'rgb(42, 42, 58)',
} as const;

type SourceKey = 'dns' | 'postmaster' | 'snds' | 'blacklist';

interface SourceMeta {
  label: string;
  short: string;
  Icon: typeof Globe;
  /** true => Pro Plus external feed (live link dot on the source pill). */
  live: boolean;
}

const SOURCES: Record<SourceKey, SourceMeta> = {
  dns: { label: 'Domain records (DNS) authentication', short: 'DNS', Icon: Globe, live: false },
  postmaster: {
    label: 'Google Postmaster',
    short: 'Postmaster',
    Icon: Mail,
    live: true,
  },
  snds: { label: 'Microsoft SNDS', short: 'SNDS', Icon: Radio, live: true },
  blacklist: {
    label: 'Block-list monitor',
    short: 'Block list',
    Icon: ShieldCheck,
    live: false,
  },
};

const SOURCE_ORDER: SourceKey[] = ['dns', 'postmaster', 'snds', 'blacklist'];

// ---------------------------------------------------------------------------
// Mock data — raw ledger entries. EVERYTHING derived (running balance,
// totals, subtotals) is reduced from these; only the opening balance and
// the per-entry deltas are authored.
// ---------------------------------------------------------------------------

interface RawEntry {
  id: string;
  /** ISO date — entries authored newest-first; we sort + fold ascending. */
  date: string;
  event: string;
  source: SourceKey;
  /** Signed point impact on the trust balance. + credit, − debit. */
  delta: number;
}

/** Opening trust balance carried forward from the prior period. */
const OPENING_BALANCE = 85;

/** ~22 reputation events over the period, authored newest → oldest. */
const RAW_ENTRIES: RawEntry[] = [
  { id: 'L01', date: '2026-05-18', event: 'Postmaster domain trust held High', source: 'postmaster', delta: 2 },
  { id: 'L02', date: '2026-05-17', event: 'DKIM key rotated & re-verified (2048-bit)', source: 'dns', delta: 8 },
  { id: 'L03', date: '2026-05-16', event: 'SNDS complaint-rate breach 0.31% > 0.30%', source: 'snds', delta: -5 },
  { id: 'L04', date: '2026-05-16', event: 'SNDS segment quarantined → rate recovered', source: 'snds', delta: 4 },
  { id: 'L05', date: '2026-05-15', event: 'Spamhaus ZEN clear sweep (3 IPs)', source: 'blacklist', delta: 3 },
  { id: 'L06', date: '2026-05-14', event: 'Postmaster spam rate fell 0.09% → 0.03%', source: 'postmaster', delta: 6 },
  { id: 'L07', date: '2026-05-13', event: 'DMARC alignment drift on success@acme.io', source: 'dns', delta: -4 },
  { id: 'L08', date: '2026-05-13', event: 'DMARC auto-corrected via domain records (DNS) push', source: 'dns', delta: 4 },
  { id: 'L09', date: '2026-05-12', event: 'Postmaster IP trust rose Medium → High', source: 'postmaster', delta: 5 },
  { id: 'L10', date: '2026-05-11', event: 'SORBS DUHL dynamic-range flag (acme.co)', source: 'blacklist', delta: -3 },
  { id: 'L11', date: '2026-05-10', event: 'Barracuda BRBL clear sweep', source: 'blacklist', delta: 2 },
  { id: 'L12', date: '2026-05-09', event: 'SNDS IP status confirmed Green tier', source: 'snds', delta: 3 },
  { id: 'L13', date: '2026-05-08', event: 'SPF lookup count flattened 9 → 6', source: 'dns', delta: 3 },
  { id: 'L14', date: '2026-05-07', event: 'Postmaster auth pass rate reached 99.6%', source: 'postmaster', delta: 4 },
  { id: 'L15', date: '2026-05-06', event: 'Spam-trap hit on legacy list segment', source: 'snds', delta: -6 },
  { id: 'L16', date: '2026-05-05', event: 'Trap source list purged & suppressed', source: 'snds', delta: 5 },
  { id: 'L17', date: '2026-05-04', event: 'SpamCop SCBL clear sweep', source: 'blacklist', delta: 2 },
  { id: 'L18', date: '2026-05-03', event: 'DKIM selector published on acme.co', source: 'dns', delta: 4 },
  { id: 'L19', date: '2026-05-02', event: 'Postmaster feed connected — data flowing', source: 'postmaster', delta: 3 },
  { id: 'L20', date: '2026-05-01', event: 'Microsoft SNDS feed connected — IP data', source: 'snds', delta: 3 },
  { id: 'L21', date: '2026-04-30', event: 'Spamhaus DBL domain clear (acme.co)', source: 'blacklist', delta: 2 },
  { id: 'L22', date: '2026-04-29', event: 'DMARC policy moved p=none → p=quarantine', source: 'dns', delta: 5 },
];

const MAILBOX_COUNT = 15;

// ---------------------------------------------------------------------------
// Derivations — pure reduces over RAW_ENTRIES. Nothing below is hardcoded.
// ---------------------------------------------------------------------------

interface PostedEntry extends RawEntry {
  /** Sequence number in posting (chronological) order, 1-based. */
  seq: number;
  /** Balance AFTER this entry is posted. */
  runningBalance: number;
}

interface SourceSubtotal {
  key: SourceKey;
  credits: number;
  debits: number;
  net: number;
  count: number;
}

interface PeriodSummary {
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  net: number;
  entryCount: number;
  biggestSwing: PostedEntry;
}

interface LedgerModel {
  /** Chronological (oldest → newest) with running balance folded forward. */
  ascending: PostedEntry[];
  /** Newest → oldest for the register display. */
  descending: PostedEntry[];
  balanceSeries: { i: number; balance: number }[];
  subtotals: SourceSubtotal[];
  summary: PeriodSummary;
}

function buildLedger(rows: RawEntry[], opening: number): LedgerModel {
  // 1. Sort ascending (stable) so the running balance folds forward in time.
  const sorted = [...rows].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  // 2. Fold the balance forward via reduce — closing = opening + Σ delta.
  const ascending = sorted.reduce<PostedEntry[]>((acc, row, idx) => {
    const prev = acc[idx - 1]?.runningBalance ?? opening;
    acc.push({ ...row, seq: idx + 1, runningBalance: prev + row.delta });
    return acc;
  }, []);

  const closingBalance =
    ascending[ascending.length - 1]?.runningBalance ?? opening;

  // 3. Balance trend series (seed with the opening point) for the sparkline.
  const balanceSeries = ascending.reduce<{ i: number; balance: number }[]>(
    (acc, e) => {
      acc.push({ i: e.seq, balance: e.runningBalance });
      return acc;
    },
    [{ i: 0, balance: opening }],
  );

  // 4. Per-source subtotals — reduced from the raw deltas, not authored.
  const subtotals = SOURCE_ORDER.map<SourceSubtotal>((key) => {
    const slice = rows.filter((r) => r.source === key);
    return slice.reduce<SourceSubtotal>(
      (acc, r) => {
        if (r.delta >= 0) acc.credits += r.delta;
        else acc.debits += -r.delta;
        acc.net += r.delta;
        acc.count += 1;
        return acc;
      },
      { key, credits: 0, debits: 0, net: 0, count: 0 },
    );
  });

  // 5. Period summary — totals + biggest single swing by |delta|.
  const totals = rows.reduce(
    (acc, r) => {
      if (r.delta >= 0) acc.totalCredits += r.delta;
      else acc.totalDebits += -r.delta;
      return acc;
    },
    { totalCredits: 0, totalDebits: 0 },
  );

  const biggestSwing = ascending.reduce((max, e) =>
    Math.abs(e.delta) > Math.abs(max.delta) ? e : max,
  );

  return {
    ascending,
    descending: [...ascending].reverse(),
    balanceSeries,
    subtotals,
    summary: {
      openingBalance: opening,
      closingBalance,
      totalCredits: totals.totalCredits,
      totalDebits: totals.totalDebits,
      net: totals.totalCredits - totals.totalDebits,
      entryCount: rows.length,
      biggestSwing,
    },
  };
}

const LEDGER = buildLedger(RAW_ENTRIES, OPENING_BALANCE);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;
}

function balanceTier(score: number): { word: string; cls: string } {
  if (score >= 90) return { word: 'Excellent', cls: 'text-accent' };
  if (score >= 75) return { word: 'Strong', cls: 'text-accent' };
  if (score >= 55) return { word: 'Fair', cls: 'text-accent4' };
  return { word: 'At risk', cls: 'text-accent3' };
}

const TOOLTIP_STYLE = {
  background: 'rgb(26, 26, 38)',
  border: `1px solid ${C.grid}`,
  borderRadius: 10,
  fontSize: 12,
  color: 'rgb(232, 232, 240)',
} as const;

/** Eased integer count-up — runs once when `run` flips true. */
function useCountUp(target: number, run: boolean, ms = 1200): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return val;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusRep2Ledger(): JSX.Element {
  const { descending, balanceSeries, subtotals, summary } = LEDGER;

  const heroRef = useRef<HTMLDivElement>(null);
  const heroIn = useInView(heroRef, { once: true, amount: 0.4 });

  const tier = balanceTier(summary.closingBalance);

  // Largest absolute subtotal net → normalises the subtotal bar widths.
  const maxAbsNet = useMemo(
    () => Math.max(1, ...subtotals.map((s) => Math.abs(s.net))),
    [subtotals],
  );

  const liveSourceCount = useMemo(
    () => SOURCE_ORDER.filter((k) => SOURCES[k].live).length,
    [],
  );

  return (
    <div className="space-y-5">
      {/* ───────── Header band ───────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-accent">
              <BookOpenCheck className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-text">
                  Trust Ledger
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
                  <Sparkles className="h-3 w-3" />
                  Pro Plus
                </span>
              </div>
              <p className="text-sm text-text-dim">
                Double-entry sender-trust register — every signal posts a credit
                or debit against your trust balance across {MAILBOX_COUNT}{' '}
                mailboxes.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-xs">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">Books open</span>
          <span className="text-border-muted">·</span>
          <span className="text-text-dim">
            {liveSourceCount} live-fed sources
          </span>
        </div>
      </motion.header>

      {/* ───────── Trust Balance hero ───────── */}
      <motion.div
        ref={heroRef}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="relative overflow-hidden rounded-xl border border-border-muted bg-surface"
      >
        {/* Ruled-paper backdrop — accountant's ledger sheet */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px)`,
            backgroundSize: '100% 34px',
            maskImage:
              'linear-gradient(90deg, black, black 60%, transparent)',
          }}
        />
        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center">
          {/* Balance figure */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-text-dim">
              <Scale className="h-3.5 w-3.5" />
              Current trust balance
            </div>
            <div className="mt-2 flex items-end gap-3">
              <BalanceCountUp
                target={summary.closingBalance}
                run={heroIn}
              />
              <span className="mb-1 text-lg text-text-dim">/ 100</span>
              <span
                className={`mb-1.5 inline-flex items-center gap-1 rounded-full border border-border-muted bg-surface-2 px-2.5 py-1 text-xs font-semibold ${tier.cls}`}
              >
                {tier.word}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-text-dim">
                Opening
                <span className="font-mono font-semibold text-text">
                  {summary.openingBalance}
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold ${
                  summary.net >= 0
                    ? 'border-accent/30 bg-accent/10 text-accent'
                    : 'border-accent3/30 bg-accent3/10 text-accent3'
                }`}
              >
                {summary.net >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                this period {signed(summary.net)} pts
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface-2 px-2 py-1 text-text-dim">
                {summary.entryCount} entries posted
              </span>
            </div>
          </div>

          {/* Balance trend sparkline */}
          <div className="lg:col-span-7">
            <div className="mb-1.5 flex items-center justify-between text-xs text-text-dim">
              <span>Balance trend (folded forward)</span>
              <span className="flex items-center gap-1 text-accent">
                <TrendingUp className="h-3 w-3" />
                {summary.openingBalance} → {summary.closingBalance}
              </span>
            </div>
            <div className="h-[132px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={balanceSeries}
                  margin={{ top: 6, right: 6, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="rep2-bal"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={C.credit}
                        stopOpacity={0.4}
                      />
                      <stop
                        offset="100%"
                        stopColor={C.credit}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <YAxis
                    domain={['dataMin - 4', 'dataMax + 4']}
                    tick={{ fill: C.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={34}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ stroke: C.grid }}
                    labelFormatter={(v) =>
                      v === 0 ? 'Opening' : `Entry ${v}`
                    }
                    formatter={(v: number) => [`${v} pts`, 'Balance']}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={C.credit}
                    strokeWidth={2}
                    fill="url(#rep2-bal)"
                    isAnimationActive
                    animationDuration={1100}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ───────── Period summary band ───────── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.12 }}
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
      >
        <SummaryTile
          label="Total credits"
          value={`+${summary.totalCredits}`}
          note="trust gained"
          tone="credit"
          Icon={Plus}
        />
        <SummaryTile
          label="Total debits"
          value={`−${summary.totalDebits}`}
          note="trust lost"
          tone="debit"
          Icon={Minus}
        />
        <SummaryTile
          label="Net this period"
          value={signed(summary.net)}
          note={summary.net >= 0 ? 'balance grew' : 'balance fell'}
          tone={summary.net >= 0 ? 'credit' : 'debit'}
          Icon={summary.net >= 0 ? ArrowUpRight : ArrowDownRight}
        />
        <SummaryTile
          label="Biggest single swing"
          value={signed(summary.biggestSwing.delta)}
          note={SOURCES[summary.biggestSwing.source].short}
          tone={summary.biggestSwing.delta >= 0 ? 'credit' : 'debit'}
          Icon={summary.biggestSwing.delta >= 0 ? ArrowUpRight : ArrowDownRight}
        />
      </motion.div>

      {/* ───────── Layout: subtotals (left) + ledger register (right) ───── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Per-source subtotal breakdown */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="overflow-hidden rounded-xl border border-border-muted bg-surface xl:col-span-4"
        >
          <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Contribution by source
              </h3>
            </div>
            <span className="font-mono text-[11px] text-text-dim">
              net pts
            </span>
          </header>
          <div className="space-y-3 p-5">
            {subtotals.map((s, i) => {
              const meta = SOURCES[s.key];
              const positive = s.net >= 0;
              const widthPct = (Math.abs(s.net) / maxAbsNet) * 100;
              return (
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.22 + i * 0.06 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-text">
                      <meta.Icon className="h-3.5 w-3.5 text-text-dim" />
                      <span className="font-medium">{meta.short}</span>
                      {meta.live && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent"
                          title="Live external feed (Pro Plus)"
                        >
                          <span className="relative inline-flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                          </span>
                          live
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        positive ? 'text-accent' : 'text-accent3'
                      }`}
                    >
                      {signed(s.net)}
                    </span>
                  </div>
                  {/* Diverging bar around a centre baseline */}
                  <div className="relative h-2 rounded-full bg-surface-2">
                    <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-border-muted" />
                    <motion.div
                      className={`absolute top-0 h-full rounded-full ${
                        positive ? 'bg-accent' : 'bg-accent3'
                      }`}
                      style={
                        positive
                          ? { left: '50%' }
                          : { right: '50%' }
                      }
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct / 2}%` }}
                      transition={{
                        duration: 0.7,
                        ease: 'easeOut',
                        delay: 0.28 + i * 0.06,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-text-dim">
                    <span>{meta.label}</span>
                    <span>
                      <span className="text-accent">+{s.credits}</span>
                      {' / '}
                      <span className="text-accent3">−{s.debits}</span>
                      {' · '}
                      {s.count} {s.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border-muted px-5 py-3 text-[11px] text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <Radio className="h-3 w-3 text-accent" />
              Postmaster + SNDS streamed live
            </span>
            <span className="font-mono">
              Σ {signed(subtotals.reduce((a, s) => a + s.net, 0))}
            </span>
          </div>
        </motion.section>

        {/* The ledger register */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="overflow-hidden rounded-xl border border-border-muted bg-surface xl:col-span-8"
        >
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-muted px-5 py-4">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Sender-trust ledger
              </h3>
            </div>
            <span className="font-mono text-[11px] text-text-dim">
              {summary.entryCount} entries · newest first · bal folds forward
            </span>
          </header>

          {/* Column header — accounting register */}
          <div className="grid grid-cols-[64px_1fr_104px_64px_72px] items-center gap-2 border-b border-border-muted bg-surface-2/60 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            <span>Date</span>
            <span>Event</span>
            <span>Source</span>
            <span className="text-right">Impact</span>
            <span className="text-right">Balance</span>
          </div>

          <ul className="divide-y divide-border-muted">
            {descending.map((e, i) => {
              const meta = SOURCES[e.source];
              const credit = e.delta >= 0;
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.28,
                    delay: 0.24 + i * 0.035,
                  }}
                  className="grid grid-cols-[64px_1fr_104px_64px_72px] items-center gap-2 px-5 py-2.5"
                >
                  {/* Date */}
                  <span className="font-mono text-[11px] tabular-nums text-text-dim">
                    {fmtDate(e.date)}
                  </span>

                  {/* Event — leading +/− glyph in a tinted chip */}
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                        credit
                          ? 'bg-accent/15 text-accent'
                          : 'bg-accent3/15 text-accent3'
                      }`}
                      aria-hidden
                    >
                      {credit ? (
                        <Plus className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                    </span>
                    <span className="truncate text-[13px] text-text">
                      {e.event}
                    </span>
                  </span>

                  {/* Source pill — live dot for Postmaster / SNDS */}
                  <span
                    className="inline-flex items-center gap-1 truncate rounded-md border border-border-muted bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-dim"
                    title={meta.label}
                  >
                    {meta.live ? (
                      <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                      </span>
                    ) : (
                      <meta.Icon className="h-2.5 w-2.5 shrink-0" />
                    )}
                    <span className="truncate">{meta.short}</span>
                  </span>

                  {/* Impact chip — pops in */}
                  <div className="flex justify-end">
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        duration: 0.32,
                        delay: 0.3 + i * 0.035,
                        type: 'spring',
                        stiffness: 320,
                        damping: 18,
                      }}
                      className={`inline-flex min-w-[44px] items-center justify-center gap-0.5 rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${
                        credit
                          ? 'border-accent/30 bg-accent/10 text-accent'
                          : 'border-accent3/30 bg-accent3/10 text-accent3'
                      }`}
                    >
                      {signed(e.delta)}
                    </motion.span>
                  </div>

                  {/* Running balance */}
                  <span className="text-right font-mono text-xs font-semibold tabular-nums text-text">
                    {e.runningBalance}
                  </span>
                </motion.li>
              );
            })}
          </ul>

          {/* Closing footer — opening + Σ delta = closing */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-muted bg-surface-2/40 px-5 py-3 text-xs">
            <span className="flex items-center gap-2 text-text-dim">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                credit
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-accent3" />
                debit
              </span>
            </span>
            <span className="font-mono text-text-dim">
              opening{' '}
              <span className="font-semibold text-text">
                {summary.openingBalance}
              </span>{' '}
              <span className="text-accent">+{summary.totalCredits}</span>{' '}
              <span className="text-accent3">−{summary.totalDebits}</span> ={' '}
              <span className="font-semibold text-text">
                {summary.closingBalance}
              </span>{' '}
              closing
            </span>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Eased integer count-up — drives the big trust-balance figure. */
function BalanceCountUp({
  target,
  run,
}: {
  target: number;
  run: boolean;
}): JSX.Element {
  const v = useCountUp(target, run);
  return (
    <motion.span
      className="font-mono text-5xl font-semibold leading-none tabular-nums text-text"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {v}
    </motion.span>
  );
}

function SummaryTile({
  label,
  value,
  note,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: 'credit' | 'debit';
  Icon: typeof Plus;
}): JSX.Element {
  const cls = tone === 'credit' ? 'text-accent' : 'text-accent3';
  return (
    <div className="rounded-xl border border-border-muted bg-surface p-4">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-text-dim">
        <span className="truncate">{label}</span>
        <Icon className={`h-4 w-4 ${cls}`} />
      </div>
      <div
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${cls}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-text-dim">{note}</div>
    </div>
  );
}

export default ProPlusRep2Ledger;
