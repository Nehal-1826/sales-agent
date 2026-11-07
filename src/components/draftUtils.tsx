import type { EmailDraft } from '../lib/types';
import { Chip } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string | undefined | null): boolean {
  return EMAIL_RE.test((value ?? '').trim());
}

/** Unsent = still needs the user (waiting for approval, or failed to send). */
export function isUnsent(d: EmailDraft): boolean {
  return d.status === 'Draft' || d.status === 'Failed';
}

/** "~14:32", or "~Thu 09:04" when not today — local time of a queued send. */
export function sendTimeLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date().toDateString() === d.toDateString();
  return today ? `~${hm}` : `~${d.toLocaleDateString([], { weekday: 'short' })} ${hm}`;
}

/** What to tell the user after approve: queued (normal), sent, or not
 *  delivered.  `emailConnected` false = console mode, nothing is delivered. */
export function approveOutcome(d: EmailDraft, emailConnected: boolean): { tone: 'success' | 'warn' | 'error'; text: string } {
  if (d.status === 'Sent') {
    return d.sentVia === 'console'
      ? { tone: 'warn', text: `${d.company}: approved, but not delivered (email isn't connected).` }
      : { tone: 'success', text: `Sent to ${d.company}.` };
  }
  if (d.status === 'Queued') {
    if (!emailConnected) {
      return { tone: 'warn', text: `${d.company}: approved, but email isn't connected — it will be logged, not delivered.` };
    }
    const at = sendTimeLabel(d.scheduledFor);
    return { tone: 'success', text: `Queued — ${d.company} sends at ${at || 'the next free slot'}.` };
  }
  return { tone: 'error', text: `${d.company}: ${d.error || 'could not be sent.'}` };
}

/** Status in plain words — a console "send" is NOT a delivered email. */
export function DraftStatusChip({ draft }: { draft: EmailDraft }) {
  switch (draft.status) {
    case 'Sent':
      return draft.sentVia === 'console' ? (
        <Chip tone="warn">Not delivered</Chip>
      ) : (
        <Chip tone="success">Sent</Chip>
      );
    case 'Failed':
      return <Chip tone="warn">Couldn't send</Chip>;
    case 'Rejected':
      return <Chip tone="neutral">Rejected</Chip>;
    case 'Approved':
      return <Chip tone="accent">Sending…</Chip>;
    case 'Queued': {
      const at = sendTimeLabel(draft.scheduledFor);
      return <Chip tone="accent">{at ? `Queued — sends at ${at}` : 'Queued'}</Chip>;
    }
    default:
      return <Chip tone="accent">Waiting for you</Chip>;
  }
}
