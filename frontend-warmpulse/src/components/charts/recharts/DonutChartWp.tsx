import type { ReactElement } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartWpProps {
  data: DonutDatum[];
  height?: number;
  /** Switch from donut to solid pie. */
  pie?: boolean;
  innerRadius?: number | string;
  outerRadius?: number | string;
  paddingAngle?: number;
  showLegend?: boolean;
  /** Optional centered label for donut (e.g., "87%"). Ignored when `pie`. */
  centerLabel?: string;
  /** Smaller text beneath centerLabel. */
  centerSubLabel?: string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  tooltipContent?: ReactElement;
  className?: string;
}

export function DonutChartWp({
  data,
  height = 280,
  pie = false,
  innerRadius,
  outerRadius = '80%',
  paddingAngle = 2,
  showLegend = true,
  centerLabel,
  centerSubLabel,
  valueFormatter,
  tooltipContent,
  className,
}: DonutChartWpProps) {
  const resolvedInner = pie ? 0 : (innerRadius ?? '60%');
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            content={tooltipContent ?? <ChartTooltip valueFormatter={valueFormatter} />}
          />
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={resolvedInner}
            outerRadius={outerRadius}
            paddingAngle={pie ? 0 : paddingAngle}
            dataKey="value"
            nameKey="name"
            stroke="none"
            isAnimationActive
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={entry.color ?? paletteAt(i)} />
            ))}
          </Pie>
          {showLegend ? (
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{
                color: chartTheme.colors.muted,
                fontSize: chartTheme.font.sizeSm,
                paddingTop: 8,
              }}
            />
          ) : null}
        </PieChart>
      </ResponsiveContainer>
      {!pie && (centerLabel || centerSubLabel) ? (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ top: showLegend ? -12 : 0 }}
        >
          {centerLabel ? (
            <span className="text-2xl font-semibold tabular-nums" style={{ color: chartTheme.colors.text }}>
              {centerLabel}
            </span>
          ) : null}
          {centerSubLabel ? (
            <span className="text-xs" style={{ color: chartTheme.colors.muted }}>
              {centerSubLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
