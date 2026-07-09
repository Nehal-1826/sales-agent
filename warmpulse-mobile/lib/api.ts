/**
 * Minimal typed API client for the WarmPulse backend.
 *
 * Mirrors the web app's axios setup (bearer injection + transparent
 * 401 → /auth/refresh → retry) with plain fetch, so the mobile app talks to
 * the exact same endpoints as the website.
 */
import { API_BASE_URL } from './config';
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from './storage';

export type Tokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type AppUser = {
  id: string;
  email: string;
  role: string;
  onboarding_status: string;
  plan?: string | null;
  crm_addon?: boolean;
  totp_enabled?: boolean;
  email_verified?: boolean;
};

export type AuthResponse = { tokens: Tokens; user: AppUser };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
        .join(', ');
    }
  } catch {
    // non-JSON body
  }
  if (res.status === 0) return 'Network error — check your connection.';
  return `Request failed (${res.status})`;
}

async function rawFetch(path: string, init: RequestInit, token?: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}

/** Unauthenticated JSON POST (login / signup / refresh / firebase). */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await rawFetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return (await res.json()) as T;
}

/** Authenticated request with a single transparent refresh-and-retry on 401. */
export async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let access = await getAccessToken();
  let res = await rawFetch(path, init, access);

  if (res.status === 401) {
    access = await tryRefresh();
    if (access) res = await rawFetch(path, init, access);
  }

  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  try {
    const data = await postJson<AuthResponse>('/api/auth/refresh', { refresh_token: refresh });
    await saveTokens(data.tokens.access_token, data.tokens.refresh_token);
    return data.tokens.access_token;
  } catch {
    await clearTokens();
    return null;
  }
}
