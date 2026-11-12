/** Local sessionStorage keys used by the onboarding dashboard. */
export const ONBOARDING_KEYS = [
  'warmpulse.pendingPlan',
  'warmpulse.pendingPayment',
  'warmpulse.pendingVolume',
  'warmpulse.pendingProvider',
  'warmpulse.pendingDnsAck',
  'warmpulse.pendingNewMailbox',
] as const;

/**
 * Wipe all locally-cached onboarding state PLUS any tier override left
 * over from earlier QA. Call after login/signup so a fresh user never
 * inherits the previous tester's `warmpulse.planOverride='pro'` and
 * ends up pinned to the wrong dashboard tier.
 */
export function clearOnboardingState() {
  if (typeof window === 'undefined') return;
  for (const k of ONBOARDING_KEYS) window.sessionStorage.removeItem(k);
  try {
    window.localStorage.removeItem('warmpulse.planOverride');
  } catch {
    /* localStorage may throw in private mode — best-effort */
  }
}
