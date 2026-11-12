export interface AdminStatCardProps {
  label: string;
  value: string | number;
  /** e.g. "+6.2% vs last wk" */
  delta?: string;
  deltaDirection?: 'up' | 'down';
  /** Optional sparkline values; rendered as a normalized polyline. */
  spark?: number[];
}

export function AdminStatCard({ label, value, delta, deltaDirection = 'up', spark }: AdminStatCardProps) {
  return (
    <div className="ag-stat">
      <div className="ag-stat__label">{label}</div>
      <div className="ag-stat__value">{value}</div>
      {delta && (
        <div className={`ag-stat__delta ag-stat__delta--${deltaDirection}`}>
          {deltaDirection === 'up' ? '▲' : '▼'} {delta}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = 100 / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(20 - ((v - min) / range) * 18 - 1).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="ag-stat__spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--wp-accent)" strokeWidth="2" />
    </svg>
  );
}
