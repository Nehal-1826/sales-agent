import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass, hexA } from '../../../../components/Glass';
import { KpiCard } from '../../../../components/KpiCard';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Network } from 'lucide-react-native';
import { useAdminPeers, useAdminPeerStats, type PeerInbox } from '../../../../lib/adminData';
import {
  useDeletePeer,
  useResetPeerCapacity,
  useResetAllPeerCapacity,
  useTestPeerConnection,
  usePatchPeer,
} from '../../../../lib/adminMutations';

export function AdminPeers() {
  const statsQ = useAdminPeerStats();
  const peersQ = useAdminPeers();
  const stats = statsQ.data;
  const peers = peersQ.data ?? [];

  const resetOne = useResetPeerCapacity();
  const resetAll = useResetAllPeerCapacity();
  const remove = useDeletePeer();
  const test = useTestPeerConnection();
  const patch = usePatchPeer();

  const ok = (m: string) => Alert.alert('Done', m);
  const fail = () => Alert.alert('Failed', 'That action did not complete. Try again.');

  function resetAllCapacity() {
    Alert.alert('Reset all capacity', 'Zero today\'s send counter for every peer inbox?', [
      { text: 'Reset all', style: 'destructive', onPress: () =>
        resetAll.mutate(undefined, { onSuccess: (r) => ok(`${r.peers_reset} peers reset.`), onError: fail }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function manage(p: PeerInbox) {
    Alert.alert(p.email, `${p.provider} · reputation ${p.reputation_score.toFixed(2)}`, [
      { text: 'Test connection', onPress: () =>
        test.mutate({ peerId: p.id }, {
          onSuccess: (r) => Alert.alert('Connection test', `SMTP ${r.smtp_ok ? 'OK' : 'fail'} · IMAP ${r.imap_ok ? 'OK' : 'fail'}${r.smtp_error ? `\n${r.smtp_error}` : ''}${r.imap_error ? `\n${r.imap_error}` : ''}`),
          onError: fail,
        }) },
      { text: 'Reset capacity', onPress: () =>
        resetOne.mutate(p.id, { onSuccess: () => ok('Capacity reset for this peer.'), onError: fail }) },
      { text: p.is_active ? 'Deactivate' : 'Activate', onPress: () =>
        patch.mutate({ peerId: p.id, patch: { is_active: !p.is_active } }, { onSuccess: () => ok(p.is_active ? 'Peer deactivated.' : 'Peer activated.'), onError: fail }) },
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Alert.alert('Delete peer', `Permanently delete ${p.email}?`, [
          { text: 'Delete', style: 'destructive', onPress: () =>
            remove.mutate(p.id, { onSuccess: () => ok('Peer deleted.'), onError: fail }) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }},
    ]);
  }

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

      <Pressable style={styles.resetAllBtn} onPress={resetAllCapacity}>
        <Text style={styles.resetAllText}>Reset all capacity</Text>
      </Pressable>

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
              onPress={() => manage(p)}
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
  resetAllBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: hexA(wp.accent, 0.4),
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: hexA(wp.accent, 0.12),
    marginBottom: 6,
  },
  resetAllText: { color: wp.accent, fontFamily: fonts.sansSemibold, fontSize: 13 },
});
