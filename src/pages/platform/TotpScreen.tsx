import { useState } from 'react';
import { Field } from '../../components/ui';
import { totpConfirm, totpSetup, totpVerify } from '../../lib/platform';
import type { TotpSetup } from '../../lib/platform';

/** Two-factor gate for platform admins. The code is posted once and never stored. */
export function TotpScreen({ onVerified, onSignOut }: { onVerified: () => void; onSignOut: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startEnroll() {
    setBusy(true);
    setError('');
    const r = await totpSetup();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSetup(r.data);
    setEnrolling(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await (enrolling ? totpConfirm(code) : totpVerify(code));
    setBusy(false);
    setCode(''); // never keep the code around
    if (!r.ok) return setError(r.error);
    onVerified();
  }

  const uri = setup?.otpauth_uri ?? setup?.otpauth_url ?? setup?.provisioning_uri;

  return (
    <div className="login-wrap">
      <form className="panel login-card" onSubmit={(e) => void submit(e)}>
        <strong className="login-headline">Shailog Technologies — Platform console</strong>
        <small className="login-footnote">
          {enrolling
            ? 'Add this key to your authenticator app, then enter the 6-digit code it shows.'
            : 'Enter the 6-digit code from your authenticator app.'}
        </small>
        {enrolling && setup && (
          <div className="pf-secret">
            <Field label="Secret key">
              <input readOnly value={setup.secret} onFocus={(e) => e.currentTarget.select()} />
            </Field>
            {uri && (
              <Field label="otpauth link (paste into your authenticator if it supports it)">
                <textarea readOnly rows={3} value={uri} onFocus={(e) => e.currentTarget.select()} />
              </Field>
            )}
          </div>
        )}
        <Field label="6-digit code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            autoFocus
          />
        </Field>
        {error && <p className="pf-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : enrolling ? 'Confirm and sign in' : 'Verify'}
        </button>
        {!enrolling && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void startEnroll()}>
            Set up an authenticator (first time)
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}
