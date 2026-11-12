import { Users, Mailbox, DollarSign, Activity } from 'lucide-react';
import { MetricTile } from './MetricTile';
import type { PlatformOverview } from '@/features/admin/types';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatNumber } from '@/lib/format';

interface KpiTilesProps {
  overview: PlatformOverview | undefined;
  loading: boolean;
}

// Backend (`/api/admin/platform-analytics/overview`) ships these field names; older
// mocks used `mrr_usd`/`queue_depth`/`sends_today`. Accept both so both shapes render.
type FlexibleOverview = PlatformOverview & {
  mrr_cents?: number;
  mrr_usd?: number;
  queue_depth?: number;
  sends_today?: number;
  total_sends_today?: number;
  total_users?: number;
  active_users?: number;
  active_mailboxes?: number;
  total_mailboxes?: number;
};

function fmt(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? formatNumber(n) : '—';
}

export function KpiTiles({ overview, loading }: KpiTilesProps) {
  const { money } = useLocaleFormat();
  const ov = overview as FlexibleOverview | undefined;
  const mrrCents = ov?.mrr_cents ?? (typeof ov?.mrr_usd === 'number' ? ov.mrr_usd * 100 : undefined);
  const mrrDisplay = typeof mrrCents === 'number' ? money(mrrCents / 100) : '—';
  const queueDepth = ov?.queue_depth;
  const sendsToday = ov?.sends_today ?? ov?.total_sends_today;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricTile
        label="Total users"
        value={fmt(ov?.total_users)}
        icon={<Users className="h-4 w-4" />}
        loading={loading}
      />
      <MetricTile
        label="Active mailboxes"
        value={fmt(ov?.active_mailboxes)}
        icon={<Mailbox className="h-4 w-4" />}
        hint={typeof ov?.total_mailboxes === 'number' ? `of ${formatNumber(ov.total_mailboxes)} total` : undefined}
        loading={loading}
      />
      <MetricTile
        label="MRR"
        value={mrrDisplay}
        icon={<DollarSign className="h-4 w-4" />}
        loading={loading}
      />
      <MetricTile
        label={typeof queueDepth === 'number' ? 'Queue depth' : 'Sends today'}
        value={typeof queueDepth === 'number' ? fmt(queueDepth) : fmt(sendsToday)}
        icon={<Activity className="h-4 w-4" />}
        hint={typeof queueDepth === 'number' && typeof sendsToday === 'number'
          ? `${formatNumber(sendsToday)} sends today`
          : undefined}
        loading={loading}
        tone={typeof queueDepth === 'number' && queueDepth > 500 ? 'warning' : 'success'}
      />
    </div>
  );
}
