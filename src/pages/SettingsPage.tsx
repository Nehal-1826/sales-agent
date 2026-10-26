import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, MOCK_PROFILES, MOCK_TEMPLATES, TARGET_COUNTRY_OPTIONS } from '../lib/mockData';
import {
  activateProfile,
  changePassword,
  connectSmtp,
  createProfile,
  createTemplate,
  deleteTemplate,
  getProfiles,
  getSettings,
  getTemplates,
  putSettings,
  sendTestReport,
  updateTemplate,
} from '../lib/api';
import { loadJson, saveJson } from '../lib/store';
import { Field, PageHeader, SectionLabel, Spinner, Toggle } from '../components/ui';
import type { EmailTemplate, IcpMode, RunFrequency, SearchProfile, SettingsState } from '../lib/types';

const STORE_KEY = 'settings';

/** Merge stored (possibly stale) settings with defaults so new keys always exist. */
function loadSettings(): SettingsState {
  const stored = loadJson<Partial<SettingsState>>(STORE_KEY, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    report: stored.report ?? DEFAULT_SETTINGS.report,
    targeting: {
      countries: stored.targeting?.countries ?? DEFAULT_SETTINGS.targeting.countries,
      industries: stored.targeting?.industries ?? DEFAULT_SETTINGS.targeting.industries,
      cities: stored.targeting?.cities ?? DEFAULT_SETTINGS.targeting.cities,
      icpMode: stored.targeting?.icpMode ?? DEFAULT_SETTINGS.targeting.icpMode,
    },
  };
}

const RUN_OPTIONS: { value: RunFrequency; label: string; hint: string }[] = [
  { value: '15m', label: 'Every 15 minutes', hint: 'Highest discovery cadence' },
  { value: '1h', label: 'Every hour', hint: 'Balanced for most pipelines' },
  { value: '6h', label: 'Every 6 hours', hint: 'Low-volume outbound' },
  { value: 'daily', label: 'Daily', hint: 'One full run per day' },
];

/** SMTP provider presets — the right Zoho host depends on the account's
 *  datacenter, so each region is its own option. */
const SMTP_PROVIDERS: { value: string; label: string; host: string; port: string }[] = [
  { value: 'zoho-in', label: 'Zoho Mail — India DC (smtp.zoho.in)', host: 'smtp.zoho.in', port: '587' },
  { value: 'zoho-com', label: 'Zoho Mail — US DC (smtp.zoho.com)', host: 'smtp.zoho.com', port: '587' },
  { value: 'zoho-eu', label: 'Zoho Mail — EU DC (smtp.zoho.eu)', host: 'smtp.zoho.eu', port: '587' },
  { value: 'gmail', label: 'Gmail (smtp.gmail.com)', host: 'smtp.gmail.com', port: '587' },
  { value: 'custom', label: 'Custom / other provider', host: '', port: '' },
];

/** Which provider option matches the configured host ('' → Zoho India default). */
function smtpProvider(host: string): string {
  const known = SMTP_PROVIDERS.find((p) => p.host && p.host === host);
  if (known) return known.value;
  return host ? 'custom' : 'zoho-in';
}

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
  // search profiles — one-click targeting presets
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [profileMsg, setProfileMsg] = useState('');
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [newProfile, setNewProfile] = useState<Partial<SearchProfile> | null>(null);
  // one-click mailbox connect (Zoho / Gmail / custom)
  const [connect, setConnect] = useState({ provider: 'zoho', user: '', password: '', host: '', port: '587' });
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectMsg, setConnectMsg] = useState('');

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
          targeting: {
            countries: remote.targeting?.countries ?? [],
            industries: remote.targeting?.industries ?? [],
            cities: remote.targeting?.cities ?? [],
            icpMode: remote.targeting?.icpMode ?? 'buyer',
          },
        });
      }
      setLoading(false);
    });
    getTemplates().then((list) => setTemplates(list ?? MOCK_TEMPLATES));
    getProfiles().then((list) => setProfiles(list ?? MOCK_PROFILES));
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

  const onActivateProfile = async (id: number) => {
    setActivatingId(id);
    setProfileMsg('');
    const profile = profiles.find((p) => p.id === id);
    const res = await activateProfile(id);
    setActivatingId(null);
    if (res) {
      // live switch — mirror the backend's refreshed settings into the form
      setProfiles((list) => list.map((p) => ({ ...p, isActive: p.id === id })));
      const t = res.settings.targeting;
      setSettings((s) => ({
        ...s,
        targeting: {
          countries: t?.countries ?? [],
          industries: t?.industries ?? [],
          cities: t?.cities ?? [],
          icpMode: t?.icpMode ?? 'buyer',
        },
      }));
      setProfileMsg(`“${profile?.name ?? 'Profile'}” activated — the next pipeline cycle already uses it.`);
    } else if (!live && profile) {
      // offline demo: flip the local mock so the one-click still shows
      setProfiles((list) => list.map((p) => ({ ...p, isActive: p.id === id })));
      setSettings((s) => ({
        ...s,
        targeting: {
          countries: profile.countries,
          industries: profile.industries,
          cities: profile.cities,
          icpMode: profile.icpMode,
        },
      }));
      setProfileMsg('Backend not running — switched locally only. Start Django to persist it.');
    } else {
      setProfileMsg('Activation failed — is the backend running?');
    }
  };

  const saveNewProfile = async () => {
    if (!newProfile || !newProfile.name?.trim()) {
      setProfileMsg('Give the profile a name first.');
      return;
    }
    const payload = {
      name: newProfile.name.trim(),
      description: newProfile.description ?? '',
      countries: newProfile.countries ?? [],
      industries: newProfile.industries ?? [],
      cities: newProfile.cities ?? [],
      icpMode: (newProfile.icpMode as IcpMode) ?? 'buyer',
    };
    const saved = await createProfile(payload);
    if (!saved) {
      setProfileMsg('Save failed — the backend rejected the profile.');
      return;
    }
    setProfiles((list) => [...list, saved]);
    setNewProfile(null);
    setProfileMsg(`Profile “${saved.name}” saved — activate it to switch targeting.`);
  };

  const onConnectMailbox = async () => {
    if (!connect.user.trim() || !connect.password) {
      setConnectMsg('Enter the mailbox address and its password / app password.');
      return;
    }
    setConnectBusy(true);
    setConnectMsg('Verifying login against the mail servers… (a few seconds)');
    const res = await connectSmtp({
      provider: connect.provider,
      user: connect.user.trim(),
      password: connect.password,
      host: connect.provider === 'custom' ? connect.host.trim() : undefined,
      port: connect.provider === 'custom' ? connect.port : undefined,
    });
    setConnectBusy(false);
    if (!res) {
      setConnectMsg('Backend not reachable — start Django and try again.');
      return;
    }
    if (res.ok) {
      setConnectMsg(`✓ ${res.message}`);
      setConnect((c) => ({ ...c, password: '' }));
      // mirror what the backend just saved (host/port/user/from, masked secrets)
      const remote = await getSettings();
      if (remote) {
        setSettings((s) => ({ ...s, smtp: { ...remote.smtp, password: '' } }));
      }
    } else {
      setConnectMsg(res.message);
    }
  };

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

      {/* 1.4 — SEARCH PROFILES (one-click targeting presets) */}
      <section className="panel settings-panel">
        <SectionLabel>Search Profiles</SectionLabel>
        <small className="inline-msg">
          Saved targeting presets — one click on <strong>Activate</strong> switches the whole
          lead-discovery job (countries, industries, buyer/agency mode). The active profile is
          what the next pipeline cycle runs; the Lead Targeting fields below always mirror it.
        </small>
        {profiles.map((p) => (
          <div className="tpl-row" key={p.id}>
            <div>
              <strong>
                {p.name}
                {p.isActive && (
                  <span className="tag" style={{ marginLeft: 8 }}>active</span>
                )}
                <span className="tag" style={{ marginLeft: 8 }}>
                  {p.icpMode === 'agency' ? 'agency partners' : 'buyers'}
                </span>
              </strong>
              <small>{p.description}</small>
              <small className="mono">
                {[
                  p.countries.length ? `${p.countries.length} countr${p.countries.length === 1 ? 'y' : 'ies'}` : 'worldwide',
                  p.cities.length ? `${p.cities.length} cit${p.cities.length === 1 ? 'y' : 'ies'}` : '',
                  p.industries.length ? `${p.industries.length} industries` : 'auto ICP',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                {p.industries.length > 0 && ` — ${p.industries.slice(0, 3).join(', ')}${p.industries.length > 3 ? ', …' : ''}`}
              </small>
            </div>
            <div className="tpl-actions">
              {p.isActive ? (
                <button className="btn btn-ghost" disabled>
                  Running ✓
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => onActivateProfile(p.id)}
                  disabled={activatingId === p.id}
                >
                  {activatingId === p.id ? 'Switching…' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        ))}
        {profiles.length === 0 && (
          <small className="inline-msg">No profiles yet — create one below or run migrations to seed the defaults.</small>
        )}
        <div className="tpl-toolbar">
          <button
            className="btn btn-ghost"
            onClick={() =>
              setNewProfile({ name: '', description: '', countries: [], industries: [], cities: [], icpMode: 'buyer' })
            }
          >
            + New profile
          </button>
          {profileMsg && <small className="inline-msg">{profileMsg}</small>}
        </div>

        {newProfile && (
          <div className="tpl-editor">
            <div className="settings-grid">
              <Field label="Profile name">
                <input
                  value={newProfile.name ?? ''}
                  placeholder="e.g. UK Agencies Q4"
                  onChange={(e) => setNewProfile((p) => ({ ...p!, name: e.target.value }))}
                />
              </Field>
              <Field label="Who to target">
                <select
                  value={newProfile.icpMode ?? 'buyer'}
                  onChange={(e) => setNewProfile((p) => ({ ...p!, icpMode: e.target.value as IcpMode }))}
                >
                  <option value="buyer">Buyers of our services (competitor filter on)</option>
                  <option value="agency">Agency partners — agencies ARE the leads</option>
                </select>
              </Field>
            </div>
            <Field label="Description">
              <input
                value={newProfile.description ?? ''}
                placeholder="What this targeting job is for…"
                onChange={(e) => setNewProfile((p) => ({ ...p!, description: e.target.value }))}
              />
            </Field>
            <div className="settings-grid">
              <Field label="Countries (comma-separated)" hint="Leave empty for the worldwide sweep.">
                <input
                  className="mono"
                  placeholder="United States, United Kingdom, Germany"
                  value={(newProfile.countries ?? []).join(', ')}
                  onChange={(e) =>
                    setNewProfile((p) => ({
                      ...p!,
                      countries: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                    }))
                  }
                />
              </Field>
              <Field
                label="Industries (comma-separated)"
                hint="Empty = auto ICP list for the chosen mode."
              >
                <input
                  className="mono"
                  placeholder="boutique digital agency, web development studio…"
                  value={(newProfile.industries ?? []).join(', ')}
                  onChange={(e) =>
                    setNewProfile((p) => ({
                      ...p!,
                      industries: e.target.value.split(',').map((i) => i.trim()).filter(Boolean),
                    }))
                  }
                />
              </Field>
            </div>
            <div className="tpl-toolbar">
              <button className="btn btn-primary" onClick={saveNewProfile}>
                Save profile
              </button>
              <button className="btn btn-ghost" onClick={() => setNewProfile(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 1.5 — LEAD TARGETING (cities/districts + countries + buyer industries) */}
      <section className="panel settings-panel">
        <SectionLabel>Lead Targeting</SectionLabel>
        <Field
          label="Who counts as a lead"
          hint={
            settings.targeting.icpMode === 'agency'
              ? 'Agency-partner mode: boutique agencies / software shops are the targets — agency search terms are allowed and the competitor filter is off. This is what the Shailog Tech profile activates.'
              : 'Buyer mode: businesses that BUY your services; peer agencies are filtered out as competitors.'
          }
        >
          <select
            value={settings.targeting.icpMode}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                targeting: { ...s.targeting, icpMode: e.target.value as IcpMode },
              }))
            }
          >
            <option value="buyer">Buyers of our services (competitor filter on)</option>
            <option value="agency">Agency partners — agencies ARE the leads</option>
          </select>
        </Field>
        <Field
          label="Target cities / districts"
          hint={
            settings.targeting.cities.length === 0
              ? 'Leave empty for country-level discovery. Add your towns (Salem, Omalur, Mettur…) — every cycle then sweeps only these places, Google Maps included. Cities take priority over countries.'
              : 'Discovery sweeps ONLY these places — Google Maps zooms into each town for local businesses with phones.'
          }
        >
          <CityTags
            cities={settings.targeting.cities}
            onAdd={(c) =>
              setSettings((s) =>
                s.targeting.cities.includes(c)
                  ? s
                  : { ...s, targeting: { ...s.targeting, cities: [...s.targeting.cities, c] } },
              )
            }
            onRemove={(c) =>
              setSettings((s) => ({
                ...s,
                targeting: { ...s.targeting, cities: s.targeting.cities.filter((x) => x !== c) },
              }))
            }
          />
        </Field>
        <small className="inline-msg">
          Pick the countries your leads should come from — leave empty to keep discovering worldwide.
          Targeted sweeps rotate industries across only your chosen countries. Ignored while target
          cities are set.
        </small>
        <Field label="Target countries">
          <CountryTags
            countries={settings.targeting.countries}
            onAdd={(c) =>
              setSettings((s) =>
                s.targeting.countries.includes(c)
                  ? s
                  : { ...s, targeting: { ...s.targeting, countries: [...s.targeting.countries, c] } },
              )
            }
            onRemove={(c) =>
              setSettings((s) => ({
                ...s,
                targeting: { ...s.targeting, countries: s.targeting.countries.filter((x) => x !== c) },
              }))
            }
          />
        </Field>
        {settings.targeting.countries.length > 0 && (
          <small className="inline-msg">
            {settings.targeting.countries.length} target country/countries — save to apply; the next
            cycles only search these.
          </small>
        )}
        <Field
          label={settings.targeting.icpMode === 'agency' ? 'Target industries (agencies welcome)' : 'Target industries (buyers only)'}
          hint={
            settings.targeting.icpMode === 'agency'
              ? settings.targeting.industries.length === 0
                ? 'Empty = the built-in agency list (boutique digital agency, product studio, software dev agency…).'
                : 'Your list is used verbatim — agency terms are the point in this mode, nothing is dropped.'
              : settings.targeting.industries.length === 0
                ? 'Empty = auto ICP targeting: the agent searches businesses that BUY your services (clinics, hotels, gyms…) and filters out competitor agencies.'
                : 'Your buyer list is used verbatim — agency/peer terms are still dropped automatically so competitors never sneak back in.'
          }
        >
          <IndustryTags
            industries={settings.targeting.industries}
            onAdd={(i) =>
              setSettings((s) =>
                s.targeting.industries.includes(i)
                  ? s
                  : { ...s, targeting: { ...s.targeting, industries: [...s.targeting.industries, i] } },
              )
            }
            onRemove={(i) =>
              setSettings((s) => ({
                ...s,
                targeting: { ...s.targeting, industries: s.targeting.industries.filter((x) => x !== i) },
              }))
            }
          />
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
          Django server console instead.
        </small>

        {/* one-click connector — mailbox + password, the server figures out the rest */}
        <Field
          label="Quick connect"
          hint="Zoho tries all three datacenters automatically — you never need to know which one your account is on. 2FA accounts need an App Password (accounts.zoho.com → Security → App Passwords)."
        >
          <div className="settings-grid three">
            <select
              value={connect.provider}
              onChange={(e) => setConnect((c) => ({ ...c, provider: e.target.value }))}
            >
              <option value="zoho">Zoho Mail</option>
              <option value="gmail">Gmail</option>
              <option value="custom">Custom host…</option>
            </select>
            <input
              className="mono"
              placeholder={connect.provider === 'gmail' ? 'you@gmail.com' : 'hello@shailog.com'}
              value={connect.user}
              onChange={(e) => setConnect((c) => ({ ...c, user: e.target.value }))}
            />
            <div className="input-with-action">
              <input
                type="password"
                className="mono"
                placeholder="password / app password"
                value={connect.password}
                onChange={(e) => setConnect((c) => ({ ...c, password: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && onConnectMailbox()}
              />
              <button className="btn btn-primary" onClick={onConnectMailbox} disabled={connectBusy}>
                {connectBusy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
          {connect.provider === 'custom' && (
            <div className="settings-grid">
              <input
                className="mono"
                placeholder="smtp.yourprovider.com"
                value={connect.host}
                onChange={(e) => setConnect((c) => ({ ...c, host: e.target.value }))}
              />
              <input
                className="mono"
                placeholder="587"
                value={connect.port}
                onChange={(e) => setConnect((c) => ({ ...c, port: e.target.value }))}
              />
            </div>
          )}
          {connectMsg && <small className="inline-msg">{connectMsg}</small>}
        </Field>

        <Field
          label="Provider"
          hint={
            settings.smtp.host.startsWith('smtp.zoho')
              ? 'Zoho: username is the FULL mailbox address (e.g. hello@shailog.com). With 2FA on, use an App Password (accounts.zoho.com → Security → App Passwords) — and enable IMAP/SMTP access in Zoho Mail Settings. From address must be this mailbox or a Zoho alias. Auth failing? Your account may live on another Zoho datacenter — try the other region.'
              : 'Pick a provider to auto-fill the server, or Custom to type your own host/port.'
          }
        >
          <select
            value={smtpProvider(settings.smtp.host)}
            onChange={(e) => {
              const p = SMTP_PROVIDERS.find((x) => x.value === e.target.value);
              if (!p) return;
              setSettings((s) => ({
                ...s,
                smtp: p.host
                  ? { ...s.smtp, host: p.host, port: p.port }
                  : { ...s.smtp }, // custom — keep whatever is typed
              }));
            }}
          >
            {SMTP_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
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

const CITY_SUGGESTIONS = [
  'Salem', 'Omalur', 'Mettur', 'Attur', 'Sankari', 'Edappadi', 'Gangavalli',
  'Namakkal', 'Tiruchengode', 'Rasipuram', 'Erode', 'Bhavani', 'Coimbatore',
  'Chennai', 'Bengaluru', 'Madurai', 'Trichy', 'Hosur', 'Vellore', 'Puducherry',
];

function CityTags({
  cities,
  onAdd,
  onRemove,
}: {
  cities: string[];
  onAdd: (c: string) => void;
  onRemove: (c: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = (value: string) => {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setDraft('');
  };

  return (
    <div className="tags-field">
      <div className="input-with-action">
        <input
          list="target-city-options"
          className="mono"
          placeholder="e.g. Salem, Omalur, Mettur…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              add(draft);
            }
          }}
        />
        <datalist id="target-city-options">
          {CITY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button className="btn btn-ghost" onClick={() => add(draft)}>
          Add
        </button>
      </div>
      <div className="tags">
        {cities.map((c) => (
          <span className="tag" key={c}>
            {c}
            <button onClick={() => onRemove(c)} aria-label={`Remove ${c}`}>
              ×
            </button>
          </span>
        ))}
        {cities.length === 0 && (
          <small>Country-level — add your district towns for local lead discovery.</small>
        )}
      </div>
    </div>
  );
}

const INDUSTRY_SUGGESTIONS = [
  'dental clinic', 'medical clinic', 'boutique hotel', 'fitness studio', 'gym',
  'restaurant', 'cafe', 'bakery', 'catering service', 'boutique law firm',
  'accounting firm', 'insurance agency', 'real estate agency', 'construction company',
  'architecture studio', 'interior design studio', 'driving school', 'coaching center',
  'beauty salon', 'spa', 'photography studio', 'event management company',
  'travel agency', 'car dealership', 'auto repair shop', 'furniture store',
  'jewellery store', 'pharmacy', 'logistics company', 'import export company',
];

function IndustryTags({
  industries,
  onAdd,
  onRemove,
}: {
  industries: string[];
  onAdd: (i: string) => void;
  onRemove: (i: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = (value: string) => {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setDraft('');
  };

  return (
    <div className="tags-field">
      <div className="input-with-action">
        <input
          list="target-industry-options"
          className="mono"
          placeholder="e.g. dental clinic, boutique hotel, gym…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              add(draft);
            }
          }}
        />
        <datalist id="target-industry-options">
          {INDUSTRY_SUGGESTIONS.map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
        <button className="btn btn-ghost" onClick={() => add(draft)}>
          Add
        </button>
      </div>
      <div className="tags">
        {industries.map((i) => (
          <span className="tag" key={i}>
            {i}
            <button onClick={() => onRemove(i)} aria-label={`Remove ${i}`}>
              ×
            </button>
          </span>
        ))}
        {industries.length === 0 && (
          <small>Auto ICP — buyer industries chosen from your services; competitors filtered.</small>
        )}
      </div>
    </div>
  );
}

function CountryTags({
  countries,
  onAdd,
  onRemove,
}: {
  countries: string[];
  onAdd: (c: string) => void;
  onRemove: (c: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = (value: string) => {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setDraft('');
  };

  return (
    <div className="tags-field">
      <div className="input-with-action">
        <input
          list="target-country-options"
          className="mono"
          placeholder="e.g. India, UAE, Germany…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              add(draft);
            }
          }}
        />
        <datalist id="target-country-options">
          {TARGET_COUNTRY_OPTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button className="btn btn-ghost" onClick={() => add(draft)}>
          Add
        </button>
      </div>
      <div className="tags">
        {countries.map((c) => (
          <span className="tag" key={c}>
            {c}
            <button onClick={() => onRemove(c)} aria-label={`Remove ${c}`}>
              ×
            </button>
          </span>
        ))}
        {countries.length === 0 && (
          <small>Worldwide — discovery sweeps the whole rotation (168 regions).</small>
        )}
      </div>
    </div>
  );
}
