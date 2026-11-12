import type { ApexOptions } from 'apexcharts';
import { useMemo } from 'react';
import { apexBaseOptions, chartTheme, warmthColor } from '../theme';
import { ApexChart } from './lazy';

export interface GaugeWpProps {
  /** 0–100 value. */
  value: number;
  label?: string;
  size?: number;
  /** Override the auto-derived color (defaults to `warmthColor(value)`). */
  color?: string;
  /** Text rendered below the big number (small caps). */
  subLabel?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * ApexCharts radialBar gauge. Preferred over the Recharts `RadialGaugeWp`
 * per the architecture spec (which lists ApexCharts for gauges). Lazy-loaded.
 */
export function GaugeWp({ value, label, size = 240, color, subLabel, className, ariaLabel }: GaugeWpProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const resolvedColor = color ?? warmthColor(clamped);
  const options = useMemo<ApexOptions>(
    () => ({
      ...apexBaseOptions,
      chart: { ...apexBaseOptions.chart, type: 'radialBar', sparkline: { enabled: true } },
      colors: [resolvedColor],
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          hollow: { size: '62%' },
          track: { background: chartTheme.colors.border, strokeWidth: '100%', margin: 0 },
          dataLabels: {
            name: {
              show: Boolean(label),
              offsetY: 22,
              color: chartTheme.colors.muted,
              fontSize: '12px',
              fontFamily: chartTheme.font.family,
            },
            value: {
              show: true,
              offsetY: -12,
              color: chartTheme.colors.text,
              fontSize: '30px',
              fontFamily: chartTheme.font.family,
              fontWeight: 600,
              formatter: (val) => `${Math.round(Number(val))}`,
            },
          },
        },
      },
      stroke: { lineCap: 'round' },
      labels: label ? [label] : [''],
    }),
    [label, resolvedColor],
  );

  return (
    <div
      className={className}
      role="img"
      aria-label={ariaLabel ?? `${label ?? 'Gauge'}: ${clamped}`}
      style={{ width: size, height: size, position: 'relative' }}
    >
      <ApexChart options={options} series={[clamped]} type="radialBar" height={size} width={size} />
      {subLabel ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[11px] uppercase tracking-wide"
          style={{ color: chartTheme.colors.muted }}
        >
          {subLabel}
        </div>
      ) : null}
    </div>
  );
}
