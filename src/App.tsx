import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Dashboard } from './pages/Dashboard';
import { PipelinePage } from './pages/PipelinePage';
import { AgentsPage } from './pages/AgentsPage';
import { CrmPage } from './pages/CrmPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { ensureBackend } from './lib/api';
import type { PageKey } from './lib/types';

const PAGES: Record<PageKey, (props: { onNavigate: (p: PageKey) => void; live: boolean }) => JSX.Element> = {
  dashboard: Dashboard,
  pipeline: ({ live }) => <PipelinePage live={live} />,
  agents: () => <AgentsPage />,
  crm: () => <CrmPage />,
  chat: () => <ChatPage />,
  settings: () => <SettingsPage />,
};

export default function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [live, setLive] = useState<boolean | null>(null); // null = probing

  useEffect(() => {
    ensureBackend().then(setLive);
  }, []);

  const Page = PAGES[page];

  return (
    <div className="app-shell">
      <Sidebar page={page} onNavigate={setPage} open={menuOpen} onClose={() => setMenuOpen(false)} live={live} />
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
      <div className="main">
        <TopBar onMenu={() => setMenuOpen(true)} live={live} />
        <main className="content">
          <Page onNavigate={setPage} live={live === true} />
        </main>
      </div>
    </div>
  );
}
