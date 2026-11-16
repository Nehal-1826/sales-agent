import { useEffect, useRef, useState } from 'react';
import { IconCheck } from '../../components/icons';
import type { WebmailAccount } from '../../lib/webmail';
import { initials } from './helpers';

/** Unreachable per the account row itself (G1's purpose-built signal) or a
 *  folder-list failure this session observed — either earns the chip. */
function unreachableReason(a: WebmailAccount, degraded: Record<number, string>): string | null {
  if (a.unreachable || a.error) return a.error ?? 'IMAP connection failed.';
  return degraded[a.id] ?? null;
}

/**
 * Account-switcher pill (avatar + active email + chevron) with a popover
 * listing every webmail account: unread badges, primary check and an
 * "unreachable" chip on ANY account the server flagged (or whose folder
 * list failed here) — not just the active one.
 */
export function AccountSwitcher({
  accounts,
  activeId,
  degraded,
  onSelect,
}: {
  accounts: WebmailAccount[];
  activeId: number | null;
  degraded: Record<number, string>;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="wm-switcher" ref={root}>
      <button
        type="button"
        className="wm-switcher-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={active ? `Reading ${active.email}` : 'Choose an account'}
      >
        <span className="avatar wm-avatar" aria-hidden>
          {active ? initials(active.email) : '··'}
        </span>
        <span className="wm-switcher-email">{active?.email ?? 'No account'}</span>
        {active && (active.unread ?? 0) > 0 && (
          <span className="wm-unread-badge">{(active.unread ?? 0) > 99 ? '99+' : active.unread}</span>
        )}
        <svg className={`wm-chevron${open ? ' open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="wm-switcher-pop" role="listbox" aria-label="Mail accounts">
          {accounts.map((a) => {
            const err = unreachableReason(a, degraded);
            const unread = a.unread ?? 0;
            return (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={a.id === activeId}
                className={`wm-switcher-item${a.id === activeId ? ' active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (a.id !== activeId) onSelect(a.id);
                }}
              >
                <span className="avatar wm-avatar" aria-hidden>
                  {initials(a.email)}
                </span>
                <span className="wm-switcher-meta">
                  <span className="wm-switcher-email">{a.email}</span>
                  <small>
                    {a.provider}
                    {a.is_primary ? ' · primary' : ''}
                  </small>
                  {err && <span className="wm-account-error" title={err}>unreachable</span>}
                </span>
                {unread > 0 && <span className="wm-unread-badge">{unread > 99 ? '99+' : unread}</span>}
                {a.id === activeId && <IconCheck size={16} className="wm-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
