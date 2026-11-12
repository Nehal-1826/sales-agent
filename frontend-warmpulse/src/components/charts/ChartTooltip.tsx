import type { TooltipProps } from 'recharts';
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import { chartTheme } from './theme';

export interface ChartTooltipProps extends TooltipProps<ValueType, NameType> {
  /** Override the X-axis label formatter (defaults to identity). */
  labelFormatter?: (label: unknown) => string;
  /** Override the per-series value formatter (defaults to `String(v)`). */
  valueFormatter?: (value: unknown, name: unknown) => string;
}

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

/**
 * Dark-themed Recharts tooltip body. Pass as `<Tooltip content={<ChartTooltip />} />`.
 * Handles an arbitrary number of series (line, bar, area, composed).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const fmtLabel = labelFormatter ?? ((l: unknown) => (l === undefined ? '' : String(l)));
  const fmtValue = valueFormatter ?? ((v: unknown) => defaultFormat(v));

  return (
    <div
      className="rounded-lg border px-3 py-2 shadow-lg"
      style={{
        backgroundColor: chartTheme.tooltip.background,
        borderColor: chartTheme.tooltip.border,
        fontFamily: chartTheme.font.family,
        fontSize: chartTheme.font.sizeMd,
        color: chartTheme.tooltip.text,
        minWidth: 120,
      }}
    >
      {label !== undefined && label !== '' ? (
        <div
          className="mb-1 text-[11px] font-medium uppercase tracking-wide"
          style={{ color: chartTheme.tooltip.muted }}
        >
          {fmtLabel(label)}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {payload.map((p, i) => {
          const color =
            (p.color as string | undefined) ??
            (typeof p.stroke === 'string' ? p.stroke : undefined) ??
            chartTheme.colors.primary;
          const name = p.name ?? p.dataKey ?? '';
          return (
            <li key={`${String(name)}-${i}`} className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span
                className="flex-1 truncate text-[12px]"
                style={{ color: chartTheme.tooltip.muted }}
              >
                {String(name)}
              </span>
              <span className="tabular-nums font-medium" style={{ color: chartTheme.tooltip.text }}>
                {fmtValue(p.value, name)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
