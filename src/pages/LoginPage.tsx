import { useState } from 'react';
import { login } from '../lib/api';

/**
 * LOGIN — the product entry point. No shipped credentials: the owner account
 * is created at first boot (ADMIN_* env vars) or seeded for demo installs.
 */
export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
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
      <form className="panel login-card" onSubmit={submit} noValidate>
        <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
        <div className="login-title">
          <strong>Your sales assistant</strong>
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
        <small className="login-footnote">Forgot your password? Ask your workspace owner to reset it.</small>
      </form>
    </div>
  );
}
