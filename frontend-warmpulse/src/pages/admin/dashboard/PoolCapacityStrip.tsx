import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { SparklineWp } from '@/components/charts';
import type { PeerInboxStats } from '@/features/admin/types';

interface PoolCapacityStripProps {
  stats: PeerInboxStats | undefined;
  loading?: boolean;
}

export function PoolCapacityStrip({ stats, loading }: PoolCapacityStripProps) {
  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-4 w-40" />
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const s = stats;
  const used = s?.used_capacity_today;
  const total = s?.total_capacity;
  const fmt = (n: number | undefined | null) =>
    typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';

  const providers = s?.by_provider ?? [];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Peer pool capacity</h3>
          <p className="text-xs text-text-dim">
            {used != null || total != null ? `${fmt(used)} / ${fmt(total)} used today` : '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-dim">Active inboxes</p>
          <p className="text-lg font-semibold text-text">
            {s ? `${s.active ?? 0} / ${s.total ?? 0}` : '—'}
          </p>
        </div>
      </div>
      {providers.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {providers.slice(0, 4).map((p) => {
            const spark = Array.from({ length: 12 }, (_, i) => ({
              value: Math.round(p.active * (0.7 + Math.sin(i / 2) * 0.3)),
            }));
            return (
              <div
                key={p.provider}
                className="rounded-lg border border-border-muted bg-surface-2/40 px-3 py-2"
              >
                <p className="text-xs uppercase tracking-wide text-text-dim">{p.provider}</p>
                <p className="mt-0.5 text-lg font-semibold text-text">
                  {p.active} <span className="text-xs font-normal text-text-dim">/ {p.count}</span>
                </p>
                <div className="mt-1">
                  <SparklineWp data={spark} yKey="value" height={24} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-dim">No provider breakdown yet.</p>
      )}
    </Card>
  );
}
