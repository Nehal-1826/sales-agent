import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Settings, Shield, Zap, DollarSign, AlertTriangle } from 'lucide-react-native';
import { useAdminSettings } from '../../../../lib/adminData';

export function AdminSettings2() {
  const q = useAdminSettings();
  const d = q.data;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>ADMIN</Text>
        <Text style={styles.title}>Platform Settings</Text>
      </Animated.View>

      <Async loading={q.isLoading} error={q.isError} isEmpty={!d} onRetry={q.refetch}>
        <Animated.View entering={FadeInUp.duration(450).delay(60)}>
          <Glass style={{ marginTop: 4 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>INTEGRATIONS</Text>
            <Row
              icon={Settings}
              title="Google OAuth"
              value={d?.google_oauth?.configured ? 'Configured' : 'Not set'}
              accent={d?.google_oauth?.configured ? wp.success : wp.textFaint}
            />
            <Row
              icon={Zap}
              title="LLM provider"
              value={d?.llm?.configured ? 'Configured' : 'Not set'}
              accent={d?.llm?.configured ? wp.success : wp.textFaint}
            />
            <Row
              icon={Shield}
              title="Transactional SMTP"
              subtitle={d?.transactional_smtp?.host ?? ''}
              value={d?.transactional_smtp?.mode ?? '—'}
              accent={d?.transactional_smtp?.configured ? wp.success : wp.textFaint}
              last
            />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(120)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>WARMUP DEFAULTS</Text>
            <Row
              icon={Settings}
              title="Day 1 sends"
              value={String(d?.defaults?.ramp_day1 ?? '—')}
            />
            <Row
              icon={Settings}
              title="Day 7 target"
              value={String(d?.defaults?.ramp_day7_target ?? '—')}
            />
            <Row
              icon={Settings}
              title="Human delay"
              value={
                d?.defaults?.human_delay_min_s != null && d?.defaults?.human_delay_max_s != null
                  ? `${d.defaults.human_delay_min_s}-${d.defaults.human_delay_max_s}s`
                  : '—'
              }
            />
            <Row
              icon={Settings}
              title="Log retention (days)"
              value={String(d?.defaults?.warmup_log_retention_days ?? '—')}
              last
            />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(180)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>LLM SPEND</Text>
            <Row
              icon={DollarSign}
              title="Spend MTD"
              value={`$${(d?.llm?.spend_mtd_usd ?? 0).toFixed(2)}`}
              accent={wp.accent2}
            />
            <Row
              icon={DollarSign}
              title="Default cap (tokens)"
              value={(d?.llm?.default_cap_tokens ?? 0).toLocaleString()}
              accent={wp.accent2}
              last
            />
          </Glass>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <Glass style={{ marginTop: 16 }}>
            <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>DANGER</Text>
            <Row
              icon={AlertTriangle}
              title="Maintenance mode"
              value={d?.danger?.maintenance_mode ? 'ON' : 'Off'}
              accent={d?.danger?.maintenance_mode ? wp.danger : wp.textFaint}
              last
            />
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
