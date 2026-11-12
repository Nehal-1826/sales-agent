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

export interface HorizontalBarChartWpProps<T extends Record<string, unknown>> {
  data: T[];
  /** Category key rendered on the Y axis. */
  yKey: keyof T & string;
  series: Array<BarSeries<T>>;
  height?: number;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  showLegend?: boolean;
  barRadius?: number;
  categoryWidth?: number;
  tooltipContent?: ReactElement;
  className?: string;
}

/** Horizontal bar chart. Good for leaderboards and ranked lists. */
export function HorizontalBarChartWp<T extends Record<string, unknown>>({
  data,
  yKey,
  series,
  height = 320,
  xFormatter,
  yFormatter,
  valueFormatter,
  showGrid = true,
  showLegend = false,
  barRadius = 3,
  categoryWidth = 100,
  tooltipContent,
  className,
}: HorizontalBarChartWpProps<T>) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          {showGrid ? (
            <CartesianGrid
              stroke={chartTheme.grid.stroke}
              strokeDasharray={chartTheme.grid.strokeDasharray}
              horizontal={false}
            />
          ) : null}
          <XAxis
            type="number"
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={false}
            tickLine={false}
            tickFormatter={xFormatter}
          />
          <YAxis
            type="category"
            dataKey={yKey}
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={{ stroke: chartTheme.colors.border }}
            tickLine={false}
            tickFormatter={yFormatter}
            width={categoryWidth}
          />
          <Tooltip
            cursor={{ fill: chartTheme.colors.primary, fillOpacity: 0.06 }}
            content={
              tooltipContent ?? (
                <ChartTooltip labelFormatter={yFormatter} valueFormatter={valueFormatter} />
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
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? paletteAt(i)}
              radius={[0, barRadius, barRadius, 0]}
              maxBarSize={24}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
