import { useState } from 'react';
import { resendVerification, signup } from '../lib/api';
import type { BillingInterval } from '../lib/api';
import { TIERS } from '../marketing/pricing';

const COUNTRIES: [string, string][] = [
  ['IN', 'India'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['AE', 'United Arab Emirates'],
  ['SG', 'Singapore'],
  ['AU', 'Australia'],
  ['CA', 'Canada'],
  ['DE', 'Germany'],
  ['OTHER', 'Other'],
];

function defaultCountry(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata' ? 'IN' : 'US';
  } catch {
    return 'IN';
  }
}

const trim200 = (v: string | null | undefined) => (v ?? '').trim().slice(0, 200);

/** SIGNUP — /?signup=1&plan=business&interval=month. On success the app shows the verify-email state. */
export function SignupPage({ onSignedUp, onHome, onSignIn }: { onSignedUp: () => void; onHome: () => void; onSignIn: () => void }) {
  const q = new URLSearchParams(window.location.search);
  const planParam = q.get('plan') ?? 'business';
  const [plan, setPlan] = useState(TIERS.some((t) => t.id === planParam) ? planParam : 'business');
  const [interval, setInterval_] = useState<BillingInterval>(q.get('interval') === 'year' ? 'year' : 'month');
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState('');

  const ready = company.trim() && name.trim() && email.includes('@') && password.length >= 10;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    setFields({});
    const res = await signup({
      company: company.trim(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      country,
      plan_code: plan,
      interval,
      utm_source: trim200(q.get('utm_source')),
      utm_campaign: trim200(q.get('utm_campaign')),
      referrer: trim200(document.referrer),
    });
    setBusy(false);
    if (res.ok) {
      window.history.replaceState(null, '', '/');
      setSent(true);
    } else {
      setError(res.error);
      setFields(res.fields);
    }
  };

  const resend = async () => {
    const r = await resendVerification();
    setResent(r.ok ? 'Sent. Check your inbox.' : r.error);
  };

  if (sent) {
    return (
      <div className="login-wrap">
        <div className="panel login-card login-card-center" role="status">
          <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
          <strong className="login-headline">Verify your email</strong>
          <small className="login-footnote">
            We sent a link to {email}. Open it to confirm your address. You need this before you can pay.
          </small>
          <button className="btn" type="button" onClick={() => void resend()}>
            Resend email
          </button>
          {resent && <small className="login-footnote">{resent}</small>}
          <button className="btn btn-primary" type="button" onClick={onSignedUp}>
            Continue to my workspace
          </button>
        </div>
      </div>
    );
  }

  const err = (k: string) => fields[k] && <small className="login-error" role="alert">{fields[k]}</small>;
  return (
    <div className="login-wrap">
      <button type="button" className="login-home" onClick={onHome}>
        ← Back to home
      </button>
      <form className="panel login-card" onSubmit={submit} noValidate>
        <img src="/logo.png" alt="Shailog Technologies" className="login-logo" />
        <div className="login-title">
          <strong>Start your workspace</strong>
          <small>Create your account, then pick how to pay. 10 bonus days on your first payment.</small>
        </div>
        <label className="login-field">
          <span>Company</span>
          <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" required autoFocus />
          {err('company')}
        </label>
        <label className="login-field">
          <span>Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          {err('name')}
        </label>
        <label className="login-field">
          <span>Work email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          {err('email')}
        </label>
        <label className="login-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          <small>At least 10 characters. Avoid common passwords.</small>
          {err('password')}
        </label>
        <label className="login-field">
          <span>Country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map(([c, n]) => (
              <option key={c} value={c}>{n}</option>
            ))}
          </select>
        </label>
        <label className="login-field">
          <span>Plan</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="login-field">
          <span>Billing</span>
          <select value={interval} onChange={(e) => setInterval_(e.target.value as BillingInterval)}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="btn btn-primary login-submit" type="submit" disabled={busy || !ready}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <small className="login-footnote">
          Already have an account?{' '}
          <button type="button" className="link-btn" onClick={onSignIn}>Sign in</button>
        </small>
      </form>
    </div>
  );
}
