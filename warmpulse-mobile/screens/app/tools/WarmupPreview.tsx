import { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, Mail, Loader, MessageSquare, User, Clock } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { useWarmupPreview } from '../../../lib/mutations';
import { useToolNav } from '../tools-nav';
import { useT } from '../../../lib/i18n';

type WarmupSample = {
  subject?: string;
  body?: string;
  sender?: string;
  recipient?: string;
  timestamp?: string;
};

type WarmupPreviewResult = {
  samples?: WarmupSample[];
  thread_length?: number;
  mailbox_id?: string;
};

export function WarmupPreview() {
  const t = useT();
  const { close } = useToolNav();
  const [result, setResult] = useState<WarmupPreviewResult | null>(null);

  const mutation = useWarmupPreview();

  const generate = () => {
    setResult(null);
    mutation.mutate(undefined, {
      onSuccess: (r) => {
        setResult(r as WarmupPreviewResult);
      },
      onError: (err) => {
        const msg = err?.message ?? 'Could not generate a preview.';
        Alert.alert('Failed', msg);
      },
    });
  };

  const formatTime = (ts?: string) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: wp.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={20} color={wp.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{t('tools.preview')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Generate button */}
        <Animated.View entering={FadeInUp.duration(450)}>
          <Pressable
            onPress={generate}
            disabled={mutation.isPending}
            style={({ pressed }) => [
              styles.generateBtn,
              mutation.isPending && styles.generateBtnDisabled,
              pressed && !mutation.isPending && styles.generateBtnPressed,
            ]}
          >
            {mutation.isPending ? (
              <Loader size={18} color={wp.text} strokeWidth={2} />
            ) : (
              <Mail size={18} color={wp.text} strokeWidth={2} />
            )}
            <Text style={styles.generateBtnText}>{mutation.isPending ? 'Generating…' : 'Generate warmup thread'}</Text>
          </Pressable>
        </Animated.View>

        {/* Results */}
        {result && result.samples && result.samples.length > 0 && (
          <Animated.View entering={FadeInUp.duration(450).delay(80)}>
            <Glass style={{ marginTop: 16 }}>
              <View style={styles.threadHeader}>
                <MessageSquare size={16} color={wp.accent} strokeWidth={2} />
                <Text style={styles.threadTitle}>Warmup thread preview</Text>
              </View>
              <Text style={styles.threadSub}>
                {result.samples.length} messages · Thread length: {result.thread_length ?? 1}
              </Text>

              {result.samples.map((sample, idx) => (
                <View key={idx} style={styles.messageCard}>
                  {/* Message header */}
                  <View style={styles.messageHeader}>
                    <View style={styles.messageMeta}>
                      <View style={[styles.avatar, { backgroundColor: hexA(wp.accent, 0.2) }]}>
                        <User size={14} color={wp.accent} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.messageSender}>{sample.sender || 'Unknown'}</Text>
                        <Text style={styles.messageRecipient}>to {sample.recipient || 'Unknown'}</Text>
                      </View>
                    </View>
                    {sample.timestamp && (
                      <View style={styles.timestampWrap}>
                        <Clock size={12} color={wp.textDim} strokeWidth={2} />
                        <Text style={styles.timestamp}>{formatTime(sample.timestamp)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Message subject */}
                  {sample.subject && <Text style={styles.messageSubject}>{sample.subject}</Text>}

                  {/* Message body */}
                  {sample.body && <Text style={styles.messageBody}>{sample.body}</Text>}

                  {/* Thread connector */}
                  {idx < result.samples!.length - 1 && <View style={styles.threadConnector} />}
                </View>
              ))}
            </Glass>
          </Animated.View>
        )}

        {/* Empty state */}
        {!result && !mutation.isPending && (
          <Animated.View entering={FadeInUp.duration(450).delay(80)}>
            <Glass style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Mail size={32} color={wp.textDim} strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>No preview yet</Text>
              <Text style={styles.emptySub}>
                Generate a warmup thread to see how your emails will look. The AI creates realistic conversations based on your template settings.
              </Text>
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
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: wp.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16 },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnPressed: { opacity: 0.8 },
  generateBtnText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansBold },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  threadTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold },
  threadSub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginBottom: 16 },
  messageCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, marginBottom: 12 },
  messageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: hexA(wp.accent, 0.3) },
  messageSender: { color: wp.text, fontSize: 13, fontFamily: fonts.sansBold },
  messageRecipient: { color: wp.textDim, fontSize: 11, fontFamily: fonts.sans, marginTop: 2 },
  timestampWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timestamp: { color: wp.textDim, fontSize: 11, fontFamily: fonts.mono },
  messageSubject: { color: wp.text, fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 8 },
  messageBody: { color: wp.text, fontSize: 13, fontFamily: fonts.sans, lineHeight: 20 },
  threadConnector: { width: 2, height: 12, backgroundColor: wp.border, marginLeft: 14, marginTop: 4 },
  emptyTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansBold, marginTop: 16 },
  emptySub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginTop: 8, textAlign: 'center', lineHeight: 20 },
});
