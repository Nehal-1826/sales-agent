import { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, Alert, Pressable, Linking } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { User, KeyRound, Globe, Bell, ChevronRight, Lock } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { Glass, hexA } from '../../../components/Glass';
import { Row } from '../../../components/Row';
import { PromptModal } from '../../../components/PromptModal';
import { CountrySheet } from '../../../components/CountrySheet';
import { getPermissionStatus, requestPermission, registerRemotePush, type PermStatus } from '../../../lib/push';
import { useAuth } from '../../../lib/auth';
import { usePlan } from '../../../lib/usePlan';
import { useWorkspace } from '../../../lib/data';
import { useLocale, COUNTRY_STANDARDS, useT } from '../../../lib/i18n';
import {
  useUpdateProfile,
  useUpdateNotifications,
  useEnroll2FA,
  useVerify2FA,
  useDisable2FA,
  type TotpEnrollment,
} from '../../../lib/mutations';

export function Settings() {
  const t = useT();
  const { user, refreshUser } = useAuth();
  const { planName, tier } = usePlan();
  const workspace = useWorkspace();
  const { standardId } = useLocale();
  const activeStandard = COUNTRY_STANDARDS.find((s) => s.id === standardId) ?? COUNTRY_STANDARDS[0];
  const [countryOpen, setCountryOpen] = useState(false);

  // notification permission (OS-level)
  const [perm, setPerm] = useState<PermStatus>('undetermined');
  useEffect(() => {
    let alive = true;
    getPermissionStatus().then((s) => alive && setPerm(s));
    return () => { alive = false; };
  }, []);

  const onPermPress = async () => {
    if (perm === 'unsupported') return;
    if (perm === 'granted' || perm === 'denied') {
      // Already decided — send the user to system settings to change it.
      Linking.openSettings().catch(() => {});
      return;
    }
    const next = await requestPermission();
    setPerm(next);
    if (next === 'granted') void registerRemotePush();
  };

  const permSubtitle =
    perm === 'granted' ? t('set.pushGranted')
    : perm === 'denied' ? t('set.pushDenied')
    : perm === 'unsupported' ? t('set.pushUnsupported')
    : t('set.pushUndetermined');

  const email = user?.email ?? '—';
  const workspaceName = workspace.data?.name ?? '—';
  const avatarInitials = (user?.email ?? 'U').slice(0, 2).toUpperCase();
  const twoFAEnabled = user?.totp_enabled ?? false;
  const emailVerified = user?.email_verified ?? false;

  // notification toggles (persist forward via PATCH; defaults shown until changed)
  const [warmthAlerts, setWarmthAlerts] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [productUpdates, setProductUpdates] = useState(false);

  const updateProfile = useUpdateProfile();
  const updateNotifs = useUpdateNotifications();
  const enroll2fa = useEnroll2FA();
  const verify2fa = useVerify2FA();
  const disable2fa = useDisable2FA();

  // modal state
  const [profileOpen, setProfileOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);

  /* ------------------------------- profile ------------------------------- */
  const submitProfile = (name: string) => {
    setProfileOpen(false);
    updateProfile.mutate(name, {
      onSuccess: () => {
        workspace.refetch();
        Alert.alert('Saved', 'Your profile was updated.');
      },
      onError: () => Alert.alert('Failed', 'Could not save your profile.'),
    });
  };

  /* --------------------------- notifications ----------------------------- */
  const pushNotifs = (next: { warmth: boolean; weekly: boolean; product: boolean }, revert: () => void) => {
    updateNotifs.mutate(
      {
        email_digest_enabled: next.weekly,
        alerts: { warmth_drop: next.warmth, bounce_spike: next.product },
      },
      { onError: () => { revert(); Alert.alert('Not saved', 'Could not update notifications.'); } },
    );
  };

  /* -------------------------------- 2FA ---------------------------------- */
  const onToggle2FA = (value: boolean) => {
    if (value) {
      // enable: enroll → show secret + recovery → enter code → verify
      enroll2fa.mutate(undefined, {
        onSuccess: (data) => {
          setEnrollment(data);
          Alert.alert(
            'Set up 2FA',
            `Add this secret to your authenticator:\n\n${data.secret}\n\n` +
              (data.recovery_codes?.length
                ? `Recovery codes (save these):\n${data.recovery_codes.join('  ')}`
                : ''),
            [{ text: 'Enter code', onPress: () => setCodeOpen(true) }],
          );
        },
        onError: () => Alert.alert('Failed', 'Could not start 2FA setup.'),
      });
    } else {
      // disable: confirm password
      setPwdOpen(true);
    }
  };

  const submitCode = (code: string) => {
    verify2fa.mutate(code, {
      onSuccess: async () => {
        setCodeOpen(false);
        await refreshUser();
        Alert.alert('2FA enabled', 'Two-factor authentication is now on.');
      },
      onError: () => Alert.alert('Wrong code', 'That code didn’t verify. Try again.'),
    });
  };

  const submitPassword = (password: string) => {
    disable2fa.mutate(password, {
      onSuccess: async () => {
        setPwdOpen(false);
        await refreshUser();
        Alert.alert('2FA disabled', 'Two-factor authentication is now off.');
      },
      onError: () => Alert.alert('Failed', 'Could not disable 2FA. Check your password.'),
    });
  };

  const showRecovery = () => {
    if (enrollment?.recovery_codes?.length) {
      Alert.alert('Recovery codes', enrollment.recovery_codes.join('\n'));
    } else {
      Alert.alert('Recovery codes', 'Recovery codes are shown once when you enable two-factor auth.');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      {/* Header */}
      <Animated.View entering={FadeInUp.duration(450)}>
        <Text style={{ color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 }}>
          {t('set.eyebrow')}
        </Text>
        <Text style={{ color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5, marginBottom: 18 }}>
          {t('set.heading')}
        </Text>
      </Animated.View>

      {/* Card 1: PROFILE */}
      <Animated.View entering={FadeInUp.duration(450).delay(60)}>
        <Glass style={{ marginBottom: 16 }}>
          <Text style={styles.eyebrow}>{t('set.profile')}</Text>
          <View style={[styles.profileRow, { borderBottomWidth: 1, borderBottomColor: wp.border }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{avatarInitials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: wp.text, fontSize: 15, fontFamily: fonts.sansSemibold }}>{workspaceName}</Text>
              <Text style={{ color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 2 }}>{email}</Text>
              <Text style={{ color: wp.textFaint, fontSize: 11, fontFamily: fonts.mono, marginTop: 3 }}>
                {planName} · {t(emailVerified ? 'set.verified' : 'set.unverified')}
              </Text>
            </View>
          </View>
          <Row icon={User} title={t('set.editProfile')} onPress={() => setProfileOpen(true)} last />
        </Glass>
      </Animated.View>

      {/* Card 2: SECURITY */}
      {tier >= 2 && (
        <Animated.View entering={FadeInUp.duration(450).delay(120)}>
          <Glass style={{ marginBottom: 16 }}>
            <Text style={styles.eyebrow}>{t('set.security')}</Text>
            <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: wp.border }]}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleTitle}>{t('set.twoFactor')}</Text>
                <Text style={styles.toggleSubtitle}>{t('set.authApp', { status: t(twoFAEnabled ? 'set.authEnabled' : 'set.authDisabled') })}</Text>
              </View>
              <Switch
                value={twoFAEnabled}
                onValueChange={onToggle2FA}
                disabled={enroll2fa.isPending || disable2fa.isPending}
                trackColor={{ true: wp.accent, false: wp.border }}
                thumbColor="#fff"
              />
            </View>
            <Row icon={KeyRound} title={t('set.recoveryCodes')} subtitle={t('set.recoverySubtitle')} onPress={showRecovery} last />
          </Glass>
        </Animated.View>
      )}

      {/* Card 2 (locked): SECURITY upsell for plans below Pro Plus */}
      {tier < 2 && (
        <Animated.View entering={FadeInUp.duration(450).delay(120)}>
          <Glass style={{ marginBottom: 16 }}>
            <Text style={styles.eyebrow}>{t('set.security')}</Text>
            <View style={styles.lockedRow}>
              <View style={styles.lockedIcon}>
                <Lock size={16} color={wp.textDim} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{t('set.twoFactor')}</Text>
                <Text style={styles.toggleSubtitle}>Two-factor authentication unlocks on Pro Plus & Agency.</Text>
              </View>
            </View>
          </Glass>
        </Animated.View>
      )}

      {/* Card 3: APPEARANCE */}
      <Animated.View entering={FadeInUp.duration(450).delay(180)}>
        <Glass style={{ marginBottom: 16 }}>
          <Text style={styles.eyebrow}>{t('set.appearance')}</Text>
          <Row
            icon={Globe}
            title={t('common.language')}
            subtitle={`${activeStandard.flag}  ${activeStandard.label}`}
            onPress={() => setCountryOpen(true)}
          />
          <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={styles.toggleLeft}>
              <Text style={styles.toggleTitle}>{t('set.theme')}</Text>
              <Text style={styles.toggleSubtitle}>{t('set.themeSubtitle')}</Text>
            </View>
            <Text style={{ color: wp.accent, fontFamily: fonts.mono, fontSize: 13 }}>{t('set.dark')}</Text>
          </View>
        </Glass>
      </Animated.View>

      {/* Card 4: NOTIFICATIONS */}
      <Animated.View entering={FadeInUp.duration(450).delay(240)}>
        <Glass style={{ marginBottom: 16 }}>
          <Text style={styles.eyebrow}>{t('set.notifications')}</Text>
          <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: wp.border }]}>
            <View style={styles.toggleLeft}><Text style={styles.toggleTitle}>{t('set.warmthAlerts')}</Text></View>
            <Switch
              value={warmthAlerts}
              onValueChange={(v) => { setWarmthAlerts(v); pushNotifs({ warmth: v, weekly: weeklyReport, product: productUpdates }, () => setWarmthAlerts(!v)); }}
              trackColor={{ true: wp.accent, false: wp.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.toggleRow, { borderBottomWidth: 1, borderBottomColor: wp.border }]}>
            <View style={styles.toggleLeft}><Text style={styles.toggleTitle}>Weekly report</Text></View>
            <Switch
              value={weeklyReport}
              onValueChange={(v) => { setWeeklyReport(v); pushNotifs({ warmth: warmthAlerts, weekly: v, product: productUpdates }, () => setWeeklyReport(!v)); }}
              trackColor={{ true: wp.accent, false: wp.border }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
            <View style={styles.toggleLeft}><Text style={styles.toggleTitle}>Product updates</Text></View>
            <Switch
              value={productUpdates}
              onValueChange={(v) => { setProductUpdates(v); pushNotifs({ warmth: warmthAlerts, weekly: weeklyReport, product: v }, () => setProductUpdates(!v)); }}
              trackColor={{ true: wp.accent, false: wp.border }}
              thumbColor="#fff"
            />
          </View>
        </Glass>
      </Animated.View>

      {/* Card 5: PERMISSIONS */}
      <Animated.View entering={FadeInUp.duration(450).delay(300)}>
        <Glass style={{ marginBottom: 16 }}>
          <Text style={styles.eyebrow}>{t('set.permissions')}</Text>
          <Pressable
            onPress={onPermPress}
            disabled={perm === 'unsupported'}
            style={({ pressed }) => [styles.permRow, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={[styles.permIcon, { backgroundColor: hexA(perm === 'granted' ? wp.accent : wp.textFaint, 0.16) }]}>
              <Bell size={17} color={perm === 'granted' ? wp.accent : wp.textDim} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>{t('set.pushNotifs')}</Text>
              <Text style={styles.permSub}>{permSubtitle}</Text>
            </View>
            {perm === 'undetermined' ? (
              <View style={styles.permCta}><Text style={styles.permCtaText}>{t('set.pushEnable')}</Text></View>
            ) : perm !== 'unsupported' ? (
              <ChevronRight size={18} color={wp.textFaint} strokeWidth={2} />
            ) : null}
          </Pressable>
        </Glass>
      </Animated.View>

      {/* Modals */}
      <CountrySheet visible={countryOpen} onClose={() => setCountryOpen(false)} />
      <PromptModal
        visible={profileOpen}
        title="Edit profile"
        message="Update your display name."
        placeholder="Your name"
        initialValue={workspaceName !== '—' ? workspaceName : ''}
        submitLabel="Save"
        busy={updateProfile.isPending}
        onSubmit={submitProfile}
        onClose={() => setProfileOpen(false)}
      />
      <PromptModal
        visible={codeOpen}
        title="Verify 2FA"
        message="Enter the 6-digit code from your authenticator app."
        placeholder="123456"
        keyboardType="number-pad"
        submitLabel="Verify"
        busy={verify2fa.isPending}
        onSubmit={submitCode}
        onClose={() => setCodeOpen(false)}
      />
      <PromptModal
        visible={pwdOpen}
        title="Disable 2FA"
        message="Enter your password to turn off two-factor auth."
        placeholder="Password"
        secure
        submitLabel="Disable"
        busy={disable2fa.isPending}
        onSubmit={submitPassword}
        onClose={() => setPwdOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: wp.textFaint, fontSize: 10, letterSpacing: 1.4, fontFamily: fonts.monoBold, marginBottom: 12 },
  profileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: hexA(wp.accent, 0.2), borderWidth: 1, borderColor: wp.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: wp.accent, fontFamily: fonts.monoBold, fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  toggleLeft: { flex: 1, marginRight: 12 },
  toggleTitle: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  toggleSubtitle: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 2 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  lockedIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(wp.textDim, 0.12) },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  permIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  permTitle: { color: wp.text, fontSize: 14, fontFamily: fonts.sansSemibold },
  permSub: { color: wp.textDim, fontSize: 12, fontFamily: fonts.sans, marginTop: 2, lineHeight: 16 },
  permCta: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: wp.accent },
  permCtaText: { color: '#fff', fontSize: 12.5, fontFamily: fonts.sansSemibold },
});
