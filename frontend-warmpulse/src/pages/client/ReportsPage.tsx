import { useState } from 'react';
import { motion } from 'framer-motion';
import { FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { usePlan } from '@/lib/usePlan';
import { GenerateReportDialog } from '@/features/reports/GenerateReportDialog';
import { ReportsTable } from '@/features/reports/ReportsTable';
import { ScheduledReportsPanel } from '@/features/reports/ScheduledReportsPanel';
import { ReportsVolumeChart } from '@/features/reports/ReportsVolumeChart';
import { AgencyReports } from './reports/AgencyReports';
import { ProPlusReports } from './reports/ProPlusReports';
import { ProReports } from './reports/ProReports';
import { StarterReports } from './reports/StarterReports';

/**
 * /app/reports — thin plan router.
 *
 *   Starter → <StarterReports /> (R4 Cover Strip)
 *   Pro     → legacy multi-card layout (TODO — own design pending)
 *   Agency  → legacy multi-card layout (TODO — own design pending)
 */
export function ReportsPage() {
  const { isStarter, isPro, isProPlus, isAgency } = usePlan();

  if (isStarter) return <StarterReports />;
  if (isAgency) return <AgencyReports />;
  // Pro Plus (but not Agency, already handled above) → Report Builder Canvas.
  // Must sit ABOVE the `isPro` check: `isPro` is true for Pro-and-above, so
  // Pro Plus users would otherwise be caught by it and get the Pro design.
  if (isProPlus) return <ProPlusReports />;
  if (isPro) return <ProReports />;
  return <LegacyReports />;
}

// ---------------------------------------------------------------------------
// Legacy multi-card layout — unchanged from pre-Starter-redesign. Used for
// Pro / Agency tiers until their tier-specific designs ship.
// ---------------------------------------------------------------------------
function LegacyReports() {
  const [genOpen, setGenOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-text-dim">
            PDF/CSV exports, scheduled digests, and white-label reports (Agency).
          </p>
        </div>
        <Button
          leftIcon={<FilePlus2 className="h-4 w-4" />}
          onClick={() => setGenOpen(true)}
        >
          Generate report
        </Button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <ReportsVolumeChart />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <ReportsTable />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <ScheduledReportsPanel />
      </motion.div>

      <GenerateReportDialog open={genOpen} onOpenChange={setGenOpen} />
    </motion.div>
  );
}

export default ReportsPage;
