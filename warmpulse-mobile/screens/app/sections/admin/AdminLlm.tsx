import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { KpiCard } from '../../../../components/KpiCard';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Cpu, Users } from 'lucide-react-native';
import { useLlmSummary } from '../../../../lib/adminData';

export function AdminLlm() {
  const q = useLlmSummary();
  const d = q.data;

  const byMode = d?.by_mode ?? {};
  const byUser = d?.by_user ?? [];

  const modeRows: { label: string; value: number }[] = [
    { label: 'A', value: byMode.A ?? 0 },
    { label: 'B', value: byMode.B ?? 0 },
    { label: 'C', value: byMode.C ?? 0 },
    { label: 'D', value: byMode.D ?? 0 },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>PLATFORM</Text>
        <Text style={styles.title}>AI Usage</Text>
      </Animated.View>

      <Async
        loading={q.isLoading}
        error={q.isError}
        isEmpty={!q.data}
        emptyText="No LLM usage data."
        onRetry={q.refetch}
      >
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <View style={styles.grid}>
            <View style={styles.cell}>
              <KpiCard
                label="Tokens MTD"
                value={(d?.total_tokens_mtd ?? 0).toLocaleString()}
              />
            </View>
            <View style={styles.cell}>
              <KpiCard
                label="Cost MTD"
                value={`₹${Math.round((d?.total_cost_cents_mtd ?? 0) / 100).toLocaleString('en-IN')}`}
                accent={wp.accent2}
              />
            </View>
            <View style={styles.cell}>
              <KpiCard
                label="Forecast EOM"
                value={`₹${Math.round((d?.forecast_eom_cents ?? 0) / 100).toLocaleString('en-IN')}`}
                accent={wp.warning}
              />
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(160)}>
          <Glass style={{ marginTop: 4 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>BY MODE</Text>
            {modeRows.map((m, i) => (
              <Row
                key={m.label}
                icon={Cpu}
                title={`Mode ${m.label}`}
                value={m.value.toLocaleString()}
                last={i === modeRows.length - 1}
              />
            ))}
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <Glass style={{ marginTop: 12 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>TOP USERS</Text>
            {byUser.length === 0 ? (
              <Text style={styles.empty}>No user data.</Text>
            ) : (
              byUser.map((u, i) => (
                <Row
                  key={u.email}
                  icon={Users}
                  title={u.email}
                  subtitle={`${u.plan ?? '—'} · ${u.pct_used}% of cap`}
                  value={`₹${Math.round(u.cost_cents_mtd / 100).toLocaleString('en-IN')}`}
                  last={i === byUser.length - 1}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  cell: { width: '47%' },
  empty: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, textAlign: 'center', paddingVertical: 8 },
});
