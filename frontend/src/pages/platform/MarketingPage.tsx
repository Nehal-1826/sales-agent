import { MagicBento, type MagicBentoItem } from '../../components/MagicBento';
import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { fmtDayTick, fmtNumber } from '../../lib/format';
import { getMarketing } from '../../lib/platform';
import type { CountRow } from '../../lib/platform';
import { Bars, HBars } from './Bars';

function BreakdownBody({ title, rows, keyName }: { title: string; rows: CountRow[]; keyName: string }) {
  return (
    <>
      <h2 className="pf-h2">{title}</h2>
      <table className="leads-table">
        <thead><tr><th>{keyName}</th><th>Signups</th><th>Paid</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3}>No data</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{String(r[keyName] ?? Object.values(r).find((v) => typeof v === 'string') ?? '(none)')}</td>
              <td>{fmtNumber(r.count)}</td>
              <td>{r.paid === undefined ? '—' : fmtNumber(r.paid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Platform admin Marketing analytics rendered in liquid-glass MagicBento tiles. */
export function MarketingPage() {
  const { data: m, error, reload } = useAsync(getMarketing);

  const items: MagicBentoItem[] = m
    ? [
        {
          id: 'signups-day',
          colSpan: 2,
          rowSpan: 1,
          className: 'bento-panel-card',
          content: (
            <>
              <h2 className="pf-h2">Signups by day</h2>
              <Bars label="Signups per day" data={m.signups_by_day.map((d) => ({ label: fmtDayTick(d.date), value: d.count }))} />
            </>
          ),
        },
        {
          id: 'funnel',
          colSpan: 2,
          rowSpan: 1,
          className: 'bento-panel-card',
          content: (
            <>
              <h2 className="pf-h2">Funnel</h2>
              <HBars
                label="Signup funnel"
                rows={[
                  { label: 'Signed up', value: m.funnel.signups },
                  { label: 'Email verified', value: m.funnel.verified },
                  { label: 'Checkout started', value: m.funnel.checkout_started },
                  { label: 'Paid', value: m.funnel.paid },
                ]}
              />
            </>
          ),
        },
        {
          id: 'by-source',
          colSpan: 1,
          rowSpan: 1,
          className: 'bento-panel-card',
          content: <BreakdownBody title="By source" rows={m.by_source} keyName="source" />,
        },
        {
          id: 'by-campaign',
          colSpan: 1,
          rowSpan: 1,
          className: 'bento-panel-card',
          content: <BreakdownBody title="By campaign" rows={m.by_campaign} keyName="campaign" />,
        },
        {
          id: 'by-country',
          colSpan: 1,
          rowSpan: 1,
          className: 'bento-panel-card',
          content: <BreakdownBody title="By country" rows={m.by_country} keyName="country" />,
        },
        {
          id: 'plan-mix',
          colSpan: 1,
          rowSpan: 1,
          className: 'bento-panel-card',
          content: (
            <>
              <h2 className="pf-h2">Plan mix</h2>
              <HBars label="Plan mix" rows={m.plan_mix.map((p) => ({ label: p.plan, value: p.count }))} />
            </>
          ),
        },
      ]
    : [];

  return (
    <>
      <PageHeader title="Marketing" subtitle="Where signups come from and how they convert." />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!m && !error && <Skeleton rows={4} />}
      {m && (
        <MagicBento
          items={items}
          columns={2}
          rowHeight={180}
          flexibleRows
          gap={14}
          radius={18}
          theme="dark"
          glowColor="#fb923c"
          enableBorderGlow
          enableSpotlight
          clickEffect
          textAutoHide={false}
        />
      )}
    </>
  );
}
