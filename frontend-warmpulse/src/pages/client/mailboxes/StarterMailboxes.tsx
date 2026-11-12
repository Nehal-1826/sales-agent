import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Check,
  CircleX,
  Gauge,
  LayoutDashboard,
  Loader2,
  Mail,
  Pause,
  Play,
  RotateCw,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/AppToast';
import { confirm } from '@/components/ui/ConfirmDialog';
import {
  useDeleteMailbox,
  useDnsCheck,
  useMailboxes,
  usePauseMailbox,
  useResumeMailbox,
  useTestConnection,
  useUpdateMailbox,
} from '@/features/mailboxes/api';
import { useActivityFeedInfinite } from '@/features/activity/api';
import type { Mailbox, MailboxProvider } from '@/features/mailboxes/types';
import type { ActivityAction, ActivityItem } from '@/features/activity/types';
import './starter-mailboxes.css';
import { formatDate } from '@/lib/format';

/**
 * /app/mailboxes — STARTER tier (M4 Split Pane).
 *
 * Starter is one-mailbox-only, so this view is a focused detail surface
 * rather than a list. Left rail holds identity (avatar, email, warmth
 * ring, status, DNS dots, primary actions). Right pane is a tab strip
 * with Overview / Schedule / DNS / Activity / Settings.
 *
 * Data sources (all existing):
 *   - useMailboxes()              → single connected mailbox
 *   - useActivityFeedInfinite()   → recent events for the mailbox
 *   - usePauseMailbox / useResume → toggle warmup
 *   - useDeleteMailbox            → disconnect
 */

type TabKey = 'overview' | 'schedule' | 'dns' | 'activity' | 'settings';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Activity }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'schedule', label: 'Schedule', icon: Calendar },
  { key: 'dns', label: 'Domain (DNS)', icon: ShieldCheck },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function StarterMailboxes() {
  const mailboxesQuery = useMailboxes();
  const mailboxes = mailboxesQuery.data?.items ?? [];
  const mailbox: Mailbox | undefined = mailboxes[0];

  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const pause = usePauseMailbox();
  const resume = useResumeMailbox();
  const remove = useDeleteMailbox();
  const dnsCheck = useDnsCheck();
  const testConn = useTestConnection();
  const update = useUpdateMailbox();

  // Auto-trigger a DNS check the FIRST time we render this page for a
  // mailbox whose DNS columns are all null. Without this, brand-new
  // mailboxes (just-completed onboarding) show "UNKNOWN" for SPF/DKIM/
  // DMARC because the onboarding DNS check shows results but doesn't
  // persist them to the mailbox row. The ref guard prevents an infinite
  // re-trigger if the check returns null (e.g. dummy mode is off mid-flight).
  const autoCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mailbox) return;
    if (autoCheckedRef.current === mailbox.id) return;
    const allNull =
      mailbox.spf_valid == null &&
      mailbox.dkim_valid == null &&
      mailbox.dmarc_valid == null;
    if (!allNull) return;
    autoCheckedRef.current = mailbox.id;
    dnsCheck.mutate(mailbox.id);
    // dnsCheck identity is stable across renders (useMutation), safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailbox?.id, mailbox?.spf_valid, mailbox?.dkim_valid, mailbox?.dmarc_valid]);

  // ---- Empty state — no mailbox connected (post-onboarding only) ----
  if (!mailboxesQuery.isLoading && !mailbox) {
    return (
      <div className="sm">
        <header className="sm__heading">
          <h1 className="sm__title">Mailboxes</h1>
          <p className="sm__sub">Manage your warmup mailbox.</p>
        </header>
        <EmptyState
          icon={<Mail className="h-5 w-5" />}
          title="No mailbox connected"
          description="Finish onboarding to connect your warmup mailbox and start building up."
          action={
            <Button asChild variant="primary">
              <Link to="/onboarding">Complete onboarding</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!mailbox) {
    // Loading shimmer placeholder — keep simple, the rail is the main thing.
    return (
      <div className="sm">
        <header className="sm__heading">
          <h1 className="sm__title">Mailboxes</h1>
          <p className="sm__sub">Loading your mailbox…</p>
        </header>
      </div>
    );
  }

  const isPaused = mailbox.is_paused;
  const handleTogglePause = async () => {
    if (isPaused) {
      try {
        await resume.mutateAsync(mailbox.id);
        toast.success('Warmup resumed.');
      } catch {
        toast.error('Could not resume — try again.');
      }
    } else {
      try {
        await pause.mutateAsync(mailbox.id);
        toast.success('Warmup paused.');
      } catch {
        toast.error('Could not pause — try again.');
      }
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: `Disconnect ${mailbox.email_address}?`,
      description:
        "We'll stop all warmup activity and remove the encrypted login details. You can reconnect later from onboarding.",
      confirmLabel: 'Disconnect',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(mailbox.id);
      toast.success('Mailbox disconnected.');
    } catch {
      toast.error('Disconnect failed.');
    }
  };

  return (
    <div className="sm">
      <header className="sm__heading">
        <h1 className="sm__title">Mailboxes</h1>
        <p className="sm__sub">
          Manage your single warmup mailbox — schedule, domain records (DNS), activity, and connection.
        </p>
      </header>

      <div className="sm-split">
        <IdentityRail
          mailbox={mailbox}
          isPaused={isPaused}
          togglePending={pause.isPending || resume.isPending}
          onTogglePause={handleTogglePause}
          onDisconnect={handleDisconnect}
        />

        <div className="sm-pane">
          {/* Tab bar */}
          <div className="sm-tabs" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.key}
                  className={`sm-tab ${activeTab === t.key ? 'sm-tab--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  <Icon size={13} strokeWidth={2.2} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Active tab panel */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="sm-panel"
          >
            {activeTab === 'overview' && <OverviewTab mailbox={mailbox} />}
            {activeTab === 'schedule' && <ScheduleTab mailbox={mailbox} />}
            {activeTab === 'dns' && (
              <DnsTab
                mailbox={mailbox}
                onRecheck={() => {
                  dnsCheck.mutate(mailbox.id, {
                    onSuccess: () => toast.success('DNS re-checked.'),
                    onError: () => toast.error('DNS check failed.'),
                  });
                }}
                isChecking={dnsCheck.isPending}
              />
            )}
            {activeTab === 'activity' && <ActivityTab mailbox={mailbox} />}
            {activeTab === 'settings' && (
              <SettingsTab
                mailbox={mailbox}
                onRecheckDns={() => {
                  dnsCheck.mutate(mailbox.id, {
                    onSuccess: () => toast.success('DNS re-checked.'),
                    onError: () => toast.error('DNS check failed.'),
                  });
                }}
                isChecking={dnsCheck.isPending}
                onTestConnection={() => {
                  testConn.mutate(mailbox.id, {
                    onSuccess: (r) => {
                      if (r.smtp_ok && r.imap_ok !== false) {
                        toast.success('Connection OK.');
                      } else {
                        toast.error('Connection failed — check login details.');
                      }
                    },
                    onError: () => toast.error('Connection test failed.'),
                  });
                }}
                isTesting={testConn.isPending}
                onUpdateDailyTarget={(value) => {
                  update.mutate(
                    { id: mailbox.id, payload: { daily_target: value } },
                    {
                      onSuccess: () => toast.success(`Daily target set to ${value}.`),
                      onError: () => toast.error('Update failed.'),
                    },
                  );
                }}
                isSavingTarget={update.isPending}
              />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Identity rail
============================================================================ */
function IdentityRail({
  mailbox,
  isPaused,
  togglePending,
  onTogglePause,
  onDisconnect,
}: {
  mailbox: Mailbox;
  isPaused: boolean;
  togglePending: boolean;
  onTogglePause: () => void;
  onDisconnect: () => void;
}) {
  const initials = providerInitials(mailbox.provider);
  const warmth = Math.round(mailbox.warmth_score ?? 0);

  return (
    <aside className="sm-rail">
      <div className="sm-rail__avatar" aria-hidden>
        {initials}
      </div>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p className="sm-rail__email">{mailbox.email_address}</p>
        <span className="sm-rail__provider">{prettyProvider(mailbox.provider)}</span>
      </div>

      <div className="sm-rail__divider" />

      <div
        className="sm-rail__ring"
        style={{ ['--pct' as string]: String(Math.max(0, Math.min(100, warmth))) } as React.CSSProperties}
        aria-label={`Warmth score ${warmth} out of 100`}
      >
        <div className="sm-rail__ring-inner">
          <span className="sm-rail__ring-num">{warmth}</span>
          <span className="sm-rail__ring-label">Warmth</span>
        </div>
      </div>

      <div className="sm-rail__pills">
        <span className={`sm-rail__pill ${isPaused ? 'sm-rail__pill--paused' : 'sm-rail__pill--ok'}`}>
          {isPaused ? <Pause size={11} strokeWidth={2.6} /> : <Play size={11} strokeWidth={2.6} />}
          {isPaused ? 'Paused' : 'Active'}
        </span>
        <span className="sm-rail__pill sm-rail__pill--day">
          <Calendar size={11} strokeWidth={2.6} />
          Day {mailbox.current_day}
        </span>
      </div>

      <div className="sm-rail__divider" />

      <div className="sm-rail__dns">
        {(['spf', 'dkim', 'dmarc'] as const).map((rec) => {
          const status = readDnsStatus(mailbox, rec);
          return (
            <span key={rec} className="sm-rail__dns-rec">
              <span className={`sm-rail__dns-dot sm-rail__dns-dot--${status}`} />
              {rec.toUpperCase()}
            </span>
          );
        })}
      </div>

      <div className="sm-rail__divider" />

      <div className="sm-rail__actions">
        <button
          type="button"
          className={`sm-rail__btn ${isPaused ? 'sm-rail__btn--primary' : 'sm-rail__btn--ghost'}`}
          onClick={onTogglePause}
          disabled={togglePending}
        >
          {isPaused ? <Play size={13} strokeWidth={2.2} /> : <Pause size={13} strokeWidth={2.2} />}
          {togglePending ? 'Saving…' : isPaused ? 'Resume warmup' : 'Pause warmup'}
        </button>
        <button type="button" className="sm-rail__btn sm-rail__btn--danger" onClick={onDisconnect}>
          <Trash2 size={13} strokeWidth={2.2} />
          Disconnect
        </button>
      </div>
    </aside>
  );
}

/* ============================================================================
   Overview tab — stats + capacity bar
============================================================================ */
function OverviewTab({ mailbox }: { mailbox: Mailbox }) {
  const sent = mailbox.sent_today ?? 0;
  const target = mailbox.daily_target || 1;
  const capPct = Math.min(100, Math.round((sent / target) * 100));

  return (
    <div className="sm-overview">
      <div className="sm-overview__stats">
        <Stat label="Today's sends" value={sent} icon={<Send size={11} />} foot={`of ${target} target`} />
        <Stat
          label="Day in build-up"
          value={mailbox.current_day}
          icon={<Calendar size={11} />}
          foot={`${mailbox.days_remaining_in_ramp ?? 0} days remaining`}
        />
        <Stat
          label="Warmth score"
          value={Math.round(mailbox.warmth_score ?? 0)}
          icon={<Gauge size={11} />}
          foot={describeWarmth(mailbox.warmth_score ?? 0)}
        />
      </div>

      <div className="sm-overview__bar">
        <div className="sm-overview__bar-head">
          <span className="sm-overview__bar-label">Daily limit</span>
          <span className="sm-overview__bar-value">
            {sent} / {target} sends
          </span>
        </div>
        <div className="sm-overview__bar-track">
          <motion.div
            className="sm-overview__bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${capPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  foot,
  icon,
}: {
  label: string;
  value: number;
  foot: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="sm-overview__stat">
      <span className="sm-overview__stat-head">
        {icon}
        {label}
      </span>
      <span className="sm-overview__stat-num">{value}</span>
      <span className="sm-overview__stat-foot">{foot}</span>
    </div>
  );
}

/* ============================================================================
   Schedule tab — ramp + daily target context
============================================================================ */
function ScheduleTab({ mailbox }: { mailbox: Mailbox }) {
  return (
    <div className="sm-schedule">
      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Today's build-up ceiling</span>
        <div className="sm-schedule__slider-wrap">
          <div style={{ flex: 1 }}>
            <div className="sm-overview__bar-track">
              <div
                className="sm-overview__bar-fill"
                style={{
                  width: `${Math.min(100, Math.round((mailbox.ramp_target_today / Math.max(1, mailbox.daily_target)) * 100))}%`,
                }}
              />
            </div>
          </div>
          <span className="sm-schedule__slider-val">
            {mailbox.ramp_target_today} / {mailbox.daily_target}
          </span>
        </div>
        <p className="sm-schedule__hint">
          The warmup engine builds up from a small initial volume up to your full daily target over
          ~28 days. Today's ceiling above is auto-computed from your day in build-up.
        </p>
      </div>

      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Schedule window</span>
        <p className="sm-schedule__hint">
          {mailbox.schedule_window
            ? `${formatScheduleWindow(mailbox.schedule_window)} — sends only land in this window.`
            : 'No custom window — sends are spread across business hours UTC. Edit in Settings → Schedule (Pro).'}
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   DNS tab — three records with state + fix instructions
============================================================================ */
function DnsTab({
  mailbox,
  onRecheck,
  isChecking,
}: {
  mailbox: Mailbox;
  onRecheck: () => void;
  isChecking: boolean;
}) {
  const records: Array<{ name: 'SPF' | 'DKIM' | 'DMARC'; valid: boolean | null; description: string }> = [
    {
      name: 'SPF',
      valid: mailbox.spf_valid,
      description:
        'Tells inbox providers which servers can send mail for your domain. Add a TXT record at the root domain: v=spf1 include:_spf.google.com ~all (replace include for your provider).',
    },
    {
      name: 'DKIM',
      valid: mailbox.dkim_valid,
      description:
        'Cryptographic signature for each outgoing message. Get the TXT record from your mail provider (Google Workspace, Outlook, Zoho) and publish at <selector>._domainkey.yourdomain.com.',
    },
    {
      name: 'DMARC',
      valid: mailbox.dmarc_valid,
      description:
        'Policy that ties SPF + DKIM together. Start in monitoring mode: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com. Tighten to p=quarantine then p=reject after 2-4 weeks.',
    },
  ];

  const allNull = records.every((r) => r.valid == null);

  return (
    <div className="sm-dns">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 4,
          flexWrap: 'wrap',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: 'var(--wp-text-dim, #a1a1aa)',
            lineHeight: 1.5,
          }}
        >
          {allNull
            ? "Status shows UNKNOWN until your domain's DNS records are scanned. Re-checking now…"
            : 'Records re-checked on demand. Updates flow back to the rail status dots.'}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={onRecheck}
          disabled={isChecking}
          leftIcon={
            isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )
          }
        >
          {isChecking ? 'Checking…' : 'Re-check DNS'}
        </Button>
      </div>
      {records.map((rec) => {
        const state: 'ok' | 'warn' | 'err' =
          rec.valid === true ? 'ok' : rec.valid === false ? 'err' : 'warn';
        return (
          <div key={rec.name} className={`sm-dns__rec sm-dns__rec--${state}`}>
            <div className="sm-dns__rec-head">
              <span className="sm-dns__rec-name">{rec.name}</span>
              <span className={`sm-dns__rec-state sm-dns__rec-state--${state}`}>
                {state === 'ok' ? (
                  <>
                    <Check size={11} strokeWidth={3} />
                    Valid
                  </>
                ) : state === 'err' ? (
                  <>
                    <CircleX size={11} strokeWidth={3} />
                    Missing
                  </>
                ) : (
                  <>
                    <TriangleAlert size={11} strokeWidth={3} />
                    Unknown
                  </>
                )}
              </span>
            </div>
            <p className="sm-dns__rec-desc">{rec.description}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
   Activity tab — recent warmup events for this mailbox
============================================================================ */
function ActivityTab({ mailbox }: { mailbox: Mailbox }) {
  const feed = useActivityFeedInfinite({ mailbox_id: mailbox.id });

  const items: ActivityItem[] = useMemo(() => {
    const pages = feed.data?.pages ?? [];
    const all: ActivityItem[] = [];
    for (const page of pages) all.push(...(page.items ?? []));
    return all.slice(0, 20);
  }, [feed.data]);

  if (feed.isLoading) {
    return <div className="sm-empty">Loading recent activity…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="sm-empty">
        No activity yet — the first send lands within the hour after onboarding completes.
      </div>
    );
  }

  return (
    <div className="sm-activity">
      {items.map((evt) => (
        <div key={evt.id} className="sm-activity__row">
          <span className="sm-activity__time">{formatRelTime(evt.ts)}</span>
          <span className={`sm-activity__action sm-activity__action--${evt.action}`}>
            {actionLabel(evt.action)}
          </span>
          <span className="sm-activity__peer">{evt.peer_email ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================================
   Settings tab — content mode + danger zone
============================================================================ */
function SettingsTab({
  mailbox,
  onRecheckDns,
  isChecking,
  onTestConnection,
  isTesting,
  onUpdateDailyTarget,
  isSavingTarget,
}: {
  mailbox: Mailbox;
  onRecheckDns: () => void;
  isChecking: boolean;
  onTestConnection: () => void;
  isTesting: boolean;
  onUpdateDailyTarget: (value: number) => void;
  isSavingTarget: boolean;
}) {
  // Starter plan cap = 50 emails/day per mailbox. The actual cap lives on
  // the user's Plan row; for Starter the seed value is 50. We hard-cap
  // the slider here so the UI never lets users overshoot what the engine
  // will honour.
  const STARTER_CAP = 50;
  const [target, setTarget] = useState<number>(mailbox.daily_target);

  // Sync local slider if the server-side value drifts (e.g. another
  // device updated it).
  useEffect(() => {
    setTarget(mailbox.daily_target);
  }, [mailbox.daily_target]);

  const dirty = target !== mailbox.daily_target;

  return (
    <div className="sm-schedule">
      {/* Daily target — editable, capped to plan max */}
      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Daily send target</span>
        <div className="sm-schedule__slider-wrap">
          <input
            type="range"
            min={5}
            max={STARTER_CAP}
            step={5}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
          <span className="sm-schedule__slider-val">{target} / day</span>
        </div>
        <p className="sm-schedule__hint">
          Your Starter plan caps daily volume at {STARTER_CAP}/day per mailbox. The warmup
          engine builds up from a small initial number up to this target over ~28 days.
        </p>
        {dirty && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size="sm"
              variant="primary"
              disabled={isSavingTarget}
              onClick={() => onUpdateDailyTarget(target)}
            >
              {isSavingTarget ? 'Saving…' : `Set to ${target}/day`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isSavingTarget}
              onClick={() => setTarget(mailbox.daily_target)}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Diagnostic actions */}
      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Diagnostics</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRecheckDns}
            disabled={isChecking}
            leftIcon={
              isChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4" />
              )
            }
          >
            {isChecking ? 'Checking…' : 'Re-check DNS'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onTestConnection}
            disabled={isTesting}
            leftIcon={
              isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )
            }
          >
            {isTesting ? 'Testing…' : 'Test connection'}
          </Button>
        </div>
        <p className="sm-schedule__hint">
          Re-check pulls fresh SPF/DKIM/DMARC and updates the rail. Test connection runs a
          live SMTP/IMAP login probe and reports the result as a toast.
        </p>
      </div>

      {/* Read-only info */}
      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Content mode</span>
        <p className="sm-schedule__hint">
          {describeContentMode(mailbox.content_mode)}
        </p>
      </div>

      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Created</span>
        <p className="sm-schedule__hint">
          {formatDate(mailbox.created_at)}
        </p>
      </div>

      <div className="sm-schedule__row">
        <span className="sm-schedule__label">Danger zone</span>
        <p className="sm-schedule__hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={13} color="var(--wp-danger, #ff5c7a)" />
          Use the <strong style={{ color: 'var(--wp-danger, #ff5c7a)' }}>Disconnect</strong> button
          in the left rail to remove this mailbox from warmup.
        </p>
      </div>
    </div>
  );
}

/* ============================================================================
   Helpers
============================================================================ */

function providerInitials(p: MailboxProvider | string): string {
  const lower = String(p).toLowerCase();
  if (lower.includes('gmail') || lower.includes('google')) return 'G';
  if (lower.includes('outlook') || lower.includes('365')) return 'O';
  if (lower.includes('yahoo')) return 'Y';
  if (lower.includes('zoho')) return 'Z';
  return String(p).slice(0, 1).toUpperCase();
}

function prettyProvider(p: MailboxProvider | string): string {
  const lower = String(p).toLowerCase();
  if (lower.includes('gmail') || lower.includes('google')) return 'Gmail / Workspace';
  if (lower.includes('outlook') || lower.includes('365')) return 'Outlook 365';
  if (lower.includes('yahoo')) return 'Yahoo Mail';
  if (lower.includes('zoho')) return 'Zoho Mail';
  return String(p).toUpperCase();
}

function describeWarmth(score: number): string {
  if (score >= 80) return 'Healthy';
  if (score >= 50) return 'Warming up';
  if (score >= 20) return 'Early days';
  return 'Just starting';
}

function readDnsStatus(mailbox: Mailbox, rec: 'spf' | 'dkim' | 'dmarc'): 'ok' | 'warn' | 'err' {
  const key = `${rec}_valid` as 'spf_valid' | 'dkim_valid' | 'dmarc_valid';
  const v = mailbox[key];
  if (v === true) return 'ok';
  if (v === false) return 'err';
  return 'warn';
}

function actionLabel(a: ActivityAction): string {
  switch (a) {
    case 'sent':
      return 'sent';
    case 'opened':
      return 'open';
    case 'replied':
      return 'reply';
    case 'starred':
      return 'star';
    case 'spam_rescued':
      return 'spam recovery';
    case 'marked_important':
      return 'important';
    default:
      return String(a);
  }
}

function describeContentMode(mode: string): string {
  // ContentMode is 'A' | 'B' | 'C' | 'D' on the wire (style codes). Until
  // the Pro AI-content path lands, Starter shows a friendly description
  // rather than an opaque letter code.
  switch (mode) {
    case 'A':
      return 'Curated templates — the warmup engine cycles through a hand-picked set. AI-generated content lands on Pro.';
    case 'B':
      return 'Varied template set (B) — wider rotation of warmup copy.';
    case 'C':
      return 'Threaded conversational templates (C).';
    case 'D':
      return 'Long-form templates (D).';
    default:
      return 'Static template content. AI-generated content is a Pro feature.';
  }
}

function formatScheduleWindow(w: NonNullable<Mailbox['schedule_window']>): string {
  const days = formatWeekdayMask(w.weekday_mask);
  const hours = `${pad2(w.start_hour)}:00–${pad2(w.end_hour)}:00 ${w.tz}`;
  return `${days} ${hours}`;
}

function formatWeekdayMask(mask: number): string {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const on = labels.filter((_, i) => (mask & (1 << i)) !== 0);
  if (on.length === 7) return 'Every day';
  if (on.length === 5 && !on.includes('Sat') && !on.includes('Sun')) return 'Mon–Fri';
  if (on.length === 2 && on.includes('Sat') && on.includes('Sun')) return 'Weekends';
  return on.join(', ');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatRelTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default StarterMailboxes;
