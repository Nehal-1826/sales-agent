import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useMe } from '@/features/auth/useAuthApi';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Legacy onboarding wizard — fully DEPRECATED.
 *
 * The new dashboard at `/onboarding` handles every phase inline:
 * plan → checkout → volume → provider → credentials → DNS → start.
 *
 * This component exists solely to catch leftover deep-links into
 * `/onboarding/<step>` (e.g. `/onboarding/connect`, `/onboarding/dns`, an
 * old bookmark from before the redesign) and bounce them to the dashboard.
 * If the user is already past onboarding, the dashboard's own guard sends
 * them straight on to `/app/dashboard`.
 *
 * All the heavy wizard machinery — PlanPicker / DummyPayment / Step1Volume /
 * Step2Provider / Step3Credentials / Step4DnsCheck / Step5ContentMode /
 * Step6Confirm / WizardShell — still lives in the codebase but is no longer
 * reachable through any route. We left it in place to keep this changeset
 * focused; a dedicated cleanup pass can delete those files once the new
 * dashboard has been in production for a release or two.
 */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const meQuery = useMe();

  // Keep the auth store in sync if the user lands here while /auth/me is
  // mid-flight, so the dashboard's guard sees a fresh status on arrival.
  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  useEffect(() => {
    navigate('/onboarding', { replace: true });
  }, [navigate]);

  return (
    <div className="flex items-center justify-center py-12 text-sm text-text-dim">
      <Spinner size={18} />
    </div>
  );
}
