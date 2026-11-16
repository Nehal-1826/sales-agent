import type { ReactElement } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';
import type { AreaSeries } from './AreaChartWp';

export interface StackedAreaChartWpProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: Array<AreaSeries<T>>;
  height?: number;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  showLegend?: boolean;
  /** When true (default), series stack. Disable for overlay. */
  stacked?: boolean;
  /** Percentage stack (0-100 normalized). */
  percent?: boolean;
  yDomain?: [number | 'auto', number | 'auto'];
  tooltipContent?: ReactElement;
  className?: string;
  gradientIdPrefix?: string;
}

export function StackedAreaChartWp<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 320,
  xFormatter,
  yFormatter,
  valueFormatter,
  showGrid = true,
  showLegend = true,
  stacked = true,
  percent = false,
  yDomain,
  tooltipContent,
  className,
  gradientIdPrefix = 'wp-stacked',
}: StackedAreaChartWpProps<T>) {
  const stackId = stacked ? '1' : undefined;
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          stackOffset={percent ? 'expand' : undefined}
          margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
        >
          <defs>
            {series.map((s, i) => {
              const color = s.color ?? paletteAt(i);
              return (
                <linearGradient
                  key={s.key}
                  id={`${gradientIdPrefix}-${s.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              );
            })}
          </defs>
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
            minTickGap={24}
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
            cursor={{ stroke: chartTheme.colors.primary, strokeOpacity: 0.25 }}
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
            const color = s.color ?? paletteAt(i);
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#${gradientIdPrefix}-${s.key})`}
                stackId={stackId}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
