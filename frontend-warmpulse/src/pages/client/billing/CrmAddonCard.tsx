import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  AppDialog,
  AppDialogContent,
  AppDialogHeader,
  AppDialogBody,
  AppDialogFooter,
  AppDialogTitle,
  AppDialogDescription,
} from '@/components/ui/AppDialog';
import { toast } from '@/components/ui/AppToast';
import { usePlan } from '@/lib/usePlan';
import { usePurchaseCrmAddon, CRM_ADDON_PRICE_CENTS } from '@/features/billing/api';

const PRICE_LABEL = `₹${(CRM_ADDON_PRICE_CENTS / 100).toLocaleString('en-IN')}/mo`;

/**
 * Billing-page "Add-ons" card for the CRM add-on.
 *
 * Shown to Starter / unknown-plan workspaces (paid tiers already include CRM).
 * If the add-on is owned it renders an "Active" state; otherwise a purchase
 * button that runs the dummy-gateway checkout and flips ``crm_addon`` so the
 * CRM page unlocks.
 */
export function CrmAddonCard() {
  const { isPro, crmAddon } = usePlan();
  const [open, setOpen] = useState(false);
  const purchase = usePurchaseCrmAddon();

  // Paid tiers (Pro and above) already include CRM — nothing to sell here.
  if (isPro) return null;

  const confirm = () => {
    purchase.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        toast.success('CRM add-on activated.');
      },
      onError: () => toast.error('Could not activate the CRM add-on. Please try again.'),
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-border-muted bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-accent">
            <Zap className="h-3 w-3" strokeWidth={2.4} />
            Add-on
          </span>
          <h3 className="text-base font-semibold text-text">CRM for Starter</h3>
          <p className="max-w-md text-sm text-text-dim">
            One focused pipeline — up to 500 leads, Kanban, CSV import, email
            sequences and per-campaign analytics. Billed at {PRICE_LABEL}.
          </p>
        </div>

        {crmAddon ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/[0.07] px-3 py-2 text-sm font-semibold text-accent">
            <Check className="h-4 w-4" strokeWidth={2.6} />
            Active
          </span>
        ) : (
          <Button
            className="shrink-0"
            leftIcon={<Zap className="h-4 w-4" strokeWidth={2.4} />}
            onClick={() => setOpen(true)}
          >
            Unlock CRM — {PRICE_LABEL}
          </Button>
        )}
      </div>

      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Unlock the CRM add-on</AppDialogTitle>
            <AppDialogDescription>
              Add a focused CRM to your Starter plan for {PRICE_LABEL}. This is a
              dummy checkout — no real charge is made.
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogBody>
            <ul className="space-y-1.5 text-sm text-text-dim">
              {['1 campaign pipeline', 'Up to 500 leads', 'CSV import & Kanban', 'Sequences & analytics'].map(
                (f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-accent" strokeWidth={2.4} />
                    {f}
                  </li>
                ),
              )}
            </ul>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={purchase.isPending}>
              Cancel
            </Button>
            <Button onClick={confirm} isLoading={purchase.isPending} leftIcon={<Zap className="h-4 w-4" />}>
              Pay {PRICE_LABEL} & unlock
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </motion.section>
  );
}

export default CrmAddonCard;
