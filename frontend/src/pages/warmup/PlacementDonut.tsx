import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import type { ChartTheme } from './chartTheme';
import type { WarmupPlacementSplit } from '../../lib/warmupApi';

/**
 * Inbox / promotions / spam split as an ApexCharts donut (port of the source
 * PlacementDonut). Inbox gets the owner's accent; promotions warn; spam
 * danger — all resolved from CSS tokens at runtime.
 */
export function PlacementDonut({ split, theme }: { split: WarmupPlacementSplit; theme: ChartTheme }) {
  const rows = [
    { name: 'Inbox', value: split.inbox_pct, color: theme.accent },
    { name: 'Promotions', value: split.promotions_pct, color: theme.warn },
    { name: 'Spam', value: split.spam_pct, color: theme.danger },
  ];
  const allZero = rows.every((r) => !r.value);

  if (allZero) {
    return (
      <div className="warmup-donut-empty">
        Placement signals appear once warmup is underway.
      </div>
    );
  }

  const options: ApexOptions = {
    chart: {
      type: 'donut',
      animations: { enabled: false },
      fontFamily: theme.fontFamily,
      foreColor: theme.text2,
      redrawOnParentResize: true,
    },
    labels: rows.map((r) => r.name),
    colors: rows.map((r) => r.color),
    // series passed as the component's own prop (react-apexcharts contract)
    stroke: { show: true, width: 2, colors: [theme.panel] },
    // no on-segment labels — the legend below carries the exact percentages
    dataLabels: { enabled: false },
    legend: {
      show: false, // custom legend below renders the exact percentages
    },
    plotOptions: {
      pie: {
        donut: { size: '62%' },
        expandOnClick: false,
      },
    },
    tooltip: {
      cssClass: 'warmup-chart-tooltip',
      y: { formatter: (v: number) => `${v.toFixed(1)}%` },
    },
    states: { active: { filter: { type: 'none' } } },
  };

  return (
    <div className="warmup-donut">
      <Chart
        options={options}
        series={rows.map((r) => Math.round(r.value * 10) / 10)}
        type="donut"
        height={210}
        width="100%"
      />
      <ul className="warmup-donut-legend">
        {rows.map((r) => (
          <li key={r.name}>
            <span className="warmup-donut-dot" style={{ background: r.color }} aria-hidden />
            <span className="warmup-donut-name">{r.name}</span>
            <span className="warmup-donut-pct">{r.value.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
