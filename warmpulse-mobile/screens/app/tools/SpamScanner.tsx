import { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable, TextInput } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Radar, AlertTriangle, CheckCircle, Loader, XCircle } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { useSpamScan } from '../../../lib/mutations';
import { useToolNav } from '../tools-nav';
import { useT } from '../../../lib/i18n';

type SpamScanResult = {
  score?: number;
  passed?: boolean;
  triggers?: string[];
  details?: string[];
};

export function SpamScanner() {
  const t = useT();
  const { close } = useToolNav();
  const [content, setContent] = useState('');
  const [result, setResult] = useState<SpamScanResult | null>(null);

  const mutation = useSpamScan();

  const scan = () => {
    if (!content.trim()) {
      Alert.alert('Empty content', 'Enter some email content to scan for spam triggers.');
      return;
    }
    setResult(null);
    mutation.mutate(content, {
      onSuccess: (r) => {
        setResult(r as SpamScanResult);
      },
      onError: (err) => {
        const msg = err?.message ?? 'Could not scan that content.';
        Alert.alert('Failed', msg);
      },
    });
  };

  const getScoreColor = () => {
    if (result == null) return wp.textDim;
    if (result.passed) return wp.success;
    if (result.score && result.score >= 7) return wp.danger;
    return wp.warning;
  };

  return (
    <View style={{ flex: 1, backgroundColor: wp.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={20} color={wp.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{t('tools.spam')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Content input */}
        <Animated.View entering={FadeInUp.duration(450)}>
          <Text style={styles.sectionLabel}>Email content</Text>
          <Text style={styles.inputHint}>Paste your email subject and body to scan for spam triggers.</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Your email subject + body…"
              placeholderTextColor={wp.textDim}
              multiline
              numberOfLines={6}
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              autoCapitalize="none"
            />
          </View>
        </Animated.View>

        {/* Scan button */}
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <Pressable
            onPress={scan}
            disabled={mutation.isPending}
            style={({ pressed }) => [
              styles.scanBtn,
              mutation.isPending && styles.scanBtnDisabled,
              pressed && !mutation.isPending && styles.scanBtnPressed,
            ]}
          >
            {mutation.isPending ? (
              <Loader size={18} color={wp.text} strokeWidth={2} />
            ) : (
              <Radar size={18} color={wp.text} strokeWidth={2} />
            )}
            <Text style={styles.scanBtnText}>{mutation.isPending ? 'Scanning…' : 'Scan for spam triggers'}</Text>
          </Pressable>
        </Animated.View>

        {/* Results */}
        {result && (
          <Animated.View entering={FadeInUp.duration(450).delay(160)}>
            {/* Score card */}
            <Glass style={{ marginBottom: 16 }} accent={result.passed ? wp.success : wp.danger}>
              <View style={styles.scoreRow}>
                {result.passed ? (
                  <CheckCircle size={32} color={wp.success} strokeWidth={2} />
                ) : (
                  result.score && result.score >= 7 ? (
                    <XCircle size={32} color={wp.danger} strokeWidth={2} />
                  ) : (
                    <AlertTriangle size={32} color={wp.warning} strokeWidth={2} />
                  )
                )}
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={styles.scoreLabel}>Spam score</Text>
                  <Text style={[styles.scoreValue, { color: getScoreColor() }]}>
                    {result.score != null ? `${result.score}/10` : '—'}
                  </Text>
                </View>
                <View style={[styles.passBadge, { backgroundColor: result.passed ? hexA(wp.success, 0.2) : hexA(wp.danger, 0.2) }]}>
                  <Text style={[styles.passText, { color: result.passed ? wp.success : wp.danger }]}>
                    {result.passed ? 'Passed' : 'Needs work'}
                  </Text>
                </View>
              </View>
            </Glass>

            {/* Triggers */}
            {result.triggers && result.triggers.length > 0 && (
              <Glass style={{ marginBottom: 16 }} accent={wp.danger}>
                <Text style={styles.resultTitle}>Triggers found</Text>
                <Text style={styles.resultSub}>These phrases or patterns can trigger spam filters.</Text>
                {result.triggers.map((trigger, idx) => (
                  <View key={idx} style={styles.triggerItem}>
                    <XCircle size={14} color={wp.danger} strokeWidth={2} />
                    <Text style={styles.triggerText}>{trigger}</Text>
                  </View>
                ))}
              </Glass>
            )}

            {/* Details */}
            {result.details && result.details.length > 0 && (
              <Glass accent={wp.accent2}>
                <Text style={styles.resultTitle}>Analysis</Text>
                {result.details.map((detail, idx) => (
                  <Text key={idx} style={styles.detailText}>
                    {detail}
                  </Text>
                ))}
              </Glass>
            )}

            {/* Passed message */}
            {result.passed && (!result.triggers || result.triggers.length === 0) && (
              <Glass accent={wp.success}>
                <View style={styles.passedContent}>
                  <CheckCircle size={24} color={wp.success} strokeWidth={2} />
                  <Text style={styles.passedTitle}>Looks good!</Text>
                  <Text style={styles.passedSub}>
                    Your content doesn't contain common spam triggers. Keep in mind that spam filters also consider sender reputation, authentication, and engagement patterns.
                  </Text>
                </View>
              </Glass>
            )}
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
  inputHint: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginBottom: 12 },
  inputWrap: { borderWidth: 1, borderColor: wp.border, borderRadius: 14, backgroundColor: 'rgba(18,18,18,0.8)', marginBottom: 20 },
  input: { color: wp.text, fontSize: 14, fontFamily: fonts.sans, padding: 14, minHeight: 120 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: wp.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16 },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnPressed: { opacity: 0.8 },
  scanBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansBold },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreLabel: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreValue: { fontSize: 28, fontFamily: fonts.monoBold, marginTop: 4 },
  passBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  passText: { fontSize: 12, fontFamily: fonts.monoBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultTitle: { color: wp.text, fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 4 },
  resultSub: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginBottom: 12 },
  triggerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: wp.border },
  triggerText: { flex: 1, color: wp.text, fontSize: 13, fontFamily: fonts.sans },
  detailText: { color: wp.text, fontSize: 13, fontFamily: fonts.sans, lineHeight: 20, marginBottom: 6 },
  passedContent: { alignItems: 'center', paddingVertical: 16 },
  passedTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold, marginTop: 12 },
  passedSub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
