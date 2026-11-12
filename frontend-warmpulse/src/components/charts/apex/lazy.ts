import { lazy } from 'react';

/**
 * Lazy-loaded react-apexcharts.
 * Every Apex chart wrapper in this library imports from here so that
 * apexcharts (heavy) is code-split out of the main bundle. Always render
 * inside `<Suspense fallback={...}>` — or use the wrappers in `./index.ts`
 * which include Suspense already.
 */
export const ApexChart = lazy(() => import('react-apexcharts'));
