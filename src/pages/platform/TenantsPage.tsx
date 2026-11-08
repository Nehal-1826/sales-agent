import { useState } from 'react';
import { PageHeader, Field, Chip } from '../../components/ui';
import { Drawer } from '../../components/overlay';
import { LoadError, Skeleton, EmptyState } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { listTenants, getTenant, tenantAction, planCode, usageItems } from '../../lib/platform';
import type { TenantRow } from '../../lib/platform';
import { Pager, ReasonDialog } from './shared';

type Act = 'suspend' | 'unsuspend' | 'extend' | 'change_plan';
const when = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '—');
const lim = (n: number) => (n < 0 ? 'unlimited' : String(n));

function TenantDrawer({ id, demo, onClose, onChanged }: { id: number | string; demo: boolean; onClose: () => void; onChanged: () => void }) {
  const { data: t, error, reload } = useAsync(() => getTenant(id), [id]);
  const [act, setAct] = useState<Act | null>(null);
  const [days, setDays] = useState('7');
  const [plan, setPlan] = useState('');
  const suspended = t?.suspended || t?.status === 'suspended';

  const body = (reason: string): Record<string, unknown> =>
    act === 'extend' ? { days: Number(days), reason } : act === 'change_plan' ? { plan_code: plan.trim(), reason } : { reason };
  const titles: Record<Act, string> = { suspend: 'Suspend tenant', unsuspend: 'Unsuspend tenant', extend: 'Extend subscription', change_plan: 'Change plan' };

  return (
    <Drawer title={t?.workspace ?? 'Tenant'} subtitle={t?.owner_email} onClose={onClose}>
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!t && !error && <Skeleton rows={4} />}
      {t && (
        <>
          <dl className="pf-dl">
            <dt>Plan</dt><dd>{planCode(t.plan)}</dd>
            <dt>Status</dt><dd>{t.status}</dd>
            <dt>Period end</dt><dd>{when(t.period_end)}</dd>
            <dt>Created</dt><dd>{when(t.created)}</dd>
            <dt>Last activity</dt><dd>{when(t.last_activity)}</dd>
            <dt>Country</dt><dd>{t.country || '—'}</dd>
            <dt>Source</dt><dd>{t.signup_source || '—'}</dd>
          </dl>
          <h3 className="pf-h2">Usage</h3>
          <ul className="pf-usage">
            {usageItems(t.usage).map((u) => (
              <li key={u.meter}>
                {u.meter}: {u.used} / {lim(u.limit)}
              </li>
            ))}
          </ul>
          <div className="pf-actions">
            {suspended ? (
              <button className="btn" onClick={() => setAct('unsuspend')}>Unsuspend</button>
            ) : (
              <button className="btn btn-danger" onClick={() => setAct('suspend')}>Suspend</button>
            )}
            <button className="btn" onClick={() => setAct('extend')}>Extend…</button>
            <button className="btn" onClick={() => setAct('change_plan')}>Change plan…</button>
          </div>
        </>
      )}
      {act && (
        <ReasonDialog
          title={titles[act]}
          confirmLabel="Confirm"
          danger={act === 'suspend'}
          demo={demo}
          extraValid={act === 'extend' ? Number(days) >= 1 : act === 'change_plan' ? plan.trim().length > 0 : true}
          run={(reason) => tenantAction(id, act, body(reason))}
          onClose={() => setAct(null)}
          onDone={() => { setAct(null); void reload(); onChanged(); }}
        >
          {act === 'extend' && (
            <Field label="Days to extend">
              <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          )}
          {act === 'change_plan' && (
            <Field label="New plan code" hint="e.g. starter, business">
              <input value={plan} onChange={(e) => setPlan(e.target.value)} />
            </Field>
          )}
        </ReasonDialog>
      )}
    </Drawer>
  );
}

export function TenantsPage({ demo }: { demo: boolean }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<TenantRow['id'] | null>(null);
  const { data, error, reload } = useAsync(() => listTenants({ q, status, plan, page }), [q, status, plan, page], { keepStale: true });

  return (
    <>
      <PageHeader title="Tenants" subtitle="Every workspace, its plan and usage." />
      <div className="pf-filters">
        <input type="search" placeholder="Search workspace or owner email" aria-label="Search tenants" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['active', 'pending', 'past_due', 'canceled', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="Plan code" aria-label="Plan code" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }} />
      </div>
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={5} />}
      {data && data.results.length === 0 && <EmptyState title="No tenants match" />}
      {data && data.results.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr><th>Workspace</th><th>Owner</th><th>Plan</th><th>Status</th><th>Period end</th><th>Usage</th><th>Last activity</th></tr>
            </thead>
            <tbody>
              {data.results.map((t) => (
                <tr key={t.id} onClick={() => setOpen(t.id)}>
                  <td>
                    <button className="row-link" onClick={(e) => { e.stopPropagation(); setOpen(t.id); }}>{t.workspace}</button>
                  </td>
                  <td>{t.owner_email}</td>
                  <td>{planCode(t.plan)}</td>
                  <td><Chip tone={t.status === 'active' ? 'success' : t.status === 'past_due' ? 'warn' : 'neutral'}>{t.status}</Chip></td>
                  <td>{when(t.period_end)}</td>
                  <td>{usageItems(t.usage).map((u) => `${u.meter} ${u.used}/${lim(u.limit)}`).join(', ') || '—'}</td>
                  <td>{when(t.last_activity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} count={data.count} next={data.next} previous={data.previous} onPage={setPage} />}
      {open !== null && <TenantDrawer id={open} demo={demo} onClose={() => setOpen(null)} onChanged={() => void reload()} />}
    </>
  );
}
