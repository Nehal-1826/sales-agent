import { Check, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useCurrency } from '@/lib/currency';
import { usePublicPlans, type PublicPlan } from '@/features/plans/publicPlans';
import { useT, type TFunc } from '@/lib/i18n';

export interface Plan {
  id: string;
  name: string;
  /** Base price in INR per month — `useCurrency().format()` localises to USD / etc. */
  price_monthly: number;
  currency?: string;
  /** `Infinity` means "unlimited" — rendered as the word "Unlimited". */
  mailbox_limit: number;
  features: string[];
  recommended?: boolean;
}

interface PlanPickerProps {
  onSelect: (plan: Plan) => void;
  selectedPlanId?: string | null;
}

/**
 * Fallback tiers shown if /api/plans 404s (or returns nothing). Stays in sync
 * with the landing page `PLANS` array in `pages/landing/HeroSections.tsx`.
 * Prices are INR/month (the stored + charged base). Update both files together
 * when pricing changes.
 */
const FALLBACK_PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price_monthly: 1500,
    currency: 'INR',
    mailbox_limit: 1,
    features: [
      '1 mailbox',
      '30 warmup emails / day',
      'Gmail + Outlook + SMTP',
      'DNS validation (SPF/DKIM/DMARC)',
      'Ramp ladder + LLM content',
      'Weekly digest reports',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price_monthly: 5000,
    currency: 'INR',
    mailbox_limit: 10,
    features: [
      '10 mailboxes',
      '50 sends / day each',
      'Spam-rescue + peer health-check',
      'On-demand PDF / CSV reports',
      'Webhook + Slack alerts',
      '90-day activity history',
      '10 team seats · 5 API keys',
      'Priority email + chat support',
    ],
    recommended: true,
  },
  {
    id: 'pro_plus',
    name: 'Pro Plus',
    price_monthly: 8000,
    currency: 'INR',
    mailbox_limit: 15,
    features: [
      'Everything in Pro, plus:',
      '15 mailboxes · 75 sends / day',
      'Google Postmaster ingest',
      'Microsoft SNDS ingest',
      'Placement tester (30 seeds)',
      'Slack Block Kit notifications',
      'Priority 4-hr support SLA',
    ],
  },
];

function toPlan(p: PublicPlan): Plan {
  return {
    id: p.id,
    name: p.name,
    price_monthly: p.priceMonthly,
    mailbox_limit: p.maxMailboxes,
    features: p.features,
    recommended: p.slug === 'pro',
  };
}

function mailboxLimitLabel(limit: number, t: TFunc): string {
  if (!Number.isFinite(limit)) return t('onb.plan.unlimited');
  if (limit === 1) return t('onb.plan.mailboxOne');
  return t('onb.plan.mailboxMany', { count: limit });
}

export function PlanPicker({ onSelect, selectedPlanId }: PlanPickerProps) {
  const t = useT();
  const { format, currency } = useCurrency();
  const { data: apiPlans, isLoading } = usePublicPlans();
  // Price / features / mailbox limits come from the admin Plans page via
  // /api/plans; FALLBACK_PLANS only renders if the API is unreachable so the
  // wizard is demo-able end-to-end.
  const plans = apiPlans && apiPlans.length > 0 ? apiPlans.map(toPlan) : FALLBACK_PLANS;

  // Temporary: Cashfree keys not configured — go straight to dummy flow.
  const handleChoose = (plan: Plan) => onSelect(plan);

  return (
    <div className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-text">{t('onb.plan.heading')}</h1>
        <p className="text-sm text-text-dim">
          {t('onb.plan.subheading')}
        </p>
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-4">
          {(plans ?? FALLBACK_PLANS).map((plan) => {
            const selected = plan.id === selectedPlanId;
            return (
              <Card
                key={plan.id}
                className={cn(
                  'relative flex h-full flex-col transition-all',
                  selected && 'ring-2 ring-accent shadow-glow',
                  plan.recommended && !selected && 'border-accent/40',
                )}
              >
                {plan.recommended ? (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bg">
                    <Sparkles className="h-3 w-3" />
                    {t('onb.plan.recommended')}
                  </span>
                ) : null}
                <CardContent className="flex h-full flex-1 flex-col gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-text">{plan.name}</h3>
                    <div className="mt-2 flex flex-col gap-1">
                      <span className="text-3xl font-bold tabular-nums leading-none text-text">
                        {format(plan.price_monthly)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-dim">
                        <span
                          className="rounded-full border border-accent/30 bg-accent/10 px-1.5 py-[1px] text-[9px] text-accent"
                          aria-label={`Currency: ${currency.name}`}
                        >
                          {currency.code}
                        </span>
                        {t('onb.plan.perMonth')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-text-dim">
                      {mailboxLimitLabel(plan.mailbox_limit, t)}
                    </p>
                  </div>

                  <ul className="flex-1 space-y-2 text-sm text-text-dim">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant={selected ? 'primary' : 'secondary'}
                    onClick={() => handleChoose(plan)}
                    className="mt-auto w-full"
                  >
                    {selected ? t('onb.plan.selected') : t('onb.plan.choose', { name: plan.name })}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs text-text-dim">
        {t('onb.plan.betaNote')}
      </p>
    </div>
  );
}
