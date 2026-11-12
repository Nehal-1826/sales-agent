import { useEffect, useRef, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLenis } from '@/providers/LenisProvider';
import { useGsapScrollTrigger } from '@/hooks/useGsapScrollTrigger';
import { AnimatedGradient } from './AnimatedGradient';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

// Greyscale placeholders for "trusted by" — swap once real logos land.
const TRUSTED_BY = ['Acme Labs', 'Northwind', 'Halcyon', 'Stratus', 'Vexel', 'Quanta'];

export function Hero() {
  const { lenis } = useLenis();
  const { gsap, ready } = useGsapScrollTrigger();
  const gradientRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // GSAP ScrollTrigger: slow vertical parallax on the gradient blob while the hero scrolls past.
  useEffect(() => {
    if (!ready || !gradientRef.current || !sectionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.to(gradientRef.current, {
        yPercent: 25,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.6,
        },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, [ready, gsap]);

  const handleSeePricing = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.getElementById('pricing');
    if (lenis && target) {
      lenis.scrollTo(target, { offset: -80, duration: 1.2 });
    } else if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      id="hero"
      ref={sectionRef}
      className="relative flex h-screen min-h-[640px] w-full items-center justify-center overflow-hidden"
    >
      <div ref={gradientRef} className="absolute inset-0">
        <AnimatedGradient />
      </div>

      <motion.div
        className="relative z-10 mx-auto max-w-5xl px-6 text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeUp}>
          <span
            className="inline-block rounded-full border border-accent/30 bg-accent/[0.08] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-accent"
          >
            Email Warmup · Reimagined
          </span>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl"
        >
          <span className="bg-gradient-to-br from-accent to-accent2 bg-clip-text text-transparent">
            Warm inboxes. Land deals.
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mx-auto mt-6 max-w-[560px] text-base text-text-dim md:text-lg"
        >
          WarmPulse runs a test account network that teaches email providers your domain is
          trustworthy — so your real outreach lands in the inbox, not
          Promotions or Spam.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link to="/signup">Start warming now — 7-day dummy trial</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#pricing" onClick={handleSeePricing}>
              See pricing
            </a>
          </Button>
        </motion.div>

        {/* trusted-by row — placeholders; swap when real logos land */}
        <motion.div
          variants={fadeUp}
          className="mt-16 flex flex-col items-center gap-4"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-dim/70">
            Trusted by outbound teams at
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 opacity-40">
            {TRUSTED_BY.map((name) => (
              <span
                key={name}
                className="font-mono text-sm font-semibold tracking-wide text-text-dim grayscale"
                /* placeholder — swap when real logos land */
              >
                {name}
              </span>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* faint scroll hint */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-text-dim/60"
      >
        scroll
      </div>
    </section>
  );
}
