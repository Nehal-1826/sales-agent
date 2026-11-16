import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { wp } from '../theme/tokens';

/** Mini bar chart — max-normalized bars that grow up on mount. Mobile-optimized with improved spacing and sizing. */
export function MiniBars({
  data,
  color = wp.accent,
  height = 90,
  barGap = 4,
  minHeight = 4,
  borderRadius = 3
}: {
  data: number[];
  color?: string;
  height?: number;
  barGap?: number;
  minHeight?: number;
  borderRadius?: number;
}) {
  // Coerce non-finite values to 0 so a NaN can't produce a NaN% bar height.
  const clean = (Array.isArray(data) ? data : []).map((v) => (Number.isFinite(v) ? v : 0));
  const max = Math.max(...clean, 1);
  return (
    <View style={[styles.row, { height, gap: barGap }]}>
      {clean.map((v, i) => (
        <Bar key={i} pct={v / max} color={color} index={i} minHeight={minHeight} borderRadius={borderRadius} />
      ))}
    </View>
  );
}

function Bar({ pct, color, index, minHeight, borderRadius }: { pct: number; color: string; index: number; minHeight: number; borderRadius: number }) {
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(index * 30, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [grow, index]);
  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : 0;
  const style = useAnimatedStyle(() => ({
    height: `${grow.value * safePct * 100}%`,
    opacity: grow.value,
  }));
  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.bar, { backgroundColor: color, minHeight, borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 4 },
});
