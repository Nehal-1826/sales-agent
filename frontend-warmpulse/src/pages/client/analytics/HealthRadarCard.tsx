import { useMemo } from 'react';
import { ChartContainer } from '@/components/charts/ChartContainer';
import { RadarChartWp } from '@/components/charts/recharts/RadarChartWp';
import { chartTheme } from '@/components/charts/theme';
import {
  useBounceSpam,
  useEngagement,
  useHealthRadar,
  usePlacementTrend,
} from '@/features/analytics/api';
import type { AnalyticsCommonParams } from '@/features/analytics/types';

interface HealthRadarCardProps {
  params: AnalyticsCommonParams;
}

interface RadarRow extends Record<string, unknown> {
  axis: string;
  value: number;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sum = nums.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
  return sum / nums.length;
}

function toPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 1 ? v * 100 : v;
}

export function HealthRadarCard({ params }: HealthRadarCardProps) {
  // Prefer a backend-provided radar; otherwise synthesise from three sources.
  const direct = useHealthRadar({ mailbox_id: params.mailbox_id });
  const engagement = useEngagement(params);
  const placement = usePlacementTrend(params);
  const bounceSpam = useBounceSpam(params);

  const isLoading =
    direct.isLoading || engagement.isLoading || placement.isLoading || bounceSpam.isLoading;
  const isError =
    direct.isError && engagement.isError && placement.isError && bounceSpam.isError;

  const rows = useMemo<RadarRow[]>(() => {
    if (direct.data && direct.data.length > 0) {
      return direct.data.map((p) => ({ axis: p.axis, value: Number(p.value ?? 0) }));
    }
    const eng = engagement.data ?? [];
    const plc = placement.data ?? [];
    const bsp = bounceSpam.data ?? [];
    // Take last 7 entries per dataset (data is chronological ascending).
    const tail = <T,>(arr: T[]) => arr.slice(-7);

    const engTail = tail(eng);
    const plcTail = tail(plc);
    const bspTail = tail(bsp);

    const placementVal = avg(plcTail.map((p) => toPct(Number(p.inbox_pct ?? 0))));
    const openVal = avg(engTail.map((e) => toPct(Number(e.open_rate ?? 0))));
    const replyVal = avg(engTail.map((e) => toPct(Number(e.reply_rate ?? 0))));
    const rescueVal = avg(engTail.map((e) => toPct(Number(e.rescue_rate ?? 0))));
    const bounceVal = avg(bspTail.map((p) => toPct(Number(p.bounce_rate ?? 0))));
    const bounceHealth = Math.max(0, 100 - bounceVal);

    return [
      { axis: 'Inbox vs spam', value: Math.round(placementVal) },
      { axis: 'Opens', value: Math.round(openVal) },
      { axis: 'Replies', value: Math.round(replyVal) },
      { axis: 'Spam recovery', value: Math.round(rescueVal) },
      { axis: 'Failure-free', value: Math.round(bounceHealth) },
    ];
  }, [direct.data, engagement.data, placement.data, bounceSpam.data]);

  const empty = !isLoading && rows.every((r) => r.value === 0);

  return (
    <ChartContainer
      title="Health radar"
      subtitle="Last-7-day snapshot — higher is better on every axis."
      loading={isLoading}
      error={isError ? 'Failed to load health radar.' : null}
      empty={empty}
      emptyLabel="Not enough signal yet — run warmup for a few days."
      height={320}
    >
      <RadarChartWp<RadarRow>
        data={rows}
        angleKey="axis"
        series={[{ key: 'value', name: 'Last 7d', color: chartTheme.colors.primary }]}
        domain={[0, 100]}
        height={280}
      />
    </ChartContainer>
  );
}
