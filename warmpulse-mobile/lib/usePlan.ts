import { useAuth } from './auth';

export type PlanFlags = {
  /** Display name, e.g. "Pro Plus" (falls back to "Starter"). */
  planName: string;
  /** Tier rank: starter=0, pro=1, pro_plus=2, agency=3. */
  tier: number;
  isStarter: boolean;
  /** True for Pro and above. */
  isPro: boolean;
  /** True for Pro Plus and above. */
  isProPlus: boolean;
  isAgency: boolean;
  /** True when the signed-in user is a platform super_admin. */
  isAdmin: boolean;
};

/**
 * Tier-awareness from the real signed-in user. `/auth/me` returns the plan's
 * capitalized NAME ("Starter" | "Pro" | "Pro Plus" | "Agency"); we normalise
 * and expose the same and-above flags the web app uses (isPro = Pro-and-above).
 */
export function usePlan(): PlanFlags {
  const { user } = useAuth();
  const raw = (user?.plan ?? 'Starter').trim();
  const norm = raw.toLowerCase().replace(/[\s_-]+/g, ' ');

  const isAgency = norm === 'agency';
  const isProPlus = isAgency || norm === 'pro plus' || norm === 'proplus';
  const isPro = isProPlus || norm === 'pro';
  const isStarter = !isPro;

  const tier = isAgency ? 3 : isProPlus ? 2 : isPro ? 1 : 0;
  const isAdmin = user?.role === 'super_admin';

  return { planName: raw, tier, isStarter, isPro, isProPlus, isAgency, isAdmin };
}
