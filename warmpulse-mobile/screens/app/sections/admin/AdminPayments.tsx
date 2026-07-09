import { ScrollView, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { KpiCard } from '../../../../components/KpiCard';
import { CreditCard } from 'lucide-react-native';
import { useAdminPayments } from '../../../../lib/adminData';

export function AdminPayments() {
  const q = useAdminPayments();
  const data = q.data ?? [];

  const paid = data
    .filter((p) => p.status === 'succeeded')
    .reduce((s, p) => s + p.amount_cents, 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>REVENUE</Text>
        <Text style={styles.title}>Payments</Text>
      </Animated.View>

      <KpiCard
        label="Collected"
        value={`₹${Math.round(paid / 100).toLocaleString('en-IN')}`}
        sub="succeeded payments"
        accent={wp.success}
      />

      <Async
        loading={q.isLoading}
        error={q.isError}
        isEmpty={data.length === 0}
        emptyText="No payments."
        onRetry={q.refetch}
      >
        <Glass style={{ marginTop: 14 }}>
          {data.map((payment, i) => (
            <Row
              key={payment.id}
              icon={CreditCard}
              title={payment.user_email ?? '—'}
              subtitle={`${payment.plan_name ?? '—'} · ${new Date(payment.created_at).toLocaleDateString()} · ${payment.status}`}
              value={`₹${Math.round(payment.amount_cents / 100).toLocaleString('en-IN')}`}
              accent={
                payment.status === 'succeeded'
                  ? wp.success
                  : payment.status === 'failed'
                  ? wp.danger
                  : wp.warning
              }
              last={i === data.length - 1}
            />
          ))}
        </Glass>
      </Async>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  title: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 14 },
});
