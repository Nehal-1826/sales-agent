import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { warmthColor, type ChartTheme } from './chartTheme';
import { fmtNumber } from '../../lib/format';

/** One provider bar — mean warmth across that provider's mailboxes. */
export interface ProviderWarmthRow {
  provider: string;
  count: number;
  mean: number;
}

/** Provider keys → display labels (WarmupMailboxProvider values). */
const LABELS: Record<string, string> = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  smtp: 'SMTP',
  self_hosted: 'Self-hosted',
};

export function providerLabel(provider: string): string {
  return LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Mean warmth per mailbox provider (Gmail / Outlook / SMTP / …) as an
 * ApexCharts bar chart. There is no per-provider placement split in the
 * API — this grouping is computed client-side from the mailbox rows.
 * Distributed bars take one color each (warmth thresholds), same token
 * contract as the other warmup charts.
 */
export function ProviderBarChart({ rows, theme }: { rows: ProviderWarmthRow[]; theme: ChartTheme }) {
  const series: ApexOptions['series'] = [
    { name: 'Mean warmth', data: rows.map((r) => Math.round(r.mean)) },
  ];
  const options: ApexOptions = {
    chart: {
      type: 'bar',
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: theme.fontFamily,
      foreColor: theme.text2,
      redrawOnParentResize: true,
    },
    // distributed: true colors each bar from the palette in order
    colors: rows.map((r) => warmthColor(r.mean, theme)),
    plotOptions: {
      bar: {
        distributed: true,
        columnWidth: '55%',
        borderRadius: 3,
        dataLabels: { position: 'top' },
      },
    },
    dataLabels: {
      enabled: true,
      offsetY: -18,
      style: { colors: [theme.text2], fontSize: '11px', fontWeight: 600 },
      formatter: (v: number) => fmtNumber(v, 0),
    },
    grid: {
      borderColor: theme.border,
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 4, right: 8, top: 12 },
    },
    xaxis: {
      categories: rows.map((r) => providerLabel(r.provider)),
      labels: { style: { colors: [theme.text2], fontSize: '11px' } },
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
    legend: { show: false },
    tooltip: {
      cssClass: 'warmup-chart-tooltip',
      y: { formatter: (v: number) => `${fmtNumber(v, 0)} / 100 mean warmth` },
    },
    states: { active: { filter: { type: 'none' } }, hover: { filter: { type: 'none' } } },
  };

  return <Chart options={options} series={series} type="bar" height={240} width="100%" />;
}
