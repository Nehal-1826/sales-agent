import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Crown,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  RefreshCcw,
  Reply as ReplyIcon,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  User,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuthStore } from '@/stores/auth';
import { useMailboxes } from '@/features/mailboxes/api';
import { useWorkspace } from '@/features/workspace/api';
import { useActivityFeedInfinite } from '@/features/activity/api';
import { useDailyMetrics } from '@/features/analytics/api';
import type { ActivityAction, ActivityItem } from '@/features/activity/types';
import type { AnalyticsCommonParams } from '@/features/analytics/types';
import './starter-workspace.css';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatDate } from '@/lib/format';

/**
 * /app/workspace — STARTER tier (W3 Workspace Profile).
 *
 * Starter is single-user / single-mailbox, so the legacy multi-tab admin
 * page (Team / Sub-clients) is overkill. The W3 layout treats
 * the workspace as an *identity* — hero card with avatar + name + plan
 * badge, a 3-cell stat strip, then the recent activity feed.
 *
 * Layout:
 *   ┌─ Hero ──────────────────────────────────────┐
 *   │ ◯ avatar · name · plan badge · meta strip   │
 *   ├─ Stat row (3 cells) ────────────────────────┤
 *   │ Mailboxes · Sends 30d · Joined              │
 *   ├─ Recent activity feed ──────────────────────┤
 *   │ time · action · peer email                  │
 *   └─────────────────────────────────────────────┘
 *
 * Data sources (all existing):
 *   - useWorkspace()                workspace name + plan + created_at
 *   - useAuthStore (user)           owner email
 *   - useMailboxes()                mailbox count + first mailbox email
 *   - useDailyMetrics({ 30d, day }) total sends over the trailing 30 days
 *   - useActivityFeedInfinite()     recent activity for the feed
 */

const ACTION_META: Record<
  Exclude<ActivityAction, 'marked_important'>,
  { label: string; tone: string; Icon: typeof Send }
> = {
  sent: { label: 'sent', tone: 'send', Icon: Send },
  opened: { label: 'opened', tone: 'open', Icon: MailOpen },
  replied: { label: 'replied', tone: 'reply', Icon: ReplyIcon },
  starred: { label: 'starred', tone: 'star', Icon: Star },
  spam_rescued: { label: 'recovered', tone: 'rescue', Icon: ShieldAlert },
};

export function StarterWorkspace() {
  const { number } = useLocaleFormat();
  const user = useAuthStore((s) => s.user);
  const workspace = useWorkspace();
  const mailboxesQuery = useMailboxes();
  const mailbox = mailboxesQuery.data?.items?.[0];

  // 30-day sends — uses analytics daily-metrics so it's a real number, not a
  // synthetic guess from `mailbox.sent_today`.
  const params = useMemo<AnalyticsCommonParams>(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 29);
    return {
      mailbox_id: mailbox?.id,
      from: isoDate(from),
      to: isoDate(to),
      granularity: 'day',
    };
  }, [mailbox?.id]);
  const daily = useDailyMetrics(params);
  const sends30d = useMemo(
    () => (daily.data ?? []).reduce((acc, row) => acc + Number(row.sent ?? 0), 0),
    [daily.data],
  );

  // Activity feed — first page only, capped at 8 rows for the W3 strip.
  const feed = useActivityFeedInfinite(
    mailbox ? { mailbox_id: mailbox.id } : {},
  );
  const feedItems: ActivityItem[] = useMemo(() => {
    const pages = feed.data?.pages ?? [];
    const all: ActivityItem[] = [];
    for (const p of pages) all.push(...(p.items ?? []));
    return all.slice(0, 8);
  }, [feed.data]);

  const isRefreshing = workspace.isFetching || daily.isFetching || feed.isFetching;

  // ---- Loading ----
  if (workspace.isLoading) {
    return <SkeletonShell />;
  }

  // Synthesize a minimal fallback from the auth-store user when /workspace
  // fails. The hook itself tries this first, but if the user just signed
  // in (Auth store is hydrated) while the API call errored on stale token,
  // we want SOMETHING to render here too.
  const fallbackWs: NonNullable<typeof workspace.data> | null = user
    ? {
        name: `${user.email?.split('@')[0] ?? 'workspace'}'s workspace`,
        // Cast must enumerate every tier — without `pro_plus` here a
        // Pro Plus user's plan string ("Pro Plus") would fail the type
        // narrow and silently become `undefined` → 'free'.
        plan: ((user.plan as 'free' | 'starter' | 'pro' | 'pro_plus' | 'agency' | undefined) ?? 'free'),
        created_at: '',
        team_members: [],
        sub_clients: [],
        api_keys: [],
        team_activity_series: [],
      }
    : null;

  if (!workspace.data && !fallbackWs) {
    return (
      <div className="sw">
        <header className="sw__head">
          <h1 className="sw__title">Workspace</h1>
        </header>
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Workspace not loaded"
          description="Something went wrong fetching your workspace info."
          action={
            <Button variant="secondary" onClick={() => workspace.refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const ws = workspace.data ?? fallbackWs!;
  const ownerEmail = user?.email ?? '';
  const mailboxCount = mailboxesQuery.data?.items?.length ?? 0;
  const joinedDate = ws.created_at ? new Date(ws.created_at) : null;
  const initials = workspaceInitials(ws.name || ownerEmail);

  return (
    <div className="sw">
      {/* ----- Header ----- */}
      <header className="sw__head">
        <div>
          <h1 className="sw__title">Workspace</h1>
          <p className="sw__sub">
            Your warmup workspace at a glance — identity, signal, and recent
            engine activity.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            workspace.refetch();
            daily.refetch();
            feed.refetch();
          }}
          disabled={isRefreshing}
          leftIcon={
            isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )
          }
        >
          Refresh
        </Button>
      </header>

      {/* ----- Hero ----- */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="sw-hero"
      >
        <div className="sw-hero__avatar" aria-hidden>
          {initials}
        </div>
        <div className="sw-hero__text">
          <span className="sw-hero__eyebrow">
            <Sparkles size={11} strokeWidth={2.4} />
            Workspace identity
          </span>
          <h2 className="sw-hero__name">{ws.name || 'Your workspace'}</h2>
          <div className="sw-hero__badges">
            <span className="sw-hero__plan-pill">
              <Crown size={10} strokeWidth={2.6} />
              {planLabel(ws.plan)}
            </span>
            <span className="sw-hero__meta">
              <User size={11} strokeWidth={2.4} />
              Owner · <strong>{ownerEmail || '—'}</strong>
            </span>
            <span className="sw-hero__meta">
              <Users size={11} strokeWidth={2.4} />
              {ws.team_members?.length || 1}{' '}
              {(ws.team_members?.length || 1) === 1 ? 'member' : 'members'}
            </span>
          </div>
        </div>
      </motion.section>

      {/* ----- Stat row ----- */}
      <div className="sw-stats">
        <StatCard
          tone="violet"
          Icon={Inbox}
          label="Mailboxes"
          value={String(mailboxCount)}
          foot={mailbox ? mailbox.email_address : 'Connect one to start'}
        />
        <StatCard
          tone="cyan"
          Icon={Send}
          label="Sends · last 30d"
          value={daily.isLoading ? '…' : number(sends30d)}
          foot={`${(daily.data ?? []).length || 0} days of metric data`}
        />
        <StatCard
          tone="green"
          Icon={CalendarDays}
          label="Joined"
          value={joinedDate ? formatDate(joinedDate) : '—'}
          foot={joinedDate ? `${daysBetween(joinedDate, new Date())} days ago` : ''}
        />
      </div>

      {/* ----- Activity feed ----- */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="sw-feed"
      >
        <header className="sw-feed__head">
          <div>
            <span className="sw-feed__eyebrow">
              <Activity size={11} strokeWidth={2.4} />
              Recent engine activity
            </span>
            <h3 className="sw-feed__title">What the warmup engine has been doing</h3>
          </div>
          <Link to="/app/activity" className="sw-feed__more">
            View full feed
            <ArrowRight size={11} strokeWidth={2.4} />
          </Link>
        </header>

        {feed.isLoading ? (
          <div className="sw-empty">Loading activity…</div>
        ) : feedItems.length === 0 ? (
          <div className="sw-empty">
            <Mail size={16} strokeWidth={2} style={{ opacity: 0.6 }} />
            <span>
              No activity yet — the first send lands within the hour after
              onboarding completes.
            </span>
          </div>
        ) : (
          <ul className="sw-feed__list">
            {feedItems.map((evt, i) => (
              <FeedRow key={evt.id} event={evt} idx={i} />
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}

/* ============================================================================
   Stat card (3 across)
============================================================================ */
function StatCard({
  tone,
  Icon,
  label,
  value,
  foot,
}: {
  tone: 'violet' | 'cyan' | 'green';
  Icon: typeof Inbox;
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <div className={`sw-stat sw-stat--${tone}`}>
      <span className={`sw-stat__icon sw-stat__icon--${tone}`}>
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <span className="sw-stat__label">{label}</span>
      <span className="sw-stat__value">{value}</span>
      {foot && <span className="sw-stat__foot">{foot}</span>}
    </div>
  );
}

/* ============================================================================
   Feed row
============================================================================ */
function FeedRow({ event, idx }: { event: ActivityItem; idx: number }) {
  const meta = ACTION_META[event.action as Exclude<ActivityAction, 'marked_important'>];
  const tone = meta?.tone ?? 'send';
  const Icon = meta?.Icon ?? Send;
  const label = meta?.label ?? event.action;

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: idx * 0.04 }}
      className="sw-feed__row"
    >
      <span className={`sw-feed__dot sw-feed__dot--${tone}`} aria-hidden />
      <span className={`sw-feed__action sw-feed__action--${tone}`}>
        <Icon size={10} strokeWidth={2.6} />
        {label}
      </span>
      <span className="sw-feed__peer" title={event.peer_email}>
        {event.peer_email}
      </span>
      <span className="sw-feed__time">{formatRelTime(event.ts)}</span>
    </motion.li>
  );
}

/* ============================================================================
   Skeleton
============================================================================ */
function SkeletonShell() {
  return (
    <div className="sw">
      <div className="h-7 w-40 animate-pulse rounded bg-surface-2/60" />
      <div className="h-32 w-full animate-pulse rounded-2xl bg-surface-2/60" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-28 animate-pulse rounded-2xl bg-surface-2/60" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface-2/60" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface-2/60" />
      </div>
      <div className="h-64 w-full animate-pulse rounded-2xl bg-surface-2/60" />
    </div>
  );
}

/* ============================================================================
   Helpers
============================================================================ */
function workspaceInitials(name: string): string {
  if (!name) return 'W';
  // For email-like names, take the first letter of the local part.
  const at = name.indexOf('@');
  const base = at > 0 ? name.slice(0, at) : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return base.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function planLabel(p: string): string {
  if (!p) return 'Free';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.round(ms / 86_400_000);
}

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(d);
}

export default StarterWorkspace;
