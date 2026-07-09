import { type ReactNode } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { wp, fonts } from '../theme/tokens';
import { hexA } from './Glass';

/**
 * Uniform loading / error / empty wrapper for data-backed sections. Keeps the
 * section bodies focused on the happy path. Premium glass card styling.
 */
export function Async({
  loading,
  error,
  isEmpty,
  emptyText = 'Nothing here yet.',
  onRetry,
  children,
}: {
  loading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.wrap}>
        <View style={styles.center}>
          <ActivityIndicator color={wp.accent} size="large" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </Animated.View>
    );
  }
  if (error) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.wrap}>
        <View style={styles.center}>
          <View style={styles.iconBadge}>
            <Text style={styles.errorIcon}>!</Text>
          </View>
          <Text style={styles.msg}>Couldn't load this. Check your connection.</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    );
  }
  if (isEmpty) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.wrap}>
        <View style={styles.center}>
          <View style={styles.iconBadge}>
            <Text style={styles.emptyIcon}>0</Text>
          </View>
          <Text style={styles.msg}>{emptyText}</Text>
        </View>
      </Animated.View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 240 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: hexA(wp.accent, 0.12),
    borderWidth: 1,
    borderColor: hexA(wp.accent, 0.25),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorIcon: { fontSize: 32, fontFamily: fonts.sansBold, color: '#ff9f43' },
  emptyIcon: { fontSize: 32, fontFamily: fonts.sansBold, color: wp.textDim },
  loadingText: { color: wp.textDim, fontSize: 14, fontFamily: fonts.sans, marginTop: 12, textAlign: 'center' },
  msg: { color: wp.textDim, fontSize: 15, fontFamily: fonts.sans, textAlign: 'center', lineHeight: 22 },
  retry: {
    borderWidth: 1,
    borderColor: wp.border,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: hexA(wp.accent, 0.08),
    marginTop: 8,
  },
  retryPressed: { backgroundColor: hexA(wp.accent, 0.15) },
  retryText: { color: wp.accent, fontSize: 14, fontFamily: fonts.sansSemibold },
});
