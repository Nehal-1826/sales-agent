import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Mail, Lock, ArrowRight } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { GradientText } from '../components/GradientText';
import { Field } from '../components/Field';
import { ScreenShell } from '../components/ScreenShell';
import { GoogleButton } from '../components/GoogleButton';
import { MicrosoftButton } from '../components/MicrosoftButton';
import { PromptModal } from '../components/PromptModal';
import { useNav } from '../nav/nav';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A 403 whose detail mentions TOTP means the account has 2FA on. */
function isTotpRequired(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    /totp|2fa|two[-\s]?factor/i.test(err.message)
  );
}

export function Login() {
  const { go, reset } = useNav();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errs, setErrs] = useState<{ email?: string; password?: string }>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [totpOpen, setTotpOpen] = useState(false);

  const submit = async () => {
    const e: typeof errs = {};
    if (!EMAIL_RE.test(email)) e.email = 'Enter a valid email';
    if (password.length < 8) e.password = 'At least 8 characters';
    setErrs(e);
    setServerErr(null);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      reset('app'); // real session established → app (returning user)
    } catch (err) {
      if (isTotpRequired(err)) {
        setTotpOpen(true); // account has 2FA — challenge for the code
      } else {
        setServerErr(err instanceof Error ? err.message : 'Sign in failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (code: string) => {
    setBusy(true);
    try {
      await login(email.trim(), password, code);
      setTotpOpen(false);
      reset('app');
    } catch (err) {
      setServerErr(
        err instanceof ApiError && err.status === 403
          ? 'That code didn’t work. Try again.'
          : err instanceof Error
            ? err.message
            : 'Sign in failed.',
      );
      setTotpOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.duration(500)}>
            <Text style={styles.eyebrow}>WELCOME BACK</Text>
            <Text style={styles.title}>Sign in to </Text>
            <GradientText style={styles.title}>WarmPulse.</GradientText>
            <Text style={styles.sub}>Pick up where your reputation left off.</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(500).delay(120)} style={{ marginTop: 28 }}>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@company.com" Icon={Mail} keyboardType="email-address" error={errs.email} />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" Icon={Lock} secure error={errs.password} />

            <Pressable hitSlop={6} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>

            {serverErr && <Text style={styles.serverErr}>{serverErr}</Text>}

            <Pressable onPress={submit} disabled={busy} style={({ pressed }) => ({ opacity: pressed || busy ? 0.85 : 1 })}>
              <LinearGradient colors={[wp.accent, wp.accentHover]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.cta}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.ctaText}>Sign in</Text>
                    <ArrowRight size={16} color="#fff" strokeWidth={2.2} />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <GoogleButton onError={setServerErr} onAuthed={() => reset('app')} />

            <MicrosoftButton onError={setServerErr} onAuthed={() => reset('app')} />

            <View style={styles.footer}>
              <Text style={styles.footerText}>New here? </Text>
              <Pressable onPress={() => go('signup')} hitSlop={6}>
                <Text style={styles.footerLink}>Create an account</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PromptModal
        visible={totpOpen}
        title="Two-factor auth"
        message="Enter the 6-digit code from your authenticator app."
        placeholder="123456"
        keyboardType="number-pad"
        submitLabel="Verify"
        busy={busy}
        onSubmit={submitTotp}
        onClose={() => setTotpOpen(false)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 2, fontFamily: fonts.monoBold },
  title: { color: wp.text, fontSize: 34, lineHeight: 38, fontFamily: fonts.sansBold, letterSpacing: -1.2, marginTop: 6 },
  sub: { color: wp.textDim, fontSize: 14, fontFamily: fonts.sans, marginTop: 12, lineHeight: 20 },
  forgot: { color: wp.accent, fontSize: 12, fontFamily: fonts.sansSemibold },
  serverErr: { color: wp.danger, fontSize: 13, fontFamily: fonts.sans, marginBottom: 10 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999, marginTop: 8, shadowColor: wp.accent, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  ctaText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemibold },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans },
  footerLink: { color: wp.accent, fontSize: 13, fontFamily: fonts.sansSemibold },
});
