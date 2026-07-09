import { useMutation, useQuery, type UseMutationResult } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuthStore, type AuthUser } from '@/stores/auth';

/**
 * Backend auth contract (see spec §3, §4).
 * All endpoints under /auth/* on the API base URL (api.ts already prefixes /api).
 */

interface TokenEnvelope {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}

export interface LoginResponse extends TokenEnvelope {
  user: AuthUser;
}

export type SignupResponse = LoginResponse;

export interface MeResponse {
  user: AuthUser;
}

export interface SignupPayload {
  email: string;
  password: string;
  plan?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  totp_code?: string;
}

/**
 * Narrow helper — server signals "2FA required" with HTTP 403.
 *
 * Body shape varies by backend version:
 *   1. {code: "totp_required"}            — preferred / future-proof
 *   2. {detail: "TOTP code required"}     — current FastAPI shape
 *   3. {message: "Two-factor required"}   — legacy
 *
 * Match any of them so the modal opens on the real response, not just
 * the structured one.
 */
export function isTotpRequiredError(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  if (err.response?.status !== 403) return false;
  const data = err.response.data as
    | { code?: string; detail?: string; message?: string }
    | undefined;
  if (data?.code === 'totp_required') return true;
  const text = (data?.detail ?? data?.message ?? '').toLowerCase();
  return text.includes('totp') || text.includes('two-factor') || text.includes('2fa');
}

export function getErrorStatus(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined;
}

/**
 * Extracts per-field errors from a FastAPI 422 response.
 * Returns a map like {email: "invalid", password: "too short"}.
 */
export function parseFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof AxiosError)) return {};
  if (err.response?.status !== 422) return {};
  const data = err.response.data as
    | { detail?: Array<{ loc?: (string | number)[]; msg?: string }> | string }
    | undefined;
  const detail = data?.detail;
  if (!Array.isArray(detail)) return {};
  const out: Record<string, string> = {};
  for (const item of detail) {
    const loc = item.loc ?? [];
    // loc is typically ["body", "<field>"] — take the last string segment
    const field = [...loc].reverse().find((l) => typeof l === 'string') as string | undefined;
    if (field && item.msg) out[field] = item.msg;
  }
  return out;
}

// ---------- mutations ----------

// Backend returns {tokens: {access_token, refresh_token, token_type, expires_in}, user}.
// We flatten to {access_token, refresh_token, user} so call sites stay simple.
interface AuthEnvelope {
  tokens: { access_token: string; refresh_token: string; token_type?: string };
  user: AuthUser;
}

function flattenAuth(env: AuthEnvelope): LoginResponse {
  return {
    access_token: env.tokens.access_token,
    refresh_token: env.tokens.refresh_token,
    token_type: env.tokens.token_type,
    user: env.user,
  };
}

export function useSignup(): UseMutationResult<SignupResponse, unknown, SignupPayload> {
  return useMutation<SignupResponse, unknown, SignupPayload>({
    mutationFn: async (payload) => {
      const res: AxiosResponse<AuthEnvelope> = await api.post('/auth/signup', payload);
      return flattenAuth(res.data);
    },
  });
}

export function useLogin(): UseMutationResult<LoginResponse, unknown, LoginPayload> {
  return useMutation<LoginResponse, unknown, LoginPayload>({
    mutationFn: async (payload) => {
      const res: AxiosResponse<AuthEnvelope> = await api.post('/auth/login', payload);
      return flattenAuth(res.data);
    },
  });
}

/**
 * Fetches the current user. Enabled only when an access token is present,
 * so it can be mounted anywhere safely.
 */
export function useMe() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery<AuthUser, unknown>({
    queryKey: ['auth', 'me'],
    enabled: !!accessToken,
    queryFn: async () => {
      const res: AxiosResponse<MeResponse | AuthUser> = await api.get('/auth/me');
      // Accept either {user: ...} or the user object directly.
      const data = res.data as MeResponse & Partial<AuthUser>;
      return (data.user ?? (res.data as AuthUser)) as AuthUser;
    },
  });
}

/**
 * Manual refresh trigger. The axios interceptor in lib/api.ts already handles
 * silent refresh on 401, so this is exposed mostly for completeness / explicit
 * re-auth flows (e.g. session revival from a stale tab).
 */
export function useRefresh(): UseMutationResult<TokenEnvelope, unknown, void> {
  return useMutation<TokenEnvelope, unknown, void>({
    mutationFn: async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      const res: AxiosResponse<TokenEnvelope> = await api.post('/auth/refresh', {
        refresh_token: refreshToken,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const current = useAuthStore.getState();
      current.setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? current.refreshToken ?? '',
      });
    },
  });
}

/**
 * Logout hook — clears the store and navigates home. Fire-and-forget on the API
 * side (backend session revocation is best-effort; even if it fails the local
 * state is cleared so the user is effectively signed out).
 */
export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  return () => {
    // Fire-and-forget; ignore errors (user is logging out anyway).
    api.post('/auth/logout').catch(() => {});
    logout();
    navigate('/login');
  };
}
