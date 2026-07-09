import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Users, Target, Trophy } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { KpiCard } from '../../../components/KpiCard';
import { Row } from '../../../components/Row';
import { Async } from '../../../components/Async';
import { useCrmSummary } from '../../../lib/data';
import { useT } from '../../../lib/i18n';

/**
 * Leads / CRM overview — Pro Plus & Agency tiers. Real data from /api/crm/summary.
 */
export function Leads() {
  const t = useT();
  const q = useCrmSummary();
  const s = q.data;
  const stages = s?.by_stage ? Object.entries(s.by_stage) : [];

  const STAGE_LABELS: Record<string, string> = {
    new: t('leads.stageNew'),
    contacted: t('leads.stageContacted'),
    replied: t('leads.stageReplied'),
    interested: t('leads.stageInterested'),
    won: t('leads.stageWon'),
    lost: t('leads.stageLost'),
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>{t('leads.eyebrow')}</Text>
        <Text style={styles.title}>{t('leads.title')}</Text>
      </Animated.View>

      <Async
        loading={q.isLoading}
        error={q.isError}
        isEmpty={!s}
        emptyText={t('leads.empty')}
        onRetry={q.refetch}
      >
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCell}>
              <KpiCard label={t('leads.campaigns')} value={String(s?.campaigns ?? 0)} />
            </View>
            <View style={styles.kpiCell}>
              <KpiCard label={t('leads.leads')} value={String(s?.leads ?? 0)} accent={wp.accent2} />
            </View>
            <View style={styles.kpiCell}>
              <KpiCard
                label={t('leads.wonValue')}
                value={`₹${Math.round((s?.won_value_cents ?? 0) / 100).toLocaleString('en-IN')}`}
                accent={wp.success}
              />
            </View>
          </View>
        </Animated.View>

        {stages.length > 0 ? (
          <Animated.View entering={FadeInUp.duration(450).delay(160)}>
            <Glass style={{ marginTop: 4 }}>
              <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>{t('leads.byStage')}</Text>
              {stages.map(([key, count], i) => (
                <Row
                  key={key}
                  icon={key === 'won' ? Trophy : key === 'lost' ? Target : Users}
                  title={STAGE_LABELS[key] ?? key}
                  value={String(count)}
                  accent={key === 'won' ? wp.success : key === 'lost' ? wp.danger : wp.accent}
                  last={i === stages.length - 1}
                />
              ))}
            </Glass>
          </Animated.View>
        ) : null}
      </Async>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCell: { width: '47%' },
});
