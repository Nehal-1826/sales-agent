import type { ReactElement } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartTooltip } from '../ChartTooltip';
import { chartTheme, paletteAt } from '../theme';

export type ComboSeriesType = 'bar' | 'line' | 'area';

/**
 * Optional datapoint labels for a series. When set, a Recharts ``<LabelList>``
 * is rendered on the series.
 *
 * - ``every`` (default 1): show a label only on every Nth datapoint — the
 *   user-friendly "every 4th point on a 30-day series" pattern. The first
 *   and last point are always labelled if ``every > 1`` so the endpoints read
 *   cleanly.
 * - ``position``: passed to ``<LabelList>`` (line series → 'top',
 *   bar series → 'top' over the bar). Sensible defaults applied per series
 *   type so callers usually don't need to pick.
 * - ``formatter``: format the numeric value into a label string.
 * - ``dataKey``: when set, the label reads its value from this key on the
 *   row instead of the series' own key. Use for "render the bar from
 *   `volume` but label it with `volumeWeekly`". A row whose value at this
 *   key is non-finite is skipped (no label rendered).
 */
export interface ComboSeriesLabels {
  every?: number;
  position?: 'top' | 'bottom' | 'inside' | 'insideTop';
  formatter?: (v: number) => string;
  dataKey?: string;
}

export interface ComboSeries<T> {
  key: keyof T & string;
  name: string;
  type: ComboSeriesType;
  color?: string;
  /** Which Y-axis ('left' default, 'right' for dual-axis). */
  yAxis?: 'left' | 'right';
  /** Optional datapoint labels rendered on the series. */
  labels?: ComboSeriesLabels;
}

export interface ComboChartWpProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: Array<ComboSeries<T>>;
  height?: number;
  xFormatter?: (v: unknown) => string;
  yFormatter?: (v: unknown) => string;
  yRightFormatter?: (v: unknown) => string;
  valueFormatter?: (v: unknown, name: unknown) => string;
  showGrid?: boolean;
  showLegend?: boolean;
  tooltipContent?: ReactElement;
  className?: string;
}

/** Composed line + bar (+ area) chart with optional dual Y-axis. */
export function ComboChartWp<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 320,
  xFormatter,
  yFormatter,
  yRightFormatter,
  valueFormatter,
  showGrid = true,
  showLegend = true,
  tooltipContent,
  className,
}: ComboChartWpProps<T>) {
  const hasRight = series.some((s) => s.yAxis === 'right');
  return (
    <div className={className} style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
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
            yAxisId="left"
            tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yFormatter}
            width={40}
          />
          {hasRight ? (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: chartTheme.colors.muted, fontSize: chartTheme.font.sizeSm }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yRightFormatter ?? yFormatter}
              width={40}
            />
          ) : null}
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
            const yAxisId = s.yAxis === 'right' ? 'right' : 'left';
            const labels = s.labels;
            // Recharts ``<LabelList>`` formatter — also gates which points
            // show a label by returning '' for filtered points.
            const labelChild = labels ? (() => {
              const every = Math.max(1, Math.floor(labels.every ?? 1));
              const total = data.length;
              const fmt = labels.formatter ?? ((v: number) => String(Math.round(v)));
              const labelFormatter = (value: unknown, _entry: unknown, ix?: number): string => {
                if (typeof value !== 'number' || !Number.isFinite(value)) return '';
                // Recharts passes the bar/line index in the 3rd arg of the
                // formatter signature when available; some types omit it,
                // so fall back to a dataIndex-shaped property on the entry.
                const idx =
                  typeof ix === 'number'
                    ? ix
                    : (_entry as { index?: number; payload?: { index?: number } } | undefined)
                        ?.index ?? 0;
                if (every <= 1) return fmt(value);
                // Always keep the endpoints so the eye locks onto the range.
                if (idx === 0 || idx === total - 1) return fmt(value);
                return idx % every === 0 ? fmt(value) : '';
              };
              const defaultPos: 'top' | 'insideTop' =
                s.type === 'bar' ? 'top' : 'top';
              return (
                <LabelList
                  dataKey={labels.dataKey ?? s.key}
                  position={labels.position ?? defaultPos}
                  // recharts' LabelList formatter typing is loose — its 3rd
                  // arg (entry index) is informally supplied.
                  formatter={labelFormatter as unknown as (value: unknown) => string}
                  style={{
                    fill: chartTheme.colors.text,
                    fontSize: chartTheme.font.sizeSm,
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    paintOrder: 'stroke',
                    stroke: chartTheme.colors.surface,
                    strokeWidth: 3,
                    strokeLinejoin: 'round',
                  }}
                />
              );
            })() : null;

            if (s.type === 'bar') {
              return (
                <Bar
                  key={s.key}
                  yAxisId={yAxisId}
                  dataKey={s.key}
                  name={s.name}
                  fill={color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={32}
                >
                  {labelChild}
                </Bar>
              );
            }
            if (s.type === 'area') {
              return (
                <Area
                  key={s.key}
                  yAxisId={yAxisId}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={color}
                  fill={color}
                  fillOpacity={0.2}
                  strokeWidth={2}
                >
                  {labelChild}
                </Area>
              );
            }
            return (
              <Line
                key={s.key}
                yAxisId={yAxisId}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
              >
                {labelChild}
              </Line>
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
