import type { ReactElement } from 'react';
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';

export interface ScatterGroup<T extends Record<string, unknown>> {
  name: string;
  data: T[];
  color?: string;
}

export interface ScatterChartWpProps<T extends Record<string, unknown>> {
  groups: Array<ScatterGroup<T>>;
  xKey: keyof T & string;
  yKey: keyof T & string;
  /** Optional key for bubble size (enables bubble-chart mode). */
  zKey?: keyof T & string;
  zRange?: [number, number];
  height?: number;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  showLegend?: boolean;
  xName?: string;
  yName?: string;
  tooltipContent?: ReactElement;
  className?: string;
}

export function ScatterChartWp<T extends Record<string, unknown>>({
  groups,
  xKey,
  yKey,
  zKey,
  zRange = [40, 320],
  height = 320,
  xFormatter,
  yFormatter,
  valueFormatter,
  showGrid = true,
  showLegend = true,
  xName,
  yName,
  tooltipContent,
  className,
}: ScatterChartWpProps<T>) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          {showGrid ? (
            <CartesianGrid
              stroke={chartTheme.grid.stroke}
              strokeDasharray={chartTheme.grid.strokeDasharray}
            />
          ) : null}
          <XAxis
            type="number"
            dataKey={xKey}
            name={xName}
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={{ stroke: chartTheme.colors.border }}
            tickLine={false}
            tickFormatter={xFormatter}
          />
          <YAxis
            type="number"
            dataKey={yKey}
            name={yName}
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yFormatter}
            width={40}
          />
          {zKey ? <ZAxis type="number" dataKey={zKey} range={zRange} /> : null}
          <Tooltip
            cursor={{ stroke: chartTheme.colors.border, strokeDasharray: '3 3' }}
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
          {groups.map((g, i) => (
            <Scatter key={g.name} name={g.name} data={g.data} fill={g.color ?? paletteAt(i)} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
