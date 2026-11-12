import { cn } from '@/lib/cn';

/**
 * Animated WarmPulse mark.
 *
 * Visual: an envelope outline with a sine-pulse crossing it. The pulse path
 * is a dashed line whose `stroke-dashoffset` animates left so the wave
 * appears to flow through the envelope. A small dot at the wave crest
 * breathes in/out — the "warmth" signal.
 *
 * Honors `prefers-reduced-motion` (animation defined in tailwind.config; the
 * `motion-reduce:animate-none` utility on each animated element silences it).
 */
interface LogoProps {
  /** Pixel size of the rendered square. Defaults to 28. */
  size?: number;
  /** Disable wave animation (e.g. for the favicon-style static usage). */
  static?: boolean;
  className?: string;
  /** When true, the mark renders in mono (currentColor) — for tight UI like sidebars. */
  mono?: boolean;
  ariaLabel?: string;
}

export function Logo({
  size = 28,
  static: isStatic = false,
  className,
  mono = false,
  ariaLabel = 'WarmPulse',
}: LogoProps) {
  const stroke = mono ? 'currentColor' : 'url(#wp-grad)';
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="wp-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F26522" />
          <stop offset="100%" stopColor="#FF9670" />
        </linearGradient>
        <radialGradient id="wp-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F26522" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F26522" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft glow under the mark — masked to the rounded square so it doesn't
          bleed onto the surrounding layout. */}
      {!mono ? <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#wp-glow)" opacity="0.6" /> : null}

      {/* Envelope */}
      <g stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x="14" y="20" width="36" height="24" rx="3" />
        <path d="M14 22 L32 34 L50 22" />
      </g>

      {/* Pulse — dashed so the offset animation appears to flow through */}
      <path
        d="M8 50 L20 50 L24 44 L30 56 L36 42 L42 52 L46 50 L56 50"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="6 4"
        className={isStatic ? '' : 'motion-reduce:animate-none animate-logoWave'}
      />

      {/* Breathing dot at the wave centre */}
      <circle
        cx="32"
        cy="49"
        r="2.4"
        fill={mono ? 'currentColor' : '#F26522'}
        className={isStatic ? '' : 'motion-reduce:animate-none animate-logoBreathe origin-center'}
        style={{ transformOrigin: '32px 49px' }}
      />
    </svg>
  );
}
