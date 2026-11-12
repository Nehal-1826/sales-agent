import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Loader2, Mail } from 'lucide-react';
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
import { Label } from '@/components/ui/Label';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import { cn } from '@/lib/cn';
import { useCreateMailbox, useDnsCheck } from './useCreateMailbox';
import type { MailboxProvider } from './api';

interface MailboxCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 0 | 1 | 2;

const PROVIDERS: Array<{ value: MailboxProvider; label: string; note: string }> = [
  { value: 'gmail', label: 'Gmail / Google Workspace', note: 'OAuth flow' },
  { value: 'outlook', label: 'Outlook / Microsoft 365', note: 'OAuth flow' },
  { value: 'yahoo', label: 'Yahoo Mail', note: 'App password' },
  { value: 'smtp', label: 'Custom SMTP/IMAP', note: 'Any provider' },
];

export function MailboxCreateDialog({ open, onOpenChange }: MailboxCreateDialogProps) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [provider, setProvider] = useState<MailboxProvider>('gmail');
  const [email, setEmail] = useState('');
  const [dailyVolume, setDailyVolume] = useState(50);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState<number | ''>(587);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState<number | ''>(993);

  const create = useCreateMailbox();
  const dnsCheck = useDnsCheck();

  const reset = () => {
    setStep(0);
    setProvider('gmail');
    setEmail('');
    setDailyVolume(50);
    setSmtpHost('');
    setSmtpPort(587);
    setSmtpPassword('');
    setImapHost('');
    setImapPort(993);
    create.reset();
    dnsCheck.reset();
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const canProceedStep0 = !!provider;
  const canProceedStep1 =
    !!email &&
    email.includes('@') &&
    (provider !== 'smtp' || (!!smtpHost && !!smtpPassword));

  const submit = () => {
    create.mutate(
      {
        provider,
        email_address: email,
        daily_volume: dailyVolume,
        content_mode: 'A',
        smtp_host: provider === 'smtp' ? smtpHost : null,
        smtp_port: provider === 'smtp' ? Number(smtpPort) || null : null,
        smtp_password: provider === 'smtp' ? smtpPassword : null,
        smtp_username: provider === 'smtp' ? email : null,
        imap_host: provider === 'smtp' ? imapHost || null : null,
        imap_port: provider === 'smtp' ? Number(imapPort) || null : null,
      },
      {
        onSuccess: () => {
          toast.success('Mailbox added');
          qc.invalidateQueries({ queryKey: ['mailboxes', 'list'] });
          handleClose(false);
        },
        onError: () => toast.error('Failed to add mailbox'),
      },
    );
  };

  const runVerify = () => {
    if (!email) return;
    dnsCheck.mutate({ email_address: email });
  };

  return (
    <AppDialog open={open} onOpenChange={handleClose}>
      <AppDialogContent className="max-w-xl">
        <AppDialogHeader>
          <AppDialogTitle>Add mailbox</AppDialogTitle>
          <div className="mt-3 flex items-center gap-2 text-xs text-text-dim">
            {(['Provider', 'Credentials', 'Verify'] as const).map((label, idx) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                    step === idx
                      ? 'border-accent bg-accent/10 text-accent'
                      : step > idx
                      ? 'border-accent bg-accent text-bg'
                      : 'border-border-muted',
                  )}
                >
                  {step > idx ? <Check className="h-3 w-3" /> : idx + 1}
                </span>
                <span className={cn(step === idx ? 'text-text' : '')}>{label}</span>
                {idx < 2 ? <span className="text-text-dim/40">—</span> : null}
              </div>
            ))}
          </div>
        </AppDialogHeader>

        <AppDialogBody>
          {step === 0 ? (
            <div className="space-y-3">
              <Label>Pick a provider</Label>
              <div className="grid grid-cols-1 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setProvider(p.value)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                      provider === p.value
                        ? 'border-accent bg-accent/5'
                        : 'border-border-muted hover:bg-surface-2',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-text-dim" />
                      <div>
                        <p className="font-medium">{p.label}</p>
                        <p className="text-xs text-text-dim">{p.note}</p>
                      </div>
                    </div>
                    {provider === p.value ? (
                      <Check className="h-4 w-4 text-accent" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="mb-email">Email address</Label>
                <Input
                  id="mb-email"
                  type="email"
                  placeholder="you@yourdomain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="mb-vol">Daily volume target</Label>
                <AppSelect
                  value={String(dailyVolume)}
                  onValueChange={(v) => setDailyVolume(Number(v))}
                >
                  <AppSelectTrigger id="mb-vol">
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {[25, 50, 100, 200].map((v) => (
                      <AppSelectItem key={v} value={String(v)}>
                        {v} / day cap
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </div>
              {provider === 'smtp' ? (
                <div className="space-y-3 rounded-lg border border-border-muted bg-surface-2/40 p-3">
                  <p className="text-xs font-medium text-text-dim">SMTP/IMAP login details</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="smtp-host">SMTP host</Label>
                      <Input
                        id="smtp-host"
                        placeholder="smtp.example.com"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtp-port">SMTP port</Label>
                      <Input
                        id="smtp-port"
                        type="number"
                        value={smtpPort}
                        onChange={(e) =>
                          setSmtpPort(e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="smtp-pass">SMTP password</Label>
                      <Input
                        id="smtp-pass"
                        type="password"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="imap-host">IMAP host</Label>
                      <Input
                        id="imap-host"
                        placeholder="imap.example.com"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="imap-port">IMAP port</Label>
                      <Input
                        id="imap-port"
                        type="number"
                        value={imapPort}
                        onChange={(e) =>
                          setImapPort(e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-text-dim">
                  For {provider}, you'll be sent to the provider's OAuth consent screen on save.
                </p>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <p className="text-sm text-text-dim">
                Verify your domain records (DNS) — SPF, DKIM, DMARC — for {email || 'your domain'}. Missing records can be
                fixed later, but warmup effectiveness depends on them.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={runVerify}
                disabled={dnsCheck.isPending}
                leftIcon={
                  dnsCheck.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
                }
              >
                Run DNS check
              </Button>
              {dnsCheck.data ? (
                <ul className="space-y-1 text-sm">
                  {(['spf_valid', 'dkim_valid', 'dmarc_valid'] as const).map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-bg',
                          dnsCheck.data?.[k] ? 'bg-accent' : 'bg-accent3',
                        )}
                      >
                        {dnsCheck.data?.[k] ? '✓' : '✕'}
                      </span>
                      {k.replace('_valid', '').toUpperCase()}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </AppDialogBody>

        <AppDialogFooter>
          <Button
            variant="ghost"
            onClick={() => (step > 0 ? setStep((s) => (s - 1) as Step) : handleClose(false))}
            leftIcon={step > 0 ? <ChevronLeft className="h-4 w-4" /> : undefined}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as Step)}
              disabled={(step === 0 && !canProceedStep0) || (step === 1 && !canProceedStep1)}
              rightIcon={<ChevronRight className="h-4 w-4" />}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={create.isPending}
              leftIcon={create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
            >
              {create.isPending ? 'Saving…' : 'Add mailbox'}
            </Button>
          )}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
