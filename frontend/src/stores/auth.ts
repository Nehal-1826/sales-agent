import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole = 'super_admin' | 'client';

export type OnboardingStatus = 'signed_up' | 'plan_selected' | 'mailbox_pending' | 'active';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  workspace_id: string;
  onboarding_status: OnboardingStatus;
  plan: string | null;
  /**
   * Whether this workspace has purchased the CRM add-on (Starter unlock).
   * Optional because login/signup/impersonation payloads may predate it;
   * the authoritative value comes from the /auth/me query (see usePlan).
   */
  crm_addon?: boolean;
  email_verified: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Snapshot of the admin's own session, stashed while impersonating so
 * `stopImpersonation()` can restore it exactly. The impersonation access
 * token replaces `accessToken`; the admin's refreshToken is intentionally
 * kept live (see `startImpersonation`).
 */
interface ImpersonationOrigin {
  accessToken: string;
  refreshToken: string | null;
  user: AuthUser | null;
}

interface StartImpersonationArgs {
  token: string;
  user: AuthUser;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Non-null only while an admin is impersonating a client. */
  impersonationOrigin: ImpersonationOrigin | null;
  /** Email of the user currently being impersonated, or null. */
  impersonatedEmail: string | null;
  setTokens: (tokens: TokenPair) => void;
  setUser: (user: AuthUser | null) => void;
  startImpersonation: (args: StartImpersonationArgs) => void;
  stopImpersonation: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      impersonationOrigin: null,
      impersonatedEmail: null,
      setTokens: ({ accessToken, refreshToken }) =>
        set(() => ({ accessToken, refreshToken })),
      setUser: (user) => set(() => ({ user })),
      startImpersonation: ({ token, user, email }) =>
        set((state) => ({
          // Stash the admin's current session so Exit can restore it verbatim.
          impersonationOrigin: {
            accessToken: state.accessToken ?? '',
            refreshToken: state.refreshToken,
            user: state.user,
          },
          // Swap the access token to the impersonation JWT.
          accessToken: token,
          // The impersonation token is access-only (no matching refresh token),
          // so we keep the admin's refresh token live — that way axios's silent
          // 401 → /auth/refresh keeps working during the impersonated session.
          refreshToken: state.refreshToken,
          user,
          impersonatedEmail: email,
        })),
      stopImpersonation: () =>
        set((state) => {
          const origin = state.impersonationOrigin;
          if (!origin) return {};
          return {
            accessToken: origin.accessToken,
            refreshToken: origin.refreshToken,
            user: origin.user,
            impersonationOrigin: null,
            impersonatedEmail: null,
          };
        }),
      logout: () =>
        set(() => ({
          user: null,
          accessToken: null,
          refreshToken: null,
          impersonationOrigin: null,
          impersonatedEmail: null,
        })),
    }),
    {
      name: 'warmpulse.auth',
      // Per-tab isolation for impersonation: a tab flagged `wp_imp_active`
      // persists auth in sessionStorage (scoped to that tab) so an admin can
      // impersonate several users in separate tabs at once without disturbing
      // their own localStorage-backed admin session. Decided once at load.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' &&
        window.sessionStorage?.getItem('wp_imp_active') === '1'
          ? sessionStorage
          : localStorage,
      ),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        impersonationOrigin: state.impersonationOrigin,
        impersonatedEmail: state.impersonatedEmail,
      }),
    },
  ),
);
