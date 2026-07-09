import type { ReactElement } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';

export interface LineSeries<T> {
  key: keyof T & string;
  name: string;
  color?: string;
  dashed?: boolean;
}

export interface LineChartWpProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: Array<LineSeries<T>>;
  height?: number;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  showLegend?: boolean;
  strokeWidth?: number;
  dot?: boolean;
  yDomain?: [number | 'auto', number | 'auto'];
  tooltipContent?: ReactElement;
  className?: string;
}

export function LineChartWp<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 320,
  xFormatter,
  yFormatter,
  valueFormatter,
  showGrid = true,
  showLegend = true,
  strokeWidth = 2,
  dot = false,
  yDomain,
  tooltipContent,
  className,
}: LineChartWpProps<T>) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
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
            tickFormatter={yFormatter}
            width={40}
            domain={yDomain}
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
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? paletteAt(i)}
              strokeWidth={strokeWidth}
              strokeDasharray={s.dashed ? '4 4' : undefined}
              dot={dot}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
