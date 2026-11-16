import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  BeakerIcon,
  Bookmark,
  CheckCircle2,
  ClipboardList,
  Clock,
  FlaskConical,
  Hexagon,
  Microscope,
  Play,
  Plus,
  Quote,
  Search,
  Shield,
  Sparkles,
  TestTube,
  TestTubes,
  ThermometerSun,
  Timer,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * AgTolT2Lab — Agency-tier TOOLS surface, design candidate T2,
 * "Laboratory Test Bench".
 *
 * /app/tools for Agency-tier operators reimagined as a scientific
 * laboratory. Each tool is a bench-top workstation with its own
 * apparatus illustration: a microscope (Preview), a petri-dish
 * array (Templates), a bubbling chemistry flask (Spam), and a
 * spinning centrifuge (Placement). Sub-clients live in a test-tube
 * rack as labeled specimen vials; clicking a vial "loads the
 * specimen" into the active workstation. A lab notebook journals
 * recent runs as handwritten test entries; the inventory footer
 * shows reagents in stock, completed tests, and lab-safety status.
 *
 * Distinct from sibling Tools candidates: this is a BENCH, not a
 * cockpit, marketplace, or control room. Pure laboratory metaphor —
 * beakers, microscopes, petri dishes, hex-grid base pattern.
 *
 * Fully STANDALONE — accepts `data?: AgencyToolsData`, falls back to
 * the inline MOCK so the design-preview harness can mount it prop-
 * less. Uses ONLY the Shailog orange palette via CSS vars; never
 * hardcodes violet, blue, cyan, teal, etc.
 */

// ---------------------------------------------------------------------------
// Shared Agency tools data shape — mirrors AgTolT1Cockpit. Local fallback so
// this file compiles standalone if T1 isn't yet on disk.
// ---------------------------------------------------------------------------

export type ToolSlug = 'preview' | 'templates' | 'spam' | 'placement';
export type ToolRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgencyToolsData {
  agency: { name: string; region: string };
  subClients: Array<{ id: string; name: string; domain: string; mailboxCount: number; status: 'active' | 'paused' | 'onboarding' }>;
  tools: Array<{ slug: ToolSlug; name: string; short: string; description: string; lastRunAt: string | null; runsLast30d: number; available: boolean }>;
  recentRuns: Array<{ id: string; toolSlug: ToolSlug; subClientId: string; subClientName: string; startedAt: string; status: ToolRunStatus; summary: string; durationMs: number }>;
  summary: { totalRunsToday: number; totalRuns30d: number; avgPlacementScore: number; queuedRuns: number };
}

// ---------------------------------------------------------------------------
// MOCK — fictional Helix Laboratories with a portfolio of sub-clients.
// ---------------------------------------------------------------------------

const MOCK: AgencyToolsData = {
  agency: { name: 'Helix Laboratories', region: 'us-east-1' },
  subClients: [
    { id: 'sc-nim', name: 'Nimbus Reach', domain: 'send.nimbusreach.com', mailboxCount: 9, status: 'active' },
    { id: 'sc-ori', name: 'Orion Mail', domain: 'out.orionmail.co', mailboxCount: 7, status: 'active' },
    { id: 'sc-veg', name: 'Vega Sends', domain: 'sx.vegasends.com', mailboxCount: 6, status: 'active' },
    { id: 'sc-qua', name: 'Quasar Studio', domain: 'send.quasarstudio.com', mailboxCount: 5, status: 'onboarding' },
    { id: 'sc-lyr', name: 'Lyra Pipeline', domain: 'mx.lyrapipeline.io', mailboxCount: 4, status: 'active' },
    { id: 'sc-pix', name: 'Pixel Drop', domain: 'out.pixeldrop.co', mailboxCount: 3, status: 'paused' },
    { id: 'sc-atl', name: 'Atlas Bio', domain: 'send.atlasbio.co', mailboxCount: 4, status: 'active' },
    { id: 'sc-cyg', name: 'Cygnus Mail', domain: 'mail.cygnusmail.co', mailboxCount: 6, status: 'active' },
  ],
  tools: [
    { slug: 'preview', name: 'Inbox Preview', short: 'Render a sample message in real mailbox UIs', description: 'Microscope view: project your message under Gmail / Outlook / Yahoo lenses and inspect dark-mode, mobile, and clipped-preview behaviour.', lastRunAt: '2026-05-29T14:22:00Z', runsLast30d: 184, available: true },
    { slug: 'templates', name: 'Template Designer', short: 'Compose and culture message variants', description: 'Petri-dish array: grow variant cultures from a template seed, isolate the winners, and roll out the strongest culture across sub-clients.', lastRunAt: '2026-05-29T11:48:00Z', runsLast30d: 96, available: true },
    { slug: 'spam', name: 'Spam Scanner', short: 'Chemical analysis of spam-trigger content', description: 'Bubbling reagent flask: titrate your draft against the spam-trigger panel, surface offending phrases, and recommend safer phrasing.', lastRunAt: '2026-05-29T09:05:00Z', runsLast30d: 312, available: true },
    { slug: 'placement', name: 'Placement Tester', short: 'Centrifuge seed inboxes to plot placement', description: 'Spinning centrifuge: send your message to 30 seed accounts, separate the inbox vs spam fractions, and publish a white-label PDF report.', lastRunAt: '2026-05-29T13:01:00Z', runsLast30d: 58, available: true },
  ],
  recentRuns: [
    { id: 'run-1', toolSlug: 'placement', subClientId: 'sc-nim', subClientName: 'Nimbus Reach', startedAt: '2026-05-29T13:01:00Z', status: 'completed', summary: 'Placement score 92.4 — 27 / 30 inbox, 2 promo, 1 spam.', durationMs: 184_000 },
    { id: 'run-2', toolSlug: 'spam', subClientId: 'sc-ori', subClientName: 'Orion Mail', startedAt: '2026-05-29T12:38:00Z', status: 'completed', summary: 'No critical triggers — 2 caution phrases highlighted.', durationMs: 4_200 },
    { id: 'run-3', toolSlug: 'preview', subClientId: 'sc-veg', subClientName: 'Vega Sends', startedAt: '2026-05-29T12:10:00Z', status: 'completed', summary: 'Rendered in Gmail / Outlook / Yahoo — mobile clip OK.', durationMs: 1_800 },
    { id: 'run-4', toolSlug: 'templates', subClientId: 'sc-qua', subClientName: 'Quasar Studio', startedAt: '2026-05-29T11:48:00Z', status: 'running', summary: 'Culturing 4 variants from seed "Onboarding-A1"…', durationMs: 0 },
    { id: 'run-5', toolSlug: 'placement', subClientId: 'sc-lyr', subClientName: 'Lyra Pipeline', startedAt: '2026-05-29T10:24:00Z', status: 'completed', summary: 'Placement score 71.3 — DMARC missing, see report.', durationMs: 196_000 },
    { id: 'run-6', toolSlug: 'spam', subClientId: 'sc-pix', subClientName: 'Pixel Drop', startedAt: '2026-05-29T09:50:00Z', status: 'failed', summary: 'Mailbox paused — could not draft live sample.', durationMs: 800 },
    { id: 'run-7', toolSlug: 'preview', subClientId: 'sc-atl', subClientName: 'Atlas Bio', startedAt: '2026-05-29T09:18:00Z', status: 'completed', summary: 'Dark-mode contrast OK, 1 image alt missing.', durationMs: 1_500 },
    { id: 'run-8', toolSlug: 'templates', subClientId: 'sc-cyg', subClientName: 'Cygnus Mail', startedAt: '2026-05-29T08:42:00Z', status: 'completed', summary: 'Variant B-3 promoted — 18 % open lift vs control.', durationMs: 6_400 },
    { id: 'run-9', toolSlug: 'placement', subClientId: 'sc-nim', subClientName: 'Nimbus Reach', startedAt: '2026-05-29T08:12:00Z', status: 'completed', summary: 'Placement score 88.1 — Outlook promo tab 3 / 10.', durationMs: 178_000 },
    { id: 'run-10', toolSlug: 'spam', subClientId: 'sc-ori', subClientName: 'Orion Mail', startedAt: '2026-05-29T07:30:00Z', status: 'completed', summary: 'Clean panel — no triggers, score 96.', durationMs: 3_900 },
    { id: 'run-11', toolSlug: 'templates', subClientId: 'sc-veg', subClientName: 'Vega Sends', startedAt: '2026-05-28T22:15:00Z', status: 'completed', summary: 'Seed culture stabilised, 3 variants viable.', durationMs: 5_700 },
    { id: 'run-12', toolSlug: 'placement', subClientId: 'sc-cyg', subClientName: 'Cygnus Mail', startedAt: '2026-05-28T20:02:00Z', status: 'completed', summary: 'Placement score 84.9 — Yahoo bulk 1 / 10.', durationMs: 169_000 },
  ],
  summary: { totalRunsToday: 42, totalRuns30d: 650, avgPlacementScore: 86.2, queuedRuns: 3 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtInt = (n: number): string => formatNumber(n);

function relTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const diff = now.getTime() - t;
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function fmtDateStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '----.--.--';
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

function hashSeed(key: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
}

const TOOL_META: Record<ToolSlug, { catalog: string; reagent: string; apparatus: string; actionLabel: string }> = {
  preview: { catalog: 'PRV-014', reagent: 'Render Buffer', apparatus: 'MICROSCOPE', actionLabel: 'BEGIN OBSERVATION' },
  templates: { catalog: 'TPL-022', reagent: 'Culture Medium', apparatus: 'PETRI ARRAY', actionLabel: 'INOCULATE' },
  spam: { catalog: 'SPM-008', reagent: 'Reactive Indicator', apparatus: 'CHEM FLASK', actionLabel: 'BEGIN TITRATION' },
  placement: { catalog: 'PLC-031', reagent: 'Seed Mixture', apparatus: 'CENTRIFUGE', actionLabel: 'SPIN SAMPLE' },
};

const STATUS_META: Record<ToolRunStatus, { label: string; color: string; sticker: string }> = {
  pending: { label: 'PENDING', color: 'var(--wp-text-dim)', sticker: 'ON RACK' },
  running: { label: 'RUNNING', color: 'var(--wp-warning)', sticker: 'IN BENCH' },
  completed: { label: 'PASSED', color: 'var(--wp-success)', sticker: 'PASSED' },
  failed: { label: 'FAILED', color: 'var(--wp-danger)', sticker: 'FAILED' },
};

const SUB_STATUS_META: Record<AgencyToolsData['subClients'][number]['status'], { label: string; color: string }> = {
  active: { label: 'ACTIVE', color: 'var(--wp-success)' },
  onboarding: { label: 'ONBOARDING', color: 'var(--wp-warning)' },
  paused: { label: 'PAUSED', color: 'var(--wp-text-dim)' },
};

// Common color-mix() helpers used throughout to compress style props.
const cm = (color: string, pct: number, base: string = 'transparent'): string =>
  `color-mix(in srgb, ${color} ${pct}%, ${base})`;
const accentMix = (pct: number, base?: string): string => cm('var(--wp-accent)', pct, base);
const acc2Mix = (pct: number, base?: string): string => cm('var(--wp-accent-2)', pct, base);
const warnMix = (pct: number, base?: string): string => cm('var(--wp-warning)', pct, base);
const sucMix = (pct: number, base?: string): string => cm('var(--wp-success)', pct, base);
const dimMix = (pct: number, base?: string): string => cm('var(--wp-text-dim)', pct, base);

// ---------------------------------------------------------------------------
// HexGridBackdrop — faint dashed hex-grid layer, fixed inside container.
// ---------------------------------------------------------------------------

function HexGridBackdrop({ opacity = 0.08, size = 36 }: { opacity?: number; size?: number }): JSX.Element {
  const id = useMemo(() => `hex-pat-${Math.random().toString(36).slice(2, 9)}`, []);
  const w = size;
  const h = size * 0.866;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden style={{ opacity }}>
      <defs>
        <pattern id={id} width={w * 1.5} height={h * 2} patternUnits="userSpaceOnUse">
          <path
            d={`M ${w * 0.5} 0 L ${w * 1.5} 0 L ${w * 2} ${h} L ${w * 1.5} ${h * 2} L ${w * 0.5} ${h * 2} L 0 ${h} Z`}
            fill="none"
            stroke="var(--wp-border)"
            strokeWidth={0.6}
            strokeDasharray="2 3"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LabHeader — header strip with summary stats styled as lab inventory.
// ---------------------------------------------------------------------------

function LabClock({ intervalMs = 1000 }: { intervalMs?: number }): JSX.Element {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return (
    <span className="font-mono text-[12px] tracking-[0.18em]" style={{ color: 'var(--wp-accent-2)', fontVariantNumeric: 'tabular-nums' }}>
      T+ {hh}:{mm}:{ss}
    </span>
  );
}

function LabSeal(): JSX.Element {
  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-full"
      style={{ background: accentMix(14), border: `1.5px solid ${accentMix(46)}` }}>
      <Hexagon size={28} style={{ color: 'var(--wp-accent)' }} strokeWidth={1.6} />
      <FlaskConical size={14} className="absolute" style={{ color: 'var(--wp-accent-2)' }} strokeWidth={2.2} />
      <motion.span className="absolute inset-0 rounded-full"
        style={{ border: `1px solid ${accentMix(60)}` }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeOut' }} />
    </div>
  );
}

function InventoryStat({ icon, label, value, sub, tone = 'neutral' }: { icon: JSX.Element; label: string; value: string; sub: string; tone?: 'neutral' | 'warning' | 'success' | 'danger' }): JSX.Element {
  const colorMap = { neutral: 'var(--wp-text)', warning: 'var(--wp-warning)', success: 'var(--wp-success)', danger: 'var(--wp-danger)' } as const;
  return (
    <div className="flex min-w-[112px] flex-col gap-0.5 rounded-md px-3 py-2"
      style={{ background: accentMix(5, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: 'var(--wp-text-faint)' }}>{icon}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>{label}</span>
      </div>
      <span className="text-[18px] font-semibold leading-tight" style={{ color: colorMap[tone], fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: 'var(--wp-text-dim)' }}>{sub}</span>
    </div>
  );
}

function LabHeader({ data }: { data: AgencyToolsData }): JSX.Element {
  const ratio = data.summary.totalRuns30d > 0 ? (data.summary.totalRuns30d - data.summary.queuedRuns) / data.summary.totalRuns30d : 1;
  const successPct = Math.max(0, Math.min(100, ratio * 100));

  return (
    <div className="relative overflow-hidden rounded-lg"
      style={{ background: `linear-gradient(180deg, ${accentMix(8, 'var(--wp-surface)')} 0%, var(--wp-surface) 100%)`, border: `1px solid ${accentMix(22, 'var(--wp-border)')}` }}>
      <HexGridBackdrop opacity={0.18} size={28} />
      <div className="relative flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <LabSeal />
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: 'var(--wp-text-dim)' }}>
              {data.agency.name.toUpperCase()} · {data.agency.region.toUpperCase()}
            </span>
            <span className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--wp-text)' }}>Deliverability Laboratory</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>Bench · Specimen Rack · Notebook</span>
          </div>

          <div className="hidden h-12 w-px lg:block" style={{ background: accentMix(18) }} />

          <div className="flex items-center gap-2">
            <motion.span className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: 'var(--wp-success)', boxShadow: '0 0 10px var(--wp-success)' }}
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[9px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-faint)' }}>LAB TECHNICIAN ON DUTY</span>
              <span className="font-mono text-[11px] tracking-[0.16em]" style={{ color: 'var(--wp-success)' }}>Dr. Helix &mdash; Bench A1</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-3">
          <InventoryStat icon={<FlaskConical size={14} />} label="TESTS TODAY" value={fmtInt(data.summary.totalRunsToday)} sub="Bench A1" />
          <InventoryStat icon={<TestTubes size={14} />} label="ON RACK" value={fmtInt(data.summary.queuedRuns)} sub="Queued" tone={data.summary.queuedRuns > 0 ? 'warning' : 'neutral'} />
          <InventoryStat icon={<TrendingUp size={14} />} label="SUCCESS RATE" value={`${successPct.toFixed(1)}%`} sub="30 d roll-up" tone="success" />
          <InventoryStat icon={<ThermometerSun size={14} />} label="AVG PLACEMENT" value={data.summary.avgPlacementScore.toFixed(1)} sub="lab index" />
          <div className="hidden h-full w-px sm:block" style={{ background: accentMix(14) }} />
          <div className="flex flex-col items-end justify-center gap-0.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-faint)' }}>SESSION</span>
            <LabClock />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpecimenRack — sub-client picker styled as test-tube vials in a rack.
// ---------------------------------------------------------------------------

function SpecimenVial({ sub, index, isSelected, onSelect }: { sub: AgencyToolsData['subClients'][number]; index: number; isSelected: boolean; onSelect: () => void }): JSX.Element {
  const fill = Math.max(20, Math.min(70, sub.mailboxCount * 4 + 14));
  const hueOffset = hashSeed(sub.id, 13);
  const statusColor = SUB_STATUS_META[sub.status].color;
  const liquidStart =
    sub.status === 'paused' ? dimMix(70)
    : sub.status === 'onboarding' ? warnMix(70)
    : acc2Mix(75);
  const liquidEnd =
    sub.status === 'paused' ? dimMix(40)
    : sub.status === 'onboarding' ? warnMix(40)
    : accentMix(55);

  return (
    <motion.button type="button" onClick={onSelect}
      className="group relative flex shrink-0 flex-col items-center gap-2 rounded px-2 py-1 text-left"
      style={{ scrollSnapAlign: 'start', outline: 'none' }}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index, duration: 0.3 }}
      whileHover={{ y: -2 }} aria-pressed={isSelected}>
      <div className="flex flex-col items-center gap-0.5" style={{ width: 92 }}>
        <div className="w-full rounded-sm px-1 py-0.5 text-center"
          style={{
            background: isSelected ? accentMix(24, 'var(--wp-surface-2)') : warnMix(6, 'var(--wp-surface-2)'),
            border: `1px solid ${isSelected ? accentMix(60) : 'var(--wp-border-strong, var(--wp-border))'}`,
          }}>
          <div className="truncate font-mono text-[9px] uppercase tracking-[0.18em]"
            style={{ color: isSelected ? 'var(--wp-accent)' : 'var(--wp-text-dim)' }} title={sub.name}>{sub.name}</div>
          <div className="truncate font-mono text-[8px] uppercase tracking-[0.18em]"
            style={{ color: 'var(--wp-text-faint)' }} title={sub.domain}>{sub.domain}</div>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.2em]" style={{ color: statusColor }}>&middot; {SUB_STATUS_META[sub.status].label}</span>
      </div>
      <svg width={50} height={130} viewBox="0 0 50 130"
        style={{ filter: isSelected ? `drop-shadow(0 0 8px ${accentMix(70)})` : 'none', transition: 'filter 220ms ease' }} aria-hidden>
        <defs>
          <linearGradient id={`vial-grad-${sub.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={liquidStart} />
            <stop offset="100%" stopColor={liquidEnd} />
          </linearGradient>
          <clipPath id={`vial-clip-${sub.id}`}>
            <path d="M 13 6 Q 13 4 15 4 L 35 4 Q 37 4 37 6 L 37 22 L 41 26 Q 43 28 43 31 L 43 110 Q 43 122 25 122 Q 7 122 7 110 L 7 31 Q 7 28 9 26 L 13 22 Z" />
          </clipPath>
        </defs>
        <path d="M 13 6 Q 13 4 15 4 L 35 4 Q 37 4 37 6 L 37 22 L 41 26 Q 43 28 43 31 L 43 110 Q 43 122 25 122 Q 7 122 7 110 L 7 31 Q 7 28 9 26 L 13 22 Z"
          fill={cm('var(--wp-surface-2)', 70)} stroke={accentMix(35, 'var(--wp-border)')} strokeWidth={1.4} />
        <rect x={11} y={1} width={28} height={6} rx={1.5}
          fill={warnMix(45, 'var(--wp-surface-2)')} stroke={warnMix(70)} strokeWidth={0.8} />
        <g clipPath={`url(#vial-clip-${sub.id})`}>
          <rect x={0} y={122 - fill} width={50} height={fill} fill={`url(#vial-grad-${sub.id})`} />
          <ellipse cx={25} cy={122 - fill} rx={18} ry={2.4} fill={acc2Mix(80)} opacity={0.55} />
          {[0, 1, 2].map((i) => (
            <motion.circle key={i}
              cx={18 + ((hueOffset * 14 + i * 4) % 14)}
              r={1.1 + (i % 2) * 0.4}
              fill={cm('var(--wp-accent-2)', 80, 'white')}
              opacity={0.55}
              initial={{ cy: 120 }}
              animate={{ cy: [120, 122 - fill + 4, 122 - fill + 4] }}
              transition={{ duration: 3.4 + i * 0.6, repeat: Infinity, delay: i * 0.7 + hueOffset * 1.4, ease: 'easeOut' }} />
          ))}
        </g>
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1={6} x2={11} y1={32 + (110 - 32) * p} y2={32 + (110 - 32) * p}
            stroke={accentMix(30, 'var(--wp-border)')} strokeWidth={0.6} />
        ))}
        {isSelected && (
          <motion.circle cx={25} cy={85} r={26} fill="none"
            stroke={accentMix(60)} strokeWidth={1}
            initial={{ opacity: 0.7, r: 24 }}
            animate={{ opacity: [0.7, 0.25, 0.7], r: [24, 30, 24] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />
        )}
      </svg>
      <span className="font-mono text-[8px] uppercase tracking-[0.2em]" style={{ color: 'var(--wp-text-faint)' }}>
        {String(sub.mailboxCount).padStart(2, '0')} MBX
      </span>
    </motion.button>
  );
}

function SpecimenRack({ subClients, selectedId, onSelect }: { subClients: AgencyToolsData['subClients']; selectedId: string; onSelect: (id: string) => void }): JSX.Element {
  const railRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="relative overflow-hidden rounded-lg"
      style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
      <HexGridBackdrop opacity={0.12} size={32} />
      <div className="relative flex flex-col gap-3 px-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TestTubes size={15} style={{ color: 'var(--wp-accent)' }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: 'var(--wp-text-dim)' }}>Specimen Rack &mdash; Sub-Client Vials</span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>
            SLOTS&nbsp;<span style={{ color: 'var(--wp-text)' }}>{String(subClients.length).padStart(2, '0')}</span>&nbsp;/&nbsp;12
          </span>
        </div>
        <div className="absolute inset-x-5 top-[42px] h-[10px] rounded-t"
          style={{
            background: `linear-gradient(180deg, ${accentMix(22, 'var(--wp-surface-2)')} 0%, var(--wp-surface-2) 100%)`,
            border: `1px solid ${accentMix(30, 'var(--wp-border)')}`, borderBottom: 'none',
          }} aria-hidden />
      </div>
      <div ref={railRef} className="relative flex gap-4 overflow-x-auto px-5 py-3 pb-6" style={{ scrollSnapType: 'x mandatory' }}>
        {subClients.map((sc, idx) => (
          <SpecimenVial key={sc.id} sub={sc} index={idx} isSelected={sc.id === selectedId} onSelect={() => onSelect(sc.id)} />
        ))}
      </div>
      <div className="relative mx-5 mb-4 h-3 rounded-b"
        style={{
          background: `linear-gradient(180deg, var(--wp-surface-2) 0%, ${accentMix(18, 'var(--wp-surface-2)')} 100%)`,
          border: `1px solid ${accentMix(30, 'var(--wp-border)')}`, borderTop: 'none',
        }} aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workstation row + per-tool apparatus illustrations.
// ---------------------------------------------------------------------------

function BenchSurface(): JSX.Element {
  return (
    <>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[18px]"
        style={{
          background: `linear-gradient(180deg, ${accentMix(18, 'var(--wp-surface-2)')} 0%, ${accentMix(8, 'var(--wp-bg)')} 100%)`,
          borderTop: `1px solid ${accentMix(28, 'var(--wp-border)')}`,
        }} />
      <div className="pointer-events-none absolute bottom-[18px] left-0 right-0 h-[1px]"
        style={{ background: acc2Mix(28) }} />
    </>
  );
}

function ToolAvailabilityPill({ available }: { available: boolean }): JSX.Element {
  return (
    <span className="flex items-center gap-1 rounded-full px-1.5 py-[2px] font-mono text-[8px] uppercase tracking-[0.22em]"
      style={{
        background: available ? sucMix(14) : dimMix(14),
        color: available ? 'var(--wp-success)' : 'var(--wp-text-dim)',
        border: `1px solid ${available ? sucMix(40) : dimMix(30)}`,
      }}>
      <span className="inline-block h-1 w-1 rounded-full" style={{ background: available ? 'var(--wp-success)' : 'var(--wp-text-dim)' }} />
      {available ? 'BENCH READY' : 'OFFLINE'}
    </span>
  );
}

function MicroscopeApparatus({ active }: { active: boolean }): JSX.Element {
  return (
    <svg width={170} height={150} viewBox="0 0 170 150" aria-hidden>
      <defs>
        <radialGradient id="ms-lens" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor={cm('var(--wp-accent-2)', 90, 'white')} />
          <stop offset="100%" stopColor={accentMix(60)} />
        </radialGradient>
      </defs>
      <rect x={42} y={120} width={86} height={10} rx={3} fill={accentMix(16, 'var(--wp-surface-2)')} stroke={accentMix(30, 'var(--wp-border)')} strokeWidth={1} />
      <rect x={56} y={104} width={58} height={4} rx={1.5} fill={cm('var(--wp-text)', 6, 'var(--wp-surface-2)')} stroke={accentMix(30, 'var(--wp-border)')} strokeWidth={0.8} />
      <rect x={70} y={100} width={30} height={6} rx={0.6} fill={acc2Mix(30)} stroke={accentMix(40)} strokeWidth={0.6} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={73} y={101.6 + i * 1.2} width={20 - i * 3} height={0.6} fill={accentMix(50)} />
      ))}
      <path d="M 60 100 L 50 78 L 50 52 Q 50 44 58 44 L 78 44" fill="none"
        stroke={accentMix(40, 'var(--wp-border-strong, var(--wp-border))')} strokeWidth={3} strokeLinecap="round" />
      <rect x={78} y={32} width={20} height={36} rx={4} fill={cm('var(--wp-surface-2)', 80)} stroke={accentMix(40, 'var(--wp-border)')} strokeWidth={1.4} />
      <rect x={80} y={22} width={16} height={12} rx={2} fill={accentMix(14, 'var(--wp-surface-2)')} stroke={accentMix(40, 'var(--wp-border)')} strokeWidth={1} />
      <circle cx={88} cy={84} r={10} fill={cm('var(--wp-surface-2)', 90)} stroke={accentMix(50)} strokeWidth={1.4} />
      <circle cx={84} cy={86} r={3} fill="url(#ms-lens)" />
      <circle cx={92} cy={86} r={3.5} fill={warnMix(50)} />
      <circle cx={88} cy={92} r={3} fill={accentMix(55)} />
      {active && (
        <>
          <motion.circle cx={88} cy={86} r={14} fill="none" stroke={accentMix(55)} strokeWidth={1.2}
            initial={{ opacity: 0.5, r: 12 }}
            animate={{ opacity: [0.55, 0, 0.55], r: [12, 22, 12] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeOut' }} />
          <motion.line x1={120} y1={50} x2={150} y2={36} stroke={acc2Mix(75)} strokeWidth={1.2} strokeDasharray="3 3"
            initial={{ opacity: 0.3 }} animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity }} />
        </>
      )}
      <polygon points="146,28 158,28 164,38 158,48 146,48 140,38" fill="none" stroke={accentMix(35)} strokeWidth={0.8} />
      <text x={152} y={42} fontSize={7} fontFamily="ui-monospace, monospace" textAnchor="middle" fill={acc2Mix(80)} letterSpacing="0.18em">OBS</text>
    </svg>
  );
}

function PetriArrayApparatus({ active }: { active: boolean }): JSX.Element {
  const positions = [
    { cx: 42, cy: 60, r: 26, cells: 5 },
    { cx: 110, cy: 60, r: 26, cells: 7 },
    { cx: 42, cy: 110, r: 26, cells: 6 },
    { cx: 110, cy: 110, r: 26, cells: 4 },
  ];
  return (
    <svg width={170} height={150} viewBox="0 0 170 150" aria-hidden>
      <defs>
        <radialGradient id="petri-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={acc2Mix(36)} />
          <stop offset="100%" stopColor={accentMix(28)} />
        </radialGradient>
      </defs>
      <ellipse cx={85} cy={140} rx={70} ry={4} fill={accentMix(8)} opacity={0.4} />
      {positions.map((p, i) => (
        <g key={i}>
          <circle cx={p.cx} cy={p.cy} r={p.r} fill={cm('var(--wp-surface-2)', 92)} stroke={accentMix(38)} strokeWidth={1.4} />
          <circle cx={p.cx} cy={p.cy} r={p.r - 3} fill="url(#petri-grad)" />
          <ellipse cx={p.cx - 6} cy={p.cy - 9} rx={p.r - 10} ry={3} fill={cm('white', 12)} opacity={0.45} />
          {Array.from({ length: p.cells }).map((_, j) => {
            const angle = (j / p.cells) * Math.PI * 2 + i * 0.6;
            const dist = ((j * 7) % (p.r - 8)) + 4;
            const x = p.cx + Math.cos(angle) * dist;
            const y = p.cy + Math.sin(angle) * dist;
            const rad = 1.6 + ((j * 3) % 3) * 0.5;
            return (
              <motion.circle key={j} cx={x} cy={y}
                fill={cm('var(--wp-accent)', 65, 'var(--wp-accent-2)')}
                stroke={acc2Mix(70)} strokeWidth={0.4}
                initial={{ r: rad * 0.4, opacity: 0.4 }}
                animate={active ? { r: [rad * 0.7, rad, rad * 0.85], opacity: [0.55, 0.9, 0.6] } : { r: rad, opacity: 0.7 }}
                transition={active ? { duration: 3 + (j % 3), repeat: Infinity, ease: 'easeInOut', delay: j * 0.15 } : undefined} />
            );
          })}
          <rect x={p.cx - 12} y={p.cy + p.r + 1} width={24} height={6} rx={1}
            fill={warnMix(14, 'var(--wp-surface-2)')} stroke={warnMix(40)} strokeWidth={0.5} />
          <text x={p.cx} y={p.cy + p.r + 5.5} fontSize={4} fontFamily="ui-monospace, monospace" textAnchor="middle"
            fill={warnMix(75)} letterSpacing="0.1em">VAR-{String.fromCharCode(65 + i)}</text>
        </g>
      ))}
    </svg>
  );
}

function FlaskApparatus({ active }: { active: boolean }): JSX.Element {
  const bubbleCount = 8;
  return (
    <svg width={170} height={150} viewBox="0 0 170 150" aria-hidden>
      <defs>
        <linearGradient id="flask-liq" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={acc2Mix(65)} />
          <stop offset="100%" stopColor={accentMix(60)} />
        </linearGradient>
        <clipPath id="flask-clip">
          <path d="M 75 28 L 95 28 L 95 64 L 128 122 Q 130 132 120 132 L 50 132 Q 40 132 42 122 L 75 64 Z" />
        </clipPath>
      </defs>
      <rect x={70} y={132} width={30} height={4} fill={accentMix(30, 'var(--wp-surface-2)')} stroke={accentMix(50)} strokeWidth={0.8} />
      <path d="M 75 28 L 95 28 L 95 64 L 128 122 Q 130 132 120 132 L 50 132 Q 40 132 42 122 L 75 64 Z"
        fill={cm('var(--wp-surface-2)', 80)} stroke={accentMix(50, 'var(--wp-border)')} strokeWidth={1.6} />
      <rect x={73} y={24} width={24} height={6} rx={1.5} fill={warnMix(32, 'var(--wp-surface-2)')} stroke={warnMix(60)} strokeWidth={0.8} />
      <g clipPath="url(#flask-clip)">
        <rect x={20} y={86} width={140} height={50} fill="url(#flask-liq)" />
        <motion.path d="M 30 88 Q 60 84 90 88 T 150 88 L 150 95 L 30 95 Z"
          fill={acc2Mix(80)} opacity={0.55}
          animate={active ? { d: ['M 30 88 Q 60 84 90 88 T 150 88 L 150 95 L 30 95 Z', 'M 30 88 Q 60 92 90 88 T 150 88 L 150 95 L 30 95 Z'] } : undefined}
          transition={active ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : undefined} />
        {Array.from({ length: bubbleCount }).map((_, i) => {
          const xBase = 50 + (i * 11) % 60;
          const r = 1.4 + (i % 3) * 0.8;
          return (
            <motion.circle key={i} cx={xBase} r={r}
              fill={cm('var(--wp-accent-2)', 85, 'white')} opacity={0.7}
              initial={{ cy: 128, opacity: 0 }}
              animate={active ? { cy: [128, 92, 88], opacity: [0, 0.8, 0] } : { cy: 128, opacity: 0 }}
              transition={active ? { duration: 2.4 + (i % 3) * 0.6, repeat: Infinity, delay: (i * 0.27) % 2.2, ease: 'easeOut' } : undefined} />
          );
        })}
      </g>
      {active && [0, 1, 2].map((i) => (
        <motion.path key={i}
          d={`M ${82 + i * 4} 24 Q ${78 + i * 4} 16 ${82 + i * 4} 10 Q ${88 + i * 4} 4 ${82 + i * 4} -4`}
          fill="none" stroke={acc2Mix(60)} strokeWidth={1.2} strokeLinecap="round"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: [0, 0.6, 0], y: [6, -6, -14] }}
          transition={{ duration: 3.4 + i * 0.4, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }} />
      ))}
      {[100, 110, 120].map((y) => (
        <line key={y} x1={50} x2={55} y1={y} y2={y} stroke={accentMix(35)} strokeWidth={0.6} />
      ))}
    </svg>
  );
}

function CentrifugeApparatus({ active }: { active: boolean }): JSX.Element {
  return (
    <svg width={170} height={150} viewBox="0 0 170 150" aria-hidden>
      <defs>
        <radialGradient id="centri-body" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%" stopColor={accentMix(18, 'var(--wp-surface-2)')} />
          <stop offset="100%" stopColor={accentMix(6, 'var(--wp-surface-2)')} />
        </radialGradient>
      </defs>
      <rect x={36} y={120} width={98} height={12} rx={2} fill={accentMix(18, 'var(--wp-surface-2)')} stroke={accentMix(40)} strokeWidth={1} />
      <ellipse cx={85} cy={84} rx={62} ry={42} fill="url(#centri-body)" stroke={accentMix(40, 'var(--wp-border)')} strokeWidth={1.6} />
      <ellipse cx={85} cy={84} rx={50} ry={32} fill={cm('var(--wp-bg)', 55, 'var(--wp-surface-2)')} stroke={accentMix(30, 'var(--wp-border)')} strokeWidth={1} />
      <line x1={28} x2={142} y1={66} y2={66} stroke={accentMix(22)} strokeWidth={1} strokeDasharray="2 3" />
      <motion.g style={{ transformOrigin: '85px 84px' }}
        animate={active ? { rotate: 360 } : { rotate: 0 }}
        transition={active ? { duration: 4, repeat: Infinity, ease: 'linear' } : undefined}>
        <circle cx={85} cy={84} r={26} fill={accentMix(14, 'var(--wp-surface-2)')} stroke={accentMix(45)} strokeWidth={1.2} />
        {[0, 90, 180, 270].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const tx = 85 + Math.cos(rad) * 20;
          const ty = 84 + Math.sin(rad) * 20;
          return (
            <g key={deg} transform={`translate(${tx}, ${ty}) rotate(${deg})`}>
              <rect x={-4} y={-2.5} width={14} height={5} rx={1.4} fill={acc2Mix(60)} stroke={accentMix(60)} strokeWidth={0.6} />
              <rect x={-4} y={-2.5} width={7} height={5} fill={accentMix(70)} />
            </g>
          );
        })}
        <circle cx={85} cy={84} r={3} fill={warnMix(60)} stroke={accentMix(60)} strokeWidth={0.8} />
      </motion.g>
      <rect x={40} y={124} width={90} height={8} rx={1.5} fill={cm('var(--wp-bg)', 60, 'var(--wp-surface-2)')} stroke={accentMix(32)} strokeWidth={0.8} />
      {[0, 1, 2, 3].map((i) => (
        <motion.circle key={i} cx={50 + i * 22} cy={128} r={2}
          fill={i === 0 ? sucMix(80) : i === 1 ? accentMix(80) : i === 2 ? warnMix(80) : acc2Mix(80)}
          animate={active ? { opacity: [0.5, 1, 0.5] } : undefined}
          transition={active ? { duration: 1.4, repeat: Infinity, delay: i * 0.18 } : undefined} />
      ))}
      {active && [0, 1, 2].map((i) => (
        <motion.path key={i}
          d={`M ${65 + i * 8} 84 A 20 20 0 0 1 ${105 - i * 8} 84`}
          fill="none" stroke={acc2Mix(50)} strokeWidth={0.8} strokeLinecap="round"
          initial={{ opacity: 0 }} animate={{ opacity: [0, 0.6, 0] }}
          transition={{ duration: 1.6 + i * 0.4, repeat: Infinity, delay: i * 0.2 }} />
      ))}
    </svg>
  );
}

function ApparatusForSlug({ slug, active }: { slug: ToolSlug; active: boolean }): JSX.Element {
  switch (slug) {
    case 'preview': return <MicroscopeApparatus active={active} />;
    case 'templates': return <PetriArrayApparatus active={active} />;
    case 'spam': return <FlaskApparatus active={active} />;
    case 'placement': return <CentrifugeApparatus active={active} />;
    default: return <MicroscopeApparatus active={active} />;
  }
}

function Workstation({ tool, index, loadedSpec, onBegin }: { tool: AgencyToolsData['tools'][number]; index: number; loadedSpec: AgencyToolsData['subClients'][number]; onBegin: () => void }): JSX.Element {
  const meta = TOOL_META[tool.slug];
  return (
    <motion.div className="relative flex flex-col overflow-hidden rounded-lg"
      style={{
        background: `linear-gradient(180deg, var(--wp-surface) 0%, ${accentMix(4, 'var(--wp-surface)')} 100%)`,
        border: `1px solid ${accentMix(20, 'var(--wp-border)')}`,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 * index + 0.05, duration: 0.4 }}>
      <HexGridBackdrop opacity={0.07} size={26} />
      {/* Catalog header */}
      <div className="relative flex items-center justify-between gap-2 px-4 py-2"
        style={{
          background: `linear-gradient(180deg, ${accentMix(14, 'var(--wp-surface-2)')} 0%, ${accentMix(6, 'var(--wp-surface-2)')} 100%)`,
          borderBottom: `1px solid ${accentMix(22, 'var(--wp-border)')}`,
        }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.28em]" style={{ color: 'var(--wp-accent)' }}>CAT &middot; {meta.catalog}</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>/ {meta.apparatus}</span>
        </div>
        <ToolAvailabilityPill available={tool.available} />
      </div>
      {/* Apparatus illustration */}
      <div className="relative flex h-[180px] items-center justify-center"
        style={{ background: `radial-gradient(circle at center, ${accentMix(7, 'var(--wp-surface)')} 0%, var(--wp-surface) 70%)` }}>
        <ApparatusForSlug slug={tool.slug} active={tool.available} />
        <BenchSurface />
      </div>
      {/* Body */}
      <div className="relative flex flex-1 flex-col gap-3 px-4 py-4">
        <div>
          <div className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--wp-text)' }}>{tool.name}</div>
          <div className="text-[11px] leading-snug" style={{ color: 'var(--wp-text-dim)' }}>{tool.short}</div>
        </div>
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--wp-text-dim)' }}>{tool.description}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>Last test</span>
            <span className="text-[12px]" style={{ color: 'var(--wp-text)' }}>{relTime(tool.lastRunAt)}</span>
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>30 d runs</span>
            <span className="text-[12px]" style={{ color: 'var(--wp-text)', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(tool.runsLast30d)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
          style={{ background: accentMix(6, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
          <div className="flex items-center gap-1.5">
            <TestTube size={11} style={{ color: 'var(--wp-accent)' }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>Specimen</span>
            <span className="font-mono text-[10px] tracking-[0.04em]" style={{ color: 'var(--wp-text)' }}>{loadedSpec.name}</span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: SUB_STATUS_META[loadedSpec.status].color }}>{SUB_STATUS_META[loadedSpec.status].label}</span>
        </div>
        <button type="button" onClick={onBegin} disabled={!tool.available}
          className="group/btn relative mt-1 flex items-center justify-center gap-2 rounded-md py-2 text-[11px] font-semibold uppercase tracking-[0.22em] transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            background: `linear-gradient(180deg, ${accentMix(22, 'var(--wp-surface)')} 0%, ${accentMix(14, 'var(--wp-surface)')} 100%)`,
            border: `1px solid ${accentMix(50)}`, color: 'var(--wp-accent)',
          }}>
          <Play size={11} />{meta.actionLabel}
        </button>
      </div>
    </motion.div>
  );
}

function WorkstationRow({ tools, loadedSpec, onBegin }: { tools: AgencyToolsData['tools']; loadedSpec: AgencyToolsData['subClients'][number]; onBegin: (slug: ToolSlug) => void }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {tools.map((tool, idx) => (
        <Workstation key={tool.slug} tool={tool} index={idx} loadedSpec={loadedSpec} onBegin={() => onBegin(tool.slug)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LabNotebook — recent runs styled as handwritten lab notes.
// ---------------------------------------------------------------------------

function StatusSticker({ status }: { status: ToolRunStatus }): JSX.Element {
  const stat = STATUS_META[status];
  const Icon = status === 'completed' ? CheckCircle2 : status === 'failed' ? XCircle : status === 'running' ? Activity : Clock;
  const rot = status === 'failed' ? '-3deg' : status === 'completed' ? '-1deg' : '2deg';
  return (
    <motion.span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.22em]"
      style={{ background: cm(stat.color, 14), color: stat.color, border: `1px solid ${cm(stat.color, 40)}`, transform: `rotate(${rot})` }}
      animate={status === 'running' ? { opacity: [0.7, 1, 0.7] } : undefined}
      transition={status === 'running' ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}>
      <Icon size={9} /> {stat.sticker}
    </motion.span>
  );
}

function NotebookEntry({ run, toolName, index }: { run: AgencyToolsData['recentRuns'][number]; toolName: string; index: number }): JSX.Element {
  const stat = STATUS_META[run.status];
  return (
    <motion.div className="relative flex flex-col gap-1"
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * index + 0.1, duration: 0.35 }}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10px] italic tracking-[0.12em]" style={{ color: 'var(--wp-text-faint)' }}>
          {fmtDateStamp(run.startedAt)} &middot; {fmtClock(run.startedAt)} UTC
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-accent)' }}>{toolName}</span>
        <StatusSticker status={run.status} />
      </div>
      <p className="text-[12px] leading-snug"
        style={{ color: 'var(--wp-text)', fontFamily: '"Caveat", "Patrick Hand", "Comic Sans MS", system-ui, sans-serif', letterSpacing: '0.01em' }}>
        <span style={{ color: 'var(--wp-text-dim)' }}>Test on </span>
        <span style={{ color: 'var(--wp-accent)' }}>{run.subClientName}</span>
        <span style={{ color: 'var(--wp-text-dim)' }}> &mdash; </span>
        {run.summary}
      </p>
      <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: 'var(--wp-text-faint)' }}>
        <span className="inline-flex items-center gap-1"><Timer size={10} /> {fmtDuration(run.durationMs)}</span>
        <span className="inline-flex items-center gap-1"><Quote size={9} style={{ color: stat.color }} /><span style={{ color: stat.color }}>{stat.label.toLowerCase()}</span></span>
        <span className="ml-auto inline-block" aria-hidden
          style={{ width: 40, height: 6, backgroundImage: `linear-gradient(90deg, transparent 0%, ${warnMix(38)} 30%, transparent 100%)` }} />
      </div>
    </motion.div>
  );
}

function NotebookSpine(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] flex w-[24px] flex-col items-center justify-around py-3" aria-hidden
      style={{
        background: `linear-gradient(90deg, ${warnMix(12, 'var(--wp-surface-2)')} 0%, transparent 100%)`,
        borderRight: `1px solid ${warnMix(22, 'var(--wp-border)')}`,
      }}>
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full"
          style={{ background: warnMix(20, 'var(--wp-surface-2)'), border: `1px solid ${warnMix(35)}` }} />
      ))}
    </div>
  );
}

function LabNotebook({ runs, tools }: { runs: AgencyToolsData['recentRuns']; tools: AgencyToolsData['tools'] }): JSX.Element {
  const toolByslug = useMemo(() => {
    const m = new Map<ToolSlug, AgencyToolsData['tools'][number]>();
    tools.forEach((t) => m.set(t.slug, t));
    return m;
  }, [tools]);

  return (
    <div className="relative overflow-hidden rounded-lg"
      style={{ background: warnMix(4, 'var(--wp-surface)'), border: `1px solid ${warnMix(22, 'var(--wp-border)')}` }}>
      <NotebookSpine />
      <div className="relative flex items-center justify-between gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${warnMix(22, 'var(--wp-border)')}` }}>
        <div className="flex items-center gap-2">
          <ClipboardList size={14} style={{ color: 'var(--wp-warning)' }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.28em]" style={{ color: 'var(--wp-text-dim)' }}>Laboratory Notebook</span>
        </div>
        <div className="flex items-center gap-2">
          <Bookmark size={12} style={{ color: 'var(--wp-warning)' }} />
          <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>VOL.&nbsp;3 / PG.&nbsp;42</span>
        </div>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0" aria-hidden
          style={{
            backgroundImage: `repeating-linear-gradient(180deg, transparent 0px, transparent 32px, ${warnMix(14)} 32px, ${warnMix(14)} 33px)`,
            opacity: 0.6,
          }} />
        <div className="pointer-events-none absolute inset-y-0 left-[52px] w-px" style={{ background: cm('var(--wp-danger)', 35) }} aria-hidden />
        <div className="relative flex flex-col gap-3 px-5 py-4 pl-[68px]">
          <AnimatePresence>
            {runs.slice(0, 8).map((run, idx) => {
              const tool = toolByslug.get(run.toolSlug);
              return <NotebookEntry key={run.id} run={run} toolName={tool?.name ?? run.toolSlug} index={idx} />;
            })}
          </AnimatePresence>
        </div>
      </div>
      <div className="relative flex items-center justify-between gap-2 px-5 py-2"
        style={{ borderTop: `1px solid ${warnMix(22, 'var(--wp-border)')}`, background: warnMix(6) }}>
        <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>Signed &mdash; Dr. Helix &middot; Bench A1</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>PG.&nbsp;42/120</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InventoryFooter — reagents in stock + lab safety panel.
// ---------------------------------------------------------------------------

function ReagentRow({ reagent, index }: { reagent: { slug: ToolSlug; catalog: string; reagent: string; stockPct: number; runs: number }; index: number }): JSX.Element {
  const lowStock = reagent.stockPct < 35;
  const color = lowStock ? 'var(--wp-warning)' : 'var(--wp-accent)';
  return (
    <motion.div className="relative flex items-center gap-3 rounded-md px-2.5 py-2"
      style={{ background: accentMix(4, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(12, 'var(--wp-border)')}` }}
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index + 0.15, duration: 0.3 }}>
      <svg width={26} height={36} viewBox="0 0 26 36" aria-hidden>
        <defs>
          <linearGradient id={`reag-${reagent.slug}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={cm(color, 70)} />
            <stop offset="100%" stopColor={cm(color, 30)} />
          </linearGradient>
          <clipPath id={`reag-clip-${reagent.slug}`}>
            <path d="M 5 4 L 21 4 L 21 12 L 24 30 Q 25 34 21 34 L 5 34 Q 1 34 2 30 L 5 12 Z" />
          </clipPath>
        </defs>
        <path d="M 5 4 L 21 4 L 21 12 L 24 30 Q 25 34 21 34 L 5 34 Q 1 34 2 30 L 5 12 Z"
          fill={cm('var(--wp-surface-2)', 80)} stroke={accentMix(40, 'var(--wp-border)')} strokeWidth={0.8} />
        <g clipPath={`url(#reag-clip-${reagent.slug})`}>
          <rect x={0} y={34 - (reagent.stockPct / 100) * 24} width={26} height={(reagent.stockPct / 100) * 26} fill={`url(#reag-${reagent.slug})`} />
        </g>
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>{reagent.catalog}</span>
          <span className="truncate text-[11px] font-medium" style={{ color: 'var(--wp-text)' }}>{reagent.reagent}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: accentMix(10, 'var(--wp-bg)') }}>
            <motion.div className="h-full rounded-full" style={{ background: color }}
              initial={{ width: 0 }} animate={{ width: `${reagent.stockPct}%` }}
              transition={{ duration: 0.8, delay: 0.05 * index + 0.2, ease: 'easeOut' }} />
          </div>
          <span className="font-mono text-[10px]" style={{ color: lowStock ? 'var(--wp-warning)' : 'var(--wp-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
            {reagent.stockPct.toFixed(0)}%
          </span>
        </div>
      </div>
      <span className="font-mono text-[10px]" style={{ color: 'var(--wp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(reagent.runs)}&nbsp;runs</span>
    </motion.div>
  );
}

function FooterStat({ label, value, icon, tone = 'neutral' }: { label: string; value: string; icon: JSX.Element; tone?: 'neutral' | 'warning' | 'success' | 'danger' }): JSX.Element {
  const colorMap = { neutral: 'var(--wp-text)', warning: 'var(--wp-warning)', success: 'var(--wp-success)', danger: 'var(--wp-danger)' } as const;
  return (
    <div className="rounded-md px-2 py-1.5"
      style={{ background: accentMix(5, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(14, 'var(--wp-border)')}` }}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: 'var(--wp-text-faint)' }}>{icon}</span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>{label}</span>
      </div>
      <div className="text-[14px] font-semibold leading-tight" style={{ color: colorMap[tone], fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function InventoryFooter({ data }: { data: AgencyToolsData }): JSX.Element {
  const totalDuration = data.recentRuns.reduce((s, r) => s + r.durationMs, 0);
  const avgDuration = data.recentRuns.length > 0 ? totalDuration / data.recentRuns.length : 0;
  const failed = data.recentRuns.filter((r) => r.status === 'failed').length;
  const safety: 'green' | 'amber' | 'red' = failed === 0 ? 'green' : failed <= 1 ? 'amber' : 'red';
  const safetyColor = safety === 'green' ? 'var(--wp-success)' : safety === 'amber' ? 'var(--wp-warning)' : 'var(--wp-danger)';
  const safetyLabel = safety === 'green' ? 'ALL CLEAR' : safety === 'amber' ? 'CAUTION' : 'ATTENTION';

  const reagents = data.tools.map((t, i) => ({
    slug: t.slug,
    catalog: TOOL_META[t.slug].catalog,
    reagent: TOOL_META[t.slug].reagent,
    stockPct: Math.max(20, 90 - i * 14 + (hashSeed(t.slug, 21) * 18 - 9)),
    runs: t.runsLast30d,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="relative col-span-1 overflow-hidden rounded-lg lg:col-span-2"
        style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(18, 'var(--wp-border)')}` }}>
        <HexGridBackdrop opacity={0.07} size={28} />
        <div className="relative flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
          <div className="flex items-center gap-2">
            <BeakerIcon size={13} style={{ color: 'var(--wp-accent)' }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-dim)' }}>Reagent Inventory</span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>CABINET&nbsp;C-1</span>
        </div>
        <div className="relative grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2">
          {reagents.map((r, i) => <ReagentRow key={r.slug} reagent={r} index={i} />)}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-lg"
        style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(18, 'var(--wp-border)')}` }}>
        <HexGridBackdrop opacity={0.07} size={28} />
        <div className="relative flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
          <div className="flex items-center gap-2">
            <Shield size={13} style={{ color: 'var(--wp-accent)' }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-dim)' }}>Lab Safety</span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>POST&nbsp;A</span>
        </div>
        <div className="relative flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <motion.div className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: cm(safetyColor, 14), border: `1.5px solid ${cm(safetyColor, 55)}` }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
              {failed === 0 ? <CheckCircle2 size={22} style={{ color: safetyColor }} /> : <AlertTriangle size={22} style={{ color: safetyColor }} />}
            </motion.div>
            <div className="flex flex-col leading-tight">
              <span className="font-mono text-[9px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-faint)' }}>Status</span>
              <span className="text-[16px] font-semibold" style={{ color: safetyColor }}>{safetyLabel}</span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--wp-text-dim)' }}>{failed} failed / {data.recentRuns.length} recent</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FooterStat label="AVG DURATION" value={fmtDuration(avgDuration)} icon={<Timer size={11} />} />
            <FooterStat label="COMPLETED TODAY" value={fmtInt(data.summary.totalRunsToday)} icon={<CheckCircle2 size={11} />} tone="success" />
            <FooterStat label="QUEUED" value={fmtInt(data.summary.queuedRuns)} icon={<TestTubes size={11} />} tone={data.summary.queuedRuns > 0 ? 'warning' : 'neutral'} />
            <FooterStat label="LAB INDEX" value={data.summary.avgPlacementScore.toFixed(1)} icon={<TrendingUp size={11} />} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Specimen banner + bench shortcuts + run flash + section title.
// ---------------------------------------------------------------------------

function SpecimenLoadedBanner({ spec, onClear }: { spec: AgencyToolsData['subClients'][number]; onClear: () => void }): JSX.Element {
  return (
    <motion.div className="relative flex flex-wrap items-center gap-3 rounded-md px-4 py-2"
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      style={{
        background: `linear-gradient(90deg, ${accentMix(12, 'var(--wp-surface)')} 0%, ${accentMix(4, 'var(--wp-surface)')} 100%)`,
        border: `1px solid ${accentMix(28, 'var(--wp-border)')}`,
      }}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full"
        style={{ background: accentMix(28), border: `1px solid ${accentMix(55)}` }}>
        <TestTube size={12} style={{ color: 'var(--wp-accent)' }} />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[9px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-faint)' }}>Specimen loaded into workstations</span>
        <span className="text-[12px] font-semibold" style={{ color: 'var(--wp-text)' }}>
          {spec.name}
          <span className="ml-2 font-mono text-[10px] font-normal" style={{ color: 'var(--wp-text-dim)' }}>
            {spec.domain} &middot; {spec.mailboxCount} mailbox{spec.mailboxCount === 1 ? '' : 'es'}
          </span>
        </span>
      </div>
      <button type="button" onClick={onClear}
        className="ml-auto flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[9px] uppercase tracking-[0.22em] transition-colors"
        style={{ color: 'var(--wp-text-dim)', border: `1px solid ${accentMix(22, 'var(--wp-border)')}`, background: 'transparent' }}>
        <Search size={10} />Swap specimen
      </button>
    </motion.div>
  );
}

interface RunFlashState { id: string; toolName: string; specName: string }

function RunFlash({ state, onDismiss }: { state: RunFlashState | null; onDismiss: () => void }): JSX.Element {
  useEffect(() => {
    if (!state) return;
    const id = window.setTimeout(onDismiss, 3200);
    return () => window.clearTimeout(id);
  }, [state, onDismiss]);

  return (
    <AnimatePresence>
      {state && (
        <motion.div key={state.id}
          className="pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-lg px-4 py-3"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            background: `linear-gradient(180deg, ${accentMix(18, 'var(--wp-surface)')} 0%, var(--wp-surface) 100%)`,
            border: `1px solid ${accentMix(45)}`,
            boxShadow: `0 10px 36px ${accentMix(24)}`,
          }}>
          <Sparkles size={16} style={{ color: 'var(--wp-accent)' }} />
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-[9px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-faint)' }}>Test bench engaged</span>
            <span className="text-[12.5px]" style={{ color: 'var(--wp-text)' }}>{state.toolName} &middot; {state.specName}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionTitle({ kicker, title, icon }: { kicker: string; title: string; icon: JSX.Element }): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded"
        style={{ background: accentMix(14), border: `1px solid ${accentMix(32)}`, color: 'var(--wp-accent)' }}>
        {icon}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="font-mono text-[9px] uppercase tracking-[0.28em]" style={{ color: 'var(--wp-text-faint)' }}>{kicker}</span>
        <span className="text-[14px] font-semibold" style={{ color: 'var(--wp-text)' }}>{title}</span>
      </div>
    </div>
  );
}

function ShortcutGlyph({ slug }: { slug: ToolSlug }): JSX.Element {
  const Icon = slug === 'preview' ? Microscope : slug === 'templates' ? FlaskConical : slug === 'spam' ? BeakerIcon : TestTubes;
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded"
      style={{ background: accentMix(14), border: `1px solid ${accentMix(36)}` }}>
      <Icon size={14} style={{ color: 'var(--wp-accent)' }} />
    </span>
  );
}

function BenchShortcuts({ loadedSpec, tools, onBegin }: { loadedSpec: AgencyToolsData['subClients'][number]; tools: AgencyToolsData['tools']; onBegin: (slug: ToolSlug) => void }): JSX.Element {
  return (
    <div className="relative flex flex-col gap-2 overflow-hidden rounded-lg p-3"
      style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(18, 'var(--wp-border)')}` }}>
      <HexGridBackdrop opacity={0.07} size={26} />
      <div className="relative flex items-center justify-between gap-2 pb-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-faint)' }}>Specimen</span>
        <span className="font-mono text-[10px] tracking-[0.06em]" style={{ color: 'var(--wp-accent)' }}>{loadedSpec.name}</span>
      </div>
      <div className="relative flex flex-col gap-2">
        {tools.map((t, i) => (
          <motion.button key={t.slug} type="button" onClick={() => onBegin(t.slug)}
            className="relative flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left"
            style={{ background: accentMix(4, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}
            initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i + 0.1, duration: 0.3 }} whileHover={{ x: -2 }}>
            <div className="flex items-center gap-2">
              <ShortcutGlyph slug={t.slug} />
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-medium" style={{ color: 'var(--wp-text)' }}>{t.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>
                  {TOOL_META[t.slug].catalog} &middot; {relTime(t.lastRunAt)}
                </span>
              </div>
            </div>
            <Play size={12} style={{ color: 'var(--wp-accent)' }} />
          </motion.button>
        ))}
      </div>
      <div className="relative mt-1 flex items-center gap-1.5 rounded px-2 py-1.5"
        style={{ background: warnMix(6, 'var(--wp-surface-2)'), border: `1px solid ${warnMix(22)}` }}>
        <AlertTriangle size={11} style={{ color: 'var(--wp-warning)' }} />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-warning)' }}>Wear gloves &middot; benches in use</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestQueueRack — small rack visualisation of queued / running tests with
// stop-clock style tube labels. Synthesises queue entries from data when
// summary.queuedRuns > 0; otherwise renders an "empty rack" placeholder.
// ---------------------------------------------------------------------------

interface QueueSlot {
  id: string;
  toolSlug: ToolSlug;
  subClientName: string;
  etaSeconds: number;
  fillPct: number;
  status: 'queued' | 'spinning';
}

function buildQueueSlots(data: AgencyToolsData): QueueSlot[] {
  const slots: QueueSlot[] = [];
  // Promote any `running` runs to spinning slots first.
  data.recentRuns
    .filter((r) => r.status === 'running')
    .forEach((r, i) =>
      slots.push({
        id: `running-${r.id}`,
        toolSlug: r.toolSlug,
        subClientName: r.subClientName,
        etaSeconds: 60 + i * 20,
        fillPct: 35 + i * 12,
        status: 'spinning',
      }),
    );
  // Then synthesise queue slots up to summary.queuedRuns.
  const remaining = Math.max(0, data.summary.queuedRuns - slots.length);
  for (let i = 0; i < remaining; i++) {
    const tool = data.tools[i % data.tools.length]!;
    const sub = data.subClients[(i + 1) % data.subClients.length]!;
    slots.push({
      id: `queued-${i}`,
      toolSlug: tool.slug,
      subClientName: sub.name,
      etaSeconds: 150 + i * 90,
      fillPct: 12 + i * 5,
      status: 'queued',
    });
  }
  return slots;
}

function QueueSlot({ slot, index }: { slot: QueueSlot; index: number }): JSX.Element {
  const meta = TOOL_META[slot.toolSlug];
  const color = slot.status === 'spinning' ? 'var(--wp-warning)' : 'var(--wp-accent)';
  return (
    <motion.div className="relative flex shrink-0 flex-col items-center gap-2"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index + 0.12, duration: 0.32 }} style={{ width: 86 }}>
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color }}>{meta.catalog}</span>
        <span className="truncate font-mono text-[8.5px] uppercase tracking-[0.16em]" style={{ color: 'var(--wp-text-faint)' }} title={slot.subClientName}>
          {slot.subClientName}
        </span>
      </div>
      <svg width={36} height={110} viewBox="0 0 36 110" aria-hidden>
        <defs>
          <linearGradient id={`q-grad-${slot.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={cm(color, 75)} />
            <stop offset="100%" stopColor={cm(color, 30)} />
          </linearGradient>
          <clipPath id={`q-clip-${slot.id}`}>
            <path d="M 8 4 L 28 4 L 28 18 L 32 22 L 32 96 Q 32 104 18 104 Q 4 104 4 96 L 4 22 L 8 18 Z" />
          </clipPath>
        </defs>
        <path d="M 8 4 L 28 4 L 28 18 L 32 22 L 32 96 Q 32 104 18 104 Q 4 104 4 96 L 4 22 L 8 18 Z"
          fill={cm('var(--wp-surface-2)', 70)} stroke={cm(color, 40, 'var(--wp-border)')} strokeWidth={1.2} />
        <rect x={6} y={1} width={24} height={5} rx={1} fill={warnMix(45, 'var(--wp-surface-2)')} stroke={warnMix(70)} strokeWidth={0.6} />
        <g clipPath={`url(#q-clip-${slot.id})`}>
          <rect x={0} y={104 - (slot.fillPct / 100) * 80} width={36} height={(slot.fillPct / 100) * 80} fill={`url(#q-grad-${slot.id})`} />
          {slot.status === 'spinning' && [0, 1].map((i) => (
            <motion.circle key={i} cx={14 + i * 8} r={1.2}
              fill={cm('var(--wp-accent-2)', 80, 'white')} opacity={0.7}
              initial={{ cy: 100 }}
              animate={{ cy: [100, 104 - (slot.fillPct / 100) * 80 + 3] }}
              transition={{ duration: 2.4 + i * 0.5, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }} />
          ))}
        </g>
        {/* Queue position numeral */}
        <text x={18} y={68} fontSize={9} fontFamily="ui-monospace, monospace" textAnchor="middle"
          fill={color} letterSpacing="0.16em" fontWeight={600}>{String(index + 1).padStart(2, '0')}</text>
      </svg>
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.2em]" style={{ color }}>
          {slot.status === 'spinning' ? 'IN BENCH' : 'QUEUED'}
        </span>
        <span className="font-mono text-[8.5px]" style={{ color: 'var(--wp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
          ETA {Math.floor(slot.etaSeconds / 60)}:{String(slot.etaSeconds % 60).padStart(2, '0')}
        </span>
      </div>
    </motion.div>
  );
}

function TestQueueRack({ data }: { data: AgencyToolsData }): JSX.Element {
  const slots = useMemo(() => buildQueueSlots(data), [data]);
  return (
    <div className="relative overflow-hidden rounded-lg"
      style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(18, 'var(--wp-border)')}` }}>
      <HexGridBackdrop opacity={0.08} size={28} />
      <div className="relative flex items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
        <div className="flex items-center gap-2">
          <TestTubes size={13} style={{ color: 'var(--wp-accent)' }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-dim)' }}>Queue Rack</span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>
          ON RACK&nbsp;<span style={{ color: 'var(--wp-text)' }}>{String(slots.length).padStart(2, '0')}</span>
        </span>
      </div>
      {slots.length === 0 ? (
        <div className="relative flex flex-col items-center justify-center gap-2 px-4 py-8">
          <CheckCircle2 size={22} style={{ color: 'var(--wp-success)' }} />
          <span className="text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>Bench clear &mdash; no queued tests.</span>
        </div>
      ) : (
        <div className="relative flex gap-4 overflow-x-auto px-4 py-4">
          {slots.map((s, i) => <QueueSlot key={s.id} slot={s} index={i} />)}
        </div>
      )}
      <div className="relative mx-4 mb-3 h-2 rounded-b"
        style={{
          background: `linear-gradient(180deg, var(--wp-surface-2) 0%, ${accentMix(16, 'var(--wp-surface-2)')} 100%)`,
          border: `1px solid ${accentMix(30, 'var(--wp-border)')}`, borderTop: 'none',
        }} aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalibrationPanel — sits beside the queue rack: lab dials showing live
// per-tool calibration indicators (success rate, avg duration, throughput).
// ---------------------------------------------------------------------------

interface CalibrationRow {
  slug: ToolSlug;
  name: string;
  catalog: string;
  successPct: number;
  avgMs: number;
  throughputPerHr: number;
}

function buildCalibrationRows(data: AgencyToolsData): CalibrationRow[] {
  return data.tools.map((t) => {
    const runs = data.recentRuns.filter((r) => r.toolSlug === t.slug);
    const completed = runs.filter((r) => r.status === 'completed').length;
    const successPct = runs.length > 0 ? (completed / runs.length) * 100 : 100;
    const totalMs = runs.reduce((s, r) => s + r.durationMs, 0);
    const avgMs = runs.length > 0 ? totalMs / runs.length : 0;
    const throughputPerHr = Math.round((t.runsLast30d / (30 * 24)) * 10) / 10;
    return {
      slug: t.slug,
      name: t.name,
      catalog: TOOL_META[t.slug].catalog,
      successPct,
      avgMs,
      throughputPerHr,
    };
  });
}

function CalibrationDial({ value, color, label, suffix }: { value: number; color: string; label: string; suffix?: string }): JSX.Element {
  // Half-circle dial 0..100. Needle rotates from -90deg to +90deg.
  const clamped = Math.max(0, Math.min(100, value));
  const angle = (clamped / 100) * 180 - 90;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={60} height={36} viewBox="0 0 60 36" aria-hidden>
        <defs>
          <linearGradient id={`dial-${label}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={cm(color, 30)} />
            <stop offset="100%" stopColor={cm(color, 70)} />
          </linearGradient>
        </defs>
        <path d="M 4 30 A 26 26 0 0 1 56 30" fill="none"
          stroke={cm('var(--wp-text-dim)', 18)} strokeWidth={3} strokeLinecap="round" />
        <path d="M 4 30 A 26 26 0 0 1 56 30" fill="none"
          stroke={`url(#dial-${label})`} strokeWidth={3} strokeLinecap="round"
          strokeDasharray="82"
          strokeDashoffset={82 - (clamped / 100) * 82} />
        <motion.line x1={30} y1={30} x2={30} y2={9} stroke={color} strokeWidth={1.4} strokeLinecap="round"
          style={{ transformOrigin: '30px 30px' }}
          initial={{ rotate: -90 }}
          animate={{ rotate: angle }}
          transition={{ duration: 0.8, ease: 'easeOut' }} />
        <circle cx={30} cy={30} r={2.2} fill={color} stroke={cm(color, 60, 'var(--wp-surface)')} strokeWidth={0.6} />
      </svg>
      <span className="font-mono text-[10px] font-semibold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
        {value.toFixed(1)}{suffix ?? ''}
      </span>
      <span className="font-mono text-[8px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>{label}</span>
    </div>
  );
}

function CalibrationRowView({ row, index }: { row: CalibrationRow; index: number }): JSX.Element {
  return (
    <motion.div className="relative flex items-center justify-between gap-3 rounded-md px-3 py-2"
      style={{ background: accentMix(4, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(14, 'var(--wp-border)')}` }}
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 * index + 0.18, duration: 0.32 }}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12px] font-medium" style={{ color: 'var(--wp-text)' }}>{row.name}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>
          {row.catalog} &middot; {row.throughputPerHr}/hr
        </span>
      </div>
      <div className="flex items-end gap-2">
        <CalibrationDial value={row.successPct} color="var(--wp-success)" label="OK%" suffix="%" />
        <CalibrationDial
          value={Math.min(100, (row.avgMs / 200_000) * 100)}
          color="var(--wp-accent)"
          label="DUR"
        />
      </div>
    </motion.div>
  );
}

function CalibrationPanel({ data }: { data: AgencyToolsData }): JSX.Element {
  const rows = useMemo(() => buildCalibrationRows(data), [data]);
  return (
    <div className="relative overflow-hidden rounded-lg"
      style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(18, 'var(--wp-border)')}` }}>
      <HexGridBackdrop opacity={0.08} size={28} />
      <div className="relative flex items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${accentMix(16, 'var(--wp-border)')}` }}>
        <div className="flex items-center gap-2">
          <Activity size={13} style={{ color: 'var(--wp-accent)' }} />
          <span className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: 'var(--wp-text-dim)' }}>Apparatus Calibration</span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--wp-text-faint)' }}>DIALS</span>
      </div>
      <div className="relative flex flex-col gap-2 px-4 py-3">
        {rows.map((r, i) => <CalibrationRowView key={r.slug} row={r} index={i} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BenchTelemetry — narrow strip of telemetry chips along with a small
// "today's focus" call-out: the leakiest sub-client by failed runs, and the
// busiest workstation. Sits between the workstation row and the queue rack
// to break up the visual rhythm.
// ---------------------------------------------------------------------------

function BenchTelemetry({ data }: { data: AgencyToolsData }): JSX.Element {
  const focus = useMemo(() => {
    const failedBySub = new Map<string, { sub: AgencyToolsData['subClients'][number]; failed: number }>();
    for (const r of data.recentRuns) {
      if (r.status !== 'failed') continue;
      const sub = data.subClients.find((s) => s.id === r.subClientId);
      if (!sub) continue;
      const cur = failedBySub.get(sub.id);
      failedBySub.set(sub.id, { sub, failed: (cur?.failed ?? 0) + 1 });
    }
    let worst: { sub: AgencyToolsData['subClients'][number]; failed: number } | null = null;
    for (const v of failedBySub.values()) {
      if (!worst || v.failed > worst.failed) worst = v;
    }
    return worst;
  }, [data.recentRuns, data.subClients]);

  const busiest = useMemo(() => {
    let best: AgencyToolsData['tools'][number] | null = null;
    for (const t of data.tools) {
      if (!best || t.runsLast30d > best.runsLast30d) best = t;
    }
    return best;
  }, [data.tools]);

  const sterileDays = 12; // synthetic streak — "12 days without a critical fault"
  const ppe = 'gloves · goggles · coat';

  return (
    <div className="relative overflow-hidden rounded-lg"
      style={{ background: 'var(--wp-surface)', border: `1px solid ${accentMix(18, 'var(--wp-border)')}` }}>
      <HexGridBackdrop opacity={0.07} size={26} />
      <div className="relative flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-stretch lg:justify-between">
        <TelemetryChip
          icon={<ThermometerSun size={14} />}
          label="BENCH TEMP"
          value="22.4 °C"
          sub="within range" tone="success" />
        <TelemetryChip
          icon={<Shield size={14} />}
          label="STERILE STREAK"
          value={`${sterileDays} d`}
          sub="no critical faults" tone="success" />
        <TelemetryChip
          icon={<FlaskConical size={14} />}
          label="PPE"
          value={ppe}
          sub="benches in use" />
        <div className="hidden h-full w-px lg:block" style={{ background: accentMix(14) }} />
        <TodaysFocus
          focus={focus}
          busiest={busiest} />
      </div>
    </div>
  );
}

function TelemetryChip({ icon, label, value, sub, tone = 'neutral' }: { icon: JSX.Element; label: string; value: string; sub: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }): JSX.Element {
  const colorMap = { neutral: 'var(--wp-text)', success: 'var(--wp-success)', warning: 'var(--wp-warning)', danger: 'var(--wp-danger)' } as const;
  return (
    <div className="flex min-w-[120px] flex-col gap-0.5 rounded-md px-3 py-2"
      style={{ background: accentMix(4, 'var(--wp-surface-2)'), border: `1px solid ${accentMix(14, 'var(--wp-border)')}` }}>
      <div className="flex items-center gap-1.5">
        <span style={{ color: 'var(--wp-text-faint)' }}>{icon}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>{label}</span>
      </div>
      <span className="text-[14px] font-semibold leading-tight" style={{ color: colorMap[tone] }}>{value}</span>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: 'var(--wp-text-dim)' }}>{sub}</span>
    </div>
  );
}

function TodaysFocus({ focus, busiest }: {
  focus: { sub: AgencyToolsData['subClients'][number]; failed: number } | null;
  busiest: AgencyToolsData['tools'][number] | null;
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-wrap items-stretch gap-3 rounded-md px-3 py-2"
      style={{
        background: `linear-gradient(90deg, ${warnMix(8, 'var(--wp-surface-2)')} 0%, ${accentMix(6, 'var(--wp-surface-2)')} 100%)`,
        border: `1px solid ${warnMix(22, 'var(--wp-border)')}`,
      }}>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>TODAY&rsquo;S FOCUS</span>
        {focus ? (
          <span className="text-[12.5px]" style={{ color: 'var(--wp-text)' }}>
            <span style={{ color: 'var(--wp-warning)' }}>Re-run </span>
            <span style={{ color: 'var(--wp-accent)' }}>{focus.sub.name}</span>
            <span style={{ color: 'var(--wp-text-dim)' }}> &mdash; {focus.failed} failed test{focus.failed === 1 ? '' : 's'} since yesterday.</span>
          </span>
        ) : (
          <span className="text-[12.5px]" style={{ color: 'var(--wp-text-dim)' }}>No failed tests on the bench. Maintain protocol.</span>
        )}
      </div>
      <div className="flex flex-col items-end justify-center gap-0.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em]" style={{ color: 'var(--wp-text-faint)' }}>BUSIEST</span>
        {busiest ? (
          <>
            <span className="text-[12px]" style={{ color: 'var(--wp-text)' }}>{busiest.name}</span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--wp-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
              {fmtInt(busiest.runsLast30d)} runs / 30 d
            </span>
          </>
        ) : (
          <span className="text-[12px]" style={{ color: 'var(--wp-text-dim)' }}>—</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function AgTolT2Lab({ data }: { data?: AgencyToolsData } = {}): JSX.Element {
  const d = data ?? MOCK;
  const [selectedSubId, setSelectedSubId] = useState<string>(() => d.subClients[0]?.id ?? '');
  const [flash, setFlash] = useState<RunFlashState | null>(null);

  const loadedSpec = useMemo(
    () => d.subClients.find((s) => s.id === selectedSubId) ?? d.subClients[0]!,
    [d.subClients, selectedSubId],
  );

  const onBegin = (slug: ToolSlug): void => {
    const tool = d.tools.find((t) => t.slug === slug);
    setFlash({ id: `${slug}-${Date.now()}`, toolName: tool?.name ?? slug, specName: loadedSpec.name });
  };

  const onClearSpec = (): void => {
    const idx = d.subClients.findIndex((s) => s.id === loadedSpec.id);
    const nxt = d.subClients[(idx + 1) % d.subClients.length];
    setSelectedSubId(nxt?.id ?? loadedSpec.id);
  };

  const rootStyle: CSSProperties = {
    minHeight: '100%',
    background: `radial-gradient(ellipse at top, ${accentMix(7, 'var(--wp-bg)')} 0%, var(--wp-bg) 60%)`,
  };

  return (
    <div className="relative" style={rootStyle}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
        <HexGridBackdrop opacity={0.08} size={42} />
      </div>
      <div className="relative mx-auto flex max-w-[1480px] flex-col gap-5 px-4 py-5 lg:px-6">
        <LabHeader data={d} />
        <SpecimenRack subClients={d.subClients} selectedId={loadedSpec.id} onSelect={setSelectedSubId} />
        <SpecimenLoadedBanner spec={loadedSpec} onClear={onClearSpec} />
        <SectionTitle kicker="BENCH-TOP WORKSTATIONS" title="Four apparatus, one specimen" icon={<Microscope size={14} />} />
        <WorkstationRow tools={d.tools} loadedSpec={loadedSpec} onBegin={onBegin} />

        <BenchTelemetry data={d} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <SectionTitle kicker="QUEUE RACK" title="Tests on the rack" icon={<TestTubes size={14} />} />
            <div className="mt-3"><TestQueueRack data={d} /></div>
          </div>
          <div className="lg:col-span-2">
            <SectionTitle kicker="APPARATUS CALIBRATION" title="Bench dials, last 24 h" icon={<Activity size={14} />} />
            <div className="mt-3"><CalibrationPanel data={d} /></div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 lg:order-1">
            <SectionTitle kicker="LABORATORY NOTEBOOK" title="Recent test entries" icon={<ClipboardList size={14} />} />
            <div className="mt-3"><LabNotebook runs={d.recentRuns} tools={d.tools} /></div>
          </div>
          <div className="flex flex-col gap-3 lg:order-2">
            <SectionTitle kicker="QUICK ACCESS" title="Bench shortcuts" icon={<Plus size={14} />} />
            <BenchShortcuts loadedSpec={loadedSpec} tools={d.tools} onBegin={onBegin} />
          </div>
        </div>
        <SectionTitle kicker="INVENTORY FOOTER" title="Reagents, completed tests, lab safety" icon={<BeakerIcon size={14} />} />
        <InventoryFooter data={d} />
      </div>
      <RunFlash state={flash} onDismiss={() => setFlash(null)} />
    </div>
  );
}

export default AgTolT2Lab;
