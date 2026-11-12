/**
 * Admin area TypeScript types. Mirrors backend admin schemas (spec §5.2).
 * Keep shapes permissive — every field the UI actually reads, plus index
 * signatures where the backend may append fields.
 */

// ---------------------------------------------------------------------------
// Platform analytics
// ---------------------------------------------------------------------------

export interface PlatformOverview {
  total_users: number;
  active_mailboxes: number;
  total_mailboxes: number;
  mrr_usd: number;
  queue_depth: number;
  sends_today: number;
  peer_pool_health_pct: number;
  [extra: string]: unknown;
}

export interface WarmthBin {
  bin: string;
  count: number;
  x0?: number;
  x1?: number;
}

export interface VolumePoint {
  date: string;
  [series: string]: string | number;
}

export interface PlanDistributionRow {
  plan: string;
  count: number;
  mrr?: number;
}

export interface SignupRatePoint {
  date: string;
  signups: number;
  cumulative?: number;
}

export interface TopClient {
  user_id: string;
  email: string;
  workspace_name: string | null;
  plan: string;
  mailbox_count: number;
  send_volume: number;
  avg_warmth: number;
}

// ---------------------------------------------------------------------------
// Peer inboxes
// ---------------------------------------------------------------------------

export type PeerProvider = 'google' | 'google_workspace' | 'outlook' | 'yahoo' | 'office365' | 'imap';

export interface PeerInboxOut {
  id: string;
  email: string;
  provider: PeerProvider | string;
  is_active: boolean;
  daily_capacity: number;
  reputation_score: number;
  sends_today?: number;
  last_used_at?: string | null;
  pool_ids?: string[];
  pool_memberships?: Array<{ pool_id: string; pool_name: string }>;
  created_at?: string;
}

export interface PeerInboxStats {
  total: number;
  active: number;
  by_provider: Array<{ provider: string; count: number; active: number }>;
  avg_reputation: number;
  total_capacity: number;
  used_capacity_today: number;
}

export interface PoolOut {
  id: string;
  name: string;
  description?: string | null;
  member_count: number;
  client_count?: number;
  is_default?: boolean;
  created_at?: string;
  daily_send_limit?: number | null;
}

export interface PoolAssignmentOut {
  id?: string;
  workspace_id?: string;
  // User PK — distinct from workspace_id, used for /admin/users/:id calls.
  user_id?: string;
  user_email?: string;
  client_email?: string;
  client_plan?: string;
  pool_id: string;
  pool_name: string;
  assigned_at?: string;
  sends_last_30d?: number;
}

/**
 * Per-mailbox routing row from GET /admin/pool-routing/mailboxes.
 * `pool_id` = the mailbox's own pin (null = inherit workspace).
 * `effective_pool_id` = pin > workspace > default — where it actually routes.
 */
export interface RoutingMailbox {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'yahoo' | 'smtp';
  workspace_id: string;
  plan_name: string | null;
  pool_id: string | null;
  effective_pool_id: string | null;
  sends_last_30d: number;
  can_send: boolean;
  is_oauth: boolean;
}

export interface UnassignedClient {
  workspace_id?: string;
  // User PK — distinct from workspace_id, used for /admin/users/:id calls.
  user_id?: string;
  email: string;
  plan: string | null;
  mailbox_count?: number;
}

export interface SankeyData {
  nodes: Array<{ id: string; name: string; color?: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

// ---------------------------------------------------------------------------
// LLM usage
// ---------------------------------------------------------------------------

export interface LlmUsageRow {
  user_id: string;
  user_email: string;
  workspace_name?: string | null;
  plan: string;
  tokens_today: number;
  tokens_mtd: number;
  cost_today_usd: number;
  cost_mtd_usd: number;
  cap_tokens?: number | null;
  pct_of_cap?: number | null;
}

export interface LlmUsageSummary {
  // Matches backend app/schemas/llm_usage.py::LlmUsageSummary (costs are in cents).
  total_tokens_mtd: number;
  total_cost_cents_mtd: number;
  forecast_eom_cents: number;
  by_user: Array<{
    user_id: string;
    email: string;
    plan: string | null;
    tokens_mtd: number;
    cost_cents_mtd: number;
    cap: number;
    pct_used: number;
  }>;
  by_mode: { A: number; B: number; C: number; D: number };
  // Fields the page still references but the backend summary does not (yet) provide.
  total_cost_today_usd?: number;
  spend_series?: Array<{ date: string; cost_usd: number }>;
  caps_by_plan?: Array<{ plan_id: string; plan: string; cap_tokens: number }>;
}

// ---------------------------------------------------------------------------
// Plans & Payments
// ---------------------------------------------------------------------------

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  price_monthly_usd: number;
  mailboxes_included: number;
  max_mailboxes: number;
  /** Per-mailbox daily warmup-send cap. Backend field: daily_email_cap.
   *  Drives the onboarding volume picker — admin edits here propagate
   *  to /onboarding (volume options ≤ cap) and to the warmup engine's
   *  daily ramp ceiling. */
  daily_email_cap?: number;
  features: string[];
  is_active: boolean;
  /** Public visibility. When false the plan is hidden from the public pricing
   *  page / sign-up / onboarding picker and new purchases are blocked, but the
   *  tier stays live for existing subscribers and admins. */
  is_public: boolean;
  llm_token_cap?: number;
  /** Display order on the public pricing page / onboarding (lower = first). */
  sort_order: number;
}

export type PaymentStatus = 'succeeded' | 'pending' | 'failed' | 'refunded';

export const PAYMENT_STATUSES: PaymentStatus[] = ['succeeded', 'pending', 'failed', 'refunded'];

export interface AdminPayment {
  id: string;
  user_id: string;
  user_email: string;
  /** Display plan label. Normalized from the wire `plan_name` in the hook. */
  plan: string;
  /** Display amount in rupees. Normalized from the wire `amount_cents` in the hook. */
  amount_usd: number;
  status: PaymentStatus;
  created_at: string;
  external_ref?: string | null;
  workspace_name?: string | null;
  // --- raw wire fields (PaymentOut) — present on the server response, used to
  //     normalize `plan` / `amount_usd` above. Optional so detail-mapped rows
  //     (which already supply plan/amount_usd) still satisfy the type. ---
  amount_cents?: number;
  plan_name?: string | null;
  plan_id?: string | null;
  payment_method?: string | null;
  dummy_card_last4?: string | null;
  dummy_upi_vpa?: string | null;
}

/** PATCH /admin/payments/:id body — at least one field required. */
export interface PaymentUpdate {
  status?: PaymentStatus;
  amount_cents?: number;
}

export interface PaymentsListResponse {
  items: AdminPayment[];
  total: number;
  page: number;
  page_size: number;
  revenue_series?: Array<{ date: string; revenue_usd: number }>;
  by_plan_series?: Array<{ month: string; [plan: string]: string | number }>;
}

// ---------------------------------------------------------------------------
// Users (endpoint 501)
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  /** Platform role from /admin/users; super_admins cannot be impersonated. */
  role?: string;
  /** Null for users who haven't selected a plan yet (backend outer-joins Plan). */
  plan: string | null;
  status: 'active' | 'suspended' | 'pending';
  mailbox_count: number;
  joined_at: string;
  last_seen_at?: string | null;
  warmth_sparkline?: number[];
  /** Admin-guarded avatar fetch route, or null when the user has none. */
  avatar_url?: string | null;
  is_sabotaged?: boolean;
}

export interface UsersListResponse {
  items: AdminUserRow[];
  total: number;
  page: number;
  page_size: number;
}

/** POST /admin/users/bulk-pause-mailboxes body — empty user_ids = ALL client users. */
export interface BulkPauseMailboxesRequest {
  user_ids: string[];
  action: 'pause' | 'resume';
}

/** POST /admin/users/bulk-pause-mailboxes response counts. */
export interface BulkPauseMailboxesResponse {
  users_affected: number;
  mailboxes_updated: number;
  skipped_super_admin: number;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor_email: string;
  actor_role: 'super_admin' | 'client' | 'system';
  action: string;
  target_type: string;
  target_id: string | null;
  ip: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  by_type?: Array<{ action: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Admin CRM (cross-workspace)
// ---------------------------------------------------------------------------

export interface AdminCrmCampaignRow {
  id: string;
  name: string;
  leads: number;
  status: string;
}

export interface AdminCrmSequenceRow {
  id: string;
  name: string;
  status: string;   // "active" | "paused" | "archived"
  paused: boolean;
  enrolled: number; // active enrollments
  open_rate: number;
  reply_rate: number;
}

export interface AdminCrmRecentActivity {
  kind: string;
  lead_label: string;
  at: string; // ISO datetime string
}

export interface AdminCrmWorkspaceRow {
  workspace_id: string;
  name: string;
  plan: string | null;
  owner_email: string;
  campaigns: number;
  leads: number;
  sequences_active: number;
  sequences_paused: number;
  active_enrollments: number;
  open_rate: number;   // fraction 0–1 or pct 0–100 — normalised in hook
  reply_rate: number;  // same
  last_activity_at: string | null;
}

export interface AdminCrmOverview {
  total_campaigns: number;
  total_leads: number;
  sequences_active: number;
  sequences_paused: number;
  active_enrollments: number;
  emails_sent_30d: number;
  open_rate: number;
  reply_rate: number;
  workspaces: AdminCrmWorkspaceRow[];
}

export interface AdminCrmWorkspaceDetail extends AdminCrmWorkspaceRow {
  campaign_list: AdminCrmCampaignRow[];
  sequence_list: AdminCrmSequenceRow[];
  recent_activities: AdminCrmRecentActivity[];
}

export interface SequenceStatusOut {
  id: string;
  name: string;
  status: string;
  paused: boolean;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface PaymentsFilters {
  status?: PaymentStatus | 'all';
  plan?: string;
  user_email?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface PeerInboxFilters {
  provider?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}

export interface AuditFilters {
  actor_email?: string;
  action?: string;
  target_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

// ---------------------------------------------------------------------------
// Admin Reports
// ---------------------------------------------------------------------------

export interface ReportTypeItem {
  key: string;
  label: string;
  description: string;
  available_columns: string[];
  default_columns: string[];
  has_money_metric: boolean;
}

export type GroupBy = 'none' | 'plan' | 'month' | 'region';
export type ExportFormat = 'csv' | 'pdf' | 'xlsx';
export type ReportCadence = 'daily' | 'weekly' | 'monthly';

export interface GenerateRequest {
  type: string;
  preset?: string | null;
  from_?: string | null;   // ISO date string
  to_?: string | null;     // ISO date string
  plan_filter?: string[];
  region_filter?: string[];
  status_filter?: string[];
  group_by?: GroupBy;
  columns?: string[];
  compare_previous?: boolean;
}

export interface SummaryItem {
  label: string;
  value: string;
  delta_pct?: number | null;
}

export interface GenerateResult {
  columns: string[];
  rows: Record<string, unknown>[];
  summary: SummaryItem[];
  estimated_rows: number;
}

export interface ExportRequest {
  type: string;
  preset?: string | null;
  from_?: string | null;
  to_?: string | null;
  plan_filter?: string[];
  region_filter?: string[];
  status_filter?: string[];
  group_by?: GroupBy;
  columns?: string[];
  format?: ExportFormat;
}

export interface ReportScheduleCreate {
  name: string;
  report_type: string;
  cadence: ReportCadence;
  recipients: string[];
  format?: ExportFormat;
  filters?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ReportScheduleUpdate {
  name?: string;
  cadence?: ReportCadence;
  recipients?: string[];
  format?: ExportFormat;
  filters?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ReportScheduleOut {
  id: string;
  name: string;
  report_type: string;
  cadence: ReportCadence;
  recipients: string[];
  format: ExportFormat;
  filters: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Admin add-on catalogue row (GET/POST/PATCH /admin/addons). */
export interface AddonRow {
  id: string;
  key: string;
  name: string;
  description: string;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
}
