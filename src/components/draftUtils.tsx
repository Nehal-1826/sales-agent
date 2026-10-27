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
    default:
      return <Chip tone="accent">Waiting for you</Chip>;
  }
}
