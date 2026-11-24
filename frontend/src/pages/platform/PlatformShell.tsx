import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { GlassBackdrop } from '../../components/Lightfall';
import {
  IconBranch,
  IconBuilding,
  IconChart,
  IconCrm,
  IconDashboard,
  IconLayers,
  IconLogout,
  IconMail,
  IconNetwork,
  IconPulse,
  IconReport,
  IconSettings,
  IconShield,
  IconUsers,
  IconWallet,
  type IconProps,
} from '../../components/icons';
import { Toaster } from '../../components/feedback';
import { OverviewPage } from './OverviewPage';
import { PlatformAnalyticsPage } from './PlatformAnalyticsPage';
import { PeerInboxesPage } from './PeerInboxesPage';
import { PoolRoutingPage } from './PoolRoutingPage';
import { MailPage } from '../MailPage';
import { AdminUsersPage } from './AdminUsersPage';
import { TenantsPage } from './TenantsPage';
import { CrmManagementPage } from './CrmManagementPage';
import { PlansPage } from './PlansPage';
import { PaymentPage } from './PaymentPage';
import { AdminReportsPage } from './AdminReportsPage';
import { AuditPage } from './AuditPage';
import { AdminSettingsPage } from './AdminSettingsPage';
import { MarketingPage } from './MarketingPage';
import { PAYMENT_TABS, resolvePlatformPage } from './shared';
import { navigateAdmin, parseAdminRoute } from '../../lib/router';
import type { PaymentTab, PlatformPage } from './shared';

const LABELS: Record<PlatformPage, string> = {
  overview: 'Overview',
  analytics: 'Platform stats',
  peers: 'Test accounts',
  routing: 'Account routing',
  mail: 'Mail',
  users: 'Users',
  tenants: 'Tenants',
  crm: 'Leads',
  plans: 'Plans',
  // the Payment section: one sidebar entry, three tabs
  payment: 'Payment',
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
  mail: IconMail,
  users: IconUsers,
  tenants: IconBuilding,
  crm: IconCrm,
  plans: IconLayers,
  payment: IconWallet,
  payments: IconWallet,
  invoices: IconWallet,
  reports: IconReport,
  audit: IconShield,
  settings: IconSettings,
  marketing: IconPulse,
};

/** Grouped sidebar nav — mirrors the WarmPulse admin nav clusters
 *  (nav-config.ts ADMIN_NAV_GROUPS) with the console-only pages folded in. */
const NAV_GROUPS: { group: string; pages: PlatformPage[] }[] = [
  { group: 'Overview', pages: ['overview', 'analytics'] },
  { group: 'Email network', pages: ['mail', 'peers', 'routing'] },
  { group: 'Customers & money', pages: ['users', 'tenants', 'crm', 'plans', 'payment'] },
  { group: 'Management', pages: ['reports', 'audit', 'settings', 'marketing'] },
];

/** Where the rail's state lives, so it is still collapsed on the next visit. */
const RAIL_KEY = 'agentic-ai:sidebar';

function railStartsCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === 'collapsed';
  } catch {
    return false; // storage unavailable: start open, remember for this page only
  }
}

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
    return resolvePlatformPage(r && r.slug === slug ? r.page : 'overview');
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(railStartsCollapsed);

  useEffect(() => {
    // One place decides what an address shows — on arrival and on every
    // back/forward — and puts the real address in its place: a retired one
    // (/addons) or one that moved (/billing → Payment) never stays in the bar,
    // not even when it lands on the page that was already open.
    const sync = () => {
      const r = parseAdminRoute();
      const next = resolvePlatformPage(r && r.slug === slug ? r.page : 'overview');
      setPage(next);
      if (window.location.pathname !== `/${slug}/${next}`) navigateAdmin(slug, next);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [slug]);

  useEffect(() => setMenuOpen(false), [page]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const toggleRail = () =>
    setCollapsed((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(RAIL_KEY, next ? 'collapsed' : 'open');
      } catch {
        /* storage unavailable: the rail still toggles, it just is not remembered */
      }
      return next;
    });

  // the single Payment entry is the open one for each of its three tabs
  const isPayment = (PAYMENT_TABS as readonly string[]).includes(page);
  const isOpen = (p: PlatformPage) => (p === 'payment' ? isPayment : page === p);

  return (
    <div className="app-shell pf-shell">
      <GlassBackdrop />
      <aside className={`sidebar${menuOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`} aria-label="Platform navigation">
        <div className="sidebar-brand-row">
          <a
            href={`/${slug}/overview`}
            className="sidebar-brand"
            aria-label="Go to Overview"
            title={collapsed ? 'WarmPulse — go to Overview' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigateAdmin(slug, 'overview');
              setMenuOpen(false);
            }}
          >
            <img src="/warmpulse-logo.svg" alt="" className="brand-logo" />
            <span className="brand-name">WarmPulse</span>
          </a>
          {/* collapses the rail to icons (wide screens only — on a phone the
              rail is a drawer with its own menu button) */}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleRail}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show the names' : 'Hide the names'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
            </svg>
          </button>
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
                    className={`nav-item${isOpen(p) ? ' active' : ''}`}
                    aria-current={isOpen(p) ? 'page' : undefined}
                    title={collapsed ? LABELS[p] : undefined}
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
          <div className="sidebar-user" title={collapsed ? 'Platform Admin · Super admin' : undefined}>
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
        {/* no top bar on a wide screen (styles: .pf-topbar): the rail already
            shows the brand and the open page. On phones this is only the
            button that opens the rail. */}
        <header className="topbar pf-topbar">
          <button className="menu-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </header>
        <main className="content" id="main" tabIndex={-1}>
          {demo && (
            <p className="pf-demo-note">
              <span className="chip chip-warn">Demo data (read-only)</span>
            </p>
          )}
          <PageErrorBoundary key={page}>
          {page === 'overview' && <OverviewPage />}
          {page === 'analytics' && <PlatformAnalyticsPage />}
          {page === 'peers' && <PeerInboxesPage demo={demo} />}
          {page === 'routing' && <PoolRoutingPage demo={demo} />}
          {page === 'mail' && <MailPage />}
          {page === 'users' && <AdminUsersPage demo={demo} />}
          {page === 'tenants' && <TenantsPage demo={demo} />}
          {page === 'crm' && <CrmManagementPage />}
          {page === 'plans' && <PlansPage demo={demo} />}
          {isPayment && <PaymentPage tab={page as PaymentTab} slug={slug} demo={demo} />}
          {page === 'reports' && <AdminReportsPage />}
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
