import { useState } from 'react';
import { login } from '../lib/api';

/**
 * LOGIN — the product entry point. No shipped credentials: the account is
 * created at first boot (ADMIN_* env vars) or seeded for demo installs.
 */
export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    const res = await login(username.trim(), password);
    setBusy(false);
    if (res.ok) onLoggedIn();
    else setError(res.error ?? 'Login failed.');
  };

  return (
    <div className="login-wrap">
      <form className="panel login-card" onSubmit={submit}>
        <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
        <div className="login-title">
          <strong>Marketing &amp; Sales AI</strong>
          <small>Sign in to your workspace</small>
        </div>
        <label className="login-field">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <small className="login-error">{error}</small>}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <small className="login-footnote">
          Autonomous lead discovery · profiling · outreach — by Shailog Technologies
        </small>
      </form>
    </div>
  );
}
