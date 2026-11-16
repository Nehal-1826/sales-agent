/**
 * Admin Revenge Activity dashboard (/admin/revenge).
 *
 * Hidden super-admin tool. Shows: KPI cards, the revenge-run event feed (with
 * per-row detail + re-run), and the currently-sabotaged user roster (with undo).
 * All controls are wired — no coming-soon buttons.
 */
import { useState } from 'react';
import { Flame, Loader2, RotateCw, ShieldOff, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import {
  useRevengeEvents,
  useRevengeKpis,
  useRevengeRecipients,
  useSabotagedUsers,
  useRerunRevenge,
  useUnsabotage,
} from '@/features/admin/revenge/api';
import type { RevengeEvent, RevengeStatus } from '@/features/admin/revenge/types';

const STATUS_VARIANT: Record<RevengeStatus, BadgeVariant> = {
  completed: 'green',
  pending: 'blue',
  failed: 'orange',
  no_candidates: 'neutral',
};

function fmt(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface-2/40 p-5">
      <div className="text-xs uppercase tracking-wide text-text-dim">{label}</div>
      <div className="mt-2 text-2xl font-bold text-text">{value}</div>
    </div>
  );
}

function EventRow({ ev }: { ev: RevengeEvent }) {
  const [open, setOpen] = useState(false);
  const rerun = useRerunRevenge();
  const recipients = useRevengeRecipients(ev.id, open);
  return (
    <>
      <tr className="border-t border-border-muted/60 text-sm">
        <td className="px-3 py-2 text-text-dim">{fmt(ev.created_at)}</td>
        <td className="px-3 py-2 text-text">{ev.user_email}</td>
        <td className="px-3 py-2">
          <Badge variant={ev.trigger === 'manual_admin' ? 'orange' : 'neutral'}>
            {ev.trigger === 'manual_admin' ? 'Manual' : 'Auto (2h)'}
          </Badge>
        </td>
        <td className="px-3 py-2">
          <Badge variant={STATUS_VARIANT[ev.status]}>{ev.status}</Badge>
        </td>
        <td className="px-3 py-2 text-text">{ev.candidates_count}</td>
        <td className="px-3 py-2 text-accent">{ev.moved_count}</td>
        <td className="px-3 py-2 text-accent3">{ev.failed_count}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle detail"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rerun.isPending || !ev.user_id}
              onClick={() => rerun.mutate(ev.id)}
            >
              {rerun.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )}
              Re-run
            </Button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border-muted/30 bg-surface-2/20">
          <td colSpan={8} className="px-3 py-3">
            <div className="grid gap-3 text-xs text-text-dim">
              <div>Event ID: <span className="text-text">{ev.id}</span></div>
              <div>Completed: <span className="text-text">{fmt(ev.completed_at)}</span></div>

              <div>
                <div className="mb-1 font-semibold text-text">
                  Recipients (moved to spam)
                  {recipients.data?.source === 'reconstructed' && (
                    <span className="ml-2 font-normal text-text-dim">
                      · from warmup history (per-run detail not captured)
                    </span>
                  )}
                </div>
                {recipients.isLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading recipients…
                  </div>
                ) : !recipients.data || recipients.data.recipients.length === 0 ? (
                  <div className="py-2">No recipients recorded.</div>
                ) : (
                  <table className="w-full max-w-xl text-left">
                    <thead>
                      <tr className="text-text-dim">
                        <th className="py-1 pr-4 font-medium">Recipient</th>
                        <th className="py-1 pr-4 font-medium">
                          {recipients.data.source === 'run' ? 'Moved' : 'Sent'}
                        </th>
                        {recipients.data.source === 'run' && (
                          <th className="py-1 font-medium">Failed</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.data.recipients.map((r) => (
                        <tr key={r.email} className="border-t border-border-muted/30">
                          <td className="py-1 pr-4 text-text">{r.email}</td>
                          <td className="py-1 pr-4 text-accent">
                            {recipients.data!.source === 'run' ? r.moved ?? 0 : r.sent ?? 0}
                          </td>
                          {recipients.data!.source === 'run' && (
                            <td className="py-1 text-accent3">{r.failed ?? 0}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function RevengePage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');

  const kpis = useRevengeKpis();
  const events = useRevengeEvents({
    status: statusFilter || undefined,
    trigger: triggerFilter || undefined,
    q: search.trim() || undefined,
  });
  const sabotaged = useSabotagedUsers();
  const unsabotage = useUnsabotage();

  const k = kpis.data;
  const filtersActive = Boolean(statusFilter || triggerFilter || search.trim());
  const roster = (sabotaged.data ?? []).filter((u) =>
    u.email.toLowerCase().includes(rosterSearch.trim().toLowerCase()),
  );

  const selectCls =
    'rounded-lg border border-border-muted bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent';
  const inputCls =
    'rounded-lg border border-border-muted bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent placeholder:text-text-dim';

  return (
    <div className="min-h-screen space-y-6 p-7">
      <header className="flex items-center gap-3">
        <Flame className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-xl font-bold text-text">Retention Activity</h1>
          <p className="text-xs text-text-dim">
            Sabotage runs and their effect across the peer network · super-admin only.
          </p>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sabotaged users" value={k?.sabotaged_users ?? '—'} />
        <KpiCard label="Total runs" value={k?.total_runs ?? '—'} />
        <KpiCard label="Messages moved to spam" value={k?.total_moved ?? '—'} />
        <KpiCard label="Last run" value={fmt(k?.last_run_at ?? null)} />
      </section>

      {/* Event feed */}
      <section className="rounded-2xl border border-border-muted bg-surface-2/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted/60 px-4 py-3">
          <span className="text-sm font-semibold text-text">Run history</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={inputCls}
              placeholder="Search user email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={selectCls}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="no_candidates">No candidates</option>
            </select>
            <select
              className={selectCls}
              value={triggerFilter}
              onChange={(e) => setTriggerFilter(e.target.value)}
              aria-label="Filter by trigger"
            >
              <option value="">All triggers</option>
              <option value="manual_admin">Manual</option>
              <option value="auto_cancel_2h">Auto (2h)</option>
            </select>
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('');
                  setTriggerFilter('');
                  setSearch('');
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        {events.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
          </div>
        ) : !events.data || events.data.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-dim">
            {filtersActive ? 'No runs match these filters.' : 'No revenge runs yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-text-dim">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Trigger</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Candidates</th>
                  <th className="px-3 py-2 font-medium">Moved</th>
                  <th className="px-3 py-2 font-medium">Failed</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.data.items.map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sabotaged roster */}
      <section className="rounded-2xl border border-border-muted bg-surface-2/40">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-muted/60 px-4 py-3">
          <span className="text-sm font-semibold text-text">Currently sabotaged</span>
          <input
            className={inputCls}
            placeholder="Search email…"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
          />
        </div>
        {sabotaged.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : roster.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-dim">
            {rosterSearch.trim() ? 'No users match.' : 'No sabotaged users.'}
          </div>
        ) : (
          <ul className="divide-y divide-border-muted/40">
            {roster.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm text-text">{u.email}</div>
                  {u.display_name && (
                    <div className="text-xs text-text-dim">{u.display_name}</div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unsabotage.isPending}
                  onClick={() => unsabotage.mutate(u.id)}
                >
                  <ShieldOff className="h-4 w-4" /> Undo
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
