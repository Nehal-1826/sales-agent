/**
 * Auth context for the mobile app — the single source of session truth.
 *
 * On mount it restores any stored session (SecureStore → GET /api/auth/me).
 * login / signup / loginWithIdToken all hit the same backend the website uses
 * and persist the returned JWT pair.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { postJson, authFetch, type AuthResponse, type AppUser } from './api';
import { saveTokens, clearTokens, getAccessToken } from './storage';

export type AuthStatus = 'loading' | 'authed' | 'guest';

type AuthContextValue = {
  status: AuthStatus;
  user: AppUser | null;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  /** Exchange a Firebase ID token (from Google sign-in) for our session. */
  loginWithIdToken: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-fetch /auth/me — call after plan upgrade / 2FA changes so user is fresh. */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AppUser | null>(null);

  const apply = useCallback(async (res: AuthResponse) => {
    await saveTokens(res.tokens.access_token, res.tokens.refresh_token);
    setUser(res.user);
    setStatus('authed');
  }, []);

  const login = useCallback(
    async (email: string, password: string, totpCode?: string) => {
      await apply(
        await postJson<AuthResponse>('/api/auth/login', {
          email,
          password,
          ...(totpCode ? { totp_code: totpCode } : {}),
        }),
      );
    },
    [apply],
  );

  const signup = useCallback(
    async (email: string, password: string) => {
      await apply(await postJson<AuthResponse>('/api/auth/signup', { email, password }));
    },
    [apply],
  );

  const loginWithIdToken = useCallback(
    async (idToken: string) => {
      await apply(await postJson<AuthResponse>('/api/auth/firebase', { id_token: idToken }));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
    setStatus('guest');
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authFetch<AppUser>('/api/auth/me');
      setUser(me);
    } catch {
      /* keep existing user on a transient failure */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const access = await getAccessToken();
      if (!access) {
        if (!cancelled) setStatus('guest');
        return;
      }
      try {
        const me = await authFetch<AppUser>('/api/auth/me');
        if (!cancelled) {
          setUser(me);
          setStatus('authed');
        }
      } catch {
        await clearTokens();
        if (!cancelled) setStatus('guest');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, signup, loginWithIdToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
