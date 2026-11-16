import { useMemo, useState } from 'react';
import { GlideSelect } from '../../components/GlideSelect';
import { PageHeader, Field, Chip } from '../../components/ui';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { Drawer, Modal } from '../../components/overlay';
import { useAsync } from '../../lib/hooks';
import {
  downloadCsv,
  getLlmPlanCaps,
  getLlmUsageByUser,
  getLlmUsageEvents,
  getLlmUsageSummary,
  updateLlmPlanCap,
} from '../../lib/platformAdmin';
import type {
  LlmModeCounts,
  LlmPerUserSummary,
  LlmPlanCapRow,
} from '../../lib/platformAdmin';
import { Bars, HBars } from './Bars';
import { Pager } from './shared';

/**
 * Platform admin · LLM usage & cost tracking (H2 port of the WarmPulse
 * "Provider Arena" page). Data comes from the FastAPI admin routes through
 * lib/platformAdmin: the month summary powers the provider arena + plan-cap
 * manager + per-workspace table, the event list powers the recent-activity
 * table, and the per-user route fills the drill-in drawer.
 *
 * Field mapping (honest — only what the backend really provides):
 *   Provider cards → summary.by_mode (A=Gemini primary, B=Claude fallback,
 *                    C=Static templates; D folds into the total only)
 *   Cost metrics   → summary totals only — the backend does NOT break cost
 *                    out per mode, so no per-provider cost columns exist.
 *   Plan caps      → /api/plans/all token_cap_per_month × by_user rollup
 *   Cap edit       → POST /admin/llm-usage/caps/{plan_id} (token_cap_per_month)
 *   Table rows     → summary.by_user (tokens_mtd, cost_cents_mtd, cap, pct_used)
 */

/** Mode → provider identity. Constant; stats always come from by_mode. */
const PROVIDERS: Array<{ mode: 'A' | 'B' | 'C'; name: string; label: string; badge: string }> = [
  { mode: 'A', name: 'Gemini', label: 'Google Gemini', badge: 'Primary' },
  { mode: 'B', name: 'Claude', label: 'Anthropic Claude', badge: 'Fallback' },
  { mode: 'C', name: 'Static', label: 'Static templates', badge: 'Last resort' },
];

const usd = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const abbrev = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);

const MODE_TONES: Record<string, 'accent' | 'success' | 'warn' | 'neutral'> = {
  A: 'accent',
  B: 'warn',
  C: 'success',
  D: 'neutral',
};

type MetricKey = 'share' | 'tokens';
const METRICS: Array<{ key: MetricKey; label: string; desc: string }> = [
  { key: 'share', label: 'Token share', desc: '% of total tokens consumed this cycle' },
  { key: 'tokens', label: 'Tokens MTD', desc: 'Total tokens consumed this cycle' },
];

/** Plan rollup for the cap manager: cap from the plan catalogue, usage from by_user. */
interface PlanCapView {
  plan_id: string;
  plan: string;
  cap_tokens: number;
  used_tokens: number;
  workspaces: number;
}

function rollupPlanCaps(caps: LlmPlanCapRow[], users: LlmPerUserSummary[]): PlanCapView[] {
  const usedByPlan = new Map<string, { used: number; count: number }>();
  for (const u of users) {
    const key = (u.plan ?? 'unknown').toLowerCase();
    const e = usedByPlan.get(key) ?? { used: 0, count: 0 };
    e.used += u.tokens_mtd;
    e.count += 1;
    usedByPlan.set(key, e);
  }
  return caps.map((c) => {
    const found = usedByPlan.get(c.name.toLowerCase()) ?? { used: 0, count: 0 };
    return { plan_id: c.plan_id, plan: c.name, cap_tokens: c.cap_tokens, used_tokens: found.used, workspaces: found.count };
  });
}

/* ---------------- per-user drill-in drawer ---------------- */

function UserDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data: d, error, reload } = useAsync(() => getLlmUsageByUser(userId), [userId]);
  const modes: LlmModeCounts = d?.by_mode ?? { A: 0, B: 0, C: 0, D: 0 };
  const modeRows = [
    { label: 'A · Gemini', value: modes.A },
    { label: 'B · Claude', value: modes.B },
    { label: 'C · Static', value: modes.C },
    { label: 'D · Other', value: modes.D },
  ].filter((r) => r.value > 0);

  return (
    <Drawer title={d?.email ?? 'Workspace'} subtitle={d?.plan ? `Plan: ${d.plan}` : undefined} onClose={onClose}>
      {error && <LoadError message={error} onRetry={() => void reload()} />}
      {!d && !error && <Skeleton rows={4} />}
      {d && (
        <>
          <dl className="pf-dl">
            <dt>Tokens MTD</dt><dd>{abbrev(d.tokens_mtd)}</dd>
            <dt>Cost MTD</dt><dd>{usd(d.cost_cents_mtd)}</dd>
            <dt>Plan cap</dt><dd>{d.cap > 0 ? `${abbrev(d.cap)} (${d.pct_used.toFixed(1)}% used)` : '—'}</dd>
          </dl>
          <h3 className="pf-h2">Tokens per day</h3>
          {d.time_series.points.length > 0 ? (
            <Bars
              label="Tokens per day this month"
              data={d.time_series.points.map((p) => ({ label: p.date, value: p.tokens }))}
              fmt={abbrev}
            />
          ) : (
            <p className="panel-note">No usage recorded yet this month.</p>
          )}
          <h3 className="pf-h2">Mode split</h3>
          {modeRows.length > 0 ? (
            <HBars label="Token split by provider mode" rows={modeRows} />
          ) : (
            <p className="panel-note">No mode data.</p>
          )}
        </>
      )}
    </Drawer>
  );
}

/* ---------------- cap edit dialog ---------------- */

function CapDialog({
  plan,
  demo,
  onClose,
  onSaved,
}: {
  plan: PlanCapView;
  demo: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(plan.cap_tokens));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  async function save() {
    setBusy(true);
    setError('');
    const r = await updateLlmPlanCap(plan.plan_id, Math.round(parsed));
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success(`${plan.plan} cap set to ${abbrev(Math.round(parsed))} tokens.`);
    onSaved();
  }

  return (
    <Modal
      title={`Adjust ${plan.plan} cap`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" disabled={!valid || busy || demo} onClick={() => void save()}>
            {busy ? 'Working…' : 'Save cap'}
          </button>
        </>
      }
    >
      {demo && <p role="note">Demo data is read-only.</p>}
      <p className="panel-note">
        Currently using <strong>{abbrev(plan.used_tokens)}</strong> of <strong>{abbrev(plan.cap_tokens)}</strong> tokens.
        The cap applies to every workspace on {plan.plan} for the current billing cycle.
      </p>
      <Field label="New cap (tokens per month)" hint="0 disables AI generation for the plan.">
        <input type="number" min={0} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {error && <p className="pf-error" role="alert">{error}</p>}
    </Modal>
  );
}

/* ---------------- page ---------------- */

export function LlmUsagePage({ demo = false }: { demo?: boolean }) {
  const summary = useAsync(getLlmUsageSummary);
  const caps = useAsync(getLlmPlanCaps);
  const [mode, setMode] = useState('');
  const [page, setPage] = useState(1);
  const events = useAsync(() => getLlmUsageEvents({ page, page_size: 25, mode: mode || undefined }), [page, mode], {
    keepStale: true,
  });

  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanCapView | null>(null);
  const [metric, setMetric] = useState<MetricKey>('share');

  const byMode: LlmModeCounts = summary.data?.by_mode ?? { A: 0, B: 0, C: 0, D: 0 };
  const totalTokens = byMode.A + byMode.B + byMode.C + byMode.D;

  const providerStats = useMemo(
    () =>
      PROVIDERS.map((p) => {
        const tokens = byMode[p.mode];
        return { mode: p.mode, tokens, share: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0 };
      }),
    [byMode, totalTokens],
  );

  const planCaps = useMemo(
    () => rollupPlanCaps(caps.data ?? [], summary.data?.by_user ?? []),
    [caps.data, summary.data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (summary.data?.by_user ?? []).filter((u) => {
      if (planFilter && (u.plan ?? '').toLowerCase() !== planFilter.toLowerCase()) return false;
      if (q && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [summary.data, planFilter, search]);

  const metricDef = METRICS.find((m) => m.key === metric) ?? METRICS[0]!;
  const maxStat = metric === 'share' ? 100 : Math.max(1, ...providerStats.map((p) => p.tokens));
  const loading = summary.loading && !summary.data;

  function exportWorkspaces() {
    downloadCsv(
      `llm-usage-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Workspace', 'Plan', 'Tokens MTD', 'Cap tokens', '% of cap', 'Cost MTD USD'],
      rows.map((u) => [u.email, u.plan ?? '', u.tokens_mtd, u.cap || '', u.pct_used.toFixed(1), (u.cost_cents_mtd / 100).toFixed(2)]),
    );
  }

  return (
    <>
      <PageHeader
        title="LLM usage"
        subtitle="Provider mix, month-to-date spend and per-plan token caps for AI content generation."
        actions={
          <button className="btn btn-sm" onClick={exportWorkspaces} disabled={rows.length === 0}>
            Export CSV
          </button>
        }
      />

      {summary.error && <LoadError message={summary.error} onRetry={() => void summary.reload()} />}
      {loading && <Skeleton rows={4} />}

      {summary.data && (
        <>
          {/* summary KPIs */}
          <div className="pf-kpis">
            <div className="panel pf-kpi">
              <small>Tokens MTD</small>
              <strong>{abbrev(summary.data.total_tokens_mtd)}</strong>
              <small>all providers, current cycle</small>
            </div>
            <div className="panel pf-kpi">
              <small>Cost MTD</small>
              <strong>{usd(summary.data.total_cost_cents_mtd)}</strong>
              <small>platform-wide</small>
            </div>
            <div className="panel pf-kpi">
              <small>Forecast EOM</small>
              <strong>{usd(summary.data.forecast_eom_cents)}</strong>
              <small>run-rate projection</small>
            </div>
            <div className="panel pf-kpi">
              <small>Workspaces billed</small>
              <strong>{summary.data.by_user.length}</strong>
              <small>with usage this cycle</small>
            </div>
          </div>

          {/* provider arena */}
          <section className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">
              <h2 className="pf-h2" style={{ margin: 0 }}>Provider arena</h2>
              <span className="chip chip-accent">Routing: Gemini → Claude → Static</span>
            </div>
            <p className="panel-note">
              Token split by content mode. Cost is tracked platform-wide only — the API does not break spend out per provider.
              {byMode.D > 0 && ' Mode D (unclassified) is included in the totals.'}
            </p>
            <div className="pf-filters" role="group" aria-label="Compare providers by">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  className={`btn btn-sm${metric === m.key ? ' btn-primary' : ''}`}
                  onClick={() => setMetric(m.key)}
                  aria-pressed={metric === m.key}
                >
                  {m.label}
                </button>
              ))}
              <small style={{ color: 'var(--text-2)' }}>{metricDef.desc}</small>
            </div>
            <div className="pf-grid">
              {providerStats.map((p) => {
                const cfg = PROVIDERS.find((c) => c.mode === p.mode)!;
                const value = metric === 'share' ? p.share : p.tokens;
                const pct = Math.round((value / maxStat) * 100);
                return (
                  <div key={p.mode} className="panel pf-kpi">
                    <div className="panel-head" style={{ margin: 0 }}>
                      <strong>{cfg.name}</strong>
                      <Chip tone={MODE_TONES[p.mode]}>{cfg.badge}</Chip>
                    </div>
                    <strong style={{ fontSize: 26 }}>
                      {metric === 'share' ? `${p.share.toFixed(1)}%` : abbrev(p.tokens)}
                    </strong>
                    <span className="pf-hbar-track" aria-hidden>
                      <span style={{ width: `${pct}%` }} />
                    </span>
                    <small>
                      {abbrev(p.tokens)} tokens · {p.share.toFixed(1)}% share
                      {p.mode === 'C' && p.tokens === 0 ? ' · zero-cost templates' : ''}
                    </small>
                  </div>
                );
              })}
            </div>
          </section>

          {/* plan cap manager */}
          <section className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">
              <h2 className="pf-h2" style={{ margin: 0 }}>Plan cap manager</h2>
              <small>per-plan token caps · current cycle</small>
            </div>
            {caps.error && <LoadError message={caps.error} onRetry={() => void caps.reload()} />}
            {caps.loading && !caps.data && <Skeleton rows={2} />}
            {caps.data && planCaps.length === 0 && <EmptyState title="No plans configured" />}
            {caps.data && planCaps.length > 0 && (
              <div className="pf-grid">
                {planCaps.map((c) => {
                  const pct = c.cap_tokens > 0 ? Math.round((c.used_tokens / c.cap_tokens) * 100) : 0;
                  const tone = pct >= 90 ? 'error' : pct >= 70 ? 'warn' : 'success';
                  return (
                    <div key={c.plan_id} className="panel pf-kpi">
                      <div className="panel-head" style={{ margin: 0 }}>
                        <strong>{c.plan}</strong>
                        <Chip tone={tone === 'error' ? 'warn' : tone === 'warn' ? 'warn' : 'success'}>{pct}% used</Chip>
                      </div>
                      <strong>{abbrev(c.used_tokens)}</strong>
                      <span className="pf-hbar-track" aria-hidden>
                        <span
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background: pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)',
                          }}
                        />
                      </span>
                      <small>
                        of {abbrev(c.cap_tokens)} tokens · {c.workspaces} workspace{c.workspaces === 1 ? '' : 's'}
                        {pct >= 90 ? ' · nearing cap' : ''}
                      </small>
                      <button className="btn btn-sm" onClick={() => setEditing(c)}>Adjust cap…</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* workspace usage table */}
          <section className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">
              <h2 className="pf-h2" style={{ margin: 0 }}>Workspace usage</h2>
              <small>{rows.length} of {summary.data.by_user.length} workspaces</small>
            </div>
            <div className="pf-filters">
              <input
                type="search"
                placeholder="Search email…"
                aria-label="Search workspace email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <GlideSelect
                ariaLabel="Filter by plan"
                value={planFilter}
                onChange={(v) => setPlanFilter(v)}
                menuWidth={170}
                options={[
                  { value: '', label: 'All plans' },
                  ...planCaps.map((c) => ({ value: c.plan, label: c.plan })),
                ]}
              />
            </div>
            {rows.length === 0 ? (
              <EmptyState title="No workspaces match" />
            ) : (
              <div className="table-wrap pf-table">
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th>Workspace</th><th>Plan</th><th>Tokens MTD</th><th>% of cap</th><th>Cost MTD</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr key={u.user_id}>
                        <td>
                          <button className="row-link" onClick={() => setOpenUser(u.user_id)}>{u.email}</button>
                        </td>
                        <td>{u.plan ?? '—'}</td>
                        <td>{abbrev(u.tokens_mtd)}</td>
                        <td>
                          <Chip tone={u.pct_used >= 90 ? 'warn' : u.pct_used >= 70 ? 'warn' : 'neutral'}>
                            {u.cap > 0 ? `${Math.round(u.pct_used)}%` : '—'}
                          </Chip>
                        </td>
                        <td>{usd(u.cost_cents_mtd)}</td>
                        <td>
                          <button className="btn btn-sm" onClick={() => setOpenUser(u.user_id)}>Details</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* recent usage events (raw list endpoint) */}
      <section className="panel">
        <div className="panel-head">
          <h2 className="pf-h2" style={{ margin: 0 }}>Recent usage events</h2>
          <small>newest first · raw ledger</small>
        </div>
        <div className="pf-filters">
          <GlideSelect
            ariaLabel="Filter by mode"
            value={mode}
            onChange={(v) => { setMode(v); setPage(1); }}
            menuWidth={170}
            options={[
              { value: '', label: 'All modes' },
              { value: 'A', label: 'A · Gemini' },
              { value: 'B', label: 'B · Claude' },
              { value: 'C', label: 'C · Static' },
              { value: 'D', label: 'D · Other' },
            ]}
          />
        </div>
        {events.error && <LoadError message={events.error} onRetry={() => void events.reload()} />}
        {events.loading && !events.data && <Skeleton rows={3} />}
        {events.data && events.data.items.length === 0 && <EmptyState title="No usage events" />}
        {events.data && events.data.items.length > 0 && (
          <>
            <div className="table-wrap pf-table">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>When</th><th>User</th><th>Plan</th><th>Mode</th><th>Prompt</th><th>Completion</th><th>Total</th><th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.items.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.created_at).toLocaleString()}</td>
                      <td>{e.user_email ?? '—'}</td>
                      <td>{e.plan_name ?? '—'}</td>
                      <td><Chip tone={MODE_TONES[e.mode] ?? 'neutral'}>{e.mode}</Chip></td>
                      <td>{abbrev(e.prompt_tokens)}</td>
                      <td>{abbrev(e.completion_tokens)}</td>
                      <td><strong>{abbrev(e.total_tokens)}</strong></td>
                      <td>{usd(e.cost_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={events.data.page}
              count={events.data.total}
              next={events.data.page * events.data.page_size < events.data.total ? 'more' : null}
              previous={events.data.page > 1 ? 'back' : null}
              onPage={setPage}
            />
          </>
        )}
      </section>

      {openUser && <UserDrawer userId={openUser} onClose={() => setOpenUser(null)} />}
      {editing && (
        <CapDialog
          plan={editing}
          demo={demo}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void summary.reload();
            void caps.reload();
          }}
        />
      )}
    </>
  );
}

export default LlmUsagePage;
