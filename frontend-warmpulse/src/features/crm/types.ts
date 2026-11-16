/**
 * CRM feature types — mirror the live `/api/crm/*` contract exactly.
 *
 * Field names match the backend wire shape 1:1 (snake_case). Do not rename;
 * the hooks in `api.ts` pass these straight through to / from axios.
 */

import { formatMoney } from '@/lib/format';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type CrmStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'interested'
  | 'won'
  | 'lost';

export type CrmCampaignStatus = 'active' | 'paused' | 'archived';

export type CrmActivityKind =
  | 'created'
  | 'note'
  | 'stage_change'
  | 'email_sent'
  | 'email_opened'
  | 'email_replied';

export type CrmSequenceStatus = 'active' | 'paused' | 'archived';

export type CrmEnrollmentStatus = 'active' | 'completed' | 'stopped';

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface CrmCampaign {
  id: string;
  name: string;
  description: string;
  status: CrmCampaignStatus;
  lead_count: number;
  won_value_cents: number;
  /** Per-stage lead counts (all six stages, 0-filled). Powers the tile stage bar. */
  stage_counts?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface CrmLead {
  id: string;
  campaign_id: string;
  name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  stage: CrmStage;
  value_cents: number;
  owner_email: string;
  source: string;
  tags: string[];
  notes: string;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmActivity {
  id: string;
  lead_id: string;
  kind: CrmActivityKind;
  body: string;
  actor_email: string;
  created_at: string;
}

/**
 * A workspace-wide activity feed row — a lead activity joined to its lead's
 * name. Powers the CRM landing's "Recent activity" tile.
 */
export interface CrmRecentActivity {
  id: string;
  lead_id: string;
  lead_name: string;
  kind: CrmActivityKind;
  body: string;
  actor_email: string;
  created_at: string;
}

/**
 * An email automation sequence attached to a campaign. `step_count` and
 * `active_enrollments` are server-computed roll-ups surfaced on the list.
 */
export interface CrmSequence {
  id: string;
  campaign_id: string;
  name: string;
  status: CrmSequenceStatus;
  step_count: number;
  active_enrollments: number;
  /** Mailbox this sequence sends from; null = automatic (oldest active
   * SMTP-capable mailbox in the workspace). */
  sending_mailbox_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** One email in a sequence. `delay_days` is the wait *before* this step fires. */
/** How a step's body is sent: plain text, a designer HTML body, or AI-written
 *  fresh for each lead at send time. */
export type CrmStepContentMode = 'text' | 'html' | 'ai';

export interface CrmSequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  subject: string;
  body: string;
  content_mode: CrmStepContentMode;
  ai_prompt: string | null;
}

/** A lead enrolled in a sequence, with its live progress + next-send time. */
export interface CrmSequenceEnrollment {
  id: string;
  sequence_id: string;
  lead_id: string;
  lead_name: string;
  lead_email: string;
  current_step: number;
  status: CrmEnrollmentStatus;
  next_send_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
}

export interface CrmLimits {
  tier: string;
  /** null = unlimited */
  cap: number | null;
  used: number;
}

export interface CrmSummary {
  campaigns: number;
  leads: number;
  won_value_cents: number;
  by_stage: Record<string, number>;
}

/** An assignable lead owner — a workspace user or invited team member. */
export interface CrmMember {
  email: string;
  name: string | null;
}

export interface CrmOwnerStat {
  owner_email: string | null;
  leads: number;
  won: number;
  value_cents: number;
}

/** Per-campaign analytics rollup. Rates are whole-number percentages (0–100). */
export interface CrmCampaignAnalytics {
  campaign_id: string;
  total_leads: number;
  by_stage: Record<string, number>;
  won_count: number;
  won_value_cents: number;
  pipeline_value_cents: number;
  conversion_rate: number;
  emails_sent: number;
  emails_opened: number;
  emails_replied: number;
  open_rate: number;
  reply_rate: number;
  by_owner: CrmOwnerStat[];
}

// ---------------------------------------------------------------------------
// Create / update payloads
// ---------------------------------------------------------------------------

export interface CreateCampaignPayload {
  name: string;
  description?: string;
}

export interface UpdateCampaignPayload {
  name?: string;
  description?: string;
  status?: CrmCampaignStatus;
}

export interface CreateLeadPayload {
  campaign_id: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  phone?: string;
  stage?: CrmStage;
  value_cents?: number;
  owner_email?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateLeadPayload {
  name?: string;
  email?: string;
  company?: string;
  title?: string;
  phone?: string;
  stage?: CrmStage;
  value_cents?: number;
  owner_email?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export interface ImportLeadsPayload {
  campaign_id: string;
  csv: string;
  /** "csv" (generic header) or "linkedin" (LinkedIn connections export). */
  source?: 'csv' | 'linkedin';
}

export interface ImportLeadsResult {
  imported: number;
  skipped: number;
}

export interface CreateActivityPayload {
  kind?: CrmActivityKind;
  body: string;
}

// ---------------------------------------------------------------------------
// Sequence create / update payloads
// ---------------------------------------------------------------------------

export interface CreateSequencePayload {
  campaign_id: string;
  name: string;
  sending_mailbox_id?: string | null;
}

export interface UpdateSequencePayload {
  name?: string;
  status?: CrmSequenceStatus;
  /** Explicit null clears the pin (back to automatic); omit to leave it. */
  sending_mailbox_id?: string | null;
}

export interface CreateStepPayload {
  delay_days: number;
  subject: string;
  body: string;
  content_mode?: CrmStepContentMode;
  ai_prompt?: string | null;
  step_order?: number;
}

export interface UpdateStepPayload {
  delay_days?: number;
  subject?: string;
  body?: string;
  content_mode?: CrmStepContentMode;
  ai_prompt?: string | null;
  step_order?: number;
}

export interface AiDraftResponse {
  subject: string;
  body: string;
  /** False when no LLM provider is configured server-side. */
  generated: boolean;
}

export interface EnrollLeadsPayload {
  lead_ids: string[];
}

export interface EnrollResult {
  enrolled: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Email templates (sequence-step library)
// ---------------------------------------------------------------------------

/** A pickable email template. `is_builtin` templates are read-only (no
 *  edit/delete); custom ones carry a UUID `id`, built-ins use `builtin:<slug>`. */
export interface CrmTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  is_builtin: boolean;
  created_at: string | null;
  has_logo?: boolean;
  logo_url?: string | null;
}

export interface CreateTemplatePayload {
  name: string;
  subject: string;
  body: string;
  category?: string | null;
}

export interface UpdateTemplatePayload {
  name?: string;
  subject?: string;
  body?: string;
  category?: string | null;
}

/** The variables a template body/subject may reference; rendered per-lead at
 *  send time. Used to render the "available variables" hint in the editor. */
export const CRM_TEMPLATE_VARIABLES = [
  '{{first_name}}',
  '{{name}}',
  '{{company}}',
  '{{title}}',
  '{{sender_name}}',
  // Renders the template's uploaded logo as an <img>; resolves to nothing when
  // the template has no logo, so it is always safe to leave in a body.
  '{{logo}}',
] as const;

// ---------------------------------------------------------------------------
// Stage presentation helpers — Shailog orange palette only.
// ---------------------------------------------------------------------------

export interface CrmStageMeta {
  key: CrmStage;
  label: string;
  /** Short semantic tone name used for grouping / chips. */
  tone: string;
}

/**
 * Ordered pipeline stages: new → contacted → replied → interested → won → lost.
 * The Kanban renders one column per entry in this order.
 */
export const CRM_STAGES: CrmStageMeta[] = [
  { key: 'new', label: 'New', tone: 'neutral' },
  { key: 'contacted', label: 'Contacted', tone: 'accent' },
  { key: 'replied', label: 'Replied', tone: 'accent' },
  { key: 'interested', label: 'Interested', tone: 'accent' },
  { key: 'won', label: 'Won', tone: 'success' },
  { key: 'lost', label: 'Lost', tone: 'danger' },
];

/**
 * Map a stage to a CSS color token. Pipeline stages walk the Shailog orange
 * family from faint → full accent as a lead progresses; won/lost use the
 * semantic success / danger tokens. Returns a `var(--wp-*)` string so callers
 * can drop it straight into `style={{ color }}` / `background`.
 */
export function crmStageColor(stage: CrmStage): string {
  switch (stage) {
    case 'new':
      return 'var(--wp-text-faint, #71717a)';
    case 'contacted':
      return 'color-mix(in srgb, var(--wp-accent, #F26522) 55%, var(--wp-text-faint, #71717a))';
    case 'replied':
      return 'var(--wp-accent-2, #FF8A4B)';
    case 'interested':
      return 'var(--wp-accent, #F26522)';
    case 'won':
      return 'var(--wp-success, #3ddc97)';
    case 'lost':
      return 'var(--wp-danger, #ff5c7a)';
    default:
      return 'var(--wp-accent, #F26522)';
  }
}

/**
 * Format an integer cent amount as a whole-dollar currency string, e.g.
 * 123400 → "$1,234". Deal values are tracked in whole dollars so we drop
 * the cents; a NaN / negative guard keeps the UI from rendering "$NaN".
 */
export function formatCents(cents: number | null | undefined): string {
  const n = Number(cents);
  const dollars = Number.isFinite(n) ? Math.round(n / 100) : 0;
  return formatMoney(dollars);
}
