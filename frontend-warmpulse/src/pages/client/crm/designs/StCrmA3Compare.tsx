import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Minus, ArrowRight, Sparkles, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { usePurchaseCrmAddon, CRM_ADDON_PRICE_CENTS } from '@/features/billing/api';

const ADDON_PRICE_LABEL = `₹${(CRM_ADDON_PRICE_CENTS / 100).toLocaleString('en-IN')}/mo`;

/**
 * The "Unlock CRM" add-on purchase. Starter keeps its plan; buying the add-on
 * flips the per-workspace ``crm_addon`` flag, after which CrmPage renders the
 * real CRM workspace (1 campaign / 500 leads). Dummy gateway — no real charge.
 */
function UnlockCrmAddon({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const [open, setOpen] = useState(false);
  const purchase = usePurchaseCrmAddon();

  const confirm = () => {
    purchase.mutate(undefined, {
      onSuccess: () => {
        setOpen(false);
        toast.success('CRM unlocked — your add-on is now active.');
      },
      onError: () => toast.error('Could not unlock CRM. Please try again.'),
    });
  };

  return (
    <>
      <Button
        size={size}
        className="shrink-0"
        leftIcon={<Zap className="h-4 w-4" strokeWidth={2.4} />}
        onClick={() => setOpen(true)}
      >
        Unlock CRM — {ADDON_PRICE_LABEL}
      </Button>

      <AppDialog open={open} onOpenChange={setOpen}>
        <AppDialogContent>
          <AppDialogHeader>
            <AppDialogTitle>Unlock the CRM add-on</AppDialogTitle>
            <AppDialogDescription>
              Add a focused CRM to your Starter plan — one pipeline with up to 500
              leads, Kanban, CSV import, sequences and analytics. Billed at{' '}
              {ADDON_PRICE_LABEL}.
            </AppDialogDescription>
          </AppDialogHeader>
          <AppDialogBody>
            <p className="text-sm text-text-dim">
              This is a dummy checkout — no real charge is made. Your warmed
              mailboxes and settings are untouched.
            </p>
          </AppDialogBody>
          <AppDialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={purchase.isPending}>
              Cancel
            </Button>
            <Button onClick={confirm} isLoading={purchase.isPending} leftIcon={<Zap className="h-4 w-4" />}>
              Pay {ADDON_PRICE_LABEL} & unlock
            </Button>
          </AppDialogFooter>
        </AppDialogContent>
      </AppDialog>
    </>
  );
}

type TierId = 'starter' | 'pro' | 'proPlus' | 'agency';

type Plan = {
  id: TierId;
  name: string;
  allowance: string;
  current: boolean;
  popular: boolean;
};

/** A feature row: either a boolean per tier, or a literal value per tier. */
type FeatureRow =
  | { kind: 'bool'; label: string; values: Record<TierId, boolean> }
  | { kind: 'value'; label: string; values: Record<TierId, string> };

const TIER_ORDER: readonly TierId[] = ['starter', 'pro', 'proPlus', 'agency'];

const PLANS: Record<TierId, Plan> = {
  starter: { id: 'starter', name: 'Starter', allowance: 'CRM not included', current: true, popular: false },
  pro: { id: 'pro', name: 'Pro', allowance: '3 CRM campaigns', current: false, popular: true },
  proPlus: { id: 'proPlus', name: 'Pro Plus', allowance: '10 CRM campaigns', current: false, popular: false },
  agency: { id: 'agency', name: 'Agency', allowance: 'Unlimited campaigns', current: false, popular: false },
};

const FEATURES: FeatureRow[] = [
  {
    kind: 'value',
    label: 'CRM campaigns',
    values: { starter: '0', pro: '3', proPlus: '10', agency: 'Unlimited' },
  },
  {
    kind: 'bool',
    label: 'Leads & Kanban pipeline',
    values: { starter: false, pro: true, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'Deal value tracking',
    values: { starter: false, pro: true, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'Activity timeline',
    values: { starter: false, pro: true, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'CSV import',
    values: { starter: false, pro: true, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'LinkedIn import',
    values: { starter: false, pro: false, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'Email sequence automation',
    values: { starter: false, pro: true, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'Per-campaign analytics',
    values: { starter: false, pro: true, proPlus: true, agency: true },
  },
  {
    kind: 'bool',
    label: 'Team owner assignment',
    values: { starter: false, pro: false, proPlus: true, agency: true },
  },
];

const ACCENT_GLOW =
  'radial-gradient(closest-side, color-mix(in srgb, var(--wp-accent, #F26522) 32%, transparent), transparent)';

function BoolCell({ on, dim }: { on: boolean; dim: boolean }) {
  if (on) {
    return (
      <span className="inline-flex items-center justify-center" aria-label="Included">
        <Check className="h-4 w-4 text-accent" strokeWidth={2.4} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center" aria-label="Not included">
      <Minus className={`h-4 w-4 ${dim ? 'text-text-faint/60' : 'text-text-faint'}`} strokeWidth={2.2} />
    </span>
  );
}

function ValueCell({ text, dim, on }: { text: string; dim: boolean; on: boolean }) {
  if (dim) {
    return <span className="text-sm font-medium text-text-faint">{text}</span>;
  }
  return (
    <span className={`text-sm font-semibold ${on ? 'text-accent' : 'text-text'}`}>{text}</span>
  );
}

export function StCrmA3Compare() {
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/[0.08] px-3 py-1 text-xs font-medium text-accent">
          <Sparkles className="h-4 w-4" strokeWidth={2.2} />
          Paid add-on
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-text md:text-4xl">
          Choose the plan that fits your pipeline
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-dim">
          Starter warms your inbox. Add the CRM to turn replies into closed deals.
        </p>
      </motion.header>

      {/* PLAN CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIER_ORDER.map((tier, i) => {
          const plan = PLANS[tier];
          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 + i * 0.07 }}
              className={`relative flex flex-col rounded-2xl border p-5 ${
                plan.popular
                  ? 'border-accent/50 bg-accent/[0.05]'
                  : plan.current
                    ? 'border-border-muted bg-surface-2/40'
                    : 'border-border-muted bg-surface'
              }`}
            >
              {plan.popular ? (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl"
                    style={{ background: ACCENT_GLOW }}
                  />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-bg shadow-glow">
                    Most popular
                  </span>
                </>
              ) : null}

              <div className="relative">
                <h2 className={`text-base font-semibold ${plan.current ? 'text-text-dim' : 'text-text'}`}>
                  {plan.name}
                </h2>
                <p
                  className={`mt-1 text-sm ${
                    plan.current ? 'text-text-faint' : plan.popular ? 'text-accent' : 'text-text-dim'
                  }`}
                >
                  {plan.allowance}
                </p>
              </div>

              <div className="relative mt-5 pt-1">
                {plan.current ? (
                  <Button asChild variant="ghost" size="sm" className="w-full">
                    <Link to="/app/billing">Manage plan</Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    size="sm"
                    variant={plan.popular ? 'primary' : 'secondary'}
                    className="w-full"
                  >
                    <Link to="/app/billing">
                      Upgrade
                      <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                    </Link>
                  </Button>
                )}
                {plan.current ? (
                  <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-wide text-text-faint">
                    Your plan
                  </p>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* FEATURE MATRIX */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="overflow-hidden rounded-2xl border border-border-muted bg-surface"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border-muted">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-dim">
                  Capability
                </th>
                {TIER_ORDER.map((tier) => {
                  const plan = PLANS[tier];
                  return (
                    <th
                      key={plan.id}
                      className={`px-4 py-3 text-center text-xs font-semibold ${
                        plan.current
                          ? 'text-text-faint'
                          : plan.popular
                            ? 'text-accent'
                            : 'text-text'
                      }`}
                    >
                      {plan.name}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((row, ri) => (
                <tr
                  key={row.label}
                  className={`border-b border-border-muted/60 last:border-b-0 ${
                    ri % 2 === 1 ? 'bg-surface-2/30' : ''
                  }`}
                >
                  <th
                    scope="row"
                    className="px-5 py-3 text-sm font-medium text-text"
                  >
                    {row.label}
                  </th>
                  {TIER_ORDER.map((tier) => {
                    const plan = PLANS[tier];
                    const dim = plan.current;
                    return (
                      <td
                        key={plan.id}
                        className={`px-4 py-3 text-center ${dim ? 'bg-surface-2/20' : ''}`}
                      >
                        {row.kind === 'bool' ? (
                          <BoolCell on={row.values[tier]} dim={dim} />
                        ) : (
                          <ValueCell
                            text={row.values[tier]}
                            dim={dim}
                            on={row.values[tier] !== '0'}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* CLOSING */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3 }}
        className="flex flex-col items-center gap-4 rounded-2xl border border-accent/30 bg-accent/[0.05] px-6 py-7 text-center sm:flex-row sm:justify-between sm:text-left"
      >
        <p className="max-w-md text-sm leading-relaxed text-text-dim">
          Add the CRM to Starter for {ADDON_PRICE_LABEL}, or upgrade your plan —
          your warmed mailboxes and settings carry over either way.
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild size="lg" variant="secondary">
            <Link to="/app/billing">
              Compare plans
              <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
            </Link>
          </Button>
          <UnlockCrmAddon size="lg" />
        </div>
      </motion.div>
    </div>
  );
}

export default StCrmA3Compare;
