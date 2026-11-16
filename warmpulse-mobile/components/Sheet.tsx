import { type ReactNode } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { wp, fonts } from '../theme/tokens';

/**
 * Bottom sheet — a slide-up panel anchored to the bottom edge, with a grab
 * handle and an optional eyebrow title. Used for option pickers (country /
 * language) where a centered dialog would feel heavy. Tap the scrim to close.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={SlideInDown.springify().damping(20).mass(0.8)}
          exiting={SlideOutDown.duration(180)}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: 'rgba(20,20,22,0.99)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: wp.border,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 34,
    maxHeight: '82%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: wp.border, marginBottom: 14 },
  title: {
    color: wp.textFaint,
    fontSize: 10,
    letterSpacing: 1.6,
    fontFamily: fonts.monoBold,
    textTransform: 'uppercase',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
});
