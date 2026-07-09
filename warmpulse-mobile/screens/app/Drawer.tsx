import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Platform, StatusBar as RNStatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Sparkles, LogOut } from 'lucide-react-native';
import { wp, fonts } from '../../theme/tokens';
import { hexA } from '../../components/Glass';
import { type SectionDef, type SectionKey } from './sections-config';
import { useT } from '../../lib/i18n';

const TOP_INSET = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;
const PANEL_W = Math.min(300, Dimensions.get('window').width * 0.8);

/** Slide-in glass nav drawer — backdrop tap or item select closes it. */
export function Drawer({ open, sections, active, onSelect, onClose, onLogout }: {
  open: boolean; sections: SectionDef[]; active: SectionKey; onSelect: (k: SectionKey) => void; onClose: () => void; onLogout: () => void;
}) {
  const t = useT();
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(open ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [open, p]);

  const backdrop = useAnimatedStyle(() => ({ opacity: p.value * 0.6, pointerEvents: open ? 'auto' : 'none' }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateX: -PANEL_W * (1 - p.value) }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.panel, { width: PANEL_W, paddingTop: TOP_INSET + 16 }, panel]}>
        <View style={styles.tint} />

        <View style={styles.brand}>
          <LinearGradient colors={[wp.accent, wp.accent2]} style={styles.logo}>
            <Sparkles size={15} color="#fff" strokeWidth={2.2} />
          </LinearGradient>
          <Text style={styles.brandName}>WarmPulse</Text>
        </View>

        <View style={styles.nav}>
          {sections.map((s) => {
            const on = s.key === active;
            return (
              <Pressable key={s.key} onPress={() => onSelect(s.key)} style={[styles.item, on && { backgroundColor: hexA(wp.accent, 0.14), borderColor: hexA(wp.accent, 0.3) }]}>
                <s.Icon size={17} color={on ? wp.accent : wp.textDim} strokeWidth={2} />
                <Text style={[styles.itemLabel, { color: on ? wp.text : wp.textDim }]}>{s.labelKey ? t(s.labelKey) : s.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={onLogout} style={styles.logout}>
          <LogOut size={16} color={wp.danger} strokeWidth={2} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000' },
  panel: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden', borderRightWidth: 1, borderRightColor: hexA(wp.accent, 0.18), paddingHorizontal: 14, paddingBottom: 24 },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,10,0.97)' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 8, marginBottom: 22 },
  logo: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: wp.text, fontSize: 16, fontFamily: fonts.sansSemibold },
  nav: { flex: 1, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  itemLabel: { fontSize: 14.5, fontFamily: fonts.sansSemibold },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: hexA(wp.danger, 0.25), backgroundColor: hexA(wp.danger, 0.08) },
  logoutText: { color: wp.danger, fontSize: 14, fontFamily: fonts.sansSemibold },
});
