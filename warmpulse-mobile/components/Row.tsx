import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { hexA } from './Glass';

/** List row — leading icon chip, title + subtitle, trailing value or chevron. */
export function Row({ icon: Icon, title, subtitle, value, onPress, accent = wp.accent, last }: {
  icon?: LucideIcon; title: string; subtitle?: string; value?: string; onPress?: () => void; accent?: string; last?: boolean;
}) {
  const body = (
    <View style={[styles.row, !last && styles.border]}>
      {Icon ? (
        <View style={[styles.chip, { backgroundColor: hexA(accent, 0.14), borderColor: hexA(accent, 0.3) }]}>
          <Icon size={15} color={accent} strokeWidth={2} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {onPress ? <ChevronRight size={16} color={wp.textFaint} strokeWidth={2} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{body}</Pressable>
  ) : body;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  border: { borderBottomWidth: 1, borderBottomColor: wp.border },
  chip: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  subtitle: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 2 },
  value: { color: wp.text, fontSize: 13, fontFamily: fonts.monoBold },
});
