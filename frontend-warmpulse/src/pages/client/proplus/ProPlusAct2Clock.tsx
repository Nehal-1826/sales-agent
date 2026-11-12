import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  Mail,
  MailOpen,
  Moon,
  Reply as ReplyIcon,
  ShieldAlert,
  Sparkles,
  Star,
  Sun,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';

/**
 * ProPlusAct2Clock — STANDALONE Pro-Plus "Warmup Activity" section, rendered
 * as a 24-hour RADIAL ACTIVITY CLOCK for the isolated preview harness.
 *
 * The organising metaphor is a clock face, NOT a bar chart / timeline /
 * Slack feed / grid heatmap / log. Activity is laid out around a circle:
 *
 *   - 24 hour wedges sweep clockwise from midnight at the top (12 o'clock).
 *   - Five concentric rings stack from the centre out, one per action type
 *     (sent / opened / replied / starred / spam-rescue). Each ring band is
 *     painted as a per-hour donut-segment whose RADIAL THICKNESS encodes that
 *     hour's volume for that action — busy hours bulge outward, quiet hours
 *     stay thin. The result reads like a polar sunburst, not stacked bars.
 *   - A sweeping "now" hand points at the current hour and slowly orbits.
 *   - Seven small weekday mini-dials sit beside the main dial; selecting one
 *     re-feeds the big dial + side breakdown panel (peak / quiet hour, totals).
 *   - Hovering an hour wedge spotlights it and drives the breakdown panel.
 *
 * Fully standalone: no router / query / fetch — everything is the inline
 * deterministic `MOCK`. Renders ONLY page content; the harness supplies the
 * shell. Pro Plus framing: 15 mailboxes.
 */

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

export type ActivityAction =
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescued';

/** One hour's activity counts, indexed 0..23 (hour-of-day, local). */
export interface HourSlice {
  hour: number;
  sent: number;
  opened: number;
  replied: number;
  starred: number;
  spam_rescued: number;
  total: number;
}

export interface WeekdayDial {
  /** 0 = Mon … 6 = Sun. */
  index: number;
  short: string;
  long: string;
  /** 24-length hour distribution for this weekday. */
  hours: HourSlice[];
  total: number;
  peakHour: number;
}

export interface ClockMock {
  mailboxCount: number;
  activeCount: number;
  /** Hour-of-day the "now" hand points at. */
  nowHour: number;
  weekdays: WeekdayDial[];
}

// ---------------------------------------------------------------------------
// Mock data — deterministic, realistic warmup shape (busy daytime, quiet night)
// ---------------------------------------------------------------------------

const ACTIONS: ActivityAction[] = [
  'sent',
  'opened',
  'replied',
  'starred',
  'spam_rescued',
];

/**
 * Diurnal weight for an hour: near-silent overnight, ramps from ~07:00,
 * twin humps mid-morning + mid-afternoon, tapers after 20:00. Pure function
 * of the hour + a deterministic per-weekday phase so each day differs but
 * nothing is random.
 */
function diurnal(hour: number, dayPhase: number): number {
  if (hour < 6 || hour > 22) {
    // Overnight floor — a trickle of opens/replies from earlier sends.
    return 0.06 + 0.04 * Math.abs(Math.sin((hour + dayPhase) * 1.3));
  }
  const morning = Math.exp(-((hour - 10) ** 2) / 7);
  const afternoon = 0.85 * Math.exp(-((hour - 15.5) ** 2) / 9);
  const lull = hour >= 12 && hour <= 13 ? 0.72 : 1; // lunch dip
  return (0.18 + (morning + afternoon) * lull) * (0.9 + 0.16 * Math.sin(dayPhase));
}

function buildHourSlices(dayIndex: number): HourSlice[] {
  const dayPhase = dayIndex * 0.9;
  // Weekends run lighter — fewer mailboxes actively warming.
  const weekendScale = dayIndex >= 5 ? 0.55 : 1;
  return Array.from({ length: 24 }, (_, hour) => {
    const w = diurnal(hour, dayPhase) * weekendScale;
    // Deterministic jitter so adjacent hours aren't a perfect curve.
    const jitter = 0.82 + 0.36 * Math.abs(Math.sin(hour * 2.4 + dayIndex));
    const sent = Math.round(26 * w * jitter);
    const opened = Math.round(sent * (0.66 + 0.08 * Math.sin(hour + dayIndex)));
    const replied = Math.round(sent * (0.24 + 0.05 * Math.cos(hour * 1.7)));
    const starred = Math.round(sent * (0.12 + 0.03 * Math.sin(hour * 0.9)));
    const spam_rescued =
      w > 0.45 && (hour + dayIndex) % 5 === 0 ? 1 + (hour % 2) : 0;
    const total = sent + opened + replied + starred + spam_rescued;
    return { hour, sent, opened, replied, starred, spam_rescued, total };
  });
}

function buildWeekdays(): WeekdayDial[] {
  const META: Array<{ short: string; long: string }> = [
    { short: 'Mon', long: 'Monday' },
    { short: 'Tue', long: 'Tuesday' },
    { short: 'Wed', long: 'Wednesday' },
    { short: 'Thu', long: 'Thursday' },
    { short: 'Fri', long: 'Friday' },
    { short: 'Sat', long: 'Saturday' },
    { short: 'Sun', long: 'Sunday' },
  ];
  return META.map((m, index) => {
    const hours = buildHourSlices(index);
    const total = hours.reduce((s, h) => s + h.total, 0);
    let peakHour = 0;
    let peakVal = -1;
    for (const h of hours) {
      if (h.total > peakVal) {
        peakVal = h.total;
        peakHour = h.hour;
      }
    }
    return { index, short: m.short, long: m.long, hours, total, peakHour };
  });
}

const MOCK: ClockMock = {
  mailboxCount: 15,
  activeCount: 14,
  nowHour: 15,
  weekdays: buildWeekdays(),
};

// ---------------------------------------------------------------------------
// Action metadata — tokens only (accent / accent2 / accent3 / accent4 / dim)
// ---------------------------------------------------------------------------

const ACTION_META: Record<
  ActivityAction,
  { label: string; Icon: typeof Mail; stroke: string; textClass: string }
> = {
  sent: {
    label: 'Sent',
    Icon: Mail,
    stroke: 'var(--wp-accent, #F26522)',
    textClass: 'text-accent',
  },
  opened: {
    label: 'Opened',
    Icon: MailOpen,
    stroke: '#FF8A4B', // accent2
    textClass: 'text-accent2',
  },
  replied: {
    label: 'Replied',
    Icon: ReplyIcon,
    stroke: '#ffd54f', // accent4
    textClass: 'text-accent4',
  },
  starred: {
    label: 'Starred',
    Icon: Star,
    stroke: '#ff6b4a', // accent3
    textClass: 'text-accent3',
  },
  spam_rescued: {
    label: 'Spam recovery',
    Icon: ShieldAlert,
    stroke: '#8888a0', // text-dim
    textClass: 'text-text-dim',
  },
};

// ---------------------------------------------------------------------------
// Polar geometry — SVG is a fixed 400×400 viewBox, dial centred at (200, 200)
// ---------------------------------------------------------------------------

const VIEW = 400;
const CX = 200;
const CY = 200;

/** Innermost radius (hub) and outermost radius (rim) of the ring stack. */
const R_INNER = 64;
const R_OUTER = 178;
/** Gap between consecutive action rings so bands read as separate tracks. */
const RING_GAP = 3;
const RING_COUNT = ACTIONS.length;
/** Base radial span allotted to each ring track. */
const RING_SPAN = (R_OUTER - R_INNER - RING_GAP * (RING_COUNT - 1)) / RING_COUNT;

/**
 * Hour h occupies the wedge [h, h+1) of the 24h dial. 0h starts at 12 o'clock
 * (straight up) and sweeps clockwise. SVG y grows downward, so screen-up is
 * -90°. We convert hour → angle, then polar → cartesian.
 */
function hourToAngleDeg(hourFrac: number): number {
  return (hourFrac / 24) * 360 - 90;
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/**
 * Donut-segment path for one hour of one ring: an annular sector between
 * radii r0 (inner) and r1 (outer), spanning the hour's angular wedge with a
 * small padding so adjacent wedges don't fuse.
 */
function ringSegmentPath(
  hour: number,
  r0: number,
  r1: number,
  padDeg: number,
): string {
  const a0 = hourToAngleDeg(hour) + padDeg;
  const a1 = hourToAngleDeg(hour + 1) - padDeg;
  const [ox0, oy0] = polar(CX, CY, r1, a0);
  const [ox1, oy1] = polar(CX, CY, r1, a1);
  const [ix1, iy1] = polar(CX, CY, r0, a1);
  const [ix0, iy0] = polar(CX, CY, r0, a0);
  const largeArc = a1 - a0 > 180 ? 1 : 0;
  return [
    `M ${ox0.toFixed(2)} ${oy0.toFixed(2)}`,
    `A ${r1} ${r1} 0 ${largeArc} 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${r0} ${r0} 0 ${largeArc} 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)}`,
    'Z',
  ].join(' ');
}

/** Full-track faint guide ring (a thin stroked circle at a given radius). */
function trackRadius(ringIndex: number): { r0: number; r1: number; mid: number } {
  const r0 = R_INNER + ringIndex * (RING_SPAN + RING_GAP);
  const r1 = r0 + RING_SPAN;
  return { r0, r1, mid: (r0 + r1) / 2 };
}

// ---------------------------------------------------------------------------
// Animation presets
// ---------------------------------------------------------------------------

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: 'easeOut' as const, delay },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPlusAct2Clock({
  data,
}: { data?: ClockMock } = {}): JSX.Element {
  const model = data ?? MOCK;
  const [dayIndex, setDayIndex] = useState<number>(2); // default: Wednesday
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const day = model.weekdays[dayIndex]!;
  const hours = day.hours;

  // Per-ring max volume → radial scale (so each action ring uses its own
  // dynamic range; opens always dwarf rescues otherwise).
  const ringMax = useMemo(() => {
    const m: Record<ActivityAction, number> = {
      sent: 1,
      opened: 1,
      replied: 1,
      starred: 1,
      spam_rescued: 1,
    };
    for (const a of ACTIONS) {
      m[a] = Math.max(1, ...hours.map((h) => h[a]));
    }
    return m;
  }, [hours]);

  // Totals + peak / quiet hour for the breakdown panel.
  const stats = useMemo(() => {
    const totals: Record<ActivityAction, number> = {
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescued: 0,
    };
    for (const h of hours)
      for (const a of ACTIONS) totals[a] += h[a];
    let peak = hours[0]!;
    let quiet = hours[0]!;
    for (const h of hours) {
      if (h.total > peak.total) peak = h;
      if (h.total < quiet.total) quiet = h;
    }
    const grand = ACTIONS.reduce((s, a) => s + totals[a], 0);
    return { totals, grand, peak, quiet };
  }, [hours]);

  const focusHour = hoverHour ?? day.peakHour;
  const focusSlice = hours[focusHour]!;

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
              Warmup activity clock
            </h1>
            <Badge variant="orange">
              <Sparkles className="h-3 w-3" />
              Pro Plus
            </Badge>
          </div>
          <p className="text-sm text-text-dim">
            A 24-hour radial view of when the helper network works across{' '}
            {model.mailboxCount} mailboxes — rings stack sent, opened, replied,
            starred and spam recovery by hour of day.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-muted bg-surface/60 px-3.5 py-1.5 text-xs text-text-dim backdrop-blur-xl">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="font-medium text-text">
            {model.activeCount}/{model.mailboxCount} warming
          </span>
          <span className="text-border-muted">·</span>
          <span>now {String(model.nowHour).padStart(2, '0')}:00</span>
        </div>
      </motion.header>

      {/* Weekday selector — 7 mini-dials */}
      <motion.div {...fade(0.05)}>
        <Card noShimmer>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-dim">
              <Clock className="h-3.5 w-3.5 text-accent" />
              Weekday
            </div>
            <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0">
            <div className="grid grid-cols-7 gap-2 min-w-[26rem] sm:min-w-0">
              {model.weekdays.map((wd) => (
                <MiniDial
                  key={wd.index}
                  wd={wd}
                  active={wd.index === dayIndex}
                  onClick={() => {
                    setDayIndex(wd.index);
                    setHoverHour(null);
                  }}
                />
              ))}
            </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Main grid: dial + breakdown panel */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* The clock */}
        <motion.div {...fade(0.1)}>
          <Card className="h-full" noShimmer>
            <div className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-text">
                    {day.long} · 24-hour dial
                  </h3>
                  <p className="text-xs text-text-dim">
                    Each ring band&apos;s thickness is that hour&apos;s volume.
                    Hover a wedge to inspect it.
                  </p>
                </div>
                <span className="hidden items-center gap-1.5 rounded-full border border-border-muted px-2.5 py-1 text-xs text-text-dim sm:flex">
                  {formatNumber(stats.grand)} signals
                </span>
              </div>

              <ClockDial
                hours={hours}
                ringMax={ringMax}
                nowHour={model.nowHour}
                hoverHour={hoverHour}
                onHover={setHoverHour}
                dayIndex={dayIndex}
              />

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1">
                {ACTIONS.map((a) => {
                  const meta = ACTION_META[a];
                  return (
                    <span
                      key={a}
                      className="flex items-center gap-1.5 text-xs text-text-dim"
                    >
                      <span
                        className="inline-block h-2 w-4 rounded-full"
                        style={{ background: meta.stroke }}
                        aria-hidden
                      />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Breakdown panel */}
        <motion.div {...fade(0.16)} className="space-y-4">
          {/* Focused hour card */}
          <Card noShimmer>
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-text-dim">
                  {hoverHour === null ? 'Peak hour' : 'Hovered hour'}
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent tabular-nums">
                  <Clock className="h-3 w-3" />
                  {String(focusHour).padStart(2, '0')}:00 –{' '}
                  {String((focusHour + 1) % 24).padStart(2, '0')}:00
                </span>
              </div>
              <motion.p
                key={`focus-${dayIndex}-${focusHour}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="text-3xl font-semibold tabular-nums leading-none text-text"
              >
                {formatNumber(focusSlice.total)}
                <span className="ml-1.5 text-sm font-normal text-text-dim">
                  signals
                </span>
              </motion.p>
              <div className="space-y-2 pt-1">
                {ACTIONS.map((a) => {
                  const meta = ACTION_META[a];
                  const val = focusSlice[a];
                  const pct =
                    focusSlice.total > 0
                      ? Math.round((val / focusSlice.total) * 100)
                      : 0;
                  return (
                    <div key={a} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-text-dim">
                          <meta.Icon
                            className={`h-3.5 w-3.5 ${meta.textClass}`}
                          />
                          {meta.label}
                        </span>
                        <span className="tabular-nums text-text">
                          {formatNumber(val)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: meta.stroke }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.5,
                            ease: 'easeOut',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Day totals + peak/quiet */}
          <Card noShimmer>
            <div className="space-y-3 p-5">
              <span className="text-xs uppercase tracking-wider text-text-dim">
                {day.long} totals
              </span>
              <div className="grid grid-cols-2 gap-3">
                {ACTIONS.map((a) => {
                  const meta = ACTION_META[a];
                  return (
                    <div
                      key={a}
                      className="rounded-lg border border-border-muted bg-surface-2/60 p-3"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-text-dim">
                        <meta.Icon
                          className={`h-3.5 w-3.5 ${meta.textClass}`}
                        />
                        {meta.label}
                      </div>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-text">
                        {formatNumber(stats.totals[a] ?? 0)}
                      </p>
                    </div>
                  );
                })}
                <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
                  <div className="text-xs text-accent">Total signals</div>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-text">
                    {formatNumber(stats.grand)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface-2/60 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent4/10 text-accent4">
                    <Sun className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-text-dim">Busiest hour</p>
                    <p className="truncate text-sm font-medium tabular-nums text-text">
                      {String(stats.peak.hour).padStart(2, '0')}:00 ·{' '}
                      {formatNumber(stats.peak.total)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-border-muted bg-surface-2/60 p-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-dim">
                    <Moon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-text-dim">Quietest hour</p>
                    <p className="truncate text-sm font-medium tabular-nums text-text">
                      {String(stats.quiet.hour).padStart(2, '0')}:00 ·{' '}
                      {formatNumber(stats.quiet.total)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The radial clock — hand-rolled SVG, fixed 400×400 viewBox
// ---------------------------------------------------------------------------

function ClockDial({
  hours,
  ringMax,
  nowHour,
  hoverHour,
  onHover,
  dayIndex,
}: {
  hours: HourSlice[];
  ringMax: Record<ActivityAction, number>;
  nowHour: number;
  hoverHour: number | null;
  onHover: (h: number | null) => void;
  dayIndex: number;
}) {
  // Now-hand angle: point at the middle of the current hour wedge.
  const nowAngle = hourToAngleDeg(nowHour + 0.5);
  const [handX, handY] = polar(CX, CY, R_OUTER + 6, nowAngle);

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="h-auto w-full"
        role="img"
        aria-label="24-hour radial clock of warmup activity by action type"
      >
        {/* Faint track guides + hub */}
        {ACTIONS.map((_, ringIndex) => {
          const { mid } = trackRadius(ringIndex);
          return (
            <circle
              key={`track-${ringIndex}`}
              cx={CX}
              cy={CY}
              r={mid}
              fill="none"
              stroke="#2a2a3a"
              strokeWidth={trackSpanStroke()}
              strokeOpacity={0.35}
            />
          );
        })}

        {/* Hour spokes every 3h + ring of hour ticks */}
        {Array.from({ length: 24 }, (_, h) => {
          const major = h % 3 === 0;
          const a = hourToAngleDeg(h);
          const [x1, y1] = polar(CX, CY, R_INNER - 4, a);
          const [x2, y2] = polar(CX, CY, R_OUTER + 4, a);
          return (
            <line
              key={`spoke-${h}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#2a2a3a"
              strokeWidth={major ? 1 : 0.5}
              strokeOpacity={major ? 0.5 : 0.25}
            />
          );
        })}

        {/* Activity ring segments */}
        {ACTIONS.map((action, ringIndex) => {
          const meta = ACTION_META[action];
          const { r0, r1 } = trackRadius(ringIndex);
          const span = r1 - r0;
          const max = ringMax[action];
          return (
            <g key={`ring-${action}`}>
              {hours.map((slice) => {
                const v = slice[action];
                // Radial fill fraction (min sliver so empty hours still show
                // the track position faintly).
                const frac = max > 0 ? v / max : 0;
                const thick = Math.max(span * 0.06, span * frac);
                const segR1 = r0 + thick;
                const isFocus =
                  hoverHour === slice.hour ||
                  (hoverHour === null && false);
                const dim = hoverHour !== null && hoverHour !== slice.hour;
                const d = ringSegmentPath(slice.hour, r0, segR1, 1.4);
                return (
                  <motion.path
                    key={`${action}-${slice.hour}`}
                    d={d}
                    fill={meta.stroke}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{
                      opacity: dim ? 0.22 : isFocus ? 1 : 0.82,
                      scale: 1,
                    }}
                    transition={{
                      opacity: { duration: 0.25 },
                      scale: {
                        duration: 0.5,
                        delay: 0.12 + slice.hour * 0.018,
                        ease: 'easeOut',
                      },
                    }}
                    style={{ transformOrigin: `${CX}px ${CY}px` }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Transparent hover wedges spanning the whole stack (full radius so
            thin hours are still easy to target). */}
        {hours.map((slice) => {
          const d = ringSegmentPath(slice.hour, R_INNER - 4, R_OUTER + 4, 0);
          return (
            <path
              key={`hit-${slice.hour}`}
              d={d}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => onHover(slice.hour)}
              onMouseLeave={() => onHover(null)}
            >
              <title>
                {String(slice.hour).padStart(2, '0')}:00 — {slice.total} signals
              </title>
            </path>
          );
        })}

        {/* Hovered wedge highlight outline */}
        {hoverHour !== null && (
          <motion.path
            key={`focus-ring-${hoverHour}-${dayIndex}`}
            d={ringSegmentPath(hoverHour, R_INNER - 4, R_OUTER + 4, 0)}
            fill="none"
            stroke="var(--wp-accent, #F26522)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          />
        )}

        {/* Sweeping "now" hand */}
        <motion.g
          initial={{ rotate: -8, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.5 }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <line
            x1={CX}
            y1={CY}
            x2={handX}
            y2={handY}
            stroke="var(--wp-accent, #F26522)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <motion.circle
            cx={handX}
            cy={handY}
            r={4}
            fill="var(--wp-accent, #F26522)"
            animate={{ r: [4, 6, 4], opacity: [1, 0.6, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.g>

        {/* Center hub */}
        <circle
          cx={CX}
          cy={CY}
          r={R_INNER - 8}
          fill="#12121a"
          stroke="#2a2a3a"
          strokeWidth={1}
        />
        <text
          x={CX}
          y={CY - 7}
          textAnchor="middle"
          fill="#8888a0"
          fontSize={10}
          fontFamily="Outfit, system-ui, sans-serif"
          style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          Signals
        </text>
        <text
          x={CX}
          y={CY + 13}
          textAnchor="middle"
          fill="#e8e8f0"
          fontSize={20}
          fontWeight={600}
          fontFamily="Outfit, system-ui, sans-serif"
        >
          {formatNumber(hours.reduce((s, h) => s + h.total, 0))}
        </text>

        {/* Hour-of-day labels at the 4 cardinals + 8 secondary marks */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
          const a = hourToAngleDeg(h);
          const [lx, ly] = polar(CX, CY, R_OUTER + 16, a);
          return (
            <text
              key={`lbl-${h}`}
              x={lx}
              y={ly + 3}
              textAnchor="middle"
              fill={h === nowHour - (nowHour % 3) ? '#e8e8f0' : '#5a5a72'}
              fontSize={10}
              fontWeight={h % 6 === 0 ? 600 : 400}
              fontFamily="Outfit, system-ui, sans-serif"
            >
              {String(h).padStart(2, '0')}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** Stroke width used to render a faint full-circle guide per ring track. */
function trackSpanStroke(): number {
  return RING_SPAN;
}

// ---------------------------------------------------------------------------
// Weekday mini-dial — a compact radial sparkline (single ring of total volume)
// ---------------------------------------------------------------------------

function MiniDial({
  wd,
  active,
  onClick,
}: {
  wd: WeekdayDial;
  active: boolean;
  onClick: () => void;
}) {
  const SIZE = 56;
  const c = SIZE / 2;
  const rIn = 12;
  const rOut = 24;
  const max = Math.max(1, ...wd.hours.map((h) => h.total));

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${wd.long} · ${formatNumber(wd.total)} signals`}
      className={
        active
          ? 'flex flex-col items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-1.5 py-2 transition-colors'
          : 'flex flex-col items-center gap-1 rounded-lg border border-border-muted bg-surface-2/60 px-1.5 py-2 transition-colors hover:border-accent/30'
      }
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-10 w-10"
        aria-hidden
      >
        <circle
          cx={c}
          cy={c}
          r={(rIn + rOut) / 2}
          fill="none"
          stroke="#2a2a3a"
          strokeWidth={rOut - rIn}
          strokeOpacity={0.35}
        />
        {wd.hours.map((h) => {
          const frac = h.total / max;
          const thick = Math.max((rOut - rIn) * 0.08, (rOut - rIn) * frac);
          const a0 = (h.hour / 24) * 360 - 90 + 1.5;
          const a1 = ((h.hour + 1) / 24) * 360 - 90 - 1.5;
          const toXY = (r: number, ang: number): [number, number] => {
            const rad = (ang * Math.PI) / 180;
            return [c + r * Math.cos(rad), c + r * Math.sin(rad)];
          };
          const [ox0, oy0] = toXY(rIn + thick, a0);
          const [ox1, oy1] = toXY(rIn + thick, a1);
          const [ix1, iy1] = toXY(rIn, a1);
          const [ix0, iy0] = toXY(rIn, a0);
          const d = [
            `M ${ox0.toFixed(2)} ${oy0.toFixed(2)}`,
            `A ${(rIn + thick).toFixed(2)} ${(rIn + thick).toFixed(2)} 0 0 1 ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
            `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
            `A ${rIn} ${rIn} 0 0 0 ${ix0.toFixed(2)} ${iy0.toFixed(2)}`,
            'Z',
          ].join(' ');
          return (
            <path
              key={h.hour}
              d={d}
              fill={
                active ? 'var(--wp-accent, #F26522)' : '#8888a0'
              }
              fillOpacity={active ? 0.9 : 0.6}
            />
          );
        })}
      </svg>
      <span
        className={
          active
            ? 'text-[11px] font-semibold text-accent'
            : 'text-[11px] font-medium text-text-dim'
        }
      >
        {wd.short}
      </span>
    </button>
  );
}

export default ProPlusAct2Clock;
