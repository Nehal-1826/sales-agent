import { motion, useTransform, useScroll } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/**
 * HOW IT WORKS — scroll-triggered horizontal card carousel.
 * As the visitor scrolls through the tall section, the card track slides
 * horizontally (sticky viewport + scroll-linked transform), walking them
 * through the agent workflow: Discover → Vet → Enrich → Reach out → Close.
 * Orange & white theme, front-end only.
 */

/* modest line icons (stroke follows the theme colour) */
const icon = (path: JSX.Element) => (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

const IconSearch = icon(<>
  <circle cx="11" cy="11" r="7" />
  <path d="m20 20-3.5-3.5" />
</>);

const IconScan = icon(<>
  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
  <circle cx="12" cy="12" r="3" />
</>);

const IconPhone = icon(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9z" />);

const IconPen = icon(<>
  <path d="M12 20h9" />
  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
</>);

const IconTrophy = icon(<>
  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
  <path d="M4 22h16" />
  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
</>);

const IconRocket = icon(<>
  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
</>);

const STEPS = [
  {
    Icon: IconSearch,
    title: 'Find the Lead',
    text: 'The Search agent sweeps the web around the clock and surfaces real companies that match your ideal customer profile — worldwide, with a focus on India.',
  },
  {
    Icon: IconScan,
    title: 'Spot the Gap',
    text: 'The Profile agent reads each prospect’s own website with AI — auditing speed, SEO, mobile and content — and keeps only genuine, relevant businesses.',
  },
  {
    Icon: IconPhone,
    title: 'Arm the Contact',
    text: 'Emails and phone numbers are pulled from the site, then verified across Scalelist, Apollo and Google Maps, so every lead is actually reachable.',
  },
  {
    Icon: IconPen,
    title: 'Write the Outreach',
    text: 'The Copywright agent turns real audit findings into a short, personal cold email — no fluff, no templates that read like templates.',
  },
  {
    Icon: IconTrophy,
    title: 'Win the Deal',
    text: 'You approve and send in one click; the Responder tracks replies and follows up on its own — so no conversation ever goes cold.',
  },
];

export function HowItWorks() {
  const targetRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: targetRef });

  // measure the real overflow so the slide ALWAYS ends with the last card
  // fully visible — on every screen size (no fixed percentage guessing)
  const [range, setRange] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const overflow = trackRef.current.scrollWidth - window.innerWidth;
      setRange(Math.max(0, overflow + 48)); // +48: last card clears the edge comfortably
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const x = useTransform(scrollYProgress, [0, 1], [0, -range]);

  return (
    <section className="lp-hiw" id="how-it-works">
      <div ref={targetRef} className="lp-hiw-tall">
        {/* the whole composition — title, tagline and cards — freezes in view;
            continued scrolling only drives the horizontal card slide */}
        <div className="lp-hiw-sticky">
          <div className="lp-hiw-pin">
            <h2>How it works</h2>
            <p>Keep scrolling — one autonomous loop, five moves, while your team just sells.</p>
          </div>
          <motion.div ref={trackRef} style={{ x }} className="lp-hiw-track">
            {STEPS.map(({ Icon, title, text }) => (
              <article className="lp-card" key={title}>
                <span className="lp-card-icon"><Icon /></span>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="lp-card-arrow" aria-hidden>→</span>
              </article>
            ))}
            {/* end card — CTA */}
            <article className="lp-card lp-card-cta">
              <span className="lp-card-icon"><IconRocket /></span>
              <h3>See it live</h3>
              <p>The dashboard is one click away — real leads, real drafts, real pipeline.</p>
              <span className="lp-card-arrow" aria-hidden>→</span>
            </article>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
