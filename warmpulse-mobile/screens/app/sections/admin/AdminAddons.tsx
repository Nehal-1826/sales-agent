import { ScrollView, Text, StyleSheet } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { Package } from 'lucide-react-native';
import { useAdminAddons } from '../../../../lib/adminData';

export function AdminAddons() {
  const q = useAdminAddons();
  const addons = q.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>MONETIZATION</Text>
        <Text style={styles.title}>Add-ons</Text>
      </Animated.View>

      <Async
        loading={q.isLoading}
        error={q.isError}
        isEmpty={(q.data?.length ?? 0) === 0}
        emptyText="No add-ons."
        onRetry={q.refetch}
      >
        <Glass style={{ marginTop: 14 }}>
          {addons.map((addon, i) => (
            <Row
              key={addon.id}
              icon={Package}
              title={addon.name + (addon.is_active ? '' : ' · inactive')}
              subtitle={addon.description}
              value={`₹${Math.round(addon.price_cents / 100).toLocaleString('en-IN')}`}
              accent={addon.is_active ? wp.success : wp.textFaint}
              last={i === addons.length - 1}
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
