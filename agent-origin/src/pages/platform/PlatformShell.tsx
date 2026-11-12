import { useEffect, useState } from 'react';
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

function parse(hash = window.location.hash): PlatformPage {
  const [root = '', page = ''] = hash.replace(/^#\/?/, '').split('/');
  return root === 'platform' && (PLATFORM_PAGES as readonly string[]).includes(page) ? (page as PlatformPage) : 'overview';
}

export function PlatformShell({ demo, onSignOut }: { demo: boolean; onSignOut: () => void }) {
  const [page, setPage] = useState<PlatformPage>(() => parse());
  useEffect(() => {
    const on = () => setPage(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  // normalise a non-platform hash left over from a tenant session
  useEffect(() => {
    if (!window.location.hash.startsWith('#/platform/')) window.location.hash = `#/platform/${page}`;
  }, [page]);

  return (
    <div className="app-shell pf-shell">
      <aside className="sidebar" aria-label="Platform navigation">
        <div className="pf-brand">
          <img src="/logo.png" alt="" className="brand-logo" />
        </div>
        <nav className="side-nav">
          {PLATFORM_PAGES.map((p) => (
            <a
              key={p}
              href={`#/platform/${p}`}
              className={`nav-item${page === p ? ' active' : ''}`}
              aria-current={page === p ? 'page' : undefined}
            >
              <span>{LABELS[p]}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="btn btn-sm" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-title">Shailog Technologies — Platform console</div>
          {demo && <span className="chip chip-warn">Demo data (read-only)</span>}
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
