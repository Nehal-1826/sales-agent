import { useEffect, useState } from 'react';
import { HowItWorks } from '../components/HowItWorks';
import { DemoBooking } from '../components/DemoBooking';

/**
 * LANDING PAGE — public marketing site shown before entering the workspace.
 * Front-end only: no API calls, no backend changes.  The Dashboard button
 * hands control back to App.tsx, which runs the existing auth flow and the
 * already-designed dashboard exactly as before.
 *
 * Theme: orange & white (reuses the app's CSS variables).
 * Hero: animation on the LEFT (viewer's POV), copy on the right.
 */
export function LandingPage({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="lp">
      {/* ---------- NAVBAR ---------- */}
      <header className={`lp-nav ${scrolled ? 'lp-nav-scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <button className="lp-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src="/shailog-logo.png" alt="Shailog Technologies" />
          </button>
          <nav className="lp-links">
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Home</button>
            <button onClick={onEnterDashboard}>Dashboard</button>
            <button onClick={() => scrollTo('how-it-works')}>How it works</button>
            <button onClick={() => scrollTo('contact')}>Contact</button>
          </nav>
          <button className="lp-cta lp-cta-solid" onClick={onEnterDashboard}>
            Open Dashboard →
          </button>
        </div>
      </header>

      {/* ---------- HERO ---------- */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-hero-line">
            Find the <span className="lp-accent">Lead.</span>
            <br />
            Spot the <span className="lp-accent">Gap.</span>
            <br />
            Win the <span className="lp-accent">Deal.</span>
          </h1>
          <p className="lp-desc">
            Shailog AI hunts down real business leads, pinpoints exactly where
            their online presence falls short, and turns those gaps into
            signed deals — working for you around the clock.
          </p>
          <div className="lp-actions">
            <button className="lp-cta lp-cta-solid" onClick={() => scrollTo('contact')}>
              Book a Demo
            </button>
            <button className="lp-cta lp-cta-ghost" onClick={onEnterDashboard}>
              Sign in
            </button>
          </div>
          <p className="lp-trust">Built for founders, sales teams and growth marketers.</p>
        </div>

        {/* animation — RIGHT side from the viewer's point of view, blends
            straight into the white page (no card, no glow, no shadow) */}
        <div className="lp-hero-media">
          <video
            className="lp-hero-video"
            src="/hero-animation.mp4"
            autoPlay
            loop
            muted
            playsInline
          />
        </div>
      </section>

      {/* ---------- HOW IT WORKS (scroll-triggered carousel) ---------- */}
      <HowItWorks />

      {/* ---------- CONTACT / BOOK A DEMO ---------- */}
      <DemoBooking />

      {/* ---------- FOOTER ---------- */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src="/shailog-logo.png" alt="Shailog Technologies" />
            <strong>Shailog AI</strong>
            <p>
              Your AI sales and marketing team — finding leads, spotting gaps
              and winning deals around the clock.
            </p>
          </div>

          <div className="lp-footer-col">
            <h4>Contact</h4>
            <a href="mailto:shailog@gmail.com">✉ shailog@gmail.com</a>
            <a href="tel:+919876543210">☎ +91 98765 43210</a>
            <a href="https://shailog.com" target="_blank" rel="noreferrer">🌐 shailog.com</a>
          </div>

          <div className="lp-footer-col">
            <h4>Explore</h4>
            <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Home</button>
            <button onClick={onEnterDashboard}>Dashboard</button>
            <button onClick={() => scrollTo('how-it-works')}>How it works</button>
            <button onClick={() => scrollTo('contact')}>Contact</button>
          </div>
        </div>

        <div className="lp-footer-bar">
          <span>© {new Date().getFullYear()} Shailog Technologies · Marketing &amp; Sales AI. All rights reserved.</span>
          <button onClick={onEnterDashboard}>Open Dashboard →</button>
        </div>
      </footer>
    </div>
  );
}
