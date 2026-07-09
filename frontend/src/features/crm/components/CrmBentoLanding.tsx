import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Loader2,
  Lock,
  MailOpen,
  MessageSquarePlus,
  Plus,
  Reply,
  Send,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCampaigns, useCrmRecentActivity, useCrmSummary } from '../api';
import {
  CRM_STAGES,
  crmStageColor,
  formatCents,
  type CrmActivityKind,
  type CrmCampaign,
  type CrmRecentActivity,
} from '../types';
import { NewCampaignDialog } from './CampaignList';

/** Kind → icon for the recent-activity feed (matches the lead-drawer timeline). */
const ACTIVITY_ICON: Record<CrmActivityKind, typeof Activity> = {
  created: Sparkles,
  note: MessageSquarePlus,
  stage_change: Activity,
  email_sent: Send,
  email_opened: MailOpen,
  email_replied: Reply,
};

/** Stage that tints a given activity kind — keeps the feed on the orange palette. */
const ACTIVITY_TONE: Record<CrmActivityKind, string> = {
  created: crmStageColor('new'),
  note: crmStageColor('interested'),
  stage_change: crmStageColor('contacted'),
  email_sent: crmStageColor('replied'),
  email_opened: crmStageColor('replied'),
  email_replied: crmStageColor('won'),
};

/** Compact relative time, e.g. "just now" / "5m ago" / "3d ago". */
function relTime(iso: string | null): string {
  if (!iso) return 'just now';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export interface CrmBentoLandingProps {
  onOpen: (campaignId: string) => void;
  /** Plan campaign cap; null = unlimited. */
  cap: number | null;
  /** Campaigns already used against the cap. */
  used: number;
}

/**
 * The CRM workspace landing — "B4 · Bento" design, locked from the design
 * round and shared by every paid tier (the CrmWorkspace header above it
 * carries the per-tier badge + cap chip). An asymmetric grid of: a won-value
 * highlight, a by-stage distribution, the campaigns (click → board), and a
 * cap-aware "New campaign" tile.
 *
 * Fed entirely by live data (`useCampaigns` + `useCrmSummary`); no mocks.
 */
export function CrmBentoLanding({ onOpen, cap, used }: CrmBentoLandingProps) {
  const campaignsQuery = useCampaigns();
  const summaryQuery = useCrmSummary();
  const [createOpen, setCreateOpen] = useState(false);

  const campaigns = campaignsQuery.data ?? [];
  const summary = summaryQuery.data;
  const capReached = cap !== null && used >= cap;

  const wonCents = summary?.won_value_cents ?? 0;
  const totalLeads = summary?.leads ?? 0;
  const totalCampaigns = summary?.campaigns ?? campaigns.length;
  const byStage = summary?.by_stage ?? {};
  const stageTotal = CRM_STAGES.reduce((sum, s) => sum + (byStage[s.key] ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {/* Won value highlight */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.04 }}
        className="relative overflow-hidden rounded-3xl border border-accent/30 bg-surface p-6 sm:col-span-2 lg:col-span-4 lg:row-span-2"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--wp-accent, #F26522) 28%, transparent) 0%, transparent 55%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between gap-6">
          <div className="flex items-start justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-faint">
              Won value
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/30">
              <Trophy className="h-5 w-5" />
            </span>
          </div>
          <div className="space-y-3">
            <div className="text-5xl font-semibold leading-none tracking-tight tabular-nums text-text">
              {formatCents(wonCents)}
            </div>
            <div className="text-xs text-text-dim">
              {totalCampaigns} campaign{totalCampaigns === 1 ? '' : 's'} · {totalLeads} total
              lead{totalLeads === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </motion.div>

      {/* By stage */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        className="flex flex-col gap-4 rounded-3xl border border-border-muted bg-surface p-5 sm:col-span-2 lg:col-span-2 lg:row-span-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-text">By stage</span>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-text-faint">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            {stageTotal} leads
          </span>
        </div>
        {stageTotal > 0 ? (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border-muted/60">
              {CRM_STAGES.map((s) => {
                const value = byStage[s.key] ?? 0;
                if (value <= 0) return null;
                const pct = (value / stageTotal) * 100;
                return (
                  <span
                    key={s.key}
                    title={`${s.label}: ${value}`}
                    style={{ width: `${pct}%`, background: crmStageColor(s.key) }}
                    className="h-full"
                  />
                );
              })}
            </div>
            <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {CRM_STAGES.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-text-dim">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: crmStageColor(s.key) }}
                    />
                    {s.label}
                  </span>
                  <span className="font-medium tabular-nums text-text">{byStage[s.key] ?? 0}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs italic text-text-faint">
            No leads yet — open a campaign to start your pipeline.
          </p>
        )}
      </motion.div>

      {/* Campaign tiles */}
      {campaignsQuery.isLoading ? (
        <div className="col-span-full flex items-center gap-2 py-8 text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…
        </div>
      ) : (
        campaigns.map((c, i) => (
          <CampaignTile key={c.id} campaign={c} index={i} onOpen={onOpen} />
        ))
      )}

      {/* Recent activity (full-width) */}
      <RecentActivityTile />

      {/* Cap-aware New campaign tile */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.2 }}
        onClick={() => !capReached && setCreateOpen(true)}
        disabled={capReached}
        className={cn(
          'group flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-center transition-colors sm:col-span-1 lg:col-span-2',
          capReached
            ? 'cursor-not-allowed border-border-muted/60 opacity-70'
            : 'border-border-muted hover:border-accent/60 hover:bg-accent/[0.04]',
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            capReached
              ? 'bg-surface-2 text-text-faint'
              : 'bg-accent/10 text-accent group-hover:bg-accent/20',
          )}
        >
          {capReached ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" strokeWidth={2.4} />}
        </span>
        {capReached ? (
          <div>
            <p className="text-sm font-semibold text-text">Cap reached</p>
            <p className="mt-0.5 text-xs text-text-dim">Upgrade to add more campaigns</p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-text">New campaign</p>
        )}
        <p className="text-[11px] text-text-faint">{cap === null ? 'Unlimited' : `${used} / ${cap} used`}</p>
      </motion.button>

      <NewCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function CampaignTile({
  campaign,
  index,
  onOpen,
}: {
  campaign: CrmCampaign;
  index: number;
  onOpen: (id: string) => void;
}) {
  const isActive = campaign.status === 'active';
  const stageCounts = campaign.stage_counts ?? {};
  const stageTotal = CRM_STAGES.reduce((sum, s) => sum + (stageCounts[s.key] ?? 0), 0);
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.16 + Math.min(index * 0.05, 0.3) }}
      whileHover={{ y: -3 }}
      onClick={() => onOpen(campaign.id)}
      className="group flex min-h-[7.5rem] flex-col gap-3 rounded-2xl border border-border-muted bg-surface p-4 text-left transition-colors hover:border-accent/50 focus-visible:border-accent focus-visible:outline-none sm:col-span-1 lg:col-span-2"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-text group-hover:text-accent">
          {campaign.name}
        </h3>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={
            isActive
              ? {
                  color: 'var(--wp-success, #3ddc97)',
                  background: 'color-mix(in srgb, var(--wp-success, #3ddc97) 14%, transparent)',
                }
              : { color: '#9a9ab0', background: 'rgba(154,154,176,0.12)' }
          }
        >
          {campaign.status}
        </span>
      </div>
      <div className="mt-auto flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1 text-text-dim">
          <Users className="h-3.5 w-3.5 opacity-70" strokeWidth={2.2} />
          {campaign.lead_count} lead{campaign.lead_count === 1 ? '' : 's'}
        </span>
        {campaign.won_value_cents > 0 ? (
          <span
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: 'var(--wp-success, #3ddc97)' }}
          >
            <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />
            {formatCents(campaign.won_value_cents)}
          </span>
        ) : null}
        <ArrowUpRight
          className="ml-auto h-4 w-4 text-text-faint transition-colors group-hover:text-accent"
          strokeWidth={2.2}
        />
      </div>
      {/* Proportional 6-segment stage bar — only once the campaign has leads. */}
      {stageTotal > 0 ? (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg ring-1 ring-inset ring-border-muted/60">
          {CRM_STAGES.map((s) => {
            const value = stageCounts[s.key] ?? 0;
            if (value <= 0) return null;
            const pct = (value / stageTotal) * 100;
            return (
              <span
                key={s.key}
                title={`${s.label}: ${value}`}
                style={{ width: `${pct}%`, background: crmStageColor(s.key) }}
                className="h-full"
              />
            );
          })}
        </div>
      ) : null}
    </motion.button>
  );
}

/**
 * Full-width "Recent activity" tile — the workspace-wide event feed (newest
 * first, capped server-side). Shows up to six rows; loading + empty states
 * render in place so the tile never collapses or crashes.
 */
function RecentActivityTile() {
  const activityQuery = useCrmRecentActivity();
  const rows: CrmRecentActivity[] = (activityQuery.data ?? []).slice(0, 6);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.22 }}
      className="flex flex-col gap-3 rounded-2xl border border-border-muted bg-surface p-5 sm:col-span-2 lg:col-span-6"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text">Recent activity</span>
        <ArrowUpRight className="h-4 w-4 text-text-faint" />
      </div>
      {activityQuery.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-text-dim">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-2 text-xs italic text-text-faint">
          No activity yet — add a lead or log a note to see it here.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((event) => {
            const Icon = ACTIVITY_ICON[event.kind] ?? Activity;
            const tone = ACTIVITY_TONE[event.kind] ?? crmStageColor('interested');
            const detail = event.body?.trim() || event.kind.replace(/_/g, ' ');
            return (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-2.5"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    color: tone,
                    background: `color-mix(in srgb, ${tone} 16%, transparent)`,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-sm font-medium text-text">
                    {event.lead_name}
                  </span>
                  <span className="truncate text-[11px] text-text-dim">{detail}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-faint">
                  {relTime(event.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}

export default CrmBentoLanding;
