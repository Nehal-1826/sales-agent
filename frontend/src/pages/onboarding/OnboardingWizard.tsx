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
 *
 * Self-hosted preflight (Step2bServerCheck): this wizard's step-sequencing
 * switch was removed when the file became a redirect stub, so there is
 * currently no live call site to wire the new step into here. The intended
 * insertion point, for whenever this tree is revived (or its `switch`
 * logic — see git history prior to the "onboarding rework" commit — is
 * restored), is between Step2Provider and Step3Credentials, gated on
 * `draft.provider === 'self_hosted'`:
 *
 *   {step === 2.5 && draft.provider === 'self_hosted' ? (
 *     <Step2bServerCheck
 *       smtpHost={draft.smtp_host}
 *       smtpPort={draft.smtp_port}
 *       username={draft.email_address}
 *       onValidityChange={(valid) => setStepValid((p) => ({ ...p, 2.5: valid }))}
 *     />
 *   ) : null}
 *
 * The live self-hosted onboarding flow today is OnboardingDashboard.tsx,
 * which reimplements provider selection and credentials inline rather than
 * reusing these Step*.tsx components — that flow does not yet call the
 * preflight endpoint. Wiring the check into the live flow is out of scope
 * here; see the Task 10 report for details.
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
