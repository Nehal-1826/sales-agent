import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight,
  Boxes,
  ChevronDown,
  Clock,
  Flame,
  Layers,
  Mail,
  Pause,
  Play,
  Plus,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SchedulePanel } from '../mailboxes/SchedulePanel';
import { useMailbox } from '@/features/mailboxes/api';

/**
 * ProPlusMbx4Clusters — "Provider Clusters" mailbox surface for Pro Plus.
 *
 * Distinct paradigm: mailboxes are not a flat grid, split pane, carousel,
 * kanban, heatmap or leaderboard. They are grouped into provider CLUSTER
 * PODS — one rounded pod per email provider (Gmail / Outlook / Yahoo /
 * SMTP). Each pod carries the provider identity (glyph + name), a
 * hand-rolled SVG ARC GAUGE summarising the pod's average warmth, a
 * count + sends-today readout, and inside it the member mailboxes as
 * compact chips. Pods are ordered largest-cluster-first and sized by
 * member count (the biggest pod spans 2 columns). Clicking a pod
 * expands a detail strip with per-member rows; clicking a member chip
 * pins a member detail panel.
 *
 * Fully STANDALONE — no network, router, query hooks or required props.
 * Everything comes from the inline MOCK so the preview harness can mount
 * it prop-less. Renders only page content; the app shell supplies chrome.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export type Provider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';
export type Status = 'active' | 'warming' | 'paused';

export interface MailboxRow {
  id: string;
  email: string;
  provider: Provider;
  warmth: number;
  delta: number;
  day: number;
  sentToday: number;
  target: number;
  status: Status;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

// ---------------------------------------------------------------------------
// Mock — 14 mailboxes, uneven across all 4 providers, avg ~84, Pro Plus 15-cap
//   Gmail   x5  · Outlook x4 · SMTP x3 · Yahoo x2
// ---------------------------------------------------------------------------

const MOCK: MailboxRow[] = [
  // ---- Gmail pod (5) ----
  { id: 'g1', email: 'founder@acme.io', provider: 'gmail', warmth: 93, delta: 1.3, day: 28, sentToday: 71, target: 75, status: 'active', spf: true, dkim: true, dmarc: true },
  { id: 'g2', email: 'sales@acme.io', provider: 'gmail', warmth: 89, delta: 2.0, day: 26, sentToday: 63, target: 70, status: 'active', spf: true, dkim: true, dmarc: true },
  { id: 'g3', email: 'success@acme.io', provider: 'gmail', warmth: 86, delta: 1.7, day: 23, sentToday: 56, target: 65, status: 'active', spf: true, dkim: true, dmarc: true },
  { id: 'g4', email: 'team@acme.io', provider: 'gmail', warmth: 82, delta: 2.4, day: 20, sentToday: 49, target: 60, status: 'warming', spf: true, dkim: true, dmarc: true },
  { id: 'g5', email: 'growth@acme.io', provider: 'gmail', warmth: 71, delta: -1.1, day: 12, sentToday: 28, target: 40, status: 'warming', spf: true, dkim: false, dmarc: true },
  // ---- Outlook pod (4) ----
  { id: 'o1', email: 'partnerships@acme.io', provider: 'outlook', warmth: 90, delta: 1.9, day: 27, sentToday: 64, target: 70, status: 'active', spf: true, dkim: true, dmarc: true },
  { id: 'o2', email: 'support@acme.io', provider: 'outlook', warmth: 84, delta: 1.4, day: 22, sentToday: 52, target: 60, status: 'active', spf: true, dkim: true, dmarc: true },
  { id: 'o3', email: 'careers@acme.io', provider: 'outlook', warmth: 79, delta: 2.2, day: 17, sentToday: 41, target: 50, status: 'warming', spf: true, dkim: true, dmarc: true },
  { id: 'o4', email: 'ops@acme.io', provider: 'outlook', warmth: 73, delta: 1.0, day: 14, sentToday: 33, target: 45, status: 'warming', spf: true, dkim: true, dmarc: false },
  // ---- SMTP pod (3) ----
  { id: 's1', email: 'hello@acme.co', provider: 'smtp', warmth: 81, delta: 2.5, day: 19, sentToday: 45, target: 55, status: 'active', spf: true, dkim: true, dmarc: false },
  { id: 's2', email: 'billing@acme.co', provider: 'smtp', warmth: 64, delta: 2.7, day: 8, sentToday: 15, target: 25, status: 'warming', spf: true, dkim: true, dmarc: true },
  { id: 's3', email: 'invoices@acme.co', provider: 'smtp', warmth: 47, delta: -2.0, day: 3, sentToday: 0, target: 5, status: 'paused', spf: false, dkim: true, dmarc: true },
  // ---- Yahoo pod (2) ----
  { id: 'y1', email: 'press@acme.co', provider: 'yahoo', warmth: 78, delta: 1.6, day: 16, sentToday: 38, target: 50, status: 'warming', spf: true, dkim: true, dmarc: true },
  { id: 'y2', email: 'news@acme.co', provider: 'yahoo', warmth: 58, delta: 3.1, day: 6, sentToday: 11, target: 15, status: 'warming', spf: true, dkim: false, dmarc: false },
];

const MAX_MAILBOXES = 15;

// ---------------------------------------------------------------------------
// Provider identity
// ---------------------------------------------------------------------------

const PROVIDER_META: Record<
  Provider,
  { label: string; glyph: string; sub: string }
> = {
  gmail: { label: 'Gmail', glyph: 'G', sub: 'Google Workspace' },
  outlook: { label: 'Outlook', glyph: 'O', sub: 'Microsoft 365' },
  yahoo: { label: 'Yahoo', glyph: 'Y', sub: 'Yahoo Mail' },
  smtp: { label: 'SMTP', glyph: 'S', sub: 'Custom relay' },
};

const PROVIDER_ORDER: Provider[] = ['gmail', 'outlook', 'yahoo', 'smtp'];

const WARMTH_HEX = { high: '#F26522', mid: '#ffd54f', low: '#ff6b4a' } as const;

function warmthHex(score: number): string {
  if (score >= 75) return WARMTH_HEX.high;
  if (score >= 50) return WARMTH_HEX.mid;
  return WARMTH_HEX.low;
}

const STATUS_BADGE: Record<
  Status,
  { label: string; variant: 'green' | 'yellow' | 'orange' }
> = {
  active: { label: 'Active', variant: 'green' },
  warming: { label: 'Warming', variant: 'yellow' },
  paused: { label: 'Paused', variant: 'orange' },
};

// ---------------------------------------------------------------------------
// Cluster aggregation
// ---------------------------------------------------------------------------

interface Cluster {
  provider: Provider;
  members: MailboxRow[];
  count: number;
  avgWarmth: number;
  sentToday: number;
  target: number;
  active: number;
  dnsHealthy: number;
}

function buildClusters(rows: MailboxRow[]): Cluster[] {
  const grouped = PROVIDER_ORDER.map<Cluster>((provider) => {
    const members = rows.filter((r) => r.provider === provider);
    const count = members.length;
    const avgWarmth = count
      ? Math.round(members.reduce((a, m) => a + m.warmth, 0) / count)
      : 0;
    return {
      provider,
      members: [...members].sort((a, b) => b.warmth - a.warmth),
      count,
      avgWarmth,
      sentToday: members.reduce((a, m) => a + m.sentToday, 0),
      target: members.reduce((a, m) => a + m.target, 0),
      active: members.filter((m) => m.status !== 'paused').length,
      dnsHealthy: members.filter((m) => m.spf && m.dkim && m.dmarc).length,
    };
  }).filter((c) => c.count > 0);
  // Largest cluster first so the biggest pod leads and can span 2 cols.
  return grouped.sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Hand-rolled SVG arc gauge (270° sweep) for per-pod warmth
// ---------------------------------------------------------------------------

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function PodGauge({
  value,
  size = 96,
  index,
}: {
  value: number;
  size?: number;
  index: number;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const SWEEP = 270; // gap at the bottom
  const start = -135;
  const end = start + SWEEP;
  const color = warmthHex(value);
  const track = arcPath(cx, cy, r, start, end);
  const valueEnd = start + (Math.max(0, Math.min(100, value)) / 100) * SWEEP;
  const valuePath = arcPath(cx, cy, r, start, Math.max(start + 0.01, valueEnd));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path
          d={track}
          fill="none"
          stroke="currentColor"
          className="text-surface-2"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <motion.path
          d={valuePath}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: 1.05,
            ease: 'easeInOut',
            delay: 0.25 + index * 0.12,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-xl font-semibold tabular-nums leading-none"
          style={{ color }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.55 + index * 0.12 }}
        >
          {value}
        </motion.span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-text-dim">
          warmth
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fleet bar (top summary)
// ---------------------------------------------------------------------------

function FleetBar({
  total,
  active,
  avg,
  sent,
  target,
  clusters,
}: {
  total: number;
  active: number;
  avg: number;
  sent: number;
  target: number;
  clusters: Cluster[];
}) {
  const capPct = Math.round((total / MAX_MAILBOXES) * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-2xl border border-border-muted bg-surface/60 p-5 backdrop-blur-xl"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <FleetStat
          icon={<Boxes className="h-4 w-4" />}
          label="Fleet capacity"
          value={`${total} / ${MAX_MAILBOXES}`}
          foot={`${MAX_MAILBOXES - total} slots free`}
          tone="text-accent"
        />
        <FleetStat
          icon={<Flame className="h-4 w-4" />}
          label="Active"
          value={`${active}`}
          foot={`${total - active} paused`}
          tone="text-accent4"
        />
        <FleetStat
          icon={<Send className="h-4 w-4" />}
          label="Sent today"
          value={`${sent}`}
          foot={`of ${target} target`}
          tone="text-accent2"
        />
        <FleetStat
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Fleet avg warmth"
          value={`${avg}`}
          foot={avg >= 80 ? 'Healthy' : 'Warming up'}
          tone="text-accent"
        />

        {/* Cluster split mini-bar — fills the remaining width */}
        <div className="ml-auto min-w-[200px] flex-1">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Provider split
            </span>
            <span className="tabular-nums">{capPct}% of cap</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
            {clusters.map((c, i) => (
              <motion.div
                key={c.provider}
                className="h-full"
                style={{ background: warmthHex(c.avgWarmth) }}
                initial={{ width: 0 }}
                animate={{ width: `${(c.count / total) * 100}%` }}
                transition={{
                  duration: 0.7,
                  ease: 'easeOut',
                  delay: 0.2 + i * 0.08,
                }}
                title={`${PROVIDER_META[c.provider].label} · ${c.count}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {clusters.map((c) => (
              <span
                key={c.provider}
                className="inline-flex items-center gap-1.5 text-[11px] text-text-dim"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: warmthHex(c.avgWarmth) }}
                />
                {PROVIDER_META[c.provider].label}
                <span className="tabular-nums text-text-dim/70">
                  {c.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FleetStat({
  icon,
  label,
  value,
  foot,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 ${tone}`}
      >
        {icon}
      </span>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-text-dim">
          {label}
        </p>
        <p className="text-lg font-semibold tabular-nums leading-tight text-text">
          {value}
        </p>
        <p className="text-[11px] text-text-dim">{foot}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member chip — compact mini-card inside a pod
// ---------------------------------------------------------------------------

function MemberChip({
  m,
  index,
  selected,
  onSelect,
}: {
  m: MailboxRow;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = warmthHex(m.warmth);
  const local = m.email.split('@')[0];
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.32,
        ease: 'easeOut',
        delay: 0.12 + index * 0.05,
      }}
      whileHover={{ y: -2 }}
      className={`group/chip flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
        selected
          ? 'border-accent/50 bg-accent/10'
          : 'border-border-muted bg-surface-2/60 hover:border-accent/30 hover:bg-surface-2'
      } ${m.status === 'paused' ? 'opacity-70' : ''}`}
    >
      <span
        className="relative h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      >
        {m.status !== 'paused' && (
          <span
            className="absolute inset-0 animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">
          {local}
        </span>
        <span className="block text-[11px] text-text-dim">
          Day {Math.min(28, m.day)} · {m.sentToday}/{m.target}
        </span>
      </span>
      <span
        className="shrink-0 text-sm font-semibold tabular-nums"
        style={{ color }}
      >
        {m.warmth}
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Member detail strip (pinned when a chip is selected)
// ---------------------------------------------------------------------------

function MemberDetail({
  m,
  onPauseToggle,
  onOpen,
  pausingId,
}: {
  m: MailboxRow;
  onPauseToggle: (m: MailboxRow) => void;
  onOpen: (m: MailboxRow) => void;
  pausingId: string | null;
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const { data: fullMailbox } = useMailbox(m.id);

  const color = warmthHex(m.warmth);
  const status = STATUS_BADGE[m.status];
  const dnsOk = [m.spf, m.dkim, m.dmarc].filter(Boolean).length;
  const sentPct =
    m.target > 0 ? Math.min(100, Math.round((m.sentToday / m.target) * 100)) : 0;
  const rampPct = Math.min(100, Math.round((m.day / 28) * 100));
  const displayDay = Math.min(28, m.day);
  const deltaStr = `${m.delta > 0 ? '+' : ''}${m.delta.toFixed(1)}`;
  const deltaTone =
    m.delta > 0 ? 'text-accent' : m.delta < 0 ? 'text-accent3' : 'text-text-dim';

  const isPausing = pausingId === m.id;

  return (
    <motion.div
      key={m.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="mt-3 rounded-xl border border-border-muted bg-bg/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">
              {m.email}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-text-dim">
              {PROVIDER_META[m.provider].label} ·{' '}
              {PROVIDER_META[m.provider].sub}
            </p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        <AnimatePresence mode="wait">
          {!showSchedule ? (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <DetailMetric label="Warmth">
                  <span
                    className="text-xl font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {m.warmth}
                  </span>
                  <span className={`ml-1.5 text-xs font-medium ${deltaTone}`}>
                    {deltaStr}
                  </span>
                </DetailMetric>
                <DetailMetric label="Build-up day">
                  <span className="text-xl font-semibold tabular-nums text-text">
                    {displayDay}
                  </span>
                  <span className="ml-1 text-xs text-text-dim">/ 28</span>
                </DetailMetric>

                <DetailMetric label="Sent today">
                  <span className="text-xl font-semibold tabular-nums text-text">
                    {m.sentToday}
                  </span>
                  <span className="ml-1 text-xs text-text-dim">/ {m.target}</span>
                </DetailMetric>
                <DetailMetric label="Domain records (DNS)">
                  <span
                    className={`text-xl font-semibold tabular-nums ${
                      dnsOk === 3 ? 'text-accent' : 'text-accent4'
                    }`}
                  >
                    {dnsOk}
                  </span>
                  <span className="ml-1 text-xs text-text-dim">/ 3</span>
                </DetailMetric>
              </div>

              <div className="mt-4 space-y-3">
                <Track
                  label="Build-up progress"
                  right={`Day ${displayDay} / 28`}
                  pct={rampPct}
                  color={color}
                />

                <Track
                  label="Daily sends"
                  right={`${m.sentToday} / ${m.target}`}
                  pct={sentPct}
                  color="#FF8A4B"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mt-4 pt-2"
            >
              {fullMailbox ? (
                <SchedulePanel mailbox={fullMailbox} />
              ) : (
                <div className="flex h-48 items-center justify-center">
                  <Send className="h-5 w-5 animate-spin text-text-dim" />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 px-2 text-[10px] uppercase tracking-wider font-bold',
                showSchedule && 'bg-accent/10 text-accent border-accent/20'
              )}
              onClick={() => setShowSchedule(!showSchedule)}
            >
              <Clock className="mr-1 h-3 w-3" />
              {showSchedule ? 'Back to Stats' : 'Schedule'}
            </Button>
            <div className="h-4 w-px bg-border-muted mx-1" />
            {(['SPF', 'DKIM', 'DMARC'] as const).map((rec, i) => {
              const ok = [m.spf, m.dkim, m.dmarc][i];
              return (
                <span
                  key={rec}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    ok
                      ? 'border-accent/30 bg-accent/10 text-accent'
                      : 'border-accent3/30 bg-accent3/10 text-accent3'
                  }`}
                >
                  {rec}
                </span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPauseToggle(m)}
              disabled={isPausing}
            >
              {isPausing ? (
                <Send className="h-3.5 w-3.5 animate-spin" />
              ) : m.status === 'paused' ? (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Pause
                </>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOpen(m)}>
              Open
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DetailMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-text-dim">
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline">{children}</p>
    </div>
  );
}

function Track({
  label,
  right,
  pct,
  color,
}: {
  label: string;
  right: string;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-text-dim">
        <span>{label}</span>
        <span className="tabular-nums">{right}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cluster pod
// ---------------------------------------------------------------------------

function ClusterPod({
  cluster,
  index,
  span,
  onPauseToggle,
  onOpen,
  pausingId,
}: {
  cluster: Cluster;
  index: number;
  span: boolean;
  onPauseToggle: (m: MailboxRow) => void;
  onOpen: (m: MailboxRow) => void;
  pausingId: string | null;
}) {
  const meta = PROVIDER_META[cluster.provider];
  const podColor = warmthHex(cluster.avgWarmth);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => cluster.members.find((m) => m.id === selectedId) ?? null,
    [cluster.members, selectedId],
  );

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.94, y: 22 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay: index * 0.1,
      }}
      className={`relative flex flex-col rounded-2xl border border-border-muted bg-surface/60 backdrop-blur-xl ${
        span ? 'lg:col-span-2' : ''
      }`}
    >
      {/* Pod header — provider identity + arc gauge + cluster summary */}
      <div className="flex items-start gap-4 p-5 pb-4">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold text-bg"
          style={{ background: podColor }}
          aria-hidden
        >
          {meta.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-text">
              {meta.label}
            </h2>
            <Badge variant="neutral">
              {cluster.count} {cluster.count === 1 ? 'mailbox' : 'mailboxes'}
            </Badge>
          </div>
          <p className="text-xs text-text-dim">{meta.sub}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-text-dim">
            <span>
              <span className="font-semibold tabular-nums text-text">
                {cluster.active}
              </span>{' '}
              active
            </span>
            <span>
              <span className="font-semibold tabular-nums text-text">
                {cluster.sentToday}
              </span>
              /{cluster.target} sent
            </span>
            <span>
              DNS{' '}
              <span className="font-semibold tabular-nums text-text">
                {cluster.dnsHealthy}
              </span>
              /{cluster.count}
            </span>
          </div>
        </div>
        <PodGauge value={cluster.avgWarmth} index={index} />
      </div>

      {/* Member chips */}
      <div
        className={`grid gap-2.5 px-5 ${
          span
            ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        {(expanded ? cluster.members : cluster.members.slice(0, span ? 6 : 4)).map(
          (m, i) => (
            <MemberChip
              key={m.id}
              m={m}
              index={i}
              selected={selectedId === m.id}
              onSelect={() =>
                setSelectedId((cur) => (cur === m.id ? null : m.id))
              }
            />
          ),
        )}
      </div>

      {/* Pinned member detail */}
      <div className="px-5">
        <AnimatePresence mode="wait">
          {selected && (
            <MemberDetail
              m={selected}
              onPauseToggle={onPauseToggle}
              onOpen={onOpen}
              pausingId={pausingId}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Pod footer — expand/collapse the cluster */}
      <div className="mt-auto p-5 pt-4">
        {cluster.members.length > (span ? 6 : 4) ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/50 py-2 text-xs font-medium text-text-dim transition-colors hover:border-accent/30 hover:text-text"
          >
            {expanded
              ? 'Collapse cluster'
              : `Show all ${cluster.count} mailboxes`}
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.25 }}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
          </button>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: podColor }}
              />
              Cluster warmth {cluster.avgWarmth}
            </span>
            <span>Tap a mailbox for detail</span>
          </div>
        )}
      </div>
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Add-cluster slot
// ---------------------------------------------------------------------------

function AddPod({ index, onAdd }: { index: number; onAdd: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onAdd}
      initial={{ opacity: 0, scale: 0.94, y: 22 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
        delay: index * 0.1,
      }}
      className="group flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-muted bg-surface/40 p-6 text-center transition-colors hover:border-accent/40 hover:bg-surface/60"
    >
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2 text-accent transition-transform group-hover:scale-110">
        <Plus className="h-6 w-6" />
      </span>
      <div>
        <p className="text-sm font-medium text-text">Connect a mailbox</p>
        <p className="mt-1 text-xs text-text-dim">
          New providers spin up their own cluster pod
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
        <Mail className="h-3.5 w-3.5" />
        Add to fleet
      </span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProPlusMbx4Clusters({
  data,
  onAdd = () => {},
  onPauseToggle = () => {},
  onOpen = () => {},
  pausingId = null,
}: {
  data?: MailboxRow[];
  onAdd?: () => void;
  onPauseToggle?: (m: MailboxRow) => void;
  onOpen?: (m: MailboxRow) => void;
  pausingId?: string | null;
} = {}): JSX.Element {
  // Prop-less mount (the :35001 preview harness) falls back to MOCK so the
  // design renders standalone; the live wrapper passes real workspace rows.
  // `onAdd` is optional with a no-op default so the standalone preview works;
  // the live wrapper at mailboxes/ProPlusMailboxes.tsx supplies a callback
  // that opens the shared AddMailboxDialog.
  const rows = data ?? MOCK;
  const clusters = useMemo(() => buildClusters(rows), [rows]);

  const fleet = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((m) => m.status !== 'paused').length;
    const avg = total
      ? Math.round(rows.reduce((a, m) => a + m.warmth, 0) / total)
      : 0;
    const sent = rows.reduce((a, m) => a + m.sentToday, 0);
    const target = rows.reduce((a, m) => a + m.target, 0);
    return { total, active, avg, sent, target };
  }, [rows]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Mailboxes
            </h1>
            <Badge variant="orange">
              {rows.length} of {MAX_MAILBOXES}
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            Your fleet, grouped into provider clusters. Each pod tracks its own
            warmth — tap a pod to drill into its mailboxes.
          </p>
        </div>
        <Button variant="primary" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add mailbox
        </Button>
      </motion.header>

      {/* Fleet bar */}
      <FleetBar
        total={fleet.total}
        active={fleet.active}
        avg={fleet.avg}
        sent={fleet.sent}
        target={fleet.target}
        clusters={clusters}
      />

      {/* Cluster pod board — biggest cluster spans 2 cols */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {clusters.map((c, i) => (
          <ClusterPod
            key={c.provider}
            cluster={c}
            index={i}
            span={i === 0 && c.count >= 5}
            onPauseToggle={onPauseToggle}
            onOpen={onOpen}
            pausingId={pausingId}
          />
        ))}
        <AddPod index={clusters.length} onAdd={onAdd} />
      </div>
    </div>
  );
}

export default ProPlusMbx4Clusters;
