import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Globe,
  Inbox,
  Mail,
  Radar,
  RadioTower,
  ShieldCheck,
  Signal,
  Siren,
  Waypoints,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';

/**
 * ProPlusRep1Mission — "Reputation Mission Control" (Pro Plus differentiator).
 *
 * A network-operations-center (NOC) status board for sender reputation —
 * deliberately an ops/monitoring console, NOT a card dashboard, ledger,
 * signal map, or audit checklist (sibling agents own those shapes).
 *
 * Standalone for the isolated preview harness: NO network / router / query
 * hooks, NO required props, inline MOCK. Renders ONLY page content — the
 * harness supplies the shell + sidebar.
 *
 * Board layout (top -> bottom):
 *   1. Ops header — title, Pro Plus chip, "all systems" live pulse, clock
 *   2. Reputation Index hero — big composite count-up (0-100) + status word
 *      (Nominal / Degraded / Critical), feed-rate readout, scan beam
 *   3. Subsystem rack — 4 monitored signal sources rendered like NOC tiles:
 *        · DNS Authentication   (SPF/DKIM/DMARC coverage)
 *        · Google Postmaster    (domain rep tier, IP rep, spam rate, auth)
 *        · Microsoft SNDS       (IP status, complaint rate, trap hits)
 *        · Blacklist Monitor    (zones clear / listed, RBL coverage)
 *      Each tile: status light (operational/watch/critical), 7-segment
 *      uptime strip, 2-3 live metrics, a tweened sparkline.
 *   4. Incident & event log — timestamped reputation events w/ severity chips
 *   5. Cross-mailbox health strip — per-mailbox index bars (Pro Plus = 15)
 *
 * Postmaster + SNDS are framed as CONNECTED & STREAMING (the Pro Plus
 * unlock) — both rack tiles carry a "live feed" pill and a green link light.
 *
 * Colour: existing Tailwind tokens only. operational -> accent,
 * watch -> accent4, critical -> accent3. Recharts pulls the same RGBs the
 * token palette uses so sparklines stay on-palette without importing chart
 * internals.
 */

// ---------------------------------------------------------------------------
// Palette — token RGBs (no new colours).
// ---------------------------------------------------------------------------

const C = {
  accent: 'rgb(255, 138, 75)', // text-accent2 RGB — info / link feed
  ok: 'rgb(242, 101, 34)', // operational
  watch: 'rgb(255, 213, 79)', // text-accent4 — watch
  crit: 'rgb(255, 107, 74)', // text-accent3 — critical
  muted: 'rgb(136, 136, 160)',
  grid: 'rgb(42, 42, 58)',
} as const;

type Health = 'operational' | 'watch' | 'critical';

const HEALTH_TEXT: Record<Health, string> = {
  operational: 'text-accent',
  watch: 'text-accent4',
  critical: 'text-accent3',
};

const HEALTH_DOT: Record<Health, string> = {
  operational: 'bg-accent',
  watch: 'bg-accent4',
  critical: 'bg-accent3',
};

const HEALTH_RGB: Record<Health, string> = {
  operational: C.ok,
  watch: C.watch,
  critical: C.crit,
};

const HEALTH_WORD: Record<Health, string> = {
  operational: 'Operational',
  watch: 'Watch',
  critical: 'Critical',
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ANCHOR = new Date('2026-05-18T14:08:00Z');

/** Deterministic wobble so the board renders identically every load. */
function spark(seed: number, n: number, base: number, amp: number, drift: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const v = base + drift * t + Math.sin(i * 0.7 + seed) * amp + Math.cos(i * 1.3 + seed) * amp * 0.4;
    return Math.round(v * 100) / 100;
  });
}

interface Metric {
  label: string;
  value: string;
  health: Health;
}

interface Subsystem {
  id: string;
  name: string;
  subtitle: string;
  Icon: typeof Mail;
  health: Health;
  /** 24-cell uptime strip: true = signal received that hour. */
  uptime: boolean[];
  uptimePct: number;
  feedLabel: string;
  /** true => Pro Plus external feed (live link light). */
  live: boolean;
  metrics: Metric[];
  series: { v: number }[];
  sparkSeed: number;
}

/** A perfect uptime strip with an optional dip window. */
function uptimeStrip(dips: number[] = []): boolean[] {
  return Array.from({ length: 24 }, (_, i) => !dips.includes(i));
}

interface IncidentEvent {
  id: string;
  at: string; // ISO
  source: string;
  severity: 'info' | 'watch' | 'critical';
  message: string;
  resolved?: boolean;
}

interface MailboxRow {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
  index: number;
  health: Health;
}

interface MissionData {
  index: number;
  status: Health;
  feedRatePerMin: number;
  sourcesOnline: number;
  sourcesTotal: number;
  mailboxCount: number;
  uptimeDays: number;
  subsystems: Subsystem[];
  events: IncidentEvent[];
  mailboxes: MailboxRow[];
}

function isoMinus(minutes: number): string {
  return new Date(ANCHOR.getTime() - minutes * 60_000).toISOString();
}

const MOCK: MissionData = {
  index: 93,
  status: 'operational',
  feedRatePerMin: 41,
  sourcesOnline: 4,
  sourcesTotal: 4,
  mailboxCount: 15,
  uptimeDays: 62,
  subsystems: [
    {
      id: 'dns',
      name: 'Domain records (DNS) authentication',
      subtitle: 'SPF · DKIM · DMARC · 15 mailboxes',
      Icon: Globe,
      health: 'operational',
      uptime: uptimeStrip(),
      uptimePct: 100,
      feedLabel: 'probe 5m',
      live: false,
      metrics: [
        { label: 'SPF pass', value: '15/15', health: 'operational' },
        { label: 'DKIM signed', value: '15/15', health: 'operational' },
        { label: 'DMARC align', value: '14/15', health: 'watch' },
      ],
      series: spark(1, 24, 96, 1.4, 3).map((v) => ({ v: Math.min(100, v) })),
      sparkSeed: 1,
    },
    {
      id: 'postmaster',
      name: 'Google Postmaster',
      subtitle: 'acme.io · Gmail-reported',
      Icon: Mail,
      health: 'operational',
      uptime: uptimeStrip([9]),
      uptimePct: 99.6,
      feedLabel: 'streaming · 8m ago',
      live: true,
      metrics: [
        { label: 'Domain trust', value: 'High', health: 'operational' },
        { label: 'IP trust', value: 'High', health: 'operational' },
        { label: 'Spam rate', value: '0.03%', health: 'operational' },
        { label: 'Auth pass', value: '99.6%', health: 'operational' },
      ],
      series: spark(2, 24, 78, 2.2, 14).map((v) => ({ v: Math.min(100, v) })),
      sparkSeed: 2,
    },
    {
      id: 'snds',
      name: 'Microsoft SNDS',
      subtitle: 'Outlook / Hotmail · per-IP',
      Icon: RadioTower,
      health: 'watch',
      uptime: uptimeStrip([16, 17]),
      uptimePct: 98.1,
      feedLabel: 'streaming · 14m ago',
      live: true,
      metrics: [
        { label: 'IP status', value: 'Green', health: 'operational' },
        { label: 'Complaint', value: '0.31%', health: 'watch' },
        { label: 'Trap hits 30d', value: '1', health: 'watch' },
      ],
      series: spark(3, 24, 62, 3.1, -2).map((v) => ({ v: Math.max(0, v) })),
      sparkSeed: 3,
    },
    {
      id: 'blacklist',
      name: 'Block-list monitor',
      subtitle: '6 RBL zones · all sending IPs',
      Icon: ShieldCheck,
      health: 'watch',
      uptime: uptimeStrip([20]),
      uptimePct: 99.2,
      feedLabel: 'sweep 30m',
      live: false,
      metrics: [
        { label: 'Zones clear', value: '5/6', health: 'operational' },
        { label: 'Listed', value: '1', health: 'watch' },
        { label: 'Delist ETA', value: '~6h', health: 'watch' },
      ],
      series: spark(4, 24, 90, 1.0, 4).map((v) => ({ v: Math.min(100, v) })),
      sparkSeed: 4,
    },
  ],
  events: [
    {
      id: 'e1',
      at: isoMinus(4),
      source: 'Postmaster',
      severity: 'info',
      message: 'Domain trust held at High — spam rate steady at 0.03%.',
    },
    {
      id: 'e2',
      at: isoMinus(22),
      source: 'SNDS',
      severity: 'watch',
      message: 'IP 198.51.x complaint rate crossed 0.30% watch line.',
    },
    {
      id: 'e3',
      at: isoMinus(58),
      source: 'DNS',
      severity: 'info',
      message: 'DMARC alignment restored on success@acme.io after domain records (DNS) push.',
      resolved: true,
    },
    {
      id: 'e4',
      at: isoMinus(96),
      source: 'Block list',
      severity: 'watch',
      message: 'acme.co listed on SORBS DUHL (dynamic range) — delist requested.',
    },
    {
      id: 'e5',
      at: isoMinus(150),
      source: 'SNDS',
      severity: 'critical',
      message: 'Trap hit recorded on legacy list segment — segment quarantined.',
      resolved: true,
    },
    {
      id: 'e6',
      at: isoMinus(210),
      source: 'Postmaster',
      severity: 'info',
      message: 'Auth pass rate climbed to 99.6% (SPF+DKIM+DMARC).',
    },
    {
      id: 'e7',
      at: isoMinus(320),
      source: 'Engine',
      severity: 'info',
      message: 'Trust Index recomputed: 91 → 93 over rolling 24h.',
    },
    {
      id: 'e8',
      at: isoMinus(540),
      source: 'DNS',
      severity: 'watch',
      message: 'SPF lookup count at 9/10 on acme.co — flatten before adding senders.',
    },
    {
      id: 'e9',
      at: isoMinus(880),
      source: 'SNDS',
      severity: 'info',
      message: 'Microsoft SNDS feed connected — per-IP filter data flowing.',
      resolved: true,
    },
    {
      id: 'e10',
      at: isoMinus(900),
      source: 'Postmaster',
      severity: 'info',
      message: 'Google Postmaster feed connected — domain trust flowing.',
      resolved: true,
    },
  ],
  mailboxes: [
    { id: 'm1', email: 'founder@acme.io', provider: 'gmail', index: 96, health: 'operational' },
    { id: 'm2', email: 'sales@acme.io', provider: 'outlook', index: 94, health: 'operational' },
    { id: 'm3', email: 'success@acme.io', provider: 'gmail', index: 88, health: 'operational' },
    { id: 'm4', email: 'hello@acme.co', provider: 'smtp', index: 79, health: 'watch' },
    { id: 'm5', email: 'support@acme.io', provider: 'gmail', index: 95, health: 'operational' },
    { id: 'm6', email: 'team@acme.co', provider: 'yahoo', index: 71, health: 'watch' },
    { id: 'm7', email: 'ar@acme.io', provider: 'outlook', index: 92, health: 'operational' },
    { id: 'm8', email: 'demo@acme.io', provider: 'gmail', index: 90, health: 'operational' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clockLabel(): string {
  return ANCHOR.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function relTime(iso: string): string {
  const mins = Math.round((ANCHOR.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

const SEV_META: Record<
  IncidentEvent['severity'],
  { text: string; ring: string; dot: string; label: string; Icon: typeof Activity }
> = {
  info: {
    text: 'text-accent',
    ring: 'border-accent/30 bg-accent/10',
    dot: 'bg-accent',
    label: 'INFO',
    Icon: CircleDot,
  },
  watch: {
    text: 'text-accent4',
    ring: 'border-accent4/30 bg-accent4/10',
    dot: 'bg-accent4',
    label: 'WATCH',
    Icon: AlertTriangle,
  },
  critical: {
    text: 'text-accent3',
    ring: 'border-accent3/30 bg-accent3/10',
    dot: 'bg-accent3',
    label: 'CRIT',
    Icon: Siren,
  },
};

const PROVIDER_LETTER: Record<MailboxRow['provider'], string> = {
  gmail: 'G',
  outlook: 'O',
  yahoo: 'Y',
  smtp: 'S',
};

const TOOLTIP_STYLE = {
  background: 'rgb(26, 26, 38)',
  border: `1px solid ${C.grid}`,
  borderRadius: 10,
  fontSize: 12,
  color: 'rgb(232, 232, 240)',
} as const;

// ---------------------------------------------------------------------------
// Count-up hook — drives the big Reputation Index when the hero scrolls in.
// ---------------------------------------------------------------------------

function useCountUp(target: number, run: boolean, ms = 1100): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
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

export function ProPlusRep1Mission(): JSX.Element {
  const d = MOCK;
  const heroRef = useRef<HTMLDivElement>(null);
  const heroIn = useInView(heroRef, { once: true, amount: 0.4 });
  const indexVal = useCountUp(d.index, heroIn);

  const liveFeeds = useMemo(
    () => d.subsystems.filter((s) => s.live).length,
    [d.subsystems],
  );
  const openIncidents = useMemo(
    () => d.events.filter((e) => e.severity !== 'info' && !e.resolved).length,
    [d.events],
  );

  return (
    <div className="space-y-5">
      {/* ───────── Ops header ───────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-muted bg-surface-2 text-accent">
              <Radar className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-text">
                  Sender Trust Mission Control
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-accent3/30 bg-accent3/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent3">
                  <Signal className="h-3 w-3" />
                  Pro Plus
                </span>
              </div>
              <p className="text-sm text-text-dim">
                Live network-operations board — every sender-trust signal source
                monitored across {d.mailboxCount} mailboxes.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3.5 py-1.5 text-xs">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="font-medium text-text">
              {d.sourcesOnline}/{d.sourcesTotal} sources online
            </span>
            <span className="text-border-muted">·</span>
            <span className="text-text-dim">{liveFeeds} live feeds</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border-muted bg-surface px-3 py-1.5 font-mono text-xs text-text-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {clockLabel()} UTC
          </div>
        </div>
      </motion.header>

      {/* ───────── Reputation Index hero ───────── */}
      <motion.div
        ref={heroRef}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="relative overflow-hidden rounded-xl border border-border-muted bg-surface"
      >
        {/* Scan beam */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent/[0.07] to-transparent"
          initial={{ x: '-120%' }}
          animate={{ x: '320%' }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />
        {/* Ruled grid backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse at 30% 50%, black, transparent 75%)',
          }}
        />

        <div className="relative grid gap-6 p-6 lg:grid-cols-12 lg:items-center">
          {/* Dial */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-5">
              <IndexDial value={indexVal} status={d.status} run={heroIn} />
              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-dim">
                  Trust Index
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-4xl font-semibold tabular-nums text-text">
                    {indexVal}
                  </span>
                  <span className="text-sm text-text-dim">/ 100</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${HEALTH_TEXT[d.status]}`}
                  style={{ borderColor: `${HEALTH_RGB[d.status]}55`, background: `${HEALTH_RGB[d.status]}1f` }}
                >
                  <motion.span
                    className={`h-1.5 w-1.5 rounded-full ${HEALTH_DOT[d.status]}`}
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  All systems {HEALTH_WORD[d.status].toLowerCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Readout strip */}
          <div className="grid grid-cols-2 gap-3 lg:col-span-8 lg:grid-cols-4">
            <ReadoutTile
              Icon={Waypoints}
              label="Signal feed"
              value={`${d.feedRatePerMin}/min`}
              note="ingest rate"
              tone="operational"
            />
            <ReadoutTile
              Icon={RadioTower}
              label="External feeds"
              value={`${liveFeeds} live`}
              note="Postmaster + SNDS"
              tone="operational"
            />
            <ReadoutTile
              Icon={Siren}
              label="Open incidents"
              value={String(openIncidents)}
              note={openIncidents === 0 ? 'all clear' : 'on watch'}
              tone={openIncidents === 0 ? 'operational' : 'watch'}
            />
            <ReadoutTile
              Icon={Activity}
              label="Board uptime"
              value={`${d.uptimeDays}d`}
              note="continuous"
              tone="operational"
            />
          </div>
        </div>
      </motion.div>

      {/* ───────── Subsystem rack ───────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5">
          <RadioTower className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
            Signal-source subsystems
          </h2>
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Postmaster + SNDS streaming
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {d.subsystems.map((s, i) => (
            <SubsystemTile key={s.id} sys={s} order={i} />
          ))}
        </div>
      </div>

      {/* ───────── Incident log + cross-mailbox strip ───────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Incident & event log */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="overflow-hidden rounded-xl border border-border-muted bg-surface lg:col-span-7"
        >
          <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Incident &amp; event log
              </h3>
            </div>
            <span className="font-mono text-[11px] text-text-dim">
              rolling 24h · {d.events.length} events
            </span>
          </header>
          <ul className="divide-y divide-border-muted">
            {d.events.map((ev, i) => {
              const m = SEV_META[ev.severity];
              return (
                <motion.li
                  key={ev.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.24 + i * 0.045 }}
                  className="flex items-start gap-3 px-5 py-3"
                >
                  <span className="mt-0.5 font-mono text-[11px] tabular-nums text-text-dim">
                    -{relTime(ev.at)}
                  </span>
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${m.ring} ${m.text}`}
                  >
                    <m.Icon className="h-2.5 w-2.5" />
                    {m.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-text">
                      {ev.message}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-dim">
                      <span className="font-medium">{ev.source}</span>
                      {ev.resolved && (
                        <span className="inline-flex items-center gap-1 text-accent">
                          <CheckCircle2 className="h-3 w-3" />
                          resolved
                        </span>
                      )}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </motion.section>

        {/* Cross-mailbox health strip */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.26 }}
          className="overflow-hidden rounded-xl border border-border-muted bg-surface lg:col-span-5"
        >
          <header className="flex items-center justify-between border-b border-border-muted px-5 py-4">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-text">
                Cross-mailbox health
              </h3>
            </div>
            <span className="font-mono text-[11px] text-text-dim">
              top {d.mailboxes.length} of {d.mailboxCount}
            </span>
          </header>
          <ul className="divide-y divide-border-muted">
            {d.mailboxes.map((mb, i) => (
              <motion.li
                key={mb.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: 0.3 + i * 0.04 }}
                className="flex items-center gap-3 px-5 py-2.5"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-bg ${HEALTH_DOT[mb.health]}`}
                  aria-hidden
                >
                  {PROVIDER_LETTER[mb.provider]}
                </span>
                <span className="w-32 shrink-0 truncate text-xs font-medium text-text">
                  {mb.email}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className={`h-full rounded-full ${HEALTH_DOT[mb.health]}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${mb.index}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.34 + i * 0.04 }}
                  />
                </div>
                <span
                  className={`w-7 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${HEALTH_TEXT[mb.health]}`}
                >
                  {mb.index}
                </span>
              </motion.li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border-muted px-5 py-3 text-[11px] text-text-dim">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {d.mailboxes.filter((m) => m.health === 'operational').length} operational
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent4" />
              {d.mailboxes.filter((m) => m.health === 'watch').length} on watch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent3" />
              {d.mailboxes.filter((m) => m.health === 'critical').length} critical
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

/** Big composite arc gauge — SVG ring that sweeps to the index value. */
function IndexDial({
  value,
  status,
  run,
}: {
  value: number;
  status: Health;
  run: boolean;
}) {
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  // 270° sweep (gap at the bottom).
  const arc = 0.75;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = HEALTH_RGB[status];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[225deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={C.grid}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * arc} ${circ}`}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * arc} ${circ}`}
          initial={{ strokeDashoffset: circ * arc }}
          animate={{ strokeDashoffset: run ? circ * arc * (1 - pct) : circ * arc }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className={HEALTH_TEXT[status]}
          animate={{ opacity: [1, 0.55, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Radar className="h-5 w-5" />
        </motion.span>
        <span className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text">
          {value}
        </span>
      </div>
    </div>
  );
}

function ReadoutTile({
  Icon,
  label,
  value,
  note,
  tone,
}: {
  Icon: typeof Activity;
  label: string;
  value: string;
  note: string;
  tone: Health;
}) {
  return (
    <div className="rounded-lg border border-border-muted bg-surface-2/70 px-3.5 py-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-text-dim">
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${HEALTH_TEXT[tone]}`} />
      </div>
      <div className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-text">
        {value}
      </div>
      <div className={`text-[11px] ${HEALTH_TEXT[tone]}`}>{note}</div>
    </div>
  );
}

function SubsystemTile({ sys, order }: { sys: Subsystem; order: number }) {
  const color = HEALTH_RGB[sys.health];
  const gid = `rep1-${sys.id}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 + order * 0.07 }}
      className="flex flex-col gap-3 rounded-xl border border-border-muted bg-surface p-4"
    >
      {/* Header — icon, name, blinking status light */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${color}1f`, color }}
          >
            <sys.Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-text">
              {sys.name}
            </h3>
            <p className="truncate text-[11px] text-text-dim">{sys.subtitle}</p>
          </div>
        </div>
        <motion.span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[sys.health]}`}
          animate={{ opacity: [1, 0.25, 1], scale: [1, 0.85, 1] }}
          transition={{
            duration: sys.health === 'critical' ? 0.9 : 1.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          title={HEALTH_WORD[sys.health]}
        />
      </div>

      {/* Status + feed pill row */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${HEALTH_TEXT[sys.health]}`}
        >
          {HEALTH_WORD[sys.health]}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            sys.live
              ? 'border-accent/30 bg-accent/10 text-accent'
              : 'border-border-muted bg-surface-2 text-text-dim'
          }`}
        >
          {sys.live && (
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
          )}
          {sys.feedLabel}
        </span>
      </div>

      {/* Uptime strip — 24 segments */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px] text-text-dim">
          <span>24h uptime</span>
          <span className="font-mono tabular-nums">{sys.uptimePct}%</span>
        </div>
        <div className="flex gap-[2px]">
          {sys.uptime.map((up, i) => (
            <motion.span
              key={i}
              className="h-5 flex-1 rounded-[2px]"
              style={{ background: up ? color : C.crit }}
              initial={{ opacity: 0, scaleY: 0.3 }}
              animate={{ opacity: up ? 1 : 0.5, scaleY: 1 }}
              transition={{ duration: 0.25, delay: 0.2 + order * 0.07 + i * 0.012 }}
            />
          ))}
        </div>
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 gap-1.5">
        {sys.metrics.map((mt) => (
          <div
            key={mt.label}
            className="rounded-md border border-border-muted bg-surface-2/60 px-2 py-1.5"
          >
            <div className="truncate text-[10px] text-text-dim">{mt.label}</div>
            <div
              className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${HEALTH_TEXT[mt.health]}`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${HEALTH_DOT[mt.health]}`}
              />
              {mt.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <div className="h-12 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sys.series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={['dataMin - 4', 'dataMax + 4']} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ stroke: C.grid }}
              formatter={(v: number) => [v, 'signal']}
              labelFormatter={() => ''}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.8}
              fill={`url(#${gid})`}
              isAnimationActive
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

export default ProPlusRep1Mission;
