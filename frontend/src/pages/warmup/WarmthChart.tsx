import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { formatDayTick, type ChartTheme } from './chartTheme';
import type { WarmupWarmthPoint } from '../../lib/warmupApi';

/**
 * 30-day mean warmth as an ApexCharts area chart (port of the source
 * Warmth30dArea, which used Recharts). Sparse value labels are kept from the
 * source design — first, last and every 4th point get a number so the eye
 * reads concrete values without clutter. All colors come from the resolved
 * theme tokens; animations stay off for the reduced-motion policy.
 */
export function WarmthChart({ points, theme }: { points: WarmupWarmthPoint[]; theme: ChartTheme }) {
  const last = points.length - 1;
  // react-apexcharts takes `series` as its own prop — it must NOT live in options
  const series: ApexOptions['series'] = [
    {
      name: 'Warmth',
      data: points.map((p) => Math.round(p.score * 10) / 10),
    },
  ];
  const options: ApexOptions = {
    chart: {
      type: 'area',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: theme.fontFamily,
      foreColor: theme.text2,
      redrawOnParentResize: true,
    },
    colors: [theme.accent],
    dataLabels: {
      enabled: true,
      formatter: (_value, opts) => {
        const show = opts.dataPointIndex === 0 || opts.dataPointIndex === last || opts.dataPointIndex % 4 === 0;
        return show ? String(Math.round(points[opts.dataPointIndex]?.score ?? 0)) : '';
      },
      style: {
        colors: [theme.text2],
        fontSize: '11px',
        fontWeight: 600,
      },
      background: {
        enabled: true,
        foreColor: theme.panel,
        borderRadius: 3,
        padding: 2,
        opacity: 0.75,
      },
      offsetY: -7,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.02,
        stops: [0, 100],
      },
    },
    stroke: { curve: 'smooth', width: 2 },
    grid: {
      borderColor: theme.border,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 24, top: 4 },
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
      labels: { style: { colors: [theme.text2], fontSize: '11px' } },
    },
    tooltip: {
      theme: undefined,
      cssClass: 'warmup-chart-tooltip',
      y: { formatter: (v: number) => `${Math.round(v)} / 100` },
      x: { formatter: (value: number, opts?: { dataPointIndex?: number }) => {
        const p = points[opts?.dataPointIndex ?? value]?.date;
        return p ? formatDayTick(p) : String(value);
      } },
    },
    states: { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } },
  };

  return <Chart options={options} series={series} type="area" height={260} width="100%" />;
}
