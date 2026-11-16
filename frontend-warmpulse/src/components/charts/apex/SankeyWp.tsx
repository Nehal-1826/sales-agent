import type { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import { apexBaseOptions, chartTheme, paletteAt } from '../theme';
import { ApexChart } from './lazy';

export interface SankeyNode {
  id: string;
  name: string;
  color?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyWpProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  height?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * ApexCharts does not ship a first-class Sankey. We render it as a grouped
 * horizontal bar where each source→target link becomes a bar colored by its
 * source node. It captures flow magnitude well in a compact dark-theme chart
 * and avoids adding a new chart library.
 */
export function SankeyWp({ nodes, links, height = 360, className, ariaLabel }: SankeyWpProps) {
  const { series, options } = useMemo(() => {
    const nodeIndex = new Map(nodes.map((n, i) => [n.id, { node: n, index: i }]));
    const categories = links.map((l) => {
      const s = nodeIndex.get(l.source)?.node.name ?? l.source;
      const t = nodeIndex.get(l.target)?.node.name ?? l.target;
      return `${s} → ${t}`;
    });
    const data = links.map((l) => ({
      x: `${nodeIndex.get(l.source)?.node.name ?? l.source} → ${
        nodeIndex.get(l.target)?.node.name ?? l.target
      }`,
      y: l.value,
      fillColor:
        nodeIndex.get(l.source)?.node.color ??
        paletteAt(nodeIndex.get(l.source)?.index ?? 0),
    }));
    const opts: ApexOptions = {
      ...apexBaseOptions,
      chart: { ...apexBaseOptions.chart, type: 'bar' },
      plotOptions: {
        bar: { horizontal: true, borderRadius: 4, distributed: true, dataLabels: { position: 'center' } },
      },
      dataLabels: {
        enabled: true,
        style: { colors: [chartTheme.colors.text], fontSize: '11px' },
        formatter: (val) => String(val),
      },
      xaxis: {
        categories,
        labels: { style: { colors: chartTheme.colors.muted } },
        axisBorder: { color: chartTheme.colors.border },
        axisTicks: { color: chartTheme.colors.border },
      },
      yaxis: { labels: { style: { colors: chartTheme.colors.muted } } },
      legend: { show: false },
    };
    return { series: [{ name: 'Flow', data }], options: opts };
  }, [nodes, links]);

  return (
    <div className={className} role="img" aria-label={ariaLabel ?? 'Flow diagram'} style={{ width: '100%' }}>
      <ApexChart options={options} series={series} type="bar" height={height} />
    </div>
  );
}
