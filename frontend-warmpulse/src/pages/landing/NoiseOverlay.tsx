/**
 * Full-viewport fractal-noise overlay. Data-URI SVG lifted from
 * warmpulse-architecture.html so the React app matches the static spec.
 *
 * Fixed, pointer-events-none, z-0, opacity 0.03 — sits behind every
 * interactive layer without costing a render pass per frame.
 */
const NOISE_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function NoiseOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-[0.03]"
      style={{ backgroundImage: NOISE_DATA_URI }}
    />
  );
}
