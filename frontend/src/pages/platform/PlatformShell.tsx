import { useEffect, useState } from 'react';
import { GlassBackdrop } from '../../components/Lightfall';
import {
  IconBuilding,
  IconCreditCard,
  IconDashboard,
  IconLayers,
  IconLogout,
  IconPulse,
  IconReceipt,
  IconShield,
  type IconProps,
} from '../../components/icons';
import { Toaster } from '../../components/feedback';
import { OverviewPage } from './OverviewPage';
import { TenantsPage } from './TenantsPage';
import { PaymentsPage } from './PaymentsPage';
import { InvoicesPage } from './InvoicesPage';
import { MarketingPage } from './MarketingPage';
import { PlansPage } from './PlansPage';
import { AuditPage } from './AuditPage';
import { PLATFORM_PAGES } from './shared';
import type { PlatformPage } from './shared';

const LABELS: Record<PlatformPage, string> = {
  overview: 'Overview',
  tenants: 'Tenants',
  payments: 'Payments',
  invoices: 'Invoices',
  marketing: 'Marketing',
  plans: 'Plans',
  audit: 'Audit log',
};

const ICONS: Record<PlatformPage, (p: IconProps) => JSX.Element> = {
  overview: IconDashboard,
  tenants: IconBuilding,
  payments: IconCreditCard,
  invoices: IconReceipt,
  marketing: IconPulse,
  plans: IconLayers,
  audit: IconShield,
};

function parse(hash = window.location.hash): PlatformPage {
  const [root = '', page = ''] = hash.replace(/^#\/?/, '').split('/');
  return root === 'platform' && (PLATFORM_PAGES as readonly string[]).includes(page) ? (page as PlatformPage) : 'overview';
}

export function PlatformShell({ demo, onSignOut }: { demo: boolean; onSignOut: () => void }) {
  const [page, setPage] = useState<PlatformPage>(() => parse());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const on = () => setPage(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  // normalise a non-platform hash left over from a tenant session
  useEffect(() => {
    if (!window.location.hash.startsWith('#/platform/')) window.location.hash = `#/platform/${page}`;
  }, [page]);

  useEffect(() => setMenuOpen(false), [page]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="app-shell pf-shell">
      <GlassBackdrop />
      <aside className={`sidebar${menuOpen ? ' open' : ''}`} aria-label="Platform navigation">
        <a
          href="#/platform/overview"
          className="sidebar-brand"
          onClick={() => setMenuOpen(false)}
          aria-label="Go to Overview"
        >
          <img src="/warmpulse-logo.svg" alt="" className="brand-logo" />
          <span className="brand-name">WarmPulse</span>
        </a>
        <div className="workspace-badge" title="Platform administration console across all workspaces.">
          <small>Console</small>
          <strong>Platform admin</strong>
        </div>

        <nav className="side-nav">
          {PLATFORM_PAGES.map((p) => {
            const Icon = ICONS[p];
            return (
              <a
                key={p}
                href={`#/platform/${p}`}
                className={`nav-item${page === p ? ' active' : ''}`}
                aria-current={page === p ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={18} />
                <span>{LABELS[p]}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden>
              PA
            </span>
            <div>
              <strong>Platform Admin</strong>
              <small>Super admin</small>
            </div>
          </div>
          <button className="nav-item side-logout" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <IconLogout size={18} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />}

      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="topbar-title">WarmPulse — Platform console</div>
          <div className="topbar-actions">
            {demo && <span className="chip chip-warn">Demo data (read-only)</span>}
            <span className="chip chip-accent">{LABELS[page]}</span>
          </div>
        </header>
        <main className="content" id="main" tabIndex={-1}>
          {page === 'overview' && <OverviewPage />}
          {page === 'tenants' && <TenantsPage demo={demo} />}
          {page === 'payments' && <PaymentsPage demo={demo} />}
          {page === 'invoices' && <InvoicesPage />}
          {page === 'marketing' && <MarketingPage />}
          {page === 'plans' && <PlansPage demo={demo} />}
          {page === 'audit' && <AuditPage />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
