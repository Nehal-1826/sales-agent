import { useState } from 'react';
import { GlideSelect } from '../components/GlideSelect';
import { GlassBackdrop } from '../components/Lightfall';
import { resendVerification, scrapeCompanyDetails, signup } from '../lib/api';
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

/** Live password checklist — same bar the backend's validators set (min 10). */
const PW_RULES: { label: string; met: (v: string) => boolean }[] = [
  { label: 'At least 10 characters', met: (v) => v.length >= 10 },
  { label: 'Upper and lower case letters', met: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'A number', met: (v) => /\d/.test(v) },
];

/** SIGNUP — /?signup=1&plan=business&interval=month. On success the app shows the verify-email state. */
export function SignupPage({ onSignedUp, onHome, onSignIn }: { onSignedUp: () => void; onHome: () => void; onSignIn: () => void }) {
  const q = new URLSearchParams(window.location.search);
  const planParam = q.get('plan') ?? 'business';
  const [plan, setPlan] = useState(TIERS.some((t) => t.id === planParam) ? planParam : 'business');
  const [interval, setInterval_] = useState<BillingInterval>(q.get('interval') === 'year' ? 'year' : 'month');
  const [company, setCompany] = useState('');
  const [website, setWebsite] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const pwOk = PW_RULES.every((r) => r.met(password));
  const ready = Boolean(company.trim() && name.trim() && email.includes('@')) && pwOk;

  const fetchDetails = async () => {
    const url = website.trim();
    if (!url || fetching) return;
    setFetching(true);
    setFetchError('');
    const res = await scrapeCompanyDetails(url);
    setFetching(false);
    if (res.ok) {
      if (res.data.name) setCompany(res.data.name);
    } else {
      setFetchError('');  // anonymous autofill is off — manual entry works the same
    }
  };

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
      website: website.trim(),
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
        <GlassBackdrop />
        <div className="panel login-card login-card-center" role="status">
          <img src="/warmpulse-logo.svg" alt="WarmPulse" className="login-logo" />
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
      <GlassBackdrop />
      <button type="button" className="login-home" onClick={onHome}>
        ← Back to home
      </button>
      <form className="panel login-card" onSubmit={submit} noValidate>
        <img src="/warmpulse-logo.svg" alt="WarmPulse" className="login-logo" />
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
          <span>Website (optional)</span>
          <div className="login-fetch">
            <input
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                setFetchError('');
              }}
              placeholder="yourcompany.com"
              inputMode="url"
              autoComplete="url"
            />
            <button
              type="button"
              className="btn"
              onClick={() => void fetchDetails()}
              disabled={fetching || !website.trim()}
            >
              {fetching ? 'Fetching…' : 'Fetch details'}
            </button>
          </div>
          <small className="login-footnote">Fetch reads your homepage to fill the company name.</small>
          {fetchError && (
            <small className="login-error" role="alert">
              {fetchError}
            </small>
          )}
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
          <ul className="pw-rules" aria-label="Password requirements">
            {PW_RULES.map((r) => (
              <li key={r.label} className={password && r.met(password) ? 'pass' : 'fail'}>
                {r.label}
              </li>
            ))}
          </ul>
          {err('password')}
        </label>
        <div className="login-field">
          <span>Country</span>
          <GlideSelect
            ariaLabel="Country"
            size="lg"
            value={country}
            onChange={(v) => setCountry(v)}
            options={COUNTRIES.map(([c, n]) => ({ value: c, label: n }))}
          />
        </div>
        <div className="login-field">
          <span>Plan</span>
          <GlideSelect
            ariaLabel="Plan"
            size="lg"
            value={plan}
            onChange={(v) => setPlan(v)}
            options={TIERS.map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
        <div className="login-field">
          <span>Billing</span>
          <GlideSelect
            ariaLabel="Billing"
            size="lg"
            value={interval}
            onChange={(v) => setInterval_(v as BillingInterval)}
            options={[
              { value: 'month', label: 'Monthly' },
              { value: 'year', label: 'Yearly' },
            ]}
          />
        </div>
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
