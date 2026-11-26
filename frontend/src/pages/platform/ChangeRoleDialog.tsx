/**
 * "Change role" — says what the change means for the person, takes the
 * reason, then makes the call.
 *
 * The server decides everything (whose role may change, whether an owner or a
 * super admin is left, whether the plan has a seat) and answers in its own
 * words when it refuses. This dialog says beforehand what is about to happen,
 * and it stays until the server has answered, so that answer is always seen.
 *
 * An account that is in no company (a Super admin) is asked which company it
 * joins: the running ones.
 */
import { useEffect, useRef, useState } from 'react';
import { Field } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { LoadError, toast } from '../../components/feedback';
import { changePlatformUser, listRunningCompanies } from '../../lib/platform';
import type { AccountRow, RoleChanged, WireRole } from '../../lib/platform';
import { ROLE_LABELS, displayName } from './accountUi';

/** "an" before Admin and Owner, "a" before Member — the sentence names the role. */
const an = (role: AccountRow['role']): string => (role === 'member' ? 'a' : 'an');

/**
 * What the change means for the person. `joined` is the company chosen for an
 * account that is in none (null until one is chosen).
 */
function whatItMeans(account: AccountRow, role: AccountRow['role'], joined: { name: string } | null): string {
  const name = displayName(account);
  const company = account.workspace?.name;
  if (role === 'platform_admin') {
    const atTheConsole = 'They sign in at the console from now on with the same password, and their warmup mailboxes are paused.';
    // an account that is in no company has nothing to leave — it simply becomes one
    return company ? `This takes ${name} out of ${company}. ${atTheConsole}` : `This makes ${name} a Super admin. ${atTheConsole}`;
  }
  if (company) return `This makes ${name} ${an(role)} ${ROLE_LABELS[role]} of ${company}.`;
  if (joined) return `This makes ${name} ${an(role)} ${ROLE_LABELS[role]} of ${joined.name}. They sign in at the workspace from now on.`;
  return `Choose the company ${name} joins. They sign in at the workspace from now on.`;
}

export function ChangeRoleDialog({
  account,
  role,
  onClose,
  onDone,
}: {
  account: AccountRow;
  /** The role picked in the panel — an account row's value, so "Super admin" comes in as `platform_admin`. */
  role: AccountRow['role'];
  onClose: () => void;
  /** The change worked. Called with the server's answer; the lists behind are read again. */
  onDone: (answer: RoleChanged) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  /** The company joined, when one has to be chosen (null = none chosen yet). */
  const [companyId, setCompanyId] = useState<number | null>(null);
  /** The running companies — `list` null until they are read — and what went wrong (`error`, '' = nothing). */
  const [companies, setCompanies] = useState<{ list: { id: number; name: string }[] | null; error: string }>({ list: null, error: '' });
  /** "Try again" asks once more. */
  const [ask, setAsk] = useState(0);
  const alive = useRef(true);

  // only an account that is in no company (a Super admin) has to be put into one
  const joins = !account.workspace && role !== 'platform_admin';
  const chosen = companies.list?.find((c) => c.id === companyId) ?? null;
  // the picked value is the account row's; the wire value of "Super admin" is `super_admin`
  const wireRole: WireRole = role === 'platform_admin' ? 'super_admin' : role;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // asked for only when there is a company to choose
  useEffect(() => {
    if (!joins) return;
    let reading = true;
    void listRunningCompanies().then((r) => {
      if (!reading) return;
      setCompanies(r.ok ? { list: r.data, error: '' } : { list: null, error: r.error });
    });
    return () => {
      reading = false;
    };
  }, [joins, ask]);

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

  // A click outside this card lands on the PANEL's backdrop, not on this
  // dialog's: the panel is what a dialog opened inside it is placed against,
  // so the dialog's backdrop covers the panel alone. That click closes the
  // panel — this dialog inside it — and while the server works its answer
  // would be lost, so the click is stopped here.
  useEffect(() => {
    if (!busy) return;
    const onMouse = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('.modal-card')) return;
      e.stopPropagation();
    };
    window.addEventListener('mousedown', onMouse, true);
    return () => window.removeEventListener('mousedown', onMouse, true);
  }, [busy]);

  // a reason of 3 characters or more, and a company when one has to be chosen
  const ready = reason.trim().length >= 3 && (!joins || chosen !== null);
  const companyHint = companies.error
    ? undefined
    : !companies.list
      ? 'Loading companies…'
      : companies.list.length === 0
        ? 'No company is running right now.'
        : undefined;

  async function go() {
    if (!ready || busy) return;
    setBusy(true);
    const body: { role: WireRole; reason: string; workspace?: number } = { role: wireRole, reason: reason.trim() };
    // the company goes with the body only when it was chosen here
    if (joins && chosen) body.workspace = chosen.id;
    const r = await changePlatformUser(account.id, body);
    // gone before the server answered: nothing is left here to tell
    if (!alive.current) return;
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Role changed to ${ROLE_LABELS[role]}.`);
    onDone(r.data);
  }

  return (
    <Modal
      title="Change role?"
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
          <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void go()}>
            {busy ? 'Changing…' : 'Change role'}
          </button>
        </>
      }
    >
      <p style={{ marginBottom: 12 }}>{whatItMeans(account, role, chosen)}</p>
      {joins && (
        <>
          <Field label="Company" hint={companyHint}>
            {/* the focus goes to the FIRST field with data-autofocus: this one when it is shown, the reason otherwise */}
            <select
              value={companyId ?? ''}
              onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)}
              disabled={busy}
              aria-label="Company"
              data-autofocus
            >
              <option value="">Choose a company…</option>
              {(companies.list ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {companies.error && <LoadError message={companies.error} onRetry={() => setAsk(ask + 1)} />}
        </>
      )}
      <Field label="Why are you changing it? (recorded)" hint="Write at least 3 characters.">
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          aria-label="Why are you changing it? (recorded)"
          data-autofocus
        />
      </Field>
    </Modal>
  );
}
