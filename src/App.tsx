import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { PipelinePage } from './pages/PipelinePage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { LeadsPage } from './pages/LeadsPage';
import { GuideWidget } from './components/GuideWidget';
import { checkAuth, getCurrentUser, logout } from './lib/api';
import type { PageKey } from './lib/types';

const PAGES: Record<
  PageKey,
  (props: { onNavigate: (p: PageKey) => void; live: boolean; onHome?: () => void }) => JSX.Element
> = {
  dashboard: (props) => <Dashboard {...props} />,
  leads: () => <LeadsPage />,
  pipeline: ({ live }) => <PipelinePage live={live} />,
  settings: () => <SettingsPage />,
};

export default function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [live, setLive] = useState<boolean | null>(null); // null = probing
  // 'checking' → probe; 'login' → auth required; 'app' → signed in (or offline demo)
  const [auth, setAuth] = useState<'checking' | 'login' | 'app'>('checking');
  // Public marketing landing page is the entry point; entering the workspace
  // (Dashboard / Start Free Trial) switches to the existing app flow unchanged.
  const [landing, setLanding] = useState(true);

  useEffect(() => {
    checkAuth().then((state) => {
      setLive(state !== 'mock');
      setAuth(state === 'unauthenticated' ? 'login' : 'app');
    });
  }, []);

  const signOut = () => {
    logout();
    setAuth('login');
  };

  const enterDashboard = () => setLanding(false);

  if (landing) {
    return <LandingPage onEnterDashboard={enterDashboard} />;
  }

  if (auth === 'checking') {
    return (
      <div className="login-wrap">
        <div className="panel login-card" style={{ placeItems: 'center', gap: 12 }}>
          <img src="/shailog-logo.png" alt="Shailog Technologies" className="login-logo" />
          <small className="login-footnote">Connecting to your workspace…</small>
        </div>
      </div>
    );
  }

  // dashboard shows the user profile pinned at the top right
  const DashProfile = () => {
    const [user, setUser] = useState<{ name: string } | null>(null);
    useEffect(() => { getCurrentUser().then((u) => setUser(u ? { name: u.name } : null)); }, []);
    return (
      <div className="dash-profile">
        <span className="avatar" aria-hidden>{(user?.name ?? 'OP').slice(0, 2).toUpperCase()}</span>
        <strong>{user?.name ?? 'operator'}</strong>
      </div>
    );
  };

  if (auth === 'login') {
    return (
      <LoginPage
        onLoggedIn={() => {
          setLive(true);
          setPage('settings'); // signed-in users land on the settings dashboard
          setAuth('app');
        }}
        onHome={() => setLanding(true)}
      />
    );
  }

  const Page = PAGES[page];

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={setPage} open={menuOpen} onClose={() => setMenuOpen(false)} live={live} onLogout={signOut} onHome={() => setLanding(true)} minimal />
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className="main">
        <DashProfile />
        <main className="content">
          <Page onNavigate={setPage} live={live === true} />
        </main>
      </div>
      <GuideWidget />
    </div>
  );
}
