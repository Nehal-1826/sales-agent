import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 4-second branded splash. Five-phase sequence:
 *   0.0–0.6s  ambient glow rings expand from centre
 *   0.6–1.6s  envelope strokes draw on, breathing dot fades in
 *   1.6–2.4s  pulse line sweeps left→right
 *   2.4–3.2s  title "WarmPulse" reveals letter-by-letter; tagline fades in
 *   3.2–3.6s  hold
 *   3.6–4.0s  whole splash fades + scales out
 *
 * After 4 s the component unmounts itself. Honors prefers-reduced-motion:
 * a single static frame for ~600 ms instead of the full sequence.
 */
const TOTAL_MS = 4000;
const TITLE = 'WarmPulse';

export function SplashScreen() {
  const [show, setShow] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    const t = setTimeout(() => setShow(false), reduced ? 600 : TOTAL_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          {/* Ambient glow rings — expand outward in two layers */}
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                background:
                  i === 0
                    ? 'radial-gradient(circle at center, rgb(242 101 34 / 0.15) 0%, transparent 72%)'
                    : 'radial-gradient(circle at center, rgb(255 138 75 / 0.12) 0%, transparent 72%)',
              }}
              initial={{ width: 0, height: 0, opacity: 0 }}
              animate={{ width: i === 0 ? 520 : 380, height: i === 0 ? 520 : 380, opacity: 1 }}
              transition={{ duration: 0.9, delay: i * 0.18, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}

          <div className="relative flex flex-col items-center gap-6">
            {/* Glass plate holding the mark */}
            <motion.div
              className="rounded-2xl border border-white/10 bg-surface/40 p-6 backdrop-blur-xl shadow-glass"
              initial={{ scale: 0.6, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <SplashMark />
            </motion.div>

            {/* Title — stagger letters */}
            <div className="flex flex-col items-center gap-1">
              <h1 className="flex text-2xl font-semibold tracking-tight text-text">
                {TITLE.split('').map((ch, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{
                      duration: 0.45,
                      delay: 2.4 + i * 0.06,
                      ease: 'easeOut',
                    }}
                  >
                    {ch}
                  </motion.span>
                ))}
              </h1>
              <motion.span
                className="text-xs text-text-dim"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 2.9, ease: 'easeOut' }}
              >
                Every send, inboxed.
              </motion.span>
            </div>

            {/* Loading dots — present from frame 1 so the splash doesn't feel
                static during the long letter-stagger phase */}
            <motion.div
              className="flex items-center gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-accent/70"
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.1, 0.85] }}
                  transition={{
                    duration: 1.0,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Animated mark inside the splash glass plate. Strokes draw in via
 * pathLength tweens; the breathing dot fades after the wave completes.
 */
function SplashMark() {
  return (
    <svg
      role="img"
      aria-label="WarmPulse"
      viewBox="0 0 64 64"
      width={88}
      height={88}
      className="block"
    >
      <defs>
        <linearGradient id="splash-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F26522" />
          <stop offset="100%" stopColor="#FF9670" />
        </linearGradient>
      </defs>

      {/* Envelope rectangle — draws on first */}
      <motion.rect
        x="14"
        y="20"
        width="36"
        height="24"
        rx="3"
        fill="none"
        stroke="url(#splash-g)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.6, ease: 'easeInOut' }}
      />
      {/* Envelope flap (V) */}
      <motion.path
        d="M14 22 L32 34 L50 22"
        fill="none"
        stroke="url(#splash-g)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2, ease: 'easeInOut' }}
      />
      {/* Pulse wave underneath */}
      <motion.path
        d="M8 50 L20 50 L24 44 L30 56 L36 42 L42 52 L46 50 L56 50"
        fill="none"
        stroke="url(#splash-g)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Breathing dot — fades in after wave, then breathes */}
      <motion.circle
        cx="32"
        cy="49"
        r="2.6"
        fill="#F26522"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 0.6, 1], scale: [0, 1.2, 0.95, 1.1] }}
        transition={{
          delay: 2.2,
          duration: 1.4,
          ease: 'easeInOut',
          times: [0, 0.3, 0.65, 1],
        }}
      />
    </svg>
  );
}
