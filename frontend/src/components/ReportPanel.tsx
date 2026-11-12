import { useState } from 'react';
import { generateReport, isDemo } from '../lib/api';
import type { GeneratedReport } from '../lib/api';
import { toast } from './feedback';

/** Branded lead report on demand: preview, download as HTML, or email it now. */
export function ReportPanel() {
  const [scope, setScope] = useState<'today' | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<GeneratedReport | null>(null);

  const generate = async (email: boolean) => {
    setBusy(true);
    const res = await generateReport(scope, email);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setReport(res.data);
    if (email) {
      if (res.data.emailed) toast.success('Report emailed to your report address.');
      else toast.error('Not emailed: connect your email and set a report address in Settings.');
    }
  };

  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-report-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="section-title">Lead report</h2>
      </div>
      <p className="panel-note">
        The same report that's emailed every evening at 8 PM IST. Preview it, download it to share, or send it now.
      </p>
      <div className="toolbar">
        <label className="sr-only" htmlFor="report-scope">
          Report period
        </label>
        <select id="report-scope" value={scope} onChange={(e) => setScope(e.target.value as 'today' | 'all')}>
          <option value="all">All time</option>
          <option value="today">Today only</option>
        </select>
        <button className="btn btn-primary" onClick={() => void generate(false)} disabled={busy || isDemo()}>
          {busy ? 'Building…' : 'Preview report'}
        </button>
        {report && (
          <>
            <button className="btn" onClick={download}>
              Download
            </button>
            <button className="btn" onClick={() => void generate(true)} disabled={busy}>
              Email it now
            </button>
          </>
        )}
      </div>
      {report && (
        <>
          <p className="report-subject">{report.subject}</p>
          <iframe
            title="Report preview"
            className="report-preview"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${report.html}</body></html>`}
            sandbox=""
          />
        </>
      )}
    </section>
  );
}
