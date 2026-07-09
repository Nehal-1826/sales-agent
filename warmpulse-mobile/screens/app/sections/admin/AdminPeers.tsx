import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { KpiCard } from '../../../../components/KpiCard';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Network } from 'lucide-react-native';
import { useAdminPeers, useAdminPeerStats } from '../../../../lib/adminData';

export function AdminPeers() {
  const statsQ = useAdminPeerStats();
  const peersQ = useAdminPeers();
  const stats = statsQ.data;
  const peers = peersQ.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>WARMUP NETWORK</Text>
        <Text style={styles.title}>Peer Inboxes</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(60)}>
        <View style={styles.grid}>
          <View style={styles.cell}><KpiCard label="Total peers" value={String(stats?.total ?? 0)} sub={`${stats?.active ?? 0} active`} /></View>
          <View style={styles.cell}><KpiCard label="Avg reputation" value={stats ? stats.avg_reputation.toFixed(2) : '—'} accent={wp.success} /></View>
          <View style={styles.cell}><KpiCard label="Capacity used" value={`${Math.round(stats?.capacity_used_pct ?? 0)}%`} accent={wp.warning} /></View>
          <View style={styles.cell}><KpiCard label="Sends today" value={String(stats?.used_capacity_today ?? 0)} accent={wp.accent2} /></View>
        </View>
      </Animated.View>

      <Async loading={peersQ.isLoading} error={peersQ.isError} isEmpty={peers.length === 0} emptyText="No peer inboxes." onRetry={peersQ.refetch}>
        <Glass style={{ marginTop: 4 }}>
          {peers.slice(0, 60).map((p, i) => (
            <Row
              key={p.id}
              icon={Network}
              title={p.email}
              subtitle={`${p.provider} · ${p.sends_today}/${p.daily_capacity} today`}
              value={`${p.reputation_score.toFixed(2)}${p.is_active ? '' : ' · off'}`}
              accent={!p.is_active ? wp.danger : p.reputation_score >= 0.7 ? wp.success : wp.warning}
              last={i === Math.min(peers.length, 60) - 1}
            />
          ))}
        </Glass>
      </Async>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  cell: { width: '47%' },
});
