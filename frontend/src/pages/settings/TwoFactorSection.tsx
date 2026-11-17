import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Field } from '../../components/ui';
import { post, request, attempt } from '../../lib/transport';

/**
 * TWO-FACTOR — workspace users manage their own TOTP from Settings.
 * Setup: scan QR → enter 6-digit code → enabled. Disable requires a valid code.
 */
export function TwoFactorSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);

  async function check() {
    setChecking(true);
    try {
      const r = await request<{ enabled: boolean }>('/auth/2fa/status/');
      setEnabled(r.enabled);
    } catch { setEnabled(false); }
    setChecking(false);
  }
  if (checking && enabled === null) { void check(); }

  async function start() {
    setBusy(true); setError('');
    const r = await attempt(() => request<{ secret: string; otpauth_uri: string }>('/auth/2fa/setup/', post()));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSetup(r.data);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const r = await attempt(() => request('/auth/2fa/confirm/', post({ code })));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSetup(null); setCode(''); setEnabled(true);
  }

  async function disable() {
    setBusy(true); setError('');
    const r = await attempt(() => request('/auth/2fa/disable/', post({ code })));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCode(''); setEnabled(false);
  }

  return (
    <section className="settings-section">
      <h3 className="field-label">Two-factor authentication</h3>
      <small className="login-footnote" style={{ marginBottom: 14, display: 'block' }}>
        Add a second layer of security to your account. Every sign-in will ask for a 6-digit code
        from your authenticator app (Google Authenticator, Authy, 1Password).
      </small>

      {checking && <p className="login-footnote">Checking…</p>}

      {enabled === true && !setup && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="chip chip-success" style={{ justifySelf: 'start' }}>✓ 2FA is enabled</div>
          <Field label="Enter a 6-digit code to disable 2FA">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" pattern="[0-9]{6}" placeholder="000000"
              style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center', maxWidth: 200 }}
            />
          </Field>
          <button className="btn btn-ghost" disabled={busy || code.length !== 6} onClick={() => void disable()}>
            {busy ? 'Checking…' : 'Disable 2FA'}
          </button>
        </div>
      )}

      {enabled === false && !setup && (
        <button className="btn btn-primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Generating…' : 'Enable 2FA'}
        </button>
      )}

      {setup && (
        <form onSubmit={(e) => void confirm(e)} style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
          <div className="pf-qr" style={{ padding: 12 }}>
            <QRCodeSVG value={setup.otpauth_uri} size={176} level="M" marginSize={2} />
            <small className="login-footnote" style={{ marginTop: 8 }}>
              Scan with any authenticator — Google Authenticator, Authy, 1Password
            </small>
          </div>
          <Field label="Enter the 6-digit code from your app">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" pattern="[0-9]{6}" placeholder="000000" autoFocus
              style={{ letterSpacing: 4, fontSize: 18, textAlign: 'center', maxWidth: 200 }}
            />
          </Field>
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Confirm & enable'}
          </button>
        </form>
      )}

      {error && <p className="login-error" style={{ marginTop: 8 }}>{error}</p>}
    </section>
  );
}
