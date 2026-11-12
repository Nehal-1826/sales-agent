import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AppDialog,
  AppDialogContent,
  AppDialogTrigger,
  AppDialogHeader,
  AppDialogTitle,
  AppDialogDescription,
  AppDialogBody,
  AppDialogFooter,
  AppDialogStepper,
} from '@/components/ui/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import {
  AppSelect,
  AppSelectTrigger,
  AppSelectContent,
  AppSelectItem,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { toast } from '@/components/ui/AppToast';
import { useCreatePeerInbox } from '@/features/admin/api';

interface AddPeerInboxDialogProps {
  trigger: ReactNode;
}

// UI provider list — labels are human-readable; the wire value is whatever
// the backend's PeerProviderEnum accepts. The mapping in `useCreatePeerInbox`
// rewrites these to backend slugs (google_workspace → google_ws etc.).
const PROVIDERS: { value: string; label: string; smtp: string; imap: string }[] = [
  { value: 'google_workspace', label: 'Gmail / Workspace', smtp: 'smtp.gmail.com', imap: 'imap.gmail.com' },
  { value: 'office365', label: 'Office 365', smtp: 'smtp.office365.com', imap: 'outlook.office365.com' },
  { value: 'yahoo', label: 'Yahoo', smtp: 'smtp.mail.yahoo.com', imap: 'imap.mail.yahoo.com' },
];

export function AddPeerInboxDialog({ trigger }: AddPeerInboxDialogProps) {
  const [open, setOpen] = useState(false);
  // Two-step wizard: 0 = identity (Email, Provider, Daily cap),
  // 1 = credentials (SMTP + IMAP). Each step fits inside the dialog's
  // bounded height without internal scroll.
  const [step, setStep] = useState<0 | 1>(0);
  const [email, setEmail] = useState('');
  const [provider, setProvider] = useState<string>('google_workspace');
  const [capacity, setCapacity] = useState(40);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');

  const create = useCreatePeerInbox();

  function resetForm() {
    setStep(0);
    setEmail('');
    setSmtpHost('');
    setSmtpUser('');
    setSmtpPassword('');
    setImapHost('');
    setImapUser('');
    setImapPassword('');
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset to step 0 on close so reopening always starts fresh.
      setStep(0);
    }
  }

  function goNext() {
    // Identity-step validation: only the email is truly required at this
    // stage; SMTP creds are validated in submit() on step 2.
    if (!email.trim()) {
      toast.error('Email is required.');
      return;
    }
    setStep(1);
  }

  // Auto-fill SMTP/IMAP host placeholders from the selected provider so
  // operators don't have to remember the standard endpoints.
  const defaults = useMemo(
    () => PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0]!,
    [provider],
  );

  async function submit() {
    if (!email) {
      toast.error('Email is required.');
      return;
    }
    if (!smtpPassword) {
      toast.error('SMTP / app password is required.');
      return;
    }
    try {
      await create.mutateAsync({
        email,
        provider,
        daily_capacity: capacity,
        // Fall back to provider defaults when the operator left a host
        // blank — saves a lot of "smtp.gmail.com" typing.
        smtp_host: smtpHost.trim() || defaults.smtp,
        smtp_port: smtpPort,
        smtp_username: smtpUser.trim() || email,
        smtp_password: smtpPassword,
        imap_host: imapHost.trim() || defaults.imap,
        imap_port: imapPort,
        imap_username: imapUser.trim() || email,
        // Most providers (Gmail, Yahoo) accept the same app password for
        // SMTP and IMAP. Allow the operator to override when they don't.
        imap_password: imapPassword || smtpPassword,
      });
      toast.success(`Test account ${email} created.`);
      setOpen(false);
      resetForm();
    } catch (err) {
      // Surface the validation detail when the backend returns 422 so the
      // operator can see exactly which field tripped.
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      const msg =
        Array.isArray(detail)
          ? detail
              .map((d: { loc?: string[]; msg?: string }) =>
                `${(d.loc ?? []).join('.')}: ${d.msg}`,
              )
              .join('; ')
          : typeof detail === 'string'
            ? detail
            : err instanceof Error
              ? err.message
              : 'Failed to create test account';
      toast.error(msg);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={handleOpenChange}>
      <AppDialogTrigger asChild>{trigger}</AppDialogTrigger>
      {/* Two-step wizard. Step 0 is a compact identity-only popup; step 1
          is the wider credentials popup (max-w-2xl) where SMTP + IMAP
          fieldsets sit side-by-side. Each step fits in the bounded
          dialog without internal scroll. */}
      <AppDialogContent className={step === 0 ? 'max-w-md' : 'max-w-2xl'}>
        <AppDialogStepper steps={['Identity', 'Login details']} current={step} />

        <AppDialogHeader>
          <AppDialogTitle>
            {step === 0 ? 'Add test account · identity' : 'Add test account · login details'}
          </AppDialogTitle>
          <AppDialogDescription>
            {step === 0
              ? 'Pick the provider and set the daily warmup limit for this helper mailbox.'
              : 'Login details are encrypted at rest with Fernet before storage. Use an app password — most providers reject regular account passwords for SMTP/IMAP.'}
          </AppDialogDescription>
        </AppDialogHeader>

        <AppDialogBody>
          {step === 0 ? (
            // -------- Step 1: Identity --------
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Email" required className="col-span-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="warmer@example.com"
                  autoFocus
                />
              </FormField>
              <FormField label="Provider" required>
                <AppSelect value={provider} onValueChange={setProvider}>
                  <AppSelectTrigger>
                    <AppSelectValue />
                  </AppSelectTrigger>
                  <AppSelectContent>
                    {PROVIDERS.map((p) => (
                      <AppSelectItem key={p.value} value={p.value}>
                        {p.label}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelect>
              </FormField>
              <FormField label="Daily limit" required>
                <Input
                  type="number"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value) || 0)}
                />
              </FormField>
            </div>
          ) : (
            // -------- Step 2: Credentials --------
            // SMTP + IMAP fieldsets side-by-side on md+, stacked below.
            // Each block has an accent legend so the operator scans to
            // the right protocol fast.
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <fieldset className="rounded-lg border border-border-muted/70 bg-surface-2/30 p-4">
                <legend className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                  SMTP · outgoing
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Host" className="col-span-1">
                    <Input
                      value={smtpHost}
                      onChange={(e) => setSmtpHost(e.target.value)}
                      placeholder={defaults.smtp}
                    />
                  </FormField>
                  <FormField label="Port" className="col-span-1">
                    <Input
                      type="number"
                      value={smtpPort}
                      onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                    />
                  </FormField>
                  <FormField label="Username" className="col-span-2">
                    <Input
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                      placeholder="(defaults to email)"
                    />
                  </FormField>
                  <FormField label="App password" required className="col-span-2">
                    <Input
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder="16-char app password"
                      autoFocus
                    />
                  </FormField>
                </div>
              </fieldset>

              <fieldset className="rounded-lg border border-border-muted/70 bg-surface-2/30 p-4">
                <legend className="px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent">
                  IMAP · incoming
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Host" className="col-span-1">
                    <Input
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      placeholder={defaults.imap}
                    />
                  </FormField>
                  <FormField label="Port" className="col-span-1">
                    <Input
                      type="number"
                      value={imapPort}
                      onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                    />
                  </FormField>
                  <FormField label="Username" className="col-span-2">
                    <Input
                      value={imapUser}
                      onChange={(e) => setImapUser(e.target.value)}
                      placeholder="(defaults to email)"
                    />
                  </FormField>
                  <FormField label="App password" className="col-span-2">
                    <Input
                      type="password"
                      value={imapPassword}
                      onChange={(e) => setImapPassword(e.target.value)}
                      placeholder="(defaults to SMTP password)"
                    />
                  </FormField>
                </div>
              </fieldset>
            </div>
          )}
        </AppDialogBody>

        <AppDialogFooter>
          {step === 0 ? (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={goNext} disabled={!email.trim()}>
                Next →
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(0)} disabled={create.isPending}>
                ← Back
              </Button>
              <Button disabled={create.isPending || !smtpPassword} onClick={submit}>
                {create.isPending ? 'Saving…' : 'Add inbox'}
              </Button>
            </>
          )}
        </AppDialogFooter>
      </AppDialogContent>
    </AppDialog>
  );
}
