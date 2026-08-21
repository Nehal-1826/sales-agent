import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Mail,
  XCircle,
} from 'lucide-react';
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
import {
  MAILBOXES_KEY,
  useDetectProvider,
  useProbeCredentials,
  type ProviderDetection,
} from '@/features/mailboxes/api';
import { useCreateMailbox, useDnsCheck as useDnsCheckByEmail } from '@/features/mailboxes/useCreateMailbox';
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

/**
 * Dialog step machine.
 *   0 → provider pick
 *   1 → provider-specific connect (OAuth tile / SMTP form)
 *   2 → custom-domain wizard, step 1 of 3: domain (+ registrar quick-links)
 *   3 → custom-domain wizard, step 2 of 3: hosting preset + mailbox creds
 *   4 → custom-domain wizard, step 3 of 3: DNS check + fix records
 */
type DialogStep = 0 | 1 | 2 | 3 | 4;

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

// ---------------------------------------------------------------------------
// Custom-domain wizard constants
// ---------------------------------------------------------------------------

type HostingPreset = 'zoho' | 'google' | 'mxroute' | 'other';

const HOSTING_PRESETS: Array<{
  value: HostingPreset;
  label: string;
  hosts: { smtp_host: string; smtp_port: number; imap_host: string; imap_port: number };
}> = [
  {
    value: 'zoho',
    label: 'Zoho Mail',
    hosts: { smtp_host: 'smtp.zoho.com', smtp_port: 587, imap_host: 'imap.zoho.com', imap_port: 993 },
  },
  {
    value: 'google',
    label: 'Google Workspace',
    hosts: { smtp_host: 'smtp.gmail.com', smtp_port: 587, imap_host: 'imap.gmail.com', imap_port: 993 },
  },
  {
    value: 'mxroute',
    label: 'MXRoute',
    hosts: { smtp_host: 'mail.mxroute.com', smtp_port: 587, imap_host: 'mail.mxroute.com', imap_port: 993 },
  },
  {
    value: 'other',
    label: 'Other SMTP',
    hosts: { smtp_host: '', smtp_port: 587, imap_host: '', imap_port: 993 },
  },
];

/** Trim a pasted domain: drop scheme, path, and casing. */
function normalizeDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function registrarLinks(domain: string): Array<{ label: string; url: string }> {
  const d = encodeURIComponent(domain);
  return [
    { label: 'Namecheap', url: `https://www.namecheap.com/domains/registration/results/?domain=${d}` },
    { label: 'Cloudflare', url: `https://dash.cloudflare.com/?to=/:account/domains/register/${d}` },
    { label: 'GoDaddy', url: `https://www.godaddy.com/domainsearch/find?domainToCheck=${d}` },
  ];
}

/** clipboard API with a textarea fallback for non-secure contexts. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

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

  const [step, setStep] = useState<DialogStep>(0);
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

  // ----- Custom-domain wizard state -----
  const [domain, setDomain] = useState('');
  const [domainError, setDomainError] = useState<string | null>(null);
  const [hosting, setHosting] = useState<HostingPreset | null>(null);
  const [copiedFix, setCopiedFix] = useState<string | null>(null);

  const wizForm = useForm<SmtpForm>({
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
  const wizEmail = wizForm.watch('email');
  const probe = useProbeCredentials();
  const dnsCheck = useDnsCheckByEmail();
  // Fires once the email looks complete (has '@'). MX-based host detection —
  // region-specific Zoho hosts etc. win over the preset chips, but never
  // over fields the user has already edited.
  const detect = useDetectProvider(wizEmail.includes('@') ? wizEmail : null);
  const pendingDetect = useRef(false);

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

  // Same default for the wizard form.
  useEffect(() => {
    if (wizEmail && !wizForm.getValues('smtp_username')) {
      wizForm.setValue('smtp_username', wizEmail, { shouldValidate: false });
    }
  }, [wizEmail, wizForm]);

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

  const applyDetection = (d: ProviderDetection) => {
    const touched = wizForm.formState.touchedFields;
    if (d.smtp_host && !touched.smtp_host) {
      wizForm.setValue('smtp_host', d.smtp_host, { shouldValidate: false });
    }
    if (d.smtp_port && !touched.smtp_port) {
      wizForm.setValue('smtp_port', d.smtp_port, { shouldValidate: false });
    }
    if (d.imap_host && !touched.imap_host) {
      wizForm.setValue('imap_host', d.imap_host, { shouldValidate: false });
    }
    if (d.imap_port && !touched.imap_port) {
      wizForm.setValue('imap_port', d.imap_port, { shouldValidate: false });
    }
  };

  // If the detection query was still in flight at blur time, apply it the
  // moment it resolves.
  useEffect(() => {
    if (pendingDetect.current && detect.data) {
      applyDetection(detect.data);
      pendingDetect.current = false;
    }
  }, [detect.data, wizForm]);

  const onWizEmailBlur = () => {
    if (detect.data) {
      applyDetection(detect.data);
      pendingDetect.current = false;
    } else if (detect.isFetching || detect.isLoading) {
      pendingDetect.current = true;
    }
  };

  const applyHosting = (h: HostingPreset) => {
    setHosting(h);
    const p = HOSTING_PRESETS.find((x) => x.value === h);
    if (!p) return;
    wizForm.setValue('smtp_host', p.hosts.smtp_host, { shouldValidate: false });
    wizForm.setValue('smtp_port', p.hosts.smtp_port, { shouldValidate: false });
    wizForm.setValue('imap_host', p.hosts.imap_host, { shouldValidate: false });
    wizForm.setValue('imap_port', p.hosts.imap_port, { shouldValidate: false });
  };

  // Auto-run the DNS check as soon as the wizard lands on step 3 (DNS).
  useEffect(() => {
    if (step === 4 && wizEmail.includes('@') && dnsCheck.isIdle) {
      dnsCheck.mutate({ email_address: wizEmail.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const reset = () => {
    setStep(0);
    setProvider('gmail');
    setShowPw(false);
    setOauthError(null);
    form.reset();
    create.reset();
    setDomain('');
    setDomainError(null);
    setHosting(null);
    setCopiedFix(null);
    wizForm.reset();
    probe.reset();
    dnsCheck.reset();
    pendingDetect.current = false;
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

  const runWizProbe = wizForm.handleSubmit((values) => {
    probe.mutate({
      email_address: values.email.trim(),
      smtp_host: values.smtp_host.trim(),
      smtp_port: Number(values.smtp_port),
      smtp_username: values.smtp_username.trim() || values.email.trim(),
      smtp_password: values.smtp_password,
      imap_host: values.imap_host.trim() || null,
      imap_port: values.imap_port ? Number(values.imap_port) : null,
    });
  });

  const submitWizMailbox = wizForm.handleSubmit((values) => {
    create.mutate(
      {
        provider: 'smtp',
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
          toast.success('Mailbox added — checking your DNS next.');
          qc.invalidateQueries({ queryKey: MAILBOXES_KEY });
          qc.invalidateQueries({ queryKey: ['mailboxes', 'list'] });
          setStep(4);
        },
        onError: (err) => {
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

  const onCopyFix = async (record: string, text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedFix(record);
      toast.success(`${record.toUpperCase()} record copied.`);
      setTimeout(() => setCopiedFix((c) => (c === record ? null : c)), 2000);
    } else {
      toast.error('Copy failed — select the text manually.');
    }
  };

  const subtitle =
    step === 0
      ? 'Pick a provider to connect.'
      : step === 1
        ? `Connect your ${providerMeta?.label} account.`
        : step === 2
          ? 'Custom domain · Step 1 of 3 — your domain'
          : step === 3
            ? `Custom domain · Step 2 of 3 — mailbox at ${domain || 'your domain'}`
            : 'Custom domain · Step 3 of 3 — DNS records';

  const normDomain = normalizeDomain(domain);
  const domainReady = DOMAIN_RE.test(normDomain);
  const dns = dnsCheck.data;
  const dnsRows = dns
    ? [
        { key: 'spf', label: 'SPF', ok: dns.spf_valid },
        { key: 'dkim', label: 'DKIM', ok: dns.dkim_valid },
        { key: 'dmarc', label: 'DMARC', ok: dns.dmarc_valid },
      ]
    : [];

  return (
    <AppDialog open={open} onOpenChange={close}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>Add mailbox</AppDialogTitle>
          <p className="text-sm text-text-dim">{subtitle}</p>
        </AppDialogHeader>
        <AppDialogBody>
          {step === 0 ? (
            <div>
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
              {/* Custom-domain wizard entry — full-width below the tiles. */}
              <button
                type="button"
                onClick={() => setStep(2)}
                className={cn(
                  'mt-2 flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-all',
                  'border-border-muted hover:border-accent/40 hover:bg-surface-2/60',
                  'focus-ring',
                )}
              >
                <Globe className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Custom domain</span>
                  <span className="block text-xs text-text-dim">
                    Don&apos;t have a mailbox yet? Buy a domain, connect its mailbox, and verify DNS — guided.
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-text-dim" />
              </button>
            </div>
          ) : step === 1 ? (
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
          ) : step === 2 ? (
            /* ----- Wizard 1/3: domain (+ one-click registrar links) ----- */
            <div className="space-y-3">
              <FormField
                label="Your domain"
                htmlFor="wiz-domain"
                required
                error={domainError ?? undefined}
              >
                <Input
                  id="wiz-domain"
                  placeholder="yourdomain.com"
                  autoComplete="off"
                  value={domain}
                  onChange={(e) => {
                    setDomain(e.target.value);
                    if (domainError) setDomainError(null);
                  }}
                />
              </FormField>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-text-dim">Buy it in one click:</span>
                {registrarLinks(normDomain).map((r) =>
                  domainReady ? (
                    <a
                      key={r.label}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
                        'border-border-muted bg-surface-2 text-text hover:border-accent/40 hover:bg-surface-2/80',
                        'focus-ring',
                      )}
                    >
                      {r.label}
                      <ExternalLink className="h-3 w-3 text-text-dim" />
                    </a>
                  ) : (
                    <span
                      key={r.label}
                      aria-disabled="true"
                      title="Type a domain first"
                      className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-border-muted bg-surface-2/40 px-3 text-xs font-medium text-text-dim opacity-60"
                    >
                      {r.label}
                    </span>
                  ),
                )}
              </div>
              <p className="text-xs text-text-dim">
                Buy your domain in one click, then continue. Already own one? Just continue.
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  const d = normalizeDomain(domain);
                  if (!DOMAIN_RE.test(d)) {
                    setDomainError('Enter your domain, e.g. yourdomain.com');
                    return;
                  }
                  setDomainError(null);
                  setDomain(d);
                  setStep(3);
                }}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Continue
              </Button>
            </div>
          ) : step === 3 ? (
            /* ----- Wizard 2/3: hosting preset + mailbox credentials ----- */
            <form onSubmit={submitWizMailbox} className="space-y-3">
              <div>
                <p className="text-xs font-medium text-text-dim">Where is {domain || 'your domain'} hosted?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {HOSTING_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => applyHosting(p.value)}
                      className={cn(
                        'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-ring',
                        hosting === p.value
                          ? 'border-accent/50 bg-accent/10 text-accent'
                          : 'border-border-muted bg-surface-2 text-text-dim hover:border-accent/30 hover:text-text',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <FormField
                label="Email address"
                htmlFor="wiz-email"
                required
                error={wizForm.formState.errors.email?.message}
              >
                <Input
                  id="wiz-email"
                  type="email"
                  placeholder={`you@${domain || 'yourdomain.com'}`}
                  {...wizForm.register('email')}
                  onBlur={onWizEmailBlur}
                />
              </FormField>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  label="SMTP host"
                  htmlFor="wiz-smtp-host"
                  required
                  error={wizForm.formState.errors.smtp_host?.message}
                >
                  <Input
                    id="wiz-smtp-host"
                    placeholder="auto-detected from your email"
                    {...wizForm.register('smtp_host')}
                  />
                </FormField>
                <FormField
                  label="SMTP port"
                  htmlFor="wiz-smtp-port"
                  required
                  error={wizForm.formState.errors.smtp_port?.message}
                >
                  <Input
                    id="wiz-smtp-port"
                    type="number"
                    {...wizForm.register('smtp_port', { valueAsNumber: true })}
                  />
                </FormField>
                <FormField
                  label="SMTP username"
                  htmlFor="wiz-smtp-user"
                  required
                  error={wizForm.formState.errors.smtp_username?.message}
                >
                  <Input
                    id="wiz-smtp-user"
                    placeholder="defaults to email"
                    {...wizForm.register('smtp_username')}
                  />
                </FormField>
                <FormField
                  label="Password"
                  htmlFor="wiz-smtp-pw"
                  required
                  error={wizForm.formState.errors.smtp_password?.message}
                >
                  <div className="relative">
                    <Input
                      id="wiz-smtp-pw"
                      type={showPw ? 'text' : 'password'}
                      {...wizForm.register('smtp_password')}
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
                  <p className="mt-1 text-xs text-text-dim">
                    Use the app password / SMTP password your mail host generated.
                  </p>
                </FormField>
                <FormField
                  label="IMAP host"
                  htmlFor="wiz-imap-host"
                  required
                  error={wizForm.formState.errors.imap_host?.message}
                >
                  <Input
                    id="wiz-imap-host"
                    placeholder="auto-detected from your email"
                    {...wizForm.register('imap_host')}
                  />
                </FormField>
                <FormField
                  label="IMAP port"
                  htmlFor="wiz-imap-port"
                  required
                  error={wizForm.formState.errors.imap_port?.message}
                >
                  <Input
                    id="wiz-imap-port"
                    type="number"
                    {...wizForm.register('imap_port', { valueAsNumber: true })}
                  />
                </FormField>
              </div>
              {probe.data ? (
                <div className="rounded-lg border border-border-muted bg-surface-2/40 p-3 text-xs">
                  <p className={probe.data.smtp_ok ? 'text-accent' : 'text-accent3'}>
                    {probe.data.smtp_ok ? 'SMTP connection OK' : 'SMTP connection failed'}
                  </p>
                  <p className={probe.data.imap_ok ? 'text-accent' : 'text-accent3'}>
                    {probe.data.imap_ok ? 'IMAP connection OK' : 'IMAP connection failed'}
                  </p>
                  {probe.data.error ? (
                    <p className="mt-1 text-accent3">{probe.data.error}</p>
                  ) : null}
                </div>
              ) : null}
              {probe.isError ? (
                <p className="text-xs text-accent3">
                  Probe failed — check the host, port, and password.
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={probe.isPending}
                  onClick={() => void runWizProbe()}
                  leftIcon={probe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                >
                  {probe.isPending ? 'Testing…' : 'Test connection'}
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={create.isPending}
                  leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                >
                  {create.isPending ? 'Adding…' : 'Add mailbox'}
                </Button>
              </div>
            </form>
          ) : (
            /* ----- Wizard 3/3: DNS check + fix records ----- */
            <div className="space-y-3">
              {dnsCheck.isPending ? (
                <div className="flex items-center gap-2 text-sm text-text-dim">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking {domain || 'your domain'}&apos;s SPF, DKIM, and DMARC…
                </div>
              ) : dnsCheck.isError ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-accent3/30 bg-accent3/5 p-3 text-xs text-accent3">
                    DNS check failed — this can be a temporary resolver hiccup.
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => dnsCheck.mutate({ email_address: wizEmail.trim() })}
                      leftIcon={<Loader2 className="h-4 w-4" />}
                    >
                      Retry DNS check
                    </Button>
                    <Button type="button" variant="ghost" className="flex-1" onClick={() => close(false)}>
                      Skip for now
                    </Button>
                  </div>
                </div>
              ) : dns ? (
                <>
                  <div className="space-y-1.5">
                    {dnsRows.map((r) => (
                      <div key={r.key} className="flex items-center gap-2 text-sm">
                        {r.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-accent" />
                        ) : (
                          <XCircle className="h-4 w-4 text-accent3" />
                        )}
                        <span className="font-medium">{r.label}</span>
                        <span className={r.ok ? 'text-xs text-text-dim' : 'text-xs text-accent3'}>
                          {r.ok ? 'passing' : 'missing or invalid'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {dns.fixes && dns.fixes.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs text-text-dim">
                        Add these records at your DNS provider (usually under Advanced DNS):
                      </p>
                      {dns.fixes.map((f) => (
                        <div
                          key={f.record}
                          className="rounded-lg border border-border-muted bg-surface-2/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-text">
                              {f.record.toUpperCase()} — what to add
                            </p>
                            <button
                              type="button"
                              onClick={() => void onCopyFix(f.record, f.instructions)}
                              className="inline-flex items-center gap-1 rounded-md border border-border-muted bg-surface px-2 py-1 text-xs text-text-dim transition-colors hover:text-text focus-ring"
                            >
                              <Copy className="h-3 w-3" />
                              {copiedFix === f.record ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-bg/60 p-2 font-mono text-[11px] leading-relaxed text-text">
                            {f.instructions}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-dim">
                      All checks passed — nothing to add. Records can take up to 24-48h to
                      propagate; we re-check automatically.
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => close(false)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    Start warmup
                  </Button>
                </>
              ) : null}
            </div>
          )}
        </AppDialogBody>
        <AppDialogFooter>
          {step === 0 ? (
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
          ) : step === 1 || step === 2 ? (
            <Button
              variant="ghost"
              onClick={() => setStep(0)}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Back
            </Button>
          ) : step === 3 ? (
            <Button
              variant="ghost"
              onClick={() => setStep(2)}
              leftIcon={<ChevronLeft className="h-4 w-4" />}
            >
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => close(false)}>
              Skip for now
            </Button>
          )}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
