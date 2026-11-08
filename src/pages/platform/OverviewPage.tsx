import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { getOverview, money, pct } from '../../lib/platform';
import { Bars } from './Bars';

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="pf-kpi card">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function OverviewPage() {
  const { data: o, error, reload } = useAsync(getOverview);
  const inr = (n: number) => money(n, 'INR');
  return (
    <>
      <PageHeader title="Overview" subtitle="Revenue and subscriber health (INR equivalent at the platform FX rate)." />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!o && !error && <Skeleton rows={4} />}
      {o && (
        <>
          <div className="pf-kpis">
            <Kpi label="MRR" value={inr(o.mrr.inr_equivalent)} sub={`${money(o.mrr.INR, 'INR')} + ${money(o.mrr.USD, 'USD')}`} />
            <Kpi label="ARR" value={inr(o.arr_inr_equivalent)} />
            <Kpi label="Active" value={String(o.counts.active)} />
            <Kpi label="Pending" value={String(o.counts.pending)} />
            <Kpi label="Past due" value={String(o.counts.past_due)} />
            <Kpi label="Churn (30d)" value={pct(o.churn_30d)} sub={`${o.counts.canceled} canceled`} />
            <Kpi label="Conversion (30d)" value={pct(o.conversion_30d)} sub={`${o.signups_7d} signups 7d / ${o.signups_30d} 30d`} />
            <Kpi label="Refunds (30d)" value={inr(o.refunds_30d.amount_inr_equivalent)} sub={`${o.refunds_30d.count} refunds`} />
          </div>
          <section className="card">
            <h2 className="pf-h2">Revenue, last 12 months</h2>
            <Bars
              label="Revenue per month, last 12 months, INR equivalent"
              data={o.revenue_12m.map((r) => ({ label: r.month, value: r.inr_equivalent }))}
              fmt={inr}
            />
          </section>
        </>
      )}
    </>
  );
}
