import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProPlusSettingsData } from '@/features/settings/useProPlusSettingsData';
import { ProPlusSet1Document } from '../proplus/ProPlusSet1Document';
import { RegionFormatPanel } from '@/features/settings/RegionFormatPanel';

/**
 * /app/settings for Pro-Plus-tier users.
 *
 * Renders the "Long-form Document" design (`ProPlusSet1Document`) wired to
 * REAL settings data via `useProPlusSettingsData()`. The empty / loading UX
 * mirrors the sibling Pro-Plus billing wrapper (`billing/ProPlusBilling`):
 * no signed-in user → the "complete onboarding" EmptyState with the same
 * "Settings" page heading; while the primary settings query resolves → a
 * lightweight skeleton matching the page header + TOC + document layout.
 *
 * NOTE: this is the LIVE wrapper at `settings/ProPlusSettings.tsx` —
 * distinct from the prop-less `proplus/ProPlusSettings.tsx` used by the
 * isolated :35001 design preview harness.
 */
export function ProPlusSettings() {
  const { data, isLoading } = useProPlusSettingsData();

  // No auth user / settings missing — same heading + a settings-shaped CTA.
  if (!isLoading && data === null) {
    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-1"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-text-dim">
            Profile, security, notifications, appearance, and data — once
            you're signed in.
          </p>
        </motion.div>
        <EmptyState
          icon={<SettingsIcon className="h-5 w-5" />}
          title="No settings to show yet"
          description="Finish onboarding to set up your workspace and start configuring."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Still resolving the settings payload — lightweight skeleton matching the
  // page header strip + TOC + long-form document column layout.
  if (isLoading || data === null) {
    return (
      <div className="space-y-5">
        <div className="h-16 w-full animate-pulse rounded-xl bg-surface-2/60" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <div className="h-[28rem] animate-pulse rounded-xl bg-surface-2/60" />
          </div>
          <div className="lg:col-span-9">
            <div className="h-[40rem] animate-pulse rounded-xl bg-surface-2/60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ProPlusSet1Document data={data ?? undefined} />
      <RegionFormatPanel />
    </div>
  );
}

export default ProPlusSettings;
