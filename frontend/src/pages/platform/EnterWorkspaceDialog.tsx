/**
 * "Enter workspace as this user" — the reason, then the new tab.
 *
 * The server answers a single-use ticket; this dialog only opens the tab
 * with it. The ticket is never logged, toasted or shown as text: it lives in
 * the new tab's address (the fragment) and in the link shown when the
 * browser blocked the tab.
 */
import { useEffect, useRef, useState } from 'react';
import { Field } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { toast } from '../../components/feedback';
import { issueImpersonation } from '../../lib/platform';
import type { AccountRow } from '../../lib/platform';
import { displayName } from './accountUi';

/**
 * Where the new tab starts the ticket. It sits in the fragment, which a
 * browser never sends to a server. It is written out in full because the tab
 * it is handed to is still an empty page when it gets the address.
 */
const impersonationUrl = (ticket: string): string => `${window.location.origin}/impersonate#t=${encodeURIComponent(ticket)}`;

/**
 * Opens the tab and says whether the browser let it.
 *
 * `noopener,noreferrer` cannot be asked for: with noopener among the
 * features the browser answers null EVEN WHEN THE TAB OPENED (that is what
 * the HTML standard says), so every success would look like a blocked
 * pop-up. Instead a blank tab is opened — nothing has been loaded in it yet —
 * its opener is cut at once, and only then is the address loaded: the new
 * page gets no opener, and the answer tells a blocked pop-up from a real one.
 */
function openTab(url: string): boolean {
  const tab = window.open('about:blank', '_blank');
  if (!tab) return false;
  tab.opener = null;
  tab.location.replace(url);
  return true;
}

export function EnterWorkspaceDialog({ account, onClose }: { account: AccountRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /** The new tab's address, once the browser refused to open it itself. */
  const [link, setLink] = useState<string | null>(null);
  const alive = useRef(true);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const name = displayName(account);
  const company = account.workspace?.name ?? name;
  const ready = reason.trim().length >= 3;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Esc closes only this dialog. The panel behind it listens for Esc on
  // document as well, so the key is stopped here, one step earlier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

  // the blocked-tab link replaces the reason box, which had the focus
  useEffect(() => {
    if (link) linkRef.current?.focus();
  }, [link]);

  async function go() {
    if (!ready || busy) return;
    setBusy(true);
    const r = await issueImpersonation(account.id, reason.trim());
    // closed while the server answered: the ticket is simply never used
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    if (!r.data.ticket) {
      toast.error('The server did not hand over a way in. Try again.');
      return;
    }
    const url = impersonationUrl(r.data.ticket);
    if (!openTab(url)) {
      setLink(url);
      return;
    }
    toast.success(`Opened ${company} as ${name} in a new tab. It lasts 60 minutes.`);
    onClose();
  }

  return (
    <Modal
      title="Enter workspace as this user"
      onClose={onClose}
      footer={
        link ? (
          <button className="btn" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <span className="spacer" />
            <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void go()}>
              {busy ? 'Opening…' : 'Open the workspace'}
            </button>
          </>
        )
      }
    >
      <p>{`Opens ${company} in a new tab as ${name}. It lasts 60 minutes, and everything you do there is recorded under your name.`}</p>
      {link ? (
        <div className="banner banner-warn" role="alert" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, marginBottom: 0 }}>
          <strong>Your browser blocked the new tab. Use this link.</strong>
          <a
            ref={linkRef}
            className="btn btn-primary"
            style={{ alignSelf: 'center' }}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the workspace
          </a>
        </div>
      ) : (
        <Field label="Why are you entering? (recorded)" hint="Write at least 3 characters.">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            aria-label="Why are you entering? (recorded)"
            data-autofocus
          />
        </Field>
      )}
    </Modal>
  );
}
