import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ShieldCheck } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { Gauge } from '../../../components/Gauge';
import { KpiCard } from '../../../components/KpiCard';
import { Sparkline } from '../../../components/Sparkline';
import { Row } from '../../../components/Row';
import { Async } from '../../../components/Async';
import { useAuth } from '../../../lib/auth';
import { usePlan } from '../../../lib/usePlan';
import { useDashboardSummary, normalizeSummary, useMailboxes } from '../../../lib/data';
import { useT } from '../../../lib/i18n';

export function Dashboard() {
  const t = useT();
  const { user } = useAuth();
  const { planName } = usePlan();
  const planLabel = planName.toUpperCase();

  const summaryQuery = useDashboardSummary();
  const summary = normalizeSummary(summaryQuery.data);
  const mailboxesQuery = useMailboxes();
  const mailboxes = mailboxesQuery.data ?? [];
  const singleMailbox = mailboxes.length === 1 ? mailboxes[0] : undefined;

  // Provider pill: single mailbox → capitalized provider, else mailbox count.
  const providerLabel = singleMailbox
    ? singleMailbox.provider.charAt(0).toUpperCase() + singleMailbox.provider.slice(1)
    : `${mailboxes.length} mailboxes`;
  // Day pill: single mailbox → "DAY N", multiple → "{count} MAILBOXES".
  const dayLabel = singleMailbox
    ? `Day ${singleMailbox.current_day}`
    : `${mailboxes.length} mailboxes`;

  const warmth = summary?.warmth ?? 0;
  const warmthDelta = summary?.warmthDelta ?? 0;
  const trend = summary?.trend ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={{ color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 }}>
          {planLabel} {t('dash.planSuffix')}
        </Text>
        <Text style={{ color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 }}>
          {user?.email ?? t('dash.yourMailbox')}
        </Text>
      </Animated.View>

      <Async
        loading={summaryQuery.isLoading}
        error={summaryQuery.isError}
        isEmpty={!summary || summary.mailboxCount === 0}
        emptyText={t('dash.empty')}
        onRetry={summaryQuery.refetch}
      >
        {/* Provider / Day pills */}
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <View style={styles.pillsRow}>
            <View style={[styles.pill, { backgroundColor: hexA(wp.accent, 0.15), borderColor: hexA(wp.accent, 0.3) }]}>
              <Text style={[styles.pillText, { color: wp.accent }]}>{providerLabel}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: hexA(wp.accent2, 0.15), borderColor: hexA(wp.accent2, 0.3), marginLeft: 8 }]}>
              <Text style={[styles.pillText, { color: wp.accent2 }]}>{dayLabel}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Warmth Gauge */}
        <Animated.View entering={FadeInUp.duration(450).delay(160)}>
          <Glass style={styles.gaugeCard}>
            <View style={styles.gaugeInner}>
              <Gauge value={warmth} />
              <View style={[styles.deltaChip, { backgroundColor: hexA(wp.success, 0.15), borderColor: hexA(wp.success, 0.3) }]}>
                <Text style={[styles.deltaText, { color: wp.success }]}>
                  {warmthDelta >= 0 ? `+${warmthDelta}` : `${warmthDelta}`} · 24h
                </Text>
              </View>
            </View>
          </Glass>
        </Animated.View>

        {/* KPI Grid */}
        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCell}>
              <KpiCard label={t('dash.sent')} value={String(summary?.sentToday ?? 0)} />
            </View>
            <View style={styles.kpiCell}>
              <KpiCard label={t('dash.opens')} value={String(summary?.opensToday ?? 0)} accent={wp.accent2} />
            </View>
            <View style={styles.kpiCell}>
              <KpiCard label={t('dash.replies')} value={String(summary?.repliesToday ?? 0)} accent={wp.success} />
            </View>
            <View style={styles.kpiCell}>
              <KpiCard label={t('dash.spamRescue')} value={String(summary?.spamRescuesToday ?? 0)} sub={t('dash.pulledFromSpam')} accent={wp.warning} />
            </View>
          </View>
        </Animated.View>

        {/* Sparkline card */}
        <Animated.View entering={FadeInUp.duration(450).delay(320)}>
          <Glass style={styles.sparkCard}>
            <View style={styles.cardHeader}>
              <Text style={[styles.eyebrow, { color: wp.textDim }]}>{t('dash.warmthTrend')}</Text>
              <View style={[styles.badge, { backgroundColor: hexA(wp.success, 0.15), borderColor: hexA(wp.success, 0.3) }]}>
                <Text style={[styles.badgeText, { color: wp.success }]}>
                  {warmthDelta >= 0 ? `+${warmthDelta}` : `${warmthDelta}`} {t('dash.pts')}
                </Text>
              </View>
            </View>
            <Sparkline data={trend} color={wp.accent} fill />
          </Glass>
        </Animated.View>

        {/* Placement */}
        <Animated.View entering={FadeInUp.duration(450).delay(400)}>
          <Glass style={styles.domainCard}>
            <View style={styles.cardHeader}>
              <Text style={[styles.eyebrow, { color: wp.textDim }]}>{t('dash.placement')}</Text>
              <View style={[styles.badge, { backgroundColor: hexA(wp.success, 0.15), borderColor: hexA(wp.success, 0.3) }]}>
                <Text style={[styles.badgeText, { color: wp.success }]}>{t('dash.inboxBadge', { v: summary?.inboxPct ?? 0 })}</Text>
              </View>
            </View>
            <Row icon={ShieldCheck} title={t('dash.inbox')} value={`${summary?.inboxPct ?? 0}%`} accent={wp.success} />
            <Row icon={ShieldCheck} title={t('dash.promotions')} value={`${summary?.promotionsPct ?? 0}%`} accent={wp.accent2} />
            <Row icon={ShieldCheck} title={t('dash.spam')} value={`${summary?.spamPct ?? 0}%`} accent={wp.warning} last={true} />
          </Glass>
        </Animated.View>
      </Async>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pillsRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 10,
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
  },
  gaugeCard: {
    marginBottom: 16,
    alignItems: 'center',
  },
  gaugeInner: {
    alignItems: 'center',
  },
  deltaChip: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  deltaText: {
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCell: {
    width: '47%',
  },
  sparkCard: {
    marginBottom: 16,
  },
  domainCard: {
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: fonts.monoBold,
    letterSpacing: 1.2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.3,
  },
});
