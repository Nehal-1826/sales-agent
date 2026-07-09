import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { wp, fonts } from '../theme/tokens';

/** Warmth ring gauge — SVG arc filled to `value`%. */
export function Gauge({ value, size = 116, color = wp.accent }: { value: number; size?: number; color?: string }) {
  // Clamp to [0,100] and coerce NaN → 0; a NaN dashoffset crashes react-native-svg.
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const stroke = 7;
  const r = (size - stroke - 4) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - v / 100);
  const cx = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={cx} cy={cx} r={r} stroke={wp.border} strokeWidth={stroke} fill="none" />
        <Circle cx={cx} cy={cx} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.value}>{Math.round(v)}</Text>
        <Text style={styles.label}>WARMTH</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value: { color: wp.text, fontSize: 26, fontFamily: fonts.monoBold, lineHeight: 28 },
  label: { color: wp.textFaint, fontSize: 8, letterSpacing: 1.4, fontFamily: fonts.mono },
});
