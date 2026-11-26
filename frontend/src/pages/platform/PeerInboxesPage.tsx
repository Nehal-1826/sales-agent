/**
 * Platform admin Peer Inboxes — ported from the WarmPulse reference page
 * (P2 capacity grid) to the merged console conventions.
 *
 * Logic + data kept: live peer list + network stats, provider/inactive
 * filters with counts, search + sort (trust / capacity / last used),
 * multi-select bulk assign to pools, per-peer drawer with test-connection,
 * capacity reset, edit daily limit, activate/deactivate, delete and pool
 * membership add/remove (a peer may live in several pools), two-step add
 * dialog (identity → SMTP/IMAP credentials), CSV bulk import with per-row
 * failures, network-wide capacity reset, CSV export.
 *
 * Restyled: table + drawer instead of the animated card grid; the SVG
 * capacity ring became an inline trust bar + capacity cell. Reputation is
 * normalized to 0..1 — the backend also carries a 0..100 variant.
 */
import { useCallback, useMemo, useState } from 'react';
import { Chip, Field, PageHeader } from '../../components/ui';
import { Drawer, Modal } from '../../components/overlay';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { fmtDate, fmtNumber, fmtPercent, timeAgo } from '../../lib/format';
import {
  addPeerPoolMembers,
  bulkImportPeerInboxes,
  createPeerInbox,
  deletePeerInbox,
  downloadCsv,
  getPeerInboxStats,
  listPeerInboxes,
  listPeerPools,
  removePeerPoolMember,
  resetAllPeerCapacity,
  resetPeerCapacity,
  testPeerConnection,
  updatePeerInbox,
} from '../../lib/platformAdmin';
import type { PeerInboxRow, PeerPool, PeerProvider, PeerTestResult } from '../../lib/platformAdmin';

/* ---------------- helpers ---------------- */

type PeerStatus = 'active' | 'inactive' | 'degraded';
type SortKey = 'reputation' | 'capacity' | 'lastUsed';
type FilterKey = 'all' | 'google_ws' | 'office365' | 'yahoo' | 'inactive';

/** Wire says 0..1 but a 0..100 variant exists — display one scale. */
function normRep(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return score > 1 ? Math.min(1, score / 100) : Math.max(0, score);
}

function derivedStatus(p: PeerInboxRow): PeerStatus {
  const rep = normRep(p.reputation_score);
  if (!p.is_active) return 'inactive';
  if (rep > 0 && rep < 0.5) return 'degraded';
  return 'active';
}

function capPct(p: PeerInboxRow): number {
  return p.daily_capacity === 0 ? 0 : Math.min(1, p.sends_today / p.daily_capacity);
}

const PROVIDER_LABELS: Record<PeerProvider, string> = { google_ws: 'Google WS', office365: 'Office 365', yahoo: 'Yahoo' };

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider as PeerProvider] ?? provider;
}

function poolNames(p: PeerInboxRow): string[] {
  if (p.pool_memberships?.length) return p.pool_memberships.map((m) => m.pool_name);
  return p.pool_ids ?? [];
}

const statusTone = (s: PeerStatus): 'success' | 'warn' | 'neutral' => (s === 'active' ? 'success' : s === 'degraded' ? 'warn' : 'neutral');

/* ---------------- add dialog (two steps: identity → credentials) ---------------- */

const PROVIDER_PRESETS: { value: PeerProvider; label: string; smtp: string; smtpPort: number; imap: string; imapPort: number }[] = [
  { value: 'google_ws', label: 'Gmail / Workspace', smtp: 'smtp.gmail.com', smtpPort: 587, imap: 'imap.gmail.com', imapPort: 993 },
  { value: 'office365', label: 'Office 365', smtp: 'smtp.office365.com', smtpPort: 587, imap: 'outlook.office365.com', imapPort: 993 },
  { value: 'yahoo', label: 'Yahoo', smtp: 'smtp.mail.yahoo.com', smtpPort: 587, imap: 'imap.mail.yahoo.com', imapPort: 993 },
];

function AddPeerInboxModal({ demo, onClose, onDone }: { demo: boolean; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState<PeerProvider>('google_ws');
  const [capacity, setCapacity] = useState('40');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const preset = PROVIDER_PRESETS.find((p) => p.value === provider) ?? PROVIDER_PRESETS[0];
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const capOk = Number.isFinite(Number(capacity)) && Number(capacity) >= 1 && Number(capacity) <= 500;

  async function submit() {
    setBusy(true);
    setError('');
    const r = await createPeerInbox({
      email_address: email.trim(),
      provider,
      // blank host falls back to the provider's standard endpoints
      smtp_host: smtpHost.trim() || preset.smtp,
      smtp_port: Number(smtpPort) || preset.smtpPort,
      smtp_username: smtpUser.trim() || email.trim(),
      smtp_password: smtpPassword,
      imap_host: imapHost.trim() || preset.imap,
      imap_port: Number(imapPort) || preset.imapPort,
      imap_username: imapUser.trim() || email.trim(),
      // most providers accept the same app password for SMTP and IMAP
      imap_password: imapPassword || smtpPassword,
      daily_capacity: Number(capacity) || 40,
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(`Helper ${email.trim()} created.`);
    onDone();
    onClose();
  }

  return (
    <Modal
      title={step === 0 ? 'Add helper · identity' : 'Add helper · login details'}
      onClose={onClose}
      footer={
        step === 0 ? (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" disabled={!emailOk || !capOk} onClick={() => setStep(1)}>Next</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={() => setStep(0)} disabled={busy}>Back</button>
            <button className="btn btn-primary" disabled={busy || !smtpPassword} onClick={() => void submit()}>
              {busy ? 'Saving…' : 'Add helper'}
            </button>
          </>
        )
      }
    >
      {step === 0 ? (
        <>
          {error && <p className="pf-error" role="alert">{error}</p>}
          <Field label="Email" hint="The mailbox the platform controls.">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="warmer@example.com" data-autofocus />
          </Field>
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value as PeerProvider)} aria-label="Provider">
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Daily limit" hint="1–500 warmup sends per day.">
            <input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
        </>
      ) : (
        <>
          {demo && <p role="note">Demo data is read-only.</p>}
          {error && <p className="pf-error" role="alert">{error}</p>}
          <p className="field-hint">Credentials are Fernet-encrypted before storage. Use an app password — most providers reject the account password for SMTP/IMAP.</p>
          <fieldset className="field" style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '4px 12px 12px', margin: '10px 0' }}>
            <legend className="field-label">SMTP · outgoing</legend>
            <div className="pf-grid" style={{ gridTemplateColumns: '1fr 90px' }}>
              <Field label="Host">
                <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder={preset.smtp} />
              </Field>
              <Field label="Port">
                <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
              </Field>
            </div>
            <Field label="Username">
              <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="(defaults to email)" autoComplete="off" />
            </Field>
            <Field label="App password">
              <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="16-char app password" autoComplete="new-password" />
            </Field>
          </fieldset>
          <fieldset className="field" style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '4px 12px 12px', margin: '10px 0' }}>
            <legend className="field-label">IMAP · incoming</legend>
            <div className="pf-grid" style={{ gridTemplateColumns: '1fr 90px' }}>
              <Field label="Host">
                <input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder={preset.imap} />
              </Field>
              <Field label="Port">
                <input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
              </Field>
            </div>
            <Field label="Username">
              <input value={imapUser} onChange={(e) => setImapUser(e.target.value)} placeholder="(defaults to email)" autoComplete="off" />
            </Field>
            <Field label="App password">
              <input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)} placeholder="(defaults to SMTP password)" autoComplete="new-password" />
            </Field>
          </fieldset>
        </>
      )}
    </Modal>
  );
}

/* ---------------- bulk CSV import ---------------- */

function BulkImportModal({ demo, onClose, onDone }: { demo: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ succeeded: number; failed: { row: number; error: string }[] } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    const r = await bulkImportPeerInboxes(file);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResult(r.data);
    onDone();
  }

  return (
    <Modal
      title="Bulk import helpers"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Close</button>
          <button className="btn btn-primary" disabled={!file || busy} onClick={() => void upload()}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      {demo && <p role="note">Demo data is read-only.</p>}
      <Field label="CSV file (10 MiB max, UTF-8)" hint="Columns: email, provider, daily_capacity, smtp_host, smtp_port, smtp_username, smtp_password, imap_host, imap_port, imap_username, imap_password.">
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
      </Field>
      {error && <p className="pf-error" role="alert">{error}</p>}
      {result && (
        <div>
          <div className="pf-actions" style={{ marginTop: 4 }}>
            <Chip tone="success">Created {fmtNumber(result.succeeded)}</Chip>
            <Chip tone={result.failed.length ? 'warn' : 'neutral'}>Failed {fmtNumber(result.failed.length)}</Chip>
          </div>
          {result.failed.length > 0 && (
            <ul style={{ maxHeight: 180, overflowY: 'auto', margin: '10px 0 0', paddingLeft: 18 }}>
              {result.failed.map((f) => (
                <li key={f.row}><small>row {f.row} — {f.error}</small></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- peer drawer ---------------- */

function PeerDrawer({
  peer,
  demo,
  pools,
  onClose,
  onChanged,
}: {
  peer: PeerInboxRow;
  demo: boolean;
  pools: PeerPool[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [capacity, setCapacity] = useState(String(peer.daily_capacity));
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<PeerTestResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const rep = normRep(peer.reputation_score);
  const status = derivedStatus(peer);
  const pct = Math.round(capPct(peer) * 100);
  const days = Math.floor((Date.now() - new Date(peer.created_at).getTime()) / 86_400_000);

  const memberships = useMemo(() => {
    if (peer.pool_memberships?.length) return peer.pool_memberships;
    return (peer.pool_ids ?? []).map((id) => ({ pool_id: id, pool_name: pools.find((p) => p.id === id)?.name ?? id }));
  }, [peer, pools]);
  const memberIds = new Set(memberships.map((m) => m.pool_id));
  const availablePools = pools.filter((p) => !memberIds.has(p.id));

  /** Run a mutation, toast the outcome, refresh — answers true on success. */
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string): Promise<boolean> {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error ?? 'Action failed.');
      return false;
    }
    toast.success(okMsg);
    onChanged();
    return true;
  }

  const doTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await testPeerConnection(peer.id);
      setTest(r);
      if (r.smtp_ok && r.imap_ok) toast.success(`${peer.email}: SMTP + IMAP OK`);
      else toast.error(`${peer.email}: connection failed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Drawer title={peer.email} subtitle={`Helper · ${peer.id.slice(0, 8).toUpperCase()}`} onClose={onClose}>
      <div className="pf-actions" style={{ marginTop: 0, marginBottom: 14 }}>
        <Chip tone={statusTone(status)}>{status}</Chip>
        <Chip tone="accent">{providerLabel(peer.provider)}</Chip>
        {!peer.is_active && <Chip tone="neutral">inactive</Chip>}
      </div>

      <dl className="pf-dl">
        <dt>Trust score</dt><dd>{rep.toFixed(2)}{peer.reputation_score > 1 ? ' (normalized)' : ''}</dd>
        <dt>Daily limit</dt><dd>{fmtNumber(peer.sends_today)} / {fmtNumber(peer.daily_capacity)} ({fmtPercent(pct)})</dd>
        <dt>Sends today</dt><dd>{fmtNumber(peer.sends_today)}</dd>
        <dt>Days in network</dt><dd>{days > 0 ? `${days}d` : '—'}</dd>
        <dt>Last used</dt><dd>{timeAgo(peer.last_used_at) || 'never'}</dd>
        <dt>Created</dt><dd>{fmtDate(peer.created_at)}</dd>
      </dl>

      <h3 className="pf-h2">Account groups · a helper can be in several</h3>
      {memberships.length === 0 && <p className="field-hint">Not in any account group — add one below.</p>}
      <div className="pf-actions" style={{ marginTop: 0 }}>
        {memberships.map((m) => (
          <span key={m.pool_id} className="chip chip-accent" style={{ gap: 8 }}>
            {m.pool_name}
            <button
              type="button"
              aria-label={`Remove from ${m.pool_name}`}
              disabled={busy || demo}
              onClick={() => void run(() => removePeerPoolMember(m.pool_id, peer.id), `Removed from ${m.pool_name}.`)}
              style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <Field label="Add to account group">
        <select
          value=""
          disabled={busy || demo || availablePools.length === 0}
          onChange={(e) => {
            const poolId = e.target.value;
            if (poolId) void run(() => addPeerPoolMembers(poolId, [peer.id]), 'Added to account group.');
            e.target.value = '';
          }}
          aria-label="Add to account group"
        >
          <option value="">{availablePools.length === 0 ? 'Already in all account groups' : 'Choose…'}</option>
          {availablePools.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>
          ))}
        </select>
      </Field>

      <h3 className="pf-h2">Actions</h3>
      <div className="pf-actions">
        <button className="btn" disabled={busy || demo} onClick={() => void run(() => resetPeerCapacity(peer.id), 'Daily limit reset.')}>
          Reset daily limit (used {fmtNumber(peer.sends_today)})
        </button>
        <button className="btn" disabled={busy} onClick={() => setEditing(true)}>Edit daily limit…</button>
        <button className="btn btn-primary" disabled={testing} onClick={() => void doTest()}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        <button className="btn" disabled={busy || demo} onClick={() => void run(() => updatePeerInbox(peer.id, { is_active: !peer.is_active }), peer.is_active ? 'Helper deactivated.' : 'Helper reactivated.')}>
          {peer.is_active ? 'Deactivate helper' : 'Reactivate helper'}
        </button>
        <button className="btn btn-danger" disabled={busy || demo} onClick={() => setConfirmDelete(true)}>Delete helper</button>
      </div>

      {test && (
        <div style={{ marginTop: 10 }}>
          <Chip tone={test.smtp_ok ? 'success' : 'warn'}>SMTP {test.smtp_ok ? 'OK' : test.smtp_error || 'failed'}</Chip>{' '}
          <Chip tone={test.imap_ok ? 'success' : 'warn'}>IMAP {test.imap_ok ? 'OK' : test.imap_error || 'failed'}</Chip>
        </div>
      )}

      {editing && (
        <Modal
          title="Edit daily limit"
          onClose={() => setEditing(false)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!(Number(capacity) >= 1 && Number(capacity) <= 500) || demo}
                onClick={() => {
                  const next = Number(capacity);
                  void run(() => updatePeerInbox(peer.id, { daily_capacity: next }), 'Daily limit updated.').then((ok) => {
                    if (ok) setEditing(false);
                  });
                }}
              >
                Save
              </button>
            </>
          }
        >
          <p className="field-hint">{peer.email} — max warmup emails this helper sends per day (1–500).</p>
          <Field label="Daily limit">
            <input type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} data-autofocus />
          </Field>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete helper?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => {
                  void run(() => deletePeerInbox(peer.id), 'Helper deleted.').then(() => {
                    setConfirmDelete(false);
                    onClose();
                  });
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p role="note">This wipes the encrypted login details for <strong>{peer.email}</strong> and cancels any pending sends. Cannot be undone.</p>
        </Modal>
      )}
    </Drawer>
  );
}

/* ---------------- page ---------------- */

export function PeerInboxesPage({ demo = false }: { demo?: boolean }) {
  const list = useAsync(() => listPeerInboxes({ page: 1, page_size: 100 }), []);
  const stats = useAsync(getPeerInboxStats, []);
  const pools = useAsync(listPeerPools, []);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('reputation');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPoolId, setBulkPoolId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const peers = list.data?.items ?? [];
  const poolList = pools.data ?? [];

  const counts = useMemo(() => ({
    all: peers.length,
    google_ws: peers.filter((p) => p.provider === 'google_ws').length,
    office365: peers.filter((p) => p.provider === 'office365').length,
    yahoo: peers.filter((p) => p.provider === 'yahoo').length,
    inactive: peers.filter((p) => !p.is_active).length,
  }), [peers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...peers]
      .filter((p) => {
        const matchFilter = filter === 'all' || (filter === 'inactive' ? !p.is_active : p.provider === filter);
        const matchSearch = q === '' || p.email.toLowerCase().includes(q) || poolNames(p).some((n) => n.toLowerCase().includes(q));
        return matchFilter && matchSearch;
      })
      .sort((a, b) => {
        if (sort === 'reputation') return normRep(b.reputation_score) - normRep(a.reputation_score);
        if (sort === 'capacity') return capPct(b) - capPct(a);
        const ta = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const tb = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        return tb - ta;
      });
  }, [peers, filter, query, sort]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));

  async function bulkAssign() {
    if (!bulkPoolId || selected.size === 0) return;
    setResetBusy(true);
    const r = await addPeerPoolMembers(bulkPoolId, Array.from(selected));
    setResetBusy(false);
    if (!r.ok) return toast.error(r.error);
    const poolName = poolList.find((p) => p.id === bulkPoolId)?.name ?? 'account group';
    toast.success(`Added ${selected.size} helper${selected.size === 1 ? '' : 's'} to ${poolName}.`);
    setSelected(new Set());
    setBulkPoolId('');
    void list.reload();
    void pools.reload();
  }

  async function resetAll() {
    setResetBusy(true);
    const r = await resetAllPeerCapacity();
    setResetBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Daily limit reset for ${fmtNumber(r.data.peers_reset)} helper${r.data.peers_reset === 1 ? '' : 's'}.`);
    setResettingAll(false);
    void list.reload();
    void stats.reload();
  }

  function exportCsv() {
    const rows = selected.size > 0 ? peers.filter((p) => selected.has(p.id)) : visible;
    downloadCsv(
      `peer-inboxes-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Email', 'Provider', 'Status', 'Active', 'Trust score', 'Daily limit', 'Sends today', 'Account groups', 'Last used', 'Created'],
      rows.map((p) => [p.email, providerLabel(p.provider), derivedStatus(p), p.is_active ? 'yes' : 'no', normRep(p.reputation_score).toFixed(3), p.daily_capacity, p.sends_today, poolNames(p).join(' | '), p.last_used_at ?? '', p.created_at]),
    );
    toast.success(`${rows.length} helper${rows.length === 1 ? '' : 's'} exported.`);
  }

  const openPeer = peers.find((p) => p.id === openId) ?? null;
  const s = stats.data;
  const capPctVal = s && s.total_capacity > 0 ? Math.round((s.used_capacity_today / s.total_capacity) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Peer inboxes"
        subtitle={list.loading ? 'Fetching helpers…' : `${peers.length} helper${peers.length === 1 ? '' : 's'} in the warmup network · ${fmtNumber(s?.active ?? 0)} active`}
        actions={
          <>
            <button className="btn" onClick={exportCsv} disabled={peers.length === 0}>
              {selected.size > 0 ? `Export (${selected.size})` : 'Export CSV'}
            </button>
            <button className="btn" disabled={demo || peers.length === 0} onClick={() => setResettingAll(true)}>Reset daily limits</button>
            <button className="btn" disabled={demo} onClick={() => setImporting(true)}>Bulk import</button>
            <button className="btn btn-primary" disabled={demo} onClick={() => setAdding(true)}>Add helper</button>
          </>
        }
      />

      <div className="pf-kpis">
        <div className="pf-kpi"><strong>{stats.loading ? '…' : fmtNumber(s?.total ?? peers.length)}</strong><small>Total helpers</small></div>
        <div className="pf-kpi"><strong>{stats.loading ? '…' : fmtNumber(s?.active ?? 0)}</strong><small>Active</small></div>
        <div className="pf-kpi"><strong>{stats.loading ? '…' : (s ? normRep(s.avg_reputation).toFixed(2) : '—')}</strong><small>Avg trust score</small></div>
        <div className="pf-kpi"><strong>{stats.loading ? '…' : fmtPercent(capPctVal)}</strong><small>Daily limit used ({fmtNumber(s?.used_capacity_today ?? 0)}/{fmtNumber(s?.total_capacity ?? 0)})</small></div>
        <div className="pf-kpi"><strong>{stats.loading ? '…' : fmtNumber(s?.inactive ?? counts.inactive)}</strong><small>Inactive helpers</small></div>
      </div>

      {peers.length > 0 && (
        <div className="pf-filters">
          <input type="search" placeholder="Search email or account group…" aria-label="Search helpers" value={query} onChange={(e) => setQuery(e.target.value)} />
          {(['all', 'google_ws', 'office365', 'yahoo', 'inactive'] as FilterKey[]).map((k) => (
            <button key={k} className={`btn btn-sm${filter === k ? ' btn-primary' : ''}`} onClick={() => setFilter(k)}>
              {k === 'all' ? 'All' : k === 'inactive' ? 'Inactive' : PROVIDER_LABELS[k as PeerProvider]} ({counts[k]})
            </button>
          ))}
          <select aria-label="Sort helpers" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ marginLeft: 'auto' }}>
            <option value="reputation">By trust score</option>
            <option value="capacity">By daily limit used</option>
            <option value="lastUsed">By last used</option>
          </select>
        </div>
      )}

      {selected.size > 0 && (
        <div className="pf-actions" style={{ position: 'sticky', bottom: 12, zIndex: 5 }}>
          <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap' }}>
            <strong>{selected.size} helper{selected.size === 1 ? '' : 's'} selected</strong>
            <select aria-label="Assign to account group" value={bulkPoolId} onChange={(e) => setBulkPoolId(e.target.value)}>
              <option value="">Choose an account group…</option>
              {poolList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
            <button className="btn btn-primary" disabled={!bulkPoolId || resetBusy || demo} onClick={() => void bulkAssign()}>
              {resetBusy ? 'Assigning…' : 'Assign to account group'}
            </button>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())} disabled={resetBusy}>Clear</button>
          </div>
        </div>
      )}

      {list.error && <LoadError message={list.error} onRetry={() => void list.reload()} />}
      {list.loading && !list.data && <Skeleton rows={5} />}
      {list.data && peers.length === 0 && (
        <EmptyState title="No helpers yet">
          Add Gmail / Office 365 / Yahoo mailboxes the platform controls — they are the warmup counterparts that send and receive with client mailboxes.
        </EmptyState>
      )}
      {list.data && peers.length > 0 && visible.length === 0 && <EmptyState title="No helpers match the current filter." />}
      {list.data && visible.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Email</th>
                <th>Provider</th>
                <th>Account groups</th>
                <th>Trust</th>
                <th>Daily limit</th>
                <th>Status</th>
                <th>Last used</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const rep = normRep(p.reputation_score);
                return (
                  <tr key={p.id} onClick={() => setOpenId(p.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Select ${p.email}`}
                      />
                    </td>
                    <td>
                      <button className="row-link" onClick={(e) => { e.stopPropagation(); setOpenId(p.id); }}>{p.email}</button>
                    </td>
                    <td>{providerLabel(p.provider)}</td>
                    <td>{poolNames(p).join(', ') || <span title="Not in any account group">—</span>}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className="pf-hbar-track" style={{ width: 54 }} aria-hidden>
                          <span style={{ width: `${rep * 100}%` }} />
                        </span>
                        {rep.toFixed(2)}
                      </span>
                    </td>
                    <td>{fmtNumber(p.sends_today)} / {fmtNumber(p.daily_capacity)} ({fmtPercent(capPct(p) * 100)})</td>
                    <td><Chip tone={statusTone(derivedStatus(p))}>{derivedStatus(p)}</Chip></td>
                    <td>{timeAgo(p.last_used_at) || 'never'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {list.data && visible.length > 0 && (
        <label className="pf-pager" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) visible.forEach((p) => next.delete(p.id));
            else visible.forEach((p) => next.add(p.id));
            return next;
          })} />
          Select all {visible.length} shown
        </label>
      )}

      {openPeer && (
        <PeerDrawer
          peer={openPeer}
          demo={demo}
          pools={poolList}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            void list.reload();
            void stats.reload();
            void pools.reload();
          }}
        />
      )}

      {adding && <AddPeerInboxModal demo={demo} onClose={() => setAdding(false)} onDone={() => { void list.reload(); void stats.reload(); }} />}
      {importing && <BulkImportModal demo={demo} onClose={() => setImporting(false)} onDone={() => { void list.reload(); void stats.reload(); }} />}

      {resettingAll && (
        <Modal
          title="Reset daily limits for all helpers?"
          onClose={() => setResettingAll(false)}
          footer={
            <>
              <button className="btn" onClick={() => setResettingAll(false)} disabled={resetBusy}>Cancel</button>
              <button className="btn btn-primary" disabled={resetBusy} onClick={() => void resetAll()}>
                {resetBusy ? 'Resetting…' : 'Reset all'}
              </button>
            </>
          }
        >
          <p>Zeroes every helper's “used today” counter immediately, so the whole network can send again without waiting for the daily 00:01 UTC reset. Daily limits are unchanged.</p>
        </Modal>
      )}
    </>
  );
}

export default PeerInboxesPage;
