import './loaders.css';

/* ============================================================================
   ButtonLoader — small in-button spinner (B3 Pulse Dot).
   Inherits color from currentColor so it works on any button variant.
============================================================================ */

export interface ButtonLoaderProps {
  className?: string;
  'aria-label'?: string;
}

export function ButtonLoader({ className = '', ...rest }: ButtonLoaderProps) {
  return (
    <span
      className={`wp-btn-loader ${className}`}
      role="status"
      aria-live="polite"
      aria-label={rest['aria-label'] ?? 'Loading'}
    />
  );
}

/* ============================================================================
   InlineLoader — medium loader for cards / list items (I3 Diamond Mesh).
============================================================================ */

export interface InlineLoaderProps {
  size?: number;
  className?: string;
}

export function InlineLoader({ size = 32, className = '' }: InlineLoaderProps) {
  return (
    <span
      className={`wp-inline-loader ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <svg viewBox="0 0 100 100" className="wp-inline-loader__svg">
        <polygon points="50,14 86,50 50,86 14,50" />
      </svg>
      <span className="wp-inline-loader__node wp-inline-loader__node--n1" />
      <span className="wp-inline-loader__node wp-inline-loader__node--n2" />
      <span className="wp-inline-loader__node wp-inline-loader__node--n3" />
      <span className="wp-inline-loader__node wp-inline-loader__node--n4" />
    </span>
  );
}

/* ============================================================================
   PageLoader — section-overlay loader (Orbital Pulse).

   Design: a small centred core dot, an animated orange ring sweeping around
   it, plus 3 concentric pulse rings expanding outward like a radar ping.
   Compact, distinct from the hexagon constellation, and meant to OVERLAY the
   section content (semi-transparent dark wash + backdrop blur) so the user
   sees a hint of the page layout behind it.

   Modes (all use the same visual):
     overlay (default)  — position:absolute over the parent container; the
                          parent stays interactive in layout terms but is
                          masked behind a subtle wash. This is what the
                          /app/* surfaces use while data loads.
     fullscreen         — fixed over the whole viewport; used for cold-start
                          splash before React paints the shell.
     inline             — no backdrop, transparent — for use inside cards.
============================================================================ */

export interface PageLoaderProps {
  label?: string;
  sub?: string;
  /** Render as a fixed full-viewport overlay (splash usage). */
  fullscreen?: boolean;
  /** Disable the absolute-position overlay treatment — flat inline render. */
  inline?: boolean;
  className?: string;
}

export function PageLoader({
  label = '',
  sub = '',
  fullscreen = false,
  inline = false,
  className = '',
}: PageLoaderProps) {
  const stage = (
    <div className={`wp-page-loader ${className}`} role="status" aria-live="polite">
      <div className="wp-page-loader__stage" aria-hidden>
        {/* outer radar pulses */}
        <span className="wp-page-loader__pulse wp-page-loader__pulse--p1" />
        <span className="wp-page-loader__pulse wp-page-loader__pulse--p2" />
        <span className="wp-page-loader__pulse wp-page-loader__pulse--p3" />
        {/* track ring (faint) */}
        <span className="wp-page-loader__track" />
        {/* spinning orange arc */}
        <span className="wp-page-loader__arc" />
        {/* orbital dot riding the arc */}
        <span className="wp-page-loader__orbit">
          <span className="wp-page-loader__orbit-dot" />
        </span>
        {/* core */}
        <span className="wp-page-loader__core" />
      </div>
      {(label || sub) && (
        <div className="wp-page-loader__caption">
          {label && <span className="wp-page-loader__label">{label}</span>}
          {sub && <span className="wp-page-loader__sub">{sub}</span>}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return <div className="wp-page-loader-fullscreen">{stage}</div>;
  }

  if (inline) {
    return stage;
  }

  // Default mode: render NOTHING. The user explicitly does not want any
  // loading visual between routes / during query resolution. Wrappers and
  // Suspense boundaries still call <PageLoader /> while data loads, but
  // they render null so the layout shell stays clean and the actual page
  // paints in-place the instant data lands. The `fullscreen` and `inline`
  // variants are still available for callers that explicitly want a
  // visual (cold-start splash, inside cards).
  return null;
}
