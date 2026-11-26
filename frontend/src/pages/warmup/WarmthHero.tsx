import { warmthColor, type ChartTheme } from './chartTheme';
import { fmtNumber } from '../../lib/format';
import type { WarmupDashboardSummary } from '../../lib/warmupApi';

/**
 * Mean workspace warmth as an SVG arc gauge, ported from the source
 * WarmthScoreHero. Drawn statically (no entrance animation — this app's
 * reduced-motion policy) with colors resolved from theme tokens:
 * <40 cold (danger), <70 warming (warn), >=70 hot (accent).
 */
export function WarmthHero({ summary, theme }: { summary: WarmupDashboardSummary; theme: ChartTheme }) {
  const pct = Math.max(0, Math.min(100, Math.round(summary.mean_warmth_score)));
  const color = warmthColor(pct, theme);
  const label = pct < 40 ? 'Cold' : pct < 70 ? 'Warming' : 'Hot';
  const delta = summary.warmth_delta_24h;

  // SVG arc params (same geometry as source: 220px ring, 16px stroke).
  const size = 220;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  return (
    <div className="warmup-hero">
      <div className="warmup-gauge" role="img" aria-label={`Warmth score ${fmtNumber(pct)} of 100`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <linearGradient id="warmup-warmth-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--border-soft)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="url(#warmup-warmth-grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={circ - dash}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          <text x="50%" y="47%" textAnchor="middle" className="warmup-gauge-value" fill="var(--text)">
            {fmtNumber(pct)}
          </text>
          <text x="50%" y="61%" textAnchor="middle" className="warmup-gauge-label" fill="var(--text-3)">
            WARMTH
          </text>
        </svg>
      </div>
      <div className="warmup-hero-copy">
        <p className="warmup-hero-eyebrow">Workspace warmth</p>
        <h2>{label}</h2>
        <p className="warmup-hero-sub">
          Mean warmth across {fmtNumber(summary.total_mailboxes)} mailbox{summary.total_mailboxes === 1 ? '' : 'es'} ({fmtNumber(summary.active_mailboxes)} active). We target 70+ sustained for optimal deliverability.
        </p>
        <p className={`warmup-hero-delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
          <span aria-hidden>{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'}</span>{' '}
          {Math.abs(delta).toFixed(1)} pts <span>vs yesterday</span>
        </p>
      </div>
    </div>
  );
}
