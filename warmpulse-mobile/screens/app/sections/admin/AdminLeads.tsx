import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { KpiCard } from '../../../../components/KpiCard';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { BarChart2, Users } from 'lucide-react-native';
import { useAdminCrmOverview } from '../../../../lib/adminData';

function pct(x: number): number {
  return x <= 1 ? Math.round(x * 100) : Math.round(x);
}

export function AdminLeads() {
  const q = useAdminCrmOverview();
  const d = q.data;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>ADMIN</Text>
        <Text style={styles.title}>Leads (CRM)</Text>
      </Animated.View>

      <Async loading={q.isLoading} error={q.isError} isEmpty={!q.data} onRetry={q.refetch}>
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <View style={styles.grid}>
            <View style={styles.cell}><KpiCard label="Campaigns" value={String(d?.total_campaigns ?? 0)} accent={wp.accent} /></View>
            <View style={styles.cell}><KpiCard label="Leads" value={String(d?.total_leads ?? 0)} accent={wp.accent2} /></View>
            <View style={styles.cell}><KpiCard label="Active enrollments" value={String(d?.active_enrollments ?? 0)} accent={wp.success} /></View>
            <View style={styles.cell}><KpiCard label="Sent 30d" value={String(d?.emails_sent_30d ?? 0)} accent={wp.warning} /></View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(160)}>
          <Glass style={{ marginTop: 4 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>ENGAGEMENT</Text>
            <Row icon={BarChart2} title="Open rate" value={`${pct(d?.open_rate ?? 0)}%`} accent={wp.accent} />
            <Row icon={BarChart2} title="Reply rate" value={`${pct(d?.reply_rate ?? 0)}%`} accent={wp.success} last />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <Glass style={{ marginTop: 12 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>WORKSPACES</Text>
            {(d?.workspaces ?? []).map((ws, idx) => (
              <Row
                key={ws.workspace_id}
                icon={Users}
                title={ws.name}
                subtitle={ws.owner_email}
                value={`${ws.leads} leads`}
                last={idx === (d?.workspaces ?? []).length - 1}
              />
            ))}
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
