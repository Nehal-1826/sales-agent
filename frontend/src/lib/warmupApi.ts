/**
 * WarmPulse FastAPI client — Bearer bridge JWT on /wp-api (gateway rewrites
 * to /api). The JWT is minted by the Django bridge POST /api/auth/warmup-token/
 * and cached in localStorage under its own 'warmpulse:' namespace.
 *
 * Dashboard methods return the wire shapes verbatim (see ./warmupTypes) —
 * no adapter layer between here and the ported components.
 */
import { post, request } from './api';
import type {
  WarmupActivityFeedResponse,
  WarmupAlertsResponse,
  WarmupAnalyticsRange,
  WarmupBounceSpamPoint,
  WarmupBlacklistResult,
  WarmupDailyMetricRow,
  WarmupDashboardSummary,
  WarmupDnsCheckRequest,
  WarmupDnsCheckResponse,
  WarmupMailbox,
  WarmupMailboxCreate,
  WarmupMailboxListResponse,
  WarmupMailboxReportRow,
  WarmupMailboxUpdate,
  WarmupPlacementSplit,
  WarmupPlacementTrendPoint,
  WarmupReputationOverview,
  WarmupTodayStats,
  WarmupWarmthPoint,
} from './warmupTypes';

export type {
  WarmupActivityAction,
  WarmupActivityDirection,
  WarmupActivityFeedResponse,
  WarmupActivityItem,
  WarmupAlert,
  WarmupAlertsResponse,
  WarmupAnalyticsRange,
  WarmupBounceSpamPoint,
  WarmupBlacklistProviderResult,
  WarmupBlacklistResult,
  WarmupContentMode,
  WarmupDailyMetricRow,
  WarmupDashboardSummary,
  WarmupDkimResult,
  WarmupDmarcPolicy,
  WarmupDmarcResult,
  WarmupDnsCheckRequest,
  WarmupDnsCheckResponse,
  WarmupDnsFixes,
  WarmupDnsSummary,
  WarmupDomainHealth,
  WarmupMailbox,
  WarmupMailboxCreate,
  WarmupMailboxCreateOauth,
  WarmupMailboxCreateSmtp,
  WarmupMailboxListResponse,
  WarmupMailboxProvider,
  WarmupMailboxReportRow,
  WarmupMailboxStatus,
  WarmupMailboxUpdate,
  WarmupPlacementSplit,
  WarmupPlacementTrendPoint,
  WarmupReputationOverview,
  WarmupScheduleWindow,
  WarmupSpfResult,
  WarmupTodayStats,
  WarmupWarmthPoint,
} from './warmupTypes';

const TOKEN_KEY = 'warmpulse:wp-token';
let inflight: Promise<{ token: string }> | null = null;

export async function getWarmupToken(): Promise<string> {
  const cached = localStorage.getItem(TOKEN_KEY);
  if (cached) return cached;
  if (!inflight) {
    // request() attaches the Django session token; a 401 here expires the
    // session via transport.ts, so the caller lands on the sign-in screen.
    inflight = request<{ token: string }>('/auth/warmup-token/', post())
      .finally(() => { inflight = null; });
  }
  const { token } = await inflight;
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

export function clearWarmupToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function wpFetch(path: string, init?: RequestInit, retry = true): Promise<Response> {
  const token = await getWarmupToken();
  const res = await fetch(`/wp-api/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) {
    clearWarmupToken();
    return wpFetch(path, init, false);
  }
  return res;
}

/** A failed warmup API call. `detail` carries FastAPI's error `detail` (or statusText). */
export class WarmupApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public path: string,
  ) {
    super(`warmup API ${path}: ${status} — ${detail}`);
    this.name = 'WarmupApiError';
  }
}

async function toWarmupError(res: Response, path: string): Promise<WarmupApiError> {
  let detail = res.statusText || 'request failed';
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') detail = body.detail;
    else if (body.detail !== undefined) detail = JSON.stringify(body.detail);
  } catch {
    // non-JSON body — keep statusText
  }
  return new WarmupApiError(res.status, detail, path);
}

/** GET on the warmup API — path WITHOUT the /wp-api prefix (e.g. 'api/mailboxes'). */
export async function warmupGet<T>(path: string): Promise<T> {
  const res = await wpFetch(path);
  if (!res.ok) throw await toWarmupError(res, path);
  return res.json() as Promise<T>;
}

/** Non-GET on the warmup API — same token/401-retry contract as warmupGet. */
async function warmupSend<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await wpFetch(path, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body) }),
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) throw await toWarmupError(res, path);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --------------------------------------------------------------------------- //
// Dashboard endpoints (wire shapes in ./warmupTypes)                          //
// --------------------------------------------------------------------------- //

/** Today's warmup counters workspace-wide (sent/opens/replies/rescues/stars/important). */
export function warmupTodayStats(): Promise<WarmupTodayStats> {
  return warmupGet<WarmupTodayStats>('api/workspace/warmup-activity/today-stats');
}

/** Full dashboard summary — hero score, delta, mailbox counts, placement, 30d series. */
export function warmupDashboardSummary(): Promise<WarmupDashboardSummary> {
  return warmupGet<WarmupDashboardSummary>('api/workspace/analytics/dashboard/summary');
}

/** 30-day workspace warmth series (`summary.warmth_30d`), oldest point first. */
export async function warmupWarmthSeries(): Promise<WarmupWarmthPoint[]> {
  const summary = await warmupDashboardSummary();
  return summary.warmth_30d;
}

/** Inbox / promotions / spam split (`summary.placement_split`), percent 0-100. */
export async function warmupPlacement(): Promise<WarmupPlacementSplit> {
  const summary = await warmupDashboardSummary();
  return summary.placement_split;
}

/**
 * Mailbox list with warmth/status/ramp state. Pulls up to 100 per page
 * (route max) so the dashboard rows don't truncate at the default 20.
 */
export function warmupMailboxStates(): Promise<WarmupMailboxListResponse> {
  return warmupGet<WarmupMailboxListResponse>(
    'api/workspace/mailboxes?page=1&page_size=100',
  );
}

// --------------------------------------------------------------------------- //
// Reports (analytics.py range routes + per-mailbox rollup)                    //
// --------------------------------------------------------------------------- //

/** `from`/`to` query string for the range-scoped analytics routes. */
function rangeParams(range: WarmupAnalyticsRange, extra?: Record<string, string>): string {
  const q = new URLSearchParams({ from: range.from, to: range.to });
  if (extra) for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/**
 * Daily (or weekly) volume/engagement rows for the range. Without `mailboxId`
 * the backend aggregates across every mailbox in the workspace.
 */
export function warmupDailyMetrics(
  range: WarmupAnalyticsRange,
  mailboxId?: string,
  granularity: 'day' | 'week' = 'day',
): Promise<WarmupDailyMetricRow[]> {
  const extra = mailboxId ? { mailbox_id: mailboxId } : undefined;
  return warmupGet<WarmupDailyMetricRow[]>(
    `api/workspace/analytics/daily-metrics?${rangeParams(range, { ...extra, granularity })}`,
  );
}

/** Inbox/promotions/spam split per day for the range. */
export function warmupPlacementTrend(range: WarmupAnalyticsRange): Promise<WarmupPlacementTrendPoint[]> {
  return warmupGet<WarmupPlacementTrendPoint[]>(
    `api/workspace/analytics/placement-trend?${rangeParams(range)}`,
  );
}

/**
 * Per-mailbox report rows for the Reports tab / PDF export: current warmth
 * from each mailbox row plus sent/opens/replies totals and mean inbox
 * placement aggregated client-side from that mailbox's daily-metrics rows.
 *
 * One request per mailbox (the backend has no per-mailbox rollup endpoint —
 * same approach the source frontend's reports adapter took). A mailbox whose
 * request fails simply gets no range numbers rather than sinking the table;
 * a total failure rejects so the caller can show its error state.
 */
export async function warmupPerMailboxReport(
  mailboxes: WarmupMailbox[],
  range: WarmupAnalyticsRange,
): Promise<WarmupMailboxReportRow[]> {
  const rows = await Promise.all(
    mailboxes.map(async (m) => {
      let daily: WarmupDailyMetricRow[] = [];
      try {
        daily = await warmupDailyMetrics(range, m.id);
      } catch {
        daily = []; // zero-fill the range columns; warmth still shows
      }
      const sent = daily.reduce((a, r) => a + r.emails_sent, 0);
      const opens = daily.reduce((a, r) => a + r.opens, 0);
      const replies = daily.reduce((a, r) => a + r.replies, 0);
      const inbox =
        daily.length > 0
          ? Math.round(daily.reduce((a, r) => a + r.inbox_placement_pct, 0) / daily.length)
          : null;
      return {
        mailbox_id: m.id,
        email_address: m.email_address,
        warmth_score: m.warmth_score,
        sent,
        opens,
        replies,
        inbox_pct: inbox,
      } satisfies WarmupMailboxReportRow;
    }),
  );
  return rows;
}

// --------------------------------------------------------------------------- //
// Reputation (workspace_reputation.py + analytics bounce-spam)                //
// --------------------------------------------------------------------------- //

/**
 * Per-domain rollup (auth flags, reputation score, cached blacklist hits)
 * plus the workspace-wide reputation and 30-day bounce rate.
 */
export function warmupReputationOverview(): Promise<WarmupReputationOverview> {
  return warmupGet<WarmupReputationOverview>('api/workspace/reputation/overview');
}

/**
 * Daily reputation score trend (mean warmth across mailboxes). The route
 * returns `{date, score}` rows — the same wire shape as the dashboard's
 * `warmth_30d`, so it reuses the WarmupWarmthPoint type and WarmthChart.
 */
export function warmupReputationTrend(days = 30): Promise<WarmupWarmthPoint[]> {
  return warmupGet<WarmupWarmthPoint[]>(`api/workspace/reputation/trend?days=${days}`);
}

/** Daily bounce + spam rates for the range (both percent, lower is better). */
export function warmupBounceSpam(range: WarmupAnalyticsRange): Promise<WarmupBounceSpamPoint[]> {
  return warmupGet<WarmupBounceSpamPoint[]>(
    `api/workspace/analytics/bounce-spam?${rangeParams(range)}`,
  );
}

/**
 * Live DNSBL check for one domain (Spamhaus ZEN/DBL, Barracuda, SpamCop, …).
 * Also refreshes the blacklist cache the reputation overview reads from —
 * call it, then `warmupReputationOverview().reload()` to see updated hits.
 */
export function warmupBlacklistCheck(domain: string): Promise<WarmupBlacklistResult> {
  const q = new URLSearchParams({ domain });
  return warmupGet<WarmupBlacklistResult>(`api/workspace/reputation/blacklist?${q.toString()}`);
}

// --------------------------------------------------------------------------- //
// Mailbox management (mailboxes.py write routes; the mobile app uses these)   //
// --------------------------------------------------------------------------- //

/** Full MailboxOut incl. the schedule window (the list view omits it). */
export function getWarmupMailbox(id: string): Promise<WarmupMailbox> {
  return warmupGet<WarmupMailbox>(`api/workspace/mailboxes/${id}`);
}

export function pauseWarmupMailbox(id: string): Promise<WarmupMailbox> {
  return warmupSend<WarmupMailbox>(`api/workspace/mailboxes/${id}/pause`, 'POST');
}

export function resumeWarmupMailbox(id: string): Promise<WarmupMailbox> {
  return warmupSend<WarmupMailbox>(`api/workspace/mailboxes/${id}/resume`, 'POST');
}

/** PATCH the whitelisted mutable fields (daily_target / content_mode / is_paused). */
export function updateWarmupMailbox(id: string, patch: WarmupMailboxUpdate): Promise<WarmupMailbox> {
  return warmupSend<WarmupMailbox>(`api/workspace/mailboxes/${id}`, 'PATCH', patch);
}

/**
 * Connect a mailbox to warmup. NOTE for SMTP variants the backend runs a
 * live credential probe before persisting — credentials are stored
 * server-side and never echoed back (MailboxOut has no credential fields).
 */
export function createWarmupMailbox(payload: WarmupMailboxCreate): Promise<WarmupMailbox> {
  return warmupSend<WarmupMailbox>('api/workspace/mailboxes', 'POST', payload);
}

/** 204 on success — removes the mailbox and its warmup history linkage. */
export function deleteWarmupMailbox(id: string): Promise<void> {
  return warmupSend<void>(`api/workspace/mailboxes/${id}`, 'DELETE');
}

/** Most recent alerts (in-app notifications) + unread badge count. */
export function warmupAlerts(): Promise<WarmupAlertsResponse> {
  return warmupGet<WarmupAlertsResponse>('api/workspace/notifications-inbox?limit=20');
}

// --------------------------------------------------------------------------- //
// DNS validation (dns.py routes; response shared by both)                     //
// --------------------------------------------------------------------------- //

/**
 * Free-form SPF/DKIM/DMARC check for any domain or email address (email wins
 * when both are given — the backend extracts its domain). `dkim_selector` is a
 * best-effort hint; the backend falls back through common selectors.
 */
export function checkWarmupDns(payload: WarmupDnsCheckRequest): Promise<WarmupDnsCheckResponse> {
  return warmupSend<WarmupDnsCheckResponse>('api/workspace/dns/check', 'POST', payload);
}

/**
 * Mailbox-scoped check — same response shape, plus the backend persists
 * spf/dkim/dmarc validity on the warmup mailbox row (the list view surfaces
 * those flags) and notifies the user when all three pass.
 */
export function checkWarmupMailboxDns(mailboxId: string): Promise<WarmupDnsCheckResponse> {
  return warmupSend<WarmupDnsCheckResponse>(
    `api/workspace/mailboxes/${mailboxId}/dns-check`,
    'POST',
  );
}

/** Warmup activity feed (cursor-paginated; we take the newest `limit` items, 1-200). */
export function warmupActivity(limit = 20): Promise<WarmupActivityFeedResponse> {
  return warmupGet<WarmupActivityFeedResponse>(
    `api/workspace/warmup-activity?limit=${limit}`,
  );
}

export async function warmupHealth(): Promise<boolean> {
  try {
    const res = await fetch('/wp-api/health');
    return res.ok;
  } catch {
    return false;
  }
}
