import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { usePlan } from '@/lib/usePlan';
import { AgencyTools } from './tools/AgencyTools';
import { ProPlusTools } from './tools/ProPlusTools';
import { ProTools } from './tools/ProTools';
import { ToolsNav } from './tools/ToolsNav';

/**
 * /app/tools — thin plan router.
 *
 *   Starter → no sub-tab strip (the comparison table IS the navigation).
 *             Renders <Outlet /> only; the index route element is
 *             <ToolsIndex /> which shows the table for Starter.
 *             When Starter is on a sub-route (e.g. /app/tools/preview),
 *             we render a contextual "Back to tools" chip so users can
 *             return to the table without using the browser back button.
 *
 *   Pro / Agency → legacy 4-tab pill nav + <Outlet /> for the active tool.
 *
 * Both tiers share the same /app/tools/<tool> child routes, so deep-links
 * keep working everywhere.
 *
 * Per-tool gating (Pro Plus, etc.) is handled INSIDE the tool component —
 * e.g. <PlacementTester /> renders an "Upgrade to Pro Plus" CTA for
 * Free/Starter/Pro users via `usePlan().isProPlus`, then renders the full
 * Pro Plus experience (mailbox picker → live progress → results → history)
 * for Pro Plus and above. This keeps the router thin and lets each tool
 * own its own gating story.
 */
export function ToolsPage() {
  const { isStarter, isPro, isProPlus, isAgency, isLoading } = usePlan();
  const { pathname } = useLocation();

  // /app/tools         → index (no back link)
  // /app/tools/        → index (no back link)
  // /app/tools/preview → sub-route (Starter gets a back link)
  const normalizedPath = pathname.replace(/\/+$/, '');
  const isOnSubRoute = normalizedPath !== '/app/tools';
  const showStarterBack = !isLoading && isStarter && isOnSubRoute;

  // Agency users land at /app/tools → render AgencyTools (wraps the T6
  // Workbench with the Agency-only unlocks banner). Sub-routes fall through
  // to the legacy layout so the working tools still resolve. Must come
  // BEFORE the isPro branch because Agency satisfies isPro too.
  if (!isLoading && isAgency && !isOnSubRoute) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <AgencyTools />
      </motion.div>
    );
  }

  // Pro Plus users land at /app/tools → render the Experiment Lab design
  // wired to live workspace data. Sub-routes fall through to the legacy
  // layout so the working tools still resolve (exactly like Pro). Must come
  // BEFORE the isPro branch because Pro Plus satisfies isPro too.
  if (!isLoading && isProPlus && !isOnSubRoute) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <ProPlusTools />
      </motion.div>
    );
  }

  // Pro users land at /app/tools → render the T6 Workbench preview design.
  // Sub-routes (/app/tools/preview etc.) keep working via the legacy layout
  // below since the working tools still live at those URLs.
  if (!isLoading && isPro && !isOnSubRoute) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <ProTools />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tools</h1>
        <p className="text-sm text-text-dim">
          Inbox test, spam scanner, template designer, and warmup preview.
        </p>
      </div>

      {/* Starter: contextual back-to-tools chip whenever we're on a sub-route. */}
      {showStarterBack && (
        <div>
          <Link
            to="/app/tools"
            className="inline-flex items-center gap-2 rounded-full border border-border-muted bg-surface px-3 py-1.5 text-xs font-semibold text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to tools
          </Link>
        </div>
      )}

      {/* Pro/Agency keep the tab strip. Starter omits it — the comparison
          table on the index route exposes every tool with its own action,
          and individual tool sub-routes still work for deep links. */}
      {!isLoading && !isStarter && <ToolsNav />}

      <div>
        <Outlet />
      </div>
    </motion.div>
  );
}

export default ToolsPage;
