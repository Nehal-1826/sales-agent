import { useEffect, useState } from 'react';
import { toast } from '../../components/feedback';
import { Field } from '../../components/ui';
import { attempt, changePassword, getCurrentUser, inDemo, logout, post, request } from '../../lib/api';
import type { Result } from '../../lib/api';

/** Same rule the server enforces on /auth/change-username/. */
const USERNAME_RULE = '3-30 characters — letters, numbers and underscores only.';
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

/** POST /auth/change-username/ — same endpoint the platform console uses.
 *  Declared here (not imported from lib/platform) so the user panel never
 *  pulls in the console module. */
async function changeUsername(username: string): Promise<Result<{ username: string }>> {
  if (await inDemo()) return { ok: false, error: 'This is the offline demo. Connect your workspace to do that.' };
  return attempt(() => request<{ username: string }>('/auth/change-username/', post({ username })));
}

/** Account — change your password or username. */
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
    // the server just revoked every session, including this one — go back to sign-in now
    logout();
    window.location.reload();
  };

  // ── username ────────────────────────────────────────────────────────
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [nextUsername, setNextUsername] = useState('');
  const [unameBusy, setUnameBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getCurrentUser()
      .then((me) => {
        if (alive) setCurrentUsername(me.name);
      })
      .catch(() => {
        /* the card still works without the current name */
      });
    return () => {
      alive = false;
    };
  }, []);

  const badUsername = nextUsername.length > 0 && !USERNAME_PATTERN.test(nextUsername);
  const usernameReady = USERNAME_PATTERN.test(nextUsername) && nextUsername !== currentUsername;

  const submitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameReady || unameBusy) return;
    setUnameBusy(true);
    const res = await changeUsername(nextUsername);
    setUnameBusy(false);
    if (!res.ok) return toast.error(res.error);
    // the auth token stays valid — it is keyed by user id, not username
    setCurrentUsername(nextUsername);
    setNextUsername('');
    toast.success('Username updated');
  };

  return (
    <>
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

      <form className="panel settings-panel" aria-labelledby="sec-account-username" onSubmit={submitUsername}>
        <h2 id="sec-account-username" className="section-title">
          Change username
        </h2>
        <div className="settings-grid">
          <Field label="Current username">
            <input value={currentUsername ?? 'Loading…'} readOnly tabIndex={-1} aria-label="Current username" />
          </Field>
          <Field label="New username" hint={badUsername ? USERNAME_RULE : undefined}>
            <input
              value={nextUsername}
              onChange={(e) => setNextUsername(e.target.value)}
              placeholder={currentUsername ?? 'new_username'}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={badUsername}
            />
          </Field>
        </div>
        <div className="settings-row">
          <button className="btn btn-primary" type="submit" disabled={!usernameReady || unameBusy}>
            {unameBusy ? 'Saving…' : 'Save username'}
          </button>
        </div>
      </form>
    </>
  );
}
