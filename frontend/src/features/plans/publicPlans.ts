/**
 * Public plans — the SINGLE source of truth for plan price / features / limits
 * shown on the marketing home page AND the onboarding plan picker.
 *
 * Both surfaces read from `GET /api/plans`, which returns only active + public
 * plans (so hiding a tier in /admin/plans removes it everywhere). Price,
 * feature list, and mailbox limits all come straight from the DB, so editing a
 * plan in the admin Plans page instantly updates the home page and onboarding.
 *
 * Marketing-only copy (blurb, CTA label, "most popular" highlight) is NOT
 * stored in the DB — it lives in a name-keyed overlay on the consuming page.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Raw shape returned by GET /api/plans (PlanOut). */
interface BackendPlan {
  id: string;
  name: string;
  price_cents?: number;
  max_mailboxes?: number;
  daily_email_cap?: number;
  capabilities?: { features?: string[] } | null;
}

/** Normalised plan consumed by the UI. Price is USD/month. */
export interface PublicPlan {
  id: string;
  name: string;
  /** lower-case underscore slug, e.g. "pro_plus" — used for ?plan= links + overlay lookup */
  slug: string;
  priceMonthly: number;
  maxMailboxes: number;
  dailyEmailCap: number;
  features: string[];
}

export function planSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_');
}

function normalize(p: BackendPlan): PublicPlan {
  const features = Array.isArray(p.capabilities?.features)
    ? p.capabilities!.features!.filter((f): f is string => typeof f === 'string')
    : [];
  return {
    id: p.id,
    name: p.name,
    slug: planSlug(p.name),
    priceMonthly: typeof p.price_cents === 'number' ? p.price_cents / 100 : 0,
    maxMailboxes: typeof p.max_mailboxes === 'number' ? p.max_mailboxes : 1,
    dailyEmailCap: typeof p.daily_email_cap === 'number' ? p.daily_email_cap : 0,
    features,
  };
}

async function fetchPublicPlans(): Promise<PublicPlan[]> {
  const { data } = await api.get<BackendPlan[] | { plans: BackendPlan[] }>('/plans');
  const raw = Array.isArray(data) ? data : Array.isArray(data?.plans) ? data.plans : [];
  return raw.map(normalize);
}

/**
 * Fetch active + public plans. Returns `data: undefined` while loading or on
 * error so callers can fall back to hard-coded marketing copy and never render
 * an empty pricing section.
 */
export function usePublicPlans() {
  return useQuery({
    // Distinct from the legacy raw ['public-plans'] queries (NewHero carousel,
    // old Pricing.tsx) which return the unnormalised PlanOut shape — sharing a
    // key would mix shapes in the React Query cache and crash consumers.
    queryKey: ['plans', 'public', 'normalized'],
    queryFn: fetchPublicPlans,
    retry: 0,
    staleTime: 60 * 1000,
  });
}
