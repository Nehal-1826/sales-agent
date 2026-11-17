import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { GlassBackdrop } from '../../components/Lightfall';
import {
  IconBranch,
  IconBuilding,
  IconChart,
  IconCrm,
  IconCreditCard,
  IconDashboard,
  IconFlame,
  IconLayers,
  IconLogout,
  IconMail,
  IconNetwork,
  IconPackage,
  IconPulse,
  IconReceipt,
  IconReport,
  IconSend,
  IconSettings,
  IconShield,
  IconSpark,
  IconUsers,
  IconWallet,
  type IconProps,
} from '../../components/icons';
import { Toaster } from '../../components/feedback';
import { OverviewPage } from './OverviewPage';
import { PlatformAnalyticsPage } from './PlatformAnalyticsPage';
import { PeerInboxesPage } from './PeerInboxesPage';
import { PoolRoutingPage } from './PoolRoutingPage';
import { LlmUsagePage } from './LlmUsagePage';
import { MailPage } from '../MailPage';
import { AdminUsersPage } from './AdminUsersPage';
import { TenantsPage } from './TenantsPage';
import { RevengePage } from './RevengePage';
import { CrmManagementPage } from './CrmManagementPage';
import { PlansPage } from './PlansPage';
import { AddonsPage } from './AddonsPage';
import { AdminBillingPage } from './AdminBillingPage';
import { PaymentsPage } from './PaymentsPage';
import { InvoicesPage } from './InvoicesPage';
import { AdminReportsPage } from './AdminReportsPage';
import { AuditPage } from './AuditPage';
import { AdminSettingsPage } from './AdminSettingsPage';
import { MarketingPage } from './MarketingPage';
import { PLATFORM_PAGES } from './shared';
import { navigateAdmin, parseAdminRoute } from '../../lib/router';
import type { PlatformPage } from './shared';

const LABELS: Record<PlatformPage, string> = {
  overview: 'Overview',
  analytics: 'Platform stats',
  peers: 'Test accounts',
  routing: 'Account routing',
  llm: 'AI usage',
  mail: 'Mail',
  users: 'Users',
  tenants: 'Tenants',
  revenge: 'Retention',
  crm: 'Leads',
  plans: 'Plans',
  addons: 'Add-ons',
  billing: 'Billing',
  payments: 'Payments',
  invoices: 'Invoices',
  reports: 'Reports',
  audit: 'Audit log',
  settings: 'Settings',
  marketing: 'Marketing',
};

const ICONS: Record<PlatformPage, (p: IconProps) => JSX.Element> = {
  overview: IconDashboard,
  analytics: IconChart,
  peers: IconNetwork,
  routing: IconBranch,
  llm: IconSpark,
  mail: IconMail,
  users: IconUsers,
  tenants: IconBuilding,
  revenge: IconFlame,
  crm: IconCrm,
  plans: IconLayers,
  addons: IconPackage,
  billing: IconWallet,
  payments: IconCreditCard,
  invoices: IconReceipt,
  reports: IconReport,
  audit: IconShield,
  settings: IconSettings,
  marketing: IconPulse,
};

/** Grouped sidebar nav — mirrors the WarmPulse admin nav clusters
 *  (nav-config.ts ADMIN_NAV_GROUPS) with the console-only pages folded in. */
const NAV_GROUPS: { group: string; pages: PlatformPage[] }[] = [
  { group: 'Overview', pages: ['overview', 'analytics'] },
  { group: 'Email network', pages: ['mail', 'peers', 'routing', 'llm'] },
  {
    group: 'Customers & money',
    pages: ['users', 'tenants', 'revenge', 'crm', 'plans', 'addons', 'billing', 'payments', 'invoices'],
  },
  { group: 'Management', pages: ['reports', 'audit', 'settings', 'marketing'] },
];

/**
 * Render-crash guard for one admin page — a broken page shows the friendly
 * admin-unavailable panel instead of blanking the whole console. `key={page}`
 * resets it on navigation; "Try again" re-renders the page once more.
 */
class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card" role="alert" style={{ margin: 24, maxWidth: 560 }}>
        <h2 className="pf-h2">Admin data unavailable</h2>
        <p className="field-hint">Connect to the warmup backend or verify your admin session, then try again.</p>
        <button className="btn" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </section>
    );
  }
}

export function PlatformShell({ demo, onSignOut, slug }: { demo: boolean; onSignOut: () => void; slug: string }) {
  const [page, setPage] = useState<PlatformPage>(() => {
    const r = parseAdminRoute();
    const p = r && r.slug === slug ? r.page : 'overview';
    return (PLATFORM_PAGES as readonly string[]).includes(p) ? (p as PlatformPage) : 'overview';
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const on = () => {
      const r = parseAdminRoute();
      const p = r && r.slug === slug ? r.page : 'overview';
      setPage((PLATFORM_PAGES as readonly string[]).includes(p) ? (p as PlatformPage) : 'overview');
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [slug]);

  // normalise the URL to /<slug>/<page> if it drifted
  useEffect(() => {
    const expected = `/${slug}/${page}`;
    if (window.location.pathname !== expected) {
      navigateAdmin(slug, page);
    }
  }, [page, slug]);

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
          {NAV_GROUPS.map(({ group, pages }) => (
            <div key={group} className="nav-group">
              <small className="nav-group-label">{group}</small>
              {pages.map((p) => {
                const Icon = ICONS[p];
                return (
                  <a
                    key={p}
                    href={`/${slug}/${p}`}
                    className={`nav-item${page === p ? ' active' : ''}`}
                    aria-current={page === p ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateAdmin(slug, p);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon size={18} />
                    <span>{LABELS[p]}</span>
                  </a>
                );
              })}
            </div>
          ))}
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
          <PageErrorBoundary key={page}>
          {page === 'overview' && <OverviewPage />}
          {page === 'analytics' && <PlatformAnalyticsPage />}
          {page === 'peers' && <PeerInboxesPage demo={demo} />}
          {page === 'routing' && <PoolRoutingPage demo={demo} />}
          {page === 'llm' && <LlmUsagePage demo={demo} />}
          {page === 'mail' && <MailPage />}
          {page === 'users' && <AdminUsersPage demo={demo} />}
          {page === 'tenants' && <TenantsPage demo={demo} />}
          {page === 'revenge' && <RevengePage demo={demo} />}
          {page === 'crm' && <CrmManagementPage />}
          {page === 'plans' && <PlansPage demo={demo} />}
          {page === 'addons' && <AddonsPage demo={demo} />}
          {page === 'billing' && <AdminBillingPage demo={demo} />}
          {page === 'payments' && <PaymentsPage demo={demo} />}
          {page === 'invoices' && <InvoicesPage />}
          {page === 'reports' && <AdminReportsPage demo={demo} />}
          {page === 'audit' && <AuditPage />}
          {page === 'settings' && <AdminSettingsPage demo={demo} />}
          {page === 'marketing' && <MarketingPage />}
          </PageErrorBoundary>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
