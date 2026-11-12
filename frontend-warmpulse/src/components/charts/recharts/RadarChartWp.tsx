import type { ReactElement } from 'react';
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';

export interface RadarSeries<T> {
  key: keyof T & string;
  name: string;
  color?: string;
}

export interface RadarChartWpProps<T extends Record<string, unknown>> {
  data: T[];
  /** Key for the category label on each axis spoke. */
  angleKey: keyof T & string;
  series: Array<RadarSeries<T>>;
  height?: number;
  domain?: [number, number];
  fillOpacity?: number;
  showLegend?: boolean;
  valueFormatter?: (v: unknown, name: unknown) => string;
  tooltipContent?: ReactElement;
  className?: string;
}

export function RadarChartWp<T extends Record<string, unknown>>({
  data,
  angleKey,
  series,
  height = 320,
  domain = [0, 100],
  fillOpacity = 0.25,
  showLegend = true,
  valueFormatter,
  tooltipContent,
  className,
}: RadarChartWpProps<T>) {
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={chartTheme.grid.stroke} />
          <PolarAngleAxis
            dataKey={angleKey}
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={domain}
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={false}
            stroke={chartTheme.colors.border}
          />
          <Tooltip
            content={tooltipContent ?? <ChartTooltip valueFormatter={valueFormatter} />}
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
              <Radar
                key={s.key}
                name={s.name}
                dataKey={s.key}
                stroke={color}
                fill={color}
                fillOpacity={fillOpacity}
                strokeWidth={2}
              />
            );
          })}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
