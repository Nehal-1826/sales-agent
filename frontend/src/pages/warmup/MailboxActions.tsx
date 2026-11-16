import { useState } from 'react';
import { Chip } from '../../components/ui';
import { LoadError, toast } from '../../components/feedback';
import { ConfirmButton, Drawer } from '../../components/overlay';
import { useAsync } from '../../lib/hooks';
import { errorMessage } from '../../lib/api';
import {
  deleteWarmupMailbox,
  getWarmupMailbox,
  pauseWarmupMailbox,
  resumeWarmupMailbox,
  type WarmupMailbox,
} from '../../lib/warmupApi';
import { warmthColor, type ChartTheme } from './chartTheme';

/* ------------------------------------------------------------------ */
/* Pause / resume — shared by the row and the detail drawer footer     */
/* ------------------------------------------------------------------ */

/** Which onSettled call is in flight. */
export type SettlePhase = 'optimistic' | 'server' | 'revert';

/**
 * Optimistic pause/resume. The owner swaps the row immediately; on error
 * the pre-click row is restored and the FastAPI `detail` is toasted; on
 * success the server's MailboxOut replaces the optimistic copy. `phase`
 * lets the owner tell the server answer (no today counters — only the
 * LIST route computes them) from local copies that already carry them.
 */
export function PauseResumeButton({
  mailbox,
  onSettled,
  onCommitted,
  className = 'btn btn-ghost btn-sm',
}: {
  mailbox: WarmupMailbox;
  /** receives the optimistic copy at click, then the server row (or the revert) */
  onSettled: (updated: WarmupMailbox, phase: SettlePhase) => void;
  /** fires once the server has settled (success or error) — page-level refresh hook */
  onCommitted?: () => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const action = mailbox.is_paused ? 'Resume' : 'Pause';
    setBusy(true);
    onSettled({ ...mailbox, is_paused: !mailbox.is_paused }, 'optimistic');
    try {
      const updated = mailbox.is_paused
        ? await resumeWarmupMailbox(mailbox.id)
        : await pauseWarmupMailbox(mailbox.id);
      onSettled(updated, 'server');
      onCommitted?.();
      toast.success(
        `${mailbox.email_address}: warmup ${updated.is_paused ? 'paused' : 'resumed'}`,
      );
    } catch (e) {
      onSettled(mailbox, 'revert'); // back to the pre-click row
      onCommitted?.();
      toast.error(`${action} failed: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className={className} onClick={() => void toggle()} disabled={busy}>
      {mailbox.is_paused ? 'Resume' : 'Pause'}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detail drawer                                                       */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekdayLabel(mask: number): string {
  const days = WEEKDAYS.filter((_, i) => Boolean(mask & (1 << i)));
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'No days';
  return days.join(' · ');
}

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString([], { dateStyle: 'medium' });
}

function dnsTone(ok: boolean | null): 'success' | 'warn' | 'neutral' {
  if (ok === null) return 'neutral';
  return ok ? 'success' : 'warn';
}

function dnsText(ok: boolean | null): string {
  if (ok === null) return 'not checked';
  return ok ? 'valid' : 'invalid';
}

/**
 * Per-mailbox detail: ramp, today counters, schedule window, DNS flags,
 * paused state. Fetches GET /{id} ONCE per open — but only for the schedule
 * window (the list route omits it). Every other field, including today
 * counters (the detail route defaults them to 0) and the pause/live state,
 * is pinned from the owner's live row so optimistic flips and settles show
 * here immediately instead of being overwritten by the stale fetch.
 */
export function MailboxDetailDrawer({
  mailbox,
  theme,
  onClose,
  onSettled,
  onChanged,
}: {
  /** the live row from the owner's list state — optimistic flips show here too */
  mailbox: WarmupMailbox;
  theme: ChartTheme;
  onClose: () => void;
  onSettled: (updated: WarmupMailbox, phase: SettlePhase) => void;
  /** page-level refresh after a pause/resume/delete done from the drawer */
  onChanged: () => void;
}) {
  const detail = useAsync(() => getWarmupMailbox(mailbox.id), [mailbox.id]);
  const m: WarmupMailbox = {
    ...mailbox,
    // live row wins everywhere; the one-shot detail GET only supplies the
    // schedule window (+ its id) — its other fields are staler than the row
    ...(detail.data
      ? { schedule_window: detail.data.schedule_window, schedule_window_id: detail.data.schedule_window_id }
      : {}),
  };
  const color = warmthColor(m.warmth_score, theme);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteWarmupMailbox(m.id);
      toast.success(`${m.email_address} removed from warmup`);
      onChanged();
      onClose();
    } catch (e) {
      toast.error(`Remove failed: ${errorMessage(e)}`);
      setDeleting(false);
    }
  };

  return (
    <Drawer
      title={m.email_address}
      subtitle={
        <span className="warmup-drawer-sub">
          <Chip tone="neutral">{m.provider}</Chip>
          <Chip tone={m.is_paused ? 'warn' : m.warmup_status === 'active' ? 'success' : 'neutral'}>
            {m.is_paused ? 'Paused' : m.warmup_status}
          </Chip>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <PauseResumeButton mailbox={m} onSettled={onSettled} onCommitted={onChanged} />
          <ConfirmButton onConfirm={() => void remove()} disabled={deleting} confirmLabel="Click again to remove">
            {deleting ? 'Removing…' : 'Remove from warmup'}
          </ConfirmButton>
        </>
      }
    >
      <div className="lead-facts">
        <div className="lead-fact">
          <span className="field-label">Warmth score</span>
          <span className="warmup-drawer-warmth" style={{ color }}>{Math.round(m.warmth_score)} / 100</span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Connected</span>
          <span>{when(m.created_at)}</span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Daily target</span>
          <span>{m.daily_target} warmup mails / day</span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Ramp</span>
          <span>
            Day {m.current_day} · target today {m.ramp_target_today} ·{' '}
            {m.days_remaining_in_ramp > 0
              ? `${m.days_remaining_in_ramp} day${m.days_remaining_in_ramp === 1 ? '' : 's'} remaining`
              : 'ramp complete'}
          </span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Sent today</span>
          <span>{m.sent_today}</span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Opens / replies today</span>
          <span>{m.opens_today} / {m.replies_today}</span>
        </div>
        <div className="lead-fact">
          <span className="field-label">Schedule window</span>
          {detail.loading && !detail.data ? (
            <span className="dim">Loading…</span>
          ) : detail.error && !detail.data ? (
            <LoadError message={detail.error} onRetry={() => void detail.reload()} />
          ) : m.schedule_window ? (
            <span>
              {weekdayLabel(m.schedule_window.weekday_mask)},{' '}
              {hourLabel(m.schedule_window.start_hour)}–{hourLabel(m.schedule_window.end_hour)}{' '}
              ({m.schedule_window.tz})
            </span>
          ) : (
            <span className="dim">Default window — not customised</span>
          )}
        </div>
        <div className="lead-fact">
          <span className="field-label">Sending via</span>
          <span>{m.is_oauth ? 'Provider OAuth (Gmail / Outlook)' : 'SMTP credentials'}</span>
        </div>
      </div>

      <section className="drawer-section">
        <h3 className="section-title">Domain checks</h3>
        {m.is_oauth ? (
          <p className="dim">
            Connected via provider OAuth — mail sends through the provider's own
            infrastructure, so SPF / DKIM / DMARC checks don't apply.
          </p>
        ) : (
          <ul className="warmup-dns-list">
            <li>
              SPF <Chip tone={dnsTone(m.spf_valid)}>{dnsText(m.spf_valid)}</Chip>
            </li>
            <li>
              DKIM <Chip tone={dnsTone(m.dkim_valid)}>{dnsText(m.dkim_valid)}</Chip>
            </li>
            <li>
              DMARC <Chip tone={dnsTone(m.dmarc_valid)}>{dnsText(m.dmarc_valid)}</Chip>
            </li>
          </ul>
        )}
      </section>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Row actions — rendered inside each MailboxRows row                  */
/* ------------------------------------------------------------------ */

export function RowActions({
  mailbox,
  onDetails,
  onSettled,
  onCommitted,
}: {
  mailbox: WarmupMailbox;
  onDetails: () => void;
  onSettled: (updated: WarmupMailbox, phase: SettlePhase) => void;
  onCommitted?: () => void;
}) {
  return (
    <span className="warmup-row-actions">
      <PauseResumeButton mailbox={mailbox} onSettled={onSettled} onCommitted={onCommitted} />
      <button className="btn btn-ghost btn-sm" onClick={onDetails}>
        Details
      </button>
    </span>
  );
}
