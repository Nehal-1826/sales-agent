import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from 'recharts';
import { chartTheme } from '../theme';

export interface SparklineWpProps<T extends Record<string, unknown>> {
  data: T[];
  yKey: keyof T & string;
  color?: string;
  strokeWidth?: number;
  height?: number;
  width?: number | string;
  /** Render as filled area sparkline. */
  area?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Compact sparkline for inline/card contexts.
 * No axes, no grid, no legend, no tooltip — just the line.
 */
export function SparklineWp<T extends Record<string, unknown>>({
  data,
  yKey,
  color = chartTheme.colors.primary,
  strokeWidth = 1.5,
  height = 32,
  width = '100%',
  area = false,
  className,
  ariaLabel = 'Sparkline',
}: SparklineWpProps<T>) {
  return (
    <div
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={{ width, height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {area ? (
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <defs>
              <linearGradient id={`wp-spark-${yKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={yKey}
              stroke={color}
              strokeWidth={strokeWidth}
              fill={`url(#wp-spark-${yKey})`}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={color}
              strokeWidth={strokeWidth}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
