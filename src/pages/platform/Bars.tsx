/** Plain SVG bar chart with accessible labels (no chart dependency). */
export function Bars({
  data,
  label,
  fmt = (n) => String(n),
  height = 160,
}: {
  data: { label: string; value: number }[];
  label: string;
  fmt?: (n: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <figure className="pf-chart">
      <svg viewBox={`0 0 100 ${height / 4}`} preserveAspectRatio="none" role="img" aria-label={label} style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 2);
          return (
            <rect key={i} x={i * w + w * 0.12} y={height / 4 - h} width={w * 0.76} height={h} fill="var(--accent)" rx="0.4">
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="pf-chart-axis">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </figcaption>
      <table className="pf-sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{fmt(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal funnel / share bars with value labels. */
export function HBars({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="pf-hbars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label}>
          <span>{r.label}</span>
          <span className="pf-hbar-track" aria-hidden>
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <strong>{r.value}</strong>
        </li>
      ))}
    </ul>
  );
}
