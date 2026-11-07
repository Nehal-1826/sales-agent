import { LandingPage } from '../pages/LandingPage';
import { PricingPage } from '../pages/PricingPage';
import { HowItWorksPage } from '../pages/HowItWorksPage';
import { ComparePage } from '../pages/ComparePage';
import { PrivacyPage, TermsPage } from '../pages/LegalPages';
import { routeMeta, type MarketingPath } from './site';

/** Public path routes other than "/" ("/" stays under App's auth gate). */
export function isMarketingSubpage(pathname: string): boolean {
  const meta = routeMeta(pathname);
  return !!meta && meta.path !== '/';
}

/** Render one public page by path. Used by the client (App) and the prerender. */
export function MarketingPage({ path, onEnterDashboard }: { path: MarketingPath; onEnterDashboard?: () => void }) {
  switch (path) {
    case '/pricing':
      return <PricingPage />;
    case '/how-it-works':
      return <HowItWorksPage />;
    case '/compare/apollo-alternative':
      return <ComparePage which="apollo" />;
    case '/compare/leadsgorilla-alternative':
      return <ComparePage which="leadsgorilla" />;
    case '/privacy':
      return <PrivacyPage />;
    case '/terms':
      return <TermsPage />;
    default:
      return <LandingPage onEnterDashboard={onEnterDashboard} />;
  }
}
