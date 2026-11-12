import { motion } from 'framer-motion';
import { usePlan } from '@/lib/usePlan';
import {
  DnsHealthPanel,
  PostmasterWidget,
  SndsWidget,
  BlacklistCard,
  HealthRadarCard,
  WarmthGaugeCard,
  ReputationTrendCard,
} from './reputation';
import { AgencyReputation } from './reputation/AgencyReputation';
import { ProReputation } from './reputation/ProReputation';
import { ProPlusReputation } from './reputation/ProPlusReputation';
import { StarterReputation } from './reputation/StarterReputation';

/**
 * /app/reputation — thin plan router.
 *
 *   Starter → <StarterReputation /> (H1 Health Score Hub)
 *   Pro     → legacy multi-card layout (TODO — own design pending)
 *   Agency  → legacy multi-card layout (TODO — own design pending)
 */
export function ReputationPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) return <StarterReputation />;
  if (isAgency) return <AgencyReputation />;
  // Pro Plus (but not Agency, already handled above) → Signal Map.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) return <ProPlusReputation />;
  if (isPro) return <ProReputation />;
  return <LegacyReputation />;
}

// ---------------------------------------------------------------------------
// Legacy multi-card layout — unchanged from pre-Starter-redesign. Used for
// Pro / Agency tiers until their tier-specific designs ship.
// ---------------------------------------------------------------------------
function LegacyReputation() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-6"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sender trust &amp; Health</h1>
        <p className="text-sm text-text-dim">
          Inbox delivery signals, SPF/DKIM/DMARC authentication, block list checks, and warmth posture
          across every mailbox in your workspace.
        </p>
      </header>

      {/* Row 1 — DNS health full width */}
      <DnsHealthPanel />

      {/* Row 2 — external integrations + blacklist */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PostmasterWidget />
        <SndsWidget />
        <BlacklistCard />
      </div>

      {/* Row 3 — radar + gauge */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HealthRadarCard />
        <WarmthGaugeCard />
      </div>

      {/* Row 4 — reputation trend full width */}
      <ReputationTrendCard />
    </motion.div>
  );
}

export default ReputationPage;
