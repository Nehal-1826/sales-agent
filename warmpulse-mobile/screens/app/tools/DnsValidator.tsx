import { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, ShieldCheck, CheckCircle, XCircle, Loader, Globe } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { useMailboxes } from '../../../lib/data';
import { useMailboxDnsCheck } from '../../../lib/mutations';
import { useToolNav } from '../tools-nav';
import { useT } from '../../../lib/i18n';

type DnsResult = {
  spf_valid?: boolean;
  dkim_valid?: boolean;
  dmarc_valid?: boolean;
  spf_record?: string;
  dkim_record?: string;
  dmarc_record?: string;
  errors?: string[];
};

export function DnsValidator() {
  const t = useT();
  const { close } = useToolNav();
  const mailboxes = useMailboxes().data ?? [];
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(
    mailboxes.length > 0 ? mailboxes[0].id : null
  );
  const [results, setResults] = useState<DnsResult | null>(null);

  const mutation = useMailboxDnsCheck();

  const selectedMailbox = mailboxes.find((m) => m.id === selectedMailboxId);

  const checkDns = () => {
    if (!selectedMailboxId) {
      Alert.alert('No mailbox', 'Add a mailbox first to validate its DNS.');
      return;
    }
    setResults(null);
    mutation.mutate(selectedMailboxId, {
      onSuccess: (r) => {
        setResults(r as DnsResult);
      },
      onError: (err) => {
        const msg = err?.message ?? 'Could not check DNS right now.';
        Alert.alert('Failed', msg);
      },
    });
  };

  const fmtStatus = (v: boolean | null | undefined) => {
    if (v === true) return 'valid';
    if (v === false) return 'invalid';
    return 'unknown';
  };

  const getStatusColor = (v: boolean | null | undefined) => {
    if (v === true) return wp.success;
    if (v === false) return wp.danger;
    return wp.textDim;
  };

  return (
    <View style={{ flex: 1, backgroundColor: wp.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={20} color={wp.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{t('tools.dns')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Mailbox selector */}
        {mailboxes.length > 0 && (
          <Animated.View entering={FadeInUp.duration(450)}>
            <Text style={styles.sectionLabel}>Validate DNS for</Text>
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
                    <Text style={styles.mailboxDomain}>{m.provider}</Text>
                  </View>
                  {selectedMailboxId === m.id && (
                    <View style={[styles.statusDot, { backgroundColor: wp.accent }]} />
                  )}
                </Pressable>
              ))}
            </Glass>
          </Animated.View>
        )}

        {/* Run button */}
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <Pressable
            onPress={checkDns}
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
              <ShieldCheck size={18} color={wp.text} strokeWidth={2} />
            )}
            <Text style={styles.runBtnText}>{mutation.isPending ? 'Checking…' : 'Check DNS records'}</Text>
          </Pressable>
        </Animated.View>

        {/* Results */}
        {results && (
          <Animated.View entering={FadeInUp.duration(450).delay(160)}>
            <Glass style={{ marginTop: 24 }}>
              <Text style={styles.resultTitle}>DNS validation for {selectedMailbox?.email_address}</Text>
              <Text style={styles.resultSub}>SPF, DKIM, and DMARC records</Text>

              {/* SPF */}
              <View style={styles.recordRow}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordName}>SPF</Text>
                  <View style={styles.recordStatus}>
                    {results.spf_valid === true ? (
                      <CheckCircle size={16} color={wp.success} strokeWidth={2} />
                    ) : results.spf_valid === false ? (
                      <XCircle size={16} color={wp.danger} strokeWidth={2} />
                    ) : (
                      <Globe size={16} color={wp.textDim} strokeWidth={2} />
                    )}
                    <Text style={[styles.recordStatusText, { color: getStatusColor(results.spf_valid) }]}>
                      {fmtStatus(results.spf_valid)}
                    </Text>
                  </View>
                </View>
                {results.spf_record && <Text style={styles.recordValue}>{results.spf_record}</Text>}
              </View>

              {/* DKIM */}
              <View style={styles.recordRow}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordName}>DKIM</Text>
                  <View style={styles.recordStatus}>
                    {results.dkim_valid === true ? (
                      <CheckCircle size={16} color={wp.success} strokeWidth={2} />
                    ) : results.dkim_valid === false ? (
                      <XCircle size={16} color={wp.danger} strokeWidth={2} />
                    ) : (
                      <Globe size={16} color={wp.textDim} strokeWidth={2} />
                    )}
                    <Text style={[styles.recordStatusText, { color: getStatusColor(results.dkim_valid) }]}>
                      {fmtStatus(results.dkim_valid)}
                    </Text>
                  </View>
                </View>
                {results.dkim_record && <Text style={styles.recordValue}>{results.dkim_record}</Text>}
              </View>

              {/* DMARC */}
              <View style={styles.recordRow}>
                <View style={styles.recordHeader}>
                  <Text style={styles.recordName}>DMARC</Text>
                  <View style={styles.recordStatus}>
                    {results.dmarc_valid === true ? (
                      <CheckCircle size={16} color={wp.success} strokeWidth={2} />
                    ) : results.dmarc_valid === false ? (
                      <XCircle size={16} color={wp.danger} strokeWidth={2} />
                    ) : (
                      <Globe size={16} color={wp.textDim} strokeWidth={2} />
                    )}
                    <Text style={[styles.recordStatusText, { color: getStatusColor(results.dmarc_valid) }]}>
                      {fmtStatus(results.dmarc_valid)}
                    </Text>
                  </View>
                </View>
                {results.dmarc_record && <Text style={styles.recordValue}>{results.dmarc_record}</Text>}
              </View>

              {/* Errors */}
              {results.errors && results.errors.length > 0 && (
                <View style={styles.errorSection}>
                  <Text style={styles.errorTitle}>Errors</Text>
                  {results.errors.map((err, idx) => (
                    <Text key={idx} style={styles.errorText}>
                      • {err}
                    </Text>
                  ))}
                </View>
              )}
            </Glass>
          </Animated.View>
        )}

        {/* Empty state */}
        {mailboxes.length === 0 && (
          <Animated.View entering={FadeInUp.duration(450)}>
            <Glass style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ShieldCheck size={32} color={wp.textDim} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No mailboxes</Text>
              <Text style={styles.emptySub}>Add a mailbox from the web dashboard to validate DNS.</Text>
            </Glass>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, borderBottomWidth: 1, borderBottomColor: wp.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { flex: 1, textAlign: 'center', color: wp.text, fontSize: 17, fontFamily: fonts.sansSemibold },
  sectionLabel: { color: wp.textDim, fontSize: 12, fontFamily: fonts.monoBold, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  mailboxOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  mailboxOptionBorder: { borderBottomWidth: 1, borderBottomColor: wp.border },
  selectedOption: { backgroundColor: 'rgba(14,165,233,0.08)' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: wp.border },
  radioSelected: { borderColor: wp.accent, backgroundColor: wp.accent },
  mailboxEmail: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  mailboxDomain: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  runBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: wp.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16 },
  runBtnDisabled: { opacity: 0.5 },
  runBtnPressed: { opacity: 0.8 },
  runBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansBold },
  resultTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold, marginBottom: 4 },
  resultSub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginBottom: 16 },
  recordRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: wp.border },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  recordName: { color: wp.text, fontSize: 14, fontFamily: fonts.monoBold },
  recordStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordStatusText: { fontSize: 12, fontFamily: fonts.monoBold, textTransform: 'uppercase' },
  recordValue: { color: wp.textDim, fontSize: 11, fontFamily: fonts.mono, lineHeight: 16, marginTop: 4 },
  errorSection: { marginTop: 12, padding: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10 },
  errorTitle: { color: wp.danger, fontSize: 12, fontFamily: fonts.sansBold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  errorText: { color: wp.danger, fontSize: 12, fontFamily: fonts.sans, marginBottom: 4 },
  emptyTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold, marginTop: 16 },
  emptySub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginTop: 6, textAlign: 'center' },
});
