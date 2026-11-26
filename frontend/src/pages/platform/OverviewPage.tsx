import { MagicBento, type MagicBentoItem } from '../../components/MagicBento';
import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { fmtMoney, fmtMonth, fmtNumber } from '../../lib/format';
import { getOverview, pct } from '../../lib/platform';
import { Bars } from './Bars';

/** Read the 6-digit admin slug from the current URL for internal links. */
function slugPrefix(): string {
  const m = window.location.pathname.match(/^\/(\d{6})/);
  return m ? `/${m[1]}` : '';
}

function KpiBody({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="pf-kpi-body">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Platform admin Overview — full liquid-glass MagicBento metrics & revenue chart.
 *  Copy rule: everyday words — "money per month", not "MRR". */
export function OverviewPage() {
  const { data: o, error, reload } = useAsync(getOverview);
  const inr = (n: number) => fmtMoney(n, 'INR');

  const items: MagicBentoItem[] = o
    ? [
        {
          id: 'mrr',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/payments`,
          title: 'Money per month',
          content: <KpiBody label="Money per month" value={inr(o.mrr.inr_equivalent)} sub={`${fmtMoney(o.mrr.INR, 'INR')} from India + ${fmtMoney(o.mrr.USD, 'USD')} from abroad`} />,
        },
        {
          id: 'arr',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/payments`,
          title: 'Money per year (if this pace continues)',
          content: <KpiBody label="Money per year (at this pace)" value={inr(o.arr_inr_equivalent)} sub="This month's pace × 12" />,
        },
        {
          id: 'active',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/tenants`,
          title: 'Paying customers',
          content: <KpiBody label="Paying customers" value={fmtNumber(o.counts.active)} sub="Workspaces on a paid plan" />,
        },
        {
          id: 'pending',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/tenants`,
          title: "Haven't paid yet",
          content: <KpiBody label="Haven't paid yet" value={fmtNumber(o.counts.pending)} sub="Signed up, waiting for first payment" />,
        },
        {
          id: 'past_due',
          colSpan: 1,
          rowSpan: 1,
          className: `pf-kpi bento-stat${o.counts.past_due > 0 ? ' highlight' : ''}`,
          href: `${slugPrefix()}/tenants`,
          title: 'Payment failed',
          content: <KpiBody label="Payment failed" value={fmtNumber(o.counts.past_due)} sub="We're retrying their card" />,
        },
        {
          id: 'churn',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/tenants`,
          title: 'Customers who left',
          content: <KpiBody label="Customers who left (30 days)" value={pct(o.churn_30d)} sub={`${fmtNumber(o.counts.canceled)} canceled in the last 30 days`} />,
        },
        {
          id: 'conversion',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/marketing`,
          title: 'Visitors who signed up',
          content: <KpiBody label="Visitors who signed up (30 days)" value={pct(o.conversion_30d)} sub={`${fmtNumber(o.signups_7d)} joined last week · ${fmtNumber(o.signups_30d)} last month`} />,
        },
        {
          id: 'refunds',
          colSpan: 1,
          rowSpan: 1,
          className: 'pf-kpi bento-stat',
          href: `${slugPrefix()}/payments`,
          title: 'Money returned',
          content: <KpiBody label="Money returned (30 days)" value={inr(o.refunds_30d.amount_inr_equivalent)} sub={`${fmtNumber(o.refunds_30d.count)} refunds in the last 30 days`} />,
        },
        {
          id: 'revenue-12m',
          colSpan: 4,
          rowSpan: 2,
          className: 'bento-panel-card',
          content: (
            <>
              <h2 className="pf-h2">Money earned — last 12 months</h2>
              <Bars
                label="Money earned each month, last 12 months, in rupees"
                data={o.revenue_12m.map((r) => ({ label: fmtMonth(r.month), value: r.inr_equivalent }))}
                fmt={inr}
              />
            </>
          ),
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="How WarmPulse is doing. All money is shown in ₹." />
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
