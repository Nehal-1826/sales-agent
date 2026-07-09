import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';

interface ApiPlan {
  id: string;
  name: string;
  price_cents: number;
  capabilities?: { features?: string[] } | null;
  featured?: boolean;
}

interface UiPlan {
  id: string;
  name: string;
  price_cents: number;
  features: string[];
  featured?: boolean;
}

const FALLBACK_PLANS: UiPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price_cents: 1500,
    features: [
      '50 warmup emails/day',
      '1 inbox',
      'Basic dashboard',
      'SPF/DKIM/DMARC checker',
      'Gmail + Outlook',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price_cents: 3900,
    featured: true,
    features: [
      '100 warmup emails/day per inbox',
      '5 inboxes',
      'AI-generated content',
      'Warmth Score alerts',
      'Placement testing',
      'Blacklist monitoring',
      'Slack/webhook',
      'Priority support',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price_cents: 9900,
    features: [
      '200 warmup emails/day per inbox',
      'Unlimited inboxes',
      'Multi-client workspace',
      'White-label reports',
      'API access',
      'Custom schedules',
      'Dedicated AM',
    ],
  },
];

async function fetchPlans(): Promise<UiPlan[]> {
  const { data } = await api.get<ApiPlan[]>('/plans');
  return data.map((p) => ({
    id: p.id,
    name: p.name,
    price_cents: p.price_cents,
    features: p.capabilities?.features ?? [],
    featured: p.featured ?? p.name?.toLowerCase() === 'pro',
  }));
}

function formatPrice(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export function Pricing() {
  const { data: plans } = useQuery({
    queryKey: ['public-plans'],
    queryFn: fetchPlans,
    retry: 0,
    staleTime: 5 * 60 * 1000,
    // If the API is unreachable during public landing render, silently fall back.
  });

  const effectivePlans: UiPlan[] =
    plans && plans.length > 0 ? plans : FALLBACK_PLANS;

  return (
    <section
      id="pricing"
      className="relative min-h-[60vh] w-full px-6 py-[120px]"
    >
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            Pricing
          </span>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">
            Pick a plan that scales with your outreach.
          </h2>
          <p className="mt-4 text-base text-text-dim md:text-lg">
            Start on a 7-day trial. Upgrade or cancel any time.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {effectivePlans.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, delay: idx * 0.08 }}
              whileHover={{ y: -4 }}
              className={[
                'relative rounded-2xl border bg-surface p-7 transition-all duration-300',
                plan.featured
                  ? 'border-accent/40 md:scale-[1.03] md:shadow-[0_0_40px_rgba(242, 101, 34,0.12)]'
                  : 'border-border-muted hover:border-accent/40',
              ].join(' ')}
            >
              {plan.featured && (
                <>
                  <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-accent via-accent2 to-accent" />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-accent/40 bg-bg px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                    Most popular
                  </span>
                </>
              )}

              <h3 className="text-lg font-semibold text-text">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-text">
                  {formatPrice(plan.price_cents)}
                </span>
                <span className="text-sm text-text-dim">/mo</span>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2 text-sm text-text-dim"
                  >
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                      strokeWidth={2.5}
                    />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                variant={plan.featured ? 'primary' : 'outline'}
                size="lg"
                className="mt-7 w-full"
              >
                <Link to={`/signup?plan=${plan.id}`}>Start {plan.name}</Link>
              </Button>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim/70">
          Dummy payments — no real card charged during beta.
        </p>
      </div>
    </section>
  );
}
