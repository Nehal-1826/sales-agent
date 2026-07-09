import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { useAuthStore } from '@/stores/auth';
import { clearOnboardingState } from '@/lib/onboardingState';
import {
  prefetchGoogleAuth,
  startGoogleSignIn,
  subscribeToGoogleAuth,
} from '@/lib/googleAuth';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

import { AuthCard } from '@/features/auth/AuthCard';
import { PasswordStrength } from '@/features/auth/PasswordStrength';
import {
  useSignup,
  getErrorStatus,
  parseFieldErrors,
} from '@/features/auth/useAuthApi';
import { signupSchema, type SignupFormValues } from '@/features/auth/schemas';

// All four tiers must be allow-listed — earlier this set was missing
// 'pro_plus' which silently dropped pro_plus pre-selection from the
// landing page CTA and shoved Pro Plus signups onto the Pro tier.
const VALID_PLANS = new Set(['starter', 'pro', 'pro_plus', 'agency']);
const PENDING_PLAN_KEY = 'warmpulse.pendingPlan';

export function SignupPage() {
  const t = useT();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const signup = useSignup();

  const planParam = searchParams.get('plan');
  const preselectedPlan = planParam && VALID_PLANS.has(planParam) ? planParam : null;

  // Persist the plan across the signup → plan-picker hop. The plan picker page
  // (onboarding wizard step "plan") can read this from sessionStorage.
  useEffect(() => {
    if (preselectedPlan) {
      sessionStorage.setItem(PENDING_PLAN_KEY, preselectedPlan);
    }
  }, [preselectedPlan]);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '' },
  });

  const password = watch('password') ?? '';

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setEmailTaken(false);
    try {
      await signup.mutateAsync({
        email: values.email,
        password: values.password,
        plan: preselectedPlan,
      });
      clearOnboardingState();
      // Don't log them in yet — they must verify email first.
      navigate(`/verify-email-pending?email=${encodeURIComponent(values.email)}`);
    } catch (err) {
      const status = getErrorStatus(err);
      if (status === 409) {
        const msg = t('auth.signup.emailAlreadyRegistered');
        setSubmitError(msg);
        setEmailTaken(true);
        setError('email', { type: 'server', message: msg });
        return;
      }
      if (status === 422) {
        const fieldErrors = parseFieldErrors(err);
        let handled = false;
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field === 'email' || field === 'password') {
            setError(field, { type: 'server', message });
            handled = true;
          }
        }
        if (!handled) setSubmitError(t('auth.signup.reviewForm'));
        return;
      }
      const message =
        err instanceof AxiosError && typeof err.response?.data === 'object'
          ? ((err.response?.data as { message?: string; detail?: string } | undefined)?.message ??
             (err.response?.data as { message?: string; detail?: string } | undefined)?.detail ??
             null)
          : null;
      const fallback = message ?? t('auth.signup.somethingWrong');
      setSubmitError(fallback);
      toast.error(fallback);
    }
  });

  // Shared post-Firebase-auth handler: exchange ID token with our backend,
  // store tokens, and navigate. Used by both the initial click (redirect kickoff)
  // and the on-mount handler that completes the redirect.
  const completeFirebaseAuth = async (idToken: string) => {
    const res = await api.post('/auth/firebase', { id_token: idToken });
    const data = res.data as {
      tokens: { access_token: string; refresh_token: string };
      user: any;
    };
    clearOnboardingState();
    setTokens({
      accessToken: data.tokens.access_token,
      refreshToken: data.tokens.refresh_token,
    });
    setUser({
      id: data.user.id,
      email: data.user.email,
      name: data.user.email.split('@')[0],
      role: data.user.role,
      workspace_id: data.user.workspace_id,
      onboarding_status: data.user.onboarding_status,
      plan: data.user.plan ?? null,
      email_verified: data.user.email_verified ?? true,
    });
    navigate('/onboarding');
  };

  const [googleSigningIn, setGoogleSigningIn] = useState(false);

  // Shared completion handler — exchanges the Firebase ID token for our
  // JWT pair. Used by BOTH the popup-success path (called synchronously
  // from handleGoogleSignup) and the redirect-return path (called from
  // the subscribe-at-mount listener). Pulled out so the popup path can
  // skip the `onAuthStateChanged` round-trip entirely.
  const completeGoogleAuth = async (firebaseUser: import('firebase/auth').User) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      await completeFirebaseAuth(idToken);
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('[GoogleSignup] backend exchange failed:', err);
      const e = err as { code?: string; response?: { status?: number; data?: { detail?: string; message?: string } }; message?: string };
      const code = e?.code ?? e?.response?.status;
      const detail = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? 'Please try again.';
      setSubmitError(`${t('auth.signup.googleSignUpFailed')}${code ? ` (${code})` : ''}: ${detail}`);
      throw err;
    } finally {
      setGoogleSigningIn(false);
    }
  };

  // Subscribe ONLY for the redirect-return path. `subscribeToGoogleAuth`
  // short-circuits to a no-op when no PENDING_KEY is set, so a casual
  // /signup visit never pays the ~80 KB Firebase SDK parse cost.
  useEffect(() => {
    const unsub = subscribeToGoogleAuth(completeGoogleAuth);
    return unsub;
  }, []);

  const handleGoogleSignup = async () => {
    setSubmitError(null);
    setGoogleSigningIn(true);
    try {
      const result = await startGoogleSignIn();
      if (result.outcome === 'cancelled') {
        // User closed the popup before picking an account. No listener
        // will ever fire to clear the spinner — so we reset it here.
        setGoogleSigningIn(false);
        return;
      }
      if (result.outcome === 'popup-success') {
        // Popup resolved with the Firebase user — finish synchronously
        // without bouncing through `onAuthStateChanged`. Saves one
        // IndexedDB-hydration + listener-fire round-trip per sign-in.
        await completeGoogleAuth(result.user);
        return;
      }
      // 'redirect-in-flight': page is about to navigate to Google. The
      // mount-listener picks up the return.
    } catch (err: unknown) {
      setGoogleSigningIn(false);
      // eslint-disable-next-line no-console
      console.error('[GoogleSignup] start failed:', err);
      const e = err as { code?: string; message?: string };
      setSubmitError(`${t('auth.signup.googleSignUpFailed')}${e?.code ? ` (${e.code})` : ''}: ${e?.message ?? 'Please try again.'}`);
      toast.error(t('auth.signup.googleSignUpFailed'), { description: e?.message ?? 'Please try again.' });
    }
  };

  const pending = isSubmitting || signup.isPending;

  return (
    <AuthCard
        heading={t('auth.signup.heading')}
        subheading={t('auth.signup.subheading')}
        social={
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignup}
            isLoading={googleSigningIn}
            // Idle-time prefetch — kick off the Firebase chunk fetch the
            // moment the user signals intent (hover/focus). By the time
            // they click, the SDK is already in the module cache.
            onMouseEnter={prefetchGoogleAuth}
            onFocus={prefetchGoogleAuth}
          >
            {googleSigningIn ? t('auth.signup.googleSigningIn') : t('auth.signup.googleButton')}
          </Button>
        }
        footer={
          <>
            {t('auth.signup.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-accent hover:underline">
              {t('auth.signup.loginLink')}
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {preselectedPlan ? (
            <div className="rounded-lg border border-border-muted bg-surface-2 px-3 py-2 text-xs text-text-dim">
              {t('auth.signup.planPreselected')}{' '}
              <span className="text-text capitalize">{preselectedPlan}</span>
            </div>
          ) : null}

          <FormField
            label={t('auth.signup.workEmailLabel')}
            htmlFor="signup-email"
            error={errors.email?.message}
          >
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              invalid={!!errors.email}
              autoFocus
              {...register('email')}
            />
          </FormField>

          <div className="space-y-2">
            <FormField
              label={t('auth.signup.passwordLabel')}
              htmlFor="signup-password"
              hint={errors.password ? undefined : t('auth.signup.passwordHint')}
              error={errors.password?.message}
            >
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                invalid={!!errors.password}
                {...register('password')}
              />
            </FormField>
            <PasswordStrength password={password} />
          </div>

          {submitError && !errors.email ? (
            <p className="text-xs text-accent3" role="alert">
              {submitError}{' '}
              {emailTaken ? (
                <Link to="/login" className="underline">
                  {t('auth.signup.loginLink')}
                </Link>
              ) : null}
            </p>
          ) : null}

          <Button type="submit" className="w-full" isLoading={pending}>
            {pending ? t('auth.signup.creatingAccount') : t('auth.signup.createAccount')}
          </Button>
        </form>
      </AuthCard>
  );
}
