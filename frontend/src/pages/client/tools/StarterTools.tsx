import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { TierShell, ToolLauncher, TIER_CONFIG } from '@/features/tools/tier';

/**
 * /app/tools — Starter tier. Clean, calm flat list of the four tools plus a
 * single upgrade hint. The tools themselves self-gate (Inbox Test / Spam
 * Scanner show a functional upgrade CTA for Starter).
 */
export function StarterTools() {
  return (
    <TierShell config={TIER_CONFIG.starter}>
      <ToolLauncher config={TIER_CONFIG.starter} />
      <Link
        to="/app/billing"
        className="flex items-center justify-between rounded-2xl border border-border-muted bg-surface-2/40 px-5 py-4 text-sm transition-colors hover:bg-surface-2"
      >
        <span className="text-text-dim">
          Want live inbox placement and the full template library?{' '}
          <span className="font-semibold text-text">Upgrade your plan</span>
        </span>
        <ArrowRight className="h-4 w-4 text-accent" />
      </Link>
    </TierShell>
  );
}

export default StarterTools;
