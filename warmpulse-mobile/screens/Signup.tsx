import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { User, Mail, Lock, ArrowRight, Check } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { GradientText } from '../components/GradientText';
import { Field } from '../components/Field';
import { ScreenShell } from '../components/ScreenShell';
import { GoogleButton } from '../components/GoogleButton';
import { MicrosoftButton } from '../components/MicrosoftButton';
import { useNav } from '../nav/nav';
import { useAuth } from '../lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PERKS = ['1 mailbox free forever', '5 sends / day · DNS validation', 'No credit card required'];

export function Signup() {
  const { go, reset } = useNav();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errs, setErrs] = useState<{ name?: string; email?: string; password?: string }>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errs = {};
    if (name.trim().length < 2) e.name = 'Tell us your name';
    if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email';
    if (password.length < 8) e.password = 'At least 8 characters';
    setErrs(e);
    setServerErr(null);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      await signup(email.trim(), password);
      reset('onboarding'); // account created + session established
    } catch (err) {
      setServerErr(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.duration(500)}>
            <Text style={styles.eyebrow}>START FREE</Text>
            <Text style={styles.title}>Create your </Text>
            <GradientText style={styles.title}>account.</GradientText>
            <View style={styles.perks}>
              {PERKS.map((p) => (
                <View key={p} style={styles.perk}>
                  <View style={styles.check}><Check size={10} color={wp.success} strokeWidth={2.6} /></View>
                  <Text style={styles.perkText}>{p}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(500).delay(120)} style={{ marginTop: 22 }}>
            <Field label="Full name" value={name} onChangeText={setName} placeholder="Alex Rivera" Icon={User} autoCapitalize="words" error={errs.name} />
            <Field label="Work email" value={email} onChangeText={setEmail} placeholder="you@company.com" Icon={Mail} keyboardType="email-address" error={errs.email} />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="Min. 6 characters" Icon={Lock} secure error={errs.password} />

            {serverErr && <Text style={styles.serverErr}>{serverErr}</Text>}

            <Pressable onPress={submit} disabled={busy} style={({ pressed }) => ({ opacity: pressed || busy ? 0.85 : 1, marginTop: 4 })}>
              <LinearGradient colors={[wp.accent, wp.accentHover]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.cta}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.ctaText}>Create account</Text>
                    <ArrowRight size={16} color="#fff" strokeWidth={2.2} />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <GoogleButton onError={setServerErr} onAuthed={() => reset('onboarding')} />

            <MicrosoftButton onError={setServerErr} onAuthed={() => reset('onboarding')} />

            <Text style={styles.terms}>By continuing you agree to our Terms & Privacy Policy.</Text>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Pressable onPress={() => go('login')} hitSlop={6}>
                <Text style={styles.footerLink}>Sign in</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 2, fontFamily: fonts.monoBold },
  title: { color: wp.text, fontSize: 34, lineHeight: 38, fontFamily: fonts.sansBold, letterSpacing: -1.2, marginTop: 6 },
  perks: { marginTop: 16, gap: 8 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(61,220,151,0.18)', alignItems: 'center', justifyContent: 'center' },
  perkText: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans },
  serverErr: { color: wp.danger, fontSize: 13, fontFamily: fonts.sans, marginBottom: 10 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999, shadowColor: wp.accent, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  ctaText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemibold },
  terms: { color: wp.textFaint, fontSize: 11, fontFamily: fonts.sans, textAlign: 'center', marginTop: 14, lineHeight: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  footerText: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans },
  footerLink: { color: wp.accent, fontSize: 13, fontFamily: fonts.sansSemibold },
});
