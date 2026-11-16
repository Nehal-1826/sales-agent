import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { wp, fonts } from '../../../../theme/tokens';
import { Glass, hexA } from '../../../../components/Glass';
import { Row } from '../../../../components/Row';
import { Async } from '../../../../components/Async';
import { PromptModal } from '../../../../components/PromptModal';
import { User } from 'lucide-react-native';
import { useAdminUsers, useAllPlans, type AdminUser } from '../../../../lib/adminData';
import {
  useSuspendUser,
  useUnsuspendUser,
  useSetUserPlan,
  useDeleteUser,
  useSabotageUser,
  useUnsabotageUser,
  useImpersonateUser,
} from '../../../../lib/adminMutations';

export function AdminUsers() {
  const [search, setSearch] = useState('');
  const q = useAdminUsers(search);
  const users = q.data ?? [];

  // plan-picker prompt
  const [planTarget, setPlanTarget] = useState<AdminUser | null>(null);
  const plansQ = useAllPlans();
  const plans = plansQ.data ?? [];

  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();
  const setPlan = useSetUserPlan();
  const deleteUser = useDeleteUser();
  const sabotage = useSabotageUser();
  const unsabotage = useUnsabotageUser();
  const impersonate = useImpersonateUser();

  const ok = (msg: string) => Alert.alert('Done', msg);
  const fail = () => Alert.alert('Failed', 'That action did not complete. Try again.');

  function manage(u: AdminUser) {
    Alert.alert(u.email, `${u.plan ?? 'No plan'} · ${u.role}`, [
      { text: u.is_suspended ? 'Unsuspend' : 'Suspend', onPress: () => {
        const m = u.is_suspended ? unsuspend : suspend;
        m.mutate(u.id, { onSuccess: () => ok(u.is_suspended ? 'User unsuspended.' : 'User suspended.'), onError: fail });
      }},
      { text: 'Set plan', onPress: () => setPlanTarget(u) },
      { text: 'Copy impersonate token', onPress: () => {
        impersonate.mutate(u.id, {
          onSuccess: (r) => {
            Alert.alert('Token minted', `A 30-min impersonation token for ${r.email} was minted, but mobile session-swap isn't supported yet. Use the web admin to impersonate.`);
          },
          onError: () => Alert.alert('Cannot impersonate', 'This user may be a super_admin or the request failed.'),
        });
      }},
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Alert.alert('Delete user', `Permanently delete ${u.email}? This cascades mailboxes + warmup logs.`, [
          { text: 'Delete', style: 'destructive', onPress: () =>
            deleteUser.mutate(u.id, { onSuccess: () => ok('User deleted.'), onError: fail }) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }},
    ]);
  }

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
              onPress={() => manage(u)}
              last={i === users.length - 1}
            />
          ))}
        </Glass>
      </Async>

      <PromptModal
        visible={!!planTarget}
        title={`Set plan for ${planTarget?.email ?? ''}`}
        message={plans.length ? 'Paste a plan ID:' : 'Loading plans — paste a plan ID:'}
        placeholder={plans[0]?.id ?? 'plan UUID'}
        initialValue={''}
        submitLabel="Set plan"
        busy={setPlan.isPending}
        onSubmit={(val) => {
          if (!planTarget) return;
          setPlan.mutate(
            { userId: planTarget.id, planId: val.trim() },
            {
              onSuccess: () => { ok('Plan updated.'); setPlanTarget(null); },
              onError: () => Alert.alert('Failed', 'Check the plan ID is valid.'),
            },
          );
        }}
        onClose={() => setPlanTarget(null)}
      />
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
