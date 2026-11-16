import { Outlet, useLocation } from 'react-router-dom';
import { PageTransition } from '@/components/brand/RouteLoader';
import { ProAppPillSidebar } from './ProAppPillSidebar';
import '@/components/layout/admin-shell.css';

/**
 * ProAppShell — Pro client preview shell.
 *
 * Mirrors AdminLayout structurally: full-bleed dark canvas + atmospheric
 * aurora layer + floating glass-pill sidebar on the left + main content
 * that takes the full viewport width minus a left padding (~100px) that
 * visually reserves room for the pill.
 *
 * No auth guard (this is preview-only). No topbar — each section page
 * carries its own header. Visual treatment is identical to the admin
 * panel so the Pro client app feels like a sibling to admin.
 */
export function ProAppShell() {
  const { pathname } = useLocation();
  return (
    <div className="admin-shell">
      <div className="admin-shell__atmosphere" aria-hidden>
        <div className="admin-shell__aurora-1" />
        <div className="admin-shell__aurora-2" />
        <div className="admin-shell__grid" />
      </div>
      <ProAppPillSidebar />
      <main className="admin-shell__main">
        <PageTransition pathKey={pathname}>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}

export default ProAppShell;
