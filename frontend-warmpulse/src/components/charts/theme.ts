/**
 * Shared chart theme tokens for WarmPulse.
 *
 * All chart components (Recharts + ApexCharts) MUST source colors, strokes,
 * and typography from this file. Do not hardcode hex values in chart JSX.
 *
 * Values mirror `tailwind.config.ts`:
 *   accent  => primary   (#F26522)
 *   accent2 => secondary (#FF8A4B)
 *   accent3 => danger    (#ff6b4a)
 *   accent4 => warning   (#ffd54f)
 */
export const chartTheme = {
  colors: {
    primary: 'rgb(242, 101, 34)',
    secondary: 'rgb(255, 138, 75)',
    danger: 'rgb(255, 107, 74)',
    warning: 'rgb(255, 213, 79)',
    // Neutral colors resolve to the theme CSS vars so axis labels, legends and
    // gridlines stay legible in BOTH themes (near-white text is invisible on
    // the light canvas). Brand orange palette below stays literal — it reads
    // on either background. Fallbacks preserve the dark values if a var is
    // missing (e.g. during SSR/first paint).
    muted: 'var(--text-dim, rgb(136, 136, 160))',
    text: 'var(--text, rgb(232, 232, 240))',
    surface: 'var(--surface, rgb(18, 18, 26))',
    border: 'var(--border-muted, rgb(42, 42, 58))',
  },
  palette: [
    'rgb(242, 101, 34)',
    'rgb(255, 138, 75)',
    'rgb(255, 107, 74)',
    'rgb(255, 213, 79)',
    'rgb(255, 150, 112)',
    'rgb(251, 146, 60)',
    'rgb(255, 200, 100)',
    'rgb(220, 130, 90)',
  ],
  grid: { stroke: 'var(--border-muted, rgb(42, 42, 58))', strokeDasharray: '3 6' },
  tooltip: {
    background: 'rgb(26, 26, 38)',
    border: 'rgb(42, 42, 58)',
    text: 'rgb(232, 232, 240)',
    muted: 'rgb(136, 136, 160)',
  },
  font: { family: 'Outfit, system-ui, sans-serif', sizeSm: 11, sizeMd: 12 },
} as const;

export type ChartPaletteColor = (typeof chartTheme.palette)[number];

/**
 * Safely pick a palette color by index (wraps around). Guarantees a defined
 * return type under `noUncheckedIndexedAccess`.
 */
export function paletteAt(index: number): string {
  const len = chartTheme.palette.length;
  const i = ((index % len) + len) % len;
  // Non-null assertion: index is within bounds after modulo.
  return chartTheme.palette[i]!;
}

/**
 * Color-code a 0–100 warmth score.
 *   <40 → danger (red)
 *   <70 → warning (yellow)
 *   ≥70 → primary (Shailog orange)
 */
export function warmthColor(score: number): string {
  if (score < 40) return chartTheme.colors.danger;
  if (score < 70) return chartTheme.colors.warning;
  return chartTheme.colors.primary;
}

/** ApexCharts-compatible theme fragment. Use `...apexBaseOptions` in chart options. */
export const apexBaseOptions = {
  chart: {
    background: 'transparent',
    foreColor: chartTheme.colors.text,
    fontFamily: chartTheme.font.family,
    toolbar: { show: false },
    animations: { enabled: true, speed: 400 },
  },
  theme: { mode: 'dark' as const },
  colors: [...chartTheme.palette] as string[],
  grid: {
    borderColor: chartTheme.colors.border,
    strokeDashArray: 3,
    xaxis: { lines: { show: false } },
  },
  tooltip: {
    theme: 'dark' as const,
    style: { fontFamily: chartTheme.font.family, fontSize: `${chartTheme.font.sizeMd}px` },
  },
  legend: {
    labels: { colors: chartTheme.colors.muted },
    fontFamily: chartTheme.font.family,
    fontSize: `${chartTheme.font.sizeMd}px`,
  },
  dataLabels: { enabled: false },
};
