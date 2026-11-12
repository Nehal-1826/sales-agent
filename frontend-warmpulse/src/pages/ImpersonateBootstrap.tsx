import { useEffect, useRef, useState } from 'react';

/**
 * Landing page for an impersonation tab. The admin opens
 * `/impersonate#p=<base64>` in a new tab; this component:
 *   1. decodes the payload ({token, user, exp}) from the URL hash,
 *   2. flags the tab as an impersonation tab (`wp_imp_active`) so the auth
 *      store persists to sessionStorage (per-tab isolation → multi-impersonation),
 *   3. seeds the auth store's persisted blob in sessionStorage,
 *   4. strips the hash from history, and
 *   5. hard-navigates to the client dashboard so the store re-hydrates from
 *      sessionStorage under the impersonated identity.
 *
 * The token is short-lived (30 min, enforced by its JWT exp) and is removed
 * from the URL/history immediately.
 */
export function ImpersonateBootstrap() {
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    try {
      const hash = window.location.hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      const raw = params.get('p');
      if (!raw) throw new Error('missing payload');
      const decoded = JSON.parse(decodeURIComponent(atob(raw))) as {
        token: string;
        user: Record<string, unknown>;
        exp: number;
      };
      if (!decoded.token || !decoded.user) throw new Error('bad payload');

      sessionStorage.setItem('wp_imp_active', '1');
      sessionStorage.setItem('wp_imp_exp', String(decoded.exp));
      // Seed the zustand-persist blob so the store hydrates as the impersonated
      // user on the next load. Shape must match the persist envelope.
      sessionStorage.setItem(
        'warmpulse.auth',
        JSON.stringify({
          version: 0,
          state: {
            user: decoded.user,
            accessToken: decoded.token,
            refreshToken: null,
            impersonationOrigin: null,
            impersonatedEmail: (decoded.user as { email?: string }).email ?? null,
          },
        }),
      );

      // Strip the token from the URL/history before navigating.
      window.history.replaceState(null, '', '/impersonate');
      window.location.replace('/app/dashboard');
    } catch {
      setError('This impersonation link is invalid or has expired.');
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg text-text">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-lg font-semibold">Impersonation failed</p>
            <p className="mt-1 text-sm text-text-dim">{error}</p>
          </>
        ) : (
          <p className="text-sm text-text-dim">Starting impersonated session…</p>
        )}
      </div>
    </div>
  );
}

export default ImpersonateBootstrap;
