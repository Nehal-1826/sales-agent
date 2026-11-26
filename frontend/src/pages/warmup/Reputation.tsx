import { useMemo, useState } from 'react';
import { EmptyState, LoadError, Skeleton, StaleNotice, toast } from '../../components/feedback';
import { Chip } from '../../components/ui';
import { useAsync } from '../../lib/hooks';
import { fmtNumber, fmtPercent } from '../../lib/format';
import {
  warmupBlacklistCheck,
  warmupBounceSpam,
  warmupMailboxStates,
  warmupPlacementTrend,
  warmupReputationOverview,
  warmupReputationTrend,
  type WarmupAnalyticsRange,
} from '../../lib/warmupApi';
import { useChartTheme, warmthColor, type ChartTheme } from './chartTheme';
import { WarmthChart } from './WarmthChart';
import { PlacementTrendChart } from './PlacementTrendChart';
import { ProviderBarChart, providerLabel, type ProviderWarmthRow } from './ProviderBarChart';

/** Fixed 30-day window — matches the reputation trend route default. */
function range30(): WarmupAnalyticsRange {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/** Spam-rate verdict — Google's sender guideline draws the line at 0.1%. */
function spamColor(rate: number, t: ChartTheme): string {
  if (rate < 0.1) return t.success;
  if (rate < 0.3) return t.warn;
  return t.danger;
}

/** Mean warmth per mailbox provider, grouped from the mailbox rows. */
function providerRows(items: { provider: string; warmth_score: number }[]): ProviderWarmthRow[] {
  const groups = new Map<string, number[]>();
  for (const m of items) {
    const list = groups.get(m.provider) ?? [];
    list.push(m.warmth_score);
    groups.set(m.provider, list);
  }
  return [...groups.entries()]
    .map(([provider, scores]) => ({
      provider,
      count: scores.length,
      mean: scores.reduce((a, b) => a + b, 0) / scores.length,
    }))
    .sort((a, b) => b.mean - a.mean);
}

/**
 * Reputation tab of the Warmup section — the C9 port of the WarmPulse
 * reputation view, scoped to what this backend serves: the workspace
 * reputation rollup (workspace_reputation.py) for the score banner and
 * per-domain table, the analytics routes for placement / spam-rate trends,
 * and a client-side provider breakdown (the API has no Gmail-vs-Outlook
 * placement split — provider rows carry warmth, grouped from mailboxes).
 */
export function Reputation() {
  const theme = useChartTheme();
  const range = useMemo(range30, []);

  const overview = useAsync(warmupReputationOverview, []);
  const trend = useAsync(() => warmupReputationTrend(30), []);
  const placement = useAsync(() => warmupPlacementTrend(range), [range]);
  const bounceSpam = useAsync(() => warmupBounceSpam(range), [range]);
  const mailboxes = useAsync(warmupMailboxStates, []);

  // live blacklist checks — results overlay the cached overview hits
  const [checking, setChecking] = useState<string | null>(null);
  const [liveHits, setLiveHits] = useState<Record<string, string[]>>({});
  const runCheck = async (domain: string) => {
    if (checking) return;
    setChecking(domain);
    try {
      const result = await warmupBlacklistCheck(domain);
      setLiveHits((prev) => ({ ...prev, [result.domain]: result.hits }));
      toast.success(
        result.hits.length === 0
          ? `${domain}: clean on ${fmtNumber(result.checked_against.length)} blocklists`
          : `${domain}: listed on ${result.hits.join(', ')}`,
      );
    } catch (e) {
      toast.error(`Blacklist check failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setChecking(null);
    }
  };

  // ---- derived numbers for the banner + stat cards ----
  const score = overview.data ? Math.round(overview.data.overall_reputation) : null;
  const statusLabel = score === null ? null : score < 40 ? 'Cold' : score < 70 ? 'Warming' : 'Hot';

  const spam = bounceSpam.data && bounceSpam.data.length > 0 ? bounceSpam.data : null;
  const spamLatest = spam ? spam[spam.length - 1].spam_rate : null;
  const spamMean = spam
    ? Math.round((spam.reduce((a, p) => a + p.spam_rate, 0) / spam.length) * 100) / 100
    : null;
  const spamDelta =
    spamLatest !== null && spamMean !== null
      ? Math.round((spamLatest - spamMean) * 100) / 100
      : null;

  const lastPlacement =
    placement.data && placement.data.length > 0 ? placement.data[placement.data.length - 1] : null;

  const providers = useMemo(
    () => providerRows(mailboxes.data?.items ?? []),
    [mailboxes.data],
  );
  const warmCount = (mailboxes.data?.items ?? []).filter((m) => m.warmth_score >= 70).length;

  const cards = [
    {
      label: 'Spam rate',
      value: spamLatest === null ? '—' : `${spamLatest.toFixed(2)}%`,
      note:
        spamDelta === null
          ? 'no signal in range'
          : `${spamDelta > 0 ? '▲' : spamDelta < 0 ? '▼' : '•'} ${Math.abs(spamDelta).toFixed(2)} pts vs 30d mean (${spamMean?.toFixed(2)}%) · keep under 0.1%`,
      highlight: true,
      color: spamLatest !== null && theme ? spamColor(spamLatest, theme) : undefined,
    },
    {
      label: 'Bounce rate',
      value: overview.data ? `${overview.data.bounce_rate.toFixed(2)}%` : '—',
      note: 'last 30 days, all sends',
    },
    {
      label: 'Inbox placement',
      value: lastPlacement ? fmtPercent(lastPlacement.inbox_pct) : '—',
      note: lastPlacement
        ? `promotions ${fmtPercent(lastPlacement.promotions_pct)} · spam ${fmtPercent(lastPlacement.spam_pct)}`
        : 'no placement signal yet',
    },
    {
      label: 'Warm mailboxes',
      value: mailboxes.data ? fmtNumber(warmCount) : '—',
      note: mailboxes.data ? `of ${fmtNumber(mailboxes.data.total)} at 70+ warmth` : '—',
    },
  ];

  return (
    <>
      {/* ---- score banner + risk stat cards ---- */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Sender reputation</h2>
            <p className="panel-note">Trust signals across every warmup mailbox — last 30 days.</p>
          </div>
        </div>
        {overview.loading && !overview.data ? (
          <Skeleton rows={2} height={64} />
        ) : overview.error && !overview.data ? (
          <LoadError message={overview.error} onRetry={() => void overview.reload()} />
        ) : (
          <>
            <div className="warmup-rep-banner">
              {score !== null && theme ? (
                <>
                  <span className="warmup-rep-score" style={{ color: warmthColor(score, theme) }}>
                    {fmtNumber(score)}
                  </span>
                  <div className="warmup-rep-copy">
                    <span
                      className="warmup-rep-status"
                      style={{
                        color: warmthColor(score, theme),
                        borderColor: warmthColor(score, theme),
                      }}
                    >
                      {statusLabel}
                    </span>
                    <p>
                      Mean reputation across {fmtNumber(overview.data?.domains.length ?? 0)} sending
                      {overview.data?.domains.length === 1 ? ' domain' : ' domains'}. We target 70+
                      sustained for optimal deliverability.
                    </p>
                  </div>
                </>
              ) : (
                <p className="panel-note">Reputation scores appear once warmup is underway.</p>
              )}
            </div>
            <div className="stat-row">
              {cards.map((c) => (
                <div key={c.label} className={`stat-card${c.highlight ? ' highlight' : ''}`}>
                  <span className="stat-value" style={c.color ? { color: c.color } : undefined}>
                    {c.value}
                  </span>
                  <span className="stat-label">{c.label}</span>
                  <span className="stat-note">{c.note}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {overview.error && overview.data && <StaleNotice onRetry={() => void overview.reload()} />}
      </section>

      {/* ---- reputation score trend (reuses the warmth chart + its shape) ---- */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Reputation trend (30 days)</h2>
            <p className="panel-note">Daily mean sender score — same scale as mailbox warmth.</p>
          </div>
        </div>
        {trend.loading && !trend.data ? (
          <Skeleton rows={3} height={48} />
        ) : trend.error && !trend.data ? (
          <LoadError message={trend.error} onRetry={() => void trend.reload()} />
        ) : trend.data && theme ? (
          trend.data.length === 0 ? (
            <div className="warmup-chart-empty">Reputation history builds up day by day — check back tomorrow.</div>
          ) : (
            <WarmthChart points={trend.data} theme={theme} />
          )
        ) : null}
        {trend.error && trend.data && <StaleNotice onRetry={() => void trend.reload()} />}
      </section>

      {/* ---- inbox/promotions/spam split over time ---- */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Placement trend</h2>
            <p className="panel-note">Where warmup mail landed each day — inbox vs promotions vs spam.</p>
          </div>
        </div>
        {placement.loading && !placement.data ? (
          <Skeleton rows={3} height={48} />
        ) : placement.error && !placement.data ? (
          <LoadError message={placement.error} onRetry={() => void placement.reload()} />
        ) : placement.data && theme ? (
          placement.data.length === 0 ? (
            <div className="warmup-chart-empty">Placement signals appear once warmup is underway.</div>
          ) : (
            <PlacementTrendChart points={placement.data} theme={theme} />
          )
        ) : null}
        {placement.error && placement.data && <StaleNotice onRetry={() => void placement.reload()} />}
      </section>

      {/* ---- provider breakdown + per-domain rollup ---- */}
      <div className="warmup-two-col">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="section-title">Warmth by provider</h2>
              <p className="panel-note">Mean warmth per mailbox provider.</p>
            </div>
          </div>
          {mailboxes.loading && !mailboxes.data ? (
            <Skeleton rows={2} height={52} />
          ) : mailboxes.error && !mailboxes.data ? (
            <LoadError message={mailboxes.error} onRetry={() => void mailboxes.reload()} />
          ) : providers.length === 0 ? (
            <EmptyState title="No mailboxes yet">
              Connect a mailbox and provider warmth appears here.
            </EmptyState>
          ) : theme ? (
            <>
              <ProviderBarChart rows={providers} theme={theme} />
              <ul className="warmup-rep-provider-note">
                {providers.map((r) => (
                  <li key={r.provider}>
                    {providerLabel(r.provider)} — {fmtNumber(r.count)} mailbox{r.count === 1 ? '' : 'es'}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {mailboxes.error && mailboxes.data && <StaleNotice onRetry={() => void mailboxes.reload()} />}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="section-title">Domains</h2>
              <p className="panel-note">Reputation and blocklist standing per sending domain.</p>
            </div>
          </div>
          {overview.loading && !overview.data ? (
            <Skeleton rows={2} height={44} />
          ) : overview.error && !overview.data ? (
            <LoadError message={overview.error} onRetry={() => void overview.reload()} />
          ) : overview.data && overview.data.domains.length === 0 ? (
            <EmptyState title="No sending domains yet">
              Domains appear here once mailboxes are enrolled in warmup.
            </EmptyState>
          ) : overview.data ? (
            <div className="table-wrap">
              <table className="warmup-report-table">
                <thead>
                  <tr>
                    <th scope="col">Domain</th>
                    <th scope="col" className="num">Score</th>
                    <th scope="col">Auth</th>
                    <th scope="col">Blocklists</th>
                    <th scope="col" className="num">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.data.domains.map((d) => {
                    const hits = liveHits[d.domain] ?? d.blacklist_hits;
                    return (
                      <tr key={d.domain}>
                        <td className="mono">{d.domain}</td>
                        <td className="num">
                          {d.reputation_score === null ? (
                            '—'
                          ) : theme ? (
                            <span style={{ color: warmthColor(d.reputation_score, theme) }}>
                              {fmtNumber(d.reputation_score)}
                            </span>
                          ) : (
                            fmtNumber(d.reputation_score)
                          )}
                        </td>
                        <td>
                          <span className="warmup-rep-auth">
                            <Chip tone={d.spf_valid === true ? 'success' : d.spf_valid === false ? 'warn' : 'neutral'}>SPF</Chip>
                            <Chip tone={d.dkim_valid === true ? 'success' : d.dkim_valid === false ? 'warn' : 'neutral'}>DKIM</Chip>
                            <Chip tone={d.dmarc_valid === true ? 'success' : d.dmarc_valid === false ? 'warn' : 'neutral'}>DMARC</Chip>
                          </span>
                        </td>
                        <td>
                          {hits.length === 0 ? (
                            <span className="warmup-rep-clean">Clean</span>
                          ) : (
                            <span className="warmup-rep-hits" title={hits.join(', ')}>
                              {fmtNumber(hits.length)} listed
                            </span>
                          )}
                        </td>
                        <td className="num">
                          <button
                            className="btn btn-sm"
                            onClick={() => void runCheck(d.domain)}
                            disabled={checking !== null}
                          >
                            {checking === d.domain ? 'Checking…' : 'Check'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
