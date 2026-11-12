import type { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import { apexBaseOptions, chartTheme, paletteAt } from '../theme';
import { ApexChart } from './lazy';

export interface TreemapNode {
  name: string;
  value: number;
  color?: string;
}

export interface TreemapWpProps {
  data: TreemapNode[];
  height?: number;
  /** Use the primary→warning→danger palette instead of the default rainbow. */
  monochrome?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function TreemapWp({ data, height = 320, monochrome = false, className, ariaLabel }: TreemapWpProps) {
  const { series, options } = useMemo(() => {
    const rawData = data.map((d, i) => ({
      x: d.name,
      y: d.value,
      fillColor: d.color ?? paletteAt(i),
    }));
    const opts: ApexOptions = {
      ...apexBaseOptions,
      chart: { ...apexBaseOptions.chart, type: 'treemap' },
      dataLabels: {
        enabled: true,
        style: { fontSize: '12px', colors: [chartTheme.colors.text], fontFamily: chartTheme.font.family },
        formatter: (text, op) => {
          const point = op as unknown as { value: number };
          return `${String(text)}: ${point.value}`;
        },
      },
      legend: { show: false },
      plotOptions: {
        treemap: {
          distributed: !monochrome,
          enableShades: monochrome,
          shadeIntensity: 0.4,
          colorScale: monochrome
            ? {
                ranges: [
                  { from: -Infinity, to: 0, color: chartTheme.colors.danger },
                  { from: 0, to: Infinity, color: chartTheme.colors.primary },
                ],
              }
            : undefined,
        },
      },
      stroke: { width: 2, colors: [chartTheme.colors.surface] },
    };
    return { series: [{ data: rawData }], options: opts };
  }, [data, monochrome]);

  return (
    <div className={className} role="img" aria-label={ariaLabel ?? 'Treemap'} style={{ width: '100%' }}>
      <ApexChart options={options} series={series} type="treemap" height={height} />
    </div>
  );
}
