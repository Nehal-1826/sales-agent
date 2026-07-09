import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Activity, Server, Database } from 'lucide-react-native';
import { useAdminSystemHealth } from '../../../../lib/adminData';

export function AdminHealth() {
  const q = useAdminSystemHealth();
  const h = q.data;
  const beatDelay = h?.queues?.beat_delay_s;
  const beatOk = typeof beatDelay === 'number' && beatDelay < 120;
  const workers = h?.workers ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>OPERATIONS</Text>
        <Text style={styles.title}>System Health</Text>
      </Animated.View>

      <Async loading={q.isLoading} error={q.isError} isEmpty={!h} emptyText="No health data." onRetry={q.refetch}>
        <Animated.View entering={FadeInUp.duration(450).delay(60)}>
          <Glass>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>QUEUES &amp; BEAT</Text>
            <Row
              icon={Activity}
              title="Beat heartbeat"
              subtitle={typeof beatDelay === 'number' ? `${Math.round(beatDelay)}s ago` : 'unknown'}
              value={beatOk ? 'Alive' : 'Stale'}
              accent={beatOk ? wp.success : wp.danger}
            />
            <Row icon={Database} title="Redis ops/s" value={String(h?.queues?.redis_ops_per_s ?? 0)} accent={wp.accent2} />
            <Row icon={Server} title="Queue · default" value={String(h?.queues?.per_queue?.default ?? 0)} />
            <Row icon={Server} title="Queue · smtp" value={String(h?.queues?.per_queue?.smtp ?? 0)} last accent={wp.warning} />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(120)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>WORKERS</Text>
            {workers.length === 0 ? (
              <Text style={{ color: wp.textDim, fontFamily: fonts.sans, fontSize: 13 }}>No workers reporting.</Text>
            ) : (
              workers.map((w, i) => (
                <Row
                  key={w.id}
                  icon={Server}
                  title={w.host || w.id}
                  subtitle={w.current_task ?? 'idle'}
                  value={w.status}
                  accent={w.status === 'busy' ? wp.accent : wp.success}
                  last={i === workers.length - 1}
                />
              ))
            )}
          </Glass>
        </Animated.View>
      </Async>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 },
});
