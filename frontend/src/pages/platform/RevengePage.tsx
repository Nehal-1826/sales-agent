/**
 * Platform Retention Activity dashboard (ported from the WarmPulse admin
 * "Revenge" console, restyled to the merged shell). Super-admin only.
 *
 * Shows: KPI cards, the revenge-run event feed (with per-row detail +
 * re-run), and the currently-sabotaged user roster (with undo). All controls
 * are wired — no coming-soon buttons.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { PageHeader } from '../../components/ui';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import {
  getRevengeKpis,
  getRevengeRecipients,
  listRevengeEvents,
  listSabotagedUsers,
  rerunRevenge,
  unsabotageUser,
} from '../../lib/platformAdmin';
import type { RevengeEvent, RevengeStatus } from '../../lib/platformAdmin';

const STATUS_CHIP: Record<RevengeStatus, string> = {
  completed: 'chip chip-success',
  pending: 'chip chip-accent',
  failed: 'chip chip-danger',
  no_candidates: 'chip',
};

function fmt(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel pf-kpi">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

/** Expanded-row detail — mounted only while open so recipients fetch lazily. */
function RecipientsDetail({ eventId }: { eventId: string }) {
  const recipients = useAsync(() => getRevengeRecipients(eventId), [eventId], { keepStale: true });

  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 12, color: 'var(--text-2)', padding: '6px 0' }}>
      <div>
        <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text)' }}>
          Recipients (moved to spam)
          {recipients.data?.source === 'reconstructed' && (
            <span style={{ marginLeft: 8, fontWeight: 400 }}>· from warmup history (per-run detail not captured)</span>
          )}
        </div>
        {recipients.loading && !recipients.data && <div>Loading recipients…</div>}
        {recipients.error && <div className="pf-error">{recipients.error}</div>}
        {recipients.data && recipients.data.recipients.length === 0 && <div>No recipients recorded.</div>}
        {recipients.data && recipients.data.recipients.length > 0 && (
          <div className="table-wrap" style={{ maxWidth: 560 }}>
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>{recipients.data.source === 'run' ? 'Moved' : 'Sent'}</th>
                  {recipients.data.source === 'run' && <th>Failed</th>}
                </tr>
              </thead>
              <tbody>
                {recipients.data.recipients.map((r) => (
                  <tr key={r.email}>
                    <td>{r.email}</td>
                    <td style={{ color: 'var(--success-ink)' }}>
                      {recipients.data?.source === 'run' ? r.moved ?? 0 : r.sent ?? 0}
                    </td>
                    {recipients.data?.source === 'run' && (
                      <td style={{ color: 'var(--danger-ink)' }}>{r.failed ?? 0}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** One run row + its expandable detail (recipients). Rerun is per-event. */
function EventRow({ ev, onRerun, rerunBusy }: { ev: RevengeEvent; onRerun: (id: string) => void; rerunBusy: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr>
        <td>{fmt(ev.created_at)}</td>
        <td>{ev.user_email}</td>
        <td>
          <span className={`chip${ev.trigger === 'manual_admin' ? ' chip-accent' : ''}`}>
            {ev.trigger === 'manual_admin' ? 'Manual' : 'Auto (2h)'}
          </span>
        </td>
        <td>
          <span className={STATUS_CHIP[ev.status]}>{ev.status}</span>
        </td>
        <td>{ev.candidates_count}</td>
        <td style={{ color: 'var(--success-ink)' }}>{ev.moved_count}</td>
        <td style={{ color: 'var(--danger-ink)' }}>{ev.failed_count}</td>
        <td>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-label="Toggle detail" aria-expanded={open}>
              {open ? '▲' : '▼'} Detail
            </button>
            <button className="btn btn-sm" disabled={rerunBusy || !ev.user_id} onClick={() => onRerun(ev.id)}>
              Re-run
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--chrome-2)' }}>
          <td colSpan={8}>
            <div style={{ display: 'grid', gap: 8, fontSize: 12, color: 'var(--text-2)', padding: '6px 0' }}>
              <div>Event ID: <span style={{ color: 'var(--text)' }}>{ev.id}</span></div>
              <div>Completed: <span style={{ color: 'var(--text)' }}>{fmt(ev.completed_at)}</span></div>
              <RecipientsDetail eventId={ev.id} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function RevengePage({ demo = false }: { demo?: boolean }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [rerunBusy, setRerunBusy] = useState(false);
  const [undoBusy, setUndoBusy] = useState<string | null>(null);

  const kpis = useAsync(getRevengeKpis);
  const events = useAsync(
    () => listRevengeEvents({
      status: statusFilter || undefined,
      trigger: triggerFilter || undefined,
      q: search.trim() || undefined,
    }),
    [statusFilter, triggerFilter, search.trim()],
    { keepStale: true },
  );
  const sabotaged = useAsync(listSabotagedUsers);

  const k = kpis.data;
  const filtersActive = Boolean(statusFilter || triggerFilter || search.trim());
  const roster = (sabotaged.data ?? []).filter((u) =>
    u.email.toLowerCase().includes(rosterSearch.trim().toLowerCase()),
  );

  async function onRerun(eventId: string) {
    setRerunBusy(true);
    const r = await rerunRevenge(eventId);
    setRerunBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success('Re-run queued');
    void events.reload();
    void kpis.reload();
  }

  async function onUndo(userId: string) {
    setUndoBusy(userId);
    const r = await unsabotageUser(userId);
    setUndoBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success('Sabotage cleared');
    void sabotaged.reload();
    void kpis.reload();
  }

  const inputStyle: CSSProperties = { minWidth: 160 };
  const selectStyle: CSSProperties = { minWidth: 130, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'inherit' };

  return (
    <>
      <PageHeader
        title="Retention activity"
        subtitle="Sabotage runs and their effect across the peer network · super-admin only."
        actions={<span className="chip chip-warn">Sensitive controls</span>}
      />

      {/* KPIs */}
      <div className="pf-kpis">
        <KpiCard label="Sabotaged users" value={kpis.loading && !k ? '…' : (k?.sabotaged_users ?? '—')} />
        <KpiCard label="Total runs" value={kpis.loading && !k ? '…' : (k?.total_runs ?? '—')} />
        <KpiCard label="Messages moved to spam" value={kpis.loading && !k ? '…' : (k?.total_moved ?? '—')} />
        <KpiCard label="Last run" value={kpis.loading && !k ? '…' : fmt(k?.last_run_at ?? null)} />
      </div>

      {/* Event feed */}
      <section className="panel" style={{ padding: 0 }}>
        <div className="panel-head" style={{ padding: '12px 16px', margin: 0, borderBottom: '1px solid var(--border-soft)', flexWrap: 'wrap' }}>
          <h2 className="pf-h2" style={{ margin: 0 }}>Run history</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              style={inputStyle}
              placeholder="Search user email…"
              aria-label="Search runs by user email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="no_candidates">No candidates</option>
            </select>
            <select style={selectStyle} value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value)} aria-label="Filter by trigger">
              <option value="">All triggers</option>
              <option value="manual_admin">Manual</option>
              <option value="auto_cancel_2h">Auto (2h)</option>
            </select>
            {filtersActive && (
              <button
                className="btn btn-sm"
                onClick={() => {
                  setStatusFilter('');
                  setTriggerFilter('');
                  setSearch('');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {events.error && <div style={{ padding: 16 }}><LoadError message={events.error} onRetry={() => void events.reload()} /></div>}
        {events.loading && !events.data && !events.error && <div style={{ padding: 16 }}><Skeleton rows={5} /></div>}
        {events.data && events.data.items.length === 0 && (
          <div style={{ padding: '32px 16px' }}>
            <EmptyState title={filtersActive ? 'No runs match these filters.' : 'No runs yet.'} />
          </div>
        )}
        {events.data && events.data.items.length > 0 && (
          <div className="table-wrap pf-table">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Trigger</th>
                  <th>Status</th>
                  <th>Candidates</th>
                  <th>Moved</th>
                  <th>Failed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((ev) => (
                  <EventRow key={ev.id} ev={ev} onRerun={(id) => void onRerun(id)} rerunBusy={rerunBusy || demo} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sabotaged roster */}
      <section className="panel" style={{ padding: 0 }}>
        <div className="panel-head" style={{ padding: '12px 16px', margin: 0, borderBottom: '1px solid var(--border-soft)' }}>
          <h2 className="pf-h2" style={{ margin: 0 }}>Currently sabotaged</h2>
          <input
            placeholder="Search email…"
            aria-label="Search sabotaged users"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
          />
        </div>
        {sabotaged.error && <div style={{ padding: 16 }}><LoadError message={sabotaged.error} onRetry={() => void sabotaged.reload()} /></div>}
        {sabotaged.loading && !sabotaged.data && !sabotaged.error && <div style={{ padding: 16 }}><Skeleton rows={3} /></div>}
        {sabotaged.data && roster.length === 0 && (
          <div style={{ padding: '32px 16px' }}>
            <EmptyState title={rosterSearch.trim() ? 'No users match.' : 'No sabotaged users.'} />
          </div>
        )}
        {sabotaged.data && roster.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {roster.map((u) => (
              <li key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-soft)' }}>
                <div>
                  <div style={{ fontSize: 13 }}>{u.email}</div>
                  {u.display_name && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.display_name}</div>}
                </div>
                <button
                  className="btn btn-sm"
                  disabled={demo || undoBusy != null}
                  onClick={() => void onUndo(u.id)}
                  title={demo ? 'Demo data is read-only.' : undefined}
                >
                  {undoBusy === u.id ? 'Undoing…' : 'Undo'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default RevengePage;
