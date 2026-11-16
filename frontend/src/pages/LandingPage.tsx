import { HowItWorks } from '../components/HowItWorks';
import { DemoBooking } from '../components/DemoBooking';
import { Lightfall } from '../components/Lightfall';
import { SpecularButton } from '../components/SpecularButton';
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
 * Theme: violet & white (reuses the app's CSS variables).
 */
export function LandingPage({ onEnterDashboard }: { onEnterDashboard?: () => void }) {
  useDocumentMeta('/');

  return (
    <MarketingLayout onEnterDashboard={onEnterDashboard}>
      {/* ---------- HERO ---------- */}
      <section className="lp-hero">
        <Lightfall
          lightMode
          colors={['#f97316', '#fb923c', '#ea580c']}
          backgroundColor="#fff7ed"
          backgroundGlow={0}
          speed={0.3}
          streakCount={4}
          streakWidth={1.05}
          twinkle={0.35}
          headGlow={0.65}
          bloom={0.42}
          opacity={0.7}
          mouseInteraction
          holdToWarp
          intro
          className="lp-lightfall"
        />
        <div className="lp-hero-copy">
          <h1 className="lp-hero-line">
            Find the <span className="lp-accent">Lead.</span>
            <br />
            Spot the <span className="lp-accent">Gap.</span>
            <br />
            Win the <span className="lp-accent">Deal.</span>
          </h1>
          <p className="lp-hero-tagline">
            Keep every sender <span className="lp-accent">warm.</span> Land every <span className="lp-accent">send.</span>
          </p>
          <p className="lp-desc">
            WarmPulse warms every sender mailbox so your sends land in the inbox. Then it finds real businesses in the
            cities and industries you pick, reads each website, and writes a short audit of what it is missing. Then it
            drafts a cold email that points to those exact gaps — and waits for you to approve it.
          </p>
          <div className="lp-actions">
            <SpecularButton
              href="/?signup=1"
              size="lg"
              radius={999}
              tint="#f97316"
              tintOpacity={0.9}
              blur={16}
              textColor="#ffffff"
              lineColor="#ffffff"
              baseColor="#fb923c"
              intensity={1.15}
              idleIntensity={0.45}
              autoAnimate
            >
              Get Started
            </SpecularButton>
            <a className="lp-cta lp-cta-ghost" href="#contact">
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
            poster="/warmpulse-logo.svg"
            preload="metadata"
            autoPlay
            loop
            muted
            playsInline
            aria-label="Animation of WarmPulse warming mailboxes, finding leads and drafting emails"
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
