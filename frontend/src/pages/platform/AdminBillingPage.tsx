/**
 * Platform admin Billing page — revenue cockpit / subscriptions ledger,
 * ported from frontend-warmpulse BillingPage (BL2) to the merged console
 * conventions.
 *
 * Logic + data kept: payments + users + plans + plan-distribution fetch,
 * per-user subscription collapse (MRR from plan price, status derived from
 * the latest payment, "started" from the earliest succeeded payment),
 * KPI strip (active subs / total MRR / past due / trials), plan-mix strip,
 * search + plan/status filters + sortable columns, detail drawer with the
 * full payment history, client-side ledger CSV and server-side payments
 * CSV export.
 *
 * Restyled: pf- table + drawer instead of the animated FLIP ledger; the
 * reference EditPaymentDialog (payment editing) is not ported — no such
 * mutation exists in this backend contract.
 */
import { useMemo, useState } from 'react';
import { Chip, PageHeader } from '../../components/ui';
import { Drawer } from '../../components/overlay';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { fmtDate, fmtDateTime, fmtMoneyMajor, fmtNumber } from '../../lib/format';
import {
  downloadCsv,
  exportPaymentsCsv,
  getAdminPlanDistribution,
  listAdminPayments,
  listAdminPlans,
  listAdminUsers,
} from '../../lib/platformAdmin';
import type { AdminPayment } from '../../lib/platformAdmin';

type SubStatus = 'active' | 'trialing' | 'past_due' | 'canceled';
type SortKey = 'workspace' | 'plan' | 'mrr' | 'status' | 'started_at';
type SortDir = 'asc' | 'desc';

interface SubRow {
  id: string;
  userId: string;
  workspace: string;
  ownerEmail: string;
  plan: string;
  status: SubStatus;
  /** Plan price from the plan catalogue; 0 for Free/unknown. */
  mrr: number;
  startedAt: string | null;
  lastPayment: AdminPayment | null;
  history: AdminPayment[];
}

const statusChip = (s: SubStatus): 'success' | 'accent' | 'warn' | 'neutral' =>
  s === 'active' ? 'success' : s === 'trialing' ? 'accent' : s === 'past_due' ? 'warn' : 'neutral';
const statusLabel = (s: SubStatus): string =>
  s === 'active' ? 'Active' : s === 'trialing' ? 'Trialing' : s === 'past_due' ? 'Past Due' : 'Canceled';

/** Derive subscription status from the latest payment (reference rule). */
function deriveStatus(lastPayment: AdminPayment | null, planName: string): SubStatus {
  if (!lastPayment) return planName === 'Free' || !planName ? 'active' : 'canceled';
  if (lastPayment.status === 'succeeded') return 'active';
  if (lastPayment.status === 'failed') return 'past_due';
  if (lastPayment.status === 'pending') return 'trialing';
  return 'canceled'; // refunded
}

function payChip(s: AdminPayment['status']): 'success' | 'warn' | 'neutral' {
  if (s === 'succeeded') return 'success';
  if (s === 'refunded') return 'neutral';
  return 'warn';
}

/* ---------------- drawer ---------------- */

function SubDrawer({ sub, demo, onClose }: { sub: SubRow; demo: boolean; onClose: () => void }) {
  return (
    <Drawer title={sub.workspace} subtitle={sub.ownerEmail} onClose={onClose}>
      <div className="pf-actions" style={{ marginTop: 0, marginBottom: 14 }}>
        <Chip tone="accent">{sub.plan || '—'}</Chip>
        <Chip tone={statusChip(sub.status)}>{statusLabel(sub.status)}</Chip>
      </div>
      <dl className="pf-dl">
        <dt>MRR</dt>
        <dd>{fmtMoneyMajor(sub.mrr, 'USD')}</dd>
        <dt>Started</dt>
        <dd>{fmtDate(sub.startedAt) || '—'}</dd>
        <dt>Last payment</dt>
        <dd>{sub.lastPayment ? `${fmtMoneyMajor(sub.lastPayment.amount_usd, 'USD')} · ${fmtDate(sub.lastPayment.created_at) || '—'}` : '—'}</dd>
        <dt>Payments</dt>
        <dd>{sub.history.length}</dd>
      </dl>

      <h3 className="pf-h2">Payment history</h3>
      {sub.history.length === 0 ? (
        <EmptyState title="No payments yet" />
      ) : (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sub.history.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td>{p.plan || 'Payment'}</td>
                  <td>{fmtMoneyMajor(p.amount_usd, 'USD')}</td>
                  <td>
                    <Chip tone={payChip(p.status)}>{p.status}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {demo && <p className="field-hint">Demo data is read-only.</p>}
    </Drawer>
  );
}

/* ---------------- page ---------------- */

export function AdminBillingPage({ demo = false, embedded = false }: { demo?: boolean; embedded?: boolean }) {
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('All');
  const [filterStatus, setFilterStatus] = useState<SubStatus | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('mrr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<SubRow | null>(null);
  const [expBusy, setExpBusy] = useState(false);

  // fetch enough rows for aggregation — 200 gives solid stats without being huge
  const paymentsQ = useAsync(() => listAdminPayments({ page: 1, page_size: 200 }), []);
  const planDistQ = useAsync(() => getAdminPlanDistribution(), []);
  const plansQ = useAsync(() => listAdminPlans(), []);
  const usersQ = useAsync(() => listAdminUsers({ page: 1, page_size: 200 }), []);

  const loading = !paymentsQ.data && !paymentsQ.error;
  const allPayments = useMemo(() => paymentsQ.data?.items ?? [], [paymentsQ.data]);

  // current plan per user — a payment records the plan purchased *then*;
  // the ledger should reflect the workspace's plan *now*
  const currentPlanByUser = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const u of usersQ.data?.items ?? []) m[u.id] = u.plan;
    return m;
  }, [usersQ.data]);

  const planPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of plansQ.data ?? []) m[p.name] = p.price_monthly_usd;
    return m;
  }, [plansQ.data]);

  // collapse payments into per-user subscription rows
  const subs = useMemo<SubRow[]>(() => {
    const byUser = new Map<string, { ownerEmail: string; plan: string; payments: AdminPayment[] }>();
    for (const p of allPayments) {
      const entry = byUser.get(p.user_id) ?? { ownerEmail: p.user_email, plan: p.plan, payments: [] };
      if (p.plan) entry.plan = p.plan; // keep latest plan name
      entry.payments.push(p);
      byUser.set(p.user_id, entry);
    }
    const rows: SubRow[] = [];
    for (const [userId, entry] of byUser.entries()) {
      const history = [...entry.payments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const lastPayment = history[0] ?? null;
      const succeeded = history.filter((p) => p.status === 'succeeded');
      const earliestSucceeded = succeeded.length > 0 ? succeeded[succeeded.length - 1]! : null;
      const planName = currentPlanByUser[userId] || entry.plan || 'Free';
      rows.push({
        id: userId,
        userId,
        workspace: entry.ownerEmail.split('@')[1] ?? entry.ownerEmail,
        ownerEmail: entry.ownerEmail,
        plan: planName,
        status: deriveStatus(lastPayment, planName),
        mrr: planPriceMap[planName] ?? 0,
        startedAt: earliestSucceeded?.created_at ?? null,
        lastPayment,
        history,
      });
    }
    return rows;
  }, [allPayments, planPriceMap, currentPlanByUser]);

  // KPI aggregates (free users with zero payments are invisible here — no
  // subscription table server-side; plan mix covers their counts)
  const activeSubs = subs.filter((s) => s.status === 'active').length;
  const totalMrr = subs.reduce((a, s) => a + s.mrr, 0);
  const pastDue = subs.filter((s) => s.status === 'past_due').length;
  const trials = subs.filter((s) => s.status === 'trialing').length;

  const planNames = useMemo(() => ['All', ...Array.from(new Set(subs.map((s) => s.plan).filter(Boolean))).sort()], [subs]);
  const planOrder = useMemo(() => {
    const o: Record<string, number> = {};
    planNames.slice(1).forEach((n, i) => (o[n] = i));
    return o;
  }, [planNames]);

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir('desc');
    }
  }

  const visible = useMemo(() => {
    return subs
      .filter((s) => {
        const q = search.toLowerCase();
        const matchQ = !q || s.workspace.toLowerCase().includes(q) || s.ownerEmail.toLowerCase().includes(q);
        return matchQ && (filterPlan === 'All' || s.plan === filterPlan) && (filterStatus === 'All' || s.status === filterStatus);
      })
      .sort((a, b) => {
        let av: number | string = 0;
        let bv: number | string = 0;
        if (sortKey === 'workspace') [av, bv] = [a.workspace, b.workspace];
        if (sortKey === 'plan') [av, bv] = [planOrder[a.plan] ?? 0, planOrder[b.plan] ?? 0];
        if (sortKey === 'mrr') [av, bv] = [a.mrr, b.mrr];
        if (sortKey === 'status') [av, bv] = [a.status, b.status];
        if (sortKey === 'started_at') [av, bv] = [a.startedAt ?? '', b.startedAt ?? ''];
        if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      });
  }, [subs, search, filterPlan, filterStatus, sortKey, sortDir, planOrder]);

  function exportLedger() {
    downloadCsv(
      `billing-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Workspace', 'Owner Email', 'Plan', 'Status', 'MRR (USD)', 'Started At', 'Payments', 'Last Amount', 'Last Status', 'Last Paid At'],
      visible.map((r) => [r.workspace, r.ownerEmail, r.plan, r.status, r.mrr, r.startedAt ?? '', r.history.length, r.lastPayment?.amount_usd ?? '', r.lastPayment?.status ?? '', r.lastPayment?.created_at ?? '']),
    );
    toast.success(`${visible.length} subscription${visible.length === 1 ? '' : 's'} exported.`);
  }

  async function handleServerExport() {
    setExpBusy(true);
    const r = await exportPaymentsCsv();
    setExpBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success('Payments CSV exported.');
  }

  const arrow = (k: SortKey): string => (sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const actions = (
    <>
      <button className="btn" onClick={exportLedger} disabled={subs.length === 0}>
        Export ledger CSV
      </button>
      <button className="btn" disabled={expBusy || demo} onClick={() => void handleServerExport()}>
        {expBusy ? 'Exporting…' : 'Export payments CSV'}
      </button>
    </>
  );

  return (
    <>
      {/* inside Payment (the Billing tab) the section carries the title, so
          the exports stand on their own row */}
      {embedded ? (
        <div className="pf-actions" style={{ marginTop: 0 }}>
          {actions}
        </div>
      ) : (
        <PageHeader title="Revenue cockpit" subtitle="Cross-workspace subscriptions ledger · super admin" actions={actions} />
      )}

      <div className="pf-kpis">
        <div className="pf-kpi">
          <strong>{loading ? '…' : fmtNumber(activeSubs)}</strong>
          <small>Paying customers · workspaces on a paid plan</small>
        </div>
        <div className="pf-kpi">
          <strong>{loading ? '…' : fmtMoneyMajor(totalMrr, 'USD')}</strong>
          <small>Money per month · what customers pay each month</small>
        </div>
        <div className="pf-kpi">
          <strong>{loading ? '…' : fmtNumber(pastDue)}</strong>
          <small>Payment failed · we&apos;re retrying their card</small>
        </div>
        <div className="pf-kpi">
          <strong>{loading ? '…' : fmtNumber(trials)}</strong>
          <small>Trying for free · trial period active</small>
        </div>
      </div>

      {/* plan mix strip */}
      {(planDistQ.data?.length ?? 0) > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <small style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan mix</small>
          {(planDistQ.data ?? []).map((row) => (
            <span key={row.plan} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Chip tone="accent">{row.plan}</Chip>
              <strong>{fmtNumber(row.count)}</strong>
              {row.mrr != null && row.mrr > 0 && <small>· {fmtMoneyMajor(row.mrr, 'USD', 0)}</small>}
            </span>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="pf-filters">
        <input type="search" placeholder="Search email or domain…" aria-label="Search subscriptions" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Plan filter" value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}>
          {planNames.map((p) => (
            <option key={p} value={p}>
              {p === 'All' ? 'All plans' : p}
            </option>
          ))}
        </select>
        <select aria-label="Status filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as SubStatus | 'All')}>
          <option value="All">All statuses</option>
          {(['active', 'trialing', 'past_due', 'canceled'] as SubStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <small style={{ marginLeft: 'auto' }}>
          {visible.length} of {subs.length} subscriptions
        </small>
      </div>

      {paymentsQ.error && <LoadError message={paymentsQ.error} onRetry={() => void paymentsQ.reload()} />}
      {loading && <Skeleton rows={5} />}
      {!loading && !paymentsQ.error && subs.length === 0 && (
        <EmptyState title="No subscription data available yet">Rows appear once the first payments are recorded.</EmptyState>
      )}
      {!loading && subs.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('workspace')} style={{ cursor: 'pointer' }}>Workspace{arrow('workspace')}</th>
                <th onClick={() => handleSort('plan')} style={{ cursor: 'pointer' }}>Plan{arrow('plan')}</th>
                <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>Status{arrow('status')}</th>
                <th onClick={() => handleSort('mrr')} style={{ cursor: 'pointer' }}>MRR{arrow('mrr')}</th>
                <th onClick={() => handleSort('started_at')} style={{ cursor: 'pointer' }}>Started{arrow('started_at')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((sub) => (
                <tr key={sub.id} onClick={() => setSelected(sub)}>
                  <td>
                    <button className="row-link" onClick={(e) => { e.stopPropagation(); setSelected(sub); }}>
                      {sub.workspace}
                    </button>
                    <div>
                      <small>{sub.ownerEmail}</small>
                    </div>
                  </td>
                  <td>{sub.plan || '—'}</td>
                  <td>
                    <Chip tone={statusChip(sub.status)}>{statusLabel(sub.status)}</Chip>
                  </td>
                  <td>{sub.mrr === 0 ? '—' : fmtMoneyMajor(sub.mrr, 'USD')}</td>
                  <td>{fmtDate(sub.startedAt) || '—'}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="No subscriptions match your filters" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="field-hint">
        {subs.length} total paying workspace{subs.length === 1 ? '' : 's'} · click any row for payment history
      </p>

      {selected && <SubDrawer sub={selected} demo={demo} onClose={() => setSelected(null)} />}
    </>
  );
}
