import { useMemo } from 'react';
import { ChartContainer, RadarChartWp, chartTheme } from '@/components/charts';
import { useDnsRollup, useReputationOverview } from '@/features/reputation/api';

/**
 * 6-axis health radar — SPF, DKIM, DMARC, Blacklist, Reputation, Bounce (inverted).
 * Values normalised to 0–100. Bounce axis is inverted (100 = low bounce, good).
 */
export function HealthRadarCard() {
  const dns = useDnsRollup();
  const overview = useReputationOverview();

  const loading = dns.isLoading || overview.isLoading;

  const data = useMemo(() => {
    const spf = dns.data?.spf_pct ?? 0;
    const dkim = dns.data?.dkim_pct ?? 0;
    const dmarc = dns.data?.dmarc_pct ?? 0;
    const blacklist =
      overview.data && overview.data.domains.length > 0
        ? Math.round(
            (overview.data.domains.filter((d) => d.blacklist_hits.length === 0).length /
              overview.data.domains.length) *
              100,
          )
        : 0;
    const reputation = overview.data?.overall_reputation ?? 0;
    // Bounce is an inverse health signal — invert so higher = better on the radar.
    const bounceRate = overview.data?.bounce_rate ?? 0;
    const bounceHealth = Math.max(0, Math.min(100, 100 - bounceRate));

    return [
      { axis: 'SPF', score: spf },
      { axis: 'DKIM', score: dkim },
      { axis: 'DMARC', score: dmarc },
      { axis: 'Block list', score: blacklist },
      { axis: 'Sender trust', score: reputation },
      { axis: 'Failed delivery', score: bounceHealth },
    ];
  }, [dns.data, overview.data]);

  const allZero = data.every((d) => d.score === 0);

  return (
    <ChartContainer
      title="Health radar"
      subtitle="Six-axis inbox delivery fingerprint"
      loading={loading}
      empty={!loading && allZero}
      emptyLabel="Add a mailbox to populate the radar."
      height={320}
    >
      <RadarChartWp
        data={data}
        angleKey="axis"
        series={[{ key: 'score', name: 'Score', color: chartTheme.colors.primary }]}
        height={320}
        domain={[0, 100]}
        valueFormatter={(v) => `${Math.round(Number(v))}`}
      />
    </ChartContainer>
  );
}
