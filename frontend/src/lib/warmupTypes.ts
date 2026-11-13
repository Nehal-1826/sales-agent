/**
 * Wire types for the WarmPulse FastAPI dashboard endpoints.
 *
 * Field names are snake_case on purpose — they mirror the FastAPI response
 * schemas 1:1 (backend/app/schemas/{activity,analytics,mailboxes}.py and the
 * dict shape in workspace_inbox.py). Do not rename to camelCase: the ported
 * dashboard components read these keys directly. Verified live against the
 * seeded dev backend (Stream B, Task 2).
 */

// --------------------------------------------------------------------------- //
// GET /api/workspace/warmup-activity/today-stats                              //
// (also embedded as `today` in the dashboard summary)                         //
// --------------------------------------------------------------------------- //

export interface WarmupTodayStats {
  sent: number;
  opens: number;
  replies: number;
  spam_rescues: number;
  stars: number;
  marked_important: number;
}

// --------------------------------------------------------------------------- //
// GET /api/workspace/analytics/dashboard/summary                              //
// --------------------------------------------------------------------------- //

/** One point of the 30-day warmth series (`warmth_30d`). `date` is YYYY-MM-DD. */
export interface WarmupWarmthPoint {
  date: string;
  score: number;
}

/** Inbox/promotions/spam split, percent 0-100 (`placement_split`). */
export interface WarmupPlacementSplit {
  inbox_pct: number;
  promotions_pct: number;
  spam_pct: number;
}

export interface WarmupDashboardSummary {
  mean_warmth_score: number;
  warmth_delta_24h: number;
  total_mailboxes: number;
  active_mailboxes: number;
  placement_split: WarmupPlacementSplit;
  today: WarmupTodayStats;
  warmth_30d: WarmupWarmthPoint[];
}

// --------------------------------------------------------------------------- //
// GET /api/workspace/mailboxes                                                //
// --------------------------------------------------------------------------- //

export type WarmupMailboxProvider = 'gmail' | 'outlook' | 'yahoo' | 'smtp';
export type WarmupMailboxStatus = 'pending' | 'active' | 'paused' | 'completed';
export type WarmupContentMode = 'A' | 'B' | 'C' | 'D';

/** Embedded send-time window. `weekday_mask` bit 0 = Mon … bit 6 = Sun. */
export interface WarmupScheduleWindow {
  tz: string;
  weekday_mask: number;
  start_hour: number;
  end_hour: number;
}

/** One mailbox row (`MailboxOut` — never carries credentials). */
export interface WarmupMailbox {
  id: string;
  email_address: string;
  provider: WarmupMailboxProvider;
  warmup_status: WarmupMailboxStatus;
  daily_target: number;
  current_day: number;
  warmth_score: number;
  content_mode: WarmupContentMode;
  is_paused: boolean;
  is_oauth: boolean;
  spf_valid: boolean | null;
  dkim_valid: boolean | null;
  dmarc_valid: boolean | null;
  schedule_window_id: string | null;
  schedule_window: WarmupScheduleWindow | null;
  created_at: string;
  ramp_target_today: number;
  days_remaining_in_ramp: number;
  sent_today: number;
  opens_today: number;
  replies_today: number;
}

export interface WarmupMailboxListResponse {
  items: WarmupMailbox[];
  page: number;
  page_size: number;
  total: number;
}

// --------------------------------------------------------------------------- //
// GET /api/workspace/notifications-inbox (alerts)                             //
// --------------------------------------------------------------------------- //

/**
 * One in-app notification. `kind` is a free string on the backend (max 64)
 * — seeded/known kinds include `warmth_drop`, `bounce_spike`, `dns_failure`.
 * `read_at`/`created_at` are ISO strings; `read_at` is null while unread.
 */
export interface WarmupAlert {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string | null;
}

export interface WarmupAlertsResponse {
  items: WarmupAlert[];
  unread: number;
}

// --------------------------------------------------------------------------- //
// GET /api/workspace/warmup-activity (feed)                                   //
// --------------------------------------------------------------------------- //

export type WarmupActivityAction =
  | 'sent'
  | 'opened'
  | 'replied'
  | 'starred'
  | 'spam_rescued'
  | 'marked_important';

export type WarmupActivityDirection = 'outbound' | 'inbound';

/** One warmup event (`ActivityItem`). `ts`/`created_at` are ISO strings. */
export interface WarmupActivityItem {
  id: string;
  mailbox_id: string;
  mailbox_email: string;
  peer_email: string;
  direction: WarmupActivityDirection;
  action: WarmupActivityAction;
  message_id: string | null;
  subject: string | null;
  ts: string;
  created_at: string;
  result: string;
}

export interface WarmupActivityFeedResponse {
  items: WarmupActivityItem[];
  next_cursor: number | null;
}
