import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GlassBackdrop } from '../components/Lightfall';
import LatticeLoader from '../components/reactbits/LatticeLoader';
import { ImpersonationBanner } from '../components/ImpersonationBanner';
import { ApiError, errorMessage } from '../lib/api';
import {
  IMPERSONATION_ENDED_EVENT,
  endImpersonation,
  getImpersonationTicket,
  hasImpersonation,
  isImpersonatePath,
  setImpersonationTicket,
  startImpersonation,
} from '../lib/impersonation';
import type { ImpersonatedMe } from '../lib/impersonation';
import { getMe } from '../lib/platform';
import { WorkspaceStatusProvider } from '../lib/status';

type Phase =
  | { kind: 'starting' }
  | { kind: 'live'; me: ImpersonatedMe }
  | { kind: 'no-ticket' }
  | { kind: 'exited'; workspace: string }
  | { kind: 'ended' }
  | { kind: 'unreachable'; message: string };

const NOT_REACHED = "Couldn't reach your workspace. Check your connection and try again.";

/**
 * The "enter as user" tab — a platform admin inside a customer's workspace.
 *
 * App renders this, and nothing of its own, for the whole life of that tab,
 * on every address: the ticket sits in sessionStorage, so a refresh of any
 * in-app path brings the same tab back — never the admin's own console or the
 * landing page.
 *
 *   /impersonate#t=<ticket>    the console just opened it: start the ticket
 *   any other path              a refresh inside the tab: the same person again
 *   no ticket, or a dead one    one plain card — nothing else on the page
 *
 * `renderShell` draws the workspace (App's Shell) with the tab's own sign-out;
 * it is passed in rather than imported so this page need not import App.
 */
export function ImpersonatePage({ renderShell }: { renderShell: (onSignOut: () => void) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' });
  const booted = useRef(false);

  const goLive = useCallback((me: ImpersonatedMe) => {
    // from here on the tab's address is the workspace home
    if (isImpersonatePath(window.location.pathname)) window.history.replaceState(null, '', '/');
    setPhase({ kind: 'live', me });
  }, []);

  // a refresh inside the tab: the ticket is still in sessionStorage, so one
  // normal request (it carries the ticket) says who the tab is signed in as
  const resume = useCallback(async () => {
    try {
      const profile = await getMe();
      if (!hasImpersonation(profile)) {
        // not a ticket session — the offline demo answers with a made-up profile
        setPhase({ kind: 'unreachable', message: NOT_REACHED });
        return;
      }
      goLive(profile);
    } catch (e) {
      // a 401 means the ticket is dead: transport has already dropped it
      if (e instanceof ApiError && e.status === 401) setPhase({ kind: 'ended' });
      else setPhase({ kind: 'unreachable', message: errorMessage(e) });
    }
  }, [goLive]);

  // /impersonate#t=<ticket>: a ticket starts exactly once — the server refuses
  // a second start — so this must run once per tab, never per mount
  const open = useCallback(
    async (ticket: string) => {
      const res = await startImpersonation(ticket);
      if (res.ok) {
        if (hasImpersonation(res.data)) goLive(res.data);
        // the server answered, but not with the customer's profile
        else setPhase({ kind: 'unreachable', message: NOT_REACHED });
        return;
      }
      if (res.status === 400 && res.code === 'ticket_used') {
        // already started — by this very tab, when the answer to its first
        // start was lost on the way back and "Try again" was pressed
        await resume();
        return;
      }
      if (res.status === 400) {
        // not valid, or older than its 10 minutes: the link is spent
        setImpersonationTicket(null);
        setPhase({ kind: 'no-ticket' });
        return;
      }
      // the server was not reached, or did not answer properly: the ticket is
      // still good for its 10 minutes, so it stays and one more try can start it
      setPhase({ kind: 'unreachable', message: res.error });
    },
    [goLive, resume],
  );

  // the ticket died while the tab was open (its 60 minutes ran out, or it was
  // ended elsewhere): transport has already dropped it and told this page
  useEffect(() => {
    const onEnded = () => setPhase((p) => (p.kind === 'live' || p.kind === 'starting' ? { kind: 'ended' } : p));
    window.addEventListener(IMPERSONATION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(IMPERSONATION_ENDED_EVENT, onEnded);
  }, []);

  useEffect(() => {
    // React StrictMode (a dev build) mounts, unmounts and mounts again: this
    // tab decides what it is exactly once
    if (booted.current) return;
    booted.current = true;
    // the fragment never reaches the server — and it leaves the address bar at once
    const handed = new URLSearchParams(window.location.hash.slice(1)).get('t');
    if (handed) {
      setImpersonationTicket(handed);
      window.history.replaceState(null, '', '/impersonate');
    }
    const ticket = handed || getImpersonationTicket();
    if (!ticket) setPhase({ kind: 'no-ticket' });
    else if (handed || isImpersonatePath(window.location.pathname)) void open(ticket);
    else void resume();
  }, [open, resume]);

  // Exit on the bar and the sidebar's own "Sign out" end the ticket and nothing
  // else: this page stays (never the landing or the sign-in page) and the
  // admin's own session is never touched
  const exit = useCallback(() => {
    // sent before the ticket is dropped, so the request still carries it
    void endImpersonation();
    setImpersonationTicket(null);
    setPhase((p) => ({ kind: 'exited', workspace: p.kind === 'live' ? p.me.impersonation.workspace.name : '' }));
  }, []);

  if (phase.kind === 'live') {
    return (
      <WorkspaceStatusProvider>
        {/* on every page of this tab: beside the shell, never inside a page */}
        <ImpersonationBanner me={phase.me} onExit={exit} />
        {renderShell(exit)}
      </WorkspaceStatusProvider>
    );
  }

  if (phase.kind === 'starting') {
    return (
      <Card>
        <LatticeLoader label="Opening the workspace…" cellSize={7} color="var(--accent)" showTimer={false} />
      </Card>
    );
  }

  // the server did not answer (or not with the customer's profile): the ticket
  // is still good, so asking again is all it takes
  if (phase.kind === 'unreachable') {
    return (
      <Card role="alert">
        <strong className="login-headline">Can't reach your workspace</strong>
        <small className="login-footnote">{phase.message}</small>
        <button
          className="btn btn-primary"
          onClick={() => {
            setPhase({ kind: 'starting' });
            // a ticket that never started is started now; a running one is asked who it is
            const ticket = getImpersonationTicket();
            if (!ticket) setPhase({ kind: 'no-ticket' });
            else if (isImpersonatePath(window.location.pathname)) void open(ticket);
            else void resume();
          }}
        >
          Try again
        </button>
      </Card>
    );
  }

  const notice =
    phase.kind === 'exited'
      ? `You have exited ${phase.workspace}. You can close this tab.`
      : phase.kind === 'ended'
        ? 'This session has ended. You can close this tab.'
        : 'This link to enter as a user has expired or was already used. Close this tab and start again from the console.';
  return (
    <Card role="status">
      <p className="login-headline impersonation-notice">{notice}</p>
    </Card>
  );
}

/** The plain centred card of the sign-in flow — and nothing else on the page. */
function Card({ children, role }: { children: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className="login-wrap">
      <GlassBackdrop />
      <div className="panel login-card login-card-center" role={role}>
        <img src="/warmpulse-logo.svg" alt="WarmPulse" className="login-logo" />
        {children}
      </div>
    </div>
  );
}
