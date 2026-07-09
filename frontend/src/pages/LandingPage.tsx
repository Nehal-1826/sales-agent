import {
  Hero,
  HowItWorks,
  FeatureBlocks,
  Pricing,
  FAQ,
  CTABand,
  Footer,
  NoiseOverlay,
} from './landing';

/**
 * WarmPulse public landing page.
 *
 * Composition order (spec §10.2):
 *   Hero → HowItWorks → FeatureBlocks → Pricing → FAQ → CTABand → Footer
 *
 * NoiseOverlay is fixed + z-0 + pointer-events-none so it sits behind all
 * interactive layers without affecting scroll or hit-testing.
 *
 * NOTE: PublicLayout ships its own minimal footer. The richer landing
 * Footer renders inside the outlet (above the layout footer) per the
 * "do not touch layout" constraint. The page-local Footer is the
 * authoritative marketing footer; the layout footer becomes a residual
 * legal strip that can be trimmed in a follow-up layout pass if desired.
 */
export function LandingPage() {
  return (
    <div className="relative w-full">
      <NoiseOverlay />

      <div className="relative z-10">
        <Hero />
        <HowItWorks />
        <FeatureBlocks />
        <Pricing />
        <FAQ />
        <CTABand />
        <Footer />
      </div>
    </div>
  );
}
