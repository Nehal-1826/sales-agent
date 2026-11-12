import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { TourModal } from './TourModal';
import { AcademyModal } from './AcademyModal';
import {
  GraduationCap,
  Bell,
  Clock,
  History,
  KeyRound,
  Loader2,
  PlayCircle,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { useMe } from '@/features/auth/useAuthApi';
import {
  AppTabs,
  AppTabsContent,
  AppTabsList,
  AppTabsTrigger,
} from '@/components/ui/AppTabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { AppSwitch } from '@/components/ui/AppSwitch';
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from '@/components/ui/AppSelect';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { toast } from '@/components/ui/AppToast';
import { StackedBarChartWp } from '@/components/charts/recharts/StackedBarChartWp';
import { ChartContainer } from '@/components/charts/ChartContainer';
import {
  useActivityFeedInfinite,
  useActivityStackedBar,
} from '@/features/activity/api';
import type { ActivityAction, ActivityItem } from '@/features/activity/types';
import {
  useChangePassword,
  useDisableTotp,
  useEnableTotp,
  useReplayTour,
  useUpdateNotifications,
  useUpdateProfile,
  useUserSettings,
  useVerifyTotp,
  useWorkspaceProfile,
  type TotpEnrollment,
} from './api';
import { formatDateTime } from '@/lib/format';

/**
 * Settings tabs — Profile, Notifications, Security (2FA + password), Timezone,
 * Activity Log, Tour Replay. Data is fetched once at the top and passed down.
 */
export function SettingsTabs() {
  const settings = useUserSettings();

  return (
    <AppTabs defaultValue="profile" className="space-y-6">
      <AppTabsList className="flex flex-wrap">
        <AppTabsTrigger value="profile">
          <User className="mr-1.5 h-3.5 w-3.5" /> Profile
        </AppTabsTrigger>
        <AppTabsTrigger value="notifications">
          <Bell className="mr-1.5 h-3.5 w-3.5" /> Notifications
        </AppTabsTrigger>
        <AppTabsTrigger value="security">
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Security
        </AppTabsTrigger>
        <AppTabsTrigger value="timezone">
          <Clock className="mr-1.5 h-3.5 w-3.5" /> Timezone
        </AppTabsTrigger>
        <AppTabsTrigger value="activity">
          <History className="mr-1.5 h-3.5 w-3.5" /> Activity Log
        </AppTabsTrigger>
        <AppTabsTrigger value="tour">
          <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Tour
        </AppTabsTrigger>
      </AppTabsList>

      <AppTabsContent value="profile">
        <ProfilePanel
          isLoading={settings.isLoading}
          isError={settings.isError}
          profile={settings.data?.profile}
        />
      </AppTabsContent>
      <AppTabsContent value="notifications">
        <NotificationsPanel
          isLoading={settings.isLoading}
          isError={settings.isError}
          notifications={settings.data?.notifications}
        />
      </AppTabsContent>
      <AppTabsContent value="security">
        <SecurityPanel
          isLoading={settings.isLoading}
          isError={settings.isError}
          totpEnabled={settings.data?.security.totp_enabled ?? false}
        />
      </AppTabsContent>
      <AppTabsContent value="timezone">
        <TimezonePanel
          isLoading={settings.isLoading}
          isError={settings.isError}
          profile={settings.data?.profile}
        />
      </AppTabsContent>
      <AppTabsContent value="activity">
        <ActivityLogPanel />
      </AppTabsContent>
      <AppTabsContent value="tour">
        <TourPanel tourCompletedAt={settings.data?.tour.completed_at ?? null} />
      </AppTabsContent>
    </AppTabs>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfilePanel({
  isLoading,
  isError,
  profile,
}: {
  isLoading: boolean;
  isError: boolean;
  profile?: { email: string; display_name: string; timezone: string; locale: string };
}) {
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState('');
  const [locale, setLocale] = useState('en-US');

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setLocale(profile.locale);
    }
  }, [profile]);

  if (isLoading) return <PanelSkeleton />;
  if (isError)
    return (
      <EmptyState
        title="Couldn't load your profile"
        description="Try refreshing. If the issue persists, contact support."
      />
    );

  const submit = () => {
    update.mutate(
      { display_name: displayName, locale },
      {
        onSuccess: () => toast.success('Profile saved'),
        onError: () => toast.error('Failed to save profile'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name and email across WarmPulse.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Email" htmlFor="prof-email" hint="Contact support to change this.">
          <Input id="prof-email" value={profile?.email ?? ''} disabled />
        </FormField>
        <FormField label="Display name" htmlFor="prof-name">
          <Input
            id="prof-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
        </FormField>
        <FormField label="Locale" htmlFor="prof-locale">
          <AppSelect value={locale} onValueChange={setLocale}>
            <AppSelectTrigger id="prof-locale">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {['en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR', 'ja-JP'].map((l) => (
                <AppSelectItem key={l} value={l}>
                  {l}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </FormField>
        <div className="pt-2">
          <Button
            onClick={submit}
            disabled={update.isPending}
            leftIcon={update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {update.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function NotificationsPanel({
  isLoading,
  isError,
  notifications,
}: {
  isLoading: boolean;
  isError: boolean;
  notifications?: {
    slack_webhook: string | null;
    email_digest_enabled: boolean;
    alerts: { warmth_drop: boolean; bounce_spike: boolean; dns_break: boolean };
  };
}) {
  const update = useUpdateNotifications();
  const [slack, setSlack] = useState('');
  const [digest, setDigest] = useState(true);
  const [warmthDrop, setWarmthDrop] = useState(true);
  const [bounceSpike, setBounceSpike] = useState(true);
  const [dnsBreak, setDnsBreak] = useState(true);

  useEffect(() => {
    if (!notifications) return;
    setSlack(notifications.slack_webhook ?? '');
    setDigest(notifications.email_digest_enabled);
    setWarmthDrop(notifications.alerts.warmth_drop);
    setBounceSpike(notifications.alerts.bounce_spike);
    setDnsBreak(notifications.alerts.dns_break);
  }, [notifications]);

  if (isLoading) return <PanelSkeleton />;
  if (isError)
    return (
      <EmptyState
        title="Couldn't load notification settings"
        description="Try refreshing."
      />
    );

  const submit = () => {
    update.mutate(
      {
        slack_webhook: slack || null,
        email_digest_enabled: digest,
        alerts: {
          warmth_drop: warmthDrop,
          bounce_spike: bounceSpike,
          dns_break: dnsBreak,
        },
      },
      {
        onSuccess: () => toast.success('Notifications saved'),
        onError: () => toast.error('Failed to save notifications'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Digest & channels</CardTitle>
          <CardDescription>Where WarmPulse sends summaries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            label="Slack webhook URL"
            htmlFor="slack-hook"
            hint="Paste an Incoming Webhook. Leave blank to disable."
          >
            <Input
              id="slack-hook"
              placeholder="https://hooks.slack.com/services/..."
              value={slack}
              onChange={(e) => setSlack(e.target.value)}
            />
          </FormField>
          <div className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2/40 p-3">
            <div>
              <p className="text-sm font-medium text-text">Daily email digest</p>
              <p className="text-xs text-text-dim">Warmth, sends, and failed deliveries every morning.</p>
            </div>
            <AppSwitch checked={digest} onCheckedChange={setDigest} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>Fire on high-signal events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <AlertRow
            title="Warmth drop"
            description="Trigger when a mailbox warmth score falls more than 15 points in 24h."
            checked={warmthDrop}
            onChange={setWarmthDrop}
          />
          <AlertRow
            title="Failed delivery spike"
            description="Trigger when failure rate crosses 3% of sends in a day."
            checked={bounceSpike}
            onChange={setBounceSpike}
          />
          <AlertRow
            title="Domain records (DNS) break"
            description="Trigger when SPF, DKIM, or DMARC become invalid or missing."
            checked={dnsBreak}
            onChange={setDnsBreak}
          />
        </CardContent>
      </Card>

      <div>
        <Button
          onClick={submit}
          disabled={update.isPending}
          leftIcon={update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {update.isPending ? 'Saving…' : 'Save notifications'}
        </Button>
      </div>
    </div>
  );
}

function AlertRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-muted bg-surface-2/40 p-3">
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-text-dim max-w-md">{description}</p>
      </div>
      <AppSwitch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security (2FA + password)
// ---------------------------------------------------------------------------

function SecurityPanel({
  isLoading,
  isError,
  totpEnabled,
}: {
  isLoading: boolean;
  isError: boolean;
  totpEnabled: boolean;
}) {
  const enroll = useEnableTotp();
  const verify = useVerifyTotp();
  const disable = useDisableTotp();
  const changePassword = useChangePassword();

  // 2FA enrollment is a Pro+ feature. Starter users can't enable, but if
  // they were already enrolled on a higher plan and downgraded, they can
  // still disable so they're never stranded. The TotpDialog login
  // challenge auto-skips when totpEnabled is false on the server.
  const me = useMe();
  const plan = (me.data?.plan ?? '').toLowerCase();
  const isAdmin = me.data?.role === 'super_admin';
  const can2fa = isAdmin || (plan !== 'starter' && plan !== '');

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  if (isLoading) return <PanelSkeleton />;
  if (isError)
    return <EmptyState title="Couldn't load security settings" description="Try refreshing." />;

  const beginEnroll = () => {
    enroll.mutate(undefined, {
      onSuccess: (data) => setEnrollment(data),
      onError: () => toast.error('Failed to begin 2FA setup'),
    });
  };

  const finishEnroll = () => {
    if (!code) return;
    verify.mutate(
      { code },
      {
        onSuccess: () => {
          toast.success('Two-factor authentication enabled');
          setEnrollment(null);
          setCode('');
        },
        onError: () => toast.error('Invalid code — try again'),
      },
    );
  };

  const doDisable = () => {
    if (!disablePassword) return;
    disable.mutate(
      { password: disablePassword },
      {
        onSuccess: () => {
          toast.success('Two-factor disabled');
          setDisablePassword('');
        },
        onError: () => toast.error('Failed to disable 2FA'),
      },
    );
  };

  const doPassword = () => {
    if (!currentPw || !newPw || newPw !== confirmPw) {
      toast.error('Passwords do not match');
      return;
    }
    changePassword.mutate(
      { current_password: currentPw, new_password: newPw },
      {
        onSuccess: () => {
          toast.success('Password changed');
          setCurrentPw('');
          setNewPw('');
          setConfirmPw('');
        },
        onError: () => toast.error('Failed to change password'),
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Two-factor authentication
            {totpEnabled ? (
              <Badge variant="green">Enabled</Badge>
            ) : (
              <Badge variant="neutral">Off</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Require a 6-digit code from your authenticator app on every sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!totpEnabled && !enrollment && can2fa ? (
            <>
              <div className="rounded-md border border-border-muted bg-surface-2/40 p-3 text-xs text-text-dim">
                <p className="font-medium text-text">When 2FA fires</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Every email/password sign-in at /login (after your password is accepted, the code is required before tokens issue).</li>
                  <li>Sensitive admin actions in /admin — re-prompted within 15 minutes if your access token expired.</li>
                </ul>
                <p className="mt-2 text-[11px]">
                  Google sign-in (Firebase) bypasses TOTP — your Google account's own MFA covers it.
                </p>
              </div>
              <Button onClick={beginEnroll} disabled={enroll.isPending}>
                {enroll.isPending ? 'Preparing…' : 'Enable 2FA'}
              </Button>
            </>
          ) : null}

          {/* Starter plan: 2FA is gated to Pro+. Show an upgrade upsell card
              instead of the Enable button. */}
          {!totpEnabled && !enrollment && !can2fa ? (
            <div className="relative overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-br from-accent/10 via-surface-2/40 to-surface-2/40 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/15 text-accent">
                  <Lock className="h-4 w-4" strokeWidth={2.2} />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-text">
                      Two-factor authentication is a Pro feature
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-400">
                      <Sparkles className="h-3 w-3" />
                      Pro
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-text-dim">
                    Add a second factor (authenticator app TOTP + recovery codes) to every
                    sign-in. Upgrade to Pro to enable 2FA across your workspace, plus
                    AI-generated content, alerts, and inbox testing.
                  </p>
                  <Button asChild variant="primary" size="sm">
                    <Link to="/app/billing">Upgrade to Pro</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {enrollment ? (
            <div className="space-y-4 rounded-lg border border-border-muted bg-surface-2/40 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className="relative flex shrink-0 items-center justify-center rounded-xl bg-white p-4 shadow-2xl"
                >
                  {/* QR rendered locally — no third-party API call leaks the secret. */}
                  <QRCodeSVG
                    value={enrollment.qr_url}
                    size={160}
                    level="H"
                    bgColor="#ffffff"
                    fgColor="#0a0a0f"
                  />
                  {/* Scanner sweep animation */}
                  <motion.div
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: 2,
                      background: 'rgba(242, 101, 34, 0.4)',
                      boxShadow: '0 0 10px 1px rgba(242, 101, 34, 0.8)',
                      zIndex: 10,
                    }}
                  />
                  <div className="absolute inset-0 border-2 border-accent/20 rounded-xl pointer-events-none" />
                </motion.div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-text">Scan the QR in your authenticator app</p>
                    <p className="text-xs text-text-dim leading-relaxed">
                      Compatible with Google Authenticator, Microsoft Authenticator, 1Password, Authy, and more.
                    </p>
                  </div>
                  <div className="rounded-lg bg-surface-2 border border-border-muted p-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-faint mb-1">Manual Entry Key</p>
                    <code className="text-xs font-mono text-accent break-all">{enrollment.secret}</code>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label>Recovery codes (save these somewhere safe)</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const text = enrollment.recovery_codes.join('\n');
                        navigator.clipboard.writeText(text).then(
                          () => toast.success('Copied to clipboard'),
                          () => toast.error('Could not copy'),
                        );
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const blob = new Blob(
                          [
                            'WarmPulse 2FA recovery codes\n',
                            'Each code can be used once if you lose your authenticator.\n',
                            'Generated: ' + new Date().toISOString() + '\n',
                            '\n',
                            ...enrollment.recovery_codes.map((c) => c + '\n'),
                          ],
                          { type: 'text/plain;charset=utf-8' },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'warmpulse-recovery-codes.txt';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1 rounded-md bg-surface p-2 text-xs font-mono sm:grid-cols-4">
                  {enrollment.recovery_codes.map((c) => (
                    <span key={c} className="text-text">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="pt-1 text-[11px] text-text-dim">
                  These codes log you in if you lose access to your authenticator app
                  (e.g. you change phones). Store them in a password manager — each works once.
                </p>
              </div>
              <FormField label="Enter a code to confirm" htmlFor="totp-code">
                <Input
                  id="totp-code"
                  placeholder="123456"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </FormField>
              <div className="flex gap-2">
                <Button
                  onClick={finishEnroll}
                  disabled={verify.isPending || code.length < 6}
                  leftIcon={verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                >
                  {verify.isPending ? 'Verifying…' : 'Confirm'}
                </Button>
                <Button variant="ghost" onClick={() => setEnrollment(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {totpEnabled ? (
            <div className="space-y-3 rounded-lg border border-border-muted bg-surface-2/40 p-4">
              <p className="text-sm">
                To disable 2FA, confirm your password.
              </p>
              <FormField label="Password" htmlFor="disable-pw">
                <Input
                  id="disable-pw"
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
              </FormField>
              <Button variant="danger" onClick={doDisable} disabled={disable.isPending}>
                {disable.isPending ? 'Disabling…' : 'Disable 2FA'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Password
          </CardTitle>
          <CardDescription>Use at least 12 characters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormField label="Current password" htmlFor="pw-cur">
            <Input
              id="pw-cur"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </FormField>
          <FormField label="New password" htmlFor="pw-new">
            <Input
              id="pw-new"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </FormField>
          <FormField label="Confirm new password" htmlFor="pw-confirm">
            <Input
              id="pw-confirm"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </FormField>
          <div>
            <Button
              onClick={doPassword}
              disabled={changePassword.isPending}
              leftIcon={
                changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
              }
            >
              {changePassword.isPending ? 'Saving…' : 'Change password'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timezone
// ---------------------------------------------------------------------------

const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Athens',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function TimezonePanel({
  isLoading,
  isError,
  profile,
}: {
  isLoading: boolean;
  isError: boolean;
  profile?: { email: string; display_name: string; timezone: string; locale: string };
}) {
  const update = useUpdateProfile();
  const [tz, setTz] = useState('UTC');
  const now = useFormattedTz(tz);

  useEffect(() => {
    if (profile) setTz(profile.timezone);
  }, [profile]);

  if (isLoading) return <PanelSkeleton />;
  if (isError)
    return <EmptyState title="Couldn't load timezone" description="Try refreshing." />;

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const save = () => {
    update.mutate(
      { timezone: tz },
      {
        onSuccess: () => toast.success('Timezone saved'),
        onError: () => toast.error('Failed to save timezone'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timezone</CardTitle>
        <CardDescription>
          Warmup windows, schedules, and reports are rendered in this zone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          label="Your timezone"
          hint={
            detectedTz && detectedTz !== tz
              ? `Detected browser timezone: ${detectedTz}`
              : undefined
          }
        >
          <AppSelect value={tz} onValueChange={setTz}>
            <AppSelectTrigger>
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              {COMMON_TIMEZONES.map((z) => (
                <AppSelectItem key={z} value={z}>
                  {z}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </AppSelect>
        </FormField>
        <div className="rounded-lg border border-border-muted bg-surface-2/40 p-3 text-sm">
          <p className="text-text-dim">Current time in {tz}</p>
          <p className="mt-1 font-mono text-base text-text">{now}</p>
        </div>
        <div>
          <Button
            onClick={save}
            disabled={update.isPending}
            leftIcon={update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
          >
            {update.isPending ? 'Saving…' : 'Save timezone'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function useFormattedTz(tz: string): string {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  try {
    return new Date().toLocaleString(undefined, {
      timeZone: tz,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return new Date().toLocaleString();
  }
}

// ---------------------------------------------------------------------------
// Activity Log — reuses /features/activity/api.ts
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<ActivityAction, string> = {
  sent: '#FF9670',
  opened: '#FF9670',
  replied: '#f472b6',
  starred: '#fbbf24',
  spam_rescued: '#10b981',
  marked_important: '#34d399',
};

function ActivityLogPanel() {
  const feed = useActivityFeedInfinite();
  const items = useMemo<ActivityItem[]>(
    () => feed.data?.pages.flatMap((p) => p.items) ?? [],
    [feed.data],
  );
  const buckets = useActivityStackedBar(items);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
      >
        <ChartContainer
          title="Last 24h activity"
          subtitle="Your warmup sends, opens, replies, and rescues, hour by hour."
          loading={feed.isLoading}
          error={feed.isError ? 'Failed to load activity' : null}
          empty={!feed.isLoading && !feed.isError && items.length === 0}
          emptyLabel="No activity in the last 24h yet."
          height={260}
        >
          <StackedBarChartWp
            data={buckets as unknown as Record<string, unknown>[]}
            xKey="label"
            series={[
              { key: 'sent', name: 'Sent', color: ACTION_COLORS.sent },
              { key: 'opened', name: 'Opened', color: ACTION_COLORS.opened },
              { key: 'replied', name: 'Replied', color: ACTION_COLORS.replied },
              { key: 'starred', name: 'Starred', color: ACTION_COLORS.starred },
              { key: 'spam_rescued', name: 'Spam recovered', color: ACTION_COLORS.spam_rescued },
              { key: 'marked_important', name: 'Marked important', color: ACTION_COLORS.marked_important },
            ]}
            height={220}
          />
        </ChartContainer>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Every action your warmup engine took.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {feed.isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : feed.isError ? (
            <div className="p-5">
              <EmptyState
                title="Couldn't load activity"
                description="Try refreshing."
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No activity yet"
                description="Once your mailboxes start warming up, actions will show up here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-surface-2/50">
                  <tr className="text-left text-xs font-medium uppercase tracking-wider text-text-dim">
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">Mailbox</th>
                    <th className="px-4 py-2">Helper inbox</th>
                    <th className="px-4 py-2">Action</th>
                    <th className="px-4 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {items.slice(0, 50).map((row) => (
                    <tr key={row.id} className="text-sm">
                      <td className="px-4 py-2 tabular-nums text-text-dim">
                        {formatDateTime(row.ts)}
                      </td>
                      <td className="px-4 py-2">{row.mailbox_email}</td>
                      <td className="px-4 py-2 text-text-dim">{row.peer_email}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            row.action === 'spam_rescued'
                              ? 'green'
                              : 'neutral'
                          }
                        >
                          {row.action}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={row.result === 'ok' ? 'green' : 'orange'}>
                          {row.result}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {feed.hasNextPage ? (
                <div className="flex justify-center border-t border-border-muted p-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => feed.fetchNextPage()}
                    disabled={feed.isFetchingNextPage}
                  >
                    {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tour Replay
// ---------------------------------------------------------------------------

function TourPanel({ tourCompletedAt }: { tourCompletedAt: string | null }) {
  const replay = useReplayTour();
  const [tourOpen, setTourOpen] = useState(false);
  const [academyOpen, setAcademyOpen] = useState(false);

  const ws = useWorkspaceProfile();
  const [autoCrm, setAutoCrm] = useState(false);

  useEffect(() => {
    if (ws.data) setAutoCrm(ws.data.auto_crm_enabled);
  }, [ws.data]);

  const doReplay = () => {
    setTourOpen(true);
    replay.mutate(undefined, {
      onError: () =>
        toast.error('Tour started, but couldn\'t reset the completion flag.'),
    });
  };

  const onTourComplete = () => {
    toast.success('Tour finished — explore at your own pace.');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            WarmPulse Academy
          </CardTitle>
          <CardDescription>Master the warmup ramp and lead automation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-dim leading-relaxed">
            Re-watch the onboarding tutorial to understand how the network protects your 
            reputation and how to use automated lead importing.
          </p>
          <Button
            variant="primary"
            onClick={() => setAcademyOpen(true)}
            leftIcon={<Sparkles className="h-4 w-4" />}
          >
            Start Academy Tutorial
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product tour</CardTitle>
          <CardDescription>Replay the UI navigation tour.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border-muted bg-surface-2/40 p-3 text-sm">
            {tourCompletedAt ? (
              <>
                <p className="text-text-dim">You completed the tour on</p>
                <p className="mt-1 font-mono text-text">
                  {formatDateTime(tourCompletedAt)}
                </p>
              </>
            ) : (
              <p className="text-text-dim">You haven't completed the tour yet.</p>
            )}
          </div>
          <Button
            variant="secondary"
            onClick={doReplay}
            leftIcon={<PlayCircle className="h-4 w-4" />}
          >
            Replay navigation tour
          </Button>
        </CardContent>
      </Card>

      <TourModal
        open={tourOpen}
        onOpenChange={setTourOpen}
        onComplete={onTourComplete}
      />
      
      <AcademyModal
        open={academyOpen}
        onOpenChange={setAcademyOpen}
        autoCrmEnabled={autoCrm}
        onToggleAutoCrm={setAutoCrm}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

