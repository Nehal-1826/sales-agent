/*
 * AuroraBackdrop — CSS re-implementation of React Bits' "Aurora" background
 * (https://reactbits.dev · github.com/DavidHDev/react-bits, MIT + Commons
 * Clause v1.0, © 2026 David Haz). Upstream Aurora is a WebGL2 shader canvas;
 * this variant keeps the violet aurora look with none of that cost:
 *   - colors come from the app's violet tokens (color-mix over --accent)
 *   - compositor-only transform drift — no canvas, no layout shift
 *     (absolute, overflow-clipped, pointer-events: none)
 *   - prefers-reduced-motion: blobs stop drifting, the static violet wash stays
 * Pure markup: renders on the server (prerendered landing page) without window.
 */
export function AuroraBackdrop() {
  return (
    <div className="aurora-backdrop" aria-hidden="true">
      <span className="aurora-blob aurora-a" />
      <span className="aurora-blob aurora-b" />
      <span className="aurora-blob aurora-c" />
    </div>
  );
}
