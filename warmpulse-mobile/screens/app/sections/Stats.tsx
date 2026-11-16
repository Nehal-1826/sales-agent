import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { KpiCard } from '../../../components/KpiCard';
import { MiniBars } from '../../../components/MiniBars';
import { Sparkline } from '../../../components/Sparkline';
import { Async } from '../../../components/Async';
import { useDailyMetrics, normalizeMetric } from '../../../lib/data';
import { useT } from '../../../lib/i18n';

const RANGES = ['7d', '30d', '90d'] as const;
type Range = typeof RANGES[number];

const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (n: number) => Math.round(n);

export function Stats() {
  const t = useT();
  const [range, setRange] = useState<Range>('30d');
  const q = useDailyMetrics();

  const allRows = (q.data ?? []).map(normalizeMetric);
  const rows = allRows.slice(-RANGE_DAYS[range]);

  const sentSeries = rows.map((r) => r.sent);
  const warmthSeries = rows.map((r) => r.warmth);
  const openSeries = rows.map((r) => r.opened);

  const totalSent = sum(sentSeries);
  const totalOpens = sum(openSeries);
  const totalReplies = sum(rows.map((r) => r.replied));
  const totalBounced = sum(rows.map((r) => r.bounced));
  const totalSpamRescued = sum(rows.map((r) => r.spamRescued));

  const avgWarmth = rows.length ? round(sum(warmthSeries) / rows.length) : 0;
  const openRate = totalSent > 0 ? round((100 * totalOpens) / totalSent) : 0;
  const replyRate = totalSent > 0 ? round((100 * totalReplies) / totalSent) : 0;
  const bounceRate = totalSent > 0 ? round((100 * totalBounced) / totalSent) : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={{ color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 }}>
          {t('stats.eyebrow')}
        </Text>
        <Text style={{ color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 16 }}>
          {t('stats.heading')}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <View style={styles.pillRow}>
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={[
                  styles.pill,
                  active ? styles.pillActive : styles.pillInactive,
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    active ? styles.pillTextActive : styles.pillTextInactive,
                  ]}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <Async
        loading={q.isLoading}
        error={q.isError}
        isEmpty={rows.length === 0}
        emptyText={t('stats.empty')}
        onRetry={q.refetch}
      >
        <Animated.View entering={FadeInUp.duration(450).delay(160)}>
          <Glass style={styles.card}>
            <Text style={styles.eyebrow}>{t('stats.warmthOverTime')}</Text>
            <View style={styles.metricRow}>
              <Text style={styles.bigValue}>{avgWarmth}</Text>
              <Text style={styles.delta}>{t('stats.avg')}</Text>
            </View>
            <Sparkline data={warmthSeries} height={64} />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <Glass style={styles.card}>
            <Text style={styles.eyebrow}>{t('stats.emailsSent')}</Text>
            <MiniBars data={sentSeries} height={90} />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(280)}>
          <View style={[styles.kpiRow, styles.kpiRowSpaced]}>
            <KpiCard label={t('stats.totalSent')} value={String(totalSent)} />
            <KpiCard label={t('stats.totalOpens')} value={String(totalOpens)} />
            <KpiCard label={t('stats.openRate')} value={`${openRate}%`} accent={wp.accent} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(320)}>
          <View style={styles.kpiRow}>
            <KpiCard label={t('stats.avgWarmth')} value={String(avgWarmth)} />
            <KpiCard label={t('stats.bounce')} value={`${bounceRate}%`} accent={wp.success} />
            <KpiCard label={t('stats.spamSaves')} value={String(totalSpamRescued)} accent={wp.warning} sub={t('stats.replyRateSub', { v: replyRate })} />
          </View>
        </Animated.View>
      </Async>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: wp.accent,
  },
  pillInactive: {
    borderWidth: 1,
    borderColor: wp.border,
    backgroundColor: 'transparent',
  },
  pillText: {
    fontSize: 13,
    fontFamily: fonts.sansSemibold,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  pillTextInactive: {
    color: wp.textDim,
  },
  card: {
    marginBottom: 14,
  },
  eyebrow: {
    color: wp.textFaint,
    fontSize: 10,
    letterSpacing: 1.4,
    fontFamily: fonts.monoBold,
    marginBottom: 8,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 12,
  },
  bigValue: {
    color: wp.text,
    fontSize: 28,
    fontFamily: fonts.mono,
    letterSpacing: -0.5,
  },
  delta: {
    color: wp.success,
    fontSize: 13,
    fontFamily: fonts.sansSemibold,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiRowSpaced: {
    marginBottom: 10,
  },
});
