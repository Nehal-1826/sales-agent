import { type ReactNode } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { X, type LucideIcon } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { hexA } from './Glass';

/**
 * Shared centered-card modal shell — the visual base for every custom popup in
 * the app (update prompt, input modal, info modals). A dimmed backdrop, a
 * rounded surface card with a soft accent-tinted top edge, an optional
 * gradient icon badge, title/subtitle, and a corner close button. No BlurView
 * (it crashes stacked under Fabric) — a solid translucent surface instead.
 */
export function ModalShell({
  visible,
  onClose,
  icon: Icon,
  title,
  subtitle,
  children,
  dismissable = true,
  maxWidth = 380,
}: {
  visible: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  dismissable?: boolean;
  maxWidth?: number;
}) {
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} />
        <Animated.View entering={ZoomIn.springify().damping(18).mass(0.7)} style={[styles.card, { maxWidth }]}>
          {/* accent hairline along the top */}
          <LinearGradient
            colors={[hexA(wp.accent, 0), wp.accent, hexA(wp.accent, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topEdge}
          />
          {dismissable && (
            <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => [styles.close, pressed && styles.closePressed]}>
              <X size={16} color={wp.textFaint} strokeWidth={2.2} />
            </Pressable>
          )}
          {Icon && (
            <View style={styles.iconWrap}>
              <LinearGradient
                colors={[hexA(wp.accent, 0.28), hexA(wp.accent, 0.1)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBadge}
              >
                <Icon size={22} color={wp.accent} strokeWidth={2.2} />
              </LinearGradient>
            </View>
          )}
          {title ? <Text style={[styles.title, Icon ? { textAlign: 'center' } : null]}>{title}</Text> : null}
          {subtitle ? <Text style={[styles.subtitle, Icon ? { textAlign: 'center' } : null]}>{subtitle}</Text> : null}
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.66)', alignItems: 'center', justifyContent: 'center', padding: 26 },
  card: {
    width: '100%',
    backgroundColor: 'rgba(22,22,24,0.98)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: wp.border,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  topEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.7 },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: hexA(wp.text, 0.06),
    zIndex: 2,
  },
  closePressed: { backgroundColor: hexA(wp.text, 0.12) },
  iconWrap: { alignItems: 'center', marginBottom: 14 },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: hexA(wp.accent, 0.3),
  },
  title: { color: wp.text, fontSize: 19, fontFamily: fonts.sansBold, letterSpacing: -0.4 },
  subtitle: { color: wp.textDim, fontSize: 13.5, fontFamily: fonts.sans, marginTop: 8, lineHeight: 19.5 },
});
