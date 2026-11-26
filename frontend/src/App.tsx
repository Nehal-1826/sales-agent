import { useCallback, useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { GlassBackdrop } from './components/Lightfall';
import LatticeLoader from './components/reactbits/LatticeLoader';
import { GuideWidget } from './components/GuideWidget';
import { Tutor } from './components/Tutor';
import { Banner, Toaster, toast } from './components/feedback';
import { HomePage } from './pages/HomePage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { RepliesPage } from './pages/RepliesPage';
import { TasksPage } from './pages/TasksPage';
import { LeadsPage } from './pages/LeadsPage';
import { ActivityPage } from './pages/ActivityPage';
import { ChatPage } from './pages/ChatPage';
import { WarmupPage } from './pages/WarmupPage';
import { MailPage } from './pages/MailPage';
import { SettingsPage } from './pages/SettingsPage';
import { FormatScope } from './components/FormatScope';
import { LoginPage } from './pages/LoginPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { ImpersonatePage } from './pages/ImpersonatePage';
import { SignupPage } from './pages/SignupPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { LandingPage } from './pages/LandingPage';
import { MarketingPage, isMarketingSubpage } from './marketing/MarketingSite';
import { routeMeta } from './marketing/site';
import { PAYMENT_REQUIRED_EVENT, SESSION_EXPIRED_EVENT, checkAuth, getOnboarding, logout, reprobe } from './lib/api';
import type { AuthState, PaymentRequiredInfo } from './lib/api';
import { navigate, useRoute } from './lib/router';
import { WorkspaceStatusProvider } from './lib/status';
import { isImpersonatePath, isImpersonating } from './lib/impersonation';
import { getMe } from './lib/platform';
import type { Me } from './lib/platform';
import { PlatformShell } from './pages/platform/PlatformShell';
import { TotpScreen } from './pages/platform/TotpScreen';

type Gate = 'checking' | AuthState;

/** Public, prerendered marketing pages (/pricing, /privacy …) render without the auth gate. */
export default function App() {
  const path = window.location.pathname;
  // The home file also serves every app route and carries the pre-rendered
  // marketing page; the page template hides it before the first paint when
  // this browser is signed in (index.html) and shows a plain loading mark.
  // The app has now drawn its first screen — whatever it is — so let it show.
  useEffect(() => {
    document.documentElement.removeAttribute('data-session');
    document.getElementById('boot')?.remove();
  }, []);
  // The "enter as user" tab — a platform admin inside a customer's workspace —
  // is this page and nothing else, on every address. The ticket sits in
  // sessionStorage, so a refresh of any in-app path brings the same tab back:
  // never the admin's own console, never the landing page. Shell is handed in
  // as a prop (not imported by the page) so the two files do not import each other.
  if (isImpersonating() || isImpersonatePath(path)) {
    return <ImpersonatePage renderShell={(onSignOut) => <Shell demo={false} onSignOut={onSignOut} />} />;
  }
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
    if (wantsSignIn()) window.history.replaceState(null, '', window.location.pathname);
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

  // /<6-digits>… URLs are the admin console door: the marketing page never
  // renders there, and a signed-out visitor gets the admin login screen
  const slugMatch = window.location.pathname.match(/^\/(\d{6})/);
  if (gate === 'unauthenticated' && slugMatch) {
    // slug URL while signed out → the admin's own login door
    if (window.location.pathname !== `/${slugMatch[1]}/login`)
      window.history.replaceState(null, '', `/${slugMatch[1]}/login`);
    return (
      <>
        <AdminLoginPage
          slug={slugMatch[1]}
          onLoggedIn={() => void probe(true)}
          onHome={() => { window.location.href = '/'; }}
        />
        <Toaster />
      </>
    );
  }

  // signed-out visitors see the (prerendered) landing page at once, not a spinner;
  // same element as the 'unauthenticated' branch below, so React keeps it mounted
  if (gate === 'checking' && landing && !hasStoredToken() && !slugMatch) {
    return <LandingPage onEnterDashboard={() => setLanding(false)} />;
  }

  if (gate === 'checking') {
    return (
      <div className="login-wrap">
        <GlassBackdrop />
        <div className="panel login-card login-card-center">
          <img src="/warmpulse-logo.svg" alt="WarmPulse" className="login-logo" />
          <LatticeLoader label="Connecting to your workspace…" cellSize={7} color="var(--accent)" showTimer={false} />
        </div>
        <Toaster />
      </div>
    );
  }

  // the public landing page never depends on the API: a signed-out visitor keeps
  // seeing it while the backend is down; only "Sign in" reaches the offline screen
  if (gate === 'offline' && landing && !hasStoredToken() && !slugMatch) {
    return <LandingPage onEnterDashboard={() => setLanding(false)} />;
  }

  if (gate === 'offline') {
    return (
      <div className="login-wrap">
        <GlassBackdrop />
        <div className="panel login-card login-card-center" role="alert">
          <img src="/warmpulse-logo.svg" alt="WarmPulse" className="login-logo" />
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
    <RoleGate
      demo={gate === 'demo'}
      onSignOut={() => {
        logout();
        // sign-out lands on the sign-in screen, never back on marketing —
        // with path-router deep links the shell can mount while `landing`
        // is still true (no Sign-in click ever flipped it)
        setLanding(false);
        setGate('unauthenticated');
      }}
    />
  );
}

/** Platform admins have no workspace: they get the platform console instead of the tenant shell. */
function RoleGate({ demo, onSignOut }: { demo: boolean; onSignOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  // Admin slug: /<6-digits>/<page> — validated on every load, stays in the URL
  const [adminSlug, setAdminSlug] = useState<string | null>(() => {
    const m = window.location.pathname.match(/^\/(\d{6})/);
    return m ? m[1] : null;
  });
  // null = slug check still in flight (loading) — never show 404 before it settles
  const [slugVerified, setSlugVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (adminSlug === null) return;
    void (async () => {
      try {
        const res = await fetch('/api/admin-slug/check/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: adminSlug }),
        });
        setSlugVerified(res.ok);
        if (!res.ok) document.title = '404';
      } catch {
        setSlugVerified(false);
      }
    })();
  }, [adminSlug]);

  // Re-detect slug on back/forward navigation
  useEffect(() => {
    const on = () => {
      const m = window.location.pathname.match(/^\/(\d{6})/);
      const next = m ? m[1] : null;
      if (next !== adminSlug) {
        setAdminSlug(next);
        // back to "checking" until the new slug is validated — not the 404 flash
        setSlugVerified(null);
      }
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, [adminSlug]);

  const load = useCallback(() => {
    setFailed(false);
    getMe().then(setMe).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) {
    return (
      <div className="login-wrap">
        <GlassBackdrop />
        <div className="panel login-card login-card-center" role="alert">
          <strong className="login-headline">Couldn't load your account</strong>
          <button className="btn btn-primary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="login-wrap">
        <GlassBackdrop />
        <div className="panel login-card login-card-center">
          <LatticeLoader label="Loading your account…" cellSize={7} color="var(--accent)" showTimer={false} />
        </div>
      </div>
    );
  }
  if (me.otp_required) {
    return (
      <>
        <TotpScreen
          isAdmin={!!me.platform_admin}
          onVerified={load}
          onSignOut={onSignOut}
        />
        <Toaster />
      </>
    );
  }
  // Admin console: ONLY renders when the URL carries a verified 6-digit slug
  if (me.platform_admin) {
    if (adminSlug !== null && slugVerified === null) {
      // slug check in flight — neither the console nor the 404 is decided yet
      return (
        <div className="login-wrap">
          <GlassBackdrop />
          <div className="panel login-card login-card-center">
            <LatticeLoader label="Opening the platform console…" cellSize={7} color="var(--accent)" showTimer={false} />
          </div>
        </div>
      );
    }
    if (adminSlug !== null && slugVerified === false) {
      // wrong slug in URL → 404
      return (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#0a0b0d', color: '#9aa0aa', fontFamily: 'system-ui' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 700, color: '#e8e9ec' }}>404</div>
            <div style={{ marginTop: 8 }}>Page not found</div>
          </div>
        </div>
      );
    }
    if (adminSlug !== null && slugVerified === true) {
      return <PlatformShell demo={demo} onSignOut={onSignOut} slug={adminSlug} />;
    }
    // no slug in URL → admin sees the regular workspace, not the console
  }
  return (
    <WorkspaceStatusProvider>
      <Shell demo={demo} onSignOut={onSignOut} />
    </WorkspaceStatusProvider>
  );
}

function Shell({ demo, onSignOut }: { demo: boolean; onSignOut: () => void }) {
  const { page, sub } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paywalled, setPaywalled] = useState(false);
  // inside the "enter as user" tab the setup chat and the product tour belong
  // to the customer: skipping the wizard would switch their autopilot on
  const inside = isImpersonating();

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

  // a user whose setup chat is still open lands in the Assistant once — but
  // never hijack an explicit destination: a deep link (#/warmup, #/replies…)
  // or an in-flight click must win over the auto-landing.
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => {
    if (demo || inside) return;
    getOnboarding()
      .then((state) => {
        if (state?.needed && pageRef.current === 'home') navigate('assistant');
      })
      .catch(() => undefined);
  }, [demo, inside]);

  useEffect(() => setMenuOpen(false), [page]);

  return (
    <div className="app-shell">
      <GlassBackdrop />
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
          {/* every page draws again the moment the person changes their format */}
          <FormatScope>
            {() => (
              <>
                {page === 'home' && <HomePage />}
                {page === 'approvals' && <ApprovalsPage />}
                {page === 'replies' && <RepliesPage />}
                {page === 'tasks' && <TasksPage />}
                {page === 'leads' && <LeadsPage tab={sub} />}
                {page === 'activity' && <ActivityPage />}
                {page === 'assistant' && <ChatPage />}
                {page === 'warmup' && <WarmupPage />}
                {page === 'mail' && <MailPage />}
                {page === 'settings' && <SettingsPage section={sub} />}
              </>
            )}
          </FormatScope>
        </main>
      </div>
      {page !== 'assistant' && <GuideWidget />}
      {!inside && <Tutor />}
      <Toaster />
    </div>
  );
}
