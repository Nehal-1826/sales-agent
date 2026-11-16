import type { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import { apexBaseOptions, chartTheme } from '../theme';
import { ApexChart } from './lazy';

export interface HeatmapCell {
  x: string | number;
  y: string | number;
  value: number;
}

export interface HeatmapWpProps {
  data: HeatmapCell[];
  /** Optional explicit X order — otherwise derived from data insertion order. */
  xLabels?: Array<string | number>;
  /** Optional explicit Y order. */
  yLabels?: Array<string | number>;
  height?: number;
  /** Override the 5-step color scale (green → yellow → red). */
  ranges?: Array<{ from: number; to: number; color: string; name: string }>;
  className?: string;
  ariaLabel?: string;
}

const DEFAULT_RANGES = [
  { from: 0, to: 19, color: 'rgb(42, 42, 58)', name: 'Very low' },
  { from: 20, to: 39, color: chartTheme.colors.danger, name: 'Low' },
  { from: 40, to: 59, color: chartTheme.colors.warning, name: 'Medium' },
  { from: 60, to: 79, color: 'rgb(96, 165, 250)', name: 'High' },
  { from: 80, to: 100, color: chartTheme.colors.primary, name: 'Very high' },
];

export function HeatmapWp({
  data,
  xLabels,
  yLabels,
  height = 360,
  ranges = DEFAULT_RANGES,
  className,
  ariaLabel,
}: HeatmapWpProps) {
  const { series, options } = useMemo(() => {
    const yOrder = yLabels ?? Array.from(new Set(data.map((d) => d.y)));
    const xOrder = xLabels ?? Array.from(new Set(data.map((d) => d.x)));
    const byY = new Map<string | number, Map<string | number, number>>();
    for (const cell of data) {
      let row = byY.get(cell.y);
      if (!row) {
        row = new Map();
        byY.set(cell.y, row);
      }
      row.set(cell.x, cell.value);
    }
    const built = yOrder.map((y) => ({
      name: String(y),
      data: xOrder.map((x) => ({ x: String(x), y: byY.get(y)?.get(x) ?? 0 })),
    }));
    const opts: ApexOptions = {
      ...apexBaseOptions,
      chart: { ...apexBaseOptions.chart, type: 'heatmap' },
      plotOptions: {
        heatmap: {
          radius: 4,
          enableShades: false,
          colorScale: { ranges },
        },
      },
      xaxis: {
        type: 'category',
        labels: { style: { colors: chartTheme.colors.muted } },
        axisBorder: { color: chartTheme.colors.border },
      },
      yaxis: { labels: { style: { colors: chartTheme.colors.muted } } },
      stroke: { width: 1, colors: [chartTheme.colors.surface] },
    };
    return { series: built, options: opts };
  }, [data, xLabels, yLabels, ranges]);

  return (
    <div className={className} role="img" aria-label={ariaLabel ?? 'Heatmap'} style={{ width: '100%' }}>
      <ApexChart options={options} series={series} type="heatmap" height={height} />
    </div>
  );
}
