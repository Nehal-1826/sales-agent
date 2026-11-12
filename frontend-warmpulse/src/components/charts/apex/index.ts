/**
 * Public re-exports for ApexCharts-based chart wrappers.
 *
 * Each wrapper is pre-bound to `<Suspense fallback={<Skeleton />}>`, so
 * consumers can import and render them directly without worrying about
 * the lazy boundary. If you need custom Suspense behavior, import the raw
 * components from their individual files (`./SankeyWp`, etc.) and wrap
 * your own boundary.
 */
import { Suspense, type ComponentType } from 'react';
import { createElement, type ReactElement } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

import { SankeyWp as SankeyWpBase, type SankeyWpProps } from './SankeyWp';
import { HeatmapWp as HeatmapWpBase, type HeatmapWpProps } from './HeatmapWp';
import { TreemapWp as TreemapWpBase, type TreemapWpProps } from './TreemapWp';
import { GaugeWp as GaugeWpBase, type GaugeWpProps } from './GaugeWp';

export { ApexChart } from './lazy';
export type { SankeyNode, SankeyLink, SankeyWpProps } from './SankeyWp';
export type { HeatmapCell, HeatmapWpProps } from './HeatmapWp';
export type { TreemapNode, TreemapWpProps } from './TreemapWp';
export type { GaugeWpProps } from './GaugeWp';

function withSuspense<P extends { height?: number; size?: number; className?: string }>(
  Base: ComponentType<P>,
  defaultHeight: number,
): ComponentType<P> {
  function Wrapped(props: P): ReactElement {
    const h = props.size ?? props.height ?? defaultHeight;
    return createElement(
      Suspense,
      {
        fallback: createElement(Skeleton, {
          className: props.className,
          style: { width: '100%', height: h },
        }),
      },
      createElement(Base, props),
    );
  }
  Wrapped.displayName = `Suspense(${Base.displayName ?? Base.name ?? 'ApexChart'})`;
  return Wrapped;
}

export const SankeyWp = withSuspense<SankeyWpProps>(SankeyWpBase, 360);
export const HeatmapWp = withSuspense<HeatmapWpProps>(HeatmapWpBase, 360);
export const TreemapWp = withSuspense<TreemapWpProps>(TreemapWpBase, 320);
export const GaugeWp = withSuspense<GaugeWpProps>(GaugeWpBase, 240);
