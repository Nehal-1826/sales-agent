import { StyleSheet, View, type ViewStyle, type StyleProp } from 'react-native';
import { wp } from '../theme/tokens';

/**
 * Glassmorphic card — the app-wide surface.
 *
 * NOTE: this used to render an expo-blur `BlurView` per card. Multiple BlurViews
 * under the New Architecture (Fabric) on Android crash natively ("keeps
 * stopping"), and every app panel stacks several of these cards. We now render a
 * solid translucent surface instead — visually the same dark glass, zero native
 * blur. `intensity` is accepted for call-site compatibility but unused.
 */
export function Glass({ children, style, accent = wp.accent }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; accent?: string; intensity?: number }) {
  return (
    <View style={[styles.wrap, { borderColor: hexA(accent, 0.26) }, style]}>
      <View style={[styles.hairline, { backgroundColor: accent }]} />
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

/** hex + alpha → rgba-ish via 8-digit hex (RN supports #RRGGBBAA). */
export function hexA(hex: string, a: number) {
  const v = Math.round(a * 255).toString(16).padStart(2, '0');
  return `${hex}${v}`;
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,18,18,0.92)',
  },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, opacity: 0.5 },
  inner: { padding: 18 },
});
