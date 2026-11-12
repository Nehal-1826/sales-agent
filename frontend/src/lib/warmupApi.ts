/**
 * WarmPulse FastAPI client — Bearer bridge JWT on /wp-api (gateway rewrites
 * to /api). The JWT is minted by the Django bridge POST /api/auth/warmup-token/
 * and cached in localStorage under its own 'warmpulse:' namespace.
 */
import { post, request } from './api';

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

/** GET on the warmup API — path WITHOUT the /wp-api prefix (e.g. 'api/mailboxes'). */
export async function warmupGet<T>(path: string): Promise<T> {
  const res = await wpFetch(path);
  if (!res.ok) throw new Error(`warmup API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function warmupHealth(): Promise<boolean> {
  try {
    const res = await fetch('/wp-api/health');
    return res.ok;
  } catch {
    return false;
  }
}
