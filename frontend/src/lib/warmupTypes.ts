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
// GET /api/workspace/analytics/daily-metrics?from&to&granularity&mailbox_id    //
// (backend/app/schemas/analytics.py::DailyMetricRow — per-date aggregates;    //
//  counts SUM across mailboxes, pct/score columns are the mean)               //
// --------------------------------------------------------------------------- //

/** One day (or ISO week when granularity=week) of warmup volume/engagement. */
export interface WarmupDailyMetricRow {
  date: string;
  emails_sent: number;
  emails_received: number;
  opens: number;
  replies: number;
  spam_rescues: number;
  bounce_count: number;
  inbox_placement_pct: number;
  warmth_score: number;
}

// --------------------------------------------------------------------------- //
// GET /api/workspace/analytics/placement-trend?from&to                        //
// --------------------------------------------------------------------------- //

/** One day of the inbox/promotions/spam split, percent 0-100. */
export interface WarmupPlacementTrendPoint {
  date: string;
  inbox_pct: number;
  promotions_pct: number;
  spam_pct: number;
}

/** Inclusive date range for the analytics endpoints (`from`/`to`, YYYY-MM-DD). */
export interface WarmupAnalyticsRange {
  from: string;
  to: string;
}

/** One per-mailbox rollup for the Reports tab / PDF (client-side aggregation). */
export interface WarmupMailboxReportRow {
  mailbox_id: string;
  email_address: string;
  /** current warmth from the mailbox row (not the range mean) */
  warmth_score: number;
  sent: number;
  opens: number;
  replies: number;
  /** mean daily inbox placement over the range, percent 0-100 (null = no rows) */
  inbox_pct: number | null;
}

// --------------------------------------------------------------------------- //
// GET /api/workspace/mailboxes                                                //
// --------------------------------------------------------------------------- //

export type WarmupMailboxProvider = 'gmail' | 'outlook' | 'yahoo' | 'smtp' | 'self_hosted';
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
// POST /api/workspace/mailboxes (create — discriminated union on `provider`)  //
// PATCH /api/workspace/mailboxes/{id} (update — whitelisted optional fields)  //
// (backend/app/schemas/mailboxes.py — MailboxCreateSmtp | MailboxCreateOauth, //
//  MailboxUpdate)                                                             //
// --------------------------------------------------------------------------- //

/** SMTP+IMAP credential variant (provider smtp | yahoo | zoho | self_hosted). */
export interface WarmupMailboxCreateSmtp {
  email_address: string;
  provider: 'smtp' | 'yahoo' | 'zoho' | 'self_hosted';
  smtp_host: string;
  smtp_port?: number;
  smtp_username: string;
  smtp_password: string;
  imap_host?: string;
  imap_port?: number;
  daily_target?: number;
  content_mode?: WarmupContentMode;
}

/** OAuth variant (provider gmail | outlook). */
export interface WarmupMailboxCreateOauth {
  email_address: string;
  provider: 'gmail' | 'outlook';
  oauth_refresh_token: string;
  daily_target?: number;
  content_mode?: WarmupContentMode;
}

export type WarmupMailboxCreate = WarmupMailboxCreateSmtp | WarmupMailboxCreateOauth;

/** PATCH body — exactly the four mutable fields the route accepts. */
export interface WarmupMailboxUpdate {
  daily_target?: number;
  content_mode?: WarmupContentMode;
  schedule_window_id?: string;
  is_paused?: boolean;
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

// --------------------------------------------------------------------------- //
// POST /api/workspace/dns/check (free-form domain/email)                      //
// POST /api/workspace/mailboxes/{id}/dns-check (persists on the mailbox row)  //
// (backend/app/schemas/dns.py + app/api/routes/dns.py — same DnsCheckResponse //
//  for both routes, so one component renders either flow)                    //
// --------------------------------------------------------------------------- //

export type WarmupDmarcPolicy = 'none' | 'quarantine' | 'reject';

/** SPF leg of the check — `record` is the live TXT value, null when absent. */
export interface WarmupSpfResult {
  valid: boolean;
  record: string | null;
  errors: string[];
  warnings: string[];
}

/** DKIM leg — `selector` is the probed selector that answered (best-effort:
 *  the backend falls back through common Google/M365/Mailchimp selectors). */
export interface WarmupDkimResult {
  valid: boolean;
  selector: string;
  record: string | null;
  errors: string[];
}

/** DMARC leg — valid only for p=quarantine/reject; p=none is monitoring-only. */
export interface WarmupDmarcResult {
  valid: boolean;
  record: string | null;
  policy: WarmupDmarcPolicy | null;
  errors: string[];
  warnings: string[];
}

export interface WarmupDnsSummary {
  passing: number;
  total: number;
  overall_pass: boolean;
}

/** "Records to publish" guidance strings — backend sends them only for failed legs. */
export interface WarmupDnsFixes {
  spf: string[];
  dkim: string[];
  dmarc: string[];
}

/** Request body — `email` wins over `domain` when both are given (backend rule). */
export interface WarmupDnsCheckRequest {
  domain?: string;
  email?: string;
  dkim_selector?: string;
}

export interface WarmupDnsCheckResponse {
  domain: string;
  spf: WarmupSpfResult;
  dkim: WarmupDkimResult;
  dmarc: WarmupDmarcResult;
  summary: WarmupDnsSummary;
  checked_at: string;
  fixes: WarmupDnsFixes;
}
