import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass, hexA } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { User } from 'lucide-react-native';
import { useAdminUsers } from '../../../../lib/adminData';

export function AdminUsers() {
  const [search, setSearch] = useState('');
  const q = useAdminUsers(search);
  const users = q.data ?? [];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={styles.eyebrow}>PLATFORM</Text>
        <Text style={styles.title}>Users</Text>
      </Animated.View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by email…"
        placeholderTextColor={wp.textFaint}
        autoCapitalize="none"
      />

      <Async loading={q.isLoading} error={q.isError} isEmpty={users.length === 0} emptyText="No users found." onRetry={q.refetch}>
        <Glass style={{ marginTop: 14 }}>
          {users.map((u, i) => (
            <Row
              key={u.id}
              icon={User}
              title={u.email}
              subtitle={`${u.plan ?? 'No plan'} · ${u.mailbox_count} mailbox${u.mailbox_count === 1 ? '' : 'es'}${u.role === 'super_admin' ? ' · admin' : ''}`}
              value={u.is_suspended ? 'Suspended' : u.status}
              accent={u.is_suspended ? wp.danger : u.role === 'super_admin' ? wp.accent2 : wp.success}
              last={i === users.length - 1}
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
  search: {
    borderWidth: 1,
    borderColor: wp.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: wp.text,
    fontFamily: fonts.sans,
    fontSize: 14,
    backgroundColor: hexA(wp.surface2, 1),
  },
});
