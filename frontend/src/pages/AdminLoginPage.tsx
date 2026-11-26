import { useEffect, useState } from 'react';
import { GlassBackdrop } from '../components/Lightfall';
import LatticeLoader from '../components/reactbits/LatticeLoader';
import { adminLogin } from '../lib/api';

/**
 * ADMIN LOGIN — the platform console door at /<slug>/login. Only platform
 * admins can sign in here; the API turns workspace accounts away (403).
 */
export function AdminLoginPage({ slug, onLoggedIn, onHome }: { slug: string; onLoggedIn: () => void; onHome?: () => void }) {
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // validate the slug exactly like App.tsx RoleGate — a wrong slug is a 404
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin-slug/check/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug }),
        });
        setSlugOk(res.ok);
        if (!res.ok) document.title = '404';
      } catch {
        setSlugOk(false);
      }
    })();
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    setError('');
    const res = await adminLogin(username.trim(), password);
    setBusy(false);
    if (res.ok) onLoggedIn();
    else setError(res.error);
  };

  if (slugOk === null) {
    return (
      <div className="login-wrap">
        <GlassBackdrop />
        <div className="panel login-card login-card-center">
          <LatticeLoader label="Checking the console link…" cellSize={7} color="var(--accent)" showTimer={false} />
        </div>
      </div>
    );
  }

  if (!slugOk) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#0a0b0d', color: '#9aa0aa', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#e8e9ec' }}>404</div>
          <div style={{ marginTop: 8 }}>Page not found</div>
        </div>
      </div>
    );
  }

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
          <strong>WarmPulse — Platform Console</strong>
          <small>Administrator sign-in. Workspace accounts don't work here.</small>
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
        <small className="login-footnote">Forgot your password? Ask another super admin to reset it.</small>
      </form>
    </div>
  );
}
