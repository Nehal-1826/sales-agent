import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { BellOff, CheckCheck, Bell, Mail, Flame, CreditCard, AlertTriangle, type LucideIcon } from 'lucide-react-native';
import { wp, fonts } from '../../../theme/tokens';
import { hexA } from '../../../components/Glass';
import { useT } from '../../../lib/i18n';
import { useNotifications, useMarkRead, useMarkAllRead, type InboxItem } from '../../../lib/notifications';

/** Map a notification "kind" to an icon — falls back to a generic bell. */
function iconFor(kind: string): LucideIcon {
  if (kind.includes('warmth') || kind.includes('reputation')) return Flame;
  if (kind.includes('mailbox') || kind.includes('bounce') || kind.includes('mail')) return Mail;
  if (kind.includes('billing') || kind.includes('payment') || kind.includes('plan')) return CreditCard;
  if (kind.includes('alert') || kind.includes('spam') || kind.includes('fail')) return AlertTriangle;
  return Bell;
}

function relativeTime(t: ReturnType<typeof useT>, iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return t('notif.justNow');
  if (mins < 60) return t('notif.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notif.hoursAgo', { n: hours });
  return t('notif.daysAgo', { n: Math.floor(hours / 24) });
}

export function Notifications() {
  const t = useT();
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Animated.View entering={FadeInUp.duration(420)} style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>{t('notif.eyebrow')}</Text>
          <Text style={styles.heading}>{t('notif.title')}</Text>
        </View>
        {unread > 0 && (
          <Pressable
            onPress={() => markAll.mutate()}
            style={({ pressed }) => [styles.markAll, { opacity: pressed ? 0.7 : 1 }]}
          >
            <CheckCheck size={14} color={wp.accent} strokeWidth={2.3} />
            <Text style={styles.markAllText}>{t('notif.markAllRead')}</Text>
          </Pressable>
        )}
      </Animated.View>

      {isLoading ? (
        <ActivityIndicator color={wp.accent} style={{ marginTop: 60 }} />
      ) : items.length === 0 ? (
        <Animated.View entering={FadeInUp.duration(420).delay(80)} style={styles.empty}>
          <View style={styles.emptyIcon}>
            <BellOff size={26} color={wp.textFaint} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyTitle}>{t('notif.empty')}</Text>
          <Text style={styles.emptySub}>{t('notif.emptySub')}</Text>
        </Animated.View>
      ) : (
        items.map((item: InboxItem, i: number) => {
          const Icon = iconFor(item.kind);
          const isUnread = !item.read_at;
          return (
            <Animated.View key={item.id} entering={FadeInUp.duration(380).delay(Math.min(i * 40, 320))}>
              <Pressable
                onPress={() => isUnread && markRead.mutate(item.id)}
                style={({ pressed }) => [
                  styles.card,
                  { borderColor: isUnread ? hexA(wp.accent, 0.35) : wp.border, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={[styles.iconWrap, { backgroundColor: hexA(isUnread ? wp.accent : wp.textFaint, 0.14) }]}>
                  <Icon size={17} color={isUnread ? wp.accent : wp.textDim} strokeWidth={2.1} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: isUnread ? wp.text : wp.textDim }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {isUnread && <View style={styles.dot} />}
                  </View>
                  {item.body ? (
                    <Text style={styles.body} numberOfLines={2}>
                      {item.body}
                    </Text>
                  ) : null}
                  <Text style={styles.time}>{relativeTime(t, item.created_at)}</Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { color: wp.accent, fontSize: 11, letterSpacing: 1.5, fontFamily: fonts.monoBold, marginBottom: 6 },
  heading: { color: wp.text, fontSize: 24, fontFamily: fonts.sansBold, letterSpacing: -0.5 },
  markAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: hexA(wp.accent, 0.12),
    borderWidth: 1,
    borderColor: hexA(wp.accent, 0.25),
  },
  markAllText: { color: wp.accent, fontSize: 12, fontFamily: fonts.sansSemibold },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: hexA(wp.text, 0.025),
    marginBottom: 10,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14.5, fontFamily: fonts.sansSemibold },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: wp.accent },
  body: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, marginTop: 3, lineHeight: 18 },
  time: { color: wp.textFaint, fontSize: 11, fontFamily: fonts.mono, marginTop: 6 },
  empty: { alignItems: 'center', marginTop: 70, paddingHorizontal: 30 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: hexA(wp.textFaint, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: wp.text, fontSize: 16, fontFamily: fonts.sansSemibold },
  emptySub: { color: wp.textDim, fontSize: 13, fontFamily: fonts.sans, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
