/**
 * Platform admin Reports page — ported from frontend-warmpulse ReportsPage
 * (RP1 report studio) to the merged console conventions.
 *
 * Logic + data kept: report-type picker (GET /admin/reports/types), date
 * presets, csv/pdf/xlsx export format, column picker, segmentation filters
 * (plan / region / status), group-by, compare-previous, output options,
 * live preview via POST /admin/reports/generate (summary tiles + table +
 * CSS bar view), download via POST /admin/reports/export (blob), persisted
 * schedules (list / create / toggle / delete), session-local recent-exports
 * list and save-as-template chips, and a schedules CSV export.
 *
 * Restyled: two-column builder grid on pf- classes instead of the animated
 * glass studio; no framer-motion.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Chip, Field, PageHeader, SectionLabel, Toggle } from '../../components/ui';
import { EmptyState, LoadError, Skeleton, toast } from '../../components/feedback';
import { useAsync } from '../../lib/hooks';
import { fmtDateTime, fmtNumber, fmtTime } from '../../lib/format';
import {
  createReportSchedule,
  deleteReportSchedule,
  downloadCsv,
  exportReport,
  generateReport,
  listAdminReportTypes,
  listReportSchedules,
  updateReportSchedule,
} from '../../lib/platformAdmin';
import type { ExportFormat, GenerateResult, GroupBy, ReportScheduleOut, ReportTypeItem } from '../../lib/platformAdmin';

type UICadence = 'daily' | 'weekly' | 'monthly';
type ChartView = 'Table' | 'Bar';

const DATE_PRESETS = [
  { preset: '7d', label: 'Last 7 days' },
  { preset: '30d', label: 'Last 30 days' },
  { preset: '90d', label: 'Last 90 days' },
  { preset: 'mtd', label: 'Month to date' },
  { preset: 'ytd', label: 'Year to date' },
] as const;

const GROUP_BY_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: 'None', value: 'none' },
  { label: 'Plan', value: 'plan' },
  { label: 'Month', value: 'month' },
  { label: 'Region', value: 'region' },
];

const CADENCE_LABELS: Record<UICadence, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FORMAT_LABELS: Record<ExportFormat, string> = { csv: 'CSV', pdf: 'PDF', xlsx: 'XLSX' };

const ALL_PLANS = ['Free', 'Starter', 'Pro', 'Pro Plus', 'Agency'];

interface SessionExportRow {
  id: string;
  typeKey: string;
  typeLabel: string;
  format: ExportFormat;
  createdAt: string;
}

/* ---------------- live preview ---------------- */

function LivePreview({
  typeItem,
  result,
  pending,
  preset,
  groupBy,
  compare,
  chartView,
}: {
  typeItem: ReportTypeItem | null;
  result: GenerateResult | null;
  pending: boolean;
  preset: string;
  groupBy: GroupBy;
  compare: boolean;
  chartView: ChartView;
}) {
  const presetLabel = DATE_PRESETS.find((p) => p.preset === preset)?.label ?? preset;

  // first numeric column feeds the bar view (same rule as the reference)
  const bars = useMemo(() => {
    if (!result || result.rows.length === 0) return [];
    const numCol = result.columns.find((c) => typeof result.rows[0]?.[c] === 'number');
    if (!numCol) return [];
    const vals = result.rows.map((r) => Number(r[numCol] ?? 0));
    const max = Math.max(...vals, 1);
    return result.rows.slice(0, 10).map((r, i) => ({
      label: String(r[result.columns[0] ?? ''] ?? `R${i + 1}`).slice(0, 8),
      value: Number(r[numCol] ?? 0),
      pct: (Number(r[numCol] ?? 0) / max) * 100,
    }));
  }, [result]);

  if (pending) return <Skeleton rows={4} />;

  if (!result) {
    return (
      <EmptyState title={typeItem ? 'Press Generate to preview live data' : 'Select a report type to begin'}>
        {typeItem?.description}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="pf-actions" style={{ marginTop: 0, marginBottom: 10 }}>
        {groupBy !== 'none' && <Chip tone="warn">Grouped by {groupBy}</Chip>}
        <Chip tone="neutral">{presetLabel}</Chip>
        <span className="field-hint">
          Est. output: <strong>{fmtNumber(result.estimated_rows)}</strong> rows · {result.columns.length} cols
        </span>
      </div>

      {result.summary.length > 0 && (
        <div className="pf-kpis" style={{ marginBottom: 10 }}>
          {result.summary.map((s) => (
            <div className="pf-kpi" key={s.label}>
              <strong>{s.value}</strong>
              <small>{s.label}</small>
              {compare && s.delta_pct != null && (
                <small style={{ color: s.delta_pct >= 0 ? 'var(--ok-ink, #3ddc97)' : 'var(--danger-ink, #ff5c7a)' }}>
                  {s.delta_pct >= 0 ? '+' : ''}
                  {s.delta_pct.toFixed(1)}% vs previous
                </small>
              )}
            </div>
          ))}
        </div>
      )}

      {chartView === 'Table' ? (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>{result.columns.slice(0, 5).map((h) => <th key={h}>{h.replace(/_/g, ' ')}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 6).map((row, i) => (
                <tr key={i}>
                  {result.columns.slice(0, 5).map((col) => {
                    const val = String(row[col] ?? '—');
                    const isDelta = col.includes('pct') || col.includes('change') || col.includes('%');
                    return <td key={col}>{isDelta && (val.startsWith('+') || val.startsWith('-')) ? <Chip tone={val.startsWith('+') ? 'success' : 'warn'}>{val}</Chip> : val}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : bars.length > 0 ? (
        <ul className="pf-hbars">
          {bars.map((b) => (
            <li key={b.label}>
              <span title={b.label}>{b.label}</span>
              <span className="pf-hbar-track">
                <span style={{ width: `${b.pct}%` }} />
              </span>
              <span>{fmtNumber(b.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No numeric column to chart — switch to Table" />
      )}
      <p className="field-hint" style={{ marginTop: 8 }}>
        Live preview of the first rows — the actual export includes all {fmtNumber(result.estimated_rows)} rows.
      </p>
    </>
  );
}

/* ---------------- schedules table ---------------- */

function ScheduleRow({
  schedule,
  busy,
  onToggle,
  onDelete,
}: {
  schedule: ReportScheduleOut;
  busy: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr>
      <td>
        <strong>{schedule.name}</strong>
        <div>
          <small>{schedule.report_type.replace(/_/g, ' ')}</small>
        </div>
      </td>
      <td>
        <Chip tone="accent">{FORMAT_LABELS[schedule.format] ?? schedule.format}</Chip>
      </td>
      <td>{CADENCE_LABELS[schedule.cadence] ?? schedule.cadence}</td>
      <td title={schedule.recipients.join(', ')}>{schedule.recipients.length} recipient{schedule.recipients.length === 1 ? '' : 's'}</td>
      <td>{schedule.next_run_at ? fmtDateTime(schedule.next_run_at) : '—'}</td>
      <td>
        <Chip tone={schedule.enabled ? 'success' : 'neutral'}>{schedule.enabled ? 'Active' : 'Paused'}</Chip>
      </td>
      <td>
        <div className="pf-actions" style={{ marginTop: 0, gap: 6 }}>
          <button className="btn btn-sm" disabled={busy} onClick={() => onToggle(schedule.id, !schedule.enabled)}>
            {schedule.enabled ? 'Pause' : 'Activate'}
          </button>
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => onDelete(schedule.id)}>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ---------------- page ---------------- */

export function AdminReportsPage({ demo = false }: { demo?: boolean }) {
  const typesQ = useAsync(() => listAdminReportTypes(), []);
  const schedulesQ = useAsync(() => listReportSchedules(), []);
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const schedules = useMemo(() => schedulesQ.data ?? [], [schedulesQ.data]);

  // builder state
  const [typeKey, setTypeKey] = useState('');
  const [preset, setPreset] = useState<string>('30d');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [genBusy, setGenBusy] = useState(false);
  const [expBusy, setExpBusy] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [chartView, setChartView] = useState<ChartView>('Table');

  // options (kept for the "will include" summary — the wire sends compare + columns)
  const [optCharts, setOptCharts] = useState(true);
  const [optSummary, setOptSummary] = useState(true);
  const [optRawRows, setOptRawRows] = useState(false);
  const [optWorkspace, setOptWorkspace] = useState(true);

  const [cols, setCols] = useState<Set<string>>(new Set());
  const [filterPlans, setFilterPlans] = useState<Set<string>>(new Set(ALL_PLANS));
  const [filterRegion, setFilterRegion] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [comparePrev, setComparePrev] = useState(false);

  // delivery / schedule
  const [recipientInput, setRecipientInput] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [cadence, setCadence] = useState<UICadence>('weekly');
  const [schedName, setSchedName] = useState('');
  const [schedBusy, setSchedBusy] = useState(false);

  // session-local template + export history
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<{ id: string; name: string; typeKey: string }[]>([]);
  const [sessionExports, setSessionExports] = useState<SessionExportRow[]>([]);

  const activeType = types.find((t) => t.key === typeKey) ?? null;
  const activeCols = activeType?.available_columns ?? [];

  // auto-select first type + default columns when types load / type changes
  useEffect(() => {
    if (types.length > 0 && !types.some((t) => t.key === typeKey)) setTypeKey(types[0]?.key ?? '');
  }, [types, typeKey]);
  useEffect(() => {
    if (typeKey) {
      const found = types.find((t) => t.key === typeKey);
      if (found) setCols(new Set(found.default_columns));
      setResult(null);
    }
    // re-run only when the type identity changes; `types` is captured on purpose
  }, [typeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildBody = useCallback(
    () => ({
      type: typeKey,
      preset,
      plan_filter: filterPlans.size < ALL_PLANS.length ? Array.from(filterPlans) : [],
      region_filter: filterRegion !== 'All' ? [filterRegion] : [],
      status_filter: filterStatus !== 'All' ? [filterStatus] : [],
      group_by: groupBy,
      columns: cols.size > 0 ? Array.from(cols) : [],
      compare_previous: comparePrev,
    }),
    [typeKey, preset, filterPlans, filterRegion, filterStatus, groupBy, cols, comparePrev],
  );

  async function handleGenerate() {
    if (genBusy || !typeKey) return;
    setGenBusy(true);
    setResult(null);
    try {
      const r = await generateReport(buildBody());
      setResult(r);
      toast.success(`${activeType?.label ?? 'Report'} data loaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGenBusy(false);
    }
  }

  async function handleDownload() {
    if (!typeKey) return;
    setExpBusy(true);
    const r = await exportReport({ ...buildBody(), format }, `report-${typeKey}-${new Date().toISOString().slice(0, 10)}.${format}`);
    setExpBusy(false);
    if (!r.ok) return toast.error(r.error);
    setSessionExports((prev) => [{ id: `exp-${Date.now()}`, typeKey, typeLabel: activeType?.label ?? typeKey, format, createdAt: new Date().toISOString() }, ...prev]);
    toast.success(`${activeType?.label ?? 'Report'} downloaded as ${format.toUpperCase()}`);
  }

  const addRecipient = useCallback(() => {
    const v = recipientInput.trim();
    if (!v) return;
    if (!recipients.includes(v)) setRecipients((prev) => [...prev, v]);
    setRecipientInput('');
  }, [recipientInput, recipients]);

  const onRecipientKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') addRecipient();
    },
    [addRecipient],
  );

  async function handleCreateSchedule() {
    if (!typeKey || recipients.length === 0) return toast.error('Select a report type and add at least one recipient before scheduling.');
    const name = schedName.trim() || `${activeType?.label ?? typeKey} — ${cadence}`;
    setSchedBusy(true);
    const r = await createReportSchedule({
      name,
      report_type: typeKey,
      cadence,
      recipients,
      format,
      filters: {
        preset,
        plan_filter: filterPlans.size < ALL_PLANS.length ? Array.from(filterPlans) : [],
        region_filter: filterRegion !== 'All' ? [filterRegion] : [],
        status_filter: filterStatus !== 'All' ? [filterStatus] : [],
        group_by: groupBy,
        columns: Array.from(cols),
      },
      enabled: true,
    });
    setSchedBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Schedule "${name}" created`);
    setSchedName('');
    setScheduleOn(false);
    void schedulesQ.reload();
  }

  async function handleToggleSchedule(id: string, enabled: boolean) {
    const r = await updateReportSchedule(id, { enabled });
    if (!r.ok) return toast.error(r.error);
    void schedulesQ.reload();
  }

  async function handleDeleteSchedule(id: string) {
    const r = await deleteReportSchedule(id);
    if (!r.ok) return toast.error(r.error);
    toast.success('Schedule deleted');
    void schedulesQ.reload();
  }

  const toggleCol = (c: string) =>
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(c)) {
        if (next.size > 1) next.delete(c);
      } else next.add(c);
      return next;
    });

  const togglePlan = (p: string) =>
    setFilterPlans((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size > 1) next.delete(p);
      } else next.add(p);
      return next;
    });

  function exportSchedules() {
    downloadCsv(
      `reports-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Name', 'Report Type', 'Cadence', 'Format', 'Recipients', 'Enabled', 'Last Run', 'Next Run', 'Created At'],
      schedules.map((r) => [r.name, r.report_type, r.cadence, r.format, r.recipients.join('; '), r.enabled ? 'yes' : 'no', r.last_run_at ?? '', r.next_run_at ?? '', r.created_at]),
    );
  }

  return (
    <>
      <PageHeader
        title="Report studio"
        subtitle="Platform-wide reports · build, preview, export, schedule"
        actions={
          <button className="btn" onClick={exportSchedules} disabled={schedules.length === 0}>
            Export schedules CSV
          </button>
        }
      />

      {typesQ.error && <LoadError message={typesQ.error} onRetry={() => void typesQ.reload()} />}
      {!typesQ.data && !typesQ.error && <Skeleton rows={4} />}

      {typesQ.data && (
        <div className="pf-studio">
          {/* ── builder column ── */}
          <div style={{ display: 'grid', gap: 12 }}>
            <section className="card pf-plan">
              <SectionLabel>1 · Report type</SectionLabel>
              {types.length === 0 && <EmptyState title="No report types available yet">The backend reports module is not enabled.</EmptyState>}
              {types.map((rt) => (
                <button key={rt.key} className={`btn btn-sm pf-pick${rt.key === typeKey ? ' btn-primary' : ''}`} onClick={() => setTypeKey(rt.key)}>
                  {rt.label}
                  {rt.key === typeKey && <small>{rt.description}</small>}
                </button>
              ))}
            </section>

            <section className="card pf-plan">
              <SectionLabel>2 · Date range</SectionLabel>
              <div className="pf-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                {DATE_PRESETS.map((dp) => (
                  <button key={dp.preset} className={`btn btn-sm${dp.preset === preset ? ' btn-primary' : ''}`} onClick={() => setPreset(dp.preset)}>
                    {dp.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="card pf-plan">
              <SectionLabel>3 · Export format</SectionLabel>
              <div className="pf-actions" style={{ marginTop: 0 }}>
                {(['csv', 'pdf', 'xlsx'] as ExportFormat[]).map((f) => (
                  <button key={f} className={`btn btn-sm${f === format ? ' btn-primary' : ''}`} onClick={() => setFormat(f)}>
                    {FORMAT_LABELS[f]}
                  </button>
                ))}
              </div>
              {(format === 'pdf' || format === 'xlsx') && (
                <p className="field-hint">{format.toUpperCase()} needs server-side deps (reportlab / openpyxl) — if unavailable the server falls back with an error message.</p>
              )}
            </section>

            <section className="card pf-plan">
              <SectionLabel>4 · Columns / metrics</SectionLabel>
              {activeCols.length === 0 ? (
                <p className="field-hint">Select a report type to choose columns.</p>
              ) : (
                <>
                  <div className="pf-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                    {activeCols.map((c) => (
                      <button key={c} className={`btn btn-sm${cols.has(c) ? ' btn-primary' : ''}`} onClick={() => toggleCol(c)}>
                        {c.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">
                    {cols.size} of {activeCols.length} columns selected
                  </p>
                </>
              )}
            </section>

            <section className="card pf-plan">
              <SectionLabel>5 · Segmentation</SectionLabel>
              <Field label="Plan">
                <div className="pf-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                  {ALL_PLANS.map((p) => (
                    <button key={p} className={`btn btn-sm${filterPlans.has(p) ? ' btn-primary' : ''}`} onClick={() => togglePlan(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Region">
                <div className="pf-actions" style={{ marginTop: 0 }}>
                  {(['India', 'International', 'All'] as const).map((r) => (
                    <button key={r} className={`btn btn-sm${filterRegion === r ? ' btn-primary' : ''}`} onClick={() => setFilterRegion(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Status">
                <div className="pf-actions" style={{ marginTop: 0 }}>
                  {(['Active', 'All'] as const).map((st) => (
                    <button key={st} className={`btn btn-sm${filterStatus === st ? ' btn-primary' : ''}`} onClick={() => setFilterStatus(st)}>
                      {st}
                    </button>
                  ))}
                </div>
              </Field>
            </section>

            <section className="card pf-plan">
              <SectionLabel>6 · Group by</SectionLabel>
              <div className="pf-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                {GROUP_BY_OPTIONS.map((o) => (
                  <button key={o.value} className={`btn btn-sm${groupBy === o.value ? ' btn-primary' : ''}`} onClick={() => setGroupBy(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="card pf-plan">
              <SectionLabel>7 · Options</SectionLabel>
              <Toggle label="Include charts" checked={optCharts} onChange={setOptCharts} />
              <Toggle label="Executive summary" checked={optSummary} onChange={setOptSummary} />
              <Toggle label="Include raw data rows" checked={optRawRows} onChange={setOptRawRows} />
              <Toggle label="Per-workspace breakdown" checked={optWorkspace} onChange={setOptWorkspace} />
              <Toggle label="Compare to previous period" checked={comparePrev} onChange={setComparePrev} />
            </section>

            <section className="card pf-plan">
              <SectionLabel>8 · Delivery &amp; automation</SectionLabel>
              <Field label="Email recipients">
                <div className="pf-actions" style={{ marginTop: 0 }}>
                  <input type="email" placeholder="Add email…" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} onKeyDown={onRecipientKey} aria-label="Add recipient email" />
                  <button className="btn btn-sm" onClick={addRecipient}>
                    Add
                  </button>
                </div>
              </Field>
              {recipients.length > 0 && (
                <div className="pf-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                  {recipients.map((r) => (
                    <Chip key={r} tone="accent">
                      {r}
                      <button className="icon-btn" aria-label={`Remove ${r}`} onClick={() => setRecipients((prev) => prev.filter((x) => x !== r))} style={{ marginLeft: 4 }}>
                        ×
                      </button>
                    </Chip>
                  ))}
                </div>
              )}
              <Field label="Save as template (session only)">
                <div className="pf-actions" style={{ marginTop: 0 }}>
                  <input placeholder="Template name…" value={templateName} onChange={(e) => setTemplateName(e.target.value)} aria-label="Template name" />
                  <button
                    className="btn btn-sm"
                    disabled={!templateName.trim() || !typeKey}
                    onClick={() => {
                      setTemplates((prev) => [{ id: `tpl-${Date.now()}`, name: templateName.trim(), typeKey }, ...prev]);
                      setTemplateName('');
                    }}
                  >
                    Save
                  </button>
                </div>
              </Field>
              {templates.length > 0 && (
                <div className="pf-actions" style={{ marginTop: 0, flexWrap: 'wrap' }}>
                  {templates.map((t) => (
                    <Chip key={t.id} tone="success">
                      {t.name}
                      <button className="icon-btn" aria-label={`Remove template ${t.name}`} onClick={() => setTemplates((prev) => prev.filter((x) => x.id !== t.id))} style={{ marginLeft: 4 }}>
                        ×
                      </button>
                    </Chip>
                  ))}
                </div>
              )}
              <Toggle label="Schedule recurring report (persisted)" checked={scheduleOn} onChange={setScheduleOn} />
              {scheduleOn && (
                <>
                  <Field label="Schedule name (optional)">
                    <input value={schedName} onChange={(e) => setSchedName(e.target.value)} placeholder={`${activeType?.label ?? 'Report'} — ${cadence}`} />
                  </Field>
                  <Field label="Sending pace">
                    <div className="pf-actions" style={{ marginTop: 0 }}>
                      {(['daily', 'weekly', 'monthly'] as UICadence[]).map((c) => (
                        <button key={c} className={`btn btn-sm${cadence === c ? ' btn-primary' : ''}`} onClick={() => setCadence(c)}>
                          {CADENCE_LABELS[c]}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <button className="btn btn-primary" style={{ width: '100%' }} disabled={schedBusy || demo} onClick={() => void handleCreateSchedule()}>
                    {schedBusy ? 'Creating…' : 'Create schedule'}
                  </button>
                </>
              )}
            </section>

            <button className="btn btn-primary" disabled={genBusy || !typeKey || demo} onClick={() => void handleGenerate()}>
              {genBusy ? 'Generating…' : 'Generate report'}
            </button>
            <button className="btn" disabled={expBusy || !typeKey || demo} onClick={() => void handleDownload()}>
              {expBusy ? 'Exporting…' : `Download ${FORMAT_LABELS[format]}`}
            </button>
            {demo && <p className="field-hint">Demo data is read-only — connect to the live server to generate or export.</p>}
          </div>

          {/* ── preview column ── */}
          <div style={{ display: 'grid', gap: 12 }}>
            <section className="card pf-plan">
              <div className="pf-actions" style={{ marginTop: 0, marginBottom: 10 }}>
                <strong>Live preview</strong>
                <span style={{ marginLeft: 'auto' }} />
                {(['Table', 'Bar'] as ChartView[]).map((v) => (
                  <button key={v} className={`btn btn-sm${chartView === v ? ' btn-primary' : ''}`} onClick={() => setChartView(v)}>
                    {v}
                  </button>
                ))}
                {result && <Chip tone="success">Live data</Chip>}
              </div>
              <LivePreview typeItem={activeType} result={result} pending={genBusy} preset={preset} groupBy={groupBy} compare={comparePrev} chartView={chartView} />
            </section>

            <div className="pf-kpis" style={{ marginBottom: 0 }}>
              <div className="pf-kpi">
                <strong>{activeType?.label ?? '—'}</strong>
                <small>Selected type</small>
              </div>
              <div className="pf-kpi">
                <strong>{cols.size} cols</strong>
                <small>{groupBy !== 'none' ? `By ${groupBy}` : 'No grouping'}</small>
              </div>
              <div className="pf-kpi">
                <strong>{[optCharts && 'Charts', optSummary && 'Summary', optRawRows && 'Raw rows', optWorkspace && 'Per-workspace', comparePrev && 'Δ% compare'].filter(Boolean).length || 0}</strong>
                <small>Options included</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── scheduled reports ── */}
      <h2 className="pf-h2" style={{ marginTop: 18 }}>
        Scheduled reports ({schedules.length})
      </h2>
      {schedulesQ.error && <LoadError message={schedulesQ.error} onRetry={() => void schedulesQ.reload()} />}
      {!schedulesQ.data && !schedulesQ.error && <Skeleton rows={2} />}
      {schedulesQ.data && schedules.length === 0 && <EmptyState title="No schedules yet">Configure the delivery panel and create one.</EmptyState>}
      {schedulesQ.data && schedules.length > 0 && (
        <div className="table-wrap pf-table">
          <table className="leads-table">
            <thead>
              <tr>
                <th>Schedule</th>
                <th>Format</th>
                <th>Cadence</th>
                <th>Recipients</th>
                <th>Next run</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((sch) => (
                <ScheduleRow key={sch.id} schedule={sch} busy={false} onToggle={(id, en) => void handleToggleSchedule(id, en)} onDelete={(id) => void handleDeleteSchedule(id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── session-local recent exports ── */}
      {sessionExports.length > 0 && (
        <>
          <h2 className="pf-h2" style={{ marginTop: 18 }}>
            This session&rsquo;s exports ({sessionExports.length}) <small className="field-hint">— clears on reload, no server history</small>
          </h2>
          <div className="table-wrap pf-table">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Format</th>
                  <th>Time</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {sessionExports.slice(0, 8).map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.typeLabel} <small>{row.typeKey.replace(/_/g, ' ')}</small>
                    </td>
                    <td>
                      <Chip tone="accent">{FORMAT_LABELS[row.format] ?? row.format}</Chip>
                    </td>
                    <td>{fmtTime(row.createdAt)}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setSessionExports((prev) => prev.filter((e) => e.id !== row.id))}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
