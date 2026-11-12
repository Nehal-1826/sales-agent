import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Beaker,
  CircleDot,
  Droplet,
  FlaskConical,
  Gauge,
  Loader2,
  Microscope,
  Play,
  Power,
  RotateCcw,
  ScanLine,
  Shuffle,
  Square,
  TestTube,
  TestTubes,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { formatDateTime } from '@/lib/format';

/**
 * ProPlusTool2Lab — "Experiment Lab Bench" (Pro Plus tier).
 *
 * A science-lab framing of the WarmPulse deliverability toolset. Deliberately
 * NOT a 3-pane IDE (ProPlusTool1Ide), NOT a centerpiece-card workbench
 * (ProPlusTools / ProTools), NOT a selector-strip + side launcher (ProTools),
 * NOT a comparison table (StarterTools), NOT a guided wizard / command
 * palette (sibling agents own those).
 *
 * The page is a laboratory:
 *   - TOP    — an instrument rack: lab/run status lamp, environment readouts,
 *              and a live "chart-recorder" tape that streams the run log as a
 *              scrolling strip (not a console, not a table).
 *   - MIDDLE — the flagship STATION: Placement Tester rendered as a lab assay.
 *              A specimen rack (mailbox picker) feeds a 30-well seed plate
 *              (microplate) that lights up well-by-well as seeds report, two
 *              analog instruments (an inbox-rate dial + a contamination/spam
 *              meter) sweep their needles, and a results readout panel resolves
 *              the per-provider Gmail/Outlook/Yahoo Inbox/Promotions/Spam assay.
 *              "Run assay" genuinely replays idle -> running -> done via real
 *              React state; the plate fills one well at a time.
 *   - BOTTOM — three secondary instrument stations on the same bench:
 *              Spam Scanner = a spectrometer (needle + flagged-compounds list),
 *              Template Designer = a specimen slide under glass,
 *              Warmup Preview = sample-output vials. Selecting a station swaps
 *              the readout under AnimatePresence.
 *
 * Fully standalone for the isolated preview harness: NO network / router /
 * query hooks, NO required props, inline MOCK. Renders ONLY page content with
 * explicit heights so the bench layout is stable in the harness.
 *
 * Colour: existing Tailwind tokens only. inbox -> accent, promotions ->
 * accent4, spam -> accent3.
 */

// ---------------------------------------------------------------------------
// Token-mirrored literals (for inline SVG / style props that cannot take a
// Tailwind class). Mirrors tailwind.config.ts exactly — no new colours.
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(242, 101, 34)', // inbox / healthy
  accent2: 'rgb(255, 138, 75)', // info / instrument
  accent3: 'rgb(255, 107, 74)', // spam / contamination
  accent4: 'rgb(255, 213, 79)', // promotions / caution
  surface: '#12121a',
  surface2: '#1a1a26',
  borderMuted: '#2a2a3a',
  text: '#e8e8f0',
  textDim: '#8888a0',
  textFaint: '#5a5a72',
} as const;

export type Bucket = 'inbox' | 'promotions' | 'spam';

const BUCKET_META: Record<
  Bucket,
  { label: string; short: string; color: string; textClass: string }
> = {
  inbox: { label: 'Inbox', short: 'IN', color: C.accent, textClass: 'text-accent' },
  promotions: {
    label: 'Promotions',
    short: 'PR',
    color: C.accent4,
    textClass: 'text-accent4',
  },
  spam: { label: 'Spam', short: 'SP', color: C.accent3, textClass: 'text-accent3' },
};

const BUCKET_ORDER: Bucket[] = ['inbox', 'promotions', 'spam'];

export type Provider = 'gmail' | 'outlook' | 'yahoo';

const PROVIDER_LABEL: Record<Provider, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
};

// ---------------------------------------------------------------------------
// Mock data shapes
// ---------------------------------------------------------------------------

export interface Mailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
}

export interface ProviderBreakdown {
  inbox: number;
  promotions: number;
  spam: number;
}

export interface Well {
  id: string;
  /** Plate position 0..29 (6 cols x 5 rows). */
  pos: number;
  provider: Provider;
  bucket: Bucket;
}

export interface AssayRun {
  total: number;
  byProvider: Record<Provider, ProviderBreakdown>;
  wells: Well[];
  completedAt: string;
}

export interface PriorRun {
  id: string;
  ref: string;
  when: string;
  mailbox: string;
  inboxPct: number;
  spamPct: number;
  wells: number;
}

export interface FlaggedCompound {
  term: string;
  weight: number;
  reason: string;
}

export interface SpectrometerSample {
  subject: string;
  score: number; // 0..10, lower is cleaner
  verdict: string;
  flagged: FlaggedCompound[];
}

export interface VialSample {
  from: string;
  subject: string;
  signal: 'reply' | 'open' | 'star';
}

export type StationId = 'placement' | 'spectro' | 'slide' | 'vials';

export interface Station {
  id: StationId;
  code: string;
  name: string;
  instrument: string;
  blurb: string;
  Icon: LucideIcon;
}

export interface LabData {
  stations: Station[];
  mailboxes: Mailbox[];
  assay: AssayRun;
  priors: PriorRun[];
  spectro: SpectrometerSample;
  vials: VialSample[];
}

// ---------------------------------------------------------------------------
// Build the completed 30-well assay: ~26 inbox / 3 promotions / 1 spam,
// spread Gmail(12) / Outlook(10) / Yahoo(8). Wells are interleaved across the
// 6x5 plate so the fill animation paints a believable scatter, not blocks.
// ---------------------------------------------------------------------------

function buildAssay(): AssayRun {
  const groups: Array<{ provider: Provider; buckets: Bucket[] }> = [
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

  const byProvider: Record<Provider, ProviderBreakdown> = {
    gmail: { inbox: 0, promotions: 0, spam: 0 },
    outlook: { inbox: 0, promotions: 0, spam: 0 },
    yahoo: { inbox: 0, promotions: 0, spam: 0 },
  };

  // Flatten then round-robin-shuffle so the plate scatter looks like an assay.
  const flat: Array<{ provider: Provider; bucket: Bucket }> = [];
  for (const g of groups) {
    for (const b of g.buckets) {
      flat.push({ provider: g.provider, bucket: b });
      byProvider[g.provider][b] += 1;
    }
  }
  const order = [0, 12, 22, 1, 13, 23, 2, 14, 24, 3, 15, 25, 4, 16, 26, 5, 17];
  const seen = new Set<number>();
  const sequence: number[] = [];
  for (const idx of order) if (idx < flat.length && !seen.has(idx)) {
    seen.add(idx);
    sequence.push(idx);
  }
  for (let i = 0; i < flat.length; i += 1) if (!seen.has(i)) sequence.push(i);

  const wells: Well[] = sequence.map((srcIdx, pos) => {
    const src = flat[srcIdx]!;
    return {
      id: `well-${pos}`,
      pos,
      provider: src.provider,
      bucket: src.bucket,
    };
  });

  return {
    total: wells.length,
    byProvider,
    wells,
    completedAt: '2026-05-17T14:08:00Z',
  };
}

const MOCK: LabData = {
  stations: [
    {
      id: 'placement',
      code: 'ST-01',
      name: 'Inbox Tester',
      instrument: 'Seed-plate assay · 30 wells',
      blurb:
        'Inoculate 30 live seed inboxes across Gmail / Outlook / Yahoo and read where emails land well-by-well.',
      Icon: FlaskConical,
    },
    {
      id: 'spectro',
      code: 'ST-02',
      name: 'Spam Scanner',
      instrument: 'Content spectrometer',
      blurb:
        'Pass message content through the spectrometer; the needle reads spam risk and flags compounds.',
      Icon: ScanLine,
    },
    {
      id: 'slide',
      code: 'ST-03',
      name: 'Template Designer',
      instrument: 'Specimen slide',
      blurb: 'Mount a template under the slide and inspect the rendered specimen.',
      Icon: Microscope,
    },
    {
      id: 'vials',
      code: 'ST-04',
      name: 'Warmup Preview',
      instrument: 'Sample-output vials',
      blurb: 'Draw sample warmup messages into vials — nothing leaves the bench.',
      Icon: TestTubes,
    },
  ],
  mailboxes: [
    { id: 'mb-1', email: 'founder@acme.io', provider: 'gmail' },
    { id: 'mb-2', email: 'sales@acme.io', provider: 'outlook' },
    { id: 'mb-3', email: 'success@acme.io', provider: 'gmail' },
    { id: 'mb-4', email: 'hello@acme.co', provider: 'smtp' },
    { id: 'mb-5', email: 'priya@acme.io', provider: 'gmail' },
    { id: 'mb-6', email: 'team@acme.co', provider: 'outlook' },
    { id: 'mb-7', email: 'growth@acme.io', provider: 'yahoo' },
    { id: 'mb-8', email: 'partners@acme.io', provider: 'gmail' },
    { id: 'mb-9', email: 'careers@acme.co', provider: 'smtp' },
    { id: 'mb-10', email: 'support@acme.io', provider: 'outlook' },
    { id: 'mb-11', email: 'press@acme.io', provider: 'gmail' },
    { id: 'mb-12', email: 'billing@acme.co', provider: 'yahoo' },
    { id: 'mb-13', email: 'dev@acme.io', provider: 'gmail' },
    { id: 'mb-14', email: 'ops@acme.io', provider: 'outlook' },
    { id: 'mb-15', email: 'hello@acme.io', provider: 'gmail' },
  ],
  assay: buildAssay(),
  priors: [
    {
      id: 'p-1',
      ref: 'RUN-0488',
      when: 'May 14 · 09:22',
      mailbox: 'founder@acme.io',
      inboxPct: 83.3,
      spamPct: 6.7,
      wells: 30,
    },
    {
      id: 'p-2',
      ref: 'RUN-0471',
      when: 'May 9 · 16:40',
      mailbox: 'sales@acme.io',
      inboxPct: 76.7,
      spamPct: 10.0,
      wells: 30,
    },
    {
      id: 'p-3',
      ref: 'RUN-0455',
      when: 'May 3 · 11:08',
      mailbox: 'success@acme.io',
      inboxPct: 70.0,
      spamPct: 13.3,
      wells: 30,
    },
  ],
  spectro: {
    subject: 'Quick question about your Q3 roadmap',
    score: 2.4,
    verdict: 'Clean — projected to land in Inbox',
    flagged: [
      { term: 'FREE', weight: 1.1, reason: 'All-caps promotional trigger' },
      { term: '!!!', weight: 0.6, reason: 'Excessive punctuation' },
      { term: 'act now', weight: 0.7, reason: 'Urgency phrase' },
    ],
  },
  vials: [
    { from: 'priya@seed-net.io', subject: 'Re: intro call follow-up', signal: 'reply' },
    { from: 'dan@seed-net.io', subject: 'Thoughts on the proposal', signal: 'open' },
    { from: 'lee@seed-net.io', subject: 'Quick question on pricing', signal: 'star' },
  ],
};

/**
 * Topology + fallback dataset for the live adapter
 * (`features/tools/useProPlusLabData.ts`). The live wrapper overlays only
 * the values it can source from real hooks (the mailbox / specimen rack from
 * `useMailboxes`) onto this skeleton; everything with no API source (the
 * placement assay, prior runs, spectrometer / vial samples, station list)
 * keeps the skeleton value. Same honesty contract as
 * `reputation/useProPlusSignalMapData.ts` (`SIGNAL_MAP_SKELETON`).
 */
export const LAB_SKELETON: LabData = MOCK;

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

function specimenColor(p: Mailbox['provider']): string {
  return p === 'gmail'
    ? C.accent
    : p === 'outlook'
      ? C.accent2
      : p === 'yahoo'
        ? C.accent4
        : C.textDim;
}

type Phase = 'idle' | 'running' | 'done';

interface TapeLine {
  id: number;
  t: string;
  text: string;
  tone: 'inbox' | 'promotions' | 'spam' | 'info';
}

function clock(offsetSec: number): string {
  const base = 14 * 3600 + 8 * 60; // 14:08:00 anchor
  const s = base + offsetSec;
  const hh = Math.floor(s / 3600) % 24;
  const mm = Math.floor(s / 60) % 60;
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusTool2Lab({
  data,
}: { data?: LabData } = {}): JSX.Element {
  const d = data ?? MOCK;

  const [station, setStation] = useState<StationId>('placement');
  const [specimenId, setSpecimenId] = useState<string>(
    d.mailboxes[0]?.id ?? '',
  );
  const [phase, setPhase] = useState<Phase>('done');
  const [filled, setFilled] = useState<number>(d.assay.total);
  const [tape, setTape] = useState<TapeLine[]>(() => [
    { id: 0, t: clock(0), text: 'Assay RUN-0492 archived · 30/30 wells read', tone: 'info' },
  ]);

  const timersRef = useRef<number[]>([]);
  const tapeSeq = useRef<number>(1);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const pushTape = useCallback((line: Omit<TapeLine, 'id'>) => {
    setTape((prev) => {
      const next = [...prev, { ...line, id: tapeSeq.current++ }];
      return next.slice(-7);
    });
  }, []);

  const specimen = d.mailboxes.find((m) => m.id === specimenId);

  const overall = useMemo(() => {
    const acc: ProviderBreakdown = { inbox: 0, promotions: 0, spam: 0 };
    for (const p of Object.keys(d.assay.byProvider) as Provider[]) {
      acc.inbox += d.assay.byProvider[p].inbox;
      acc.promotions += d.assay.byProvider[p].promotions;
      acc.spam += d.assay.byProvider[p].spam;
    }
    return acc;
  }, [d.assay.byProvider]);

  const inboxRate = pct(overall.inbox, d.assay.total);

  // Running-phase live tallies (only the wells filled so far).
  const liveTally = useMemo(() => {
    const acc: ProviderBreakdown = { inbox: 0, promotions: 0, spam: 0 };
    for (let i = 0; i < filled && i < d.assay.wells.length; i += 1) {
      acc[d.assay.wells[i]!.bucket] += 1;
    }
    return acc;
  }, [filled, d.assay.wells]);

  const shownTally = phase === 'done' ? overall : liveTally;
  const shownTotal = phase === 'done' ? d.assay.total : Math.max(filled, 1);
  const liveInboxRate = pct(shownTally.inbox, shownTotal);
  const liveContam = pct(shownTally.spam + shownTally.promotions, shownTotal);

  const runAssay = useCallback(() => {
    clearTimers();
    setPhase('running');
    setFilled(0);
    setTape([]);
    tapeSeq.current = 1;

    const mbEmail = specimen?.email ?? 'mailbox';
    pushTape({ t: clock(0), text: `Inoculating 30 wells from ${mbEmail}`, tone: 'info' });

    // Stagger each well in; emit a tape line for non-inbox landings + heartbeats.
    const total = d.assay.total;
    d.assay.wells.forEach((w, i) => {
      const id = window.setTimeout(
        () => {
          setFilled(i + 1);
          if (w.bucket !== 'inbox') {
            pushTape({
              t: clock(i + 1),
              text: `Well ${String(w.pos + 1).padStart(2, '0')} · ${PROVIDER_LABEL[w.provider]} · ${BUCKET_META[w.bucket].label}`,
              tone: w.bucket,
            });
          } else if (i % 6 === 5) {
            pushTape({
              t: clock(i + 1),
              text: `${i + 1}/${total} wells reporting · inbox holding`,
              tone: 'inbox',
            });
          }
          if (i + 1 === total) {
            const doneId = window.setTimeout(() => {
              setPhase('done');
              pushTape({
                t: clock(total + 1),
                text: `Assay complete · ${pct(overall.inbox, total)}% inbox`,
                tone: 'info',
              });
            }, 360);
            timersRef.current.push(doneId);
          }
        },
        420 + i * 150,
      );
      timersRef.current.push(id);
    });
  }, [clearTimers, pushTape, specimen, d.assay.total, d.assay.wells, overall.inbox]);

  const resetAssay = useCallback(() => {
    clearTimers();
    setPhase('idle');
    setFilled(0);
    setTape([
      { id: 0, t: clock(0), text: 'Bench reset · plate cleared', tone: 'info' },
    ]);
    tapeSeq.current = 1;
  }, [clearTimers]);

  const progressPct = Math.round((filled / d.assay.total) * 100);
  const lampTone =
    phase === 'running' ? C.accent4 : phase === 'done' ? C.accent : C.textDim;
  const lampLabel =
    phase === 'running'
      ? 'ASSAY RUNNING'
      : phase === 'done'
        ? 'BENCH IDLE · LAST RUN OK'
        : 'BENCH STANDBY';

  return (
    <div
      className="flex flex-col gap-4 font-sans text-text"
      style={{ minHeight: 1180 }}
    >
      {/* ============================================================ */}
      {/* INSTRUMENT RACK — status lamp + env readouts + recorder tape */}
      {/* ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-2xl border border-border-muted bg-surface"
        style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)' }}
      >
        <div className="flex flex-wrap items-stretch gap-4 p-4">
          {/* Lab identity + status lamp */}
          <div className="flex min-w-[260px] flex-1 items-center gap-3.5">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-border-muted bg-surface-2"
              style={{ color: C.accent2 }}
            >
              <Beaker className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  Deliverability Lab
                </h1>
                <span className="rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent3">
                  Pro Plus
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-dim">
                <span className="relative flex h-2 w-2">
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full"
                    style={{ background: lampTone }}
                    animate={
                      phase === 'running'
                        ? { opacity: [1, 0.25, 1], scale: [1, 1.9, 1] }
                        : { opacity: 1, scale: 1 }
                    }
                    transition={
                      phase === 'running'
                        ? { duration: 1.1, repeat: Infinity }
                        : { duration: 0.2 }
                    }
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ background: lampTone }}
                  />
                </span>
                <span
                  className="font-semibold tracking-wide"
                  style={{ color: lampTone }}
                >
                  {lampLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Environment gauges (decorative bench instruments) */}
          <div className="flex items-center gap-2">
            <RackReadout
              icon={Activity}
              label="Seed network"
              value="30 online"
              tone={C.accent}
            />
            <RackReadout
              icon={Gauge}
              label="Plate temp"
              value="22.0 C"
              tone={C.accent2}
            />
            <RackReadout
              icon={Waves}
              label="IMAP poll"
              value="~90 s"
              tone={C.accent4}
            />
          </div>
        </div>

        {/* Chart-recorder tape — scrolling strip of the run log */}
        <div className="border-t border-border-muted px-4 py-2.5">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-faint">
            <CircleDot className="h-3 w-3" />
            Recorder tape
          </div>
          <div
            className="relative h-[68px] overflow-hidden rounded-lg border border-border-muted bg-bg"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent 0 38px, rgba(255,255,255,0.025) 38px 39px)',
            }}
          >
            <AnimatePresence initial={false}>
              <div className="absolute inset-0 flex flex-col-reverse justify-start gap-0.5 p-2">
                {[...tape].reverse().map((ln) => {
                  const tone =
                    ln.tone === 'inbox'
                      ? C.accent
                      : ln.tone === 'promotions'
                        ? C.accent4
                        : ln.tone === 'spam'
                          ? C.accent3
                          : C.textDim;
                  return (
                    <motion.div
                      key={ln.id}
                      layout
                      initial={{ opacity: 0, x: 28 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.28, ease: 'easeOut' }}
                      className="flex items-center gap-2.5 font-mono text-[11px] leading-tight"
                    >
                      <span className="tabular-nums text-text-faint">
                        {ln.t}
                      </span>
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: tone }}
                      />
                      <span className="truncate" style={{ color: tone }}>
                        {ln.text}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
            {/* Pen line — sweeps while running */}
            <motion.span
              className="pointer-events-none absolute bottom-0 top-0 w-px"
              style={{ background: lampTone, opacity: phase === 'running' ? 0.7 : 0 }}
              animate={
                phase === 'running'
                  ? { left: ['8%', '94%', '8%'] }
                  : { left: '8%' }
              }
              transition={
                phase === 'running'
                  ? { duration: 3.2, repeat: Infinity, ease: 'linear' }
                  : { duration: 0.2 }
              }
            />
          </div>
        </div>
      </motion.section>

      {/* ============================================================ */}
      {/* FLAGSHIP STATION — Placement Tester as a seed-plate assay     */}
      {/* ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.06 }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      >
        {/* Station bezel header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted bg-surface-2 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-muted bg-bg"
              style={{ color: C.accent4 }}
            >
              <FlaskConical className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold tracking-widest text-text-faint">
                  ST-01
                </span>
                <h2 className="text-base font-semibold">Inbox Tester</h2>
                <span className="rounded border border-accent3/30 bg-accent3/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
                  Flagship assay
                </span>
              </div>
              <p className="text-xs text-text-dim">
                30-well seed plate · Gmail / Outlook / Yahoo where-emails-land readout
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border-muted bg-bg px-3 py-1.5 font-mono text-[11px] text-text-dim">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: C.accent }}
            />
            30 SEEDS · HEALTHY
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
          {/* ---- Specimen rack + assay controls ---- */}
          <div className="space-y-4 border-b border-border-muted p-5 lg:border-b-0 lg:border-r">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
                <TestTube className="h-3 w-3" />
                Specimen rack
              </div>
              <div
                className="space-y-1 overflow-y-auto rounded-lg border border-border-muted bg-bg p-1.5"
                style={{ maxHeight: 226 }}
              >
                {d.mailboxes.map((m) => {
                  const active = m.id === specimenId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSpecimenId(m.id)}
                      disabled={phase === 'running'}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
                        active
                          ? 'bg-surface-2 text-text'
                          : 'text-text-dim hover:bg-surface-2/60 hover:text-text'
                      }`}
                    >
                      {/* Mini test-tube specimen marker */}
                      <span className="relative flex h-4 w-2.5 shrink-0 items-end justify-center">
                        <span
                          className="absolute inset-x-0 bottom-0 rounded-b-full rounded-t-sm"
                          style={{
                            height: active ? '100%' : '45%',
                            background: specimenColor(m.provider),
                            opacity: active ? 0.9 : 0.5,
                            transition: 'height 0.25s ease',
                          }}
                        />
                        <span
                          className="absolute inset-0 rounded-b-full rounded-t-sm border"
                          style={{ borderColor: C.borderMuted }}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{m.email}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase text-text-faint">
                        {m.provider}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Run / stop control — physical instrument button */}
            <div className="space-y-2">
              {phase !== 'running' ? (
                <button
                  type="button"
                  onClick={runAssay}
                  className="group flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
                >
                  <Power className="h-4 w-4" />
                  {phase === 'done' ? 'Run assay again' : 'Run assay'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetAssay}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent3/40 bg-accent3/10 px-4 py-3 text-sm font-semibold text-accent3 transition-colors hover:bg-accent3/20"
                >
                  <Square className="h-3.5 w-3.5" />
                  Abort assay
                </button>
              )}
              {phase === 'done' ? (
                <button
                  type="button"
                  onClick={resetAssay}
                  className="flex w-full items-center justify-center gap-1.5 py-1 text-xs text-text-dim transition-colors hover:text-text"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear plate
                </button>
              ) : null}
            </div>

            <p className="rounded-lg border border-border-muted bg-bg p-3 text-[11px] leading-relaxed text-text-dim">
              Each well is a real seed inbox on the system network. Where it lands is
              read back over IMAP — Inbox, Promotions or Spam — within ~90s of
              inoculation.
            </p>
          </div>

          {/* ---- Instrument deck: gauges + plate + readout ---- */}
          <div className="space-y-5 p-5">
            {/* Analog instruments */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DialGauge
                title="Inbox rate"
                value={liveInboxRate}
                unit="%"
                color={C.accent}
                running={phase === 'running'}
              />
              <DialGauge
                title="Contamination"
                value={liveContam}
                unit="%"
                color={liveContam > 25 ? C.accent3 : C.accent4}
                running={phase === 'running'}
              />
            </div>

            {/* Progress strip (running) */}
            <AnimatePresence mode="wait">
              {phase === 'running' ? (
                <motion.div
                  key="prog"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-text">
                      Reading wells…
                    </span>
                    <span className="font-mono tabular-nums text-text-dim">
                      {filled} / {d.assay.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: C.accent2 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* The 30-well seed plate */}
            <div className="rounded-xl border border-border-muted bg-bg p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
                  <Microscope className="h-3 w-3" />
                  Seed plate · 6 × 5
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  {BUCKET_ORDER.map((b) => (
                    <span
                      key={b}
                      className="flex items-center gap-1 text-text-dim"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: BUCKET_META[b].color }}
                      />
                      {BUCKET_META[b].label}
                    </span>
                  ))}
                </div>
              </div>
              <SeedPlate wells={d.assay.wells} filled={filled} />
            </div>

            {/* Results readout */}
            <AnimatePresence mode="wait">
              {phase === 'done' ? (
                <motion.div
                  key="readout"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-muted bg-surface-2 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CircleDot className="h-4 w-4 text-accent" />
                      <span className="font-semibold">Assay complete</span>
                      <span className="font-mono text-xs text-text-dim">
                        {d.assay.total} wells ·{' '}
                        {formatDateTime(d.assay.completedAt)}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-semibold text-accent">
                      {inboxRate}% INBOX
                    </span>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
                      Where emails land distribution
                    </div>
                    <AssayBar
                      breakdown={overall}
                      total={d.assay.total}
                      height={18}
                    />
                    <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                      {BUCKET_ORDER.map((b) => (
                        <span
                          key={b}
                          className="flex items-center gap-1.5"
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: BUCKET_META[b].color }}
                          />
                          <span className="text-text-dim">
                            {BUCKET_META[b].label}
                          </span>
                          <span
                            className={`font-mono font-semibold ${BUCKET_META[b].textClass}`}
                          >
                            {overall[b]} · {pct(overall[b], d.assay.total)}%
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
                      Per-provider sub-plates
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(['gmail', 'outlook', 'yahoo'] as Provider[]).map(
                        (p) => (
                          <SubPlateCard
                            key={p}
                            provider={p}
                            breakdown={d.assay.byProvider[p]}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : phase === 'running' ? (
                <motion.div
                  key="run-note"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-border-muted bg-surface-2 px-4 py-3 font-mono text-xs text-text-dim"
                >
                  Acquiring landings — needles live, plate filling. Watch the
                  recorder tape for non-inbox wells.
                </motion.div>
              ) : (
                <motion.div
                  key="idle-note"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-muted bg-surface-2/50 px-4 py-5 text-center"
                >
                  <Droplet className="h-5 w-5 text-text-faint" />
                  <p className="max-w-sm text-xs text-text-dim">
                    Pick a specimen from the rack and run the assay. The plate
                    fills well-by-well and the instruments resolve a
                    per-provider where-emails-land readout.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.section>

      {/* ============================================================ */}
      {/* SECONDARY BENCH — station tabs + swappable readout            */}
      {/* ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.12 }}
        className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]"
      >
        {/* Station selector — the bench's instrument row */}
        <div className="rounded-2xl border border-border-muted bg-surface p-3">
          <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
            Bench stations
          </div>
          <div className="space-y-1.5">
            {d.stations.map((s, i) => {
              const active = s.id === station;
              const SIcon = s.Icon;
              return (
                <motion.button
                  key={s.id}
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.16 + i * 0.05 }}
                  onClick={() => setStation(s.id)}
                  aria-pressed={active}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-border-muted bg-surface-2 hover:border-border-muted/80'
                  }`}
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: active ? 'rgba(242, 101, 34,0.4)' : C.borderMuted,
                      color: active ? C.accent : C.textDim,
                      background: '#0a0a0f',
                    }}
                  >
                    <SIcon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] tracking-widest text-text-faint">
                        {s.code}
                      </span>
                      <span
                        className={`truncate text-sm font-semibold ${active ? 'text-text' : 'text-text-dim'}`}
                      >
                        {s.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-text-faint">
                      {s.instrument}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Active station readout */}
        <div
          className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
          style={{ minHeight: 360 }}
        >
          <AnimatePresence mode="wait">
            {station === 'placement' ? (
              <PanelShell
                key="p-placement"
                code="ST-01"
                title="Inbox Tester"
                instrument="Seed-plate assay"
                Icon={FlaskConical}
              >
                <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                  <Microscope className="h-8 w-8 text-accent4" />
                  <p className="max-w-md text-sm text-text-dim">
                    The flagship assay is mounted on the main bench above —
                    specimen rack, 30-well plate and live instruments. This
                    secondary readout is reserved for the support instruments.
                  </p>
                </div>
              </PanelShell>
            ) : station === 'spectro' ? (
              <SpectrometerPanel key="p-spectro" sample={d.spectro} />
            ) : station === 'slide' ? (
              <SlidePanel key="p-slide" />
            ) : (
              <VialsPanel key="p-vials" vials={d.vials} />
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      {/* ============================================================ */}
      {/* RUN LEDGER — prior assays as archived plate strips            */}
      {/* ============================================================ */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.18 }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      >
        <header className="flex items-center justify-between border-b border-border-muted bg-surface-2 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <TestTubes className="h-4 w-4 text-text-dim" />
            <h3 className="text-sm font-semibold">Assay ledger</h3>
          </div>
          <span className="font-mono text-xs text-text-dim">
            {d.priors.length} archived runs
          </span>
        </header>
        <div className="divide-y divide-border-muted">
          {d.priors.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, delay: 0.2 + i * 0.06 }}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5"
            >
              <span className="font-mono text-xs font-semibold tracking-wide text-text-faint">
                {r.ref}
              </span>
              <span className="text-xs text-text-dim">{r.when}</span>
              <span className="min-w-[160px] flex-1 truncate text-sm text-text">
                {r.mailbox}
              </span>
              {/* Tiny archived plate strip */}
              <LedgerStrip inboxPct={r.inboxPct} spamPct={r.spamPct} />
              <span className="font-mono text-xs text-text-dim">
                {r.wells} wells
              </span>
              <span className="font-mono text-sm font-semibold text-accent">
                {r.inboxPct}%
              </span>
              <span className="font-mono text-sm font-semibold text-accent3">
                {r.spamPct}%
              </span>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RackReadout({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="flex min-w-[112px] flex-col gap-1 rounded-lg border border-border-muted bg-bg px-3 py-2">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: tone }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Analog dial gauge — a 180deg arc with a sweeping needle. Pure SVG so it
 * stays crisp; the needle animates on value change (and ticks faintly while
 * the assay runs).
 */
function DialGauge({
  title,
  value,
  unit,
  color,
  running,
}: {
  title: string;
  value: number;
  unit: string;
  color: string;
  running: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  // 180deg sweep: -90deg (left/0) .. +90deg (right/100).
  const angle = -90 + (clamped / 100) * 180;
  const cx = 90;
  const cy = 80;
  const r = 62;

  // Arc path (semicircle).
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  // Tick marks every 10%.
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = (-90 + i * 18) * (Math.PI / 180);
    const inner = r - 7;
    return {
      x1: cx + Math.cos(a) * inner,
      y1: cy + Math.sin(a) * inner,
      x2: cx + Math.cos(a) * r,
      y2: cy + Math.sin(a) * r,
      major: i % 5 === 0,
    };
  });

  return (
    <div className="rounded-xl border border-border-muted bg-bg p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
          {title}
        </span>
        <span
          className="font-mono text-base font-bold tabular-nums"
          style={{ color }}
        >
          {value.toFixed(1)}
          <span className="ml-0.5 text-[10px] text-text-faint">{unit}</span>
        </span>
      </div>
      <div className="relative" style={{ height: 92 }}>
        <svg
          viewBox="0 0 180 96"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d={arc}
            fill="none"
            stroke={C.borderMuted}
            strokeWidth={8}
            strokeLinecap="round"
          />
          <motion.path
            d={arc}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={Math.PI * r}
            initial={false}
            animate={{
              strokeDashoffset: Math.PI * r * (1 - clamped / 100),
            }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.major ? C.textDim : C.textFaint}
              strokeWidth={t.major ? 1.6 : 1}
            />
          ))}
          {/* Needle */}
          <motion.line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - r + 12}
            stroke={color}
            strokeWidth={2.6}
            strokeLinecap="round"
            style={{ originX: `${cx}px`, originY: `${cy}px` }}
            initial={false}
            animate={{
              rotate: running ? [angle - 4, angle + 4, angle] : angle,
            }}
            transition={{
              duration: running ? 0.7 : 0.9,
              ease: 'easeOut',
              repeat: running ? Infinity : 0,
              repeatType: 'mirror',
            }}
          />
          <circle cx={cx} cy={cy} r={5} fill={color} />
          <circle cx={cx} cy={cy} r={9} fill="none" stroke={C.borderMuted} strokeWidth={1.5} />
        </svg>
      </div>
    </div>
  );
}

/**
 * The 30-well seed plate — a 6x5 microplate. Wells light up in plate-position
 * order as `filled` advances; the most-recently-filled well gets a brief ring.
 */
function SeedPlate({ wells, filled }: { wells: Well[]; filled: number }) {
  const byPos = useMemo(() => {
    const arr: Array<Well | undefined> = new Array(30);
    for (const w of wells) arr[w.pos] = w;
    return arr;
  }, [wells]);
  // Map plate-position -> fill-order index, so visual ring tracks the
  // sequence wells actually report in (which is interleaved across the plate).
  const orderByPos = useMemo(() => {
    const m = new Map<number, number>();
    wells.forEach((w, idx) => m.set(w.pos, idx));
    return m;
  }, [wells]);

  return (
    <div
      className="grid gap-2"
      style={{
        // Compact microplate: cap each well track at 54px (was `1fr`,
        // which stretched wells to ~1/6 of the wide lab panel ≈ 200px).
        // minmax(0,54px) lets them shrink on narrow viewports but never
        // balloon; center the plate within the panel.
        gridTemplateColumns: 'repeat(6, minmax(0, 54px))',
        justifyContent: 'center',
      }}
      role="img"
      aria-label="30-well seed plate"
    >
      {Array.from({ length: 30 }, (_, pos) => {
        const w = byPos[pos];
        const fillIdx = orderByPos.get(pos) ?? pos;
        const lit = fillIdx < filled;
        const isLast = lit && fillIdx === filled - 1;
        const meta = w ? BUCKET_META[w.bucket] : BUCKET_META.inbox;
        return (
          <div
            key={pos}
            className="relative flex aspect-square items-center justify-center"
          >
            {/* Well ring */}
            <span
              className="absolute inset-0 rounded-full border"
              style={{
                borderColor: lit ? meta.color : C.borderMuted,
                opacity: lit ? 0.55 : 0.6,
              }}
            />
            {/* Well fluid */}
            <motion.span
              className="absolute rounded-full"
              initial={false}
              animate={
                lit
                  ? { scale: 1, opacity: 1 }
                  : { scale: 0.32, opacity: 0.18 }
              }
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={{
                inset: 4,
                background: lit ? meta.color : C.textFaint,
                boxShadow: lit ? `0 0 10px -2px ${meta.color}` : 'none',
              }}
            />
            {/* Sample-arrival pulse on the freshly-read well */}
            {isLast ? (
              <motion.span
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: meta.color }}
                initial={{ scale: 0.7, opacity: 0.9 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            ) : null}
            {/* Label glyph once lit */}
            {lit ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.12 }}
                className="relative font-mono text-[8px] font-bold"
                style={{ color: '#0a0a0f' }}
              >
                {meta.short}
              </motion.span>
            ) : (
              <span className="relative font-mono text-[8px] text-text-faint">
                {String(pos + 1).padStart(2, '0')}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssayBar({
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

function SubPlateCard({
  provider,
  breakdown,
}: {
  provider: Provider;
  breakdown: ProviderBreakdown;
}) {
  const total = sumBreakdown(breakdown);
  return (
    <div className="rounded-xl border border-border-muted bg-bg p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{PROVIDER_LABEL[provider]}</h4>
        <span className="font-mono text-[11px] text-text-dim">
          {total} wells
        </span>
      </div>
      <AssayBar breakdown={breakdown} total={Math.max(total, 1)} height={9} />
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {BUCKET_ORDER.map((b) =>
          breakdown[b] > 0 ? (
            <span key={b} className={`font-mono ${BUCKET_META[b].textClass}`}>
              {BUCKET_META[b].short} {pct(breakdown[b], Math.max(total, 1))}%
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Tiny archived placement strip for the ledger rows. */
function LedgerStrip({
  inboxPct,
  spamPct,
}: {
  inboxPct: number;
  spamPct: number;
}) {
  const promoPct = Math.max(0, 100 - inboxPct - spamPct);
  const segs: Array<{ key: Bucket; v: number }> = [
    { key: 'inbox', v: inboxPct },
    { key: 'promotions', v: promoPct },
    { key: 'spam', v: spamPct },
  ];
  return (
    <div className="flex h-2 w-28 overflow-hidden rounded-full border border-border-muted bg-surface-2">
      {segs.map((s) =>
        s.v > 0 ? (
          <span
            key={s.key}
            style={{
              width: `${s.v}%`,
              background: BUCKET_META[s.key].color,
            }}
          />
        ) : null,
      )}
    </div>
  );
}

function PanelShell({
  code,
  title,
  instrument,
  Icon,
  children,
}: {
  code: string;
  title: string;
  instrument: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex h-full flex-col"
    >
      <header className="flex items-center gap-3 border-b border-border-muted bg-surface-2 px-5 py-3.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-muted bg-bg"
          style={{ color: C.accent2 }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-widest text-text-faint">
              {code}
            </span>
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <p className="text-[11px] text-text-faint">{instrument}</p>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </motion.div>
  );
}

// Spam Scanner rule-book. Each entry contributes its `weight` if its `match`
// is found in the combined subject + body (case-insensitive unless the term
// is itself all-caps, which is the trigger). Keep small and obvious — the
// real WarmPulse content-factory scoring is server-side; this is a friendly
// inline scanner so the user can sanity-check copy before they ship.
const SPAM_RULES: ReadonlyArray<{
  term: string;
  match: RegExp;
  weight: number;
  reason: string;
}> = [
  { term: 'FREE', match: /\bFREE\b/, weight: 1.1, reason: 'All-caps promotional trigger' },
  { term: '!!!', match: /!!!/, weight: 0.6, reason: 'Excessive punctuation' },
  { term: 'act now', match: /\bact now\b/i, weight: 0.7, reason: 'Urgency phrase' },
  { term: 'click here', match: /\bclick here\b/i, weight: 0.8, reason: 'Generic CTA' },
  { term: 'limited time', match: /\blimited time\b/i, weight: 0.9, reason: 'Scarcity phrase' },
  { term: 'guaranteed', match: /\bguarantee[ds]?\b/i, weight: 0.5, reason: 'Trust trigger' },
  { term: '$$$', match: /\${2,}/, weight: 1.2, reason: 'Money symbols' },
  { term: 'buy now', match: /\bbuy now\b/i, weight: 0.8, reason: 'Hard CTA' },
  { term: 'risk free', match: /\brisk[- ]?free\b/i, weight: 0.6, reason: 'Risk-reversal cliché' },
  { term: 'cash', match: /\bcash\b/i, weight: 0.4, reason: 'Money keyword' },
];

function scoreSample(subject: string, body: string): SpectrometerSample {
  const text = `${subject}\n${body}`;
  const flagged: FlaggedCompound[] = [];
  for (const r of SPAM_RULES) {
    if (r.match.test(text)) {
      flagged.push({ term: r.term, weight: r.weight, reason: r.reason });
    }
  }
  const score = Math.min(10, Math.round(flagged.reduce((s, f) => s + f.weight, 0) * 10) / 10);
  const verdict =
    score < 3
      ? 'Clean - projected to land in Inbox'
      : score < 6
        ? 'Caution - likely to drop to Promotions'
        : 'Spam risk - review before sending';
  return { subject: subject.trim() || '(no subject)', score, verdict, flagged };
}

function SpectrometerPanel({ sample }: { sample: SpectrometerSample }) {
  // Initial body — populated so the very first reading is non-empty. The
  // user can edit either field and re-scan to recompute live.
  const [subject, setSubject] = useState(sample.subject);
  const [body, setBody] = useState(
    'Hi there,\n\nWanted to circle back on the Q3 roadmap doc. The timeline looks solid - 15 minutes this week to walk through it?',
  );
  const [current, setCurrent] = useState<SpectrometerSample>(sample);
  const [scanning, setScanning] = useState(false);

  // Reflect parent data when the live adapter swaps the prop.
  useEffect(() => {
    setCurrent(sample);
    setSubject(sample.subject);
  }, [sample]);

  const runScan = useCallback(() => {
    setScanning(true);
    // Tiny defer so the spinner is visible and the spectral trace re-mounts.
    const id = window.setTimeout(() => {
      setCurrent(scoreSample(subject, body));
      setScanning(false);
    }, 480);
    return () => window.clearTimeout(id);
  }, [subject, body]);

  const tone =
    current.score < 3 ? C.accent : current.score < 6 ? C.accent4 : C.accent3;
  const toneClass =
    current.score < 3
      ? 'text-accent'
      : current.score < 6
        ? 'text-accent4'
        : 'text-accent3';
  // Spectral trace: deflection rises at each flagged compound. Re-keying on
  // the flagged list forces the polyline to redraw its pathLength animation.
  const W = 320;
  const H = 70;
  const points = useMemo(() => {
    const n = 40;
    const peaks = current.flagged.map((_, i) => 8 + i * 9);
    const pts: string[] = [];
    for (let i = 0; i < n; i += 1) {
      let y = H - 8;
      for (const pk of peaks) {
        const dx = Math.abs(i - pk);
        y -= Math.max(0, 34 - dx * dx * 2);
      }
      const x = (i / (n - 1)) * W;
      pts.push(`${x.toFixed(1)},${Math.max(6, y).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [current.flagged]);

  return (
    <PanelShell
      code="ST-02"
      title="Spam Scanner"
      instrument="Content spectrometer"
      Icon={ScanLine}
    >
      <div className="space-y-4 p-5">
        {/* Editable sample — subject + body. Wired to local state; Scan
            recomputes flagged compounds against SPAM_RULES. */}
        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              Sample subject
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={scanning}
              placeholder="Subject line to scan"
              className="mt-1 w-full rounded-lg border border-border-muted bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent2/50 disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              Sample body
            </span>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={scanning}
              placeholder="Paste body content to scan for promotional triggers"
              className="mt-1 w-full resize-y rounded-lg border border-border-muted bg-bg px-3 py-2 font-mono text-xs text-text outline-none transition-colors focus:border-accent2/50 disabled:opacity-60"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] text-text-faint">
              Scanner runs locally - nothing leaves the bench.
            </span>
            <button
              type="button"
              onClick={runScan}
              disabled={scanning}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent2/30 bg-accent2/10 px-3 py-1.5 text-xs font-semibold text-accent2 transition-colors hover:bg-accent2/15 disabled:cursor-wait disabled:opacity-60"
            >
              {scanning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {scanning ? 'Scanning…' : 'Scan sample'}
            </button>
          </div>
        </div>

        {/* Spectral trace + reading */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div className="rounded-lg border border-border-muted bg-bg p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
              Spectral trace
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-[70px] w-full"
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                y1={H - 8}
                x2={W}
                y2={H - 8}
                stroke={C.borderMuted}
                strokeWidth={1}
              />
              <motion.polyline
                key={points /* re-animate on each scan */}
                points={points}
                fill="none"
                stroke={tone}
                strokeWidth={1.8}
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
              />
            </svg>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg border border-border-muted bg-bg px-5 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              Risk
            </span>
            <motion.span
              key={current.score}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`font-mono text-3xl font-bold tabular-nums ${toneClass}`}
            >
              {current.score.toFixed(1)}
            </motion.span>
            <span className="text-[10px] text-text-faint">/ 10</span>
          </div>
        </div>

        <p className={`text-sm font-semibold ${toneClass}`}>{current.verdict}</p>

        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
            Flagged compounds ({current.flagged.length})
          </div>
          {current.flagged.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-muted bg-bg px-3 py-3 text-center text-[11px] text-text-dim">
              No promotional triggers detected in this sample.
            </div>
          ) : (
            current.flagged.map((f, i) => (
              <motion.div
                key={`${f.term}-${i}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.24, delay: 0.05 + i * 0.06 }}
                className="flex items-center justify-between rounded-lg border border-border-muted bg-bg px-3 py-2 text-xs"
              >
                <span className="min-w-0">
                  <span className="font-mono font-semibold text-text">
                    {f.term}
                  </span>
                  <span className="ml-2 text-text-dim">{f.reason}</span>
                </span>
                <span className="shrink-0 font-mono font-semibold text-accent3">
                  +{f.weight.toFixed(1)}
                </span>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </PanelShell>
  );
}

type TemplateVariant = 'plain' | 'html' | 'llm';

// Three template specimens — chosen to mirror the warmup content-factory's
// three output modes (Plain text body, sanitised HTML, LLM-generated rewrite).
const TEMPLATE_VARIANTS: Record<
  TemplateVariant,
  { label: string; subject: string; body: JSX.Element }
> = {
  plain: {
    label: 'Plain',
    subject: 'Quick sync re: Q3 roadmap',
    body: (
      <>
        <p className="text-text">Hi {'{{first_name}}'},</p>
        <p>
          Wanted to circle back on the roadmap doc - the timeline looks solid.
          Got 15 minutes this week to walk through it?
        </p>
        <p>Thanks,</p>
        <span className="block h-3 w-24 rounded bg-border-muted" />
      </>
    ),
  },
  html: {
    label: 'HTML',
    subject: '<HTML> Quick sync re: Q3 roadmap',
    body: (
      <>
        <p className="text-text">
          <span className="font-mono text-[10px] text-text-faint">{'<p>'}</span>{' '}
          Hi <span className="font-mono text-accent2">{'{{first_name}}'}</span>,
        </p>
        <p>
          Wanted to circle back on the{' '}
          <span className="font-mono text-accent">
            &lt;a href=&quot;…&quot;&gt;roadmap doc&lt;/a&gt;
          </span>{' '}
          - the timeline looks solid. Got 15 minutes this week to walk through
          it?
        </p>
        <p className="text-text">
          Thanks,
          <span className="font-mono text-[10px] text-text-faint">{'</p>'}</span>
        </p>
        <span className="block h-3 w-24 rounded bg-border-muted" />
      </>
    ),
  },
  llm: {
    label: 'AI variants',
    subject: 'Quick sync re: Q3 roadmap (variant)',
    body: (
      <>
        <p className="text-text">Hey {'{{first_name}}'},</p>
        <p>
          The Q3 roadmap doc looks ambitious in a good way - I had two
          questions about the ramp on the EU rollout. Could I grab fifteen
          minutes on your calendar?
        </p>
        <p>Appreciate it,</p>
        <span className="block h-3 w-28 rounded bg-border-muted" />
      </>
    ),
  },
};

function SlidePanel() {
  const [variant, setVariant] = useState<TemplateVariant>('plain');
  const current = TEMPLATE_VARIANTS[variant];

  return (
    <PanelShell
      code="ST-03"
      title="Template Designer"
      instrument="Specimen slide"
      Icon={Microscope}
    >
      <div className="space-y-4 p-5">
        {/* Slide under glass — re-keyed on variant so the swap animates */}
        <AnimatePresence mode="wait">
          <motion.div
            key={variant}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="relative overflow-hidden rounded-lg border border-border-muted bg-bg"
          >
            <div className="flex items-center gap-2 border-b border-border-muted bg-surface-2 px-3.5 py-2 text-xs text-text-dim">
              <Microscope className="h-3.5 w-3.5" />
              {current.subject}
            </div>
            <div className="space-y-2 p-4 text-xs leading-relaxed text-text-dim">
              {current.body}
            </div>
            {/* Slide sweep — a faint scan line traversing the specimen */}
            <motion.span
              className="pointer-events-none absolute inset-y-0 w-16"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255, 138, 75,0.10), transparent)',
              }}
              initial={{ left: '-20%' }}
              animate={{ left: ['-20%', '110%'] }}
              transition={{
                duration: 2.6,
                repeat: Infinity,
                ease: 'linear',
                repeatDelay: 1.2,
              }}
            />
          </motion.div>
        </AnimatePresence>

        {/* Variant pills — real buttons that swap the mounted specimen */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Template variant">
          {(Object.keys(TEMPLATE_VARIANTS) as TemplateVariant[]).map((v) => {
            const active = v === variant;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setVariant(v)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  active
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-border-muted bg-bg text-text-dim hover:border-accent/20 hover:text-text'
                }`}
              >
                {TEMPLATE_VARIANTS[v].label}
              </button>
            );
          })}
        </div>
        <p className="rounded-lg border border-border-muted bg-bg px-3.5 py-2.5 text-[11px] text-text-dim">
          Mounted specimens feed the warmup content factory - sanitised markup
          and AI-generated variants render here before they ship.
        </p>
      </div>
    </PanelShell>
  );
}

// Extra in-memory vial pool the Re-sample button rotates through, so each
// click swaps the displayed batch (cycle length is intentionally short so
// the user notices the change immediately). These mirror the same signal
// taxonomy the warmup content factory emits (reply / open / star).
const VIAL_POOLS: VialSample[][] = [
  [
    { from: 'priya@seed-net.io', subject: 'Re: intro call follow-up', signal: 'reply' },
    { from: 'dan@seed-net.io', subject: 'Thoughts on the proposal', signal: 'open' },
    { from: 'lee@seed-net.io', subject: 'Quick question on pricing', signal: 'star' },
  ],
  [
    { from: 'mira@seed-net.io', subject: 'Loved the deck - one tweak?', signal: 'star' },
    { from: 'sam@seed-net.io', subject: 'Re: sync this week', signal: 'reply' },
    { from: 'jules@seed-net.io', subject: 'Looking through the doc now', signal: 'open' },
  ],
  [
    { from: 'aki@seed-net.io', subject: 'Sharing this with the team', signal: 'star' },
    { from: 'noor@seed-net.io', subject: 'Re: pricing model', signal: 'reply' },
    { from: 'ravi@seed-net.io', subject: 'Quick read - opened it', signal: 'open' },
  ],
];

function VialsPanel({ vials }: { vials: VialSample[] }) {
  const SIGNAL_TONE: Record<VialSample['signal'], string> = {
    reply: C.accent,
    open: C.accent2,
    star: C.accent4,
  };
  // `tick` doubles as a sample index AND a re-mount key so the fill
  // animation replays. Index 0 always shows the parent-provided vials so
  // the panel respects the live adapter; further ticks pull from VIAL_POOLS.
  const [tick, setTick] = useState(0);
  const current = tick === 0 ? vials : VIAL_POOLS[(tick - 1) % VIAL_POOLS.length]!;
  const onResample = () => setTick((t) => t + 1);

  return (
    <PanelShell
      code="ST-04"
      title="Warmup Preview"
      instrument="Sample-output vials"
      Icon={TestTubes}
    >
      <div className="space-y-4 p-5">
        {/* Action bar — re-sample triggers a key bump that replays the
            fill animation and rotates through VIAL_POOLS. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-faint">
            Sample batch {tick === 0 ? 'A' : String.fromCharCode(65 + (tick % VIAL_POOLS.length))}
          </span>
          <button
            type="button"
            onClick={onResample}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-muted bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-dim transition-colors hover:border-accent2/40 hover:text-accent2"
          >
            <Shuffle className="h-3 w-3" />
            Re-sample
          </button>
        </div>

        <div
          key={`vials-${tick}`}
          className="flex items-end justify-around gap-4 rounded-lg border border-border-muted bg-bg px-4 pb-3 pt-6"
        >
          {current.map((v, i) => {
            const tone = SIGNAL_TONE[v.signal];
            return (
              <div key={`${v.from}-${tick}`} className="flex flex-col items-center gap-2">
                {/* Vial */}
                <div className="relative h-20 w-7 overflow-hidden rounded-b-full rounded-t-sm border border-border-muted bg-surface-2">
                  <motion.span
                    className="absolute inset-x-0 bottom-0 rounded-b-full"
                    style={{ background: tone, opacity: 0.85 }}
                    initial={{ height: 0 }}
                    animate={{ height: `${56 + i * 12}%` }}
                    transition={{
                      duration: 0.7,
                      delay: 0.15 + i * 0.12,
                      ease: 'easeOut',
                    }}
                  />
                  {/* meniscus shimmer */}
                  <motion.span
                    className="absolute inset-x-0 h-1"
                    style={{ background: 'rgba(255,255,255,0.12)' }}
                    initial={{ bottom: '0%' }}
                    animate={{ bottom: `${56 + i * 12}%` }}
                    transition={{
                      duration: 0.7,
                      delay: 0.15 + i * 0.12,
                      ease: 'easeOut',
                    }}
                  />
                </div>
                <span
                  className="font-mono text-[10px] font-semibold uppercase"
                  style={{ color: tone }}
                >
                  {v.signal}
                </span>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          {current.map((v, i) => (
            <motion.div
              key={`${v.from}-${tick}-row`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.25 + i * 0.06 }}
              className="rounded-lg border border-border-muted bg-bg px-3.5 py-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-mono text-[11px] text-text-dim">
                  {v.from}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: SIGNAL_TONE[v.signal] }}
                >
                  {v.signal}
                </span>
              </div>
              <p className="mt-0.5 truncate text-sm font-medium text-text">
                {v.subject}
              </p>
            </motion.div>
          ))}
        </div>
        <p className="rounded-lg border border-border-muted bg-bg px-3.5 py-2.5 text-[11px] text-text-dim">
          Vials are drawn from the live content factory. Nothing leaves the
          bench - this is a dry sample draw only.
        </p>
      </div>
    </PanelShell>
  );
}

export default ProPlusTool2Lab;
