/**
 * TS types matching backend `MailboxOut`. Derived from spec §5.1 item 2
 * and the in-flight API contract under /api/workspace/mailboxes.
 *
 * Keep in sync with `features/mailboxes/api.ts` and the backend schema —
 * any new fields must land here first.
 */

export type MailboxProvider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';

export type MailboxStatus = 'pending' | 'active' | 'paused' | 'completed';

export type ContentMode = 'A' | 'B' | 'C' | 'D';

/** Embedded send-time window. ``weekday_mask`` is a bitfield —
 *  bit 0 = Mon … bit 6 = Sun. Default 31 (0b0011111) means Mon-Fri.
 */
export interface ScheduleWindow {
  tz: string;
  weekday_mask: number;
  start_hour: number;
  end_hour: number;
}

export interface Mailbox {
  id: string;
  email_address: string;
  provider: MailboxProvider;
  warmup_status: MailboxStatus;
  daily_target: number;
  current_day: number;
  warmth_score: number;
  content_mode: ContentMode;
  is_paused: boolean;
  spf_valid: boolean | null;
  dkim_valid: boolean | null;
  dmarc_valid: boolean | null;
  schedule_window_id: string | null;
  schedule_window: ScheduleWindow | null;
  created_at: string;
  ramp_target_today: number;
  days_remaining_in_ramp: number;
  last_activity_at?: string | null;
  /** 7-day warmth sparkline, oldest → newest. Optional — backend may omit. */
  warmth_sparkline?: number[] | null;
  /** Today's sent count. Optional — backend may omit. */
  sent_today?: number | null;
  /** Today's peer-side opens received by this mailbox. Optional. */
  opens_today?: number | null;
  /** Today's peer-side replies received by this mailbox. Optional. */
  replies_today?: number | null;
}

export interface MailboxListFilters {
  status?: MailboxStatus | 'all';
  provider?: MailboxProvider | 'all';
  search?: string;
  page?: number;
  page_size?: number;
}

export interface MailboxListResponse {
  items: Mailbox[];
  page: number;
  page_size: number;
  total: number;
}

export interface UpdateMailboxPayload {
  daily_target?: number;
  content_mode?: ContentMode;
  is_paused?: boolean;
  schedule_window_id?: string | null;
}

export interface DnsCheckResult {
  spf_valid: boolean;
  dkim_valid: boolean;
  dmarc_valid: boolean;
  fixes?: Array<{ record: 'spf' | 'dkim' | 'dmarc'; instructions: string }>;
}

export interface TestConnectionResult {
  smtp_ok: boolean;
  imap_ok: boolean;
  error?: string | null;
}

export interface WarmupThread {
  id: string;
  peer_email: string;
  subject: string;
  last_action_at: string;
  messages_count: number;
  status?: string | null;
}

/** Warmth / placement gauge helpers. */
export function warmthTier(score: number): 'low' | 'mid' | 'high' {
  if (score < 40) return 'low';
  if (score < 70) return 'mid';
  return 'high';
}

export function warmthColorToken(score: number): 'accent' | 'accent4' | 'accent3' {
  const t = warmthTier(score);
  if (t === 'low') return 'accent3';
  if (t === 'mid') return 'accent4';
  return 'accent';
}
