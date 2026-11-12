import { useState } from 'react';
import { PageHeader, Field, Toggle } from '../../components/ui';
import { LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { listPlans, savePlan } from '../../lib/platform';
import type { PlanRow } from '../../lib/platform';

const PRICES = [
  ['price_inr_month', 'INR / month'],
  ['price_inr_year', 'INR / year'],
  ['price_usd_month', 'USD / month'],
  ['price_usd_year', 'USD / year'],
] as const;
type PriceKey = (typeof PRICES)[number][0];

function PlanEditor({ plan, demo, onSaved }: { plan: PlanRow; demo: boolean; onSaved: () => void }) {
  // prices edited in major units as text; converted to minor units on save
  const [prices, setPrices] = useState<Record<PriceKey, string>>(
    () => Object.fromEntries(PRICES.map(([k]) => [k, String(plan[k] / 100)])) as Record<PriceKey, string>,
  );
  const [limits, setLimits] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(plan.limits).map(([k, v]) => [k, String(v)])),
  );
  const [active, setActive] = useState(plan.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const priceBad = PRICES.some(([k]) => !(Number(prices[k]) >= 0) || prices[k].trim() === '');
  const limitBad = Object.values(limits).some((v) => v.trim() === '' || !Number.isInteger(Number(v)) || Number(v) < -1);

  async function save() {
    setBusy(true);
    setError('');
    const next: PlanRow = {
      ...plan,
      active,
      ...(Object.fromEntries(PRICES.map(([k]) => [k, Math.round(Number(prices[k]) * 100)])) as Record<PriceKey, number>),
      limits: Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, Number(v)])),
    };
    const r = await savePlan(next);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(`${plan.name} saved`);
    onSaved();
  }

  return (
    <section className="card pf-plan">
      <h2 className="pf-h2">
        {plan.name} <small>({plan.code})</small>
      </h2>
      <div className="pf-grid">
        {PRICES.map(([k, label]) => (
          <Field key={k} label={`${label} (major units)`}>
            <input type="number" min={0} step="0.01" value={prices[k]} onChange={(e) => setPrices({ ...prices, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="pf-grid">
        {Object.keys(limits).map((k) => (
          <Field key={k} label={`Limit: ${k}`} hint="-1 = unlimited">
            <input type="number" min={-1} step={1} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="pf-actions"><Toggle checked={active} onChange={setActive} label="Active" /><span>{active ? 'Active: offered to new customers' : 'Inactive: hidden from new customers'}</span></div>
      {error && <p className="pf-error" role="alert">{error}</p>}
      <div className="pf-actions">
        <button className="btn btn-primary" disabled={busy || demo || priceBad || limitBad} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save plan'}
        </button>
        {demo && <small>Demo data is read-only.</small>}
      </div>
    </section>
  );
}

export function PlansPage({ demo }: { demo: boolean }) {
  const { data, error, reload } = useAsync(listPlans);
  return (
    <>
      <PageHeader title="Plans" subtitle="Changes apply to new checkouts. Existing subscriptions keep their price." />
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!data && !error && <Skeleton rows={4} />}
      {data?.map((p) => <PlanEditor key={p.code} plan={p} demo={demo} onSaved={() => void reload()} />)}
    </>
  );
}
