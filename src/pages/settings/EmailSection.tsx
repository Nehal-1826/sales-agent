import { useState } from 'react';
import { Banner, toast } from '../../components/feedback';
import { Field } from '../../components/ui';
import { connectSmtp, getSettings } from '../../lib/api';
import { navigate } from '../../lib/router';
import { useWorkspaceStatus } from '../../lib/status';
import type { SettingsState } from '../../lib/types';

/** Email sending — connect the mailbox approved emails are sent from. */
export function EmailSection({ settings, onSaved }: { settings: SettingsState; onSaved: (s: SettingsState) => void }) {
  const { outreach, refresh } = useWorkspaceStatus();
  const connected = !!outreach?.smtpConfigured;
  const [provider, setProvider] = useState<'zoho' | 'gmail' | 'custom'>('zoho');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !password) return;
    setBusy(true);
    setProblem('');
    const res = await connectSmtp({
      provider,
      user: user.trim(),
      password,
      host: provider === 'custom' ? host.trim() : undefined,
      port: provider === 'custom' ? port : undefined,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (!res.data.ok) return setProblem(res.data.message);
    setPassword('');
    toast.success('Mailbox connected. Approved emails will be delivered from it.');
    void refresh();
    getSettings().then(onSaved).catch(() => undefined);
  };

  return (
    <section className="panel settings-panel" aria-labelledby="sec-email">
      <h2 id="sec-email" className="section-title">
        Email sending
      </h2>
      {connected ? (
        <Banner tone="success" title="Email is connected">
          Sending from <span className="mono">{settings.smtp.from || settings.smtp.user}</span> via{' '}
          <span className="mono">{settings.smtp.host}</span>. Connect again below to switch mailbox.
        </Banner>
      ) : (
        <Banner tone="warn" title="Email isn't connected yet">
          Until you connect a mailbox, approved emails are only logged on the server, not delivered.
        </Banner>
      )}

      <form className="connect-form" onSubmit={connect}>
        <fieldset className="segmented" aria-label="Email provider">
          {(['zoho', 'gmail', 'custom'] as const).map((p) => (
            <label key={p} className={provider === p ? 'active' : ''}>
              <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} />
              {p === 'zoho' ? 'Zoho Mail' : p === 'gmail' ? 'Gmail / Google Workspace' : 'Other'}
            </label>
          ))}
        </fieldset>

        <div className="settings-grid">
          <Field label="Email address">
            <input
              type="email"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder={provider === 'gmail' ? 'you@gmail.com' : 'hello@yourcompany.com'}
              autoComplete="username"
            />
          </Field>
          <Field
            label="App password"
            hint={
              provider === 'gmail'
                ? 'Create one at myaccount.google.com → Security → App passwords.'
                : provider === 'zoho'
                  ? 'With 2-step login on, create one at accounts.zoho.com → Security → App Passwords. We try every Zoho region for you.'
                  : 'Your mailbox password or app password.'
            }
          >
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          {provider === 'custom' && (
            <>
              <Field label="Mail server">
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.yourprovider.com" />
              </Field>
              <Field label="Port">
                <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
              </Field>
            </>
          )}
        </div>
        {problem && (
          <Banner tone="error" title="Couldn't sign in to that mailbox">
            {problem}
          </Banner>
        )}
        <div className="settings-row">
          <button className="btn btn-primary" type="submit" disabled={busy || !user.trim() || !password}>
            {busy ? 'Checking the login… (a few seconds)' : connected ? 'Connect a different mailbox' : 'Connect mailbox'}
          </button>
          <small className="dim">We test the login without sending anything.</small>
        </div>
      </form>

      <p className="panel-note">
        Need to enter server details by hand? Use{' '}
        <button className="link-btn" onClick={() => navigate('settings', 'advanced')}>
          Advanced settings
        </button>
        .
      </p>
    </section>
  );
}
