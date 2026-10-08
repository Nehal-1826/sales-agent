import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, MOCK_TEMPLATES } from '../lib/mockData';
import {
  changePassword,
  createTemplate,
  deleteTemplate,
  getSettings,
  getTemplates,
  putSettings,
  sendTestReport,
  updateTemplate,
} from '../lib/api';
import { loadJson, saveJson } from '../lib/store';
import { Field, PageHeader, SectionLabel, Spinner, Toggle } from '../components/ui';
import type { EmailTemplate, RunFrequency, SettingsState } from '../lib/types';

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
  // masked form of the key stored server-side ('' when none) — shown as a hint,
  // NEVER placed inside the input: typing over dots would garble the value
  const [storedKeyMask, setStoredKeyMask] = useState('');
  const [storedApolloMask, setStoredApolloMask] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);
  const [tplMsg, setTplMsg] = useState('');

  useEffect(() => {
    getSettings().then((remote) => {
      if (remote) {
        setLive(true);
        setStoredKeyMask(remote.aiKey.apiKey || '');
        setStoredApolloMask(remote.aiKey.apolloApiKey || '');
        setSettings({
          company: remote.company,
          // the input stays empty — the stored key never comes back in full,
          // so its masked form must not look like an editable value
          aiKey: { ...remote.aiKey, apiKey: '', apolloApiKey: '' },
          smtp: { ...(remote.smtp ?? DEFAULT_SETTINGS.smtp), password: '' },
          runs: remote.runs,
          report: remote.report ?? DEFAULT_SETTINGS.report,
        });
      }
      setLoading(false);
    });
    getTemplates().then((list) => setTemplates(list ?? MOCK_TEMPLATES));
  }, []);

  const refreshTemplates = async () => {
    const list = await getTemplates();
    setTemplates(list ?? MOCK_TEMPLATES);
  };

  const saveTemplate = async () => {
    if (!editing || !editing.name?.trim()) {
      setTplMsg('Give the template a name first.');
      return;
    }
    const payload = {
      name: editing.name.trim(),
      subject: editing.subject ?? '',
      body: editing.body ?? '',
      isDefault: editing.isDefault ?? false,
    };
    const saved = editing.id ? await updateTemplate(editing.id, payload) : await createTemplate(payload);
    if (!saved) {
      setTplMsg('Save failed — the backend rejected the template.');
      return;
    }
    setTplMsg(`Template saved${saved.isDefault ? ' — now the default' : ''}.`);
    setEditing(null);
    await refreshTemplates();
  };

  const removeTemplate = async (id: string) => {
    const ok = await deleteTemplate(id);
    setTplMsg(ok ? 'Template deleted.' : 'Delete failed — is the backend running?');
    if (editing?.id === id) setEditing(null);
    await refreshTemplates();
  };

  const makeDefault = async (id: string) => {
    const ok = await updateTemplate(id, { isDefault: true });
    if (!ok) setTplMsg('Could not set the default — is the backend running?');
    await refreshTemplates();
  };

  const onUploadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      let subject = '';
      let body = text;
      const m = text.match(/^\s*subject:\s*(.+)\r?\n/i);
      if (m) {
        subject = m[1].trim();
        body = text.slice(m[0].length);
      }
      setEditing({
        name: file.name.replace(/\.[^.]+$/, ''),
        subject,
        body: body.trim(),
        isDefault: templates.length === 0,
      });
      setTplMsg(`Loaded “${file.name}” — review and save.`);
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [saved]);

  const save = async () => {
    saveJson(STORE_KEY, settings); // offline copy
    const ok = live ? await putSettings(settings) : true;
    if (ok && live) {
      // a freshly typed key was accepted — reflect it as the stored mask and
      // clear the input, so the UI always shows what the server actually holds
      const remote = await getSettings();
      setStoredKeyMask(remote?.aiKey.apiKey || '');
      setStoredApolloMask(remote?.aiKey.apolloApiKey || '');
      setSettings((s) => ({ ...s, aiKey: { ...s.aiKey, apiKey: '', apolloApiKey: '' } }));
    }
    setSaved(ok);
    setSaveError(
      ok ? '' : 'Save failed — the backend rejected the update. Check the Django server and try again.'
    );
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

      {saveError && <small className="inline-msg">{saveError}</small>}

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
              {['OpenAI', 'Anthropic', 'Gemini', 'Google AI', 'Zhipu (GLM)', 'DeepSeek', 'Groq', 'Ollama', 'Other'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field
            label="API Key"
            hint={
              storedKeyMask
                ? `Saved on the server: ${storedKeyMask} ✓ — leave blank to keep it, type a new key to replace it.`
                : live
                  ? 'No key stored yet — paste yours and press Save.'
                  : 'Stored locally — backend not running.'
            }
          >
            <div className="input-with-action">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={storedKeyMask ? 'type a new key to replace the saved one' : 'sk-…'}
                className="mono"
                value={settings.aiKey.apiKey}
                onChange={(e) => setSettings((s) => ({ ...s, aiKey: { ...s.aiKey, apiKey: e.target.value } }))}
              />
              <button className="btn btn-ghost" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          <Field
            label="Apollo.io Key (lead phone enrichment)"
            hint={
              storedApolloMask
                ? `Saved on the server: ${storedApolloMask} ✓ — leave blank to keep it.`
                : 'Optional — enriches leads with verified phone numbers when their site hides them.'
            }
          >
            <div className="input-with-action">
              <input
                type="password"
                placeholder={storedApolloMask ? 'type a new key to replace the saved one' : 'Apollo.io API key…'}
                className="mono"
                value={settings.aiKey.apolloApiKey || ''}
                onChange={(e) => setSettings((s) => ({ ...s, aiKey: { ...s.aiKey, apolloApiKey: e.target.value } }))}
              />
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

      {/* 3.5 — EMAIL TEMPLATES (mail template creator) */}
      <section className="panel settings-panel">
        <SectionLabel>Email Templates</SectionLabel>
        <small className="inline-msg">
          The default template is the base for every cold email the Copywright agent drafts — Gemini
          personalizes it per lead using the AI-read company description and audit findings. Write
          one manually or upload a .txt / .md / .html file.
        </small>
        {templates.map((t) => (
          <div className="tpl-row" key={t.id}>
            <div>
              <strong>
                {t.name}
                {t.isDefault && <span className="tag" style={{ marginLeft: 8 }}>default</span>}
              </strong>
              <small className="mono">{t.subject}</small>
            </div>
            <div className="tpl-actions">
              {!t.isDefault && (
                <button className="btn btn-ghost" onClick={() => makeDefault(t.id)}>
                  Make default
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setEditing({ ...t })}>
                Edit
              </button>
              <button className="btn btn-ghost" onClick={() => removeTemplate(t.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <small className="inline-msg">No templates yet — the built-in fallback email is used.</small>
        )}
        <div className="tpl-toolbar">
          <button
            className="btn btn-ghost"
            onClick={() => setEditing({ name: '', subject: '', body: '', isDefault: templates.length === 0 })}
          >
            + New template
          </button>
          <label className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center' }}>
            ⬆ Upload file
            <input
              type="file"
              accept=".txt,.md,.html,.htm"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onUploadFile(file);
              }}
            />
          </label>
        </div>

        {editing && (
          <div className="tpl-editor">
            <div className="settings-grid">
              <Field label="Template name">
                <input
                  value={editing.name}
                  placeholder="e.g. Website Audit Intro"
                  onChange={(e) => setEditing((t) => ({ ...t!, name: e.target.value }))}
                />
              </Field>
              <Field label="Subject line">
                <input
                  className="mono"
                  value={editing.subject}
                  placeholder="Quick idea for {{company}}"
                  onChange={(e) => setEditing((t) => ({ ...t!, subject: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Body" hint="First line of an uploaded file starting with “Subject:” becomes the subject.">
              <textarea
                className="mono"
                rows={10}
                value={editing.body}
                placeholder={'Hi {{company}} team,\n\n…'}
                onChange={(e) => setEditing((t) => ({ ...t!, body: e.target.value }))}
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                checked={editing.isDefault ?? false}
                onChange={(e) => setEditing((t) => ({ ...t!, isDefault: e.target.checked }))}
              />
              Use as the default template
            </label>
            <div className="tpl-toolbar">
              <button className="btn btn-primary" onClick={saveTemplate}>
                Save template
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              {tplMsg && <small className="inline-msg">{tplMsg}</small>}
            </div>
          </div>
        )}
        <small className="inline-msg mono">
          {'Placeholders: {{company}} {{industry}} {{website}} {{description}} {{findings}} {{sender_name}} {{sender_website}} {{services}}'}
        </small>
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

      <div className="save-bar">
        <button className="btn btn-primary" onClick={save}>
          {saved ? 'Saved ✓' : 'Save Changes'}
        </button>
        {saveError ? (
          <small className="inline-msg">{saveError}</small>
        ) : (
          saved && <small className="inline-msg">Settings saved{live ? ' to the backend' : ' locally'}.</small>
        )}
      </div>
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
