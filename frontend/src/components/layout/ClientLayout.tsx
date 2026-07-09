import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { AuthGuard } from './AuthGuard';
import { ClientPillSidebar } from './ClientPillSidebar';
import { PageTransition } from '@/components/brand/RouteLoader';
import { DnsGateScreen } from '@/components/DnsGateScreen';
import { useDnsGate } from '@/lib/useDnsGate';
import '@/pages/landing/hero-theme.css';
import './admin-shell.css';

/** Routes that remain reachable while the DNS gate is active. */
const DNS_GATE_ALLOWLIST = ['/app/settings', '/app/mailboxes'];

function isAllowedDuringGate(pathname: string): boolean {
  return DNS_GATE_ALLOWLIST.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const DNS_BANNER_DISMISS_KEY = 'warmpulse.dnsGateBanner.dismissed';

function DnsGateBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(DNS_BANNER_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-accent3/30 bg-accent3/15 px-4 py-2 text-sm text-text backdrop-blur">
      <AlertTriangle size={16} strokeWidth={2} className="shrink-0 text-accent3" />
      <span className="flex-1">
        DNS records pending — your warmup is paused until SPF/DKIM/DMARC are
        published.{' '}
        <Link to="/app/mailboxes" className="font-medium text-accent underline">
          Go to Mailboxes to re-check
        </Link>
        .
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(DNS_BANNER_DISMISS_KEY, '1');
          } catch {
            /* ignore */
          }
        }}
        className="rounded p-1 text-text-dim hover:bg-surface-2 hover:text-text"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Client shell — same as admin: floating glass-pill sidebar on the left
 * edge (icons only with hover tooltips), atmospheric gradient + dotted-
 * grid background, full-bleed main area. No TopBar — logout, brand and
 * navigation all live on the pill itself, identical to /admin/*.
 *
 * App-wide DNS gate: when the primary mailbox has failing SPF/DKIM/DMARC
 * we replace the route content with <DnsGateScreen> for any path outside
 * the allowlist (settings + mailboxes). On allowed pages we render a
 * sticky yellow strip explaining the situation.
 */
export function ClientLayout() {
  const { pathname } = useLocation();
  const { gateActive, mailbox, isLoading } = useDnsGate();

  const allowed = isAllowedDuringGate(pathname);
  // Don't block while the mailbox list is still loading — paints fast and
  // avoids a flash of the gate screen before data lands.
  const blockRoute = gateActive && !allowed && !isLoading;
  const showBanner = gateActive && allowed && !isLoading;

  return (
    <AuthGuard>
      <div className="admin-shell client-shell">
        <div className="admin-shell__atmosphere" aria-hidden>
          <div className="admin-shell__aurora-1" />
          <div className="admin-shell__aurora-2" />
          <div className="admin-shell__grid" />
        </div>
        <ClientPillSidebar />
        <main className="admin-shell__main pb-16">
          {showBanner ? <DnsGateBanner /> : null}
          <PageTransition pathKey={blockRoute ? '__dns_gate__' : pathname}>
            {blockRoute ? <DnsGateScreen mailbox={mailbox} /> : <Outlet />}
          </PageTransition>
        </main>
        <footer className="fixed bottom-0 left-0 right-0 border-t border-white/[0.06] py-3 bg-bg/90 backdrop-blur-xl z-20">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 text-xs text-text-dim">
            <span>© {new Date().getFullYear()} WarmPulse. All rights reserved.</span>
            <div className="flex items-center gap-4">
              <Link to="/privacy" className="hover:text-text">Privacy</Link>
              <Link to="/terms" className="hover:text-text">Terms</Link>
            </div>
          </div>
        </footer>
      </div>
    </AuthGuard>
  );
}
