import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { formatDayTick, type ChartTheme } from './chartTheme';
import { fmtPercent } from '../../lib/format';
import type { WarmupPlacementTrendPoint } from '../../lib/warmupApi';

/**
 * Inbox / promotions / spam split over time as an ApexCharts line chart —
 * the reputation view's placement trend. Same token-driven options contract
 * as WarmthChart (no hardcoded colors, animations off for reduced motion);
 * three series instead of one and no on-point labels (they'd collide).
 */
export function PlacementTrendChart({
  points,
  theme,
}: {
  points: WarmupPlacementTrendPoint[];
  theme: ChartTheme;
}) {
  // series must be the component's own prop, never inside options
  const series: ApexOptions['series'] = [
    { name: 'Inbox', data: points.map((p) => Math.round(p.inbox_pct * 10) / 10) },
    { name: 'Promotions', data: points.map((p) => Math.round(p.promotions_pct * 10) / 10) },
    { name: 'Spam', data: points.map((p) => Math.round(p.spam_pct * 10) / 10) },
  ];
  const options: ApexOptions = {
    chart: {
      type: 'line',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: theme.fontFamily,
      foreColor: theme.text2,
      redrawOnParentResize: true,
    },
    colors: [theme.accent, theme.warn, theme.danger],
    stroke: { curve: 'smooth', width: 2 },
    grid: {
      borderColor: theme.border,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 12, top: 4 },
    },
    xaxis: {
      categories: points.map((p) => p.date),
      tickAmount: Math.min(6, points.length),
      tickPlacement: 'on',
      labels: {
        formatter: (value: string) => formatDayTick(value),
        style: { colors: [theme.text2], fontSize: '11px' },
        hideOverlappingLabels: true,
      },
      axisBorder: { color: theme.border },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: 0,
      max: 100,
      tickAmount: 5,
      labels: {
        formatter: (v: number) => fmtPercent(v),
        style: { colors: [theme.text2], fontSize: '11px' },
      },
    },
    legend: {
      show: true,
      // bottom, centered: a top-right row of three items keeps the chart's
      // min-content wider than a 390px phone and overflows the page column
      position: 'bottom',
      horizontalAlign: 'center',
      markers: { size: 5 },
      labels: { colors: theme.text2 },
      itemMargin: { horizontal: 8 },
    },
    tooltip: {
      theme: undefined,
      cssClass: 'warmup-chart-tooltip',
      y: { formatter: (v: number) => `${v.toFixed(1)}%` },
      x: {
        formatter: (value: number, opts?: { dataPointIndex?: number }) => {
          const p = points[opts?.dataPointIndex ?? value]?.date;
          return p ? formatDayTick(p) : String(value);
        },
      },
    },
    states: { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } },
  };

  return <Chart options={options} series={series} type="line" height={260} width="100%" />;
}
