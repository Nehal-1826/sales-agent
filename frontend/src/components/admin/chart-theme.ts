/** Shared chart palette + axis/grid/tooltip styles for admin charts.
 *  Warm/orange + neutral only — no purple/blue/teal. */
export const ADMIN_CHART = {
  series: ['#F26522', '#FF8A4B', '#3ddc97', '#ffb066', '#ff5c7a'],
  grid: 'rgba(255,255,255,0.08)',
  axis: 'rgba(255,255,255,0.42)',
  tooltip: {
    background: 'rgba(20,18,28,0.95)',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 12,
  },
} as const;
