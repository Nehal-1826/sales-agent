/**
 * Warmup activity feed types — mirrors `/api/workspace/warmup-activity`.
 * See spec §5.1 item 3.
 */

// Mirrors backend WarmupAction enum (backend/app/db/models/warmup_logs.py).
// `delivered` and `bounce` are reserved for future engagement signals once
// the IMAP loop wires them up; the backend enum doesn't accept them today.
export type ActivityAction =
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescued'
  | 'marked_important';

export type ActivityResult = 'ok' | 'error';

export interface ActivityItem {
  id: string;
  ts: string;
  mailbox_id: string;
  mailbox_email: string;
  peer_email: string;
  action: ActivityAction;
  result: ActivityResult;
  subject?: string | null;
  thread_id?: string | null;
  error?: string | null;
}

export interface ActivityFeedResponse {
  items: ActivityItem[];
  next_cursor?: number | null;
}

export interface ActivityFilterState {
  mailbox_id?: string;
  action?: ActivityAction | 'all';
  search?: string;
}

export interface ActivityTodayStats {
  sent: number;
  opens: number;
  replies: number;
  spam_rescues: number;
}

export interface ActivityHourBucket {
  /** Hours-ago bucket, 0 = current hour, 23 = 23h ago. */
  hour: number;
  label: string;
  sent: number;
  opened: number;
  replied: number;
  starred: number;
  spam_rescued: number;
  marked_important: number;
}

export interface ThreadSummary {
  id: string;
  peer_email: string;
  mailbox_email: string;
  subject: string;
  messages_count: number;
  last_action_at: string;
}
