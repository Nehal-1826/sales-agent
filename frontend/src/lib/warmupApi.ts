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
  WarmupDashboardSummary,
  WarmupMailboxListResponse,
  WarmupPlacementSplit,
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
  WarmupContentMode,
  WarmupDashboardSummary,
  WarmupMailbox,
  WarmupMailboxListResponse,
  WarmupMailboxProvider,
  WarmupMailboxStatus,
  WarmupPlacementSplit,
  WarmupScheduleWindow,
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

/** Most recent alerts (in-app notifications) + unread badge count. */
export function warmupAlerts(): Promise<WarmupAlertsResponse> {
  return warmupGet<WarmupAlertsResponse>('api/workspace/notifications-inbox?limit=20');
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
