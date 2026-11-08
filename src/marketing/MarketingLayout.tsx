import { useEffect, useState, type ReactNode } from 'react';
import { COMPANY } from './site';
import '../marketing.css';

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
    <a className="lp-cta lp-cta-ghost" href="/?signup=1">
      Start now
    </a>
  );

  return (
    <div className="lp">
      <header className={`lp-nav ${scrolled ? 'lp-nav-scrolled' : ''}`}>
        <div className="lp-nav-inner">
          <a className="lp-brand" href="/">
            <img src="/shailog-logo.png" alt="Shailog Technologies — Shailog AI home" />
          </a>
          <nav className="lp-links" aria-label="Main">
            <a href="/">Home</a>
            <a href="/how-it-works">How it works</a>
            <a href="/pricing">Pricing</a>
            <a href="/#contact">Contact</a>
          </nav>
          <>{startNow}{signIn}</>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="lp-footer">
        <div className="lp-footer-inner mk-footer-inner">
          <div className="lp-footer-brand">
            <img src="/shailog-logo.png" alt="Shailog Technologies logo" />
            <strong>{COMPANY.product}</strong>
            <p>
              Built in {COMPANY.city}, {COMPANY.region} by {COMPANY.name}. Finds leads, audits their
              website and drafts the email. You approve every send.
            </p>
          </div>

          <div className="lp-footer-col">
            <h4>Contact</h4>
            <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            <a href={COMPANY.phoneHref}>{COMPANY.phone}</a>
            <a href={COMPANY.website} target="_blank" rel="noreferrer">
              shailog.com
            </a>
          </div>

          <div className="lp-footer-col">
            <h4>Product</h4>
            <a href="/how-it-works">How it works</a>
            <a href="/pricing">Pricing</a>
            <a href="/#contact">Book a demo</a>
            <a href="/?signup=1">Start now</a>
            <a href="/?signin=1">Sign in</a>
          </div>

          <div className="lp-footer-col">
            <h4>Compare &amp; legal</h4>
            <a href="/compare/apollo-alternative">vs Apollo</a>
            <a href="/compare/leadsgorilla-alternative">vs LeadsGorilla</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>

        <div className="lp-footer-bar">
          <span>© {new Date().getFullYear()} {COMPANY.name} · Marketing &amp; Sales AI. All rights reserved.</span>
          <a className="mk-footer-pill" href="/#contact">
            Book a demo →
          </a>
        </div>
      </footer>
    </div>
  );
}
