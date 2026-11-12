/** Wire types for the admin Revenge Activity dashboard (/admin/revenge). */

export type RevengeTrigger = 'auto_cancel_2h' | 'manual_admin';
export type RevengeStatus = 'pending' | 'completed' | 'failed' | 'no_candidates';

export interface RevengeEvent {
  id: string;
  user_id: string | null;
  user_email: string;
  workspace_id: string | null;
  trigger: RevengeTrigger;
  actor_user_id: string | null;
  status: RevengeStatus;
  candidates_count: number;
  moved_count: number;
  failed_count: number;
  detail: Record<string, unknown> | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface RevengeEventsResponse {
  items: RevengeEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface RevengeKpis {
  sabotaged_users: number;
  total_runs: number;
  total_moved: number;
  last_run_at: string | null;
}

export interface RevengeRecipient {
  email: string;
  /** Present for runs that captured per-peer results. */
  moved?: number;
  failed?: number;
  /** Present for reconstructed (historical) runs. */
  sent?: number;
}

export interface RevengeRecipientsResponse {
  /** 'run' = captured live; 'reconstructed' = derived from warmup history. */
  source: 'run' | 'reconstructed';
  recipients: RevengeRecipient[];
}

export interface SabotagedUser {
  id: string;
  email: string;
  display_name: string | null;
  workspace_id: string | null;
}
