import { View, Text, StyleSheet } from 'react-native';
import { wp, fonts } from '../theme/tokens';
import { Glass } from './Glass';

/** Compact metric card — big mono value over a muted label, optional sub line. */
export function KpiCard({ label, value, sub, accent = wp.accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Glass style={styles.card} accent={accent} intensity={18}>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14 },
  value: { fontSize: 22, fontFamily: fonts.monoBold, lineHeight: 25 },
  label: { color: wp.text, fontSize: 12.5, fontFamily: fonts.sansSemibold, marginTop: 5 },
  sub: { color: wp.textFaint, fontSize: 10.5, fontFamily: fonts.mono, marginTop: 2 },
});
