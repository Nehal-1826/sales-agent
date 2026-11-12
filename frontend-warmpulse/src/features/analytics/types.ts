/**
 * TypeScript shapes for the analytics feature. These mirror the
 * `/api/workspace/analytics/*` backend contract (spec §5.1 item 4).
 *
 * Every shape is defensive: the backend is still evolving, so all hooks
 * must fall back to the neutral empty value defined here.
 */

export type Granularity = 'day' | 'week';

export interface AnalyticsDateRange {
  /** ISO date yyyy-mm-dd or undefined to let the backend default. */
  from?: string;
  to?: string;
}

export interface AnalyticsCommonParams extends AnalyticsDateRange {
  mailbox_id?: string;
  granularity?: Granularity;
}

export interface DashboardSummary {
  warmth_score: number;
  warmth_score_yesterday: number;
  warmth_delta: number;
  sent_today: number;
  opens_today: number;
  replies_today: number;
  spam_rescues_today: number;
  placement: { inbox_pct: number; promotions_pct: number; spam_pct: number };
  mailbox_count: number;
  /**
   * Optional 30-day warmth history (oldest → newest). Backend may return
   * this in the `warmth_30d` field; the analytics hook normalises that into
   * this canonical shape so consumers don't have to care about wire names.
   */
  trend_30d?: Array<{ date: string; warmth_score: number }>;
}

export interface DailyMetricRow {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  replied: number;
  starred: number;
  spam_rescued: number;
  warmth_score: number;
}

export interface PlacementTrendPoint {
  date: string;
  inbox_pct: number;
  promotions_pct: number;
  spam_pct: number;
}

export interface EngagementPoint {
  /** ISO week-start date (or day-bucket if granularity=day). */
  bucket: string;
  open_rate: number;
  reply_rate: number;
  star_rate: number;
  rescue_rate: number;
}

export interface WarmthHeatmapCell {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** 0..23 */
  hour: number;
  /** 0..100 warmth score for that bucket. */
  value: number;
}

export interface WarmthHeatmap {
  cells: WarmthHeatmapCell[];
}

export interface BounceSpamPoint {
  mailbox_id: string;
  mailbox_email: string;
  date: string;
  bounce_rate: number;
  spam_rate: number;
  sends: number;
}

export interface ProviderSlice {
  provider: string;
  mailbox_count: number;
  sent: number;
}

export interface HealthRadarPoint {
  axis: string;
  /** Score 0..100 (bounce/spam axes are pre-inverted by backend or hook). */
  value: number;
}

export interface VolumeComboPoint {
  date: string;
  sent: number;
  opened: number;
  replied: number;
}
