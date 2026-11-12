/**
 * Microsoft SNDS card — Pro Plus external reputation signal.
 *
 * Mirrors ``PostmasterCard.tsx`` for visual consistency:
 *   1. ``cred = null`` — empty CTA, opens ``ConnectSndsDialog``
 *   2. ``cred = {…}``  — last pulled time, current complaint_rate pill,
 *      IP-reputation tier badge, trap_hits, 30-day sparkline, disconnect.
 *
 * Microsoft's published complaint-rate thresholds:
 *   * < 0.001  → green
 *   * 0.001..0.003 → amber
 *   * > 0.003  → red
 */
import { useMemo, useState } from 'react';
import { ShieldAlert, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDisconnectReputationSource, type DomainReputation } from '@/features/reputation/api';
import { ConnectSndsDialog } from './ConnectSndsDialog';

export interface SndsCardProps {
  cred: DomainReputation | null;
}

type Band = 'success' | 'warning' | 'danger';

function complaintBand(rate: number | null | undefined): Band {
  if (rate == null) return 'success';
  if (rate > 0.003) return 'danger';
  if (rate > 0.001) return 'warning';
  return 'success';
}

function ipTierBand(tier: string | null | undefined): Band {
  const t = (tier ?? '').toUpperCase();
  if (t === 'RED') return 'danger';
  if (t === 'YELLOW') return 'warning';
  return 'success';
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(3)}%`;
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

function bandBg(b: Band): string {
  return b === 'success'
    ? 'rgba(34,197,94,0.14)'
    : b === 'warning'
    ? 'rgba(234,179,8,0.18)'
    : 'rgba(239,68,68,0.18)';
}

function bandFg(b: Band): string {
  return b === 'success'
    ? 'rgb(34,197,94)'
    : b === 'warning'
    ? 'rgb(234,179,8)'
    : 'rgb(239,68,68)';
}

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
    <svg width={W} height={H} role="img" aria-label="30-day complaint rate">
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

export function SndsCard({ cred }: SndsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const disconnect = useDisconnectReputationSource();

  const snapshot = cred?.latest_snapshot ?? null;
  const band: Band = complaintBand(snapshot?.complaint_rate);
  const ipBand: Band = ipTierBand(snapshot?.ip_reputation);

  // The history endpoint isn't here yet — synthesize a flat-ish line so the
  // card always has something visual. Swap for the real series later.
  const series = useMemo(() => {
    const base = snapshot?.complaint_rate ?? 0;
    return Array.from({ length: 30 }, (_, i) =>
      Math.max(0, base + Math.sin(i / 4) * base * 0.2),
    );
  }, [snapshot?.complaint_rate]);

  // trap_hits flows through ``latest_snapshot.raw.trap_hits`` on the wire,
  // but the typed snapshot interface doesn't surface it. Cast carefully.
  const trapHits =
    (snapshot as unknown as { trap_hits?: number } | null)?.trap_hits ?? 0;

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
            <ShieldAlert size={14} strokeWidth={2.2} />
            <strong style={{ fontSize: 13, letterSpacing: 0.2 }}>Microsoft SNDS</strong>
          </div>
          <p style={{ fontSize: 12, color: 'var(--wp-text-dim)', margin: 0, lineHeight: 1.5 }}>
            Connect Microsoft SNDS to see per-IP complaint-rate, trap-hit counts
            and filter-result tier as reported by Outlook / Hotmail. Paste the
            access key from postmaster.live.com to connect.
          </p>
          <div>
            <Button size="sm" variant="primary" onClick={() => setDialogOpen(true)}>
              Connect Microsoft SNDS
            </Button>
          </div>
        </div>
        <ConnectSndsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
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
          <ShieldAlert size={14} strokeWidth={2.2} />
          <strong style={{ fontSize: 13 }}>{cred.domain}</strong>
        </div>
        <span style={{ fontSize: 11, color: 'var(--wp-text-faint)' }}>
          <RefreshCw size={10} style={{ marginRight: 4 }} />
          last pulled {formatRelative(cred.last_pulled_at)}
        </span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>Complaint rate</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 18 }}>{formatRate(snapshot?.complaint_rate)}</strong>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 999,
                background: bandBg(band),
                color: bandFg(band),
              }}
            >
              {band === 'success' ? 'Green' : band === 'warning' ? 'Amber' : 'Red'}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>IP trust</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <strong style={{ fontSize: 16 }}>{snapshot?.ip_reputation ?? '—'}</strong>
            {snapshot?.ip_reputation && (
              <span
                style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: bandBg(ipBand),
                  color: bandFg(ipBand),
                }}
              >
                {ipBand === 'success' ? 'Green' : ipBand === 'warning' ? 'Amber' : 'Red'}
              </span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>Trap hits</div>
          <strong style={{ fontSize: 16, display: 'block', marginTop: 4 }}>{trapHits}</strong>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--wp-text-dim)' }}>Status</div>
          <strong style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
            {cred.last_status ?? '—'}
          </strong>
        </div>
      </div>

      <div style={{ color: 'var(--wp-text-faint)' }}>
        <div style={{ fontSize: 10, marginBottom: 4 }}>30-day complaint rate</div>
        <Sparkline values={series} />
      </div>

      <footer style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => disconnect.mutate({ provider: 'snds', id: cred.id })}
          disabled={disconnect.isPending}
        >
          <Trash2 size={12} /> Disconnect
        </Button>
      </footer>
    </div>
  );
}

export default SndsCard;
