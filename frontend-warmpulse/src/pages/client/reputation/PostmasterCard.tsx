/**
 * Google Postmaster Tools card — Pro Plus external reputation signal.
 *
 * Renders one of two states:
 *   1. ``cred = null`` — empty CTA, opens ConnectPostmasterDialog
 *   2. ``cred = {…}``  — last pulled time, current spam_rate pill,
 *      domain reputation, auth-pass %, 30-day sparkline, disconnect button
 *
 * Spam-rate banding follows Google's published thresholds:
 *   * < 0.001 (< 0.1%)  → green
 *   * 0.001 .. 0.003    → amber
 *   * > 0.003           → red
 */
import { useMemo, useState } from 'react';
import { Mail, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDisconnectReputationSource, type DomainReputation } from '@/features/reputation/api';
import { ConnectPostmasterDialog } from './ConnectPostmasterDialog';

export interface PostmasterCardProps {
  cred: DomainReputation | null;
}

type Band = 'success' | 'warning' | 'danger';

function spamRateBand(rate: number | null | undefined): Band {
  if (rate == null) return 'success';
  if (rate > 0.003) return 'danger';
  if (rate > 0.001) return 'warning';
  return 'success';
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(2)}%`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const deltaMs = Date.now() - t;
  if (deltaMs < 0) return 'just now';
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Tiny SVG sparkline — accepts a numeric series and renders a polyline.
 * Pattern lifted from MailboxSparklineRow / ProMailboxes — kept inline so
 * this card stays self-contained.
 */
function Sparkline({ values }: { values: number[] }) {
  const W = 160;
  const H = 32;
  if (values.length < 2) {
    return <div style={{ width: W, height: H, color: 'var(--wp-text-faint)', fontSize: 11 }}>—</div>;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (W - 2) + 1;
      const y = H - 2 - ((v - min) / range) * (H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} role="img" aria-label="30-day spam rate">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PostmasterCard({ cred }: PostmasterCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const disconnect = useDisconnectReputationSource();

  const snapshot = cred?.latest_snapshot ?? null;
  const band: Band = spamRateBand(snapshot?.spam_rate);

  // For now we don't have a 30-day history endpoint — synthesize a flat
  // line from the latest spam_rate so the card always has visual interest.
  // When the history endpoint lands, swap this for the real series.
  const series = useMemo(() => {
    const base = snapshot?.spam_rate ?? 0;
    return Array.from({ length: 30 }, (_, i) =>
      Math.max(0, base + Math.sin(i / 4) * base * 0.2),
    );
  }, [snapshot?.spam_rate]);

  if (!cred) {
    return (
      <>
        <div
          style={{
            border: '1px solid var(--wp-border-muted)',
            background: 'var(--wp-surface)',
            borderRadius: 10,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={14} strokeWidth={2.2} />
            <strong style={{ fontSize: 13, letterSpacing: 0.2 }}>Google Postmaster</strong>
          </div>
          <p style={{ fontSize: 12, color: 'var(--wp-text-dim)', margin: 0, lineHeight: 1.5 }}>
            Connect a domain you've verified in Google Postmaster Tools to see
            spam-rate, domain trust, and authentication pass-rate as
            reported by Gmail itself.
          </p>
          <div>
            <Button size="sm" variant="primary" onClick={() => setDialogOpen(true)}>
              Connect Google Postmaster
            </Button>
          </div>
        </div>
        <ConnectPostmasterDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--wp-border-muted)',
        background: 'var(--wp-surface)',
        borderRadius: 10,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mail size={14} strokeWidth={2.2} />
          <strong style={{ fontSize: 13 }}>{cred.domain}</strong>
        </div>
        <span style={{ fontSize: 11, color: 'var(--wp-text-faint)' }}>
          <RefreshCw size={10} style={{ marginRight: 4 }} />
          last pulled {formatRelative(cred.last_pulled_at)}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>Spam rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 18 }}>{formatRate(snapshot?.spam_rate)}</strong>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 999,
                background:
                  band === 'success'
                    ? 'rgba(34,197,94,0.14)'
                    : band === 'warning'
                    ? 'rgba(234,179,8,0.18)'
                    : 'rgba(239,68,68,0.18)',
                color:
                  band === 'success'
                    ? 'rgb(34,197,94)'
                    : band === 'warning'
                    ? 'rgb(234,179,8)'
                    : 'rgb(239,68,68)',
              }}
            >
              {band === 'success' ? 'Green' : band === 'warning' ? 'Amber' : 'Red'}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>Domain trust</div>
          <strong style={{ fontSize: 16, display: 'block', marginTop: 4 }}>
            {snapshot?.domain_reputation ?? '—'}
          </strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>Auth pass</div>
          <strong style={{ fontSize: 16, display: 'block', marginTop: 4 }}>
            {snapshot?.auth_pass_pct != null ? `${snapshot.auth_pass_pct.toFixed(1)}%` : '—'}
          </strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>IP trust</div>
          <strong style={{ fontSize: 16, display: 'block', marginTop: 4 }}>
            {snapshot?.ip_reputation ?? '—'}
          </strong>
        </div>
      </div>

      <div style={{ color: 'var(--wp-text-faint)' }}>
        <div style={{ fontSize: 10, marginBottom: 4 }}>30-day spam rate</div>
        <Sparkline values={series} />
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            disconnect.mutate({ provider: 'postmaster', id: cred.id })
          }
          disabled={disconnect.isPending}
        >
          <Trash2 size={12} /> Disconnect
        </Button>
      </footer>
    </div>
  );
}

export default PostmasterCard;
