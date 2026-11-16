import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { wp, fonts } from '../theme/tokens';
import { ModalShell } from './ModalShell';
import { hexA } from './Glass';

/**
 * Single-input modal — Android-safe replacement for Alert.prompt (iOS-only).
 * Built on the shared ModalShell so it matches every other popup in the app.
 * Controlled by `visible`; calls onSubmit(value) then the parent closes it.
 */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  initialValue = '',
  secure,
  keyboardType,
  submitLabel = 'Save',
  busy,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'number-pad';
  submitLabel?: string;
  busy?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const disabled = busy || value.trim().length === 0;

  return (
    <ModalShell visible={visible} onClose={onClose} title={title} subtitle={message}>
      <TextInput
        style={[styles.input, focused && { borderColor: wp.accent }]}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        placeholderTextColor={wp.textFaint}
        secureTextEntry={secure}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize="none"
        autoFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <View style={styles.actions}>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => onSubmit(value.trim())}
          disabled={disabled}
          style={({ pressed }) => [styles.submit, disabled && styles.submitDisabled, pressed && !disabled && styles.submitPressed]}
        >
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>{submitLabel}</Text>}
        </Pressable>
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  input: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: wp.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: wp.text,
    fontFamily: fonts.sans,
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 22 },
  cancel: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 },
  cancelPressed: { backgroundColor: hexA(wp.text, 0.06) },
  cancelText: { color: wp.textDim, fontSize: 15, fontFamily: fonts.sansSemibold },
  submit: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: wp.accent,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: wp.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  submitDisabled: { opacity: 0.5, shadowOpacity: 0 },
  submitPressed: { opacity: 0.85 },
  submitText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemibold },
});
