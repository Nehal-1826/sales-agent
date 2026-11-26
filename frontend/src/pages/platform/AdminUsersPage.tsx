/**
 * Platform admin Users page — the REAL accounts (the main system people sign
 * in to), each joined to its warmup copy by email.
 *
 * The table, the search, the role and status buttons, the counters, the
 * pages and the CSV export all read the accounts (`listPlatformUsers`). The
 * warmup list is still loaded, exactly as before, for the two things that
 * live on that side: mailbox counts and the mailbox actions (bulk
 * pause/resume here; the plan change, pause/resume and payments in the
 * panel). An account with no warmup copy is listed all the same — it shows
 * no mailbox count and cannot be ticked.
 *
 * "Enter workspace as this user" acts on the account itself: UserDrawer →
 * EnterWorkspaceDialog. So do "Change role" (UserDrawer → ChangeRoleDialog),
 * "Delete account" (UserDrawer → DeleteAccountDialog) and "Restore account".
 * A deleted account is listed only under the "Deleted" status button, so
 * after the last two the panel closes and the lists are read again: the row
 * has left the list it was opened from.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip, PageHeader } from '../../components/ui';
import { Modal } from '../../components/overlay';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { fmtDate, fmtNumber, timeAgo } from '../../lib/format';
import { listPlatformUsers } from '../../lib/platform';
import type { AccountRow } from '../../lib/platform';
import { bulkPauseMailboxes, downloadCsv, getAdminSignupRate, listAdminUsers } from '../../lib/platformAdmin';
import type { AdminUserRow } from '../../lib/platformAdmin';
import {
  ROLE_LABELS,
  STATUS_FILTERS,
  STATUS_LABELS,
  StatusChip,
  displayName,
  emailKey,
  initials,
  isPlatformAdmin,
} from './accountUi';
import type { AccountStatus } from './accountUi';
import { Pager } from './shared';
import { UserDrawer } from './UserDrawer';

/** The role buttons of the filter row — "Super admins" is a group, not one role. */
const ROLE_FILTERS: { value: string; label: string }[] = [
  { value: 'owner', label: ROLE_LABELS.owner },
  { value: 'admin', label: ROLE_LABELS.admin },
  { value: 'member', label: ROLE_LABELS.member },
  { value: 'platform_admin', label: 'Super admins' },
];

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
        {verb} warmup for all mailboxes of the {selectedCount} selected user{selectedCount === 1 ? '' : 's'}? Super
        admins are left out, and everyone keeps their ramp progress.
      </p>
    </Modal>
  );
}

/* ---------------- page ---------------- */

/** An account, with the warmup copy of its email when there is one. */
type Joined = { account: AccountRow; warmup: AdminUserRow | null };

export function AdminUsersPage({ demo = false }: { demo?: boolean }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AccountRow | null>(null);
  /** warmup ids — the mailbox actions still work on the warmup side */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pause' | 'resume' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // the search runs on the server — wait for a pause in the typing; a new
  // search always starts again at the first page
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data, error, loading, reload } = useAsync(
    () => listPlatformUsers({ q: search, role: roleFilter, status: statusFilter ?? undefined, page }),
    [search, roleFilter, statusFilter, page],
    { keepStale: true },
  );
  const warmupList = useAsync(() => listAdminUsers({ page: 1, page_size: 100 }), [], { keepStale: true });
  const signup = useAsync(async () => (await getAdminSignupRate(30)).reduce((acc, p) => acc + (p.signups ?? 0), 0), []);

  const reloadAll = useCallback(() => {
    void reload();
    void warmupList.reload();
  }, [reload, warmupList.reload]);

  const rows = useMemo(() => data?.results ?? [], [data]);
  const total = data?.count ?? 0;

  const warmupByKey = useMemo(() => {
    const map = new Map<string, AdminUserRow>();
    for (const w of warmupList.data?.items ?? []) {
      const key = emailKey(w.email);
      if (!map.has(key)) map.set(key, w);
    }
    return map;
  }, [warmupList.data]);

  const joined: Joined[] = useMemo(
    () => rows.map((account) => ({ account, warmup: warmupByKey.get(emailKey(account.email)) ?? null })),
    [rows, warmupByKey],
  );

  // counters from the accounts on the open page; "Accounts" is everyone the search and buttons match
  const counts = useMemo(() => {
    let active = 0;
    let suspended = 0;
    let pending = 0;
    for (const r of rows) {
      if (r.status === 'active') active++;
      else if (r.status === 'suspended') suspended++;
      else if (r.status === 'pending') pending++;
    }
    return { active, suspended, pending };
  }, [rows]);

  // bulk selection — only accounts that have a warmup copy; platform admins are left out everywhere,
  // and so are deleted ones: their mailboxes are paused by the deletion, and "Resume all" would undo that
  const selectable = useMemo(
    () => joined.flatMap((j) => (j.warmup && !isPlatformAdmin(j.account) && j.account.status !== 'deleted' ? [{ account: j.account, warmup: j.warmup }] : [])),
    [joined],
  );
  // "select all" covers the open page; ticks kept from other pages stay ticked
  const allSelected = selectable.length > 0 && selectable.every((j) => selectedIds.has(j.warmup.id));
  const someSelected = !allSelected && selectable.some((j) => selectedIds.has(j.warmup.id));

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
      const every = selectable.length > 0 && selectable.every((j) => prev.has(j.warmup.id));
      const next = new Set(prev);
      if (every) for (const j of selectable) next.delete(j.warmup.id);
      else for (const j of selectable) next.add(j.warmup.id);
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
      `${bulkAction === 'pause' ? 'Paused' : 'Resumed'} ${fmtNumber(res.mailboxes_updated)} mailbox${res.mailboxes_updated === 1 ? '' : 'es'} across ${fmtNumber(res.users_affected)} user${res.users_affected === 1 ? '' : 's'}${skipped}.`,
    );
    setBulkAction(null);
    setSelectedIds(new Set());
    reloadAll();
  }

  function exportCsv() {
    downloadCsv(
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Email', 'Name', 'Username', 'Workspace', 'Role', 'Plan', 'Status', 'Two-factor', 'Last sign-in', 'Signed up', 'Account ID'],
      joined.map(({ account: a }) => [
        a.email,
        a.name,
        a.username,
        a.workspace?.name ?? '',
        ROLE_LABELS[a.role],
        a.plan ?? '',
        STATUS_LABELS[a.status],
        a.two_factor ? 'On' : 'Off',
        a.last_login ?? '',
        a.joined,
        a.id,
      ]),
    );
    toast.success(`${joined.length} account${joined.length === 1 ? '' : 's'} exported.`);
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

  // the panel keeps showing the account it was opened for, but with the newest facts after a change
  const openAccount = open ? rows.find((r) => r.id === open.id) ?? open : null;
  const openWarmup = openAccount ? warmupByKey.get(emailKey(openAccount.email)) ?? null : null;
  const filtered = !!search || !!statusFilter || !!roleFilter;
  const warmupPage = warmupList.data;

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={
          loading
            ? 'Fetching accounts…'
            : `${fmtNumber(total)} account${total === 1 ? '' : 's'} · ${rows.length} on this page · ${fmtNumber(signup.data ?? 0)} new in 30d`
        }
        actions={
          <button className="btn" onClick={exportCsv} disabled={joined.length === 0}>
            Export CSV
          </button>
        }
      />

      <div className="pf-kpis">
        <div className="pf-kpi" title="Everyone the search and the buttons match">
          <strong>{loading ? '…' : fmtNumber(total)}</strong>
          <small>Accounts</small>
        </div>
        <div className="pf-kpi" title="On this page">
          <strong>{loading ? '…' : fmtNumber(counts.active)}</strong>
          <small>Active</small>
        </div>
        <div className="pf-kpi" title="On this page">
          <strong>{loading ? '…' : fmtNumber(counts.suspended)}</strong>
          <small>Turned off</small>
        </div>
        <div className="pf-kpi" title="On this page">
          <strong>{loading ? '…' : fmtNumber(counts.pending)}</strong>
          <small>Not verified yet</small>
        </div>
      </div>

      <div className="pf-filters">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search email, name or company…"
          aria-label="Search users"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`btn btn-sm${statusFilter === s ? ' btn-primary' : ''}`}
            aria-pressed={statusFilter === s}
            onClick={() => {
              setStatusFilter(statusFilter === s ? null : s);
              setPage(1);
            }}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
        <select
          aria-label="Role filter"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          {ROLE_FILTERS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="pf-pager" style={{ margin: 0, gap: 7 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            disabled={selectable.length === 0}
            aria-label="Select all accounts on this page that can be selected"
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
          />
          Select all ({selectable.length} on this page)
        </label>
        <small style={{ marginLeft: 'auto' }}>{loading ? '…' : `${rows.length} of ${fmtNumber(total)}`}</small>
      </div>

      {/* the accounts are the page; these two only say when the mailbox side is missing something */}
      {warmupList.error && (
        <p className="field-hint">Mailbox counts could not be loaded just now, so the mailbox actions are hidden. The accounts are shown all the same.</p>
      )}
      {!warmupList.error && warmupPage && warmupPage.total > warmupPage.items.length && (
        <p className="field-hint">Mailbox counts are shown for {warmupPage.items.length} of the {fmtNumber(warmupPage.total)} warmup accounts.</p>
      )}

      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && joined.length === 0 && <EmptyState title={filtered ? 'No accounts match' : 'No accounts yet'} />}
      {data && joined.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>
                <th aria-label="Select" />
                <th>Account</th>
                <th>Workspace</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Two-factor</th>
                <th>Mailboxes</th>
                <th>Last sign-in</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {joined.map(({ account: r, warmup }) => (
                <tr key={r.id} onClick={() => setOpen(r)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    {warmup && !isPlatformAdmin(r) && r.status !== 'deleted' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(warmup.id)}
                        onChange={() => toggleSelect(warmup.id)}
                        aria-label={`Select ${r.email}`}
                      />
                    )}
                  </td>
                  <td>
                    <button className="row-link" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>
                      {initials(displayName(r))} {displayName(r)}
                    </button>
                    <div>
                      <small>{r.email}</small>
                    </div>
                  </td>
                  <td>{r.workspace?.name ?? '—'}</td>
                  <td>{ROLE_LABELS[r.role]}</td>
                  <td>{r.plan ? <Chip tone="accent">{r.plan}</Chip> : '—'}</td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td>{r.two_factor ? 'On' : 'Off'}</td>
                  <td>{warmup ? fmtNumber(warmup.mailbox_count) : '—'}</td>
                  <td>{timeAgo(r.last_login) || 'Never'}</td>
                  <td>{fmtDate(r.joined) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} count={total} next={data.next} previous={data.previous} onPage={setPage} />}

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

      {openAccount && (
        <UserDrawer
          key={openAccount.id}
          account={openAccount}
          warmup={openWarmup}
          demo={demo}
          onClose={() => setOpen(null)}
          onChanged={reloadAll}
        />
      )}

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
