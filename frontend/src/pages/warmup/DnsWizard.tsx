import { useState } from 'react';
import { EmptyState, LoadError, Skeleton } from '../../components/feedback';
import { Chip } from '../../components/ui';
import { fmtDateTime, fmtTime } from '../../lib/format';
import {
  checkWarmupDns,
  WarmupApiError,
  type WarmupDnsCheckResponse,
} from '../../lib/warmupApi';

/**
 * DNS onboarding wizard — port of the WarmPulse onboarding DNS step, aimed at
 * the warmup backend's rich /api/workspace/dns/check response. Enter a domain
 * (or a full email address — the backend extracts the domain), get one status
 * card per record type plus the backend's "records to publish" guidance for
 * whatever failed, and re-check until all three pass.
 */

type LegKey = 'spf' | 'dkim' | 'dmarc';

/** Small inline status icon — the shell has no icon library; keep it local. */
function Verdict({ ok }: { ok: boolean }) {
  return (
    <span className={`dns-verdict${ok ? ' pass' : ' fail'}`} aria-hidden>
      {ok ? (
        <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

function IssueList({ kind, items }: { kind: 'error' | 'warning'; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className={`dns-issues ${kind}`}>
      {items.map((msg, i) => (
        <li key={i}>{msg}</li>
      ))}
    </ul>
  );
}

/** The backend's fix string — multi-line "records to publish" guidance, verbatim. */
function FixNote({ text }: { text: string }) {
  return <pre className="dns-fix mono">{text}</pre>;
}

function RecordCard({ leg, result }: { leg: LegKey; result: WarmupDnsCheckResponse }) {
  if (leg === 'spf') {
    const spf = result.spf;
    return (
      <div className={`dns-card${spf.valid ? ' pass' : ' fail'}`}>
        <div className="dns-card-head">
          <Verdict ok={spf.valid} />
          <h3 className="dns-card-title">SPF</h3>
          <Chip tone={spf.valid ? 'success' : 'warn'}>{spf.valid ? 'Pass' : 'Fail'}</Chip>
        </div>
        {spf.record && <p className="dns-record mono" title={spf.record}>{spf.record}</p>}
        <IssueList kind="error" items={spf.errors} />
        <IssueList kind="warning" items={spf.warnings} />
        {!spf.valid && result.fixes.spf.map((fix, i) => <FixNote key={i} text={fix} />)}
      </div>
    );
  }

  if (leg === 'dkim') {
    const dkim = result.dkim;
    return (
      <div className={`dns-card${dkim.valid ? ' pass' : ' fail'}`}>
        <div className="dns-card-head">
          <Verdict ok={dkim.valid} />
          <h3 className="dns-card-title">DKIM</h3>
          <span className="dns-selector mono" title={`Probed selector: ${dkim.selector}`}>
            {dkim.selector}
          </span>
          <Chip tone={dkim.valid ? 'success' : 'warn'}>{dkim.valid ? 'Pass' : 'Fail'}</Chip>
        </div>
        {dkim.record && <p className="dns-record mono" title={dkim.record}>{dkim.record}</p>}
        <IssueList kind="error" items={dkim.errors} />
        {!dkim.valid && result.fixes.dkim.map((fix, i) => <FixNote key={i} text={fix} />)}
      </div>
    );
  }

  const dmarc = result.dmarc;
  return (
    <div className={`dns-card${dmarc.valid ? ' pass' : ' fail'}`}>
      <div className="dns-card-head">
        <Verdict ok={dmarc.valid} />
        <h3 className="dns-card-title">DMARC</h3>
        <span className="dns-selector mono" title={`Policy: ${dmarc.policy ?? 'none'}`}>
          {dmarc.policy ? `p=${dmarc.policy}` : 'no policy'}
        </span>
        <Chip tone={dmarc.valid ? 'success' : 'warn'}>{dmarc.valid ? 'Pass' : 'Fail'}</Chip>
      </div>
      {dmarc.record && <p className="dns-record mono" title={dmarc.record}>{dmarc.record}</p>}
      <IssueList kind="error" items={dmarc.errors} />
      <IssueList kind="warning" items={dmarc.warnings} />
      {!dmarc.valid && result.fixes.dmarc.map((fix, i) => <FixNote key={i} text={fix} />)}
    </div>
  );
}

export function DnsWizard() {
  const [input, setInput] = useState('');
  const [selector, setSelector] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<WarmupDnsCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const raw = input.trim();
    if (!raw || checking) return;
    setChecking(true);
    setError(null);
    // An "@" means the user pasted an address — send it as `email` (the
    // backend's EmailStr would 422 on a bare-domain string in that field,
    // and extract_domain handles the rest).
    const payload = raw.includes('@')
      ? { email: raw, ...(selector.trim() && { dkim_selector: selector.trim() }) }
      : { domain: raw, ...(selector.trim() && { dkim_selector: selector.trim() }) };
    try {
      setResult(await checkWarmupDns(payload));
    } catch (e) {
      setResult(null);
      setError(e instanceof WarmupApiError ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  const checkedAt = result ? new Date(result.checked_at) : null;

  return (
    <section className="panel" aria-labelledby="dns-wizard-title">
      <div className="panel-head">
        <div>
          <h2 id="dns-wizard-title" className="section-title">DNS / Deliverability</h2>
          <p className="panel-note">
            Check a sending domain's SPF, DKIM and DMARC before warming it —
            all three should pass before the first campaign.
          </p>
        </div>
      </div>

      <form
        className="dns-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="field dns-form-domain">
          <label className="field-label" htmlFor="dns-domain-input">Domain or email address</label>
          <div className="input-with-action">
            <input
              id="dns-domain-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="example.com or you@example.com"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="btn" type="submit" disabled={checking || !input.trim()}>
              {checking ? 'Checking…' : result ? 'Re-check' : 'Check DNS'}
            </button>
          </div>
          <p className="field-hint">
            DKIM is probed across common selectors (google, selector1/2, s1…).
            Custom selector? Name it below.
          </p>
        </div>
        <div className="field dns-form-selector">
          <label className="field-label" htmlFor="dns-selector-input">DKIM selector (optional)</label>
          <input
            id="dns-selector-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="default"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
          />
        </div>
      </form>

      {checking && !result ? (
        <div className="dns-cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="dns-card" aria-busy="true">
              <Skeleton rows={2} height={38} />
            </div>
          ))}
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={() => void run()} />
      ) : result ? (
        <>
          <div className={`dns-summary${result.summary.overall_pass ? ' pass' : ''}`}>
            <div className="dns-summary-main">
              <strong className="mono">{result.domain}</strong>
              <span className="dns-summary-count">
                {result.summary.passing} of {result.summary.total} records passing
              </span>
            </div>
            <div className="dns-summary-side">
              <Chip tone={result.summary.overall_pass ? 'success' : 'warn'}>
                {result.summary.overall_pass ? 'All good' : 'Needs records'}
              </Chip>
              {checkedAt && (
                <span className="dns-checked-at" title={fmtDateTime(checkedAt)}>
                  checked {fmtTime(checkedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="dns-cards">
            <RecordCard leg="spf" result={result} />
            <RecordCard leg="dkim" result={result} />
            <RecordCard leg="dmarc" result={result} />
          </div>

          {!result.summary.overall_pass && (
            <p className="dns-next-hint">
              Publish the records shown in red, wait for propagation (usually
              minutes to a few hours), then Re-check.
            </p>
          )}
        </>
      ) : (
        <EmptyState title="No domain checked yet">
          Enter the domain you send from — the wizard verifies its SPF, DKIM
          and DMARC records against live DNS.
        </EmptyState>
      )}
    </section>
  );
}
