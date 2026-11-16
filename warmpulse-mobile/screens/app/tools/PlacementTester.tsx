import { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Target, Inbox, Ban, Tag, CheckCircle, XCircle, Loader } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { useMailboxes } from '../../../lib/data';
import { usePlacementTest } from '../../../lib/mutations';
import { useToolNav } from '../tools-nav';
import { useT } from '../../../lib/i18n';

type PlacementResult = {
  inbox_count?: number;
  promotions_count?: number;
  spam_count?: number;
  total_count?: number;
  inbox_pct?: number;
  promotions_pct?: number;
  spam_pct?: number;
  test_id?: string;
  status?: 'pending' | 'completed' | 'failed';
};

export function PlacementTester() {
  const t = useT();
  const { close } = useToolNav();
  const mailboxes = useMailboxes().data ?? [];
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    mailboxes.length > 0 ? mailboxes[0].id : null
  );
  const [results, setResults] = useState<PlacementResult | null>(null);

  const mutation = usePlacementTest();

  const selectedMailbox = mailboxes.find((m) => m.id === selectedMailboxId);

  const runTest = () => {
    if (!selectedMailboxId) {
      Alert.alert('No mailbox', 'Add a mailbox first to run a placement test.');
      return;
    }
    setResults(null);
    mutation.mutate(selectedMailboxId, {
      onSuccess: (r) => {
        setResults(r as PlacementResult);
      },
      onError: (err) => {
        const msg = err?.message ?? 'Could not start the placement test.';
        Alert.alert('Failed', msg);
      },
    });
  };

  const formatPct = (v?: number) => (v != null ? `${v}%` : '—');

  return (
    <View style={{ flex: 1, backgroundColor: wp.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={20} color={wp.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{t('tools.placement')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Mailbox selector */}
        {mailboxes.length > 0 && (
          <Animated.View entering={FadeInUp.duration(450)}>
            <Text style={styles.sectionLabel}>Test mailbox</Text>
            <Glass style={{ marginBottom: 20 }}>
              {mailboxes.map((m, idx) => (
                <Pressable
                  key={m.id}
                  onPress={() => setSelectedMailboxId(m.id)}
                  style={({ pressed }) => [
                    styles.mailboxOption,
                    pressed && { opacity: 0.7 },
                    idx < mailboxes.length - 1 && styles.mailboxOptionBorder,
                    selectedMailboxId === m.id && styles.selectedOption,
                  ]}
                >
                  <View style={[styles.radio, selectedMailboxId === m.id && styles.radioSelected]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mailboxEmail}>{m.email_address}</Text>
                    <Text style={styles.mailboxProvider}>{m.provider}</Text>
                  </View>
                </Pressable>
              ))}
            </Glass>
          </Animated.View>
        )}

        {/* Run button */}
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <Pressable
            onPress={runTest}
            disabled={mutation.isPending || !selectedMailboxId}
            style={({ pressed }) => [
              styles.runBtn,
              (mutation.isPending || !selectedMailboxId) && styles.runBtnDisabled,
              pressed && !mutation.isPending && styles.runBtnPressed,
            ]}
          >
            {mutation.isPending ? (
              <Loader size={18} color={wp.text} strokeWidth={2} />
            ) : (
              <Target size={18} color={wp.text} strokeWidth={2} />
            )}
            <Text style={styles.runBtnText}>{mutation.isPending ? 'Running…' : 'Run placement test'}</Text>
          </Pressable>
        </Animated.View>

        {/* Results */}
        {results && (
          <Animated.View entering={FadeInUp.duration(450).delay(160)}>
            <Glass style={{ marginTop: 24 }} accent={wp.accent}>
              <Text style={styles.resultTitle}>Placement results</Text>
              <Text style={styles.resultSub}>
                {results.total_count ?? 0} seeds sent · Test ID: {results.test_id ?? 'unknown'}
              </Text>

              <View style={styles.statRow}>
                <View style={[styles.statChip, { backgroundColor: hexA(wp.success, 0.14) }]}>
                  <Inbox size={16} color={wp.success} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statLabel}>Inbox</Text>
                  <Text style={styles.statValue}>{results.inbox_count ?? 0}</Text>
                </View>
                <Text style={styles.statPct}>{formatPct(results.inbox_pct)}</Text>
              </View>

              <View style={styles.statRow}>
                <View style={[styles.statChip, { backgroundColor: hexA(wp.warning, 0.14) }]}>
                  <Tag size={16} color={wp.warning} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statLabel}>Promotions</Text>
                  <Text style={styles.statValue}>{results.promotions_count ?? 0}</Text>
                </View>
                <Text style={styles.statPct}>{formatPct(results.promotions_pct)}</Text>
              </View>

              <View style={styles.statRow}>
                <View style={[styles.statChip, { backgroundColor: hexA(wp.danger, 0.14) }]}>
                  <Ban size={16} color={wp.danger} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statLabel}>Spam</Text>
                  <Text style={styles.statValue}>{results.spam_count ?? 0}</Text>
                </View>
                <Text style={styles.statPct}>{formatPct(results.spam_pct)}</Text>
              </View>
            </Glass>
          </Animated.View>
        )}

        {/* Empty state */}
        {mailboxes.length === 0 && (
          <Animated.View entering={FadeInUp.duration(450)}>
            <Glass style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Target size={32} color={wp.textDim} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No mailboxes</Text>
              <Text style={styles.emptySub}>Add a mailbox from the web dashboard to test placement.</Text>
            </Glass>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function hexA(hex: string, a: number) {
  const v = Math.round(a * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, borderBottomWidth: 1, borderBottomColor: wp.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { flex: 1, textAlign: 'center', color: wp.text, fontSize: 17, fontFamily: fonts.sansSemibold },
  sectionLabel: { color: wp.textDim, fontSize: 12, fontFamily: fonts.monoBold, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  mailboxOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  mailboxOptionBorder: { borderBottomWidth: 1, borderBottomColor: wp.border },
  selectedOption: { backgroundColor: hexA(wp.accent, 0.08) },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: wp.border },
  radioSelected: { borderColor: wp.accent, backgroundColor: wp.accent },
  mailboxEmail: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  mailboxProvider: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 2 },
  runBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: wp.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16 },
  runBtnDisabled: { opacity: 0.5 },
  runBtnPressed: { opacity: 0.8 },
  runBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansBold },
  resultTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold, marginBottom: 4 },
  resultSub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginBottom: 16 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: wp.border },
  statChip: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statLabel: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { color: wp.text, fontSize: 18, fontFamily: fonts.monoBold },
  statPct: { color: wp.text, fontSize: 16, fontFamily: fonts.monoBold },
  emptyTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold, marginTop: 16 },
  emptySub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginTop: 6, textAlign: 'center' },
});
