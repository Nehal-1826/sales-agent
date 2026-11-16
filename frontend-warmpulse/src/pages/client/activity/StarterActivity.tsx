import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { formatDate } from '@/lib/format';
import {
  Activity,
  ArrowRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  RefreshCcw,
  Reply as ReplyIcon,
  ShieldAlert,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMailboxes } from '@/features/mailboxes/api';
import { useActivityFeedInfinite, useTodayStats } from '@/features/activity/api';
import type {
  ActivityAction,
  ActivityFilterState,
  ActivityItem,
} from '@/features/activity/types';
import './starter-activity.css';

/**
 * /app/activity — STARTER tier (A3 Chart + Drilldown).
 *
 * Layout:
 *   ┌─ Today strip ────────────────────────┐
 *   │ Sent · Opens · Replies · Spam-rescue │
 *   ├─ 7-day stacked bar chart ────────────┤
 *   │  click a bar to filter the list      │
 *   ├─ Selected-day chip + action filters  │
 *   └─ Event list (drilldown) ─────────────┘
 *
 * Data:
 *   - useTodayStats()             today's counters
 *   - useActivityFeedInfinite()   feed (re-used for client-side daily bucket)
 *   - useMailboxes()              limits to the single Starter mailbox
 *
 * Starter sends ~50/day on one mailbox, so 7 days × 1 mailbox is enough
 * volume to make a stacked chart legible without a separate aggregate
 * endpoint.
 */

type ActionFilter = ActivityAction | 'all';

const ACTION_META: Record<
  Exclude<ActivityAction, 'marked_important'>,
  { label: string; tone: string; Icon: typeof Mail }
> = {
  sent: { label: 'Sent', tone: 'send', Icon: Mail },
  opened: { label: 'Opened', tone: 'open', Icon: MailOpen },
  replied: { label: 'Replied', tone: 'reply', Icon: ReplyIcon },
  starred: { label: 'Starred', tone: 'star', Icon: Star },
  spam_rescued: { label: 'Recovered', tone: 'rescue', Icon: ShieldAlert },
};

interface DayBucket {
  /** YYYY-MM-DD in local time. */
  key: string;
  /** ISO start-of-day. */
  startISO: string;
  /** Short label like "Wed 14". */
  label: string;
  /** Long label like "Wed 14 May". */
  longLabel: string;
  sent: number;
  opened: number;
  replied: number;
  starred: number;
  spam_rescued: number;
  total: number;
}

export function StarterActivity() {
  const mailboxesQuery = useMailboxes();
  const mailbox = mailboxesQuery.data?.items?.[0];

  // Lock the feed to the single Starter mailbox. The backend will still
  // honour cross-mailbox queries; we just don't expose that surface here.
  const filters: ActivityFilterState = useMemo(
    () => (mailbox ? { mailbox_id: mailbox.id } : {}),
    [mailbox],
  );

  const feed = useActivityFeedInfinite(filters);
  const today = useTodayStats(mailbox?.id);

  // Flatten paginated feed; recompute only when query data changes.
  const items: ActivityItem[] = useMemo(() => {
    const pages = feed.data?.pages ?? [];
    const all: ActivityItem[] = [];
    for (const p of pages) all.push(...(p.items ?? []));
    return all;
  }, [feed.data]);

  // 7 daily buckets, oldest-first. Client-side aggregate from the feed.
  const buckets = useMemo<DayBucket[]>(() => buildDayBuckets(items), [items]);

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');

  // List filtering — pick the events that fall inside the selected day +
  // match the action filter. Capped at 50 rows for UI weight.
  const filteredEvents = useMemo<ActivityItem[]>(() => {
    let out = items;
    if (selectedDayKey) {
      out = out.filter((e) => isoToDayKey(e.ts) === selectedDayKey);
    }
    if (actionFilter !== 'all') {
      out = out.filter((e) => e.action === actionFilter);
    }
    return out.slice(0, 50);
  }, [items, selectedDayKey, actionFilter]);

  const selectedBucket = selectedDayKey
    ? buckets.find((b) => b.key === selectedDayKey)
    : null;

  const isLoading = mailboxesQuery.isLoading || feed.isLoading;
  const noMailbox = !mailboxesQuery.isLoading && !mailbox;

  if (noMailbox) {
    return (
      <div className="sa">
        <header className="sa__head">
          <h1 className="sa__title">Warmup Activity</h1>
          <p className="sa__sub">See what your warmup mailbox is doing day-by-day.</p>
        </header>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailbox connected"
          description="Finish onboarding to start producing warmup activity."
        />
      </div>
    );
  }

  const todayStats = today.data ?? { sent: 0, opens: 0, replies: 0, spam_rescues: 0 };

  return (
    <div className="sa">
      <header className="sa__head">
        <div>
          <h1 className="sa__title">Warmup Activity</h1>
          <p className="sa__sub">
            Day-by-day pulse for{' '}
            <span className="sa__sub-em">{mailbox?.email_address ?? 'your mailbox'}</span>.
            Click a bar to drill into a day.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => feed.refetch()}
          disabled={feed.isFetching}
          leftIcon={
            feed.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )
          }
        >
          Refresh
        </Button>
      </header>

      {/* Today strip */}
      <div className="sa-today">
        <TodayTile
          label="Sent today"
          value={todayStats.sent}
          tone="send"
          Icon={Mail}
        />
        <TodayTile
          label="Opens today"
          value={todayStats.opens}
          tone="open"
          Icon={MailOpen}
        />
        <TodayTile
          label="Replies today"
          value={todayStats.replies}
          tone="reply"
          Icon={ReplyIcon}
        />
        <TodayTile
          label="Spam recoveries"
          value={todayStats.spam_rescues}
          tone="rescue"
          Icon={ShieldAlert}
        />
      </div>

      {/* 7-day chart */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sa-chart"
      >
        <div className="sa-chart__head">
          <div>
            <span className="sa-chart__eyebrow">
              <Activity size={11} strokeWidth={2.4} />
              Last 7 days
            </span>
            <h2 className="sa-chart__title">Activity by day</h2>
          </div>
          <div className="sa-chart__legend">
            <LegendDot tone="send" label="Sent" />
            <LegendDot tone="open" label="Opens" />
            <LegendDot tone="reply" label="Replies" />
            <LegendDot tone="star" label="Stars" />
            <LegendDot tone="rescue" label="Recoveries" />
          </div>
        </div>

        <StackedBarChart
          buckets={buckets}
          selectedKey={selectedDayKey}
          onSelect={(key) =>
            setSelectedDayKey((prev) => (prev === key ? null : key))
          }
          isLoading={isLoading}
        />
      </motion.section>

      {/* Selected day + action filters */}
      <div className="sa-controls">
        <div className="sa-controls__day">
          <span className="sa-controls__day-label">
            {selectedBucket
              ? `${selectedBucket.longLabel} · ${selectedBucket.total} ${
                  selectedBucket.total === 1 ? 'event' : 'events'
                }`
              : `All last 7 days · ${items.length} ${
                  items.length === 1 ? 'event' : 'events'
                }`}
          </span>
          {selectedDayKey && (
            <button
              type="button"
              className="sa-controls__clear"
              onClick={() => setSelectedDayKey(null)}
            >
              Clear day
            </button>
          )}
        </div>

        <div className="sa-controls__chips" role="tablist">
          <FilterChip
            label="All"
            active={actionFilter === 'all'}
            onClick={() => setActionFilter('all')}
          />
          {(['sent', 'opened', 'replied', 'starred', 'spam_rescued'] as const).map(
            (a) => (
              <FilterChip
                key={a}
                label={ACTION_META[a].label}
                tone={ACTION_META[a].tone}
                active={actionFilter === a}
                onClick={() => setActionFilter(a)}
              />
            ),
          )}
        </div>
      </div>

      {/* Event drilldown list */}
      <motion.div
        key={`${selectedDayKey ?? 'all'}-${actionFilter}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="sa-feed"
      >
        {feed.isLoading ? (
          <div className="sa-empty">Loading activity…</div>
        ) : filteredEvents.length === 0 ? (
          <div className="sa-empty">
            <Inbox size={18} strokeWidth={2} style={{ opacity: 0.6 }} />
            <p style={{ margin: '6px 0 0' }}>
              {selectedDayKey
                ? `No ${actionFilter === 'all' ? 'events' : ACTION_META[actionFilter as Exclude<ActivityAction, 'marked_important'>]?.label.toLowerCase() ?? 'events'} on this day.`
                : 'No activity yet — the first send lands within the hour after onboarding completes.'}
            </p>
          </div>
        ) : (
          filteredEvents.map((evt) => <EventRow key={evt.id} event={evt} />)
        )}

        {filteredEvents.length > 0 && feed.hasNextPage && !selectedDayKey && (
          <div className="sa-feed__more">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
            >
              {feed.isFetchingNextPage ? 'Loading…' : 'Load older events'}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ============================================================================
   Today tile
============================================================================ */
function TodayTile({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: string;
  Icon: typeof Mail;
}) {
  return (
    <div className={`sa-tile sa-tile--${tone}`}>
      <span className="sa-tile__icon">
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <span className="sa-tile__num">{value}</span>
      <span className="sa-tile__label">{label}</span>
    </div>
  );
}

/* ============================================================================
   Legend dot
============================================================================ */
function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="sa-chart__legend-dot">
      <span className={`sa-dot sa-dot--${tone}`} />
      {label}
    </span>
  );
}

/* ============================================================================
   Filter chip
============================================================================ */
function FilterChip({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`sa-chip ${active ? 'sa-chip--active' : ''} ${tone ? `sa-chip--${tone}` : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/* ============================================================================
   Stacked bar chart — hand-rolled SVG, ~70 lines, zero deps.
============================================================================ */
const CHART_W = 720;
const CHART_H = 240;
const BAR_GAP = 28;
const PADDING_X = 16;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28; // for x-axis labels

const TONE_FILL: Record<string, string> = {
  send: 'rgb(255, 138, 75)', // cyan — sent
  open: 'rgb(242, 101, 34)', // green — opened
  reply: 'rgb(255, 213, 79)', // yellow — replied
  star: 'rgb(255, 150, 112)', // violet — starred
  rescue: 'rgb(255, 107, 74)', // red — spam rescue
};

function StackedBarChart({
  buckets,
  selectedKey,
  onSelect,
  isLoading,
}: {
  buckets: DayBucket[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  isLoading: boolean;
}) {
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
  // Round up to a nice y-axis ceiling.
  const yMax = niceCeiling(maxTotal);

  const innerW = CHART_W - PADDING_X * 2;
  const innerH = CHART_H - PADDING_TOP - PADDING_BOTTOM;
  const barW = Math.min(48, (innerW - BAR_GAP * (buckets.length - 1)) / buckets.length);

  return (
    <div className="sa-chart__svg-wrap">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Last 7 days of warmup activity by action type"
      >
        {/* Y grid lines (4 ticks) */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PADDING_TOP + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={PADDING_X}
                x2={CHART_W - PADDING_X}
                y1={y}
                y2={y}
                stroke="rgb(42, 42, 58)"
                strokeDasharray="3 6"
                strokeWidth={1}
              />
              <text
                x={PADDING_X - 4}
                y={y + 3}
                textAnchor="end"
                fill="rgb(136, 136, 160)"
                fontSize={10}
                fontFamily="Outfit, system-ui, sans-serif"
              >
                {Math.round(yMax * frac)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {buckets.map((b, i) => {
          const x = PADDING_X + i * (barW + BAR_GAP);
          const stacks: Array<{ tone: string; value: number }> = [
            { tone: 'send', value: b.sent },
            { tone: 'open', value: b.opened },
            { tone: 'reply', value: b.replied },
            { tone: 'star', value: b.starred },
            { tone: 'rescue', value: b.spam_rescued },
          ];
          let yCursor = PADDING_TOP + innerH;
          const isSelected = selectedKey === b.key;
          const isDimmed = selectedKey !== null && !isSelected;

          return (
            <g
              key={b.key}
              style={{
                cursor: 'pointer',
                opacity: isDimmed ? 0.35 : 1,
                transition: 'opacity 180ms ease',
              }}
              onClick={() => onSelect(b.key)}
            >
              {/* Invisible full-bar click target so empty days are still clickable */}
              <rect
                x={x - 4}
                y={PADDING_TOP}
                width={barW + 8}
                height={innerH}
                fill="transparent"
              />
              {b.total === 0 ? (
                // Empty-day placeholder: a thin baseline pill so users see the day exists.
                <rect
                  x={x}
                  y={PADDING_TOP + innerH - 4}
                  width={barW}
                  height={4}
                  rx={2}
                  fill="rgb(42, 42, 58)"
                />
              ) : (
                stacks.map((s, j) => {
                  if (s.value === 0) return null;
                  const h = (s.value / yMax) * innerH;
                  yCursor -= h;
                  return (
                    <rect
                      key={s.tone}
                      x={x}
                      y={yCursor}
                      width={barW}
                      height={h}
                      fill={TONE_FILL[s.tone]}
                      // Rounded top-left+right corner only on the top-most segment.
                      rx={j === stacks.length - 1 ? 3 : 0}
                    >
                      <title>
                        {b.longLabel} · {s.tone}: {s.value}
                      </title>
                    </rect>
                  );
                })
              )}

              {/* Selected outline */}
              {isSelected && (
                <rect
                  x={x - 4}
                  y={PADDING_TOP - 4}
                  width={barW + 8}
                  height={innerH + 8}
                  fill="none"
                  stroke="rgb(242, 101, 34)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  rx={6}
                />
              )}

              {/* X-axis label */}
              <text
                x={x + barW / 2}
                y={CHART_H - 10}
                textAnchor="middle"
                fill={isSelected ? 'rgb(232, 232, 240)' : 'rgb(136, 136, 160)'}
                fontSize={10}
                fontWeight={isSelected ? 600 : 400}
                fontFamily="Outfit, system-ui, sans-serif"
              >
                {b.label}
              </text>

              {/* Total above bar when non-zero */}
              {b.total > 0 && (
                <text
                  x={x + barW / 2}
                  y={
                    PADDING_TOP +
                    innerH -
                    (b.total / yMax) * innerH -
                    6
                  }
                  textAnchor="middle"
                  fill="rgb(232, 232, 240)"
                  fontSize={10}
                  fontWeight={600}
                  fontFamily="Outfit, system-ui, sans-serif"
                >
                  {b.total}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {isLoading && (
        <div className="sa-chart__loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading activity…
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   Event row in the drilldown list
============================================================================ */
function EventRow({ event }: { event: ActivityItem }) {
  const meta = ACTION_META[event.action as Exclude<ActivityAction, 'marked_important'>];
  const tone = meta?.tone ?? 'send';
  const Icon = meta?.Icon ?? Mail;
  const label = meta?.label ?? event.action;

  return (
    <div className="sa-row">
      <span className="sa-row__time">{formatTime(event.ts)}</span>
      <span className={`sa-row__action sa-row__action--${tone}`}>
        <Icon size={11} strokeWidth={2.4} />
        {label}
      </span>
      <span className="sa-row__peer" title={event.peer_email}>
        {event.peer_email}
      </span>
      {event.subject && (
        <span className="sa-row__subject" title={event.subject}>
          <ArrowRight size={10} strokeWidth={2.2} />
          {event.subject}
        </span>
      )}
      {event.result === 'error' && event.error && (
        <span className="sa-row__err" title={event.error}>
          error
        </span>
      )}
    </div>
  );
}

/* ============================================================================
   Helpers
============================================================================ */

/** Build last-7-days buckets from the activity feed. Oldest first. */
function buildDayBuckets(items: ActivityItem[]): DayBucket[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const buckets: DayBucket[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() - (6 - i));
    return {
      key: dayKey(d),
      startISO: d.toISOString(),
      label: formatDate(d),
      longLabel: formatDate(d),
      sent: 0,
      opened: 0,
      replied: 0,
      starred: 0,
      spam_rescued: 0,
      total: 0,
    };
  });

  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const item of items) {
    const k = isoToDayKey(item.ts);
    const b = byKey.get(k);
    if (!b) continue;
    if (item.action === 'sent') b.sent++;
    else if (item.action === 'opened') b.opened++;
    else if (item.action === 'replied') b.replied++;
    else if (item.action === 'starred') b.starred++;
    else if (item.action === 'spam_rescued') b.spam_rescued++;
    else continue;
    b.total++;
  }

  return buckets;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return dayKey(d);
}

function niceCeiling(n: number): number {
  if (n <= 4) return 4;
  if (n <= 10) return 10;
  if (n <= 20) return 20;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  // Round up to nearest 50.
  return Math.ceil(n / 50) * 50;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return formatDate(d);
}

export default StarterActivity;
