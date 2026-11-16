import { useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  CircleDot,
  Flame,
  Gauge,
  PauseCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

/**
 * ProPlusMbx1Kanban — a Kanban *board* of warmup mailboxes for the Pro Plus
 * tier (15-mailbox cap).
 *
 * Deliberately NOT the other three mailbox layouts:
 *   - StarterMailboxes  = split-pane identity-rail + tabbed detail (1 mailbox)
 *   - ProMailboxes      = single-hero carousel + thumbnail strip
 *   - ProPlusMailboxes  = stat strip + filter/sort toolbar + uniform card GRID
 *
 * This is a horizontally-scrolling lifecycle BOARD: mailboxes are sorted into
 * five fixed columns by where they sit in the 28-day ramp ("Ramping",
 * "Maturing", "Steady") plus health buckets ("Needs attention", "Paused").
 * Each column owns a sticky header with a live count + the aggregate average
 * warmth of just that column. Cards stack vertically inside their column,
 * stagger in per-column, lift on hover (kanban grab feel), and a clicked card
 * gets a framer-motion `layout` highlight + promotes a slim inspector strip at
 * the foot of the board. Pure local state — no DnD lib, no network, no router.
 *
 * Standalone: inline MOCK only, renders page content (the harness shell owns
 * the sidebar/nav chrome).
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

type Provider = 'gmail' | 'outlook' | 'smtp' | 'yahoo';
type Health = 'healthy' | 'warming' | 'attention' | 'paused';

interface Mailbox {
  id: string;
  email: string;
  provider: Provider;
  warmth: number;
  delta: number;
  day: number;
  sentToday: number;
  target: number;
  health: Health;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  spark: number[];
}

// ---------------------------------------------------------------------------
// Mock data — 14 mailboxes, every column populated, avg warmth ~84
// ---------------------------------------------------------------------------

function spark(base: number, drift: number): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const v = base - drift + (drift / 15) * i + Math.sin(i * 1.05 + base) * 2.1;
    return Math.round(Math.max(0, Math.min(100, v)));
  });
}

const MOCK: Mailbox[] = [
  // ---- Steady (D29+) ----
  {
    id: 'mb-01',
    email: 'founder@acme.io',
    provider: 'gmail',
    warmth: 92,
    delta: 0.9,
    day: 41,
    sentToday: 71,
    target: 75,
    health: 'healthy',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(92, 6),
  },
  {
    id: 'mb-02',
    email: 'sales@acme.io',
    provider: 'outlook',
    warmth: 90,
    delta: 1.3,
    day: 36,
    sentToday: 66,
    target: 70,
    health: 'healthy',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(90, 7),
  },
  {
    id: 'mb-03',
    email: 'team@acme.io',
    provider: 'gmail',
    warmth: 88,
    delta: 1.7,
    day: 33,
    sentToday: 58,
    target: 65,
    health: 'healthy',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(88, 8),
  },
  {
    id: 'mb-04',
    email: 'hello@acme.co',
    provider: 'smtp',
    warmth: 86,
    delta: 1.1,
    day: 30,
    sentToday: 54,
    target: 60,
    health: 'healthy',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(86, 7),
  },
  // ---- Maturing (D15–28) ----
  {
    id: 'mb-05',
    email: 'partnerships@acme.io',
    provider: 'outlook',
    warmth: 85,
    delta: 2.4,
    day: 27,
    sentToday: 50,
    target: 58,
    health: 'healthy',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(85, 10),
  },
  {
    id: 'mb-06',
    email: 'success@acme.io',
    provider: 'gmail',
    warmth: 83,
    delta: 2.0,
    day: 23,
    sentToday: 46,
    target: 55,
    health: 'healthy',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(83, 9),
  },
  {
    id: 'mb-07',
    email: 'careers@acme.io',
    provider: 'yahoo',
    warmth: 80,
    delta: 1.5,
    day: 19,
    sentToday: 41,
    target: 50,
    health: 'warming',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(80, 8),
  },
  {
    id: 'mb-08',
    email: 'support@acme.co',
    provider: 'smtp',
    warmth: 78,
    delta: 2.2,
    day: 16,
    sentToday: 37,
    target: 48,
    health: 'warming',
    spf: true,
    dkim: true,
    dmarc: false,
    spark: spark(78, 11),
  },
  // ---- Ramping (D1–14) ----
  {
    id: 'mb-09',
    email: 'growth@acme.io',
    provider: 'gmail',
    warmth: 74,
    delta: 3.1,
    day: 12,
    sentToday: 24,
    target: 35,
    health: 'warming',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(74, 13),
  },
  {
    id: 'mb-10',
    email: 'billing@acme.co',
    provider: 'outlook',
    warmth: 68,
    delta: 2.8,
    day: 8,
    sentToday: 15,
    target: 20,
    health: 'warming',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(68, 12),
  },
  {
    id: 'mb-11',
    email: 'press@acme.co',
    provider: 'yahoo',
    warmth: 58,
    delta: 3.6,
    day: 4,
    sentToday: 8,
    target: 12,
    health: 'warming',
    spf: true,
    dkim: false,
    dmarc: false,
    spark: spark(58, 14),
  },
  // ---- Needs attention ----
  {
    id: 'mb-12',
    email: 'newsletter@acme.co',
    provider: 'smtp',
    warmth: 61,
    delta: -3.2,
    day: 21,
    sentToday: 12,
    target: 50,
    health: 'attention',
    spf: false,
    dkim: true,
    dmarc: true,
    spark: spark(61, -9),
  },
  {
    id: 'mb-13',
    email: 'noreply@acme.io',
    provider: 'gmail',
    warmth: 52,
    delta: -4.1,
    day: 9,
    sentToday: 3,
    target: 22,
    health: 'attention',
    spf: true,
    dkim: false,
    dmarc: false,
    spark: spark(52, -11),
  },
  // ---- Paused ----
  {
    id: 'mb-14',
    email: 'invoices@acme.co',
    provider: 'outlook',
    warmth: 46,
    delta: 0,
    day: 14,
    sentToday: 0,
    target: 30,
    health: 'paused',
    spf: true,
    dkim: true,
    dmarc: true,
    spark: spark(46, -2),
  },
];

const MAX_MAILBOXES = 15;

// ---------------------------------------------------------------------------
// Column model — stage derived from ramp day + health bucket
// ---------------------------------------------------------------------------

type ColumnKey = 'ramping' | 'maturing' | 'steady' | 'attention' | 'paused';

const COLUMNS: Array<{
  key: ColumnKey;
  title: string;
  hint: string;
  Icon: typeof Flame;
  tone: string; // text token for the icon + accent rule
  rule: string; // hex used for the column accent line
}> = [
  {
    key: 'ramping',
    title: 'Building up',
    hint: 'Day 1–14',
    Icon: TrendingUp,
    tone: 'text-accent2',
    rule: '#FF8A4B',
  },
  {
    key: 'maturing',
    title: 'Maturing',
    hint: 'Day 15–28',
    Icon: Flame,
    tone: 'text-accent4',
    rule: '#ffd54f',
  },
  {
    key: 'steady',
    title: 'Steady',
    hint: 'Day 29+',
    Icon: ShieldCheck,
    tone: 'text-accent',
    rule: '#F26522',
  },
  {
    key: 'attention',
    title: 'Needs attention',
    hint: 'Falling / domain record (DNS) gaps',
    Icon: X,
    tone: 'text-accent3',
    rule: '#ff6b4a',
  },
  {
    key: 'paused',
    title: 'Paused',
    hint: 'Warmup stopped',
    Icon: PauseCircle,
    tone: 'text-text-dim',
    rule: '#8888a0',
  },
];

function columnFor(m: Mailbox): ColumnKey {
  if (m.health === 'paused') return 'paused';
  if (m.health === 'attention') return 'attention';
  if (m.day >= 29) return 'steady';
  if (m.day >= 15) return 'maturing';
  return 'ramping';
}

// ---------------------------------------------------------------------------
// Helpers
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

const WARMTH_HEX = { high: '#F26522', mid: '#ffd54f', low: '#ff6b4a' } as const;

function warmthHex(score: number): string {
  if (score >= 75) return WARMTH_HEX.high;
  if (score >= 50) return WARMTH_HEX.mid;
  return WARMTH_HEX.low;
}

const HEALTH_DOT: Record<Health, string> = {
  healthy: '#F26522',
  warming: '#ffd54f',
  attention: '#ff6b4a',
  paused: '#8888a0',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusMbx1Kanban(): JSX.Element {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map: Record<ColumnKey, Mailbox[]> = {
      ramping: [],
      maturing: [],
      steady: [],
      attention: [],
      paused: [],
    };
    for (const m of MOCK) map[columnFor(m)].push(m);
    // Highest warmth first within each lane.
    for (const k of Object.keys(map) as ColumnKey[]) {
      map[k].sort((a, b) => b.warmth - a.warmth);
    }
    return map;
  }, []);

  const totals = useMemo(() => {
    const avg = Math.round(
      MOCK.reduce((a, m) => a + m.warmth, 0) / MOCK.length,
    );
    const active = MOCK.filter((m) => m.health !== 'paused').length;
    const sent = MOCK.reduce((a, m) => a + m.sentToday, 0);
    const target = MOCK.reduce((a, m) => a + m.target, 0);
    return { avg, active, sent, target };
  }, []);

  const focused = focusedId
    ? (MOCK.find((m) => m.id === focusedId) ?? null)
    : null;

  return (
    <LayoutGroup>
      <div className="flex h-full flex-col gap-5">
        {/* Slim board toolbar */}
        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-muted bg-surface/60 px-4 py-3 backdrop-blur-xl"
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-accent">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <h1 className="text-lg font-semibold tracking-tight text-text">
                  Mailbox board
                </h1>
                <p className="text-xs text-text-dim">
                  Lifecycle view · Pro Plus
                </p>
              </div>
            </div>
            <span className="hidden h-8 w-px bg-border-muted sm:block" />
            <ToolbarStat
              Icon={CircleDot}
              label="Mailboxes"
              value={`${MOCK.length}/${MAX_MAILBOXES}`}
            />
            <ToolbarStat
              Icon={Gauge}
              label="Avg warmth"
              value={String(totals.avg)}
            />
            <ToolbarStat
              Icon={Flame}
              label="Active"
              value={`${totals.active}/${MOCK.length}`}
            />
            <ToolbarStat
              Icon={ArrowUpRight}
              label="Sent today"
              value={`${totals.sent}/${totals.target}`}
            />
          </div>
          <Button variant="primary" size="sm">
            <Plus className="h-4 w-4" />
            Add mailbox
          </Button>
        </motion.header>

        {/* Kanban board — horizontal scroll on narrow widths */}
        <div className="min-h-0 flex-1 overflow-x-auto pb-2">
          <div className="flex h-full min-w-max gap-4">
            {COLUMNS.map((col, ci) => {
              const items = grouped[col.key];
              const colAvg =
                items.length > 0
                  ? Math.round(
                      items.reduce((a, m) => a + m.warmth, 0) / items.length,
                    )
                  : 0;
              return (
                <motion.section
                  key={col.key}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: 'easeOut',
                    delay: 0.08 + ci * 0.07,
                  }}
                  className="flex w-[286px] shrink-0 flex-col rounded-xl border border-border-muted bg-surface/40"
                >
                  {/* Column header (sticky within the scroll area) */}
                  <div
                    className="sticky top-0 z-10 rounded-t-xl border-b border-border-muted bg-surface/80 px-3.5 py-3 backdrop-blur-xl"
                    style={{ boxShadow: `inset 0 2px 0 0 ${col.rule}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <col.Icon className={`h-4 w-4 ${col.tone}`} />
                        <span className="text-sm font-semibold text-text">
                          {col.title}
                        </span>
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-text-dim">
                          {items.length}
                        </span>
                      </div>
                      {items.length > 0 && (
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{ color: warmthHex(colAvg) }}
                        >
                          {colAvg}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-dim">
                      {col.hint}
                      {items.length > 0 && (
                        <span className="text-text-dim"> · avg warmth</span>
                      )}
                    </p>
                  </div>

                  {/* Column body */}
                  <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
                    {items.length === 0 ? (
                      <EmptyColumn />
                    ) : (
                      items.map((m, i) => (
                        <MailboxCard
                          key={m.id}
                          m={m}
                          colIndex={ci}
                          rowIndex={i}
                          focused={focusedId === m.id}
                          onFocus={() =>
                            setFocusedId((cur) =>
                              cur === m.id ? null : m.id,
                            )
                          }
                        />
                      ))
                    )}
                  </div>
                </motion.section>
              );
            })}
          </div>
        </div>

        {/* Inspector strip — promoted when a card is focused */}
        <AnimatePresence>
          {focused && (
            <motion.div
              key={focused.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <Inspector m={focused} onClose={() => setFocusedId(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolbarStat({
  Icon,
  label,
  value,
}: {
  Icon: typeof Flame;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-text-dim" />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-wider text-text-dim">
          {label}
        </p>
        <p className="text-sm font-semibold tabular-nums text-text">{value}</p>
      </div>
    </div>
  );
}

function MailboxCard({
  m,
  colIndex,
  rowIndex,
  focused,
  onFocus,
}: {
  m: Mailbox;
  colIndex: number;
  rowIndex: number;
  focused: boolean;
  onFocus: () => void;
}) {
  const color = warmthHex(m.warmth);
  const rampPct = Math.min(100, Math.round((m.day / 28) * 100));
  const sentPct =
    m.target > 0 ? Math.min(100, Math.round((m.sentToday / m.target) * 100)) : 0;
  const dnsOk = [m.spf, m.dkim, m.dmarc].filter(Boolean).length;
  const sparkPts = m.spark.map((v, i) => ({ i, v }));
  const deltaStr = `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(1)}`;
  const deltaTone =
    m.delta > 0 ? 'text-accent' : m.delta < 0 ? 'text-accent3' : 'text-text-dim';
  const gradId = `kb-spark-${m.id}`;

  return (
    <motion.button
      type="button"
      layout
      onClick={onFocus}
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.34,
        ease: 'easeOut',
        delay: 0.16 + colIndex * 0.06 + rowIndex * 0.05,
      }}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      whileTap={{ scale: 0.98 }}
      className={`group relative overflow-hidden rounded-lg border bg-surface/70 p-3 text-left backdrop-blur-xl transition-colors ${
        focused
          ? 'border-accent/60 shadow-[0_8px_28px_-8px_rgba(242, 101, 34,0.45)]'
          : 'border-white/[0.07] hover:border-accent/30'
      } ${m.health === 'paused' ? 'opacity-70' : ''}`}
    >
      {/* warmth accent rail */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: color }}
      />

      {/* Identity row */}
      <div className="flex items-start gap-2.5 pl-1.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-semibold text-bg"
          style={{ background: color }}
          aria-hidden
        >
          {PROVIDER_LETTER[m.provider]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{m.email}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: HEALTH_DOT[m.health] }}
              aria-hidden
            />
            <span className="text-[11px] uppercase tracking-wider text-text-dim">
              {PROVIDER_LABEL[m.provider]}
            </span>
          </div>
        </div>
        <div className="text-right leading-none">
          <span
            className="text-lg font-semibold tabular-nums"
            style={{ color }}
          >
            {m.warmth}
          </span>
          <span className={`ml-1 text-[11px] font-medium ${deltaTone}`}>
            {deltaStr}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="mt-2.5 h-[34px] pl-1.5">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={sparkPts}
            margin={{ top: 3, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.6}
              fill={`url(#${gradId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Ramp mini-bar */}
      <div className="mt-2 pl-1.5">
        <div className="mb-1 flex items-center justify-between text-[11px] text-text-dim">
          <span>Build-up</span>
          <span className="tabular-nums">Day {m.day} / 28</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${rampPct}%` }}
            transition={{
              duration: 0.7,
              ease: 'easeOut',
              delay: 0.22 + colIndex * 0.05 + rowIndex * 0.04,
            }}
          />
        </div>
      </div>

      {/* Footer: sends + DNS chip */}
      <div className="mt-2.5 flex items-center justify-between gap-2 pl-1.5">
        <span className="text-[11px] text-text-dim">
          <span className="font-medium tabular-nums text-text">
            {m.sentToday}
          </span>
          <span className="tabular-nums">/{m.target}</span> sent · {sentPct}%
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
            dnsOk === 3
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-accent3/30 bg-accent3/10 text-accent3'
          }`}
        >
          {dnsOk === 3 ? (
            <Check className="h-2.5 w-2.5" />
          ) : (
            <X className="h-2.5 w-2.5" />
          )}
          DNS {dnsOk}/3
        </span>
      </div>
    </motion.button>
  );
}

function EmptyColumn() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-muted/70 px-3 py-8 text-center">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-text-dim">
        <CircleDot className="h-4 w-4" />
      </span>
      <p className="text-xs text-text-dim">No mailboxes in this stage</p>
    </div>
  );
}

function Inspector({ m, onClose }: { m: Mailbox; onClose: () => void }) {
  const color = warmthHex(m.warmth);
  const dnsRows: Array<{ label: string; ok: boolean }> = [
    { label: 'SPF', ok: m.spf },
    { label: 'DKIM', ok: m.dkim },
    { label: 'DMARC', ok: m.dmarc },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-accent/30 bg-surface/70 px-4 py-3 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-semibold text-bg"
          style={{ background: color }}
          aria-hidden
        >
          {PROVIDER_LETTER[m.provider]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{m.email}</p>
          <p className="text-[11px] uppercase tracking-wider text-text-dim">
            {PROVIDER_LABEL[m.provider]} · selected
          </p>
        </div>
      </div>

      <span className="hidden h-9 w-px bg-border-muted md:block" />

      <InspectorStat label="Warmth" value={String(m.warmth)} accent={color} />
      <InspectorStat label="Build-up day" value={`${m.day} / 28`} />
      <InspectorStat
        label="Sent today"
        value={`${m.sentToday} / ${m.target}`}
      />

      <div className="flex items-center gap-1.5">
        {dnsRows.map((d) => (
          <Badge key={d.label} variant={d.ok ? 'green' : 'orange'}>
            {d.ok ? (
              <Check className="h-3 w-3" />
            ) : (
              <X className="h-3 w-3" />
            )}
            {d.label}
          </Badge>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" size="sm">
          Open mailbox
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function InspectorStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="leading-tight">
      <p className="text-[10px] uppercase tracking-wider text-text-dim">
        {label}
      </p>
      <p
        className="text-base font-semibold tabular-nums text-text"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export default ProPlusMbx1Kanban;
