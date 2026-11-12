import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AdminPillSidebar } from './AdminPillSidebar';
import { PageTransition } from '@/components/brand/RouteLoader';
import { useAdminUi } from '@/stores/adminUi';
import { toast } from '@/components/ui/AppToast';
import '@/pages/landing/hero-theme.css';
import './admin-shell.css';
import './admin-theme.css';

/**
 * Admin shell — dark Aurora Glass canvas with the floating glass-pill sidebar
 * (design S4) as the PERMANENT admin nav. Section content is built on the
 * Aurora Glass primitive kit (admin-theme.css); the pill is the fixed shell.
 */
export function AdminLayout() {
  const { pathname } = useLocation();
  const toggleGodMode = useAdminUi((s) => s.toggleGodMode);

  // Hidden key combo: Ctrl+Shift+X to toggle "God Mode" (revenge visibility).
  // Changed from 'K' as Firefox heavily traps Ctrl+Shift+K for the dev console.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        toggleGodMode();
        // Since the store updates immediately, we can just peek at the new state
        // or just show a generic toggle toast.
        toast.success("Admin Developer Mode Toggled");
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleGodMode]);

  return (
    <AuthGuard requireRole="super_admin">
      <div className="admin-shell">
        <div className="admin-shell__atmosphere" aria-hidden>
          <div className="admin-shell__aurora-1" />
          <div className="admin-shell__aurora-2" />
          <div className="admin-shell__grid" />
        </div>
        <AdminPillSidebar />
        <main className="admin-shell__main">
          <PageTransition pathKey={pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </AuthGuard>
  );
}
