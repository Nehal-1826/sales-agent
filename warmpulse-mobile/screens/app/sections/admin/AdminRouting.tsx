import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { PromptModal } from '../../../../components/PromptModal';
import { Network, Users } from 'lucide-react-native';
import { usePeerPools, usePoolAssignments, type PoolAssignment } from '../../../../lib/adminData';
import { useAssignPool, useRevertPool } from '../../../../lib/adminMutations';

export function AdminRouting() {
  const poolsQ = usePeerPools();
  const assignQ = usePoolAssignments();

  const pools = poolsQ.data ?? [];
  const assignments = assignQ.data ?? [];

  const [assignTarget, setAssignTarget] = useState<PoolAssignment | null>(null);
  const assign = useAssignPool();
  const revert = useRevertPool();

  const ok = (m: string) => Alert.alert('Done', m);
  const fail = () => Alert.alert('Failed', 'Action did not complete. Try again.');

  function manageAssignment(a: PoolAssignment) {
    Alert.alert(a.client_email, `Pool: ${a.pool_name}`, [
      { text: 'Reassign to pool', onPress: () => setAssignTarget(a) },
      {
        text: 'Revert to default',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Revert to default', `Move ${a.client_email} back to the default pool?`, [
            { text: 'Revert', style: 'destructive', onPress: () =>
              revert.mutate(a.workspace_id, { onSuccess: () => ok('Reverted to default pool.'), onError: fail }) },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>PLATFORM</Text>
        <Text style={styles.title}>Account Routing</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <Glass style={{ marginTop: 4 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>PEER POOLS</Text>
          <Async
            loading={poolsQ.isLoading}
            error={poolsQ.isError}
            isEmpty={pools.length === 0}
            emptyText="No peer pools."
            onRetry={poolsQ.refetch}
          >
            {pools.map((pool, i) => (
              <Row
                key={pool.id}
                icon={Network}
                title={`${pool.name}${pool.is_default ? ' · default' : ''}`}
                subtitle={`${pool.member_count} peers · ${pool.client_count} clients`}
                accent={pool.is_default ? wp.accent : undefined}
                last={i === pools.length - 1}
              />
            ))}
          </Async>
        </Glass>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(160)}>
        <Glass style={{ marginTop: 12 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>CLIENT ASSIGNMENTS</Text>
          <Async
            loading={assignQ.isLoading}
            error={assignQ.isError}
            isEmpty={assignments.length === 0}
            emptyText="No client assignments."
            onRetry={assignQ.refetch}
          >
            {assignments.map((a, i) => (
              <Row
                key={a.workspace_id}
                icon={Users}
                title={a.client_email}
                subtitle={`${a.pool_name} · ${a.client_plan ?? 'no plan'} · tap to manage`}
                value={`${a.sends_last_30d}/30d`}
                onPress={() => manageAssignment(a)}
                last={i === assignments.length - 1}
              />
            ))}
          </Async>
        </Glass>
      </Animated.View>

      <PromptModal
        visible={!!assignTarget}
        title={`Reassign ${assignTarget?.client_email ?? ''}`}
        message={pools.length ? 'Paste a pool ID:' : 'Paste a pool ID:'}
        placeholder={pools[0]?.id ?? 'pool UUID'}
        submitLabel="Assign"
        busy={assign.isPending}
        onSubmit={(val) => {
          if (!assignTarget) return;
          assign.mutate(
            { workspaceId: assignTarget.workspace_id, poolId: val.trim() },
            {
              onSuccess: () => { ok('Pool updated.'); setAssignTarget(null); },
              onError: () => Alert.alert('Failed', 'Check the pool ID is valid.'),
            },
          );
        }}
        onClose={() => setAssignTarget(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 },
});
