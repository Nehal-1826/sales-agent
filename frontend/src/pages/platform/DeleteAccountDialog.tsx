/**
 * "Delete account" — the typed e-mail address and the reason, then the call.
 *
 * A deleted account can be brought back for 30 days. The server decides
 * everything (who may be deleted, whether the workspace stops with its last
 * owner or admin) and answers in its own words when it refuses. This dialog
 * says beforehand what is about to happen, and it stays until the server has
 * answered, so that answer is always seen.
 */
import { useEffect, useRef, useState } from 'react';
import { Field } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { toast } from '../../components/feedback';
import { deletePlatformUser } from '../../lib/platform';
import type { AccountRow } from '../../lib/platform';
import { displayName, emailKey } from './accountUi';

export function DeleteAccountDialog({
  account,
  onClose,
  onDone,
}: {
  account: AccountRow;
  onClose: () => void;
  /** The account is deleted — the lists behind are read again. */
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const name = displayName(account);
  const company = account.workspace?.name ?? name;

  // The server's own rule (core.accounts.delete_account), read beforehand:
  // the workspace stops when no owner or admin who is neither deleted nor
  // switched off is LEFT — `workspace_admins` counts those, this account
  // included. So for an owner or admin 1 means "the last one"; for anyone
  // else it stops only when there is none at all. When it stops, the other
  // accounts in it are deleted in the same moment.
  const runsIt = account.role === 'owner' || account.role === 'admin';
  const stopsWorkspace = account.workspace_admins <= (runsIt ? 1 : 0);
  const others = Math.max(account.workspace_accounts - 1, 0);
  const warning = stopsWorkspace
    ? `${name} is the last owner or admin of ${company}, so the whole workspace stops: lead finding and e-mails stop straight away.${
        others > 0
          ? ` The other ${others} account${others === 1 ? '' : 's'} in it ${others === 1 ? 'is' : 'are'} deleted too. Each one can be brought back on its own.`
          : ''
      }`
    : null;

  // the e-mail is compared the way the server compares it: case and spaces forgiven
  const ready = typed.trim() !== '' && emailKey(typed) === emailKey(account.email) && reason.trim().length >= 3;

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

  async function go() {
    if (!ready || busy) return;
    setBusy(true);
    const r = await deletePlatformUser(account.id, { reason: reason.trim(), confirmEmail: typed.trim() });
    // gone before the server answered: nothing is left here to tell
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Account deleted.${r.data.workspace_stopped ? ' The workspace stopped with it.' : ''}`);
    onDone();
  }

  return (
    <Modal
      title="Delete this account?"
      // the close button and a click outside are looked at here too: while
      // the server works, the dialog is the one place its answer will show
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <span className="spacer" />
          <button className="btn btn-danger" disabled={!ready || busy} onClick={() => void go()}>
            {busy ? 'Deleting…' : 'Delete account'}
          </button>
        </>
      }
    >
      <p>{`This signs ${name} out at once and removes their account from ${company}. It can be brought back for 30 days; after that it is removed for good.`}</p>
      {warning && (
        <div className="banner banner-warn" role="alert" style={{ marginTop: 12 }}>
          {warning}
        </div>
      )}
      <p style={{ marginBottom: 10 }}>
        To confirm, type their e-mail address: <strong>{account.email}</strong>
      </p>
      <Field label="Type their e-mail address to confirm">
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-label="Type their e-mail address to confirm"
          data-autofocus
        />
      </Field>
      <Field label="Why are you deleting it? (recorded)" hint="Write at least 3 characters.">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          aria-label="Why are you deleting it? (recorded)"
        />
      </Field>
    </Modal>
  );
}
