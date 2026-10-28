import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GuideWidget } from './components/GuideWidget';
import { Toaster, toast } from './components/feedback';
import { HomePage } from './pages/HomePage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { LeadsPage } from './pages/LeadsPage';
import { ActivityPage } from './pages/ActivityPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { SESSION_EXPIRED_EVENT, checkAuth, getOnboarding, logout, reprobe } from './lib/api';
import type { AuthState } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { WorkspaceStatusProvider } from './lib/status';

type Gate = 'checking' | AuthState;

export default function App() {
  const [gate, setGate] = useState<Gate>('checking');
  // public marketing page is the entry for signed-out visitors; "Dashboard" /
  // "Start" goes to sign-in (never to open sign-up — accounts are created by the owner)
  const [landing, setLanding] = useState(true);

  const probe = useCallback(async (fresh = false) => {
    setGate('checking');
    if (fresh) await reprobe();
    setGate(await checkAuth());
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  // any 401 mid-session (token revoked/expired) → back to the sign-in screen
  useEffect(() => {
    const onExpired = () => {
      toast.info('Your session ended. Please sign in again.');
      setGate('unauthenticated');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (gate === 'checking') {
    return (
      <div className="login-wrap">
        <div className="panel login-card login-card-center">
          <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
          <span className="spinner" aria-hidden />
          <small className="login-footnote">Connecting to your workspace…</small>
        </div>
        <Toaster />
      </div>
    );
  }

  if (gate === 'offline') {
    return (
      <div className="login-wrap">
        <div className="panel login-card login-card-center" role="alert">
          <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
          <strong className="login-headline">Can't reach your workspace</strong>
          <small className="login-footnote">
            The server didn't answer. It may be restarting. Check your connection and try again.
          </small>
          <button className="btn btn-primary" onClick={() => void probe(true)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (gate === 'unauthenticated' && landing) {
    return <LandingPage onEnterDashboard={() => setLanding(false)} />;
  }

  if (gate === 'unauthenticated') {
    return (
      <>
        <LoginPage onLoggedIn={() => setGate('live')} onHome={() => setLanding(true)} />
        <Toaster />
      </>
    );
  }

  return (
    <WorkspaceStatusProvider>
      <Shell
        demo={gate === 'demo'}
        onSignOut={() => {
          logout();
          setGate('unauthenticated');
        }}
      />
    </WorkspaceStatusProvider>
  );
}

function Shell({ demo, onSignOut }: { demo: boolean; onSignOut: () => void }) {
  const { page, sub } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  // a user whose setup chat is still open lands in the Assistant once
  useEffect(() => {
    if (demo) return;
    getOnboarding()
      .then((state) => {
        if (state?.needed) navigate('assistant');
      })
      .catch(() => undefined);
  }, [demo]);

  useEffect(() => setMenuOpen(false), [page]);

  return (
    <div className="app-shell">
      {/* a button, not #main: the hash router would read that as an unknown page and bounce to Home */}
      <button type="button" className="skip-link" onClick={() => document.getElementById('main')?.focus()}>
        Skip to content
      </button>
      <Sidebar page={page} open={menuOpen} onClose={() => setMenuOpen(false)} demo={demo} onSignOut={onSignOut} />
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className="main">
        <TopBar page={page} onMenu={() => setMenuOpen(true)} demo={demo} />
        <main className="content" id="main" tabIndex={-1}>
          {page === 'home' && <HomePage />}
          {page === 'approvals' && <ApprovalsPage />}
          {page === 'leads' && <LeadsPage tab={sub} />}
          {page === 'activity' && <ActivityPage />}
          {page === 'assistant' && <ChatPage />}
          {page === 'settings' && <SettingsPage section={sub} />}
        </main>
      </div>
      {page !== 'assistant' && <GuideWidget />}
      <Toaster />
    </div>
  );
}
