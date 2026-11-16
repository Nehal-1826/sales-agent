/**
 * Platform admin Users page — ported from frontend-warmpulse UsersPage
 * (U3 profile gallery) to the merged console conventions.
 *
 * Logic + data kept: user list + search + plan/status filters, KPI counters,
 * signup-rate stat, suspend / reactivate, plan change, delete, impersonate,
 * per-user payments section, multi-select bulk pause/resume of mailboxes
 * (empty user_ids = ALL client users), CSV export of the filtered rows.
 *
 * Restyled: table + drawer instead of the animated card grid; avatars are
 * initials (the token-gated avatar route is not wired in this app); the
 * god-mode sabotage actions live in the separate reference Revenge page and
 * are not ported.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip, Field, PageHeader } from '../../components/ui';
import { Drawer, Modal } from '../../components/overlay';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  bulkPauseMailboxes,
  deleteAdminUser,
  downloadCsv,
  getAdminSignupRate,
  impersonateAdminUser,
  listAdminPayments,
  listAdminPlans,
  listAdminUsers,
  suspendAdminUser,
  updateAdminUserPlan,
} from '../../lib/platformAdmin';
import type { AdminPayment, AdminUserRow } from '../../lib/platformAdmin';
import { ReasonDialog } from './shared';

const STATUS_LABELS: Record<AdminUserRow['status'], string> = { active: 'Active', suspended: 'Suspended', pending: 'Pending' };
const chipTone = (s: AdminUserRow['status']): 'success' | 'warn' | 'neutral' => (s === 'active' ? 'success' : s === 'suspended' ? 'warn' : 'neutral');

function initials(s: string): string {
  return (
    s
      .split(/[\s@.]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => (p[0] ?? '').toUpperCase())
      .join('') || '?'
  );
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 120) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  const days = Math.floor(secs / 86400);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const mos = Math.floor(days / 30);
  return `${mos} mo${mos === 1 ? '' : 's'} ago`;
}

const when = (s?: string | null): string => (s ? new Date(s).toLocaleDateString() : '—');

/* ---------------- per-user payments section (drawer) ---------------- */

function payStatusTone(s: AdminPayment['status']): 'success' | 'warn' | 'neutral' {
  if (s === 'succeeded') return 'success';
  if (s === 'refunded') return 'neutral';
  return 'warn';
}

function UserPayments({ row }: { row: AdminUserRow }) {
  const { data, error } = useAsync(() => listAdminPayments({ user_email: row.email, page: 1, page_size: 50 }), [row.email]);
  // belt-and-suspenders: an email may have been reused — guard by user_id too
  const payments = useMemo(() => (data?.items ?? []).filter((p) => p.user_id === row.id || p.user_email === row.email), [data, row.id, row.email]);

  return (
    <>
      <h3 className="pf-h2">Payments</h3>
      {error && <p className="pf-error" role="alert">{error}</p>}
      {!data && !error && <Skeleton rows={2} />}
      {data && payments.length === 0 && <EmptyState title="No payments found" />}
      {payments.map((p) => (
        <div key={p.id} className="pf-grid" style={{ gridTemplateColumns: '1fr auto', marginBottom: 6 }}>
          <div>
            <strong>${p.amount_usd.toFixed(2)}</strong> <small>{p.plan || 'Payment'}</small>
            <div>
              <small>{when(p.created_at)}</small>
            </div>
          </div>
          <Chip tone={payStatusTone(p.status)}>{p.status}</Chip>
        </div>
      ))}
    </>
  );
}

/* ---------------- user profile drawer ---------------- */

type DrawerAct = { kind: 'suspend' | 'unsuspend' } | { kind: 'delete' };

function UserDrawer({
  row,
  demo,
  onClose,
  onChanged,
}: {
  row: AdminUserRow;
  demo: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: plans } = useAsync(() => listAdminPlans(), []);
  const [act, setAct] = useState<DrawerAct | null>(null);
  const [planId, setPlanId] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [impBusy, setImpBusy] = useState(false);
  const isSuspended = row.status === 'suspended';
  const isPending = row.status === 'pending';
  const isSuperAdmin = row.role === 'super_admin';
  const displayName = row.name ?? row.email.split('@')[0] ?? row.email;

  async function applyPlan() {
    if (!planId) return;
    setPlanBusy(true);
    const r = await updateAdminUserPlan(row.id, planId);
    setPlanBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Plan updated for ${row.email}`);
    onChanged();
  }

  async function impersonate() {
    setImpBusy(true);
    const r = await impersonateAdminUser(row.id);
    setImpBusy(false);
    if (!r.ok) return toast.error(r.error);
    if (!r.data.access_token) return toast.error('Impersonation failed — backend returned no token.');
    // per-tab isolation: stash the short-lived token in sessionStorage and let
    // the new tab pick it up; the admin's own tab and token stay untouched
    try {
      sessionStorage.setItem('agentic-ai:impersonation', JSON.stringify({ token: r.data.access_token, email: row.email, exp: Date.now() + 30 * 60_000 }));
    } catch {
      /* storage unavailable */
    }
    const tab = window.open('/#/impersonate', '_blank');
    if (!tab) toast.warn('Allow pop-ups for this site to open the impersonated session.');
    else toast.success(`Opening session as ${row.email} in a new tab`);
  }

  return (
    <Drawer title={displayName} subtitle={row.email} onClose={onClose}>
      <div className="pf-actions" style={{ marginTop: 0, marginBottom: 14 }}>
        <Chip tone={chipTone(row.status)}>{STATUS_LABELS[row.status]}</Chip>
        {row.plan && <Chip tone="accent">{row.plan}</Chip>}
        {row.role && row.role !== 'client' && <Chip tone="neutral">{row.role}</Chip>}
      </div>
      <dl className="pf-dl">
        <dt>Email</dt>
        <dd>{row.email}</dd>
        <dt>Role</dt>
        <dd>{row.role ?? 'member'}</dd>
        <dt>Mailboxes</dt>
        <dd>{row.mailbox_count}</dd>
        <dt>Signed up</dt>
        <dd>{when(row.joined_at)}</dd>
        <dt>Last active</dt>
        <dd>{fmtRelative(row.last_seen_at)}</dd>
      </dl>

      {!isSuperAdmin && !isPending && (
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 14 }} disabled={impBusy} onClick={() => void impersonate()}>
          {impBusy ? 'Opening…' : `Enter as user — impersonate ${displayName}`}
        </button>
      )}
      {isPending && <p className="field-hint">Pending accounts cannot be impersonated until they verify their email.</p>}

      <Field label="Change plan">
        <div className="pf-actions" style={{ marginTop: 0 }}>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan">
            <option value="">Select plan…</option>
            {(plans ?? []).filter((p) => p.is_active).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-sm" disabled={!planId || planBusy || demo} onClick={() => void applyPlan()}>
            {planBusy ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </Field>

      <div className="pf-actions">
        {!isPending &&
          (isSuspended ? (
            <button className="btn" onClick={() => setAct({ kind: 'unsuspend' })} disabled={demo}>
              Reactivate
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => setAct({ kind: 'suspend' })} disabled={demo}>
              Suspend
            </button>
          ))}
        <button className="btn btn-danger" onClick={() => setAct({ kind: 'delete' })} disabled={demo}>
          Delete user
        </button>
      </div>

      <UserPayments row={row} />

      {act?.kind === 'suspend' && (
        <ReasonDialog
          title="Suspend user"
          confirmLabel="Suspend"
          danger
          demo={demo}
          run={(reason) => suspendAdminUser(row.id, true, reason)}
          onClose={() => setAct(null)}
          onDone={() => {
            setAct(null);
            toast.success(`${row.email} suspended.`);
            onChanged();
          }}
        />
      )}
      {act?.kind === 'unsuspend' && (
        <ReasonDialog
          title="Reactivate user"
          confirmLabel="Reactivate"
          demo={demo}
          run={(reason) => suspendAdminUser(row.id, false, reason)}
          onClose={() => setAct(null)}
          onDone={() => {
            setAct(null);
            toast.success(`${row.email} unsuspended.`);
            onChanged();
          }}
        />
      )}
      {act?.kind === 'delete' && (
        <ReasonDialog
          title="Permanently delete user"
          confirmLabel="Delete user"
          danger
          demo={demo}
          run={(reason) => deleteAdminUser(row.id, reason)}
          onClose={() => setAct(null)}
          onDone={() => {
            setAct(null);
            toast.success(`${row.email} deleted.`);
            onClose();
            onChanged();
          }}
        >
          <p role="note">
            {row.email} and all their mailboxes, warmup history, and audit rows will be removed. This cannot be undone.
          </p>
        </ReasonDialog>
      )}
    </Drawer>
  );
}

/* ---------------- bulk pause/resume confirm ---------------- */

function BulkPauseDialog({
  action,
  selectedCount,
  pending,
  onConfirm,
  onCancel,
}: {
  action: 'pause' | 'resume';
  selectedCount: number;
  pending: boolean;
  onConfirm: (scope: 'selected' | 'all') => void;
  onCancel: () => void;
}) {
  const verb = action === 'pause' ? 'Pause' : 'Resume';
  return (
    <Modal
      title={`${verb} all mailboxes?`}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button className="btn" onClick={() => onConfirm('all')} disabled={pending}>
            Apply to ALL client users
          </button>
          <button className={`btn ${action === 'pause' ? 'btn-danger' : 'btn-primary'}`} onClick={() => onConfirm('selected')} disabled={pending}>
            {pending ? 'Working…' : `${verb} ${selectedCount} selected`}
          </button>
        </>
      }
    >
      <p>
        {verb} warmup for all mailboxes of the {selectedCount} selected user{selectedCount === 1 ? '' : 's'}? Super admins are excluded automatically — ramp
        progress is kept.
      </p>
    </Modal>
  );
}

/* ---------------- page ---------------- */

export function AdminUsersPage({ demo = false }: { demo?: boolean }) {
  const [query, setQuery] = useState('');
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AdminUserRow['status'] | null>(null);
  const [open, setOpen] = useState<AdminUserRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pause' | 'resume' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data, error, loading, reload } = useAsync(() => listAdminUsers({ page: 1, page_size: 100 }), [], { keepStale: true });
  const signup = useAsync(async () => (await getAdminSignupRate(30)).reduce((acc, p) => acc + (p.signups ?? 0), 0), []);
  const rows = useMemo(() => data?.items ?? [], [data]);

  // KPI counts from the loaded page
  const counts = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let pending = 0;
    for (const r of rows) {
      if (r.status === 'active') active++;
      else if (r.status === 'suspended') suspended++;
      else pending++;
    }
    return { total: data?.total ?? rows.length, active, suspended, pending };
  }, [rows, data]);

  const planOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) if (r.plan) seen.add(r.plan);
    return Array.from(seen).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (planFilter && r.plan !== planFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (q) return r.email.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, planFilter, statusFilter, query]);

  // bulk selection — super admins excluded everywhere (backend skips them too)
  const selectable = useMemo(() => filtered.filter((r) => r.role !== 'super_admin'), [filtered]);
  const allSelected = selectable.length > 0 && selectable.every((r) => selectedIds.has(r.id));
  const someSelected = !allSelected && selectable.some((r) => selectedIds.has(r.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const every = selectable.length > 0 && selectable.every((r) => prev.has(r.id));
      const next = new Set(prev);
      if (every) for (const r of selectable) next.delete(r.id);
      else for (const r of selectable) next.add(r.id);
      return next;
    });
  }, [selectable]);

  async function runBulk(scope: 'selected' | 'all') {
    if (!bulkAction) return;
    setBulkBusy(true);
    const r = await bulkPauseMailboxes({ user_ids: scope === 'all' ? [] : Array.from(selectedIds), action: bulkAction });
    setBulkBusy(false);
    if (!r.ok) return toast.error(r.error);
    const res = r.data;
    const skipped = res.skipped_super_admin > 0 ? ` (${res.skipped_super_admin} admin${res.skipped_super_admin === 1 ? '' : 's'} skipped)` : '';
    toast.success(
      `${bulkAction === 'pause' ? 'Paused' : 'Resumed'} ${res.mailboxes_updated} mailbox${res.mailboxes_updated === 1 ? '' : 'es'} across ${res.users_affected} user${res.users_affected === 1 ? '' : 's'}${skipped}.`,
    );
    setBulkAction(null);
    setSelectedIds(new Set());
    void reload();
  }

  function exportCsv() {
    downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, ['Email', 'Name', 'Plan', 'Role', 'Status', 'Mailboxes', 'Joined At', 'Last Seen At', 'User ID'], filtered.map((u) => [u.email, u.name ?? '', u.plan ?? '', u.role ?? 'member', u.status, u.mailbox_count, u.joined_at, u.last_seen_at ?? '', u.id]));
    toast.success(`${filtered.length} user${filtered.length === 1 ? '' : 's'} exported.`);
  }

  // Ctrl/Cmd+F focuses the admin search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          loading
            ? 'Fetching users…'
            : `${counts.total} users · ${counts.active} active · ${signup.data ?? 0} new in 30d`
        }
        actions={
          <button className="btn" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </button>
        }
      />

      <div className="pf-kpis">
        <div className="pf-kpi">
          <strong>{loading ? '…' : counts.total.toLocaleString()}</strong>
          <small>Total users</small>
        </div>
        <div className="pf-kpi">
          <strong>{loading ? '…' : counts.active.toLocaleString()}</strong>
          <small>Active</small>
        </div>
        <div className="pf-kpi">
          <strong>{loading ? '…' : counts.suspended.toLocaleString()}</strong>
          <small>Suspended</small>
        </div>
        <div className="pf-kpi">
          <strong>{loading ? '…' : counts.pending.toLocaleString()}</strong>
          <small>Pending</small>
        </div>
      </div>

      <div className="pf-filters">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search email or name…"
          aria-label="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(['active', 'suspended', 'pending'] as const).map((s) => (
          <button key={s} className={`btn btn-sm${statusFilter === s ? ' btn-primary' : ''}`} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        {planOptions.length > 0 && (
          <select aria-label="Plan filter" value={planFilter ?? ''} onChange={(e) => setPlanFilter(e.target.value || null)}>
            <option value="">All plans</option>
            {planOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <label className="pf-pager" style={{ margin: 0, gap: 7 }}>
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={selectable.length === 0} aria-label="Select all filtered users" ref={(el) => { if (el) el.indeterminate = someSelected; }} />
          Select all ({selectable.length} filtered)
        </label>
        <small style={{ marginLeft: 'auto' }}>{loading ? '…' : `${filtered.length} of ${rows.length}`}</small>
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && filtered.length === 0 && <EmptyState title={rows.length === 0 ? 'No users yet' : 'No users match'} />}
      {data && filtered.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>User</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Role</th>
                <th>Mailboxes</th>
                <th>Last active</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} onClick={() => setOpen(r)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      disabled={r.role === 'super_admin'}
                      title={r.role === 'super_admin' ? 'Admins excluded from bulk actions' : `Select ${r.email}`}
                      aria-label={r.role === 'super_admin' ? 'Admins excluded from bulk actions' : `Select ${r.email}`}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  <td>
                    <button className="row-link" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>
                      {initials(r.name ?? r.email)} {r.name ?? r.email.split('@')[0]}
                    </button>
                    <div>
                      <small>{r.email}</small>
                    </div>
                  </td>
                  <td>{r.plan ? <Chip tone="accent">{r.plan}</Chip> : '—'}</td>
                  <td>
                    <Chip tone={chipTone(r.status)}>{STATUS_LABELS[r.status]}</Chip>
                  </td>
                  <td>{r.role ?? 'member'}</td>
                  <td>{r.mailbox_count}</td>
                  <td>{fmtRelative(r.last_seen_at)}</td>
                  <td>{when(r.joined_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="pf-actions" style={{ position: 'sticky', bottom: 12, zIndex: 5 }}>
          <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap' }}>
            <strong>{selectedIds.size} selected</strong>
            <button className="btn" onClick={() => setBulkAction('pause')} disabled={demo}>
              Pause all mailboxes
            </button>
            <button className="btn" onClick={() => setBulkAction('resume')} disabled={demo}>
              Resume all mailboxes
            </button>
            <button className="btn btn-sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
          </div>
        </div>
      )}

      {open && <UserDrawer row={open} demo={demo} onClose={() => setOpen(null)} onChanged={() => void reload()} />}

      {bulkAction && (
        <BulkPauseDialog
          action={bulkAction}
          selectedCount={selectedIds.size}
          pending={bulkBusy}
          onConfirm={(scope) => void runBulk(scope)}
          onCancel={() => setBulkAction(null)}
        />
      )}
    </>
  );
}
