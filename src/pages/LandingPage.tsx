import { HowItWorks } from '../components/HowItWorks';
import { DemoBooking } from '../components/DemoBooking';
import { MarketingLayout } from '../marketing/MarketingLayout';
import { BuiltBy, Proof, SafetyPromises, SampleAudit } from '../marketing/TrustSections';
import { useDocumentMeta } from '../marketing/seo';

/**
 * LANDING PAGE — public marketing site shown before entering the workspace.
 * Front-end only: no API calls, no backend changes. "Sign in" hands control
 * back to App.tsx (onEnterDashboard), which runs the existing auth flow.
 * Prerendered to dist/index.html at build time (scripts/prerender.mjs), so
 * everything here must render without `window` during the first render.
 *
 * Theme: orange & white (reuses the app's CSS variables).
 */
export function LandingPage({ onEnterDashboard }: { onEnterDashboard?: () => void }) {
  useDocumentMeta('/');

  return (
    <MarketingLayout onEnterDashboard={onEnterDashboard}>
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
            Shailog AI finds real businesses in the cities and industries you pick, reads each website, and writes a
            short audit of what it is missing. Then it drafts a cold email that points to those exact gaps — and waits
            for you to approve it.
          </p>
          <div className="lp-actions">
            <a className="lp-cta lp-cta-solid" href="#contact">
              Book a Demo
            </a>
            <a className="lp-cta lp-cta-ghost" href="/pricing">
              See pricing
            </a>
          </div>
          <p className="lp-trust">
            For agencies, freelancers and sales teams · India metros first, any city worldwide.
          </p>
        </div>

        <div className="lp-hero-media">
          <video
            className="lp-hero-video"
            src="/hero-animation.mp4"
            poster="/shailog-logo.png"
            preload="metadata"
            autoPlay
            loop
            muted
            playsInline
            aria-label="Animation of Shailog AI finding leads and drafting emails"
          />
        </div>
      </section>

      {/* ---------- HOW IT WORKS (scroll-triggered carousel) ---------- */}
      <HowItWorks />

      <SampleAudit />
      <SafetyPromises />
      <Proof />
      <BuiltBy />

      {/* ---------- CONTACT / BOOK A DEMO ---------- */}
      <DemoBooking />
    </MarketingLayout>
  );
}
