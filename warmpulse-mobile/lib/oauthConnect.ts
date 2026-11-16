/**
 * One-tap mailbox OAuth connect for mobile (Google / Microsoft).
 *
 * Backend-brokered flow: we ask the backend for a consent URL whose `state` is
 * bound (server-side, in Redis) to the signed-in user, open it in an in-app
 * auth session, and the backend creates the mailbox and bounces back to the
 * `warmpulse://oauth-done` deep link with only a status (+ the user's own
 * email). The refresh token never reaches the device. See
 * docs/superpowers/specs/2026-06-30-mobile-onboarding-oauth-design.md.
 */
import * as WebBrowser from 'expo-web-browser';
import { authFetch, ApiError } from './api';

export type OAuthProvider = 'google' | 'microsoft';

export type OAuthConnectResult =
  | { status: 'ok'; email?: string }
  | { status: 'cancelled' }
  | { status: 'error'; reason: string };

const RETURN_URL = 'warmpulse://oauth-done';

const REASON_TEXT: Record<string, string> = {
  expired: 'That sign-in session expired. Please try again.',
  no_refresh_token: 'Provider did not grant offline access. Re-authorize and try again.',
  token_exchange_failed: "Couldn't complete sign-in with the provider. Try again.",
  google_unreachable: "Couldn't reach Google. Check your connection and try again.",
  ms_unreachable: "Couldn't reach Microsoft. Check your connection and try again.",
  duplicate: 'That mailbox is already connected.',
  create_failed: "Couldn't save the mailbox. Try again.",
  user_missing: 'Your session was not found. Please sign in again.',
  missing_code: 'Sign-in was interrupted. Please try again.',
  not_configured: 'OAuth sign-in is not available right now. Use an app password instead.',
};

/** Human-readable copy for an error `reason` slug. */
export function oauthReasonText(reason: string): string {
  return REASON_TEXT[reason] ?? 'Could not connect this mailbox. Try again.';
}

/** Parse `status` / `email` / `reason` out of the returned deep-link URL. */
function parseReturn(url: string): OAuthConnectResult {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params: Record<string, string> = {};
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  if (params.status === 'ok') return { status: 'ok', email: params.email };
  return { status: 'error', reason: params.reason || 'create_failed' };
}

export async function connectMailboxOAuth(
  provider: OAuthProvider,
  dailyTarget = 50,
): Promise<OAuthConnectResult> {
  let authUrl: string;
  try {
    const res = await authFetch<{ auth_url: string }>(
      `/api/auth/${provider}/mobile/oauth-start`,
      { method: 'POST', body: JSON.stringify({ daily_target: dailyTarget }) },
    );
    authUrl = res.auth_url;
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      return { status: 'error', reason: 'not_configured' };
    }
    return { status: 'error', reason: 'create_failed' };
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, RETURN_URL);
  if (result.type === 'success' && result.url) return parseReturn(result.url);
  // 'cancel' (user backed out) or 'dismiss' (sheet closed) → no-op
  return { status: 'cancelled' };
}
