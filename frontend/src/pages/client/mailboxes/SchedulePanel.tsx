import { useMemo, useState } from 'react';
import { Clock, Minus, Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import {
  useUpdateMailboxSchedule,
  type UpdateScheduleWindowPayload,
} from '@/features/mailboxes/api';
import type { Mailbox } from '@/features/mailboxes/types';

/**
 * Send-window editor for a single mailbox.
 *
 * Backend contract: ``PATCH /api/workspace/mailboxes/{id}/schedule`` with
 * ``{tz, weekday_mask, start_hour, end_hour}``. ``weekday_mask`` is a
 * bitfield (bit 0 = Mon … bit 6 = Sun), so a row of seven checkboxes maps
 * cleanly onto the wire shape.
 *
 * Hours run 0..24 (24 means "until midnight"); start must be < end.
 */

const WEEKDAYS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** ``Intl.supportedValuesOf('timeZone')`` is widely available in modern
 *  browsers; older ones fall back to a curated list covering the common
 *  business zones. */
function listTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) return supported;
  } catch {
    // ignore
  }
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Asia/Tokyo',
    'Asia/Singapore',
    'Asia/Kolkata',
    'Australia/Sydney',
  ];
}

function maskFromDays(active: boolean[]): number {
  return active.reduce((acc, on, i) => (on ? acc | (1 << i) : acc), 0);
}

function daysFromMask(mask: number): boolean[] {
  return WEEKDAYS.map((_, i) => (mask & (1 << i)) !== 0);
}

function fmtHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  if (h === 24) return 'midnight';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

function describe(payload: UpdateScheduleWindowPayload, dailyTarget: number): string {
  const days = daysFromMask(payload.weekday_mask);
  const active = days.flatMap((on, i) => (on ? [WEEKDAYS[i]] : []));
  const dayPart =
    active.length === 7
      ? 'Every day'
      : active.length === 0
      ? 'Never'
      : active.length === 5 && payload.weekday_mask === 31
      ? 'Mon–Fri'
      : active.length === 2 && payload.weekday_mask === 96
      ? 'Sat–Sun'
      : active.join(', ');
  const hourPart = `${fmtHour(payload.start_hour)}–${fmtHour(payload.end_hour)} ${payload.tz}`;
  // ~rate is rough: dailyTarget spread evenly over the active hour band.
  const span = Math.max(1, payload.end_hour - payload.start_hour);
  const perHour = Math.max(1, Math.round(dailyTarget / span));
  return `${dayPart} · ${hourPart} · ~${perHour} sends/hr (target ${dailyTarget}/day)`;
}

interface SchedulePanelProps {
  mailbox: Mailbox;
}

export function SchedulePanel({ mailbox }: SchedulePanelProps) {
  const update = useUpdateMailboxSchedule();
  const tzOptions = useMemo(() => listTimezones(), []);

  // Asia/Calcutta is a deprecated IANA alias for Asia/Kolkata — Chromium
  // still emits the old name from `resolvedOptions().timeZone`. Normalize
  // so the UI label matches the workspace timezone the user picked.
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const normalizedBrowserTz = browserTz === 'Asia/Calcutta' ? 'Asia/Kolkata' : browserTz;
  const initial = mailbox.schedule_window ?? {
    tz: normalizedBrowserTz,
    weekday_mask: 31, // Mon-Fri
    start_hour: 9,
    end_hour: 17,
  };

  const [tz, setTz] = useState(initial.tz);
  const [days, setDays] = useState<boolean[]>(daysFromMask(initial.weekday_mask));
  const [startHour, setStartHour] = useState(initial.start_hour);
  const [endHour, setEndHour] = useState(initial.end_hour);

  const payload: UpdateScheduleWindowPayload = {
    tz,
    weekday_mask: maskFromDays(days),
    start_hour: startHour,
    end_hour: endHour,
  };

  const dirty =
    !mailbox.schedule_window ||
    mailbox.schedule_window.tz !== payload.tz ||
    mailbox.schedule_window.weekday_mask !== payload.weekday_mask ||
    mailbox.schedule_window.start_hour !== payload.start_hour ||
    mailbox.schedule_window.end_hour !== payload.end_hour;

  const valid = startHour < endHour && payload.weekday_mask > 0;

  const onSave = () => {
    update.mutate(
      { id: mailbox.id, payload },
      {
        onSuccess: () => toast.success('Schedule saved'),
        onError: (err: unknown) => {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response?.data
              ?.detail;
          toast.error(typeof detail === 'string' ? detail : 'Failed to save schedule');
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border-muted bg-surface-2/30 p-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold">Send window</p>
        </div>
        <p className="mt-2 text-xs text-text-dim">
          Warmup sends only fire during this window in the mailbox's local time.
          Outside the window the engine waits for the next valid hour.
        </p>
        <p className="mt-3 text-sm font-medium text-text">
          {describe(payload, mailbox.daily_target)}
        </p>
      </div>

      <FormField label="Timezone" htmlFor="schedule-tz">
        <AppSelect value={tz} onValueChange={setTz}>
          <AppSelectTrigger id="schedule-tz" aria-label="Timezone">
            <AppSelectValue placeholder="Pick a timezone" />
          </AppSelectTrigger>
          <AppSelectContent className="max-h-72 overflow-y-auto">
            {tzOptions.map((z) => (
              <AppSelectItem key={z} value={z}>
                {z}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </AppSelect>
      </FormField>

      <FormField label="Active days">
        <div
          role="group"
          aria-label="Active days of the week"
          className="flex flex-wrap gap-2"
        >
          {WEEKDAYS.map((label, i) => {
            const active = days[i];
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  const next = [...days];
                  next[i] = !next[i];
                  setDays(next);
                }}
                className={
                  'h-9 rounded-md border px-3 text-xs font-semibold transition-colors focus-ring ' +
                  (active
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border-muted bg-surface text-text-dim hover:bg-surface-2')
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField label={`Hours (${fmtHour(startHour)} – ${fmtHour(endHour)})`}>
        <HourTimeline
          startHour={startHour}
          endHour={endHour}
          onChange={(s, e) => {
            setStartHour(s);
            setEndHour(e);
          }}
        />
      </FormField>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Save className="h-4 w-4" />}
          disabled={!dirty || !valid || update.isPending}
          onClick={onSave}
        >
          {update.isPending ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HourTimeline — 24-hour strip with two draggable handles + step buttons.
//
// Replaces a pair of stacked "start" / "end" range sliders. The strip shows
// the full day (0 → 24) with hour-tick guides, and the active send-window
// is rendered as a filled accent band between the two handles. The handles
// are native ``<input type="range">`` elements absolutely-positioned over
// the strip so keyboard / touch / pointer behaviour comes for free. Below
// the strip, two value pills with +/− steppers cover users who prefer
// discrete clicks over dragging.
//
// Invariants enforced inside ``HourTimeline``:
//   - 0 ≤ start < end ≤ 24
//   - moving start past end (or end past start) auto-pushes the other handle
//     by one hour rather than crossing
// ---------------------------------------------------------------------------

interface HourTimelineProps {
  startHour: number;
  endHour: number;
  onChange: (start: number, end: number) => void;
}

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24] as const;

function HourTimeline({ startHour, endHour, onChange }: HourTimelineProps) {
  const clampStart = (v: number) => Math.max(0, Math.min(23, v));
  const clampEnd = (v: number) => Math.max(1, Math.min(24, v));

  const setStart = (raw: number) => {
    const v = clampStart(raw);
    const e = v >= endHour ? Math.min(24, v + 1) : endHour;
    onChange(v, e);
  };
  const setEnd = (raw: number) => {
    const v = clampEnd(raw);
    const s = v <= startHour ? Math.max(0, v - 1) : startHour;
    onChange(s, v);
  };

  const startPct = (startHour / 24) * 100;
  const endPct = (endHour / 24) * 100;
  const spanHours = Math.max(0, endHour - startHour);

  return (
    <div className="space-y-3">
      {/* 24-hour strip with active-window band + dual handles. */}
      <div
        className="relative h-12 select-none rounded-md border border-border-muted bg-surface px-0"
        aria-label="24-hour send window"
      >
        {/* Hour tick guides (vertical lines at every 3 hours). */}
        <div className="pointer-events-none absolute inset-0">
          {HOUR_TICKS.map((h) => {
            const left = (h / 24) * 100;
            const isMajor = h % 6 === 0;
            return (
              <span
                key={h}
                className={
                  'absolute top-1 bottom-1 w-px ' +
                  (isMajor ? 'bg-border-muted' : 'bg-border-muted/50')
                }
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>

        {/* Active send window — accent-tinted band between start and end. */}
        <div
          className="pointer-events-none absolute inset-y-1 rounded-sm bg-accent/25 ring-1 ring-inset ring-accent/60"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
          }}
        />

        {/* Two transparent range inputs stacked on top of the strip to
            handle dragging. ``pointer-events: none`` on the track via
            ``timeline-handle`` class keeps the strip clickable through
            empty regions while leaving thumbs draggable. */}
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={startHour}
          onChange={(e) => setStart(Number(e.target.value))}
          aria-label="Window start hour"
          className="timeline-handle absolute inset-y-0 left-0 right-0 h-full w-full appearance-none bg-transparent accent-accent"
          style={{ pointerEvents: 'none' }}
        />
        <input
          type="range"
          min={1}
          max={24}
          step={1}
          value={endHour}
          onChange={(e) => setEnd(Number(e.target.value))}
          aria-label="Window end hour"
          className="timeline-handle absolute inset-y-0 left-0 right-0 h-full w-full appearance-none bg-transparent accent-accent"
          style={{ pointerEvents: 'none' }}
        />
        <style>{`
          .timeline-handle::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 18px;
            height: 36px;
            border-radius: 6px;
            background: rgb(242, 101, 34);
            border: 2px solid rgb(18, 18, 26);
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
            cursor: grab;
            pointer-events: auto;
          }
          .timeline-handle::-webkit-slider-thumb:active { cursor: grabbing; }
          .timeline-handle::-moz-range-thumb {
            width: 18px;
            height: 36px;
            border-radius: 6px;
            background: rgb(242, 101, 34);
            border: 2px solid rgb(18, 18, 26);
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
            cursor: grab;
            pointer-events: auto;
          }
          .timeline-handle::-moz-range-thumb:active { cursor: grabbing; }
          .timeline-handle::-webkit-slider-runnable-track {
            background: transparent;
          }
          .timeline-handle::-moz-range-track { background: transparent; }
        `}</style>
      </div>

      {/* Hour-axis labels under the strip. Endpoints are nudged inward
          (translate 0 / -100% on first / last) so neither hangs off the
          edge; intermediate ticks center on their position. */}
      <div className="relative h-4 text-[10px] tabular-nums text-text-dim">
        {HOUR_TICKS.map((h, i, arr) => {
          const isFirst = i === 0;
          const isLast = i === arr.length - 1;
          const transform = isFirst
            ? 'translateX(0)'
            : isLast
              ? 'translateX(-100%)'
              : 'translateX(-50%)';
          return (
            <span
              key={h}
              className="absolute"
              style={{ left: `${(h / 24) * 100}%`, transform }}
            >
              {h === 0
                ? '12a'
                : h === 12
                  ? '12p'
                  : h === 24
                    ? '12a'
                    : h > 12
                      ? `${h - 12}p`
                      : `${h}a`}
            </span>
          );
        })}
      </div>

      {/* Discrete +/− steppers — accessibility + input-impaired users. */}
      <div className="grid grid-cols-2 gap-3">
        <HourStepper
          label="Start"
          value={startHour}
          min={0}
          max={23}
          onChange={setStart}
        />
        <HourStepper
          label="End"
          value={endHour}
          min={1}
          max={24}
          onChange={setEnd}
        />
      </div>

      <p className="text-xs text-text-dim">
        Active window:{' '}
        <span className="font-medium text-text">
          {fmtHour(startHour)} – {fmtHour(endHour)}
        </span>{' '}
        ({spanHours} {spanHours === 1 ? 'hour' : 'hours'} / day)
      </p>
    </div>
  );
}

interface HourStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

function HourStepper({ label, value, min, max, onChange }: HourStepperProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border-muted bg-surface px-2 py-1.5">
      <span className="text-xs text-text-dim">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()} hour`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex h-7 w-7 items-center justify-center rounded border border-border-muted bg-surface-2 text-text-dim transition-colors hover:bg-surface-2/70 disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-text">
          {fmtHour(value)}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()} hour`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex h-7 w-7 items-center justify-center rounded border border-border-muted bg-surface-2 text-text-dim transition-colors hover:bg-surface-2/70 disabled:cursor-not-allowed disabled:opacity-40 focus-ring"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
