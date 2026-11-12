import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './splash-screen.css';

const PARTICLE_COUNT = 22;

type Particle = {
  start: number;
  r: number;
  delay: number;
};

const PARTICLES: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  start: (i / PARTICLE_COUNT) * 360 + (i % 3) * 8,
  r: 100 + (i % 5) * 24,
  delay: (i % 4) * 0.05,
}));

export function SplashScreen({ onDone }: { onDone?: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hideAt = reduce ? 600 : 2600;
    const doneAt = hideAt + 500;
    const t1 = setTimeout(() => setVisible(false), hideAt);
    const t2 = setTimeout(() => onDone?.(), doneAt);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="wp-splash"
          aria-hidden
        >
          <div className="wp-splash__bg" />
          <div className="wp-splash__stage">
            {PARTICLES.map((p, i) => (
              <span
                key={i}
                className="wp-splash__particle"
                style={
                  {
                    '--start': `${p.start}deg`,
                    '--r': `${p.r}px`,
                    animationDelay: `${p.delay}s`,
                  } as React.CSSProperties
                }
              />
            ))}
            <div className="wp-splash__lockup">
              <svg
                className="wp-splash__logo"
                viewBox="0 0 80 80"
                fill="none"
                role="img"
                aria-label="WarmPulse"
              >
                <rect x="2" y="2" width="76" height="76" rx="20" fill="url(#wp-splash-grad)" />
                <path
                  d="M16 30 L40 48 L64 30"
                  stroke="white"
                  strokeWidth="3.5"
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d="M16 30 L16 56 Q16 58 18 58 L62 58 Q64 58 64 56 L64 30"
                  stroke="white"
                  strokeWidth="3.5"
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <g transform="translate(54 22)">
                  <path
                    d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z"
                    fill="white"
                  />
                </g>
                <defs>
                  <linearGradient id="wp-splash-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#F26522" />
                    <stop offset="1" stopColor="#FF8A4B" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="wp-splash__wordmark">WarmPulse</span>
              <span className="wp-splash__tagline">Land in inbox</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
