import { useEffect, useState, type ReactNode } from 'react';
import { SpecularButton } from '../components/SpecularButton';
import { COMPANY, ROUTES } from './site';
import '../marketing.css';

/** Prerendered /compare/* pages — surfaced as footer-adjacent links for SEO. */
const COMPARE_ROUTES = ROUTES.filter((r) => r.path.startsWith('/compare/'));

/** '/compare/apollo-alternative' → 'Apollo' for a compact link label. */
function compareLabel(path: string): string {
  const slug = path.replace('/compare/', '').replace(/-alternative$/, '');
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Shared chrome for every public page: navbar + footer with REAL <a href>
 * links (crawlable, work without JS). "Sign in" either hands control back to
 * App.tsx (on /, via onEnterDashboard) or links to /?signin=1, which App
 * reads to open the sign-in screen directly.
 */
export function MarketingLayout({
  children,
  onEnterDashboard,
}: {
  children: ReactNode;
  onEnterDashboard?: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const signIn = onEnterDashboard ? (
    <button type="button" className="lp-cta lp-cta-solid" onClick={onEnterDashboard}>
      Sign in →
    </button>
  ) : (
    <a className="lp-cta lp-cta-solid" href="/?signin=1">
      Sign in →
    </a>
  );

  const startNow = (
    <SpecularButton
      href="/?signup=1"
      size="sm"
      radius={999}
      tint="#181512"
      tintOpacity={0.82}
      blur={14}
      textColor="#fff7ed"
      lineColor="#fb923c"
      baseColor="#7c2d12"
      idleIntensity={0.45}
      style={{ padding: '12px 22px', fontSize: 15 }}
    >
      Get Started
    </SpecularButton>
  );

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'lp-nav-scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <a className="lp-brand" href="/">
            <img src="/warmpulse-logo.svg" alt="WarmPulse home" />
          </a>
          <nav className="lp-links" aria-label="Main">
            <a href="/">Home</a>
            <a href="/how-it-works">How it works</a>
            <a href="/pricing">Pricing</a>
            <a href="/#contact">Contact</a>
          </nav>
          <div className="lp-nav-ctas">
            {startNow}
            {signIn}
          </div>
        </div>
      </header>

      <main id="main">{children}</main>

      {/* Compare links sit ABOVE the footer element, not inside it: the e2e
          suite asserts footer.lp-footer stays slim (≤6 links), so this is a
          separate nav with its own link budget. */}
      {COMPARE_ROUTES.length > 0 && (
        <nav className="lp-compare-row" aria-label="Compare WarmPulse">
          <span>Compare</span>
          {COMPARE_ROUTES.map((r) => (
            <a key={r.path} href={r.path}>
              WarmPulse vs {compareLabel(r.path)}
            </a>
          ))}
        </nav>
      )}

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <img src="/warmpulse-logo.svg" alt="WarmPulse logo" />
            <strong>{COMPANY.product}</strong>
            <p>{COMPANY.tagline}</p>
          </div>

          <div className="lp-footer-contact">
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
            <a href={COMPANY.website} target="_blank" rel="noreferrer">
              shailog.com
            </a>
          </div>
        </div>

        <div className="lp-footer-bar">
          <span>© {new Date().getFullYear()} {COMPANY.name}</span>
          <nav className="lp-footer-legal" aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
