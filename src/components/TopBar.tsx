import { StatusDot } from './ui';

export function TopBar({ onMenu, live }: { onMenu: () => void; live: boolean | null }) {
  return (
    <div className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Open navigation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="topbar-title">Marketing &amp; Sales Agentic AI</div>
      <div className="topbar-status">
        <span className="chip chip-success">
          <StatusDot tone="success" pulse />
          System Status: Running
        </span>
        {live === null && <span className="chip">Connecting…</span>}
        {live === true && (
          <span className="chip chip-accent">
            <StatusDot tone="accent" />
            Backend: Live · Django
          </span>
        )}
        {live === false && <span className="chip">Mock mode</span>}
      </div>
    </div>
  );
}
