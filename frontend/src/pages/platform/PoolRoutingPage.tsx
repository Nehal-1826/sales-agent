/**
 * Platform admin Pool Routing — ported from the WarmPulse reference page
 * (R7 capacity vessels) to the merged console conventions.
 *
 * Logic + data kept: pools + client→pool assignments + unassigned clients
 * + per-mailbox routing pins (pool pin → workspace pin → default pool),
 * capacity fill per pool (daily_send_limit × 30 when set, else helpers ×
 * 15k/month estimate), reassign via chip menus and the assign-workspace
 * dialog, per-mailbox pin selects inside the pool detail drawer, create
 * pool, CSV export of the routing table.
 *
 * Restyled: CSS cards with a fill bar instead of the animated liquid
 * vessels; the side detail panel became the shared Drawer. Sankey data is
 * fetched (kept in the API module) but not drawn — the vessel grid already
 * shows the same flow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chip, Field, PageHeader } from '../../components/ui';
import { Drawer, Modal } from '../../components/overlay';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  createPeerPool,
  downloadCsv,
  getPeerInboxStats,
  listPeerPools,
  listPoolAssignments,
  listRoutingMailboxes,
  listUnassignedClients,
  pinRoutingMailbox,
  revertPoolAssignment,
  upsertPoolAssignment,
} from '../../lib/platformAdmin';
import type { PeerPool, RoutingMailboxRow } from '../../lib/platformAdmin';

/** Estimated sends/month per helper — honest derived metric (no real capacity field on PoolOut). */
const PEER_MONTHLY_CAP = 15_000;

/** 30-day capacity denominator: an explicit daily cap is the meaningful ceiling, else helper estimate. */
function poolCapacity30d(pool: PeerPool): number {
  if (pool.daily_send_limit != null) return Math.max(pool.daily_send_limit * 30, 1);
  return Math.max(pool.member_count * PEER_MONTHLY_CAP, 1);
}

function fillTone(pct: number): 'success' | 'warn' | 'danger' {
  if (pct >= 0.85) return 'danger';
  if (pct >= 0.6) return 'warn';
  return 'success';
}

function fillLabel(pct: number): string {
  return pct >= 0.85 ? 'Overloaded' : pct >= 0.6 ? 'Filling' : 'Healthy';
}

/** Normalised routing row — assigned or unassigned, keyed by workspace_id. */
interface RoutingClient {
  workspace_id: string;
  email: string;
  plan: string | null;
  pool_id: string | null;
  pool_name: string | null;
  sends_last_30d: number;
}

/* ---------------- workspace chip with reassign dropdown ---------------- */

function WorkspaceChip({
  client,
  pools,
  currentPoolId,
  busy,
  disabled,
  onReassign,
}: {
  client: RoutingClient;
  pools: PeerPool[];
  currentPoolId: string;
  busy: boolean;
  disabled: boolean;
  onReassign: (targetPoolId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const initials = (client.email.split('@')[0] ?? client.email).slice(0, 2).toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="chip"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        disabled={disabled}
        title={`${client.email} — click to move to another account group`}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', gap: 6, opacity: busy ? 0.6 : 1 }}
      >
        <span className="avatar" aria-hidden style={{ width: 18, height: 18, fontSize: 9 }}>{initials}</span>
        <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</span>
        {client.plan && <small>· {client.plan}</small>}
      </button>
      {open && (
        <div
          className="card"
          role="menu"
          aria-label={`Move ${client.email} to account group`}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            padding: '6px 0',
            minWidth: 210,
            boxShadow: 'var(--shadow)',
          }}
        >
          <div className="field-hint" style={{ padding: '2px 12px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Move to account group</div>
          {pools.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className="btn btn-sm"
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', justifyContent: 'flex-start' }}
              disabled={p.id === currentPoolId || busy}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (p.id !== currentPoolId) onReassign(p.id);
              }}
            >
              {p.name}{p.is_default ? ' (default)' : ''}{p.id === currentPoolId ? ' — current' : ''}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            className="btn btn-sm"
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', justifyContent: 'flex-start', borderTop: '1px solid var(--border-soft)', marginTop: 4 }}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onReassign(null);
            }}
          >
            Unassign · use default
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- pool card ---------------- */

function PoolCard({
  pool,
  clients,
  allPools,
  selected,
  busy,
  demo,
  onSelect,
  onReassign,
}: {
  pool: PeerPool;
  clients: RoutingClient[];
  allPools: PeerPool[];
  selected: boolean;
  busy: boolean;
  demo: boolean;
  onSelect: () => void;
  onReassign: (workspaceId: string, targetPoolId: string | null) => void;
}) {
  const mine = clients.filter((c) => c.pool_id === pool.id);
  const used = mine.reduce((sum, c) => sum + c.sends_last_30d, 0);
  const capacity = poolCapacity30d(pool);
  const pct = Math.min(1, used / capacity);
  const tone = fillTone(pct);

  return (
    <section
      className={`card pf-plan${selected ? ' pf-pool-selected' : ''}`}
      style={{ cursor: 'pointer', outline: selected ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }}
      onClick={onSelect}
      aria-label={`Account group ${pool.name}`}
    >
      <div className="pf-actions" style={{ marginTop: 0, justifyContent: 'space-between' }}>
        <strong>{pool.name}</strong>
        <span>
          {pool.is_default && <Chip tone="accent">default</Chip>}{' '}
          <Chip tone={tone === 'success' ? 'success' : 'warn'}>{fillLabel(pct)}</Chip>
        </span>
      </div>
      {pool.description && <p className="field-hint">{pool.description}</p>}

      <div className="pf-hbar-track" style={{ height: 10, margin: '10px 0 4px' }} role="img" aria-label={`${Math.round(pct * 100)}% of 30-day capacity used`}>
        <span style={{ width: `${pct * 100}%`, background: tone === 'danger' ? 'var(--danger-ink)' : tone === 'warn' ? 'var(--warn-ink)' : 'var(--accent)' }} />
      </div>
      <small style={{ color: 'var(--text-2)' }}>
        {used.toLocaleString()} / {capacity.toLocaleString()} sends/30d · {Math.round(pct * 100)}%
        {pool.daily_send_limit != null && <> · limit {pool.daily_send_limit.toLocaleString()}/day</>}
      </small>

      <div className="pf-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0' }}>
        <div className="pf-kpi" style={{ padding: '8px 10px' }}>
          <strong>{pool.member_count}</strong>
          <small>Helpers</small>
        </div>
        <div className="pf-kpi" style={{ padding: '8px 10px' }}>
          <strong>{mine.length}</strong>
          <small>Workspaces</small>
        </div>
      </div>

      <div className="pf-actions" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {mine.length === 0 ? (
          <small style={{ color: 'var(--text-3)' }}>No workspaces assigned</small>
        ) : (
          mine.map((c) => (
            <WorkspaceChip
              key={c.workspace_id}
              client={c}
              pools={allPools}
              currentPoolId={pool.id}
              busy={busy}
              disabled={demo}
              onReassign={(target) => onReassign(c.workspace_id, target)}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ---------------- mailbox routing row (inside detail drawer) ---------------- */

const MAILBOX_PROVIDER_LABELS: Record<string, string> = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo', smtp: 'SMTP' };

function MailboxRoutingRow({
  mailbox,
  pools,
  busy,
  onAssign,
}: {
  mailbox: RoutingMailboxRow;
  pools: PeerPool[];
  busy: boolean;
  onAssign: (poolId: string | null) => void;
}) {
  const cannotSend = !mailbox.can_send;
  const oauthOk = mailbox.is_oauth && mailbox.can_send;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border-soft)', borderRadius: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mailbox.email}>{mailbox.email}</div>
        <small style={{ color: 'var(--text-3)' }}>
          {MAILBOX_PROVIDER_LABELS[mailbox.provider] ?? mailbox.provider.toUpperCase()}
          {cannotSend && <> · {mailbox.is_oauth ? 'OAuth · not sending' : 'no credentials'}</>}
          {oauthOk && ' · OAuth'} · {mailbox.sends_last_30d.toLocaleString()} sends/30d
        </small>
      </div>
      <select
        aria-label={`Routing pool for ${mailbox.email}`}
        value={mailbox.pool_id ?? ''}
        disabled={busy}
        onChange={(e) => onAssign(e.target.value === '' ? null : e.target.value)}
        style={{ maxWidth: 190 }}
      >
        <option value="">Inherit workspace{mailbox.effective_pool_id == null ? ' ✓' : ''}</option>
        {pools.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.is_default ? ' (default)' : ''}{p.id === mailbox.effective_pool_id ? ' ✓ routes here' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------- pool detail drawer ---------------- */

function PoolDrawer({
  pool,
  clients,
  pools,
  mailboxes,
  busy,
  mailboxBusy,
  demo,
  onClose,
  onReassign,
  onAssignMailbox,
}: {
  pool: PeerPool;
  clients: RoutingClient[];
  pools: PeerPool[];
  mailboxes: RoutingMailboxRow[];
  busy: boolean;
  mailboxBusy: boolean;
  demo: boolean;
  onClose: () => void;
  onReassign: (workspaceId: string, targetPoolId: string | null) => void;
  onAssignMailbox: (mailboxId: string, poolId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const mine = clients.filter((c) => c.pool_id === pool.id);
  const used = mine.reduce((sum, c) => sum + c.sends_last_30d, 0);
  const capacity = poolCapacity30d(pool);
  const pct = Math.min(1, used / capacity);

  return (
    <Drawer title={pool.name} subtitle={`${pool.member_count} helper${pool.member_count === 1 ? '' : 's'}${pool.description ? ` · ${pool.description}` : ''}`} onClose={onClose}>
      <div className="pf-kpi">
        <strong>{Math.round(pct * 100)}%</strong>
        <small>{used.toLocaleString()} / {capacity.toLocaleString()} sends/30d used · {fillLabel(pct)}</small>
      </div>

      <h3 className="pf-h2">{mine.length} workspace{mine.length === 1 ? '' : 's'} assigned</h3>
      {mine.length === 0 && <p className="field-hint">No workspaces assigned to this account group.</p>}
      {mine.map((c) => {
        const mbx = mailboxes.filter((m) => m.workspace_id === c.workspace_id);
        const isOpen = expanded === c.workspace_id;
        return (
          <div key={c.workspace_id} style={{ marginBottom: 8 }}>
            <div className="pf-actions" style={{ marginTop: 0, justifyContent: 'space-between' }}>
              <button className="row-link" style={{ textAlign: 'left' }} onClick={() => setExpanded(isOpen ? null : c.workspace_id)} aria-expanded={isOpen}>
                {isOpen ? '▾' : '▸'} {c.email}
              </button>
              <span>
                {c.plan && <Chip tone="accent">{c.plan}</Chip>}{' '}
                <small style={{ color: 'var(--text-3)' }}>{c.sends_last_30d.toLocaleString()} sends/30d</small>
              </span>
            </div>
            {isOpen && (
              <div style={{ padding: '8px 0 4px 12px', display: 'grid', gap: 6 }}>
                <div className="field-hint" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Mailboxes ({mbx.length}) — pin overrides the workspace pin
                </div>
                {mbx.length === 0 && <small style={{ color: 'var(--text-3)' }}>No mailboxes connected.</small>}
                {mbx.map((m) => (
                  <MailboxRoutingRow key={m.id} mailbox={m} pools={pools} busy={mailboxBusy || demo} onAssign={(poolId) => onAssignMailbox(m.id, poolId)} />
                ))}
                <div className="field-hint" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                  Move workspace
                </div>
                <div className="pf-actions" style={{ marginTop: 0, gap: 6 }}>
                  {pools.filter((p) => p.id !== pool.id).map((p) => (
                    <button key={p.id} className="btn btn-sm" disabled={busy || demo} onClick={() => { onReassign(c.workspace_id, p.id); setExpanded(null); }}>
                      {p.name}
                    </button>
                  ))}
                  <button className="btn btn-sm" disabled={busy || demo} onClick={() => { onReassign(c.workspace_id, null); setExpanded(null); }}>
                    Unassign · use default
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </Drawer>
  );
}

/* ---------------- assign-workspace dialog ---------------- */

function AssignWorkspaceModal({
  clients,
  pools,
  busy,
  demo,
  onClose,
  onReassign,
}: {
  clients: RoutingClient[];
  pools: PeerPool[];
  busy: boolean;
  demo: boolean;
  onClose: () => void;
  onReassign: (workspaceId: string, targetPoolId: string | null) => void;
}) {
  const sorted = useMemo(() => [...clients].sort((a, b) => a.email.localeCompare(b.email)), [clients]);
  return (
    <Modal
      title="Assign workspaces to account groups"
      onClose={onClose}
      wide
      footer={<button className="btn" onClick={onClose}>Done</button>}
    >
      <p className="field-hint" style={{ marginTop: 0 }}>
        Pin a workspace to an account group. Unpinned workspaces fall through to the default account group, then trust-weighted random. Changes apply immediately.
      </p>
      {sorted.length === 0 ? (
        <EmptyState title="No workspaces yet" />
      ) : (
        <div style={{ display: 'grid', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
          {sorted.map((c) => (
            <div key={c.workspace_id} className="pf-actions" style={{ marginTop: 0, justifyContent: 'space-between', padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</strong>
                <small style={{ color: 'var(--text-3)' }}>
                  {c.pool_id ? `Pinned → ${c.pool_name}` : 'Unpinned · default routing'} · {c.sends_last_30d.toLocaleString()} sends/30d
                </small>
              </div>
              <select
                aria-label={`Account group for ${c.email}`}
                value={c.pool_id ?? '__unassign__'}
                disabled={busy || demo}
                onChange={(e) => {
                  const v = e.target.value;
                  onReassign(c.workspace_id, v === '__unassign__' ? null : v);
                }}
                style={{ maxWidth: 200 }}
              >
                <option value="__unassign__">Unassigned · default routing</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ---------------- page ---------------- */

export function PoolRoutingPage({ demo = false }: { demo?: boolean }) {
  const pools = useAsync(() => listPoolAssignmentsSource(), []);
  const stats = useAsync(getPeerInboxStats, []);
  const mailboxes = useAsync(listRoutingMailboxes, []);

  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [mailboxBusy, setMailboxBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  const poolList = pools.data?.pools ?? [];
  const clients = pools.data?.clients ?? [];
  const mailboxRows = mailboxes.data ?? [];

  const handleReassign = useCallback(
    async (workspaceId: string, targetPoolId: string | null) => {
      const client = clients.find((c) => c.workspace_id === workspaceId);
      if (!client || targetPoolId === client.pool_id) return;
      setBusy(true);
      const r = targetPoolId === null
        ? await revertPoolAssignment(workspaceId)
        : await upsertPoolAssignment(workspaceId, targetPoolId);
      setBusy(false);
      if (!r.ok) return toast.error(r.error);
      if (targetPoolId === null) toast.success(`${client.email} → unassigned (default account group).`);
      else toast.success(`${client.email} → ${poolList.find((p) => p.id === targetPoolId)?.name ?? 'account group'}.`);
      void pools.reload();
    },
    [clients, poolList, pools],
  );

  const handleAssignMailbox = useCallback(
    async (mailboxId: string, poolId: string | null) => {
      const mbx = mailboxRows.find((m) => m.id === mailboxId);
      if (mbx && (mbx.pool_id ?? null) === poolId) return;
      setMailboxBusy(true);
      const r = await pinRoutingMailbox(mailboxId, poolId);
      setMailboxBusy(false);
      if (!r.ok) return toast.error(r.error);
      if (poolId === null) toast.success(`${mbx?.email ?? 'Mailbox'} → inherits workspace routing.`);
      else toast.success(`${mbx?.email ?? 'Mailbox'} → ${poolList.find((p) => p.id === poolId)?.name ?? 'account group'}.`);
      void mailboxes.reload();
      void pools.reload();
    },
    [mailboxRows, poolList, mailboxes, pools],
  );

  async function createPool() {
    setCreateBusy(true);
    const r = await createPeerPool({ name: newName.trim(), description: newDesc.trim() || undefined });
    setCreateBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Account group “${newName.trim()}” created.`);
    setCreateOpen(false);
    setNewName('');
    setNewDesc('');
    void pools.reload();
  }

  function exportCsv() {
    downloadCsv(
      `pool-routing-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Email', 'Plan', 'Account group', 'Sends (30d)'],
      clients.map((c) => [c.email, c.plan ?? '', c.pool_name ?? 'Unassigned', c.sends_last_30d]),
    );
    toast.success(`${clients.length} workspace${clients.length === 1 ? '' : 's'} exported.`);
  }

  const s = stats.data;
  const avgUtil = poolList.length === 0 ? 0 : poolList.reduce((sum, p) => {
    const used = clients.filter((c) => c.pool_id === p.id).reduce((a, c) => a + c.sends_last_30d, 0);
    return sum + used / poolCapacity30d(p);
  }, 0) / poolList.length;
  const overloaded = poolList.filter((p) => {
    const used = clients.filter((c) => c.pool_id === p.id).reduce((a, c) => a + c.sends_last_30d, 0);
    return used / poolCapacity30d(p) >= 0.85;
  }).length;

  const selectedPool = poolList.find((p) => p.id === selectedPoolId) ?? null;

  return (
    <>
      <PageHeader
        title="Pool routing"
        subtitle="Each account group is a capacity tank — fill = workspace sends vs helper capacity. Routing precedence: workspace pin → default group → trust-weighted random."
        actions={
          <>
            <button className="btn" onClick={() => { void pools.reload(); void stats.reload(); void mailboxes.reload(); }}>Refresh</button>
            <button className="btn" onClick={exportCsv} disabled={clients.length === 0}>Export CSV</button>
            <button className="btn" onClick={() => setAssignOpen(true)} disabled={clients.length === 0}>Assign workspace</button>
            <button className="btn btn-primary" disabled={demo} onClick={() => setCreateOpen(true)}>New account group</button>
          </>
        }
      />

      <div className="pf-kpis">
        <div className="pf-kpi"><strong>{stats.loading ? '…' : (s?.total_capacity ?? 0).toLocaleString()}</strong><small>Platform daily limit /day</small></div>
        <div className="pf-kpi"><strong>{stats.loading ? '…' : (s?.used_capacity_today ?? 0).toLocaleString()}</strong><small>Active today /day</small></div>
        <div className="pf-kpi"><strong>{pools.loading ? '…' : `${(avgUtil * 100).toFixed(1)}%`}</strong><small>Avg 30-day fill across groups</small></div>
        <div className="pf-kpi"><strong>{pools.loading ? '…' : overloaded.toLocaleString()}</strong><small>Overloaded account groups (≥85%)</small></div>
      </div>

      {pools.error && <LoadError message={pools.error} onRetry={() => void pools.reload()} />}
      {pools.loading && !pools.data && <Skeleton rows={5} />}
      {pools.data && poolList.length === 0 && (
        <EmptyState title="No account groups yet">
          Create your first account group to start routing workspace warmup traffic.
        </EmptyState>
      )}
      {pools.data && poolList.length > 0 && (
        <div className="pf-grid">
          {poolList.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              clients={clients}
              allPools={poolList}
              selected={selectedPoolId === pool.id}
              busy={busy}
              demo={demo}
              onSelect={() => setSelectedPoolId((prev) => (prev === pool.id ? null : pool.id))}
              onReassign={(wsId, target) => void handleReassign(wsId, target)}
            />
          ))}
        </div>
      )}

      {selectedPool && (
        <PoolDrawer
          pool={selectedPool}
          clients={clients}
          pools={poolList}
          mailboxes={mailboxRows}
          busy={busy}
          mailboxBusy={mailboxBusy}
          demo={demo}
          onClose={() => setSelectedPoolId(null)}
          onReassign={(wsId, target) => void handleReassign(wsId, target)}
          onAssignMailbox={(id, poolId) => void handleAssignMailbox(id, poolId)}
        />
      )}

      {assignOpen && (
        <AssignWorkspaceModal
          clients={clients}
          pools={poolList}
          busy={busy}
          demo={demo}
          onClose={() => setAssignOpen(false)}
          onReassign={(wsId, target) => void handleReassign(wsId, target)}
        />
      )}

      {createOpen && (
        <Modal
          title="Create account group"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreateOpen(false)} disabled={createBusy}>Cancel</button>
              <button className="btn btn-primary" disabled={!newName.trim() || createBusy} onClick={() => void createPool()}>
                {createBusy ? 'Creating…' : 'Create account group'}
              </button>
            </>
          }
        >
          {demo && <p role="note">Demo data is read-only.</p>}
          <Field label="Name" hint="Groups helper mailboxes for routing — workspaces pinned here exchange only with this subset.">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enterprise · pool-B" data-autofocus />
          </Field>
          <Field label="Description (optional)">
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Higher-trust helpers for paying customers" />
          </Field>
        </Modal>
      )}
    </>
  );
}

/* ---------------- data assembly (pools + assignments + unassigned → clients) ---------------- */

interface PoolRoutingBundle {
  pools: PeerPool[];
  clients: RoutingClient[];
}

/** One awaitable bundle so the KPI + cards + dialogs share a single loading/error state. */
async function listPoolAssignmentsSource(): Promise<PoolRoutingBundle> {
  const [poolList, assignments, unassigned] = await Promise.all([
    listPeerPools(),
    listPoolAssignments({ page: 1, page_size: 200 }),
    listUnassignedClients(),
  ]);
  const clients: RoutingClient[] = [
    ...assignments.items.map((a) => ({
      workspace_id: a.workspace_id,
      email: a.client_email,
      plan: a.client_plan,
      pool_id: a.pool_id,
      pool_name: a.pool_name,
      sends_last_30d: a.sends_last_30d,
    })),
    ...unassigned.map((u) => ({
      workspace_id: u.workspace_id,
      email: u.email,
      plan: u.plan,
      pool_id: null,
      pool_name: null,
      sends_last_30d: u.sends_last_30d,
    })),
  ];
  // dedupe by workspace (assigned wins when both present)
  const seen = new Set<string>();
  const unique: RoutingClient[] = [];
  for (const c of clients) {
    if (seen.has(c.workspace_id)) continue;
    seen.add(c.workspace_id);
    unique.push(c);
  }
  return { pools: poolList, clients: unique };
}

export default PoolRoutingPage;
