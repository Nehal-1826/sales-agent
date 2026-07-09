import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { CreditCard } from 'lucide-react-native';
import { useAllPlans } from '../../../../lib/adminData';

export function AdminPlans() {
  const q = useAllPlans();
  const plans = q.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>ADMIN</Text>
        <Text style={styles.title}>Plans & Pricing</Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(450).delay(80)}>
        <Glass style={{ marginTop: 4 }}>
          <Async loading={q.isLoading} error={q.isError} isEmpty={plans.length === 0} onRetry={q.refetch}>
            {plans.map((plan, idx) => {
              const label =
                plan.name +
                (plan.is_active ? '' : ' · inactive') +
                (plan.is_public ? '' : ' · hidden');
              return (
                <Row
                  key={plan.id}
                  icon={CreditCard}
                  title={label}
                  subtitle={`${plan.max_mailboxes} mailboxes`}
                  value={`₹${Math.round(plan.price_cents / 100).toLocaleString('en-IN')}`}
                  accent={plan.is_active ? wp.accent : wp.textFaint}
                  last={idx === plans.length - 1}
                />
              );
            })}
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
