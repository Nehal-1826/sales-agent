import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Network, Users } from 'lucide-react-native';
import { usePeerPools, usePoolAssignments } from '../../../../lib/adminData';

export function AdminRouting() {
  const poolsQ = usePeerPools();
  const assignQ = usePoolAssignments();

  const pools = poolsQ.data ?? [];
  const assignments = assignQ.data ?? [];

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
                subtitle={`${a.pool_name} · ${a.client_plan ?? 'no plan'}`}
                value={`${a.sends_last_30d}/30d`}
                last={i === assignments.length - 1}
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
});
