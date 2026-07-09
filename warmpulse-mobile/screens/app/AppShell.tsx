import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, Platform, StatusBar as RNStatusBar, BackHandler } from 'react-native';
import { Menu, Bell } from 'lucide-react-native';
import { wp, fonts } from '../../theme/tokens';
import { hexA } from '../../components/Glass';
import { useNav } from '../../nav/nav';
import { useAuth } from '../../lib/auth';
import { usePlan } from '../../lib/usePlan';
import { useT } from '../../lib/i18n';
import { useUnreadCount, useLocalNotificationBridge } from '../../lib/notifications';
import { ensureChannel, getPermissionStatus, requestPermission, registerRemotePush, unregisterRemotePush } from '../../lib/push';
import { sectionsFor, type SectionKey } from './sections-config';
import { SectionBoundary } from '../../components/SectionBoundary';
import { Drawer } from './Drawer';
import { ToolNavProvider, ToolScreens } from './tools-nav';

const TOP_INSET = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;

export function AppShell() {
  const { reset } = useNav();
  const { user, logout } = useAuth();
  const { tier, isAdmin } = usePlan();
  const t = useT();
  const unread = useUnreadCount();
  useLocalNotificationBridge(); // surface new inbox items as OS notifications
  const [section, setSection] = useState<SectionKey | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Real signed-in identity for the header avatar (was a hardcoded 'MO').
  const avatar = (user?.email ?? 'U').slice(0, 2).toUpperCase();

  // Admins get the admin nav set; clients get their tier's sections.
  const sections = sectionsFor(tier, isAdmin);
  const meta = sections.find((s) => s.key === section) ?? sections[0]!;
  const ActiveSection = meta.Component;

  // First entry into the app → set up the notification channel and ask for the
  // OS notification permission once. If already granted, (re)register the push
  // token. All best-effort — never blocks the UI.
  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureChannel();
      let status = await getPermissionStatus();
      if (status === 'undetermined') status = await requestPermission();
      if (alive && status === 'granted') void registerRemotePush();
    })();
    return () => { alive = false; };
  }, []);

  // Hardware back: close drawer if open; otherwise let the global handler run.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerOpen) { setDrawerOpen(false); return true; }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen]);

  return (
    <ToolNavProvider>
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, paddingTop: TOP_INSET }}>
          <View style={styles.header}>
            <Pressable onPress={() => setDrawerOpen(true)} hitSlop={10} style={styles.menuBtn}>
              <Menu size={20} color={wp.text} strokeWidth={2} />
            </Pressable>
            <Text style={styles.title}>{meta.labelKey ? t(meta.labelKey) : meta.label}</Text>
            <View style={styles.headerRight}>
              <Pressable onPress={() => setSection('notifications')} hitSlop={8} style={styles.bellBtn}>
                <Bell size={19} color={section === 'notifications' ? wp.accent : wp.text} strokeWidth={2} />
                {unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.avatar}><Text style={styles.avatarText}>{avatar}</Text></View>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <SectionBoundary resetKey={meta.key}>
              <ActiveSection />
            </SectionBoundary>
            <ToolScreens />
          </View>
        </SafeAreaView>

        <Drawer
          open={drawerOpen}
          sections={sections}
          active={meta.key}
          onSelect={(k) => { setSection(k); setDrawerOpen(false); }}
          onClose={() => setDrawerOpen(false)}
          onLogout={async () => {
            setDrawerOpen(false);
            await unregisterRemotePush(); // stop pushing to this device after logout
            await logout(); // clears the JWT pair in SecureStore — without this the
            // cold-start redirect bounces straight back into the app.
            reset('login');
          }}
        />
      </View>
    </ToolNavProvider>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, height: 54, borderBottomWidth: 1, borderBottomColor: wp.border },
  menuBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: wp.text, fontSize: 17, fontFamily: fonts.sansSemibold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bellBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: wp.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: wp.bg,
  },
  badgeText: { color: '#fff', fontSize: 8.5, fontFamily: fonts.monoBold, lineHeight: 11 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(wp.accent, 0.2), borderWidth: 1, borderColor: hexA(wp.accent, 0.4) },
  avatarText: { color: wp.accent, fontSize: 11, fontFamily: fonts.monoBold },
});
