import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Live, interactive ambient background.
 *
 * Soft radial blobs in warm brand tones (success-green / amber / orange) drift
 * slowly across a dark canvas, gently pulled toward the cursor. A faint dot grid
 * sits underneath for depth.
 *
 * Performance notes
 * - Mounted at app root once, stays through navigation (no remount cost).
 * - Renders at 1× DPR — this canvas only paints blurry blobs + a faint grid, so
 *   retina pixels are wasted fill-rate; 1× cuts the per-frame cost up to 4×.
 * - The dot grid is a cached repeating pattern: ONE fillRect per frame instead
 *   of a per-cell nested loop (thousands of fillRects).
 * - Animates at ~30fps — plenty for a slow ambient drift.
 * - The /app and /admin shells paint their own opaque background over this
 *   canvas, so it's never visible there — and its rAF loop is pure wasted
 *   CPU/GPU on those data-dense panels. Skip it entirely on those routes.
 * - Pauses when `document.hidden`; honors `prefers-reduced-motion`.
 * - Pointer events pass through; this canvas never traps clicks.
 */
export function LiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mouse position is held in a ref so the rAF loop reads it without
  // re-rendering React. Default to viewport centre so the blobs sit pleasantly
  // before any movement.
  const pointer = useRef({ x: 0.5, y: 0.4, has: false });
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const { pathname } = useLocation();
  const hidden = pathname.startsWith('/app') || pathname.startsWith('/admin');

  useEffect(() => {
    if (hidden) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = 1;
    let w = window.innerWidth;
    let h = window.innerHeight;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Start at the targets so the very first paint is composed correctly —
    // otherwise the blobs ease in from (0,0) and the page looks blank.
    const blobs = [
      // Warm brand tones only — orange / amber / success-green. No blue/teal.
      { x: 0.35, y: 0.4, tx: 0.35, ty: 0.4, color: '61,220,151', radius: 380, ease: 0.022 },
      { x: 0.7, y: 0.65, tx: 0.7, ty: 0.65, color: '255,170,80', radius: 340, ease: 0.016 },
      { x: 0.5, y: 0.85, tx: 0.5, ty: 0.85, color: '255,107,74', radius: 300, ease: 0.012 },
    ];

    // Pre-bake the dot grid into a 1-cell tile and reuse it as a repeating
    // pattern, so the grid is one cheap fillRect per frame.
    const gridSize = 32;
    const tile = document.createElement('canvas');
    tile.width = gridSize;
    tile.height = gridSize;
    const tctx = tile.getContext('2d');
    if (tctx) {
      tctx.fillStyle = 'rgba(255,255,255,0.025)';
      tctx.fillRect(0, 0, 1, 1);
    }
    const gridPattern = tctx ? ctx.createPattern(tile, 'repeat') : null;

    let rafId: number;
    let last = performance.now();

    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX / window.innerWidth;
      pointer.current.y = e.clientY / window.innerHeight;
      pointer.current.has = true;
    };
    if (!reducedMotion.current) window.addEventListener('pointermove', onMove);

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      // ~30fps is plenty for a slow ambient drift and ~33% cheaper than 45fps.
      if (now - last < 33) return;
      last = now;

      if (document.hidden) return; // pause when tab is backgrounded

      // Slight drift even without cursor input, biased toward pointer if any.
      const px = pointer.current.x;
      const py = pointer.current.y;
      const t = now * 0.00015;

      ctx.clearRect(0, 0, w, h);

      // Subtle dot grid — one pattern fill with a slow drift offset.
      if (gridPattern) {
        ctx.save();
        ctx.fillStyle = gridPattern;
        ctx.translate((now * 0.003) % gridSize, (now * 0.005) % gridSize);
        ctx.fillRect(-gridSize, -gridSize, w + gridSize * 2, h + gridSize * 2);
        ctx.restore();
      }

      // Composite the blobs
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i]!;
        // Each blob orbits a per-blob target; the target itself slowly drifts
        // around the cursor (pointer.has) or a slow Lissajous if no cursor.
        const baseX = pointer.current.has
          ? px + Math.sin(t * 1.5 + i) * 0.12
          : 0.5 + Math.sin(t + i) * 0.25;
        const baseY = pointer.current.has
          ? py + Math.cos(t * 1.2 + i) * 0.1
          : 0.45 + Math.cos(t * 0.9 + i * 1.3) * 0.18;
        b.tx = baseX;
        b.ty = baseY;
        if (reducedMotion.current) {
          b.x = b.tx;
          b.y = b.ty;
        } else {
          b.x += (b.tx - b.x) * b.ease;
          b.y += (b.ty - b.y) * b.ease;
        }
        const cx = b.x * w;
        const cy = b.y * h;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.radius);
        grad.addColorStop(0, `rgba(${b.color},0.32)`);
        grad.addColorStop(0.5, `rgba(${b.color},0.12)`);
        grad.addColorStop(1, `rgba(${b.color},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  );
}
