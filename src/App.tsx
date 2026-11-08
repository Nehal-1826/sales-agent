import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GuideWidget } from './components/GuideWidget';
import { Banner, Toaster, toast } from './components/feedback';
import { HomePage } from './pages/HomePage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { RepliesPage } from './pages/RepliesPage';
import { TasksPage } from './pages/TasksPage';
import { LeadsPage } from './pages/LeadsPage';
import { ActivityPage } from './pages/ActivityPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { LandingPage } from './pages/LandingPage';
import { MarketingPage, isMarketingSubpage } from './marketing/MarketingSite';
import { routeMeta } from './marketing/site';
import { PAYMENT_REQUIRED_EVENT, SESSION_EXPIRED_EVENT, checkAuth, getOnboarding, logout, reprobe } from './lib/api';
import type { AuthState, PaymentRequiredInfo } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { WorkspaceStatusProvider } from './lib/status';

type Gate = 'checking' | AuthState;

/** Public, prerendered marketing pages (/pricing, /privacy …) render without the auth gate. */
export default function App() {
  const path = window.location.pathname;
  if (isMarketingSubpage(path)) return <MarketingPage path={routeMeta(path)!.path} />;
  return <AppGate />;
}

/** A stored session token means "probably signed in": keep the spinner instead of flashing the landing page. */
function hasStoredToken(): boolean {
  try {
    return !!localStorage.getItem('agentic-ai:token'); // same key as lib/transport.ts
  } catch {
    return false;
  }
}

/** Marketing links send visitors to /?signin=1 to open the sign-in screen directly. */
function wantsSignIn(): boolean {
  return new URLSearchParams(window.location.search).has('signin');
}

/** Marketing CTAs send visitors to /?signup=1&plan=…&interval=… */
function wantsSignup(): boolean {
  return new URLSearchParams(window.location.search).has('signup');
}

function verifyToken(): string {
  return new URLSearchParams(window.location.search).get('verify') ?? '';
}

function AppGate() {
  const [gate, setGate] = useState<Gate>('checking');
  const [signingUp, setSigningUp] = useState(wantsSignup);
  const [verifying, setVerifying] = useState(verifyToken);
  // public marketing page is the entry for signed-out visitors; "Dashboard" /
  // "Start" goes to sign-in (never to open sign-up — accounts are created by the owner)
  const [landing, setLanding] = useState(() => !wantsSignIn() && !wantsSignup());

  const probe = useCallback(async (fresh = false) => {
    setGate('checking');
    if (fresh) await reprobe();
    setGate(await checkAuth());
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  // drop ?signin=1 from the address bar once read
  useEffect(() => {
    if (wantsSignIn()) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, []);

  // any 401 mid-session (token revoked/expired) → back to the sign-in screen
  useEffect(() => {
    const onExpired = () => {
      toast.info('Your session ended. Please sign in again.');
      setGate('unauthenticated');
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (verifying) return (
    <>
      <VerifyEmailPage token={verifying} onDone={() => { setVerifying(''); void probe(); }} />
      <Toaster />
    </>
  );

  // signed-out visitors see the (prerendered) landing page at once, not a spinner;
  // same element as the 'unauthenticated' branch below, so React keeps it mounted
  if (gate === 'checking' && landing && !hasStoredToken()) {
    return <LandingPage onEnterDashboard={() => setLanding(false)} />;
  }

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

  // the public landing page never depends on the API: a signed-out visitor keeps
  // seeing it while the backend is down; only "Sign in" reaches the offline screen
  if (gate === 'offline' && landing && !hasStoredToken()) {
    return <LandingPage onEnterDashboard={() => setLanding(false)} />;
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

  if (gate === 'unauthenticated' && signingUp) {
    return (
      <>
        <SignupPage
          onHome={() => { setSigningUp(false); setLanding(true); }}
          onSignIn={() => { setSigningUp(false); setLanding(false); }}
          onSignedUp={() => { setSigningUp(false); void probe(); }}
        />
        <Toaster />
      </>
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
  const [paywalled, setPaywalled] = useState(false);

  // HTTP 402 from any call: quota → toast; payment_required → persistent banner
  useEffect(() => {
    const onPay = (e: Event) => {
      const info = (e as CustomEvent<PaymentRequiredInfo>).detail;
      if (info?.error === 'quota_exceeded') {
        toast.warn(`Plan limit reached: ${info.meter} (${info.used} of ${info.limit}). Upgrade in Plan & billing.`);
      } else {
        setPaywalled(true);
      }
    };
    window.addEventListener(PAYMENT_REQUIRED_EVENT, onPay);
    return () => window.removeEventListener(PAYMENT_REQUIRED_EVENT, onPay);
  }, []);

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
        {paywalled && (
          <Banner
            tone="warn"
            title="A paid plan is needed to make changes"
            action={
              <button className="btn btn-sm btn-primary" onClick={() => { setPaywalled(false); navigate('settings', 'billing'); }}>
                Go to billing
              </button>
            }
          >
            You can still look around. Choose a plan to start finding leads and sending emails.
          </Banner>
        )}
        <main className="content" id="main" tabIndex={-1}>
          {page === 'home' && <HomePage />}
          {page === 'approvals' && <ApprovalsPage />}
          {page === 'replies' && <RepliesPage />}
          {page === 'tasks' && <TasksPage />}
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
