import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { chartTheme, warmthColor } from '../theme';

export interface RadialGaugeWpProps {
  /** 0–100 value. */
  value: number;
  label?: string;
  /** Small text below the big number (e.g., "warmth"). */
  subLabel?: string;
  size?: number;
  /** Override the auto-derived color (defaults to `warmthColor(value)`). */
  color?: string;
  /** Overall domain (defaults to 0–100). */
  max?: number;
  className?: string;
  /** Optional suffix rendered next to the number (e.g., "%"). */
  suffix?: string;
}

/** Half-ring radial gauge built with Recharts. Preferred lightweight variant. */
export function RadialGaugeWp({
  value,
  label,
  subLabel,
  size = 240,
  color,
  max = 100,
  suffix,
  className,
}: RadialGaugeWpProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const resolvedColor = color ?? warmthColor((clamped / max) * 100);
  const data = [{ name: 'value', value: clamped, fill: resolvedColor }];

  return (
    <div
      className={className}
      role="img"
      aria-label={`${label ?? 'Gauge'}: ${clamped}${suffix ?? ''}`}
      style={{ width: size, height: size, position: 'relative' }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="70%"
          outerRadius="100%"
          barSize={14}
          data={data}
          startAngle={210}
          endAngle={-30}
        >
          <PolarAngleAxis type="number" domain={[0, max]} tick={false} />
          <RadialBar
            background={{ fill: chartTheme.colors.border }}
            dataKey="value"
            cornerRadius={8}
            isAnimationActive
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-semibold tabular-nums"
          style={{ color: chartTheme.colors.text }}
        >
          {Math.round(clamped)}
          {suffix ? <span className="ml-0.5 text-lg text-text-dim">{suffix}</span> : null}
        </span>
        {label ? (
          <span
            className="mt-0.5 text-sm font-medium"
            style={{ color: resolvedColor }}
          >
            {label}
          </span>
        ) : null}
        {subLabel ? (
          <span className="text-[11px] uppercase tracking-wide" style={{ color: chartTheme.colors.muted }}>
            {subLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
