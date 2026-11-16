import { Text, View, StyleSheet } from 'react-native';
import { GradientText } from './GradientText';
import { wp, fonts } from '../theme/tokens';

/** Eyebrow + two-part headline (solid + gradient) — shared section header. */
export function SectionTitle({ eyebrow, line1, accent }: { eyebrow: string; line1: string; accent: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
      <Text style={styles.title}>{line1} </Text>
      <GradientText style={styles.title}>{accent}</GradientText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 2, fontFamily: fonts.monoBold, marginBottom: 10 },
  title: { color: wp.text, fontSize: 30, lineHeight: 34, fontFamily: fonts.sansBold, letterSpacing: -1 },
});
