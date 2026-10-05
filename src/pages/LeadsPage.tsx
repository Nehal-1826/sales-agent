import { useEffect, useMemo, useState } from 'react';
import { downloadLeadsCsv, generateReport, getLeads } from '../lib/api';
import { MOCK_LEADS } from '../lib/mockData';
import { PageHeader, SectionLabel, Spinner } from '../components/ui';
import type { Lead } from '../lib/types';

type SortKey = 'company' | 'score' | 'discovered';

/**
 * LEADS & REPORTS — the full workspace lead list (search, sort, CSV export)
 * plus on-demand branded report generation with live preview.
 */
export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [minScore, setMinScore] = useState(0);

  useEffect(() => {
    getLeads().then((list) => {
      setLeads(list ?? MOCK_LEADS);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = leads.filter(
      (l) =>
        l.score >= minScore &&
        (!q ||
          l.company.toLowerCase().includes(q) ||
          l.industry.toLowerCase().includes(q) ||
          l.website.toLowerCase().includes(q) ||
          l.country.toLowerCase().includes(q) ||
          (l.description || '').toLowerCase().includes(q)),
    );
    out.sort((a, b) =>
      sort === 'score'
        ? b.score - a.score
        : sort === 'company'
          ? a.company.localeCompare(b.company)
          : Date.parse(b.discovered) - Date.parse(a.discovered) || 0,
    );
    return out;
  }, [leads, search, minScore, sort]);

  return (
    <div className="page">
      <PageHeader
        title="Leads & Reports"
        subtitle="The full lead list with everything the agents discovered — plus on-demand branded reports."
        actions={
          <button className="btn btn-primary" onClick={() => downloadLeadsCsv()}>
            ⬇ Export CSV
          </button>
        }
      />

      {loading ? (
        <Spinner label="Loading leads…" />
      ) : (
        <section className="panel">
          <SectionLabel>Lead list ({filtered.length} of {leads.length})</SectionLabel>
          <div className="leads-toolbar">
            <input
              value={search}
              placeholder="Search company, industry, site, country or description…"
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="score">Sort: score</option>
              <option value="company">Sort: company A→Z</option>
              <option value="discovered">Sort: newest</option>
            </select>
            <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>
              <option value={0}>Any score</option>
              <option value={40}>40+</option>
              <option value={65}>65+ (potential)</option>
              <option value={80}>80+ (hot)</option>
            </select>
          </div>
          <div className="leads-scroll">
            <table className="leads-geo-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Industry</th>
                  <th>Score</th>
                  <th>Region</th>
                  <th>Contact</th>
                  <th>AI description</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <strong>{l.company}</strong>
                      <small className="mono d-block">{l.website || 'no website'}</small>
                    </td>
                    <td>{l.industry || '—'}</td>
                    <td>
                      <span className="score">{l.score}</span>
                    </td>
                    <td>{[l.state, l.country].filter(Boolean).join(', ') || '—'}</td>
                    <td>{l.contactEmail || <em>missing</em>}</td>
                    <td className="leads-desc">
                      {(l.description || '').slice(0, 160) || <em>not profiled yet</em>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      No leads match — run a cycle from the Pipeline page (or ask the AI guide).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ReportSection />
    </div>
  );
}

function ReportSection() {
  const [scope, setScope] = useState<'today' | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ subject: string; html: string; emailed: boolean } | null>(null);
  const [msg, setMsg] = useState('');

  const generate = async (email: boolean) => {
    setBusy(true);
    setMsg('');
    const r = await generateReport(scope, email);
    setBusy(false);
    if (!r) {
      setMsg('Backend not reachable — start Django and try again.');
      return;
    }
    setReport(r);
    setMsg(r.emailed ? `Report emailed to the configured recipient ✓` : email ? 'Email not sent — check SMTP and the report recipient in Settings.' : '');
  };

  const download = () => {
    if (!report) return;
    const blob = new Blob([report.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-report-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <SectionLabel>Report generation</SectionLabel>
      <small className="inline-msg">
        Build the branded lead report on demand — preview it exactly as it arrives by email, download
        it as a shareable HTML file, or send it to the report recipient now.
      </small>
      <div className="leads-toolbar">
        <select value={scope} onChange={(e) => setScope(e.target.value as 'today' | 'all')}>
          <option value="all">Scope: all time</option>
          <option value="today">Scope: today</option>
        </select>
        <button className="btn btn-primary" onClick={() => generate(false)} disabled={busy}>
          {busy ? 'Generating…' : 'Generate report'}
        </button>
        {report && (
          <>
            <button className="btn" onClick={download}>⬇ Download .html</button>
            <button className="btn" onClick={() => generate(true)} disabled={busy}>✉ Email now</button>
          </>
        )}
        {msg && <small className="inline-msg">{msg}</small>}
      </div>
      {report && (
        <>
          <p className="inline-msg" style={{ marginTop: 10 }}>
            <strong>{report.subject}</strong>
          </p>
          <iframe
            title="Report preview"
            className="report-preview"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f4f6">${report.html}</body></html>`}
            sandbox=""
          />
        </>
      )}
    </section>
  );
}
