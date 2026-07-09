import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';

const TOP_INSET = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;

/** Header with WarmPulse brand — shared by auth/onboarding. */
export function ScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={{ flex:1, paddingTop: TOP_INSET }}>
      <View style={styles.bar}>
        <View style={styles.brand}>
          <LinearGradient colors={[wp.accent, wp.accent2]} style={styles.logo}>
            <Sparkles size={13} color="#fff" strokeWidth={2.2} />
          </LinearGradient>
          <Text style={styles.brandName}>WarmPulse</Text>
        </View>
        <View style={{ width: 64 }} />
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logo: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
});
