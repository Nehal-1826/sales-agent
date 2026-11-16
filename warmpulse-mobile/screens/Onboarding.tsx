import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, SafeAreaView, Platform, StatusBar as RNStatusBar, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { useNav } from '../nav/nav';
import { useAuth } from '../lib/auth';
import { usePlans } from '../lib/data';
import { useQuickUpgrade } from '../lib/mutations';
import { PlanStep, VolumeStep, ProviderStep, ConnectStep, type OnboardingState } from './onboarding/steps';
import { DnsStep, PaymentStep, StartStep } from './onboarding/steps2';

const TOP_INSET = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;
const TOTAL = 7;
const CONNECT_STEP = 3;

const normalizePlan = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');

export function Onboarding() {
  const { reset } = useNav();
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const plans = usePlans();
  const selectPlan = useQuickUpgrade();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [st, setSt] = useState<OnboardingState>({ plan: 'starter', volume: 20, provider: 'gmail', email: '', appPassword: '', card: '', exp: '', cvc: '', connected: false, smtpFallback: false });
  const set = (patch: Partial<OnboardingState>) => setSt((p) => ({ ...p, ...patch }));

  // Auto-advance to next step after mailbox is connected
  useEffect(() => {
    if (step === CONNECT_STEP && st.mailboxId) {
      setStep((s) => s + 1);
    }
  }, [st.mailboxId, step]);

  // Continue is blocked on the Connect step until a real mailbox exists.
  const blocked = (step === CONNECT_STEP && !st.mailboxId) || finishing;

  // Step validation with alerts
  const validateStep = (currentStep: number): boolean => {
    switch (currentStep) {
      case 0: // Plan
        if (!st.plan) {
          Alert.alert('Plan Required', 'Please select a plan to continue.');
          return false;
        }
        return true;
      case 1: // Volume
        if (!st.volume || st.volume < 1) {
          Alert.alert('Volume Required', 'Please select a daily send target to continue.');
          return false;
        }
        return true;
      case 2: // Provider
        if (!st.provider) {
          Alert.alert('Provider Required', 'Please select a mailbox provider to continue.');
          return false;
        }
        return true;
      case 3: // Connect
        if (!st.mailboxId) {
          Alert.alert('Mailbox Required', 'Please connect your mailbox to continue.');
          return false;
        }
        return true;
      case 4: // DNS
        // DNS step doesn't require validation - it's informational
        return true;
      case 5: // Payment
        // Payment is optional for Starter plan
        return true;
      case 6: // Start
        return true;
      default:
        return true;
    }
  };

  const next = () => {
    if (blocked) return;
    if (!validateStep(step)) return;
    if (step < TOTAL - 1) setStep((s) => s + 1);
    else finish();
  };

  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const planId = plans.data?.find((p) => normalizePlan(p.name) === normalizePlan(st.plan))?.id;
      if (planId) await selectPlan.mutateAsync(planId);
      await refreshUser();
    } catch {
      // never trap the user in onboarding — they're already connected
    }
    qc.invalidateQueries({ queryKey: ['mailboxes'] });
    qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    reset('app');
  };

  const back = () => (step > 0 ? setStep((s) => s - 1) : reset('login'));

  return (
    <SafeAreaView style={{ flex: 1, paddingTop: TOP_INSET }}>
      {/* Progress header */}
      <View style={styles.head}>
        <View style={styles.brand}>
          <LinearGradient colors={[wp.accent, wp.accent2]} style={styles.logo}><Sparkles size={13} color="#fff" strokeWidth={2.2} /></LinearGradient>
          <Text style={styles.brandName}>Get set up</Text>
          <Text style={styles.stepCount}>{step + 1} / {TOTAL}</Text>
        </View>
        <View style={styles.track}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View key={i} style={[styles.seg, { backgroundColor: i <= step ? wp.accent : wp.border }]} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View key={step} entering={FadeIn.duration(280)}>
          {step === 0 && <PlanStep value={st.plan} set={(v) => set({ plan: v })} />}
          {step === 1 && <VolumeStep value={st.volume} set={(v) => set({ volume: v })} />}
          {step === 2 && <ProviderStep value={st.provider} set={(v) => set({ provider: v, connected: false, smtpFallback: false })} />}
          {step === 3 && <ConnectStep st={st} set={set} provider={st.provider} />}
          {step === 4 && <DnsStep mailboxId={st.mailboxId} />}
          {step === 5 && <PaymentStep st={st} set={set} />}
          {step === 6 && <StartStep st={st} />}
        </Animated.View>
      </ScrollView>

      {/* Footer nav */}
      <View style={styles.footer}>
        <Pressable onPress={back} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <ArrowLeft size={16} color={wp.textDim} strokeWidth={2} />
          <Text style={styles.backText}>{step === 0 ? 'Exit' : 'Back'}</Text>
        </Pressable>
        <Pressable onPress={next} disabled={blocked} style={({ pressed }) => ({ flex: 1, opacity: blocked ? 0.5 : pressed ? 0.85 : 1 })}>
          <LinearGradient colors={[wp.accent, wp.accentHover]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.nextBtn}>
            {finishing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.nextText}>
                  {step === CONNECT_STEP && !st.mailboxId ? 'Connect to continue' : step === TOTAL - 1 ? 'Start warming' : 'Continue'}
                </Text>
                <ArrowRight size={16} color="#fff" strokeWidth={2.2} />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  logo: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: wp.text, fontSize: 15, fontFamily: fonts.sansSemibold, flex: 1 },
  stepCount: { color: wp.textFaint, fontSize: 12, fontFamily: fonts.mono },
  track: { flexDirection: 'row', gap: 5 },
  seg: { flex: 1, height: 4, borderRadius: 2 },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 28 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 12, paddingBottom: Platform.OS === 'android' ? 18 : 8, borderTopWidth: 1, borderTopColor: wp.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 50, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, borderColor: wp.border },
  backText: { color: wp.textDim, fontSize: 14, fontFamily: fonts.sansSemibold },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 999 },
  nextText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemibold },
});
