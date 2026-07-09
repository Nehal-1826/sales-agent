import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme } from '../theme';

export interface HistogramBin {
  bin: string;
  count: number;
  /** Lower edge of the bin (inclusive). */
  x0: number;
  /** Upper edge of the bin (exclusive). */
  x1: number;
}

/** Equal-width binning helper. Returns `binCount` buckets covering [min, max]. */
export function binValues(values: number[], binCount = 10, labelDigits = 1): HistogramBin[] {
  if (values.length === 0 || binCount <= 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) max = min + 1;
  const width = (max - min) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const x0 = min + i * width;
    const x1 = i === binCount - 1 ? max : x0 + width;
    return { x0, x1, count: 0, bin: `${x0.toFixed(labelDigits)}–${x1.toFixed(labelDigits)}` };
  });
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx]!.count += 1;
  }
  return bins;
}

export interface HistogramWpProps {
  /** Either raw values (will be binned) OR pre-computed bins. */
  values?: number[];
  bins?: HistogramBin[];
  binCount?: number;
  height?: number;
  color?: string;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  tooltipContent?: ReactElement;
  className?: string;
}

export function HistogramWp({
  values,
  bins,
  binCount = 10,
  height = 320,
  color = chartTheme.colors.primary,
  xFormatter,
  yFormatter,
  valueFormatter,
  showGrid = true,
  tooltipContent,
  className,
}: HistogramWpProps) {
  const computed = bins ?? (values ? binValues(values, binCount) : []);
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={computed} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={0} barCategoryGap={1}>
          {showGrid ? (
            <CartesianGrid
              stroke={chartTheme.grid.stroke}
              strokeDasharray={chartTheme.grid.strokeDasharray}
              vertical={false}
            />
          ) : null}
          <XAxis
            dataKey="bin"
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={{ stroke: chartTheme.colors.border }}
            tickLine={false}
            tickFormatter={xFormatter}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yFormatter}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: color, fillOpacity: 0.08 }}
            content={
              tooltipContent ?? (
                <ChartTooltip labelFormatter={xFormatter} valueFormatter={valueFormatter} />
              )
            }
          />
          <Bar dataKey="count" name="Count" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
