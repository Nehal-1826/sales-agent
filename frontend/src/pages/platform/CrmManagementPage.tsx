import { useEffect, useState } from 'react';
import { PageHeader, Chip } from '../../components/ui';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { Drawer } from '../../components/overlay';
import { useAsync } from '../../lib/hooks';
import { fmtNumber, timeAgo } from '../../lib/format';
import {
  downloadCsv,
  getAdminCrmOverview,
  getAdminCrmWorkspace,
  setCrmSequenceStatus,
} from '../../lib/platformAdmin';
import type { AdminCrmWorkspaceRow } from '../../lib/platformAdmin';

/**
 * Platform admin · CRM management (H2 port of the WarmPulse "Workspace CRM
 * Grid"). Cross-workspace view over every tenant's campaigns, sequences and
 * lead activity — data from the FastAPI admin CRM routes via
 * lib/platformAdmin (overview → card grid + KPIs, workspace detail → drill-in
 * drawer, sequence status → pause/resume mutation).
 *
 * Derived fields stay honest to the reference port:
 *   health      → open_rate/reply_rate thresholds (no opaque backend score)
 *   engagement  → open_rate tiers (high ≥55, low <30, else medium)
 *   sparkline   → dropped (API has no per-workspace time series); rate bars instead
 */

type HealthTier = 'healthy' | 'warning' | 'critical';
type EngagementTier = 'high' | 'medium' | 'low';
type DetailTab = 'sequences' | 'campaigns' | 'activity';

function deriveHealth(ws: AdminCrmWorkspaceRow): HealthTier {
  if (ws.open_rate < 25 || ws.reply_rate < 5) return 'critical';
  if (ws.open_rate < 45 || ws.reply_rate < 10) return 'warning';
  return 'healthy';
}

function deriveEngagementTier(ws: AdminCrmWorkspaceRow): EngagementTier {
  if (ws.open_rate >= 55) return 'high';
  if (ws.open_rate < 30) return 'low';
  return 'medium';
}

/** Chip tones have no 'error' variant — critical shares warn; the label text distinguishes. */
const HEALTH_TONE: Record<HealthTier, 'success' | 'warn'> = {
  healthy: 'success',
  warning: 'warn',
  critical: 'warn',
};

/** Rate progress bar — the reference's animated RateBar, restyled with shell tokens. */
function RateBar({ value, tone }: { value: number; tone: string }) {
  return (
    <span className="pf-hbar-track" aria-hidden>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: tone }} />
    </span>
  );
}

/* ---------------- workspace detail drawer ---------------- */

function WorkspaceDrawer({
  ws,
  onClose,
  onChanged,
}: {
  ws: AdminCrmWorkspaceRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('sequences');
  const [pausingId, setPausingId] = useState<string | null>(null);
  const { data: detail, error, reload } = useAsync(() => getAdminCrmWorkspace(ws.workspace_id), [ws.workspace_id]);

  const sequences = detail?.sequence_list ?? [];
  const campaigns = detail?.campaign_list ?? [];
  const activities = detail?.recent_activities ?? [];
  const health = deriveHealth(ws);

  async function togglePause(seqId: string, currentlyPaused: boolean) {
    setPausingId(seqId);
    const r = await setCrmSequenceStatus(seqId, !currentlyPaused);
    setPausingId(null);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(currentlyPaused ? 'Sequence resumed.' : 'Sequence paused.');
    void reload();
    onChanged();
  }

  return (
    <Drawer title={ws.name} subtitle={ws.owner_email} onClose={onClose}>
      <div className="pf-actions" style={{ marginTop: 0, marginBottom: 12 }}>
        <Chip tone={HEALTH_TONE[health]}>{health}</Chip>
        <Chip tone="accent">{ws.plan ?? 'Free'}</Chip>
        <small style={{ color: 'var(--text-2)' }}>Last activity {timeAgo(ws.last_activity_at) || 'never'}</small>
      </div>
      <dl className="pf-dl">
        <dt>Campaigns</dt><dd>{fmtNumber(ws.campaigns)}</dd>
        <dt>Leads</dt><dd>{fmtNumber(ws.leads)}</dd>
        <dt>Sequences</dt><dd>{fmtNumber(ws.sequences_active)} active · {fmtNumber(ws.sequences_paused)} paused</dd>
        <dt>Enrollments</dt><dd>{fmtNumber(ws.active_enrollments)}</dd>
        <dt>Open rate</dt><dd>{ws.open_rate.toFixed(1)}%</dd>
        <dt>Reply rate</dt><dd>{ws.reply_rate.toFixed(1)}%</dd>
      </dl>

      <div className="subtabs compact">
        {(['sequences', 'campaigns', 'activity'] as DetailTab[]).map((t) => (
          <button key={t} className={`subtab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!detail && !error && <Skeleton rows={3} />}

      {detail && tab === 'sequences' && (
        sequences.length === 0 ? <EmptyState title="No sequences found" /> : (
          <ul className="pf-usage" style={{ display: 'grid', gap: 8 }}>
            {sequences.map((seq) => (
              <li key={seq.id} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seq.name}</strong>
                  <small style={{ color: 'var(--text-2)' }}>
                    {fmtNumber(seq.enrolled)} enrolled · {seq.open_rate.toFixed(1)}% open · {seq.reply_rate.toFixed(1)}% reply
                  </small>
                </div>
                <button
                  className={`btn btn-sm${seq.paused ? '' : ' btn-danger'}`}
                  disabled={pausingId === seq.id}
                  onClick={() => void togglePause(seq.id, seq.paused)}
                >
                  {pausingId === seq.id ? 'Working…' : seq.paused ? 'Resume' : 'Pause'}
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {detail && tab === 'campaigns' && (
        campaigns.length === 0 ? <EmptyState title="No campaigns found" /> : (
          <ul className="pf-usage" style={{ display: 'grid', gap: 8 }}>
            {campaigns.map((camp) => (
              <li key={camp.id} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{camp.name}</strong>
                  <small style={{ color: 'var(--text-2)' }}>{fmtNumber(camp.leads)} leads</small>
                </div>
                <Chip tone={camp.status.toLowerCase() === 'active' ? 'success' : 'neutral'}>{camp.status}</Chip>
              </li>
            ))}
          </ul>
        )
      )}

      {detail && tab === 'activity' && (
        activities.length === 0 ? <EmptyState title="No recent activity" /> : (
          <ul className="pf-usage" style={{ display: 'grid', gap: 8 }}>
            {activities.map((act, i) => (
              <li key={`${act.kind}-${i}`} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{act.lead_label}</strong>
                  <small style={{ color: 'var(--text-2)', display: 'block' }}>{act.kind}</small>
                </div>
                <small style={{ color: 'var(--text-2)', flexShrink: 0 }}>{timeAgo(act.at) || 'never'}</small>
              </li>
            ))}
          </ul>
        )
      )}
    </Drawer>
  );
}

/* ---------------- workspace card ---------------- */

function WorkspaceCard({ ws, onOpen }: { ws: AdminCrmWorkspaceRow; onOpen: () => void }) {
  const health = deriveHealth(ws);
  return (
    <div className="panel pf-kpi" style={{ gap: 10 }}>
      <div className="panel-head" style={{ margin: 0 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</strong>
          <small style={{ color: 'var(--text-2)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.owner_email}</small>
        </div>
        <Chip tone={HEALTH_TONE[health]}>{health}</Chip>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip tone="accent">{ws.plan ?? 'Free'}</Chip>
        {ws.sequences_active > 0 && <Chip tone="success">{fmtNumber(ws.sequences_active)} active</Chip>}
        {ws.sequences_paused > 0 && <Chip tone="warn">{fmtNumber(ws.sequences_paused)} paused</Chip>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Campaigns', value: fmtNumber(ws.campaigns) },
          { label: 'Leads', value: fmtNumber(ws.leads) },
          { label: 'Enrolled', value: fmtNumber(ws.active_enrollments) },
        ].map((k) => (
          <div key={k.label} style={{ background: 'var(--panel-2, transparent)', border: '1px solid var(--border-soft)', borderRadius: 8, padding: '6px 8px' }}>
            <small style={{ color: 'var(--text-2)', display: 'block' }}>{k.label}</small>
            <strong>{k.value}</strong>
          </div>
        ))}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <small style={{ color: 'var(--text-2)' }}>Open rate</small>
          <small><strong>{ws.open_rate.toFixed(1)}%</strong></small>
        </div>
        <RateBar value={ws.open_rate} tone="var(--success)" />
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0 3px' }}>
          <small style={{ color: 'var(--text-2)' }}>Reply rate</small>
          <small><strong>{ws.reply_rate.toFixed(1)}%</strong></small>
        </div>
        <RateBar value={ws.reply_rate} tone="var(--accent)" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <small style={{ color: 'var(--text-2)' }}>{timeAgo(ws.last_activity_at) || 'never'}</small>
        <button className="btn btn-sm" onClick={onOpen}>Manage…</button>
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export function CrmManagementPage() {
  const overview = useAsync(getAdminCrmOverview);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState<EngagementTier | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  // close the drawer on Escape (matches the reference port)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const workspaces = overview.data?.workspaces ?? [];
  const planLabels = Array.from(new Set(workspaces.map((w) => w.plan ?? 'Free').filter(Boolean)));

  const filtered = workspaces.filter((ws) => {
    if (planFilter !== 'all' && (ws.plan ?? 'Free') !== planFilter) return false;
    if (activeOnly && ws.sequences_active === 0) return false;
    if (tierFilter !== 'all' && deriveEngagementTier(ws) !== tierFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !ws.name.toLowerCase().includes(q) && !ws.owner_email.toLowerCase().includes(q)) return false;
    return true;
  });

  const openWs = openId != null ? workspaces.find((w) => w.workspace_id === openId) ?? null : null;

  function exportWorkspaces() {
    downloadCsv(
      `crm-workspaces-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Workspace', 'Owner Email', 'Plan', 'Campaigns', 'Leads', 'Sequences Active', 'Sequences Paused', 'Enrollments', 'Open Rate %', 'Reply Rate %', 'Last Activity'],
      filtered.map((w) => [
        w.name, w.owner_email, w.plan ?? 'Free', w.campaigns, w.leads, w.sequences_active,
        w.sequences_paused, w.active_enrollments, w.open_rate.toFixed(1), w.reply_rate.toFixed(1),
        w.last_activity_at ?? '',
      ]),
    );
  }

  return (
    <>
      <PageHeader
        title="CRM management"
        subtitle="Cross-workspace view — campaign health, sequence control, opens and replies at a glance."
        actions={
          <button className="btn btn-sm" onClick={exportWorkspaces} disabled={filtered.length === 0}>
            Export CSV
          </button>
        }
      />

      {overview.error && <LoadError message={overview.error} onRetry={() => void overview.reload()} />}
      {overview.loading && !overview.data && <Skeleton rows={5} />}

      {overview.data && (
        <>
          <div className="pf-kpis">
            <div className="panel pf-kpi"><small>Workspaces w/ CRM</small><strong>{workspaces.length}</strong></div>
            <div className="panel pf-kpi"><small>Total campaigns</small><strong>{fmtNumber(overview.data.total_campaigns)}</strong></div>
            <div className="panel pf-kpi"><small>Total leads</small><strong>{fmtNumber(overview.data.total_leads)}</strong></div>
            <div className="panel pf-kpi">
              <small>Sequences</small>
              <strong>{fmtNumber(overview.data.sequences_active + overview.data.sequences_paused)}</strong>
              <small>{fmtNumber(overview.data.sequences_active)} active · {fmtNumber(overview.data.sequences_paused)} paused</small>
            </div>
            <div className="panel pf-kpi"><small>Avg open rate</small><strong>{overview.data.open_rate.toFixed(1)}%</strong></div>
            <div className="panel pf-kpi"><small>Emails sent 30d</small><strong>{fmtNumber(overview.data.emails_sent_30d)}</strong></div>
          </div>

          <div className="pf-filters">
            <input
              type="search"
              placeholder="Search workspace or owner…"
              aria-label="Search workspaces"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {['all', ...planLabels].map((p) => (
              <button
                key={p}
                className={`btn btn-sm${planFilter === p ? ' btn-primary' : ''}`}
                onClick={() => setPlanFilter(p)}
                aria-pressed={planFilter === p}
              >
                {p === 'all' ? 'All plans' : p}
              </button>
            ))}
            <button
              className={`btn btn-sm${activeOnly ? ' btn-primary' : ''}`}
              onClick={() => setActiveOnly((v) => !v)}
              aria-pressed={activeOnly}
            >
              Has active sequences
            </button>
            {(['high', 'medium', 'low'] as const).map((t) => (
              <button
                key={t}
                className={`btn btn-sm${tierFilter === t ? ' btn-primary' : ''}`}
                onClick={() => setTierFilter(tierFilter === t ? 'all' : t)}
                aria-pressed={tierFilter === t}
              >
                {t} engagement
              </button>
            ))}
            <small style={{ marginLeft: 'auto', color: 'var(--text-2)' }}>
              {filtered.length} of {workspaces.length} workspaces
            </small>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="No workspaces match your filters" />
          ) : (
            <div className="pf-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {filtered.map((ws) => (
                <WorkspaceCard key={ws.workspace_id} ws={ws} onOpen={() => setOpenId(ws.workspace_id)} />
              ))}
            </div>
          )}
        </>
      )}

      {openWs && (
        <WorkspaceDrawer
          ws={openWs}
          onClose={() => setOpenId(null)}
          onChanged={() => void overview.reload()}
        />
      )}
    </>
  );
}

export default CrmManagementPage;
