import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';
import type { BarSeries } from './BarChartWp';

export interface StackedBarChartWpProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: Array<BarSeries<T>>;
  height?: number;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  showLegend?: boolean;
  /** Render a percentage stack (0-100% normalized). */
  percent?: boolean;
  barRadius?: number;
  yDomain?: [number | 'auto', number | 'auto'];
  tooltipContent?: ReactElement;
  className?: string;
}

export function StackedBarChartWp<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 320,
  xFormatter,
  yFormatter,
  valueFormatter,
  showGrid = true,
  showLegend = true,
  percent = false,
  barRadius = 3,
  yDomain,
  tooltipContent,
  className,
}: StackedBarChartWpProps<T>) {
  const last = series[series.length - 1]?.key;
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          stackOffset={percent ? 'expand' : undefined}
          margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
        >
          {showGrid ? (
            <CartesianGrid
              stroke={chartTheme.grid.stroke}
              strokeDasharray={chartTheme.grid.strokeDasharray}
              vertical={false}
            />
          ) : null}
          <XAxis
            dataKey={xKey}
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={{ stroke: chartTheme.colors.border }}
            tickLine={false}
            tickFormatter={xFormatter}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={false}
            tickLine={false}
            tickFormatter={
              yFormatter ?? (percent ? (v: unknown) => `${Math.round(Number(v) * 100)}%` : undefined)
            }
            width={48}
            domain={yDomain ?? (percent ? [0, 1] : undefined)}
          />
          <Tooltip
            cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
            content={
              tooltipContent ?? (
                <ChartTooltip labelFormatter={xFormatter} valueFormatter={valueFormatter} />
              )
            }
          />
          {showLegend ? (
            <Legend
              verticalAlign="bottom"
              align="left"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{
                color: chartTheme.colors.muted,
                fontSize: chartTheme.font.sizeSm,
                paddingTop: 8,
              }}
            />
          ) : null}
          {series.map((s, i) => {
            const isLast = s.key === last;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color ?? paletteAt(i)}
                stackId="stack"
                radius={isLast ? [barRadius, barRadius, 0, 0] : 0}
                maxBarSize={48}
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
