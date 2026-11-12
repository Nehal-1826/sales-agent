import { Navigate } from 'react-router-dom';
import { usePlan } from '@/lib/usePlan';
import { StarterTools } from './StarterTools';

/**
 * Index route element for /app/tools.
 *
 *   Starter → comparison table (T7)
 *   Pro     → redirect to first tool tab (legacy)
 *   Agency  → redirect to first tool tab (legacy)
 *
 * Sits in the App route table as `<Route index element={<ToolsIndex />} />`
 * so the redirect only fires for non-Starter tiers — Starter never enters
 * the redirect path.
 */
export function ToolsIndex() {
  const { isStarter, isLoading } = usePlan();
  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-surface-2/60" />;
  }
  if (isStarter) return <StarterTools />;
  return <Navigate to="placement" replace />;
}

export default ToolsIndex;
