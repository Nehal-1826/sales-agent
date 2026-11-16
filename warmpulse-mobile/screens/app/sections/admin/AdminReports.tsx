import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { FileText } from 'lucide-react-native';
import { useAdminReportSchedules } from '../../../../lib/adminData';

export function AdminReports() {
  const q = useAdminReportSchedules();
  const schedules = q.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>MANAGEMENT</Text>
        <Text style={styles.title}>Reports</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(60)}>
        <Glass style={{ marginTop: 4 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>SCHEDULED REPORTS</Text>
          <Async
            loading={q.isLoading}
            error={q.isError}
            isEmpty={schedules.length === 0}
            emptyText="No scheduled reports."
            onRetry={q.refetch}
          >
            {schedules.map((s, i) => (
              <Row
                key={s.id}
                icon={FileText}
                title={s.name}
                subtitle={`${s.report_type} · ${s.cadence} · ${s.recipients.length} recipient(s)`}
                value={s.enabled ? 'On' : 'Off'}
                accent={s.enabled ? wp.success : wp.textFaint}
                last={i === schedules.length - 1}
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
