import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';

/**
 * Smooth scroll is enabled ONLY on the marketing pages, where the hero's
 * scroll-driven effects live. The data-dense /app and /admin panels (and
 * onboarding, auth, legal) use native scroll: Lenis's smooth-wheel hijack
 * adds perceptible latency on those screens and runs a constant rAF loop,
 * which was a major source of the "everything feels laggy" complaint.
 */
// The main landing ('/') was intentionally dropped: its hero already runs many
// scroll-linked effects, and stacking Lenis's smooth-wheel rAF on top made
// scrolling feel janky and the animations "scatter". Native scroll there is
// composited by the browser and far smoother; the scroll-driven effects read
// window.scrollY and behave the same with or without Lenis.
const SMOOTH_SCROLL_ROUTES = new Set(['/old', '/how-it-works']);

interface LenisContextValue {
  lenis: Lenis | null;
  refresh: () => void;
}

const LenisContext = createContext<LenisContextValue>({ lenis: null, refresh: () => {} });

/**
 * Wraps the app with a Lenis-driven smooth-scroll loop.
 * Matches the global "hidden native scrollbar" rule — a custom
 * gradient progress bar (see ScrollProgress) provides the visual cue.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  const lenisRef = useRef<Lenis | null>(null);
  const { pathname } = useLocation();
  const smoothEnabled = SMOOTH_SCROLL_ROUTES.has(pathname);

  useEffect(() => {
    if (!smoothEnabled) {
      lenisRef.current = null;
      return;
    }
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });
    lenisRef.current = lenis;

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [smoothEnabled]);

  const value = useMemo<LenisContextValue>(
    () => ({
      lenis: lenisRef.current,
      refresh: () => lenisRef.current?.resize(),
    }),
    [smoothEnabled],
  );

  return <LenisContext.Provider value={value}>{children}</LenisContext.Provider>;
}

export function useLenis(): LenisContextValue {
  return useContext(LenisContext);
}
