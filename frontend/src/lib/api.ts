import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { env } from './env';
import { useAuthStore } from '@/stores/auth';

export const api = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach bearer token from the auth store.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh-on-401 logic — a single in-flight refresh promise prevents stampede.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    return null;
  }
  try {
    // Backend returns the AuthResponse envelope ({tokens: {...}, user}) for
    // refresh, same as login/signup. Older mock returned flat tokens. Accept
    // either shape so this stays robust if the backend ever flattens.
    type RefreshResp =
      | { access_token: string; refresh_token?: string }
      | { tokens: { access_token: string; refresh_token?: string } };
    const { data } = await axios.post<RefreshResp>(
      `${env.VITE_API_BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
      { withCredentials: true },
    );
    const access =
      'access_token' in data ? data.access_token : data.tokens.access_token;
    const refresh =
      'access_token' in data
        ? data.refresh_token
        : data.tokens.refresh_token;
    if (!access) {
      logout();
      return null;
    }
    setTokens({
      accessToken: access,
      refreshToken: refresh ?? refreshToken,
    });
    return access;
  } catch {
    logout();
    return null;
  }
}

type RetriableRequest = AxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = (error.config ?? {}) as RetriableRequest;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken();
      const newToken = await refreshPromise;
      refreshPromise = null;

      if (newToken) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);

// Maintenance-mode redirect. While maintenance mode is ON the backend answers
// 503 {"detail":"maintenance","message":"…"} for every client API. Bounce
// regular users to the /maintenance screen (full reload so all in-flight app
// state is dropped). Admins are exempt — they must keep working so they can
// reach /admin/settings and turn it back off. Also skip when already on
// /maintenance so the page's 30s recovery ping can't cause a redirect loop.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const data = error.response?.data as { detail?: unknown; message?: unknown } | undefined;
    const url = error.config?.url ?? '';
    // Normalise absolute URLs (rare) down to a path for the admin exemption.
    const path = url.replace(/^https?:\/\/[^/]+/i, '');
    if (
      error.response?.status === 503 &&
      data?.detail === 'maintenance' &&
      !path.startsWith('/admin') &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/maintenance'
    ) {
      if (typeof data.message === 'string' && data.message) {
        try {
          sessionStorage.setItem('warmpulse.maintenanceMessage', data.message);
        } catch {
          /* private mode — generic copy is used instead */
        }
      }
      window.location.href = '/maintenance';
    }
    return Promise.reject(error);
  },
);
