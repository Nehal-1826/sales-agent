import { useState } from 'react';
import { login, register } from '../lib/api';

/**
 * LOGIN — the product entry point, with two options:
 *   • Sign in        → existing workspace account
 *   • Create account → registers a new account (8+ char password) and
 *                      signs straight in
 * No shipped credentials: accounts are created here, at first boot
 * (ADMIN_* env vars), or seeded for demo installs.
 */
export function LoginPage({ onLoggedIn, onHome }: { onLoggedIn: () => void; onHome?: () => void }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !username.trim() || !password) return;
    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }
    setBusy(true);
    setError('');
    const res =
      mode === 'signin'
        ? await login(username.trim(), password)
        : await register(username.trim(), password);
    setBusy(false);
    if (res.ok) onLoggedIn();
    else setError(res.error ?? 'Something went wrong.');
  };

  const switchMode = (next: 'signin' | 'register') => {
    setMode(next);
    setError('');
    setConfirm('');
  };

  return (
    <div className="login-wrap">
      {onHome && (
        <button className="login-home" onClick={onHome} aria-label="Back to home">
          ⌂ Back to home
        </button>
      )}
      <form className="panel login-card" onSubmit={submit}>
        <img src="/shailog-logo.png" alt="Shailog Technologies" className="login-logo" />
        <div className="login-title">
          <strong>Marketing &amp; Sales AI</strong>
          <small>{mode === 'signin' ? 'Sign in to your workspace' : 'Create your workspace account'}</small>
        </div>

        {/* sign in / create account options */}
        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`login-tab${mode === 'signin' ? ' active' : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`login-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
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
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'at least 8 characters' : ''}
          />
        </label>
        {mode === 'register' && (
          <label className="login-field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}
        {error && <small className="login-error">{error}</small>}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account & sign in'}
        </button>
        <small className="login-footnote">
          {mode === 'signin' ? (
            <>New here?{' '}
              <button type="button" className="login-link" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button type="button" className="login-link" onClick={() => switchMode('signin')}>
                Sign in
              </button>
            </>
          )}
          <br />
          Autonomous lead discovery · profiling · outreach — by Shailog Technologies
        </small>
      </form>
    </div>
  );
}
