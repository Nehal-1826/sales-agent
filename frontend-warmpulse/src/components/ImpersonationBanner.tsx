import { useEffect, useState } from 'react';
import { Eye, LogOut, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';

/**
 * Persistent, unmistakable banner shown while a super_admin is impersonating
 * a client. Impersonation now runs in a dedicated tab whose session lives in
 * sessionStorage (`wp_imp_active`), so this banner:
 *   - shows a live countdown to the 30-min expiry (`wp_imp_exp`),
 *   - auto-exits when the window elapses,
 *   - Exit clears the per-tab session and closes the tab (falling back to the
 *     login screen if the browser refuses to close it).
 *
 * Self-hides when not impersonating. Styling uses the strict Shailog orange
 * palette via `var(--wp-*)` tokens with literal hex fallbacks.
 */
const isImpersonationTab = () =>
  typeof window !== 'undefined' && sessionStorage.getItem('wp_imp_active') === '1';

function exitImpersonation() {
  try {
    sessionStorage.removeItem('wp_imp_active');
    sessionStorage.removeItem('wp_imp_exp');
    sessionStorage.removeItem('warmpulse.auth');
  } catch {
    /* ignore */
  }
  // Try to close the tab (admin opened it); if blocked, go to login.
  window.close();
  window.location.replace('/login');
}

function fmt(ms: number): string {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ImpersonationBanner() {
  const impersonatedEmail = useAuthStore((s) => s.impersonatedEmail);
  const perTab = isImpersonationTab();

  const [remaining, setRemaining] = useState<number>(() => {
    const exp = Number(sessionStorage.getItem('wp_imp_exp') ?? 0);
    return exp ? exp - Date.now() : 0;
  });

  useEffect(() => {
    if (!perTab) return;
    const exp = Number(sessionStorage.getItem('wp_imp_exp') ?? 0);
    if (!exp) return;
    const id = setInterval(() => {
      const left = exp - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        exitImpersonation();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [perTab]);

  if (!impersonatedEmail) return null;

  // Legacy (non-per-tab) sessions: keep the old restore behaviour.
  const handleExit = () => {
    if (perTab) {
      exitImpersonation();
      return;
    }
    useAuthStore.getState().stopImpersonation();
    window.location.assign('/admin/users');
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[2147483647] flex w-full items-center justify-between gap-3 px-4 py-2 text-sm font-semibold shadow-lg"
      style={{
        background: 'var(--wp-accent, #F26522)',
        color: '#1a0d05',
        borderBottom: '2px solid var(--wp-accent-hover, #C8470E)',
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Eye size={16} strokeWidth={2.4} className="shrink-0" aria-hidden />
        <span className="truncate">
          Viewing as{' '}
          <span className="font-bold underline underline-offset-2">{impersonatedEmail}</span>{' '}
          — you are impersonating this user.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {perTab && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold"
            style={{ background: 'rgba(0,0,0,0.15)' }}
          >
            <Clock size={13} strokeWidth={2.6} aria-hidden />
            {fmt(remaining)}
          </span>
        )}
        <button
          type="button"
          onClick={handleExit}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors"
          style={{ background: '#1a0d05', color: 'var(--wp-accent, #F26522)' }}
        >
          <LogOut size={13} strokeWidth={2.6} aria-hidden />
          Exit
        </button>
      </span>
    </div>
  );
}
