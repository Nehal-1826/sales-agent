import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { ChevronLeft, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import {
  AppDialog,
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import { MAILBOXES_KEY } from '@/features/mailboxes/api';
import { useCreateMailbox } from '@/features/mailboxes/useCreateMailbox';
import {
  AppPasswordHelp,
  type AppPasswordProvider,
} from '@/features/mailboxes/AppPasswordHelp';
import type { MailboxProvider } from '@/features/mailboxes/types';
import { env } from '@/lib/env';

interface AddMailboxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDERS: Array<{
  value: MailboxProvider;
  label: string;
  sub: string;
  oauth: boolean;
}> = [
  { value: 'gmail', label: 'Gmail / Workspace', sub: 'OAuth — recommended', oauth: true },
  { value: 'outlook', label: 'Outlook / Microsoft 365', sub: 'App password via SMTP', oauth: false },
  { value: 'yahoo', label: 'Yahoo Mail', sub: 'App password via SMTP', oauth: false },
  { value: 'smtp', label: 'Generic SMTP / IMAP', sub: 'Any provider', oauth: false },
];

// SMTP/IMAP host defaults per app-password provider — prefilled so the user
// doesn't have to hunt for the right hostnames. Mirrors the onboarding
// wizard's Step3Credentials defaults.
const SMTP_DEFAULTS: Partial<
  Record<MailboxProvider, { smtp_host: string; smtp_port: number; imap_host: string; imap_port: number }>
> = {
  outlook: { smtp_host: 'smtp.office365.com', smtp_port: 587, imap_host: 'outlook.office365.com', imap_port: 993 },
  yahoo: { smtp_host: 'smtp.mail.yahoo.com', smtp_port: 587, imap_host: 'imap.mail.yahoo.com', imap_port: 993 },
};

const smtpSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  smtp_host: z.string().min(3, 'SMTP host is required'),
  smtp_port: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1, 'Port is required').max(65535)),
  smtp_username: z.string().min(1, 'SMTP username is required'),
  smtp_password: z.string().min(1, 'SMTP password is required'),
  imap_host: z.string().min(3, 'IMAP host is required'),
  imap_port: z
    .union([z.number(), z.string()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1, 'Port is required').max(65535)),
});

type SmtpForm = z.infer<typeof smtpSchema>;

interface OAuthMessage {
  type: 'warmpulse:oauth';
  token: string;
  email: string;
}

function isOAuthMessage(data: unknown): data is OAuthMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'warmpulse:oauth' &&
    typeof (data as { token?: unknown }).token === 'string' &&
    typeof (data as { email?: unknown }).email === 'string'
  );
}

export function AddMailboxDialog({ open, onOpenChange }: AddMailboxDialogProps) {
  const qc = useQueryClient();
  const create = useCreateMailbox();

  const [step, setStep] = useState<0 | 1>(0);
  const [provider, setProvider] = useState<MailboxProvider>('gmail');
  const [showPw, setShowPw] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const form = useForm<SmtpForm>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      email: '',
      smtp_host: '',
      smtp_port: 587,
      smtp_username: '',
      smtp_password: '',
      imap_host: '',
      imap_port: 993,
    },
  });
  const emailValue = form.watch('email');

  useEffect(() => {
    // SMTP username defaults to the email address for every app-password
    // provider (generic SMTP, Yahoo, Outlook).
    if (
      (provider === 'smtp' || provider === 'yahoo' || provider === 'outlook') &&
      emailValue &&
      !form.getValues('smtp_username')
    ) {
      form.setValue('smtp_username', emailValue, { shouldValidate: false });
    }
  }, [emailValue, provider, form]);

  // Prefill SMTP/IMAP hosts when the user picks a known app-password provider
  // (Outlook / Yahoo). Runs only on provider change, so it never clobbers
  // values the user has started editing within the same provider.
  useEffect(() => {
    const d = SMTP_DEFAULTS[provider];
    if (!d) return;
    form.setValue('smtp_host', d.smtp_host, { shouldValidate: false });
    form.setValue('smtp_port', d.smtp_port, { shouldValidate: false });
    form.setValue('imap_host', d.imap_host, { shouldValidate: false });
    form.setValue('imap_port', d.imap_port, { shouldValidate: false });
  }, [provider, form]);

  const reset = () => {
    setStep(0);
    setProvider('gmail');
    setShowPw(false);
    setOauthError(null);
    form.reset();
    create.reset();
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const providerMeta = useMemo(() => PROVIDERS.find((p) => p.value === provider), [provider]);

  const submitSmtp = form.handleSubmit((values) => {
    create.mutate(
      {
        provider,
        email_address: values.email,
        daily_volume: 50,
        content_mode: 'A',
        smtp_host: values.smtp_host,
        smtp_port: Number(values.smtp_port),
        smtp_username: values.smtp_username,
        smtp_password: values.smtp_password,
        imap_host: values.imap_host,
        imap_port: Number(values.imap_port),
      },
      {
        onSuccess: () => {
          toast.success('Mailbox added — warmup starting.');
          qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
          qc.invalidateQueries({ queryKey: ['mailboxes', 'list'] });
          close(false);
        },
        onError: (err) => {
          // Surface the backend's reason (e.g. "SMTP login failed:
          // authentication_failed. Verify host/port (usually 587 or 465)…")
          // so the user knows whether to fix the app password vs. the host.
          const detail =
            err instanceof AxiosError
              ? (err.response?.data as { detail?: string } | undefined)?.detail
              : undefined;
          toast.error(detail ?? 'Failed to add mailbox');
        },
      },
    );
  });

  const startOAuth = () => {
    setOauthError(null);
    const base = env.VITE_API_BASE_URL.replace(/\/$/, '');
    const url = `${base}/auth/google/oauth-start?intent=mailbox&provider=${provider}`;
    const popup = window.open(url, 'warmpulse-oauth', 'width=520,height=640');
    if (!popup) {
      setOauthError('Popup blocked — allow popups to continue.');
      return;
    }
    const listener = (evt: MessageEvent) => {
      if (!isOAuthMessage(evt.data)) return;
      window.removeEventListener('message', listener);
      popup.close();
      create.mutate(
        {
          provider,
          email_address: evt.data.email,
          daily_volume: 50,
          content_mode: 'A',
          oauth_token: evt.data.token,
        },
        {
          onSuccess: () => {
            toast.success('Mailbox added — warmup starting.');
            qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
            qc.invalidateQueries({ queryKey: ['mailboxes', 'list'] });
            close(false);
          },
          onError: () => toast.error('Failed to finalize OAuth mailbox'),
        },
      );
    };
    window.addEventListener('message', listener);
    // Safety timeout — stop listening after 5 min.
    setTimeout(() => window.removeEventListener('message', listener), 5 * 60 * 1000);
  };

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>Add mailbox</AppDialogTitle>
          <p className="text-sm text-text-dim">
            {step === 0 ? 'Pick a provider to connect.' : `Connect your ${providerMeta?.label} account.`}
          </p>
        </AppDialogHeader>
        <AppDialogBody>
          {step === 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    setProvider(p.value);
                    setStep(1);
                  }}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-all',
                    'border-border-muted hover:border-accent/40 hover:bg-surface-2/60',
                    'focus-ring',
                  )}
                >
                  <Mail className="h-4 w-4 text-accent" />
                  <p className="font-medium">{p.label}</p>
                  <p className="text-xs text-text-dim">{p.sub}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {providerMeta?.oauth ? (
                <div className="rounded-lg border border-border-muted bg-surface-2/40 p-4">
                  <p className="text-sm font-medium">Connect with {providerMeta.label}</p>
                  <p className="mt-1 text-xs text-text-dim">
                    We request minimal read/send scopes. Tokens are Fernet-encrypted at rest.
                  </p>
                  <Button
                    type="button"
                    className="mt-3"
                    onClick={startOAuth}
                    disabled={create.isPending}
                    leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                  >
                    Connect Google
                  </Button>
                  {oauthError ? (
                    <p className="mt-2 text-xs text-accent3">{oauthError}</p>
                  ) : null}
                  <p className="mt-3 text-xs text-text-dim">
                    OAuth not available?{' '}
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() => setProvider('smtp')}
                    >
                      Use SMTP/IMAP instead
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <form onSubmit={submitSmtp} className="space-y-3">
                  <FormField
                    label="Email address"
                    htmlFor="add-email"
                    required
                    error={form.formState.errors.email?.message}
                  >
                    <Input
                      id="add-email"
                      type="email"
                      placeholder="you@yourdomain.com"
                      {...form.register('email')}
                    />
                  </FormField>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormField
                      label="SMTP host"
                      htmlFor="smtp-host"
                      required
                      error={form.formState.errors.smtp_host?.message}
                    >
                      <Input
                        id="smtp-host"
                        placeholder="smtp.example.com"
                        {...form.register('smtp_host')}
                      />
                    </FormField>
                    <FormField
                      label="SMTP port"
                      htmlFor="smtp-port"
                      required
                      error={form.formState.errors.smtp_port?.message}
                    >
                      <Input
                        id="smtp-port"
                        type="number"
                        {...form.register('smtp_port', { valueAsNumber: true })}
                      />
                    </FormField>
                    <FormField
                      label="SMTP username"
                      htmlFor="smtp-user"
                      required
                      error={form.formState.errors.smtp_username?.message}
                    >
                      <Input
                        id="smtp-user"
                        placeholder="defaults to email"
                        {...form.register('smtp_username')}
                      />
                    </FormField>
                    <FormField
                      label="SMTP password"
                      htmlFor="smtp-pw"
                      required
                      error={form.formState.errors.smtp_password?.message}
                    >
                      <div className="relative">
                        <Input
                          id="smtp-pw"
                          type={showPw ? 'text' : 'password'}
                          {...form.register('smtp_password')}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-dim hover:text-text focus-ring"
                          aria-label={showPw ? 'Hide password' : 'Show password'}
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="mt-2">
                        <AppPasswordHelp
                          provider={(provider === 'yahoo' ||
                          provider === 'outlook' ||
                          provider === 'smtp'
                            ? provider
                            : 'smtp') as AppPasswordProvider}
                        />
                      </div>
                    </FormField>
                    <FormField
                      label="IMAP host"
                      htmlFor="imap-host"
                      required
                      error={form.formState.errors.imap_host?.message}
                    >
                      <Input
                        id="imap-host"
                        placeholder="imap.example.com"
                        {...form.register('imap_host')}
                      />
                    </FormField>
                    <FormField
                      label="IMAP port"
                      htmlFor="imap-port"
                      required
                      error={form.formState.errors.imap_port?.message}
                    >
                      <Input
                        id="imap-port"
                        type="number"
                        {...form.register('imap_port', { valueAsNumber: true })}
                      />
                    </FormField>
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={create.isPending}
                    leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                  >
                    {create.isPending ? 'Adding…' : 'Add mailbox'}
                  </Button>
                </form>
              )}
            </div>
          )}
        </AppDialogBody>
        <AppDialogFooter>
          {step === 1 ? (
            <Button
              variant="ghost"
              onClick={() => setStep(0)}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
          )}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
