import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, type KeyboardTypeOptions } from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';

export function Field({ label, value, onChangeText, onBlur, placeholder, Icon, secure, keyboardType, autoCapitalize, error }: {
  label: string; value: string; onChangeText: (t: string) => void; onBlur?: () => void; placeholder?: string;
  Icon?: LucideIcon; secure?: boolean; keyboardType?: KeyboardTypeOptions; autoCapitalize?: 'none' | 'sentences' | 'words'; error?: string;
}) {
  const [focus, setFocus] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, { borderColor: error ? wp.danger : focus ? wp.accent : wp.border }]}>
        {Icon && <Icon size={16} color={focus ? wp.accent : wp.textFaint} strokeWidth={2} />}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={wp.textFaint}
          secureTextEntry={secure && !show}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
          onFocus={() => setFocus(true)}
          onBlur={() => { setFocus(false); onBlur?.(); }}
        />
        {secure && (
          <Pressable onPress={() => setShow((s) => !s)} hitSlop={8}>
            {show ? <EyeOff size={16} color={wp.textFaint} /> : <Eye size={16} color={wp.textFaint} />}
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sansSemibold, marginBottom: 7 },
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(18,18,18,0.6)' },
  input: { flex: 1, color: wp.text, fontSize: 15, fontFamily: fonts.sans, height: '100%' },
  error: { color: wp.danger, fontSize: 11, fontFamily: fonts.sans, marginTop: 5 },
});
