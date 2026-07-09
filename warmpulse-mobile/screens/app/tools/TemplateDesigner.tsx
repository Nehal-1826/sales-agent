import { useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Alert, Pressable, TextInput } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ArrowLeft, FileText, Eye, Loader } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass } from '../../../components/Glass';
import { useToolNav } from '../tools-nav';
import { useT } from '../../../lib/i18n';
import { authFetch } from '../../../lib/api';

type Template = {
  subject: string;
  body: string;
};

export function TemplateDesigner() {
  const t = useT();
  const { close } = useToolNav();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const saveTemplate = async () => {
    if (!subject.trim()) {
      Alert.alert('Missing subject', 'Enter a subject line for your template.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Missing body', 'Enter the email body content.');
      return;
    }

    setIsSaving(true);
    try {
      await authFetch('/api/workspace/tools/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      });
      Alert.alert('Saved', 'Your warmup template has been saved.');
      close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save template.';
      Alert.alert('Failed', msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: wp.bg }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={close} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={20} color={wp.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{t('tools.template')}</Text>
        <Pressable onPress={saveTemplate} disabled={isSaving} hitSlop={10} style={styles.saveBtn}>
          {isSaving ? (
            <Loader size={18} color={wp.accent} strokeWidth={2} />
          ) : (
            <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Subject */}
        <Animated.View entering={FadeInUp.duration(450)}>
          <Text style={styles.sectionLabel}>Subject line</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Your warmup email subject…"
              placeholderTextColor={wp.textDim}
              value={subject}
              onChangeText={setSubject}
              autoCapitalize="none"
            />
          </View>
        </Animated.View>

        {/* Body */}
        <Animated.View entering={FadeInUp.duration(450).delay(80)}>
          <Text style={styles.sectionLabel}>Email body</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.textArea}
              placeholder="Your warmup email body…"
              placeholderTextColor={wp.textDim}
              multiline
              numberOfLines={8}
              value={body}
              onChangeText={setBody}
              textAlignVertical="top"
              autoCapitalize="none"
            />
          </View>
        </Animated.View>

        {/* Preview toggle */}
        <Animated.View entering={FadeInUp.duration(450).delay(160)}>
          <Pressable
            onPress={() => setShowPreview(!showPreview)}
            style={({ pressed }) => [styles.previewToggle, pressed && { opacity: 0.7 }]}
          >
            <Eye size={16} color={wp.accent} strokeWidth={2} />
            <Text style={styles.previewToggleText}>{showPreview ? 'Hide preview' : 'Show preview'}</Text>
          </Pressable>
        </Animated.View>

        {/* Live preview */}
        {showPreview && (
          <Animated.View entering={FadeInUp.duration(450).delay(240)}>
            <Glass style={{ marginTop: 16 }}>
              <Text style={styles.previewTitle}>Preview</Text>
              <View style={styles.previewCard}>
                <Text style={styles.previewSubject}>{subject || '<subject>'}</Text>
                <View style={styles.previewDivider} />
                <Text style={styles.previewBody}>{body || '<body>'}</Text>
              </View>
            </Glass>
          </Animated.View>
        )}

        {/* Save button */}
        <Animated.View entering={FadeInUp.duration(450).delay(240)}>
          <Pressable
            onPress={saveTemplate}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.saveBtnBottom,
              isSaving && styles.saveBtnBottomDisabled,
              pressed && !isSaving && styles.saveBtnBottomPressed,
            ]}
          >
            {isSaving ? (
              <Loader size={18} color={wp.text} strokeWidth={2} />
            ) : (
              <FileText size={18} color={wp.text} strokeWidth={2} />
            )}
            <Text style={styles.saveBtnBottomText}>{isSaving ? 'Saving…' : 'Save template'}</Text>
          </Pressable>
        </Animated.View>

        {/* Help text */}
        <Animated.View entering={FadeInUp.duration(450).delay(320)}>
          <Glass style={{ marginTop: 16, backgroundColor: 'rgba(14,165,233,0.06)' }}>
            <Text style={styles.helpTitle}>About warmup templates</Text>
            <Text style={styles.helpText}>
              Warmup templates are used to generate realistic email conversations in your warmup threads. Keep them natural and conversational — avoid promotional language or excessive formatting.
            </Text>
          </Glass>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 54, borderBottomWidth: 1, borderBottomColor: wp.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { flex: 1, textAlign: 'center', color: wp.text, fontSize: 17, fontFamily: fonts.sansSemibold },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  saveBtnText: { color: wp.accent, fontSize: 14, fontFamily: fonts.sansBold },
  sectionLabel: { color: wp.textDim, fontSize: 12, fontFamily: fonts.monoBold, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  inputWrap: { borderWidth: 1, borderColor: wp.border, borderRadius: 14, backgroundColor: 'rgba(18,18,18,0.8)', marginBottom: 20 },
  input: { color: wp.text, fontSize: 14, fontFamily: fonts.sans, padding: 14 },
  textArea: { color: wp.text, fontSize: 14, fontFamily: fonts.sans, padding: 14, minHeight: 160 },
  previewToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  previewToggleText: { color: wp.accent, fontSize: 13, fontFamily: fonts.sansBold },
  previewTitle: { color: wp.text, fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 12 },
  previewCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16 },
  previewSubject: { color: wp.text, fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 8 },
  previewDivider: { height: 1, backgroundColor: wp.border, marginVertical: 8 },
  previewBody: { color: wp.text, fontSize: 13, fontFamily: fonts.sans, lineHeight: 20 },
  saveBtnBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: wp.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 24, marginBottom: 16 },
  saveBtnBottomDisabled: { opacity: 0.5 },
  saveBtnBottomPressed: { opacity: 0.8 },
  saveBtnBottomText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansBold },
  helpTitle: { color: wp.text, fontSize: 14, fontFamily: fonts.sansBold, marginBottom: 8 },
  helpText: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, lineHeight: 20 },
});
