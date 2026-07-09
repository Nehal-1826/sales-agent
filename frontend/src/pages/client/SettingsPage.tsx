import { motion } from 'framer-motion';
import { usePlan } from '@/lib/usePlan';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import { AgencySettings } from './settings/AgencySettings';
import { ProSettings } from './settings/ProSettings';
import { ProPlusSettings } from './settings/ProPlusSettings';
import { StarterSettings } from './settings/StarterSettings';

/**
 * /app/settings — thin plan router.
 *
 *   Starter  → <StarterSettings /> (SE1 Card Hub — discoverable 3×2 grid)
 *   Agency   → <AgencySettings />
 *   Pro Plus → <ProPlusSettings /> (Set1 Long-form Document + TOC)
 *   Pro      → <ProSettings />
 */
export function SettingsPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) return <StarterSettings />;
  if (isAgency) return <AgencySettings />;
  // Pro Plus (but not Agency, already handled above) → Long-form Document.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) return <ProPlusSettings />;
  if (isPro) return <ProSettings />;
  return <LegacySettings />;
}

// ---------------------------------------------------------------------------
// Legacy multi-tab layout — kept verbatim for Pro/Agency until their tier-
// specific designs ship.
// ---------------------------------------------------------------------------
function LegacySettings() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-text-dim">
          Profile, notifications, 2FA, timezone, activity log, and tour replay.
        </p>
      </div>

      <SettingsTabs />
    </motion.div>
  );
}

export default SettingsPage;
