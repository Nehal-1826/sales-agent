import { Loader2, MailOpen, Reply, Send, Target, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { useCampaignAnalytics } from '../api';
import { CRM_STAGES, crmStageColor, formatCents } from '../types';
import { formatNumber } from '@/lib/format';

export interface CrmAnalyticsPanelProps {
  campaignId: string;
}

/**
 * Per-campaign analytics — conversion, deal value, open/reply rates (from the
 * sequence engine's email_* activities), stage distribution, and an owner
 * workload breakdown. All numbers come from `/crm/campaigns/{id}/analytics`.
 */
export function CrmAnalyticsPanel({ campaignId }: CrmAnalyticsPanelProps) {
  const query = useCampaignAnalytics(campaignId);
  const a = query.data;

  if (query.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-text-dim">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading analytics…
      </div>
    );
  }

  if (!a) {
    return (
      <div className="rounded-2xl border border-dashed border-border-muted bg-surface px-6 py-10 text-center text-sm text-text-dim">
        Analytics will appear once this campaign has leads.
      </div>
    );
  }

  const stageSegments = CRM_STAGES.map((meta) => ({
    meta,
    count: a.by_stage[meta.key] ?? 0,
  })).filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={<Target className="h-4 w-4" strokeWidth={2.2} />}
          label="Conversion"
          value={`${a.conversion_rate}%`}
          sub={`${a.won_count} of ${a.total_leads} won`}
        />
        <Tile
          icon={<Trophy className="h-4 w-4" strokeWidth={2.2} />}
          label="Won value"
          value={formatCents(a.won_value_cents)}
          tone="var(--wp-success, #3ddc97)"
        />
        <Tile
          icon={<Wallet className="h-4 w-4" strokeWidth={2.2} />}
          label="Open pipeline"
          value={formatCents(a.pipeline_value_cents)}
          sub="excludes won / lost"
        />
        <Tile
          icon={<TrendingUp className="h-4 w-4" strokeWidth={2.2} />}
          label="Total leads"
          value={formatNumber(a.total_leads)}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Email engagement */}
        <section className="rounded-2xl border border-border-muted bg-surface p-4">
          <h3 className="text-sm font-semibold text-text">Email opens &amp; replies</h3>
          <p className="mt-0.5 text-[11px] text-text-faint">
            From {formatNumber(a.emails_sent)} sequence email
            {a.emails_sent === 1 ? '' : 's'} sent.
          </p>
          {a.emails_sent === 0 ? (
            <p className="mt-4 text-xs italic text-text-faint">
              No emails sent yet — enroll leads in a sequence to track open and reply rates.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <RateBar
                icon={<Send className="h-3.5 w-3.5" strokeWidth={2.2} />}
                label="Sent"
                count={a.emails_sent}
                pct={100}
                muted
              />
              <RateBar
                icon={<MailOpen className="h-3.5 w-3.5" strokeWidth={2.2} />}
                label="Open rate"
                count={a.emails_opened}
                pct={a.open_rate}
              />
              <RateBar
                icon={<Reply className="h-3.5 w-3.5" strokeWidth={2.2} />}
                label="Reply rate"
                count={a.emails_replied}
                pct={a.reply_rate}
              />
            </div>
          )}
        </section>

        {/* Stage distribution */}
        <section className="rounded-2xl border border-border-muted bg-surface p-4">
          <h3 className="text-sm font-semibold text-text">Pipeline by stage</h3>
          {a.total_leads > 0 ? (
            <>
              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                {stageSegments.map(({ meta, count }) => (
                  <div
                    key={meta.key}
                    style={{
                      width: `${(count / a.total_leads) * 100}%`,
                      background: crmStageColor(meta.key),
                    }}
                    title={`${meta.label}: ${count}`}
                  />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                {stageSegments.map(({ meta, count }) => (
                  <span
                    key={meta.key}
                    className="inline-flex items-center gap-1 text-[11px] text-text-dim"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: crmStageColor(meta.key) }}
                      aria-hidden
                    />
                    {meta.label} {count}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-xs italic text-text-faint">No leads yet.</p>
          )}
        </section>
      </div>

      {/* Owner breakdown */}
      {a.by_owner.length > 0 ? (
        <section className="rounded-2xl border border-border-muted bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-text">By owner</h3>
          <div className="overflow-hidden rounded-xl border border-border-muted">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2/50 text-left text-[11px] uppercase tracking-wide text-text-faint">
                  <th className="px-3 py-2 font-semibold">Owner</th>
                  <th className="px-3 py-2 text-right font-semibold">Leads</th>
                  <th className="px-3 py-2 text-right font-semibold">Won</th>
                  <th className="px-3 py-2 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {a.by_owner.map((o, i) => (
                  <tr
                    key={o.owner_email ?? '__unassigned__'}
                    className={i % 2 ? 'bg-surface-2/20' : undefined}
                  >
                    <td className="truncate px-3 py-2 text-text">
                      {o.owner_email ?? (
                        <span className="italic text-text-faint">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-text-dim">{o.leads}</td>
                    <td className="px-3 py-2 text-right text-text-dim">{o.won}</td>
                    <td className="px-3 py-2 text-right text-text-dim">
                      {formatCents(o.value_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-muted bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{
            color: tone ?? 'var(--wp-accent, #F26522)',
            background: 'color-mix(in srgb, currentColor 12%, transparent)',
          }}
        >
          {icon}
        </span>
        <span className="text-xs font-medium text-text-dim">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-text-faint">{sub}</p> : null}
    </div>
  );
}

function RateBar({
  icon,
  label,
  count,
  pct,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  pct: number;
  muted?: boolean;
}) {
  const color = muted ? 'var(--wp-text-faint, #71717a)' : 'var(--wp-accent, #F26522)';
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-text-dim">
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <span className="font-semibold text-text">
          {muted ? formatNumber(count) : `${pct}% · ${count}`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}
