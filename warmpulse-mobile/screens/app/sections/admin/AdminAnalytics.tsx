import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Sparkline } from '../../../../components/Sparkline';
import { Async } from '../../../../components/Async';
import { BarChart2, TrendingUp, PieChart } from 'lucide-react-native';
import { useSendVolume, useSignupRate, usePlanDistribution } from '../../../../lib/adminData';

export function AdminAnalytics() {
  const sendQ = useSendVolume();
  const signupQ = useSignupRate();
  const planQ = usePlanDistribution();

  const sendData = (sendQ.data ?? []).map((p) => p.sent);
  const signupData = (signupQ.data ?? []).map((p) => p.count);
  const plans = planQ.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>PLATFORM</Text>
        <Text style={styles.title}>Platform Analytics</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <Glass style={{ marginTop: 4 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>SENDS · DAILY</Text>
          <Async
            loading={sendQ.isLoading}
            error={sendQ.isError}
            isEmpty={sendData.length === 0}
            emptyText="No send data."
            onRetry={sendQ.refetch}
          >
            <Sparkline data={sendData} />
          </Async>
        </Glass>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(160)}>
        <Glass style={{ marginTop: 12 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>SIGNUPS · DAILY</Text>
          <Async
            loading={signupQ.isLoading}
            error={signupQ.isError}
            isEmpty={signupData.length === 0}
            emptyText="No signup data."
            onRetry={signupQ.refetch}
          >
            <Sparkline data={signupData} color={wp.accent2} />
          </Async>
        </Glass>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(240)}>
        <Glass style={{ marginTop: 12 }}>
          <Text style={[styles.eyebrow, { color: wp.textDim, marginBottom: 12 }]}>BY PLAN</Text>
          <Async
            loading={planQ.isLoading}
            error={planQ.isError}
            isEmpty={plans.length === 0}
            emptyText="No plan data."
            onRetry={planQ.refetch}
          >
            {plans.map((p, i) => (
              <Row
                key={p.plan_name}
                icon={PieChart}
                title={p.plan_name}
                subtitle={`${p.user_count} users · ${p.active_mailboxes} mailboxes`}
                value={`₹${Math.round(p.mrr_cents / 100).toLocaleString('en-IN')}`}
                accent={wp.success}
                last={i === plans.length - 1}
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
