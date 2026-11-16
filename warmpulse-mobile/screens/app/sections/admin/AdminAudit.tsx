import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { ScrollText } from 'lucide-react-native';
import { useAuditLog } from '../../../../lib/adminData';

export function AdminAudit() {
  const q = useAuditLog();
  const entries = (q.data ?? []).slice(0, 80);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>AUDIT</Text>
        <Text style={styles.title}>Activity Log</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(60)}>
        <Glass style={{ marginTop: 4 }}>
          <Async
            loading={q.isLoading}
            error={q.isError}
            isEmpty={entries.length === 0}
            emptyText="No activity yet."
            onRetry={q.refetch}
          >
            {entries.map((entry, i) => (
              <Row
                key={String(entry.id)}
                icon={ScrollText}
                title={entry.action}
                subtitle={`${entry.actor_email ?? 'system'}${entry.target_type ? ' · ' + entry.target_type : ''} · ${new Date(entry.created_at).toLocaleString()}`}
                value={entry.actor_role ?? ''}
                accent={wp.accent2}
                last={i === entries.length - 1}
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
