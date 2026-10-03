import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from '../lib/mockData';
import { changePassword, getSettings, putSettings, sendTestReport } from '../lib/api';
import { loadJson, saveJson } from '../lib/store';
import { Field, PageHeader, SectionLabel, Spinner, Toggle } from '../components/ui';
import type { RunFrequency, SettingsState } from '../lib/types';

const STORE_KEY = 'settings';

/** Merge stored (possibly stale) settings with defaults so new keys always exist. */
function loadSettings(): SettingsState {
  const stored = loadJson<Partial<SettingsState>>(STORE_KEY, {});
  return { ...DEFAULT_SETTINGS, ...stored, report: stored.report ?? DEFAULT_SETTINGS.report };
}

const RUN_OPTIONS: { value: RunFrequency; label: string; hint: string }[] = [
  { value: '15m', label: 'Every 15 minutes', hint: 'Highest discovery cadence' },
  { value: '1h', label: 'Every hour', hint: 'Balanced for most pipelines' },
  { value: '6h', label: 'Every 6 hours', hint: 'Low-volume outbound' },
  { value: 'daily', label: 'Daily', hint: 'One full run per day' },
];

/**
 * SETTINGS — the sections from the notes, extended for real sending:
 * COMPANY PROFILE · AI KEY · EMAIL DELIVERY (SMTP) · PASSWORD · FREQUENT RUNS.
 * Persisted on the backend when Django is live, localStorage otherwise.
 */
export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>(loadSettings);
  const [saved, setSaved] = useState(false);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [reportMsg, setReportMsg] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    getSettings().then((remote) => {
      if (remote) {
        setLive(true);
        setSettings({
          company: remote.company,
          aiKey: remote.aiKey,
          smtp: remote.smtp ?? DEFAULT_SETTINGS.smtp,
          runs: remote.runs,
          report: remote.report ?? DEFAULT_SETTINGS.report,
        });
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const save = async () => {
    saveJson(STORE_KEY, settings); // offline copy
    await putSettings(settings);
    setSaved(true);
  };

  const updatePassword = async () => {
    if (!password.current || !password.next) {
      setPasswordMsg('Fill in current and new password.');
      return;
    }
    if (password.next !== password.confirm) {
      setPasswordMsg('New passwords do not match.');
      return;
    }
    const error = await changePassword(password.current, password.next, password.confirm);
    if (error) {
      setPasswordMsg(error);
      return;
    }
    setPasswordMsg(live ? 'Password updated on the backend.' : 'Updated (frontend only — backend not running).');
    setPassword({ current: '', next: '', confirm: '' });
  };

  const addService = (value: string) => {
    const name = value.trim();
    if (!name) return;
    setSettings((s) => ({ ...s, company: { ...s.company, services: [...s.company.services, name] } }));
  };
  const removeService = (name: string) =>
    setSettings((s) => ({ ...s, company: { ...s.company, services: s.company.services.filter((x) => x !== name) } }));

  const sendReportNow = async () => {
    setSendingReport(true);
    setReportMsg('');
    const res = await sendTestReport();
    setSendingReport(false);
    if (!res) {
      setReportMsg('Backend not reachable — start Django and try again.');
      return;
    }
    if (res.status === 'smtp') {
      setReportMsg(`Sent ✓ — emailed to ${res.recipients.join(', ')}`);
    } else if (res.status === 'console') {
      setReportMsg(`SMTP not configured — report printed to the Django console (recipients: ${res.recipients.join(', ') || 'none'}).`);
    } else {
      setReportMsg('No recipient — enter an admin email above and save first.');
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        subtitle="Company profile, AI provider, security and how often the autonomous system runs."
        actions={
          <button className="btn btn-primary" onClick={save}>
            {saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        }
      />

      {loading ? (
        <Spinner label="Loading settings…" />
      ) : (
      <>

      {/* 1 — COMPANY PROFILE */}
      <section className="panel settings-panel">
        <SectionLabel>Company Profile</SectionLabel>
        <div className="settings-grid">
          <Field label="Company Name">
            <input
              value={settings.company.name}
              onChange={(e) =>
                setSettings((s) => ({ ...s, company: { ...s.company, name: e.target.value } }))
              }
            />
          </Field>
          <Field label="Company Website">
            <input
              className="mono"
              value={settings.company.website}
              onChange={(e) =>
                setSettings((s) => ({ ...s, company: { ...s.company, website: e.target.value } }))
              }
            />
          </Field>
        </div>
        <Field label="Company Description">
          <textarea
            rows={3}
            value={settings.company.description}
            onChange={(e) =>
              setSettings((s) => ({ ...s, company: { ...s.company, description: e.target.value } }))
            }
          />
        </Field>
        <Field label="Services">
          <ServiceTags services={settings.company.services} onAdd={addService} onRemove={removeService} />
        </Field>
      </section>

      {/* 2 — AI KEY */}
      <section className="panel settings-panel">
        <SectionLabel>AI Key</SectionLabel>
        <div className="settings-grid">
          <Field label="AI Provider">
            <select
              value={settings.aiKey.provider}
              onChange={(e) => setSettings((s) => ({ ...s, aiKey: { ...s.aiKey, provider: e.target.value } }))}
            >
              {['OpenAI', 'Anthropic', 'Google AI', 'Zhipu (GLM)', 'Other'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field
            label="API Key"
            hint={live ? 'Stored server-side by Django — never returned in full.' : 'Stored locally — backend not running.'}
          >
            <div className="input-with-action">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="sk-…"
                className="mono"
                value={settings.aiKey.apiKey}
                onChange={(e) => setSettings((s) => ({ ...s, aiKey: { ...s.aiKey, apiKey: e.target.value } }))}
              />
              <button className="btn btn-ghost" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        </div>
      </section>

      {/* 3 — EMAIL DELIVERY (SMTP) */}
      <section className="panel settings-panel">
        <SectionLabel>Email Delivery (SMTP)</SectionLabel>
        <small className="inline-msg">
          Where approved cold emails are sent from. Without SMTP, approved emails are printed to the
          Django server console instead. Gmail: host smtp.gmail.com, port 587, app password.
        </small>
        <div className="settings-grid">
          <Field label="SMTP Host">
            <input
              className="mono"
              placeholder="smtp.gmail.com"
              value={settings.smtp.host}
              onChange={(e) => setSettings((s) => ({ ...s, smtp: { ...s.smtp, host: e.target.value } }))}
            />
          </Field>
          <Field label="Port">
            <input
              className="mono"
              placeholder="587"
              value={settings.smtp.port}
              onChange={(e) => setSettings((s) => ({ ...s, smtp: { ...s.smtp, port: e.target.value } }))}
            />
          </Field>
          <Field label="SMTP User">
            <input
              className="mono"
              placeholder="you@company.com"
              value={settings.smtp.user}
              onChange={(e) => setSettings((s) => ({ ...s, smtp: { ...s.smtp, user: e.target.value } }))}
            />
          </Field>
          <Field label="SMTP Password" hint={live ? 'Stored server-side — never returned in full.' : 'Stored locally — backend not running.'}>
            <input
              type="password"
              placeholder="app password"
              className="mono"
              value={settings.smtp.password}
              onChange={(e) => setSettings((s) => ({ ...s, smtp: { ...s.smtp, password: e.target.value } }))}
            />
          </Field>
          <Field label="From Address">
            <input
              className="mono"
              placeholder="outreach@company.com"
              value={settings.smtp.from}
              onChange={(e) => setSettings((s) => ({ ...s, smtp: { ...s.smtp, from: e.target.value } }))}
            />
          </Field>
        </div>
      </section>

      {/* 4 — DAILY REPORT (admin email) */}
      <section className="panel settings-panel">
        <SectionLabel>Daily Report</SectionLabel>
        <small className="inline-msg">
          The full pipeline report (leads scraped, potentials, cycles) is emailed here every day at
          8:00 PM IST. Leave blank to fall back to the account&apos;s admin email. Multiple
          addresses: separate with commas.
        </small>
        <div className="settings-grid">
          <Field label="Admin Email">
            <input
              className="mono"
              placeholder="admin@company.com"
              value={settings.report.email}
              onChange={(e) => setSettings((s) => ({ ...s, report: { email: e.target.value } }))}
            />
          </Field>
        </div>
        <div className="settings-row">
          <button className="btn" onClick={sendReportNow} disabled={sendingReport}>
            {sendingReport ? 'Sending…' : 'Send Test Report Now'}
          </button>
          {reportMsg && <small className="inline-msg">{reportMsg}</small>}
        </div>
      </section>

      {/* 5 — PASSWORD */}
      <section className="panel settings-panel">
        <SectionLabel>Password</SectionLabel>
        <div className="settings-grid three">
          <Field label="Current Password">
            <input
              type="password"
              value={password.current}
              onChange={(e) => setPassword((p) => ({ ...p, current: e.target.value }))}
            />
          </Field>
          <Field label="New Password">
            <input
              type="password"
              value={password.next}
              onChange={(e) => setPassword((p) => ({ ...p, next: e.target.value }))}
            />
          </Field>
          <Field label="Confirm New Password">
            <input
              type="password"
              value={password.confirm}
              onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
            />
          </Field>
        </div>
        <div className="settings-row">
          <button className="btn" onClick={updatePassword}>
            Update Password
          </button>
          {passwordMsg && <small className="inline-msg">{passwordMsg}</small>}
        </div>
      </section>

      {/* 6 — FREQUENT RUNS */}
      <section className="panel settings-panel">
        <SectionLabel>Frequent Runs</SectionLabel>
        <div className="settings-row">
          <div>
            <strong>Autonomous runs</strong>
            <small>How often the orchestrator triggers the full pipeline loop.</small>
          </div>
          <Toggle
            checked={settings.runs.enabled}
            onChange={(next) => setSettings((s) => ({ ...s, runs: { ...s.runs, enabled: next } }))}
            label="Enable autonomous runs"
          />
        </div>
        <div className="run-options" role="radiogroup" aria-label="Run frequency">
          {RUN_OPTIONS.map((opt) => (
            <label key={opt.value} className={`run-option${settings.runs.frequency === opt.value ? ' active' : ''}`}>
              <input
                type="radio"
                name="run-frequency"
                value={opt.value}
                checked={settings.runs.frequency === opt.value}
                onChange={() =>
                  setSettings((s) => ({ ...s, runs: { ...s.runs, frequency: opt.value } }))
                }
              />
              <strong>{opt.label}</strong>
              <small>{opt.hint}</small>
            </label>
          ))}
        </div>
        <small className="inline-msg">
          {live
            ? 'Saved to the backend — the orchestrator reads this for its run cadence.'
            : 'Frontend control only — start the backend to persist the schedule.'}
        </small>
      </section>
      </>
      )}
    </div>
  );
}

function ServiceTags({
  services,
  onAdd,
  onRemove,
}: {
  services: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="service-tags">
      <div className="input-with-action">
        <input
          value={draft}
          placeholder="Add a service…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onAdd(draft);
              setDraft('');
            }
          }}
        />
        <button
          className="btn btn-ghost"
          onClick={() => {
            onAdd(draft);
            setDraft('');
          }}
        >
          Add
        </button>
      </div>
      <div className="tags">
        {services.map((s) => (
          <span className="tag" key={s}>
            {s}
            <button onClick={() => onRemove(s)} aria-label={`Remove ${s}`}>
              ×
            </button>
          </span>
        ))}
        {services.length === 0 && <small>No services yet.</small>}
      </div>
    </div>
  );
}
