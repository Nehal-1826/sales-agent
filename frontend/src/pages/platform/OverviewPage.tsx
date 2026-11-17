import { MagicBento, type MagicBentoItem } from '../../components/MagicBento';
import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { getOverview, money, pct } from '../../lib/platform';
import { Bars } from './Bars';

function KpiBody({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="pf-kpi-body">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Platform admin Overview — full liquid-glass MagicBento metrics & revenue chart. */
export function OverviewPage() {
  const { data: o, error, reload } = useAsync(getOverview);
  const inr = (n: number) => money(n, 'INR');

  const items: MagicBentoItem[] = o
    ? [
        {
          id: 'mrr',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/payments',
          title: 'MRR',
          content: <KpiBody label="MRR" value={inr(o.mrr.inr_equivalent)} sub={`${money(o.mrr.INR, 'INR')} + ${money(o.mrr.USD, 'USD')}`} />,
        },
        {
          id: 'arr',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/payments',
          title: 'ARR',
          content: <KpiBody label="ARR" value={inr(o.arr_inr_equivalent)} sub="Annualized run rate" />,
        },
        {
          id: 'active',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/tenants',
          title: 'Active subscribers',
          content: <KpiBody label="Active" value={String(o.counts.active)} sub="Paid workspaces" />,
        },
        {
          id: 'pending',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/tenants',
          title: 'Pending',
          content: <KpiBody label="Pending" value={String(o.counts.pending)} sub="Awaiting checkout" />,
        },
        {
          id: 'past_due',
          colSpan: 1,
          rowSpan: 1,
          className: `pf-kpi bento-stat${o.counts.past_due > 0 ? ' highlight' : ''}`,
          href: '/platform/tenants',
          title: 'Past due',
          content: <KpiBody label="Past due" value={String(o.counts.past_due)} sub="Retry window" />,
        },
        {
          id: 'churn',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/tenants',
          title: 'Churn (30d)',
          content: <KpiBody label="Churn (30d)" value={pct(o.churn_30d)} sub={`${o.counts.canceled} canceled`} />,
        },
        {
          id: 'conversion',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/marketing',
          title: 'Conversion (30d)',
          content: <KpiBody label="Conversion (30d)" value={pct(o.conversion_30d)} sub={`${o.signups_7d} signups 7d / ${o.signups_30d} 30d`} />,
        },
        {
          id: 'refunds',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: '/platform/payments',
          title: 'Refunds (30d)',
          content: <KpiBody label="Refunds (30d)" value={inr(o.refunds_30d.amount_inr_equivalent)} sub={`${o.refunds_30d.count} refunds`} />,
        },
        {
          id: 'revenue-12m',
          colSpan: 4,
          rowSpan: 2,
          className: 'bento-panel-card',
          content: (
            <>
              <h2 className="pf-h2">Revenue, last 12 months</h2>
              <Bars
                label="Revenue per month, last 12 months, INR equivalent"
                data={o.revenue_12m.map((r) => ({ label: r.month, value: r.inr_equivalent }))}
                fmt={inr}
              />
            </>
          ),
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Overview" subtitle="Revenue and subscriber health (INR equivalent at the platform FX rate)." />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!o && !error && <Skeleton rows={4} />}
      {o && (
        <MagicBento
          items={items}
          columns={4}
          rowHeight={116}
          flexibleRows
          gap={14}
          radius={18}
          theme="dark"
          glowColor="#fb923c"
          enableBorderGlow
          enableSpotlight
          enableTilt
          clickEffect
          textAutoHide={false}
        />
      )}
    </>
  );
}
