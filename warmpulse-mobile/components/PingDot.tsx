import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate, Easing } from 'react-native-reanimated';
import { wp } from '../theme/tokens';

/** Pulsing "live" dot — RN-reanimated port of the web's animate-ping ring. */
export function PingDot() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false);
  }, [v]);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(v.value, [0, 1], [1, 2.4]) }],
    opacity: interpolate(v.value, [0, 1], [0.7, 0]),
  }));
  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.ring, ring]} />
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: wp.success },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: wp.success },
});
