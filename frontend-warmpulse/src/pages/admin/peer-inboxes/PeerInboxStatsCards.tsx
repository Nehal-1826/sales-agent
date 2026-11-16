import { Activity, Inbox, Gauge, ShieldCheck, Database } from 'lucide-react';
import { MetricTile } from '../dashboard/MetricTile';
import type { PeerInboxStats } from '@/features/admin/types';

interface PeerInboxStatsCardsProps {
  stats: PeerInboxStats | undefined;
  loading?: boolean;
}

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : '—';
}

export function PeerInboxStatsCards({ stats, loading }: PeerInboxStatsCardsProps) {
  const s = stats;
  const used = s?.used_capacity_today;
  const total = s?.total_capacity;
  const providerCount = s?.by_provider?.length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <MetricTile
        label="Total inboxes"
        value={s?.total ?? 0}
        icon={<Inbox className="h-4 w-4" />}
        loading={loading}
      />
      <MetricTile
        label="Active"
        value={s?.active ?? 0}
        icon={<Activity className="h-4 w-4" />}
        loading={loading}
        tone="success"
      />
      <MetricTile
        label="Providers"
        value={providerCount}
        icon={<Database className="h-4 w-4" />}
        loading={loading}
      />
      <MetricTile
        label="Avg trust score"
        value={typeof s?.avg_reputation === 'number' ? Math.round(s.avg_reputation) : 0}
        icon={<ShieldCheck className="h-4 w-4" />}
        loading={loading}
      />
      <MetricTile
        label="Daily limit today"
        value={used != null || total != null ? `${fmt(used)} / ${fmt(total)}` : '—'}
        icon={<Gauge className="h-4 w-4" />}
        loading={loading}
      />
    </div>
  );
}
