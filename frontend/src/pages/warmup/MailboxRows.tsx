import { useEffect, useState } from 'react';
import { Chip } from '../../components/ui';
import { warmthColor, type ChartTheme } from './chartTheme';
import type { WarmupMailbox, WarmupMailboxStatus } from '../../lib/warmupApi';
import { MailboxDetailDrawer, RowActions, type SettlePhase } from './MailboxActions';

/** status → app Chip tone (paused always wins, like the source badge logic). */
function statusTone(status: WarmupMailboxStatus, paused: boolean): 'success' | 'warn' | 'accent' | 'neutral' {
  if (paused) return 'warn';
  if (status === 'active') return 'success';
  if (status === 'pending') return 'neutral';
  if (status === 'completed') return 'accent';
  return 'neutral';
}

function statusLabel(status: WarmupMailboxStatus, paused: boolean): string {
  if (paused) return 'Paused';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * 7 points around the mailbox's score — the API list view carries no
 * per-mailbox history, so (exactly like the source fallback) we draw a
 * deterministic shape from the score: same input, same sparkline, no shimmer
 * across re-renders.
 */
function sparkPoints(score: number): number[] {
  return Array.from({ length: 7 }, (_, i) => {
    const wobble = Math.sin(i * 1.3 + score) * 4;
    return Math.max(0, Math.min(100, score + wobble));
  });
}

/** Tiny inline SVG sparkline — no chart lib per row, scales via viewBox. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 96;
  const h = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="warmup-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden focusable="false">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One row per mailbox: status chip, email, sent-today, sparkline, warmth,
 * pause/resume + details. Local state mirrors the prop list so pause/resume
 * can flip optimistically and settle from the server row; `onChanged` lets
 * the page refresh its counters after any committed change.
 */
export function MailboxRows({
  mailboxes,
  theme,
  onChanged,
}: {
  mailboxes: WarmupMailbox[];
  theme: ChartTheme;
  /** page-level refresh (summary counters) after any committed change */
  onChanged?: () => void;
}) {
  const [items, setItems] = useState(mailboxes);
  const [detailId, setDetailId] = useState<string | null>(null);

  // the prop list is authoritative whenever the page reloads it
  useEffect(() => setItems(mailboxes), [mailboxes]);

  /** Row swap from a pause/resume. Only the `server` phase needs care: the
   *  pause/resume routes return MailboxOut WITHOUT today counters (only the
   *  LIST route computes them, defaulting to 0 there), so keep the row's
   *  current numbers until the page refresh lands. Optimistic/revert copies
   *  already carry them, and the list-refresh path above is untouched — a
   *  genuine 0 from a real reload still shows. */
  const settle = (updated: WarmupMailbox, phase: SettlePhase) =>
    setItems((prev) =>
      prev.map((m) => {
        if (m.id !== updated.id) return m;
        if (phase !== 'server') return updated;
        return {
          ...updated,
          sent_today: m.sent_today,
          opens_today: m.opens_today,
          replies_today: m.replies_today,
        };
      }),
    );

  const detail = detailId ? (items.find((m) => m.id === detailId) ?? null) : null;

  return (
    <>
      <ul className="warmup-mailbox-list">
        {items.map((m) => {
          const color = warmthColor(m.warmth_score, theme);
          return (
            <li key={m.id} className="warmup-mailbox-row">
              <div className="warmup-mailbox-id">
                <span className="warmup-mailbox-email" title={m.email_address}>{m.email_address}</span>
                <span className="warmup-mailbox-meta">
                  {m.provider} · day {m.current_day} · {m.sent_today} sent today
                </span>
              </div>
              <Sparkline values={sparkPoints(m.warmth_score)} color={color} />
              <span className="warmup-mailbox-warmth" style={{ color }}>
                {Math.round(m.warmth_score)}
              </span>
              <Chip tone={statusTone(m.warmup_status, m.is_paused)}>{statusLabel(m.warmup_status, m.is_paused)}</Chip>
              <RowActions
                mailbox={m}
                onDetails={() => setDetailId(m.id)}
                onSettled={settle}
                onCommitted={() => onChanged?.()}
              />
            </li>
          );
        })}
      </ul>
      {detail && (
        <MailboxDetailDrawer
          mailbox={detail}
          theme={theme}
          onClose={() => setDetailId(null)}
          onSettled={settle}
          onChanged={() => onChanged?.()}
        />
      )}
    </>
  );
}
