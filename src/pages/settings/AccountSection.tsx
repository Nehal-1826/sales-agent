import { useState } from 'react';
import { toast } from '../../components/feedback';
import { Field } from '../../components/ui';
import { changePassword } from '../../lib/api';

/** Account — change your password. */
export function AccountSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const ready = current && next.length >= 8 && next === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    const res = await changePassword(current, next, confirm);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Password changed. Sign in again with the new one.');
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  return (
    <form className="panel settings-panel" aria-labelledby="sec-account" onSubmit={submit}>
      <h2 id="sec-account" className="section-title">
        Account
      </h2>
      <div className="settings-grid three">
        <Field label="Current password">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint={tooShort ? 'Use at least 8 characters.' : undefined}>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            aria-invalid={tooShort}
          />
        </Field>
        <Field label="Repeat new password" hint={mismatch ? "The passwords don't match." : undefined}>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch}
          />
        </Field>
      </div>
      <div className="settings-row">
        <button className="btn btn-primary" type="submit" disabled={!ready || busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
