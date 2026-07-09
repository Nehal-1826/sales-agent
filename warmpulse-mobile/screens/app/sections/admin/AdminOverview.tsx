import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { KpiCard } from '../../../../components/KpiCard';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Users, Inbox, Network, Send } from 'lucide-react-native';
import { useAdminOverview } from '../../../../lib/adminData';

export function AdminOverview() {
  const q = useAdminOverview();
  const o = q.data;
  const peerHealth = o && o.total_peer_inboxes > 0 ? Math.round((o.active_peer_inboxes / o.total_peer_inboxes) * 100) : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>PLATFORM</Text>
        <Text style={styles.title}>Admin Overview</Text>
      </Animated.View>

      <Async loading={q.isLoading} error={q.isError} isEmpty={!o} emptyText="No platform data." onRetry={q.refetch}>
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <View style={styles.grid}>
            <View style={styles.cell}><KpiCard label="Users" value={String(o?.total_users ?? 0)} sub={`${o?.active_users ?? 0} active`} /></View>
            <View style={styles.cell}><KpiCard label="Mailboxes" value={String(o?.total_mailboxes ?? 0)} sub={`${o?.active_mailboxes ?? 0} active`} accent={wp.accent2} /></View>
            <View style={styles.cell}><KpiCard label="Peer network" value={String(o?.total_peer_inboxes ?? 0)} sub={`${o?.active_peer_inboxes ?? 0} active`} accent={wp.success} /></View>
            <View style={styles.cell}><KpiCard label="MRR" value={`₹${Math.round((o?.mrr_cents ?? 0) / 100).toLocaleString('en-IN')}`} accent={wp.warning} /></View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(160)}>
          <Glass style={{ marginTop: 4 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>TODAY</Text>
            <Row icon={Send} title="Sends today" value={String(o?.total_sends_today ?? 0)} />
            <Row icon={Send} title="Sends · 7 days" value={String(o?.total_sends_7d ?? 0)} accent={wp.accent2} />
            <Row icon={Network} title="Peer pool health" value={`${peerHealth}%`} accent={wp.success} />
            <Row icon={Users} title="Active users" value={String(o?.active_users ?? 0)} accent={wp.accent} />
            <Row icon={Inbox} title="Active mailboxes" value={String(o?.active_mailboxes ?? 0)} accent={wp.warning} last />
          </Glass>
        </Animated.View>
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
