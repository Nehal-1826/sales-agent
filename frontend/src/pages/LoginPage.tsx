import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
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
import { TotpDialog } from '@/features/auth/TotpDialog';
import {
  useLogin,
  getErrorStatus,
  isTotpRequiredError,
  parseFieldErrors,
} from '@/features/auth/useAuthApi';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas';

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUser = useAuthStore((s) => s.setUser);
  const login = useLogin();

  const [requiresTotp, setRequiresTotp] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Google-mode TOTP: when the Firebase exchange comes back 403 (2FA
  // required), we stash the Firebase ID token and re-open the same TOTP
  // dialog in "google" mode so it re-exchanges instead of re-running the
  // password mutation.
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [googleTotpPending, setGoogleTotpPending] = useState(false);
  const [googleTotpError, setGoogleTotpError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', totp_code: '' },
  });


  const [googleSigningIn, setGoogleSigningIn] = useState(false);

  // Shared completion handler — exchanges the Firebase ID token for our
  // JWT pair and routes the user. Used by BOTH the popup-success path
  // (called directly from handleGoogleClick) and the redirect-return
  // path (called via the subscribe-at-mount listener). Pulled out of the
  // subscriber so the popup case can short-circuit `onAuthStateChanged`
  // entirely — saving the IndexedDB-hydration round-trip on every login.
  // Stores the user + tokens from a successful /auth/firebase response and
  // routes onward. Shared by the first-attempt path and the google-mode
  // TOTP re-exchange.
  const applyGoogleAuthData = async (data: {
    tokens: { access_token: string; refresh_token: string };
    user: any;
  }) => {
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
    await routeAfterLogin();
  };

  const completeGoogleAuth = async (firebaseUser: import('firebase/auth').User) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      try {
        const res = await api.post('/auth/firebase', { id_token: idToken });
        await applyGoogleAuthData(
          res.data as {
            tokens: { access_token: string; refresh_token: string };
            user: any;
          },
        );
      } catch (err: unknown) {
        if (isTotpRequiredError(err)) {
          // 2FA required — stash the ID token and front the TOTP dialog in
          // google mode. NOT a failure.
          setGoogleIdToken(idToken);
          setGoogleTotpError(null);
          setRequiresTotp(true);
          toast.info(t('auth.login.twoFactorRequired'));
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('[GoogleLogin] backend exchange failed:', err);
      const e = err as { code?: string; response?: { status?: number; data?: { detail?: string; message?: string } }; message?: string };
      const code = e?.code ?? e?.response?.status;
      const detail = e?.response?.data?.detail ?? e?.response?.data?.message ?? e?.message ?? 'Please try again.';
      setSubmitError(`${t('auth.login.googleSignInFailed')}${code ? ` (${code})` : ''}: ${detail}`);
      throw err;
    } finally {
      setGoogleSigningIn(false);
    }
  };

  // Google-mode TOTP submit — re-exchange the stashed Firebase ID token,
  // this time with the 6-digit code attached.
  const submitGoogleTotp = async (code: string) => {
    if (!googleIdToken) return;
    setGoogleTotpError(null);
    setGoogleTotpPending(true);
    try {
      const res = await api.post('/auth/firebase', {
        id_token: googleIdToken,
        totp_code: code,
      });
      setRequiresTotp(false);
      setGoogleIdToken(null);
      toast.success(t('auth.login.signedIn'));
      await applyGoogleAuthData(
        res.data as {
          tokens: { access_token: string; refresh_token: string };
          user: any;
        },
      );
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string; message?: string } } };
      const detail = e?.response?.data?.detail ?? e?.response?.data?.message ?? '';
      setGoogleTotpError(detail || 'Invalid code. Please try again.');
    } finally {
      setGoogleTotpPending(false);
    }
  };

  // Subscribe ONLY for the redirect-return path. The helper internally
  // checks PENDING_KEY and short-circuits to a no-op (skipping the
  // ~80 KB Firebase SDK parse + IndexedDB hydration) when no sign-in is
  // in flight. Popup completions take the synchronous path inside
  // handleGoogleClick below, never touching this listener.
  useEffect(() => {
    const unsub = subscribeToGoogleAuth(completeGoogleAuth);
    return unsub;
  }, []);

  const handleGoogleClick = async () => {
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
        // Popup resolved with the Firebase user — run the backend
        // exchange synchronously without bouncing through the
        // `onAuthStateChanged` listener. That listener still has to
        // exist for the redirect-return path, but on the (much faster)
        // popup path we save an IndexedDB hydration + listener fire.
        await completeGoogleAuth(result.user);
        return;
      }
      // 'redirect-in-flight': page is navigating to Google. When we
      // come back to /login, the subscribe-at-mount listener picks up
      // via PENDING_KEY + onAuthStateChanged and clears the spinner
      // in completeGoogleAuth's finally.
    } catch (err: unknown) {
      setGoogleSigningIn(false);
      // eslint-disable-next-line no-console
      console.error('[GoogleLogin] start failed:', err);
      const e = err as { code?: string; message?: string };
      setSubmitError(`${t('auth.login.googleSignInFailed')}${e?.code ? ` (${e.code})` : ''}: ${e?.message ?? 'Please try again.'}`);
    }
  };

  const routeAfterLogin = async () => {
    // The user object is already in the store from the /auth/firebase
    // response that called setUser() right before this. Skip the extra
    // /auth/me round-trip on the hot path — it was costing 300-500ms of
    // perceived latency on Google login. We do fire it as a background
    // refresh (no await) so any server-side fields we didn't unpack into
    // the store get hydrated lazily before the next render that needs them.
    const user = useAuthStore.getState().user;
    void api.get('/auth/me').then((me) => {
      if (me.data) setUser(me.data as typeof user);
    }).catch(() => {
      /* non-fatal background refresh */
    });

    const from = (location.state as { from?: string } | null)?.from;
    if (user?.onboarding_status === 'active') {
      if (user.role === 'super_admin') {
        navigate(from && from.startsWith('/admin') ? from : '/admin');
      } else {
        navigate(from && from.startsWith('/app') ? from : '/app');
      }
    } else {
      navigate('/onboarding');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    // If the server has told us 2FA is required, enforce a 6-digit code client-side.
    if (requiresTotp && !/^\d{6}$/.test(values.totp_code ?? '')) {
      setError('totp_code', {
        type: 'manual',
        message: t('auth.login.totpValidation'),
      });
      return;
    }

    try {
      const data = await login.mutateAsync({
        email: values.email,
        password: values.password,
        totp_code: requiresTotp ? values.totp_code : undefined,
      });
      clearOnboardingState();
      setTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      setUser(data.user);
      toast.success(t('auth.login.signedIn'));
      await routeAfterLogin();
    } catch (err) {
      if (isTotpRequiredError(err)) {
        setRequiresTotp(true);
        toast.info(t('auth.login.twoFactorRequired'));
        return;
      }
      const status = getErrorStatus(err);
      if (status === 401) {
        const msg = t('auth.login.incorrectCredentials');
        setSubmitError(msg);
        return;
      }
      if (status === 403) {
        const data =
          err instanceof AxiosError
            ? (err.response?.data as { message?: string; detail?: string } | undefined)
            : undefined;
        const detail = data?.detail ?? data?.message ?? '';
        if (detail === 'email_not_verified') {
          // Redirect to a dedicated "check your email" page with the email pre-filled
          navigate(`/verify-email-pending?email=${encodeURIComponent(values.email)}`);
          return;
        }
        const msg = detail || t('auth.login.accessDenied');
        setSubmitError(msg);
        toast.error(msg);
        return;
      }
      if (status === 422) {
        const fieldErrors = parseFieldErrors(err);
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field === 'email' || field === 'password' || field === 'totp_code') {
            setError(field, { type: 'server', message });
          }
        }
        return;
      }
      const message =
        err instanceof AxiosError && typeof err.response?.data === 'object'
          ? ((err.response?.data as { message?: string; detail?: string } | undefined)?.message ??
             (err.response?.data as { message?: string; detail?: string } | undefined)?.detail ??
             null)
          : null;
      const fallback = message ?? t('auth.login.signInFailed');
      setSubmitError(fallback);
      toast.error(fallback);
    }
  });

  const pending = isSubmitting || login.isPending;

  return (
    <>
      <AuthCard
        variant="login"
        heading={t('auth.login.heading')}
        subheading={
          requiresTotp
            ? t('auth.login.subheadingTotp')
            : t('auth.login.subheadingNormal')
        }
        social={
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleClick}
            isLoading={googleSigningIn}
            // Idle-time prefetch — start downloading the Firebase chunk
            // the moment the user signals intent (hover/focus). By the
            // time they actually click, the SDK is already in the module
            // cache, so the popup opens with no extra parse delay.
            onMouseEnter={prefetchGoogleAuth}
            onFocus={prefetchGoogleAuth}
          >
            {googleSigningIn ? t('auth.login.googleSigningIn') : t('auth.login.googleButton')}
          </Button>
        }
        footer={
          <>
            {t('auth.login.noAccount')}{' '}
            <Link to="/signup" className="text-accent hover:underline">
              {t('auth.login.signupLink')}
            </Link>
          </>
        }
      >
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            label={t('auth.login.emailLabel')}
            htmlFor="login-email"
            error={errors.email?.message}
          >
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              invalid={!!errors.email}
              disabled={requiresTotp}
              autoFocus={!requiresTotp}
              {...register('email')}
            />
          </FormField>

          <FormField
            label={t('auth.login.passwordLabel')}
            htmlFor="login-password"
            error={errors.password?.message}
          >
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              invalid={!!errors.password}
              disabled={requiresTotp}
              {...register('password')}
            />
          </FormField>

          <div className="flex items-center justify-end text-xs">
            <a
              href="mailto:support@warmpulse.app?subject=Password%20reset"
              className="text-text-dim hover:text-text"
            >
              {t('auth.login.forgotPassword')}
            </a>
          </div>

          {submitError ? (
            <p className="text-xs text-accent3" role="alert">
              {submitError}
            </p>
          ) : null}

          <Button type="submit" className="w-full" isLoading={pending}>
            {pending ? t('auth.login.signingIn') : t('auth.login.signIn')}
          </Button>
        </form>
      </AuthCard>

      {/* TOTP modal — fronted after the password 403. Calls the same
          handleSubmit so the auto-submit on 6-digit completion just
          re-runs the login mutation with the totp_code attached. */}
      <Controller
        name="totp_code"
        control={control}
        render={({ field }) => (
          <TotpDialog
            open={requiresTotp}
            onOpenChange={(next) => {
              if (!next) {
                setRequiresTotp(false);
                field.onChange('');
                // Clear google-mode state so a later password 2FA reuses a
                // clean dialog.
                setGoogleIdToken(null);
                setGoogleTotpError(null);
              }
            }}
            value={field.value ?? ''}
            onChange={(v) => {
              field.onChange(v);
              if (googleIdToken) setGoogleTotpError(null);
            }}
            onSubmit={() => {
              if (googleIdToken) {
                void submitGoogleTotp(field.value ?? '');
              } else {
                onSubmit();
              }
            }}
            pending={googleIdToken ? googleTotpPending : pending}
            error={
              googleIdToken
                ? googleTotpError
                : errors.totp_code?.message ?? null
            }
          />
        )}
      />
    </>
  );
}
