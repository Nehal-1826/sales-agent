/**
 * Backend connection layer — every frontend↔backend call lives here.
 *
 * Contract:
 *   - LIVE (the /health/ probe succeeded): getters return real data or THROW
 *     an ApiError; mutations return a Result.  A live workspace never shows
 *     bundled demo data or fake success — that would put invented companies
 *     next to real Approve & send buttons.
 *   - DEMO (backend unreachable at start-up, dev build or VITE_ALLOW_DEMO=1):
 *     everything resolves from src/lib/mockData.ts so the UI can be explored.
 *   - OFFLINE (unreachable in a production build): App shows a Retry screen.
 * A 401 on any call clears the token and fires SESSION_EXPIRED_EVENT.
 */

import { clearAll } from './store';

/** Base URL the Django API is served from (Vite proxies /api in dev). */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

const TOKEN_KEY = 'agentic-ai:token';
export const SESSION_EXPIRED_EVENT = 'agentic:session-expired';

/** Bundled demo data is only allowed in dev builds or when explicitly enabled. */
const DEMO_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEMO === '1';

let authToken: string | null = null;
try {
  authToken = localStorage.getItem(TOKEN_KEY);
} catch {
  /* storage unavailable */
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/** A failed API call. status 0 = network / timeout (no HTTP answer). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function friendlyStatus(status: number): string {
  if (status === 400) return 'That request was not accepted.';
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return 'That item no longer exists.';
  if (status === 409) return 'That was already handled.';
  if (status >= 500) return 'The server hit an error. Try again in a moment.';
  return `Request failed (${status}).`;
}

/** Plain-language message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong.';
}

function expireSession(): void {
  authToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export async function request<T>(path: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Token ${authToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut =
      e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new ApiError(
      0,
      timedOut
        ? 'The server is taking longer than expected. It may still finish in the background.'
        : "Couldn't reach your workspace. Check your connection and try again.",
    );
  }
  if (res.status === 401 && authToken) expireSession();
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { detail?: string; message?: string };
      detail = body.detail || body.message || '';
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail || friendlyStatus(res.status));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Run a call and fold any failure into a Result (for mutations). */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e), status: e instanceof ApiError ? e.status : undefined };
  }
}

export const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });
export const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) });

/* ------------------------------------------------------------------ */
/* Mode probe + auth                                                   */
/* ------------------------------------------------------------------ */

export type Mode = 'live' | 'demo' | 'offline';
let modePromise: Promise<Mode> | null = null;
let currentMode: Mode | null = null;

/** Probe GET /health/ once per session (re-run with reprobe()). */
export function getMode(): Promise<Mode> {
  if (!modePromise) {
    modePromise = (async (): Promise<Mode> => {
      try {
        // bare fetch on purpose: a stale token must never turn the open
        // health probe into a 401 (DRF rejects bad tokens even on AllowAny)
        const res = await fetch(`${API_BASE_URL}/health/`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) return 'live';
      } catch {
        /* unreachable */
      }
      return DEMO_ALLOWED ? 'demo' : 'offline';
    })().then((m) => (currentMode = m));
  }
  return modePromise;
}

export function reprobe(): Promise<Mode> {
  modePromise = null;
  currentMode = null;
  return getMode();
}

/** True once the probe settled on bundled demo data. */
export function isDemo(): boolean {
  return currentMode === 'demo';
}

/** Awaitable demo check for the endpoint modules. */
export async function inDemo(): Promise<boolean> {
  return (await getMode()) === 'demo';
}

export type AuthState = 'live' | 'demo' | 'offline' | 'unauthenticated';

/** Session gate for App: live (signed in) · demo · offline (retry) · unauthenticated. */
export async function checkAuth(): Promise<AuthState> {
  const mode = await getMode();
  if (mode !== 'live') return mode;
  if (!authToken) return 'unauthenticated';
  try {
    await request('/auth/me/');
    return 'live';
  } catch (e) {
    // only a real 401 means "sign in again"; a slow or failing server is not a logout
    return e instanceof ApiError && e.status === 401 ? 'unauthenticated' : 'offline';
  }
}

export async function login(username: string, password: string): Promise<Result<true>> {
  try {
    // bare fetch: never send a (possibly stale) token on login
    const res = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) return { ok: false, error: "That username and password don't match." };
    if (!res.ok) return { ok: false, error: friendlyStatus(res.status) };
    const data = (await res.json()) as { token: string };
    authToken = data.token;
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
    } catch {
      /* ignore */
    }
    return { ok: true, data: true };
  } catch {
    return { ok: false, error: "Couldn't reach your workspace. Check your connection and try again." };
  }
}

/** Sign out: drop the token and every cached agentic-ai:* value. */
export function logout(): void {
  authToken = null;
  clearAll();
}

/** Authenticated download (CSV export) — fetch + blob, token in the header. */
export async function downloadFile(path: string, filename: string): Promise<Result<true>> {
  return attempt(async () => {
    const headers: Record<string, string> = {};
    if (authToken) headers.Authorization = `Token ${authToken}`;
    const res = await fetch(`${API_BASE_URL}${path}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (res.status === 401 && authToken) expireSession();
    if (!res.ok) throw new ApiError(res.status, friendlyStatus(res.status));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true as const;
  });
}
