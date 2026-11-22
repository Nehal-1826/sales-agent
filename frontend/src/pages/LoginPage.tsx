import { useState } from 'react';
import { GlassBackdrop } from '../components/Lightfall';
import { login } from '../lib/api';
import { googlePopupIdToken, isFirebaseConfigured } from '../lib/firebase';
import { verifyGoogleToken } from '../lib/api';

/**
 * LOGIN — the product entry point. No shipped credentials: the owner account
 * is created at first boot (ADMIN_* env vars) or seeded for demo installs.
 */
export function LoginPage({ onLoggedIn, onHome }: { onLoggedIn: () => void; onHome?: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    const res = await login(username.trim(), password);
    setBusy(false);
    if (res.ok) onLoggedIn();
    else setError(res.error);
  };

  return (
    <div className="login-wrap">
      <GlassBackdrop />
      {onHome && (
        <button type="button" className="login-home" onClick={onHome}>
          ← Back to home
        </button>
      )}
      <form className="panel login-card" onSubmit={submit} noValidate>
        <img src="/warmpulse-logo.svg" alt="WarmPulse" className="login-logo" />
        <div className="login-title">
          <strong>WarmPulse</strong>
          <small>Sign in to see new leads and the emails waiting for you.</small>
        </div>
        <label className="login-field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label className="login-field">
          <span>Password</span>
          <span className="input-with-action">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {isFirebaseConfigured() && (
        <>
        <div className="login-or"><span>or</span></div>
        <button
          type="button"
          className="btn login-google"
          disabled={busy}
          onClick={() => void (async () => {
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              const idToken = await googlePopupIdToken();
              const res = await verifyGoogleToken(idToken);
              if (res.ok) onLoggedIn();
              else setError(res.error);
            } catch {
              setError('Google sign-in was cancelled or blocked — allow popups and try again.');
            } finally {
              setBusy(false);
            }
          })()}
        >
          {/* Google's four-color "G" — the official plain-SVG mark */}
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>{busy ? 'Signing in…' : 'Sign in with Google'}</span>
        </button>
        </>
        )}
        <small className="login-footnote">Forgot your password? Ask your workspace owner to reset it.</small>
      </form>
    </div>
  );
}
