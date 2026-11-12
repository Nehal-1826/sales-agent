import { useEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

/**
 * Registers GSAP's ScrollTrigger plugin on mount (guarded against
 * React strict-mode double-invocation + duplicate registration) and
 * returns a gsap instance once ready.
 *
 * Use for scroll-linked effects that Framer Motion can't do well
 * (e.g. long parallax tied to raw scroll position). For one-shot
 * reveals, prefer Framer Motion's whileInView.
 */
export function useGsapScrollTrigger() {
  const [ready, setReady] = useState(registered);

  useEffect(() => {
    if (!registered) {
      gsap.registerPlugin(ScrollTrigger);
      registered = true;
    }
    setReady(true);

    return () => {
      // Kill only the triggers owned by the scope that rendered this hook.
      // Component-level cleanup happens via the gsap.context each consumer uses.
    };
  }, []);

  return { gsap, ScrollTrigger, ready };
}
