import { PageHeader } from '../../components/ui';
import { LoadError, Skeleton } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { getMarketing } from '../../lib/platform';
import type { CountRow } from '../../lib/platform';
import { Bars, HBars } from './Bars';

function Breakdown({ title, rows, keyName }: { title: string; rows: CountRow[]; keyName: string }) {
  return (
    <section className="card">
      <h2 className="pf-h2">{title}</h2>
      <table className="leads-table">
        <thead><tr><th>{keyName}</th><th>Signups</th><th>Paid</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={3}>No data</td></tr>}
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{String(r[keyName] ?? Object.values(r).find((v) => typeof v === 'string') ?? '(none)')}</td>
              <td>{r.count}</td>
              <td>{r.paid ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function MarketingPage() {
  const { data: m, error, reload } = useAsync(getMarketing);
  return (
    <>
      <PageHeader title="Marketing" subtitle="Where signups come from and how they convert." />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!m && !error && <Skeleton rows={4} />}
      {m && (
        <>
          <section className="card">
            <h2 className="pf-h2">Signups by day</h2>
            <Bars label="Signups per day" data={m.signups_by_day.map((d) => ({ label: d.date, value: d.count }))} />
          </section>
          <section className="card">
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
          </section>
          <div className="pf-grid">
            <Breakdown title="By source" rows={m.by_source} keyName="source" />
            <Breakdown title="By campaign" rows={m.by_campaign} keyName="campaign" />
            <Breakdown title="By country" rows={m.by_country} keyName="country" />
            <section className="card">
              <h2 className="pf-h2">Plan mix</h2>
              <HBars label="Plan mix" rows={m.plan_mix.map((p) => ({ label: p.plan, value: p.count }))} />
            </section>
          </div>
        </>
      )}
    </>
  );
}
