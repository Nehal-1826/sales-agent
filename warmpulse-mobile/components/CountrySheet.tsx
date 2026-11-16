import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { hexA } from './Glass';
import { Sheet } from './Sheet';
import { COUNTRY_STANDARDS, useLocale, useT, type StandardId } from '../lib/i18n';

/**
 * Country / language picker as a styled bottom sheet — replaces the plain
 * native Alert. Picking a standard switches the app language (and is the hook
 * point for currency). Highlights the active row with a check.
 */
export function CountrySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { standardId, setStandard } = useLocale();

  const pick = (id: StandardId) => {
    setStandard(id);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('common.language')}>
      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        {COUNTRY_STANDARDS.map((s) => {
          const active = s.id === standardId;
          return (
            <Pressable
              key={s.id}
              onPress={() => pick(s.id)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: active ? hexA(wp.accent, 0.12) : pressed ? hexA(wp.text, 0.04) : 'transparent' },
              ]}
            >
              <Text style={styles.flag}>{s.flag}</Text>
              <Text style={[styles.label, { color: active ? wp.text : wp.textDim }]}>{s.label}</Text>
              {active && <Check size={18} color={wp.accent} strokeWidth={2.6} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 2,
  },
  flag: { fontSize: 20 },
  label: { flex: 1, fontSize: 15, fontFamily: fonts.sansSemibold },
});
