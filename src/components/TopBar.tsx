import { AutopilotPill } from './AutopilotPill';
import { useWorkspaceStatus } from '../lib/status';
import type { PageKey } from '../lib/types';

const TITLES: Record<PageKey, string> = {
  home: 'Home',
  approvals: 'Approvals',
  leads: 'Leads',
  activity: 'Activity',
  assistant: 'Assistant',
  settings: 'Settings',
};

export function TopBar({ page, onMenu, demo }: { page: PageKey; onMenu: () => void; demo: boolean }) {
  const { pipeline, startCycle } = useWorkspaceStatus();
  const running = !!pipeline?.cycleRunning;

  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Open navigation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="topbar-title">{TITLES[page]}</div>
      <div className="topbar-actions">
        <AutopilotPill demo={demo} compact />
        <button
          className="btn btn-primary btn-sm topbar-run"
          onClick={() => void startCycle()}
          disabled={running || demo || !pipeline}
          title={running ? 'A search is already running' : 'Find and research new companies now'}
        >
          {running ? 'Searching…' : 'Find leads now'}
        </button>
      </div>
    </header>
  );
}
