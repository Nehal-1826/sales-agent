# WarmPulse chart library

Themed, typed wrappers around Recharts + ApexCharts. Every Wave 4/5 page should
import charts from here so the dark theme, palette, and loading/empty states
stay consistent.

## Usage

```tsx
import { AreaChartWp, ChartContainer } from '@/components/charts';

<ChartContainer title="Warmth trend" subtitle="30 days" height={280}>
  <AreaChartWp
    data={points}
    xKey="date"
    series={[{ key: 'warmth_score', name: 'Warmth' }]}
    yDomain={[0, 100]}
  />
</ChartContainer>;
```

All chart components accept a generic `data: T[]` plus column keys (`xKey`,
`yKey`, `series[].key`). Colors for series fall back to `chartTheme.palette`
in order; override per-series via `color`.

## Theming

All colors come from `chartTheme` in `./theme.ts`. Recharts components read
it directly; Apex components compose `apexBaseOptions` plus overrides.
**Never hardcode hex values in chart JSX** — add a token to `theme.ts` first.

`warmthColor(score)` maps 0–100 → danger / warning / primary and is used by
`RadialGaugeWp` + `GaugeWp` by default.

## Chart type → use case

| Component                 | Best for                                               |
|---------------------------|--------------------------------------------------------|
| `LineChartWp`             | Rate-of-change, multi-series trends                    |
| `AreaChartWp`             | Single cumulative metric with trend emphasis           |
| `StackedAreaChartWp`      | Composition over time (set `percent` for 100%)         |
| `BarChartWp`              | Discrete counts per category                           |
| `GroupedBarChartWp`       | Compare 2–4 series per category                        |
| `StackedBarChartWp`       | Composition per category (set `percent` for 100%)      |
| `HorizontalBarChartWp`    | Leaderboards, long category labels                     |
| `DonutChartWp` (`pie`)    | Part-to-whole at a glance; donut center can show total |
| `RadarChartWp`            | Multi-dimensional score (deliverability facets)        |
| `ScatterChartWp`          | Correlation; set `zKey` for bubble mode                |
| `SparklineWp`             | Compact inline trend inside cards/rows                 |
| `HistogramWp`             | Distribution of a numeric variable (`binValues` helper)|
| `ComboChartWp`            | Mixed line + bar + dual Y-axis                         |
| `RadialGaugeWp`           | 0–100 score, lightweight Recharts                      |
| `SankeyWp` (Apex)         | Flow between categorical stages (lazy)                 |
| `HeatmapWp` (Apex)        | 2D density / hour-of-day × day-of-week (lazy)          |
| `TreemapWp` (Apex)        | Nested composition by size (lazy)                      |
| `GaugeWp` (Apex)          | Preferred gauge variant per spec §5.3 (lazy)           |

## Lazy loading

Anything under `./apex` is code-split. Importing from `@/components/charts`
(or `@/components/charts/apex`) gives you the Suspense-wrapped variant — just
render it. If you need to control the Suspense boundary yourself, import
directly from the raw file (e.g. `./apex/SankeyWp`) and import `ApexChart`
from `./apex/lazy`.

## Adding a new chart

1. Copy the closest `recharts/*Wp.tsx` as a template.
2. Keep the file ≤ 120 lines.
3. Type data as `T extends Record<string, unknown>`; never use `any`.
4. Source all colors from `chartTheme` / `paletteAt(i)`.
5. Default to `<ChartTooltip />`; accept `tooltipContent` to override.
6. Add `export * from './recharts/YourChartWp';` to `./index.ts`.
7. Extend the table above.
