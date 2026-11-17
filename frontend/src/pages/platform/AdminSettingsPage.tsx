/**
 * Platform admin Settings page — ported from frontend-warmpulse SettingsPage
 * (SE2 settings cards) to the merged console conventions.
 *
 * Logic + data kept: platform defaults (warmup ramp, human delay, email
 * identity), AI provider key + token cap + spend, Google OAuth credentials,
 * transactional SMTP, danger zone (maintenance mode, AI key rotation, peer
 * pool health reset) with typed-CONFIRM guards, and per-section connection
 * tests. Reads soft-fail to safe defaults while backend stubs are 501.
 *
 * Restyled: expandable cards on the pf- grid instead of the animated glass
 * stack; includes animated platform-admin Two-factor security management.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TwoFactorPanel, type TwoFactorApi } from '../../components/TwoFactorPanel';
import { Chip, Field, PageHeader, SectionLabel, Toggle } from '../../components/ui';
import { LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  getPlatform2faStatus,
  totpConfirm,
  totpDisable,
  totpRotateConfirm,
  totpRotateStart,
  totpSetup,
} from '../../lib/platform';
import {
  downloadCsv,
  getAdminSettings,
  resetPeerPoolHealth,
  rotateAdminLlmKey,
  testAdminLlm,
  testAdminOauth,
  testAdminSmtp,
  toggleMaintenanceMode,
  updateAdminDefaults,
  updateAdminLlm,
  updateAdminOauth,
  updateAdminSmtp,
} from '../../lib/platformAdmin';
import type { AdminSettings, TestConnectionResult } from '../../lib/platformAdmin';

/* ---------------- shared bits ---------------- */

type TestState = { busy: boolean; result: TestConnectionResult | null };

function useTester(call: () => Promise<TestConnectionResult>) {
  const [state, setState] = useState<TestState>({ busy: false, result: null });
  const run = async () => {
    setState({ busy: true, result: null });
    try {
      const result = await call();
      setState({ busy: false, result });
      if (result.ok) toast.success(result.detail ?? 'Connection test passed.');
      else toast.error(`Test failed: ${result.error ?? 'unknown error'}`);
    } catch {
      setState({ busy: false, result: { ok: false, error: 'network_error' } });
      toast.error('Test failed — the server could not be reached.');
    }
  };
  return { ...state, run };
}

function TestResult({ result }: { result: TestConnectionResult | null }) {
  if (!result) return null;
  return (
    <p className={result.ok ? 'field-hint' : 'pf-error'} role={result.ok ? 'note' : 'alert'}>
      {result.ok
        ? (result.detail ?? 'Test passed — the endpoint is healthy.')
        : `Test failed: ${result.error ?? 'unknown error'}`}
    </p>
  );
}

/** Collapsible settings card with an optional per-card Save row. */
function SettingsCard({
  title,
  summary,
  tag,
  dirty,
  saveLabel = 'Save',
  savePending,
  onSave,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary: string;
  tag?: ReactNode;
  dirty?: boolean;
  saveLabel?: string;
  savePending?: boolean;
  onSave?: () => void;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card pf-plan">
      <button type="button" className="row-link" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, textAlign: 'left' }} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <strong>{title}</strong>
            {tag}
            {dirty && <Chip tone="warn">Unsaved</Chip>}
          </span>
          <span className="field-hint" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary}
          </span>
        </span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 14, paddingTop: 12 }}>
          {children}
          {onSave && (
            <div className="pf-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-sm" onClick={() => setOpen(false)} disabled={savePending}>
                Close
              </button>
              <button className="btn btn-sm btn-primary" disabled={!dirty || savePending} onClick={onSave}>
                {savePending ? 'Saving…' : saveLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------- danger row with typed CONFIRM ---------------- */

function DangerActionRow({
  title,
  description,
  actionLabel,
  pending,
  onConfirm,
}: {
  title: string;
  description: string;
  actionLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState('');
  return (
    <div style={{ display: 'grid', gap: 6, padding: '10px 0', borderBottom: '1px solid var(--border-soft, rgba(255,255,255,0.08))' }}>
      <div>
        <strong>{title}</strong>
        <div className="field-hint">{description}</div>
      </div>
      {confirming ? (
        <div className="pf-actions" style={{ marginTop: 0 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Type "CONFIRM" to enable' style={{ fontFamily: 'monospace' }} aria-label={`Type CONFIRM to ${actionLabel}`} />
          <button className="btn btn-danger btn-sm" disabled={text !== 'CONFIRM' || pending} onClick={() => { onConfirm(); setConfirming(false); setText(''); }}>
            {pending ? 'Working…' : 'Confirm'}
          </button>
          <button className="btn btn-sm" onClick={() => { setConfirming(false); setText(''); }}>
            Cancel
          </button>
        </div>
      ) : (
        <div>
          <button className="btn btn-sm btn-danger" onClick={() => setConfirming(true)}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- page ---------------- */

export function AdminSettingsPage({ demo = false }: { demo?: boolean }) {
  const { data, error, reload } = useAsync(() => getAdminSettings(), []);
  const s = data;

  // ── platform defaults ────────────────────────────────────────────────
  const [defaults, setDefaults] = useState<AdminSettings['defaults'] | null>(null);
  const [defaultsClean, setDefaultsClean] = useState<AdminSettings['defaults'] | null>(null);
  const [defaultsBusy, setDefaultsBusy] = useState(false);
  useEffect(() => {
    if (!s) return;
    setDefaults(s.defaults);
    setDefaultsClean(s.defaults);
  }, [s]);
  const defaultsDirty = !!defaults && !!defaultsClean && JSON.stringify(defaults) !== JSON.stringify(defaultsClean);

  async function saveDefaults() {
    if (!defaults) return;
    setDefaultsBusy(true);
    const r = await updateAdminDefaults(defaults);
    setDefaultsBusy(false);
    if (!r.ok) return toast.error(r.error);
    setDefaultsClean(defaults);
    toast.success('Platform defaults saved');
    void reload();
  }

  // ── AI provider ──────────────────────────────────────────────────────
  const [llmKey, setLlmKey] = useState('');
  const [llmCap, setLlmCap] = useState(100_000);
  const [llmBusy, setLlmBusy] = useState(false);
  useEffect(() => {
    if (s) setLlmCap(s.llm.default_cap_tokens || 100_000);
  }, [s]);
  const llmDirty = llmKey.length > 0 || llmCap !== (s?.llm.default_cap_tokens ?? 100_000);
  const llmTest = useTester(testAdminLlm);

  async function saveLlm() {
    setLlmBusy(true);
    const payload: { api_key?: string; default_cap_tokens: number } = { default_cap_tokens: llmCap };
    if (llmKey) payload.api_key = llmKey;
    const r = await updateAdminLlm(payload);
    setLlmBusy(false);
    if (!r.ok) return toast.error(r.error);
    setLlmKey('');
    toast.success('AI settings saved');
    void reload();
  }

  // ── Google OAuth ─────────────────────────────────────────────────────
  const [oauthId, setOauthId] = useState('');
  const [oauthSecret, setOauthSecret] = useState('');
  const [oauthBusy, setOauthBusy] = useState(false);
  const oauthDirty = oauthId.length > 0 || oauthSecret.length > 0;
  const oauthTest = useTester(testAdminOauth);

  async function saveOauth() {
    const payload: { client_id?: string; client_secret?: string } = {};
    if (oauthId) payload.client_id = oauthId;
    if (oauthSecret) payload.client_secret = oauthSecret;
    if (Object.keys(payload).length === 0) return toast.warn('Nothing to update — enter a new client id or secret first.');
    setOauthBusy(true);
    const r = await updateAdminOauth(payload);
    setOauthBusy(false);
    if (!r.ok) return toast.error(r.error);
    setOauthId('');
    setOauthSecret('');
    toast.success('Google OAuth login details saved');
    void reload();
  }

  // ── transactional SMTP ───────────────────────────────────────────────
  const [smtp, setSmtp] = useState({ host: '', port: 587, username: '', password: '', from_addr: '', starttls: true });
  const [smtpBusy, setSmtpBusy] = useState(false);
  useEffect(() => {
    if (!s) return;
    setSmtp({ host: s.transactional_smtp.host ?? '', port: s.transactional_smtp.port ?? 587, username: s.transactional_smtp.username ?? '', password: '', from_addr: s.transactional_smtp.from_addr ?? '', starttls: s.transactional_smtp.starttls ?? true });
  }, [s]);
  const smtpDirty =
    smtp.password.length > 0 ||
    smtp.host !== (s?.transactional_smtp.host ?? '') ||
    smtp.port !== (s?.transactional_smtp.port ?? 587) ||
    smtp.username !== (s?.transactional_smtp.username ?? '') ||
    smtp.from_addr !== (s?.transactional_smtp.from_addr ?? '') ||
    smtp.starttls !== (s?.transactional_smtp.starttls ?? true);
  const smtpTest = useTester(testAdminSmtp);

  async function saveSmtp() {
    setSmtpBusy(true);
    const r = await updateAdminSmtp({ host: smtp.host, port: smtp.port, username: smtp.username, from_addr: smtp.from_addr, starttls: smtp.starttls, ...(smtp.password ? { password: smtp.password } : {}) });
    setSmtpBusy(false);
    if (!r.ok) return toast.error(r.error);
    setSmtp((v) => ({ ...v, password: '' }));
    toast.success('Transactional SMTP saved');
    void reload();
  }

  // ── danger zone ──────────────────────────────────────────────────────
  const [dangerBusy, setDangerBusy] = useState<string | null>(null);
  const maintenanceOn = Boolean(s?.danger?.maintenance_mode);

  async function runDanger(key: string, fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, okMsg: string) {
    setDangerBusy(key);
    const r = await fn();
    setDangerBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(okMsg);
    void reload();
  }

  // ── snapshot export (non-secret fields only) ─────────────────────────
  const snapshot = useMemo(() => {
    if (!s) return [];
    return [
      ['defaults.ramp_day1', String(s.defaults.ramp_day1)],
      ['defaults.ramp_day7_target', String(s.defaults.ramp_day7_target)],
      ['defaults.human_delay_min_s', String(s.defaults.human_delay_min_s)],
      ['defaults.human_delay_max_s', String(s.defaults.human_delay_max_s)],
      ['defaults.email_from_display_name', s.defaults.email_from_display_name],
      ['defaults.reply_to', s.defaults.reply_to],
      ['defaults.warmup_log_retention_days', String(s.defaults.warmup_log_retention_days)],
      ['llm.default_cap_tokens', String(s.llm.default_cap_tokens)],
      ['llm.spend_mtd_usd', String(s.llm.spend_mtd_usd)],
      ['llm.configured', String(s.llm.configured)],
      ['google_oauth.configured', String(s.google_oauth.configured)],
      ['transactional_smtp.mode', s.transactional_smtp.mode],
      ['transactional_smtp.host', s.transactional_smtp.host],
      ['danger.maintenance_mode', String(s.danger.maintenance_mode)],
    ] as [string, string][];
  }, [s]);

  const [twoFaEnabled, setTwoFaEnabled] = useState<boolean | null>(null);
  const twoFaApi = useMemo<TwoFactorApi>(
    () => ({
      getStatus: getPlatform2faStatus,
      setup: totpSetup,
      confirm: totpConfirm,
      disable: totpDisable,
      rotateStart: totpRotateStart,
      rotateConfirm: totpRotateConfirm,
    }),
    [],
  );

  const anyDirty = defaultsDirty || llmDirty || oauthDirty || smtpDirty;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={error ? 'Could not load platform configuration.' : 'Platform configuration · expand a card to edit inline'}
        actions={
          <button className="btn" disabled={snapshot.length === 0} onClick={() => downloadCsv(`admin-settings-${new Date().toISOString().slice(0, 10)}.csv`, ['Setting', 'Value'], snapshot)}>
            Export snapshot
          </button>
        }
      />

      <SettingsCard
        title="Two-factor authentication"
        summary={
          twoFaEnabled === null
            ? 'Checking authenticator protection…'
            : twoFaEnabled
              ? 'Authenticator app active · required on every console sign-in'
              : 'Not enrolled · set up an authenticator app for console security'
        }
        tag={
          twoFaEnabled === null ? undefined : (
            <Chip tone={twoFaEnabled ? 'success' : 'warn'}>{twoFaEnabled ? 'Enabled' : 'Not set up'}</Chip>
          )
        }
        defaultOpen
      >
        <TwoFactorPanel
          api={twoFaApi}
          demo={demo}
          description="Protect your platform admin account with a TOTP authenticator app (Google Authenticator, Authy, 1Password)."
          enabledNote="Console sign-ins and privileged platform actions require a 6-digit code from your authenticator."
          onStatusChange={setTwoFaEnabled}
        />
      </SettingsCard>

      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!s && !error && <Skeleton rows={6} />}

      {s && (
        <>
          {anyDirty && (
            <p role="note" className="field-hint" style={{ marginBottom: 10 }}>
              You have unsaved changes — save each card individually.
            </p>
          )}

          <div className="pf-grid">
            {/* ── platform defaults ── */}
            <SettingsCard
              title="Platform defaults"
              summary={`Build-up D1: ${defaults?.ramp_day1 ?? '—'} · D7 target: ${defaults?.ramp_day7_target ?? '—'} · delay ${defaults?.human_delay_min_s ?? '—'}–${defaults?.human_delay_max_s ?? '—'}s`}
              dirty={defaultsDirty}
              savePending={defaultsBusy}
              onSave={() => void saveDefaults()}
              defaultOpen
            >
              {defaults && (
                <>
                  <SectionLabel>Daily build-up</SectionLabel>
                  <div className="pf-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <Field label="Day 1 sends" hint="ramp_day1">
                      <input type="number" min={1} max={100} value={defaults.ramp_day1} onChange={(e) => setDefaults({ ...defaults, ramp_day1: Number(e.target.value) })} />
                    </Field>
                    <Field label="Day 7 target" hint="ramp_day7_target">
                      <input type="number" min={1} max={200} value={defaults.ramp_day7_target} onChange={(e) => setDefaults({ ...defaults, ramp_day7_target: Number(e.target.value) })} />
                    </Field>
                    <Field label="Min delay (s)" hint="human_delay_min_s">
                      <input type="number" min={1} max={3600} value={defaults.human_delay_min_s} onChange={(e) => setDefaults({ ...defaults, human_delay_min_s: Number(e.target.value) })} />
                    </Field>
                    <Field label="Max delay (s)" hint="human_delay_max_s">
                      <input type="number" min={1} max={3600} value={defaults.human_delay_max_s} onChange={(e) => setDefaults({ ...defaults, human_delay_max_s: Number(e.target.value) })} />
                    </Field>
                  </div>
                  <SectionLabel>Email identity</SectionLabel>
                  <Field label="Default from-name">
                    <input value={defaults.email_from_display_name} placeholder="Asha from WarmPulse" onChange={(e) => setDefaults({ ...defaults, email_from_display_name: e.target.value })} />
                  </Field>
                  <Field label="Reply-to address">
                    <input value={defaults.reply_to} placeholder="reply@warmpulse.io" style={{ fontFamily: 'monospace' }} onChange={(e) => setDefaults({ ...defaults, reply_to: e.target.value })} />
                  </Field>
                </>
              )}
            </SettingsCard>

            {/* ── AI provider ── */}
            <SettingsCard
              title="AI provider"
              summary={s.llm.configured ? `Key: ${s.llm.api_key_masked || '…'} · cap ${llmCap.toLocaleString()} tokens/mo` : 'API key not configured'}
              tag={<Chip tone={s.llm.configured ? 'success' : 'warn'}>{s.llm.configured ? 'Connected' : 'Missing key'}</Chip>}
              dirty={llmDirty}
              savePending={llmBusy}
              onSave={() => void saveLlm()}
            >
              <Field label="API key" hint={s.llm.api_key_masked ? `Current: ${s.llm.api_key_masked}` : 'Provider key for content generation'}>
                <input type="password" value={llmKey} placeholder="Paste provider API key" style={{ fontFamily: 'monospace' }} onChange={(e) => setLlmKey(e.target.value)} />
              </Field>
              <Field label="Default cap (tokens/month)">
                <input type="number" min={1000} step={1000} value={llmCap} onChange={(e) => setLlmCap(Number(e.target.value))} />
              </Field>
              <div className="pf-kpi">
                <strong>${(s.llm.spend_mtd_usd ?? 0).toFixed(2)}</strong>
                <small>Month-to-date AI spend</small>
              </div>
              <TestResult result={llmTest.result} />
              <div className="pf-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-sm" disabled={llmTest.busy || demo} onClick={() => void llmTest.run()}>
                  {llmTest.busy ? 'Testing…' : 'Test key'}
                </button>
              </div>
            </SettingsCard>

            {/* ── Google OAuth ── */}
            <SettingsCard
              title="Google OAuth"
              summary={s.google_oauth.configured ? `Client ID: ${s.google_oauth.client_id_masked || '…'}` : 'Not configured — mailbox connect will fail'}
              tag={<Chip tone={s.google_oauth.configured ? 'success' : 'warn'}>{s.google_oauth.configured ? 'Connected' : 'Not set'}</Chip>}
              dirty={oauthDirty}
              savePending={oauthBusy}
              onSave={() => void saveOauth()}
            >
              <Field label="Client ID">
                <input value={oauthId} placeholder={s.google_oauth.client_id_masked || '1234567890-abc.apps.googleusercontent.com'} style={{ fontFamily: 'monospace' }} onChange={(e) => setOauthId(e.target.value)} />
              </Field>
              <Field label="Client secret">
                <input type="password" value={oauthSecret} placeholder="••••••••••••" style={{ fontFamily: 'monospace' }} onChange={(e) => setOauthSecret(e.target.value)} />
              </Field>
              <TestResult result={oauthTest.result} />
              <div className="pf-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-sm" disabled={oauthTest.busy || demo} onClick={() => void oauthTest.run()}>
                  {oauthTest.busy ? 'Testing…' : 'Test connection'}
                </button>
              </div>
            </SettingsCard>

            {/* ── transactional SMTP ── */}
            <SettingsCard
              title="Transactional email (SMTP)"
              summary={
                s.transactional_smtp.mode === 'admin'
                  ? `Live · ${s.transactional_smtp.host || '—'}`
                  : s.transactional_smtp.mode === 'env'
                    ? `Live via env · ${s.transactional_smtp.env_host || '—'}`
                    : 'Dry-run — emails are logged, not delivered'
              }
              tag={<Chip tone={s.transactional_smtp.mode !== 'dry_run' ? 'success' : 'warn'}>{s.transactional_smtp.mode !== 'dry_run' ? 'Live' : 'Dry-run'}</Chip>}
              dirty={smtpDirty}
              savePending={smtpBusy}
              onSave={() => void saveSmtp()}
            >
              <div className="pf-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Field label="Host">
                  <input value={smtp.host} placeholder="smtp.zoho.in" style={{ fontFamily: 'monospace' }} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
                </Field>
                <Field label="Port">
                  <input type="number" min={1} max={65535} value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
                </Field>
                <Field label="Username">
                  <input value={smtp.username} placeholder="alerts@yourdomain.com" style={{ fontFamily: 'monospace' }} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
                </Field>
                <Field label="Password" hint={s.transactional_smtp.password_masked ? `Current: ${s.transactional_smtp.password_masked}` : undefined}>
                  <input type="password" value={smtp.password} placeholder="••••••••••••" style={{ fontFamily: 'monospace' }} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} />
                </Field>
                <Field label="From address">
                  <input value={smtp.from_addr} placeholder="WarmPulse <alerts@yourdomain.com>" style={{ fontFamily: 'monospace' }} onChange={(e) => setSmtp({ ...smtp, from_addr: e.target.value })} />
                </Field>
                <Field label="STARTTLS (recommended)">
                  <Toggle checked={smtp.starttls} onChange={(v) => setSmtp({ ...smtp, starttls: v })} label="STARTTLS" />
                </Field>
              </div>
              <TestResult result={smtpTest.result} />
              <div className="pf-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-sm" disabled={smtpTest.busy || demo} onClick={() => void smtpTest.run()}>
                  {smtpTest.busy ? 'Sending…' : 'Send test email'}
                </button>
              </div>
            </SettingsCard>

            {/* ── danger zone ── */}
            <SettingsCard title="Danger zone" summary={maintenanceOn ? 'MAINTENANCE MODE ON · warmup paused' : 'Destructive ops · each action requires CONFIRM'} tag={maintenanceOn ? <Chip tone="warn">Maintenance</Chip> : undefined}>
              <p className="field-hint">Every action below is audited. Type CONFIRM inline before it will execute.</p>
              <DangerActionRow
                title={maintenanceOn ? 'Leave maintenance mode' : 'Enter maintenance mode'}
                description={
                  maintenanceOn
                    ? 'Resumes the API, Celery worker, and warmup cycles for all customers.'
                    : 'Puts the API into read-only mode, pauses workers and halts all outbound warmup sends.'
                }
                actionLabel={maintenanceOn ? 'Leave maintenance' : 'Enter maintenance'}
                pending={dangerBusy === 'maintenance'}
                onConfirm={() => void runDanger('maintenance', () => toggleMaintenanceMode(!maintenanceOn), maintenanceOn ? 'Maintenance mode disabled' : 'Maintenance mode enabled')}
              />
              <DangerActionRow
                title="Rotate AI API key"
                description="Generates a new key, replaces the encrypted key in the DB, and invalidates pending jobs."
                actionLabel="Rotate key"
                pending={dangerBusy === 'rotate'}
                onConfirm={() => void runDanger('rotate', rotateAdminLlmKey, 'AI key rotated')}
              />
              <DangerActionRow
                title="Reset account group health counters"
                description="Zeroes trust scores, send counters, and last-used timestamps on every test account."
                actionLabel="Reset counters"
                pending={dangerBusy === 'reset'}
                onConfirm={() => void runDanger('reset', resetPeerPoolHealth, 'Account group counters reset')}
              />
            </SettingsCard>
          </div>

          {/* engine summary strip */}
          <div className="pf-kpis">
            <div className="pf-kpi">
              <strong>{s.llm.configured ? 'Configured' : 'Missing key'}</strong>
              <small>AI</small>
            </div>
            <div className="pf-kpi">
              <strong>{s.google_oauth.configured ? 'Configured' : 'Not set'}</strong>
              <small>OAuth</small>
            </div>
            <div className="pf-kpi">
              <strong>{s.transactional_smtp.mode === 'dry_run' ? 'Dry-run' : s.transactional_smtp.mode === 'env' ? 'Live · env' : 'Live'}</strong>
              <small>SMTP</small>
            </div>
            <div className="pf-kpi">
              <strong>{maintenanceOn ? 'On' : 'Off'}</strong>
              <small>Maintenance</small>
            </div>
          </div>
        </>
      )}
    </>
  );
}
