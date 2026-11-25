import { useLayoutEffect, useRef } from 'react';
import type { ImpersonatedMe } from '../lib/impersonation';

/** "14:32" — the end time on the clock of the computer the admin is using. */
function clock(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * The bar at the very top of the "enter as user" tab: whose workspace this is,
 * who the admin is inside as, who opened it, when it ends — and the way out.
 *
 * It sits ABOVE the workspace shell as a normal (sticky) element, so it is
 * always the first thing on screen and nothing of the app starts underneath
 * it. While it shows, <body> carries `has-impersonation` and
 * `--impersonation-bar` holds the bar's real height (the text wraps on a
 * phone): the fixed and sticky chrome makes room for exactly that. Those
 * rules are at the very end of styles.css.
 */
export function ImpersonationBanner({ me, onExit }: { me: ImpersonatedMe; onExit: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const { admin, workspace, ends_at } = me.impersonation;
  // the person's own name when they gave one (else the server sends the username)
  const person = me.impersonation.name || me.username || '';
  const ends = clock(ends_at);

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    // before the first paint, and again whenever the bar changes height
    const fit = () => document.body.style.setProperty('--impersonation-bar', `${el.offsetHeight}px`);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    document.body.classList.add('has-impersonation');
    return () => {
      observer.disconnect();
      document.body.classList.remove('has-impersonation');
      document.body.style.removeProperty('--impersonation-bar');
    };
  }, []);

  return (
    <div className="impersonation-bar" role="status" ref={bar}>
      <p className="impersonation-bar-text">
        You are inside <strong>{workspace.name}</strong> as <strong>{person}</strong>. Opened by {admin}. Ends at{' '}
        <time className="impersonation-bar-time" dateTime={ends_at}>{ends}</time>.
      </p>
      <button type="button" className="btn btn-sm" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}
