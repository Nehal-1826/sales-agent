import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { KpiCard } from '../../../../components/KpiCard';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Activity } from 'lucide-react-native';
import { useRevengeKpis, useRevengeEvents } from '../../../../lib/adminData';

export function AdminRetention() {
  const kpis = useRevengeKpis();
  const events = useRevengeEvents();
  const k = kpis.data;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>ADMIN</Text>
        <Text style={styles.title}>Retention</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <View style={styles.grid}>
          <View style={styles.cell}><KpiCard label="Sabotaged" value={String(k?.sabotaged_users ?? 0)} accent={wp.danger} /></View>
          <View style={styles.cell}><KpiCard label="Total runs" value={String(k?.total_runs ?? 0)} accent={wp.accent} /></View>
          <View style={styles.cell}><KpiCard label="Emails moved" value={String(k?.total_moved ?? 0)} accent={wp.success} /></View>
          <View style={styles.cell}><KpiCard label="Last run" value={k?.last_run_at ? new Date(k.last_run_at).toLocaleDateString() : '—'} /></View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(160)}>
        <Glass style={{ marginTop: 4 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>RECENT EVENTS</Text>
          <Async loading={events.isLoading} error={events.isError} isEmpty={!(events.data ?? []).length} onRetry={events.refetch}>
            {(events.data ?? []).map((ev, idx) => (
              <Row
                key={ev.id}
                icon={Activity}
                title={ev.user_email}
                subtitle={`${ev.trigger} · ${new Date(ev.created_at).toLocaleDateString()}`}
                value={ev.status}
                accent={ev.status === 'completed' ? wp.success : ev.status === 'failed' ? wp.danger : wp.warning}
                last={idx === (events.data ?? []).length - 1}
              />
            ))}
          </Async>
        </Glass>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  cell: { width: '47%' },
});
