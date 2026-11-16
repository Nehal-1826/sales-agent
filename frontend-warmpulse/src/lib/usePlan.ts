/**
 * Plan-aware helper. Each client section dispatches to a different
 * sub-component depending on the user's plan (Starter / Pro / Pro Plus / Agency).
 *
 * Usage:
 *   const { plan, isStarter, isPro, isProPlus, isAgency } = usePlan();
 *   if (isStarter) return <StarterDashboard />;
 *   if (isAgency) return <AgencyDashboard />;
 *   return <ProDashboard />;
 *
 * `isPro` matches Pro AND above (Pro Plus, Agency, Enterprise) — it's a
 * "Pro at least" gate. `isProPlus` is the narrower Pro-Plus-or-above
 * gate used for the external reputation signals feature.
 *
 * Dev override: while developing/QA-ing all dashboards from one login,
 * set `localStorage.setItem('warmpulse.planOverride', 'starter')` (or
 * 'pro' / 'pro_plus' / 'agency'). This is honoured only in dev mode OR
 * when the user is a super_admin (so it's safe in production too —
 * admins can preview any tier while impersonating).
 */
import { useAuthStore } from '@/stores/auth';
import { useMe } from '@/features/auth/useAuthApi';

export type PlanTier = 'starter' | 'pro' | 'pro_plus' | 'agency' | 'unknown';

const PLAN_OVERRIDE_KEY = 'warmpulse.planOverride';

function normalisePlan(value: string | null | undefined): PlanTier {
  if (!value) return 'unknown';
  const lower = value.toLowerCase().trim();
  if (lower.includes('starter') || lower.includes('trial')) return 'starter';
  // Order matters — match the more specific tiers first.
  if (lower.includes('enterprise')) return 'agency';
  if (lower.includes('agency')) return 'agency';
  if (
    lower.includes('pro_plus') ||
    lower.includes('pro-plus') ||
    lower.includes('proplus') ||
    lower.includes('pro plus')
  ) {
    return 'pro_plus';
  }
  if (lower.includes('pro') || lower.includes('growth') || lower.includes('scale')) {
    return 'pro';
  }
  return 'unknown';
}

function readOverride(): PlanTier | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAN_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = normalisePlan(raw);
    return parsed === 'unknown' ? null : parsed;
  } catch {
    return null;
  }
}

export interface PlanHookResult {
  /** Final plan tier in use (after dev override). */
  plan: PlanTier;
  /** Real plan from the server, ignoring any dev override. */
  realPlan: PlanTier;
  /** True if the active plan is Starter. */
  isStarter: boolean;
  /** True if the active plan is Pro or above (Pro / Pro Plus / Agency). */
  isPro: boolean;
  /** True if the active plan is Pro Plus or above (Pro Plus / Agency). */
  isProPlus: boolean;
  /** True if the active plan is Agency. */
  isAgency: boolean;
  /** Whether this workspace bought the CRM add-on (Starter CRM unlock). */
  crmAddon: boolean;
  /** Indicates we're still waiting for the /auth/me response. */
  isLoading: boolean;
}

export function usePlan(): PlanHookResult {
  const me = useMe();
  const role = useAuthStore((s) => s.user?.role);

  const realPlan = normalisePlan(me.data?.plan ?? null);

  // Honour the dev override only when it's safe to do so:
  //   - In dev mode (Vite import.meta.env.DEV).
  //   - When the user is a super_admin (so they can preview tiers in prod).
  const allowOverride = (typeof import.meta !== 'undefined' && import.meta.env?.DEV) || role === 'super_admin';
  const override = allowOverride ? readOverride() : null;
  const plan: PlanTier = override ?? realPlan;

  const isAgency = plan === 'agency';
  const isProPlus = plan === 'pro_plus' || isAgency;
  const isPro = plan === 'pro' || isProPlus;

  return {
    plan,
    realPlan,
    isStarter: plan === 'starter',
    isPro,
    isProPlus,
    isAgency,
    crmAddon: Boolean(me.data?.crm_addon),
    isLoading: me.isLoading,
  };
}

/**
 * Imperative setter for the dev/admin override. Returns true on success.
 * Use from a PlanOverrideChip component (to be added later) or from the
 * browser console while QA-ing.
 */
export function setPlanOverride(plan: PlanTier | null): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (plan === null) {
      window.localStorage.removeItem(PLAN_OVERRIDE_KEY);
    } else {
      window.localStorage.setItem(PLAN_OVERRIDE_KEY, plan);
    }
    // Force a render-cycle pickup. Easiest: dispatch storage event so any
    // listeners in the same window re-evaluate. Otherwise the user has
    // to refresh — which is fine for now.
    window.dispatchEvent(new StorageEvent('storage', { key: PLAN_OVERRIDE_KEY }));
    return true;
  } catch {
    return false;
  }
}
