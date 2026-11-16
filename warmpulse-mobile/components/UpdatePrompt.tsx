import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDownToLine, Sparkles } from 'lucide-react-native';
import { wp, fonts } from '../theme/tokens';
import { hexA } from './Glass';
import { ModalShell } from './ModalShell';
import { APP_VERSION_CODE } from '../lib/appVersion';
import { fetchLatestAndroid, absoluteApkUrl, type AndroidRelease } from '../lib/updateCheck';
import { getDismissedUpdate, setDismissedUpdate } from '../lib/storage';

/**
 * Self-managing "update available" popup. Mounted once at the app root; on cold
 * start it checks the hosted manifest and shows a dismissable modal only when a
 * newer build exists and the user hasn't already tapped "Later" on it.
 */
export function UpdatePrompt() {
  const [release, setRelease] = useState<AndroidRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await fetchLatestAndroid();
      if (!latest || latest.versionCode <= APP_VERSION_CODE) return;
      const dismissed = await getDismissedUpdate();
      if (latest.versionCode === dismissed) return;
      if (!cancelled) setRelease(latest);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUpdate = () => {
    if (release) Linking.openURL(absoluteApkUrl(release.apkUrl)).catch(() => {});
    setRelease(null);
  };
  const onLater = () => {
    if (release) void setDismissedUpdate(release.versionCode);
    setRelease(null);
  };

  return (
    <ModalShell
      visible={!!release}
      onClose={onLater}
      icon={Sparkles}
      title="Update available"
      subtitle={release ? `A new build is ready — version ${release.versionName}.` : ''}
    >
      <View style={styles.badge}>
        <Text style={styles.badgeText}>v{release?.versionName}</Text>
      </View>
      {release?.notes ? <Text style={styles.notes}>{release.notes}</Text> : null}

      <Pressable onPress={onUpdate} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, width: '100%' })}>
        <LinearGradient colors={[wp.accent, wp.accentHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
          <ArrowDownToLine size={16} color="#fff" strokeWidth={2.3} />
          <Text style={styles.ctaText}>Update now</Text>
        </LinearGradient>
      </Pressable>

      <Pressable onPress={onLater} hitSlop={8} style={styles.later}>
        <Text style={styles.laterText}>Later</Text>
      </Pressable>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: hexA(wp.accent, 0.12),
    borderWidth: 1,
    borderColor: hexA(wp.accent, 0.3),
  },
  badgeText: { color: wp.accent, fontSize: 11, fontFamily: fonts.monoBold, letterSpacing: 0.8 },
  notes: { color: wp.textDim, fontSize: 13.5, fontFamily: fonts.sans, textAlign: 'center', marginTop: 14, lineHeight: 19 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 999,
    marginTop: 20,
    shadowColor: wp.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaText: { color: '#fff', fontSize: 15, fontFamily: fonts.sansSemibold },
  later: { marginTop: 12, paddingVertical: 6, alignSelf: 'center' },
  laterText: { color: wp.textFaint, fontSize: 14, fontFamily: fonts.sansSemibold },
});
