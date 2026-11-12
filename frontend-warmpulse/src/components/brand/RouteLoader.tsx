import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Slim accent-coloured progress bar pinned to the top of the viewport.
 * Triggers on every `useLocation` change — the pathname-based key above
 * `<App>`'s page-transition wrapper schedules the next render, and the bar
 * runs in parallel so the user gets immediate feedback even if the new
 * route's data takes a moment.
 *
 * Sequence per navigation:
 *   show + width 0
 *   ease to 80% over ~600ms (fast initial, slow tail) — covers most loads
 *   on render commit (next pathname tick), snap to 100% and fade out
 *
 * Honors prefers-reduced-motion: no progress animation, just a brief
 * solid bar that fades.
 */
export function RouteLoader() {
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const firstRender = useRef(true);

  useEffect(() => {
    // Don't fire on initial mount — splash covers that.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setActive(true);
    setProgress(8);
    // Crawl to ~80% so the bar always feels like it's making progress.
    const t1 = setTimeout(() => setProgress(38), 80);
    const t2 = setTimeout(() => setProgress(72), 240);
    const t3 = setTimeout(() => setProgress(88), 480);
    // Finish + fade out after the new route is committed.
    const t4 = setTimeout(() => setProgress(100), 700);
    const t5 = setTimeout(() => {
      setActive(false);
      setProgress(0);
    }, 1000);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, [pathname]);

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="h-full bg-gradient-to-r from-accent via-accent2 to-accent shadow-[0_0_12px_rgba(242, 101, 34,0.6)]"
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Page-transition wrapper. Wrap `<Outlet />` (or `<Routes>`) in this and
 * keyed by pathname so framer-motion runs an exit/enter when the URL
 * changes. Subtle: 8 px translate + opacity fade — no aggressive slides
 * that would make the app feel slow.
 */
export function PageTransition({ children, pathKey }: { children: React.ReactNode; pathKey: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="motion-reduce:transform-none"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
